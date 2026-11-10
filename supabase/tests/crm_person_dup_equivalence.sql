-- Proves private.crm_person_dup() flags the same rows before and after the indexed rewrite.
-- Not a migration. One transaction, ended by ROLLBACK. Run with psql on an empty database.
-- The old body is the TEST function (md5 b590bd6b5cae11bcce28b6662cf0c794). The new body is the
-- migration body (md5 ea36530b44b56d404545bf3f60239055). A stored email with surrounding spaces
-- is not a duplicate of the trimmed address: that is today's comparison, and contacts do not
-- reject those spaces. Name is not a key. pg_trgm is not used.

\set ON_ERROR_STOP on
begin;

do $$ begin
  create role anon nologin;
exception when duplicate_object then null;
end $$;
do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null;
end $$;

create schema if not exists private;

create table public.profiles (
  id uuid primary key,
  first_name text not null default '',
  last_name text not null default '',
  status text not null default 'active',
  role text not null default 'Outside user'
);
create table public.crm_dup_rules (
  key text primary key,
  enabled boolean not null
);
create table public.crm_leads (
  id uuid primary key default gen_random_uuid(),
  first_name text not null default '',
  last_name text not null default '',
  email text not null default '',
  phone text not null default '',
  owner_id uuid,
  converted_at timestamptz,
  archived_at timestamptz,
  status text not null default 'Prospecting',
  role_in_company text not null default '',
  crm_state text not null default '',
  notes text not null default ''
);
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid,
  first_name text not null default '',
  last_name text not null default '',
  email text not null default '',
  phone text not null default '',
  crm_owner_id uuid,
  crm_lead_id uuid,
  crm_archived_at timestamptz
);

create function private.crm_name(p uuid) returns text
language sql stable security definer
set search_path to 'pg_catalog', 'public', 'extensions' as $$
  select btrim(first_name || ' ' || last_name) || case when status = 'removed' then ' (removed)' else '' end
  from public.profiles where id = p $$;

create function private.crm_in_pool(p_contact uuid) returns boolean
language sql stable security definer
set search_path to 'pg_catalog', 'public', 'extensions' as $$
  select exists (select 1 from public.contacts c where c.id = p_contact)
    and not exists (select 1 from public.contacts c join public.profiles p on p.id = c.profile_id
                    where c.id = p_contact and p.role <> 'Outside user' and p.status <> 'removed') $$;

create function private.crm_person_dup()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
declare j jsonb := to_jsonb(new); em text := lower(btrim(coalesce(new.email, ''))); ph text := regexp_replace(coalesce(new.phone, ''), '\D', '', 'g'); hit record;
  my_lead uuid := case when tg_table_name = 'crm_leads' then new.id end; my_contact uuid := case when tg_table_name = 'contacts' then new.id end;
  from_lead uuid := case when tg_table_name = 'contacts' then (j ->> 'crm_lead_id')::uuid end;
begin
  if tg_table_name = 'contacts' then
    if coalesce(current_setting('crm.person_write', true), '') <> '1' then return new; end if;   -- only the CRM's client functions are checked (portal order parties are not CRM writes)
    if j ->> 'profile_id' is not null and exists (select 1 from public.profiles p where p.id = (j ->> 'profile_id')::uuid and p.role <> 'Outside user') then return new; end if;   -- CLA staff are not CRM people
  elsif j ->> 'converted_at' is not null or j ->> 'archived_at' is not null then return new; end if;
  if tg_op = 'UPDATE' then
    if lower(btrim(coalesce(old.email, ''))) = em then em := ''; end if;
    if regexp_replace(coalesce(old.phone, ''), '\D', '', 'g') = ph then ph := ''; end if; end if;
  if char_length(ph) < 7 or not coalesce((select enabled from public.crm_dup_rules where key = 'phone'), true) then ph := ''; end if;
  if em = '' and ph = '' then return new; end if;
  select 'Lead' as kind, l.first_name, l.last_name, l.owner_id as owner, (em <> '' and lower(l.email) = em) as by_email into hit from public.crm_leads l
    where l.id is distinct from my_lead and l.id is distinct from from_lead and l.converted_at is null and l.archived_at is null
      and ((em <> '' and lower(l.email) = em) or (ph <> '' and regexp_replace(l.phone, '\D', '', 'g') = ph)) limit 1;
  if hit.kind is null then
    select 'Client' as kind, c.first_name, c.last_name, c.crm_owner_id as owner, (em <> '' and lower(c.email) = em) as by_email into hit from public.contacts c
      where c.id is distinct from my_contact and c.crm_archived_at is null and private.crm_in_pool(c.id)
        and ((em <> '' and lower(c.email) = em) or (ph <> '' and regexp_replace(c.phone, '\D', '', 'g') = ph))
        and not (tg_table_name = 'crm_leads' and tg_op = 'UPDATE' and c.crm_lead_id = new.id) limit 1; end if;
  if hit.kind is not null then
    raise exception 'This % is already used by % % (owner %). Duplicates are not allowed.', case when hit.by_email then 'email' else 'phone number' end,
      hit.kind, btrim(hit.first_name || ' ' || hit.last_name), coalesce(private.crm_name(hit.owner), 'none') using errcode = '23505'; end if;
  return new; end $function$;

