-- Local stand-in for the TEST catalog objects crm_person_dup depends on.
-- Not a migration. Enough for 20261110040000_crm_person_dup_index.sql and
-- crm_dup_scale_test.sql. No RLS, no picklist triggers, no row guard.
-- Run as a superuser on an empty database.

do $$ begin
  create role anon nologin;
exception when duplicate_object then null;
end $$;
do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null;
end $$;

create schema if not exists private;

create table if not exists public.profiles (
  id uuid primary key,
  first_name text not null default '',
  last_name text not null default '',
  status text not null default 'active',
  role text not null default 'Outside user'
);

create table if not exists public.crm_dup_rules (
  key text primary key,
  enabled boolean not null
);

create table if not exists public.crm_leads (
  id uuid primary key default gen_random_uuid(),
  first_name text not null default '',
  last_name text not null default '',
  email text not null default '',
  phone text not null default '',
  owner_id uuid references public.profiles (id),
  converted_at timestamptz,
  archived_at timestamptz,
  status text not null default 'Prospecting',
  role_in_company text not null default '',
  crm_state text not null default '',
  notes text not null default ''
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id),
  first_name text not null default '',
  last_name text not null default '',
  email text not null default '',
  phone text not null default '',
  crm_owner_id uuid references public.profiles (id),
  crm_lead_id uuid,
  crm_archived_at timestamptz
);

create or replace function private.crm_name(p uuid) returns text
language sql stable security definer
set search_path to 'pg_catalog', 'public', 'extensions' as $$
  select btrim(first_name || ' ' || last_name) || case when status = 'removed' then ' (removed)' else '' end
  from public.profiles where id = p $$;

create or replace function private.crm_in_pool(p_contact uuid) returns boolean
language sql stable security definer
set search_path to 'pg_catalog', 'public', 'extensions' as $$
  select exists (select 1 from public.contacts c where c.id = p_contact)
    and not exists (select 1 from public.contacts c join public.profiles p on p.id = c.profile_id
                    where c.id = p_contact and p.role <> 'Outside user' and p.status <> 'removed') $$;

create or replace function private.crm_person_dup()
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

drop trigger if exists crm_leads_person_dup on public.crm_leads;
create trigger crm_leads_person_dup before insert or update of email, phone on public.crm_leads
  for each row execute function private.crm_person_dup();

drop trigger if exists contacts_person_dup on public.contacts;
create trigger contacts_person_dup before insert or update of email, phone on public.contacts
  for each row execute function private.crm_person_dup();

create unique index if not exists crm_leads_open_email_uq on public.crm_leads (lower(email))
  where email <> '' and converted_at is null and archived_at is null;
create unique index if not exists contacts_email_uq on public.contacts (lower(email))
  where email <> '';

insert into public.crm_dup_rules (key, enabled) values ('phone', true), ('email', true)
on conflict (key) do nothing;

do $$
begin
  if (select md5(prosrc) from pg_proc where oid = to_regprocedure('private.crm_person_dup()'))
     is distinct from 'b590bd6b5cae11bcce28b6662cf0c794' then
    raise exception 'fixture crm_person_dup() does not match TEST';
  end if;
end $$;