revoke all on function private.crm_person_dup() from public;
grant execute on function private.crm_person_dup() to authenticated;

create trigger crm_leads_person_dup before insert or update of email, phone on public.crm_leads
  for each row execute function private.crm_person_dup();
create trigger contacts_person_dup before insert or update of email, phone on public.contacts
  for each row execute function private.crm_person_dup();

create unique index crm_leads_open_email_uq on public.crm_leads (lower(email))
  where email <> '' and converted_at is null and archived_at is null;
create unique index contacts_email_uq on public.contacts (lower(email))
  where email <> '';
-- Created before any rows. An index built later in this transaction cannot be used until commit.
create index crm_leads_dup_phone_idx on public.crm_leads (regexp_replace(phone, '\D', '', 'g'))
  where converted_at is null and archived_at is null
    and char_length(regexp_replace(phone, '\D', '', 'g')) >= 7;
create index contacts_dup_phone_idx on public.contacts (regexp_replace(phone, '\D', '', 'g'))
  where crm_archived_at is null
    and char_length(regexp_replace(phone, '\D', '', 'g')) >= 7;

insert into public.profiles (id, first_name, last_name, status, role) values
  ('11111111-1111-4111-8111-111111111111', 'Sam', 'Sales', 'active', 'Sales Person'),
  ('22222222-2222-4222-8222-222222222222', 'Pat', 'Processor', 'active', 'Processor'),
  ('33333333-3333-4333-8333-333333333333', 'Blair', 'Outside', 'active', 'Outside user'),
  ('44444444-4444-4444-8444-444444444444', 'Rem', 'Removed', 'removed', 'Processor');

insert into public.crm_dup_rules (key, enabled) values ('phone', true), ('email', true);

insert into public.crm_leads (id, first_name, last_name, email, phone, owner_id, status, role_in_company, crm_state, archived_at, converted_at) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Ada', 'Email', 'ada@example.test', '301-555-0101', '11111111-1111-4111-8111-111111111111', 'Prospecting', 'Realtor', 'MD', null, null),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'Bob', 'Phone', 'bob@example.test', '(301) 555-0102', '11111111-1111-4111-8111-111111111111', 'Prospecting', 'Realtor', 'MD', null, null),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'Cam', 'Archived', 'cam@example.test', '301-555-0103', '11111111-1111-4111-8111-111111111111', 'Prospecting', 'Realtor', 'MD', now(), null),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', 'Dee', 'Converted', 'dee@example.test', '301.555.0104', '11111111-1111-4111-8111-111111111111', 'Prospecting', 'Realtor', 'MD', null, now()),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5', 'Eve', 'Short', 'eve@example.test', '123456', '11111111-1111-4111-8111-111111111111', 'Prospecting', 'Realtor', 'MD', null, null),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6', 'Fay', 'Padded', ' fay@example.test', '301-555-0106', '11111111-1111-4111-8111-111111111111', 'Prospecting', 'Realtor', 'MD', null, null),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7', 'Gus', 'Both', 'gus@example.test', '301-555-0107', '11111111-1111-4111-8111-111111111111', 'Prospecting', 'Realtor', 'MD', null, null),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8', 'Nan', 'None', 'none@example.test', '301-555-0110', null, 'Prospecting', 'Realtor', 'MD', null, null),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9', 'Sev', 'Seven', 'seven@example.test', '123-4567', '11111111-1111-4111-8111-111111111111', 'Prospecting', 'Realtor', 'MD', null, null);

insert into public.contacts (id, profile_id, first_name, last_name, email, phone, crm_owner_id, crm_lead_id, crm_archived_at) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', null, 'Ivy', 'Client', 'ivy@example.test', '301-555-0201', '11111111-1111-4111-8111-111111111111', null, null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', null, 'Jack', 'Archived', 'jack@example.test', '301-555-0202', '11111111-1111-4111-8111-111111111111', null, now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', '22222222-2222-4222-8222-222222222222', 'Stu', 'Staff', 'staff@example.test', '301-555-0203', '11111111-1111-4111-8111-111111111111', null, null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4', '33333333-3333-4333-8333-333333333333', 'Ollie', 'Outside', 'out@example.test', '301-555-0204', '11111111-1111-4111-8111-111111111111', null, null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5', '44444444-4444-4444-8444-444444444444', 'Rem', 'Removed', 'rem@example.test', '301-555-0205', '11111111-1111-4111-8111-111111111111', null, null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb6', null, 'Kim', 'Padded', '  kim@example.test', '301-555-0206', '11111111-1111-4111-8111-111111111111', null, null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb7', null, 'Lin', 'Linked', 'ada-linked@example.test', '301-555-0307', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', null);

create temp table dup_script (
  ord int primary key,
  case_id text not null unique,
  do_write boolean not null,
  expect_flag boolean not null,
  expect_message text,
  sql text not null
);
create temp table dup_observed (
  pass text not null,
  case_id text not null,
  flagged boolean not null,
  sqlstate text,
  message text,
  primary key (pass, case_id)
);
insert into dup_script (ord, case_id, do_write, expect_flag, expect_message, sql) values
  (1, 'unique_ok', false, false, null, $unique_ok$insert into public.crm_leads (first_name, last_name, email, phone, status, role_in_company, crm_state, notes) values ('New', 'Person', 'fresh-1@example.test', '301-555-0191', 'Prospecting', 'Realtor', 'MD', 'case')$unique_ok$),
  (2, 'same_name_ok', false, false, null, $same_name_ok$insert into public.crm_leads (first_name, last_name, email, phone, status, role_in_company, crm_state, notes) values ('Ada', 'Email', 'ada-other@example.test', '301-555-0199', 'Prospecting', 'Realtor', 'MD', 'case')$same_name_ok$),
  (3, 'email_case', false, true, 'This email is already used by Lead Ada Email (owner Sam Sales). Duplicates are not allowed.', $email_case$insert into public.crm_leads (first_name, last_name, email, phone, status, role_in_company, crm_state, notes) values ('New', 'Person', 'ADA@example.test', '301-555-0192', 'Prospecting', 'Realtor', 'MD', 'case')$email_case$),
  (4, 'email_incoming_spaces', false, true, 'This email is already used by Lead Ada Email (owner Sam Sales). Duplicates are not allowed.', $email_incoming_spaces$insert into public.crm_leads (first_name, last_name, email, phone, status, role_in_company, crm_state, notes) values ('New', 'Person', '  ADA@example.test  ', '301-555-0193', 'Prospecting', 'Realtor', 'MD', 'case')$email_incoming_spaces$),
  (5, 'phone_format', false, true, 'This phone number is already used by Lead Bob Phone (owner Sam Sales). Duplicates are not allowed.', $phone_format$insert into public.crm_leads (first_name, last_name, email, phone, status, role_in_company, crm_state, notes) values ('New', 'Person', 'fresh-2@example.test', '(301) 555-0102', 'Prospecting', 'Realtor', 'MD', 'case')$phone_format$),
  (6, 'short_phone_ok', false, false, null, $short_phone_ok$insert into public.crm_leads (first_name, last_name, email, phone, status, role_in_company, crm_state, notes) values ('New', 'Person', 'fresh-3@example.test', '123456', 'Prospecting', 'Realtor', 'MD', 'case')$short_phone_ok$),
  (7, 'blank_ok', false, false, null, $blank_ok$insert into public.crm_leads (first_name, last_name, email, phone, status, role_in_company, crm_state, notes) values ('New', 'Person', '', '', 'Prospecting', 'Realtor', 'MD', 'case')$blank_ok$),
  (8, 'archived_lead_email_ok', false, false, null, $archived_lead_email_ok$insert into public.crm_leads (first_name, last_name, email, phone, status, role_in_company, crm_state, notes) values ('New', 'Person', 'cam@example.test', '301-555-0194', 'Prospecting', 'Realtor', 'MD', 'case')$archived_lead_email_ok$),
  (9, 'converted_lead_email_ok', false, false, null, $converted_lead_email_ok$insert into public.crm_leads (first_name, last_name, email, phone, status, role_in_company, crm_state, notes) values ('New', 'Person', 'dee@example.test', '301-555-0195', 'Prospecting', 'Realtor', 'MD', 'case')$converted_lead_email_ok$),
  (10, 'archived_lead_phone_ok', false, false, null, $archived_lead_phone_ok$insert into public.crm_leads (first_name, last_name, email, phone, status, role_in_company, crm_state, notes) values ('New', 'Person', 'fresh-4@example.test', '301-555-0103', 'Prospecting', 'Realtor', 'MD', 'case')$archived_lead_phone_ok$),
  (11, 'converted_lead_phone_ok', false, false, null, $converted_lead_phone_ok$insert into public.crm_leads (first_name, last_name, email, phone, status, role_in_company, crm_state, notes) values ('New', 'Person', 'fresh-5@example.test', '301.555.0104', 'Prospecting', 'Realtor', 'MD', 'case')$converted_lead_phone_ok$),
  (12, 'client_email', false, true, 'This email is already used by Client Ivy Client (owner Sam Sales). Duplicates are not allowed.', $client_email$insert into public.crm_leads (first_name, last_name, email, phone, status, role_in_company, crm_state, notes) values ('New', 'Person', 'ivy@example.test', '301-555-0196', 'Prospecting', 'Realtor', 'MD', 'case')$client_email$),
  (13, 'client_phone', false, true, 'This phone number is already used by Client Ivy Client (owner Sam Sales). Duplicates are not allowed.', $client_phone$insert into public.crm_leads (first_name, last_name, email, phone, status, role_in_company, crm_state, notes) values ('New', 'Person', 'fresh-6@example.test', '301-555-0201', 'Prospecting', 'Realtor', 'MD', 'case')$client_phone$),
  (14, 'archived_client_email_ok', false, false, null, $archived_client_email_ok$insert into public.crm_leads (first_name, last_name, email, phone, status, role_in_company, crm_state, notes) values ('New', 'Person', 'jack@example.test', '301-555-0197', 'Prospecting', 'Realtor', 'MD', 'case')$archived_client_email_ok$),
  (15, 'staff_client_email_ok', false, false, null, $staff_client_email_ok$insert into public.crm_leads (first_name, last_name, email, phone, status, role_in_company, crm_state, notes) values ('New', 'Person', 'staff@example.test', '301-555-0188', 'Prospecting', 'Realtor', 'MD', 'case')$staff_client_email_ok$),
  (16, 'outside_client_email', false, true, 'This email is already used by Client Ollie Outside (owner Sam Sales). Duplicates are not allowed.', $outside_client_email$insert into public.crm_leads (first_name, last_name, email, phone, status, role_in_company, crm_state, notes) values ('New', 'Person', 'out@example.test', '301-555-0187', 'Prospecting', 'Realtor', 'MD', 'case')$outside_client_email$),
  (17, 'removed_staff_client_email', false, true, 'This email is already used by Client Rem Removed (owner Sam Sales). Duplicates are not allowed.', $removed_staff_client_email$insert into public.crm_leads (first_name, last_name, email, phone, status, role_in_company, crm_state, notes) values ('New', 'Person', 'rem@example.test', '301-555-0186', 'Prospecting', 'Realtor', 'MD', 'case')$removed_staff_client_email$),
  (18, 'padded_lead_email_ok', false, false, null, $padded_lead_email_ok$insert into public.crm_leads (first_name, last_name, email, phone, status, role_in_company, crm_state, notes) values ('New', 'Person', 'fay@example.test', '301-555-0185', 'Prospecting', 'Realtor', 'MD', 'case')$padded_lead_email_ok$),
  (19, 'padded_client_email_ok', false, false, null, $padded_client_email_ok$insert into public.crm_leads (first_name, last_name, email, phone, status, role_in_company, crm_state, notes) values ('New', 'Person', 'kim@example.test', '301-555-0184', 'Prospecting', 'Realtor', 'MD', 'case')$padded_client_email_ok$),
  (20, 'same_row_email_and_phone', false, true, 'This email is already used by Lead Gus Both (owner Sam Sales). Duplicates are not allowed.', $same_row_email_and_phone$insert into public.crm_leads (first_name, last_name, email, phone, status, role_in_company, crm_state, notes) values ('New', 'Person', 'gus@example.test', '301-555-0107', 'Prospecting', 'Realtor', 'MD', 'case')$same_row_email_and_phone$),
  (21, 'email_and_other_phone', false, true, null, $email_and_other_phone$insert into public.crm_leads (first_name, last_name, email, phone, status, role_in_company, crm_state, notes) values ('New', 'Person', 'gus@example.test', '(301) 555-0102', 'Prospecting', 'Realtor', 'MD', 'case')$email_and_other_phone$),
  (22, 'lead_phone_and_client_email', false, true, 'This phone number is already used by Lead Bob Phone (owner Sam Sales). Duplicates are not allowed.', $lead_phone_and_client_email$insert into public.crm_leads (first_name, last_name, email, phone, status, role_in_company, crm_state, notes) values ('New', 'Person', 'ivy@example.test', '(301) 555-0102', 'Prospecting', 'Realtor', 'MD', 'case')$lead_phone_and_client_email$),
  (23, 'update_email', false, true, 'This email is already used by Lead Bob Phone (owner Sam Sales). Duplicates are not allowed.', $update_email$update public.crm_leads set email = 'bob@example.test', phone = '301-555-0101' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'$update_email$),
  (24, 'update_phone', false, true, 'This phone number is already used by Lead Bob Phone (owner Sam Sales). Duplicates are not allowed.', $update_phone$update public.crm_leads set email = 'ada@example.test', phone = '(301) 555-0102' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'$update_phone$),
  (25, 'update_email_case_space_ok', false, false, null, $update_email_case_space_ok$update public.crm_leads set email = '  ADA@example.test ', phone = '301-555-0101' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'$update_email_case_space_ok$),
  (26, 'update_phone_format_ok', false, false, null, $update_phone_format_ok$update public.crm_leads set email = 'ada@example.test', phone = '301.555.0101' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'$update_phone_format_ok$),
  (27, 'update_email_new_phone_same_ok', false, false, null, $update_email_new_phone_same_ok$update public.crm_leads set email = 'ada-new@example.test', phone = '301-555-0101' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'$update_email_new_phone_same_ok$),
  (28, 'update_self_ok', false, false, null, $update_self_ok$update public.crm_leads set email = 'ada@example.test', phone = '301-555-0101' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'$update_self_ok$),
  (29, 'insert_already_converted_ok', false, false, null, $insert_already_converted_ok$insert into public.crm_leads (first_name, last_name, email, phone, status, role_in_company, crm_state, notes, converted_at) values ('New', 'Person', 'ada@example.test', '301-555-0171', 'Prospecting', 'Realtor', 'MD', 'case', now())$insert_already_converted_ok$),
  (30, 'insert_already_archived_ok', false, false, null, $insert_already_archived_ok$insert into public.crm_leads (first_name, last_name, email, phone, status, role_in_company, crm_state, notes, archived_at) values ('New', 'Person', 'ada@example.test', '301-555-0172', 'Prospecting', 'Realtor', 'MD', 'case', now())$insert_already_archived_ok$),
  (31, 'update_converted_skips_ok', false, false, null, $update_converted_skips_ok$update public.crm_leads set email = 'ada@example.test', phone = '301.555.0104' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4'$update_converted_skips_ok$),
  (32, 'contact_dup_with_write', true, true, 'This email is already used by Lead Ada Email (owner Sam Sales). Duplicates are not allowed.', $contact_dup_with_write$insert into public.contacts (first_name, last_name, email, phone) values ('New', 'Client', 'ada@example.test', '301-555-0173')$contact_dup_with_write$),
  (33, 'contact_dup_without_write_ok', false, false, null, $contact_dup_without_write_ok$insert into public.contacts (first_name, last_name, email, phone) values ('New', 'Client', 'ada@example.test', '301-555-0174')$contact_dup_without_write_ok$),
  (34, 'contact_from_own_lead_ok', true, false, null, $contact_from_own_lead_ok$insert into public.contacts (first_name, last_name, email, phone, crm_lead_id) values ('New', 'Client', 'ada@example.test', '301-555-0175', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1')$contact_from_own_lead_ok$),
  (35, 'contact_phone_with_write', true, true, 'This phone number is already used by Lead Bob Phone (owner Sam Sales). Duplicates are not allowed.', $contact_phone_with_write$insert into public.contacts (first_name, last_name, email, phone) values ('New', 'Client', 'fresh-7@example.test', '(301) 555-0102')$contact_phone_with_write$),
  (36, 'contact_staff_skip_ok', true, false, null, $contact_staff_skip_ok$insert into public.contacts (first_name, last_name, email, phone, profile_id) values ('New', 'Staff', 'ada@example.test', '301-555-0176', '22222222-2222-4222-8222-222222222222')$contact_staff_skip_ok$),
  (37, 'contact_update_with_write', true, true, 'This email is already used by Lead Ada Email (owner Sam Sales). Duplicates are not allowed.', $contact_update_with_write$update public.contacts set email = 'ada@example.test', phone = '301-555-0201' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'$contact_update_with_write$),
  (38, 'contact_update_without_write_ok', false, false, null, $contact_update_without_write_ok$update public.contacts set email = 'ada@example.test', phone = '301-555-0201' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'$contact_update_without_write_ok$),
  (39, 'lead_update_skips_linked_client_ok', false, false, null, $lead_update_skips_linked_client_ok$update public.crm_leads set email = 'ada-linked@example.test', phone = '301-555-0101' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'$lead_update_skips_linked_client_ok$),
  (40, 'lead_insert_linked_client_email', false, true, 'This email is already used by Client Lin Linked (owner Sam Sales). Duplicates are not allowed.', $lead_insert_linked_client_email$insert into public.crm_leads (first_name, last_name, email, phone, status, role_in_company, crm_state, notes) values ('New', 'Person', 'ada-linked@example.test', '301-555-0177', 'Prospecting', 'Realtor', 'MD', 'case')$lead_insert_linked_client_email$),
  (41, 'phone_rule_off_phone_ok', false, false, null, $phone_rule_off_phone_ok$update public.crm_dup_rules set enabled = false where key = 'phone'; insert into public.crm_leads (first_name, last_name, email, phone, status, role_in_company, crm_state, notes) values ('New', 'Person', 'fresh-8@example.test', '(301) 555-0102', 'Prospecting', 'Realtor', 'MD', 'case')$phone_rule_off_phone_ok$),
  (42, 'phone_rule_off_email', false, true, 'This email is already used by Lead Ada Email (owner Sam Sales). Duplicates are not allowed.', $phone_rule_off_email$update public.crm_dup_rules set enabled = false where key = 'phone'; insert into public.crm_leads (first_name, last_name, email, phone, status, role_in_company, crm_state, notes) values ('New', 'Person', 'ada@example.test', '301-555-0178', 'Prospecting', 'Realtor', 'MD', 'case')$phone_rule_off_email$),
  (43, 'phone_rule_missing_defaults_on', false, true, 'This phone number is already used by Lead Bob Phone (owner Sam Sales). Duplicates are not allowed.', $phone_rule_missing_defaults_on$delete from public.crm_dup_rules where key = 'phone'; insert into public.crm_leads (first_name, last_name, email, phone, status, role_in_company, crm_state, notes) values ('New', 'Person', 'fresh-9@example.test', '(301) 555-0102', 'Prospecting', 'Realtor', 'MD', 'case')$phone_rule_missing_defaults_on$),
  (44, 'seven_digit_phone', false, true, 'This phone number is already used by Lead Sev Seven (owner Sam Sales). Duplicates are not allowed.', $seven_digit_phone$insert into public.crm_leads (first_name, last_name, email, phone, status, role_in_company, crm_state, notes) values ('New', 'Person', 'fresh-10@example.test', '123-4567', 'Prospecting', 'Realtor', 'MD', 'case')$seven_digit_phone$),
  (45, 'owner_none', false, true, 'This email is already used by Lead Nan None (owner none). Duplicates are not allowed.', $owner_none$insert into public.crm_leads (first_name, last_name, email, phone, status, role_in_company, crm_state, notes) values ('New', 'Person', 'none@example.test', '301-555-0179', 'Prospecting', 'Realtor', 'MD', 'case')$owner_none$),
  (46, 'client_archived_still_checked', true, true, 'This email is already used by Lead Ada Email (owner Sam Sales). Duplicates are not allowed.', $client_archived_still_checked$insert into public.contacts (first_name, last_name, email, phone, crm_archived_at) values ('New', 'Client', 'ada@example.test', '301-555-0180', now())$client_archived_still_checked$);

do $run$
declare
  r record;
  v_pass text;
  v_flag boolean;
  v_msg text;
  v_st text;
begin
  if (select md5(prosrc) from pg_proc where oid = to_regprocedure('private.crm_person_dup()'))
     is distinct from 'b590bd6b5cae11bcce28b6662cf0c794' then
    raise exception 'old crm_person_dup() is not the TEST body';
  end if;
  create temp table dup_leads_snap as select * from public.crm_leads;
  create temp table dup_contacts_snap as select * from public.contacts;
  create temp table dup_rules_snap as select * from public.crm_dup_rules;
  foreach v_pass in array array['before', 'after'] loop
    if v_pass = 'after' then
      create or replace function private.crm_person_dup()
       returns trigger language plpgsql security definer
       set search_path to 'pg_catalog', 'public', 'extensions'
      as $function$
declare
  j jsonb := to_jsonb(new);
  em text := lower(btrim(coalesce(new.email, '')));
  ph text := regexp_replace(coalesce(new.phone, ''), '\D', '', 'g');
  hit_kind text;
  hit_first text;
  hit_last text;
  hit_owner uuid;
  hit_email boolean;
  my_lead uuid := case when tg_table_name = 'crm_leads' then new.id end;
  my_contact uuid := case when tg_table_name = 'contacts' then new.id end;
  from_lead uuid := case when tg_table_name = 'contacts' then (j ->> 'crm_lead_id')::uuid end;
begin
  if tg_table_name = 'contacts' then
    if coalesce(current_setting('crm.person_write', true), '') <> '1' then return new; end if;   -- only the CRM's client functions are checked (portal order parties are not CRM writes)
    if j ->> 'profile_id' is not null and exists (select 1 from public.profiles p where p.id = (j ->> 'profile_id')::uuid and p.role <> 'Outside user') then return new; end if;   -- CLA staff are not CRM people
  elsif j ->> 'converted_at' is not null or j ->> 'archived_at' is not null then return new; end if;
  if tg_op = 'UPDATE' then
    if lower(btrim(coalesce(old.email, ''))) = em then em := ''; end if;
    if regexp_replace(coalesce(old.phone, ''), '\D', '', 'g') = ph then ph := ''; end if;
  end if;
  if char_length(ph) < 7 or not coalesce((select enabled from public.crm_dup_rules where key = 'phone'), true) then ph := ''; end if;
  if em = '' and ph = '' then return new; end if;

  -- Separate equality probes so each one can use an expression index.
  -- Email probe is lower(btrim(incoming)) against lower(stored). Stored emails are not trimmed:
  -- a stored value with surrounding spaces is not a match. That is the rule this trigger already had.
  -- Phone probe is digits only, and only when the incoming number has at least 7 digits and the phone rule is on.
  -- Leads are searched before clients. Inside each table an email match is reported before a phone match.
  if em <> '' then
    select 'Lead', l.first_name, l.last_name, l.owner_id, true
      into hit_kind, hit_first, hit_last, hit_owner, hit_email
      from public.crm_leads l
     where l.converted_at is null
       and l.archived_at is null
       and l.email <> ''
       and lower(l.email) = em
       and l.id is distinct from my_lead
       and l.id is distinct from from_lead
     limit 1;
  end if;
  if hit_kind is null and ph <> '' then
    select 'Lead', l.first_name, l.last_name, l.owner_id, false
      into hit_kind, hit_first, hit_last, hit_owner, hit_email
      from public.crm_leads l
     where l.converted_at is null
       and l.archived_at is null
       and char_length(regexp_replace(l.phone, '\D', '', 'g')) >= 7
       and regexp_replace(l.phone, '\D', '', 'g') = ph
       and l.id is distinct from my_lead
       and l.id is distinct from from_lead
     limit 1;
  end if;
  if hit_kind is null and em <> '' then
    select 'Client', c.first_name, c.last_name, c.crm_owner_id, true
      into hit_kind, hit_first, hit_last, hit_owner, hit_email
      from public.contacts c
     where c.crm_archived_at is null
       and c.email <> ''
       and lower(c.email) = em
       and c.id is distinct from my_contact
       and private.crm_in_pool(c.id)
       and not (tg_table_name = 'crm_leads' and tg_op = 'UPDATE' and c.crm_lead_id = new.id)
     limit 1;
  end if;
  if hit_kind is null and ph <> '' then
    select 'Client', c.first_name, c.last_name, c.crm_owner_id, false
      into hit_kind, hit_first, hit_last, hit_owner, hit_email
      from public.contacts c
     where c.crm_archived_at is null
       and char_length(regexp_replace(c.phone, '\D', '', 'g')) >= 7
       and regexp_replace(c.phone, '\D', '', 'g') = ph
       and c.id is distinct from my_contact
       and private.crm_in_pool(c.id)
       and not (tg_table_name = 'crm_leads' and tg_op = 'UPDATE' and c.crm_lead_id = new.id)
     limit 1;
  end if;

  if hit_kind is not null then
    raise exception 'This % is already used by % % (owner %). Duplicates are not allowed.',
      case when hit_email then 'email' else 'phone number' end,
      hit_kind, btrim(hit_first || ' ' || hit_last), coalesce(private.crm_name(hit_owner), 'none')
      using errcode = '23505';
  end if;
  return new;
end
$function$;
      if (select md5(prosrc) from pg_proc where oid = to_regprocedure('private.crm_person_dup()'))
         is distinct from 'ea36530b44b56d404545bf3f60239055' then
        raise exception 'new crm_person_dup() does not match the migration body';
      end if;
    end if;
    for r in select * from dup_script order by ord loop
      v_flag := false; v_msg := null; v_st := null;
      perform set_config('crm.person_write', case when r.do_write then '1' else '' end, true);
      begin
        execute r.sql;
      exception when others then
        v_flag := true;
        get stacked diagnostics v_msg = message_text, v_st = returned_sqlstate;
      end;
      perform set_config('crm.person_write', '', true);
      insert into dup_observed (pass, case_id, flagged, sqlstate, message)
      values (v_pass, r.case_id, v_flag, v_st, v_msg);
      alter table public.crm_leads disable trigger crm_leads_person_dup;
      alter table public.contacts disable trigger contacts_person_dup;
      delete from public.contacts;
      delete from public.crm_leads;
      insert into public.crm_leads select * from dup_leads_snap;
      insert into public.contacts select * from dup_contacts_snap;
      delete from public.crm_dup_rules;
      insert into public.crm_dup_rules select * from dup_rules_snap;
      alter table public.crm_leads enable trigger crm_leads_person_dup;
      alter table public.contacts enable trigger contacts_person_dup;
    end loop;
  end loop;
end
$run$;

do $cmp$
declare
  n int;
  bad text;
begin
  select count(*) into n from dup_script;
  if (select count(*) from dup_observed where pass = 'before') <> n
     or (select count(*) from dup_observed where pass = 'after') <> n then
    raise exception 'a pass did not record every case';
  end if;
  select string_agg(format('%s before=%s/%s after=%s/%s expect=%s/%s', s.case_id,
           b.flagged, coalesce(b.message, ''), a.flagged, coalesce(a.message, ''),
           s.expect_flag, coalesce(s.expect_message, '')), E'\n' order by s.ord)
    into bad
  from dup_script s
  join dup_observed b on b.pass = 'before' and b.case_id = s.case_id
  join dup_observed a on a.pass = 'after' and a.case_id = s.case_id
  where b.flagged is distinct from a.flagged
     or b.flagged is distinct from s.expect_flag
     or (s.expect_message is not null and b.message is distinct from s.expect_message)
     or (s.expect_message is not null and a.message is distinct from s.expect_message)
     or (b.flagged and b.sqlstate is distinct from '23505')
     or (a.flagged and a.sqlstate is distinct from '23505');
  if bad is not null then
    raise exception 'duplicate results changed or did not match the old rule:%', E'\n' || bad;
  end if;
  raise notice 'crm_person_dup equivalence: % cases match before and after', n;
end
$cmp$;

do $plan$
declare rec record; buf text;
begin
  perform set_config('enable_seqscan', 'off', true);
  buf := '';
  for rec in
    explain select l.id from public.crm_leads l
     where l.converted_at is null and l.archived_at is null and l.email <> ''
       and lower(l.email) = 'ada@example.test' and l.id is distinct from null limit 1
  loop buf := buf || rec."QUERY PLAN" || E'\n'; end loop;
  if buf !~ 'crm_leads_open_email_uq' or buf ~* 'Seq Scan on (public\.)?crm_leads' then
    raise exception 'lead email plan:%', buf; end if;
  buf := '';
  for rec in
    explain select l.id from public.crm_leads l
     where l.converted_at is null and l.archived_at is null
       and char_length(regexp_replace(l.phone, '\D', '', 'g')) >= 7
       and regexp_replace(l.phone, '\D', '', 'g') = '3015550102' limit 1
  loop buf := buf || rec."QUERY PLAN" || E'\n'; end loop;
  if buf !~ 'crm_leads_dup_phone_idx' or buf ~* 'Seq Scan on (public\.)?crm_leads' or buf ~* 'trgm' then
    raise exception 'lead phone plan:%', buf; end if;
  buf := '';
  for rec in
    explain select c.id from public.contacts c
     where c.crm_archived_at is null and c.email <> '' and lower(c.email) = 'ivy@example.test'
       and private.crm_in_pool(c.id) limit 1
  loop buf := buf || rec."QUERY PLAN" || E'\n'; end loop;
  if buf !~ 'contacts_email_uq' or buf ~* 'Seq Scan on (public\.)?contacts' then
    raise exception 'client email plan:%', buf; end if;
  buf := '';
  for rec in
    explain select c.id from public.contacts c
     where c.crm_archived_at is null
       and char_length(regexp_replace(c.phone, '\D', '', 'g')) >= 7
       and regexp_replace(c.phone, '\D', '', 'g') = '3015550201'
       and private.crm_in_pool(c.id) limit 1
  loop buf := buf || rec."QUERY PLAN" || E'\n'; end loop;
  if buf !~ 'contacts_dup_phone_idx' or buf ~* 'Seq Scan on (public\.)?contacts' or buf ~* 'trgm' then
    raise exception 'client phone plan:%', buf; end if;
  raise notice 'crm_person_dup plans use the email and phone indexes';
end
$plan$;

rollback;
