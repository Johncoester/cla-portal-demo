-- Not applied by this commit.
-- Indexed duplicate check for CRM people. One transaction. lock_timeout 3s.
--
-- private.crm_person_dup() runs BEFORE INSERT OR UPDATE OF email, phone on
-- public.crm_leads (crm_leads_person_dup) and public.contacts (contacts_person_dup).
-- Those are the only two triggers. The old body ORs an email equality with
-- regexp_replace(phone, '\D', '', 'g'). The phone expression is not indexed, so
-- the OR is a sequential scan. On TEST that scan already adds about 0.4 s per
-- 500-row import chunk while the lead table is still tiny.
--
-- The new body asks the same question as four equality probes, in the same order
-- the old body used: open leads, then clients. Inside each table an email match
-- is reported before a phone match. A single matching row still produces the same
-- 23505 message. When one row matches the email and a different row matches the
-- phone, the old LIMIT 1 could name either; the new body names the email match.
-- The insert or update is still rejected.
--
-- What counts as a duplicate is unchanged:
--   * incoming email key: lower(btrim(email)). Stored emails are compared with
--     lower(email), not btrim. A stored address with surrounding spaces does not
--     match. Contacts have no email format check, so that difference is real.
--   * incoming phone key: digits only, and only when that key has at least 7
--     digits and crm_dup_rules.key = 'phone' is on (default on when the row is
--     missing). An unchanged email or phone on UPDATE is not searched again.
--   * open leads only (converted_at and archived_at are null). Clients must be
--     unarchived and private.crm_in_pool. A contact write is checked only when
--     crm.person_write = '1', and a CLA staff profile is not a CRM person.
--   * a client insert does not collide with the lead it came from (crm_lead_id).
--     A lead update does not collide with the client that points back at that lead.
-- Name matching is not part of this rule, so there is no name index and pg_trgm
-- is not installed.
--
-- Email probes use the expression indexes already on TEST:
--   crm_leads_open_email_uq  btree (lower(email)) WHERE email <> '' AND converted_at IS NULL AND archived_at IS NULL
--   contacts_email_uq        btree (lower(email)) WHERE email <> ''
-- A second email index would be maintained on every imported row and would not
-- change the plan. This migration adds the missing phone indexes only.
--
-- Drift: refuses unless md5(prosrc) of private.crm_person_dup() is still
-- b590bd6b5cae11bcce28b6662cf0c794, the two triggers and the two email indexes
-- are unchanged, and the phone indexes are absent. CREATE OR REPLACE keeps the
-- existing owner and grants (authenticated may execute; public and anon may not).
-- Rollback: supabase/rollbacks/20261110040000_crm_person_dup_index.sql

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

do $pre$
declare
  email_leads text;
  email_contacts text;
begin
  if (select md5(prosrc) from pg_proc where oid = to_regprocedure('private.crm_person_dup()'))
     is distinct from 'b590bd6b5cae11bcce28b6662cf0c794' then
    raise exception 'drift: private.crm_person_dup() changed or is missing';
  end if;
  if to_regprocedure('private.crm_in_pool(uuid)') is null then
    raise exception 'drift: private.crm_in_pool(uuid) is missing';
  end if;
  if to_regprocedure('private.crm_name(uuid)') is null then
    raise exception 'drift: private.crm_name(uuid) is missing';
  end if;
  if not exists (select 1 from pg_trigger
                 where tgname = 'crm_leads_person_dup' and tgrelid = 'public.crm_leads'::regclass and not tgisinternal
                   and pg_get_triggerdef(oid) = 'CREATE TRIGGER crm_leads_person_dup BEFORE INSERT OR UPDATE OF email, phone ON public.crm_leads FOR EACH ROW EXECUTE FUNCTION private.crm_person_dup()') then
    raise exception 'drift: crm_leads_person_dup changed or is missing';
  end if;
  if not exists (select 1 from pg_trigger
                 where tgname = 'contacts_person_dup' and tgrelid = 'public.contacts'::regclass and not tgisinternal
                   and pg_get_triggerdef(oid) = 'CREATE TRIGGER contacts_person_dup BEFORE INSERT OR UPDATE OF email, phone ON public.contacts FOR EACH ROW EXECUTE FUNCTION private.crm_person_dup()') then
    raise exception 'drift: contacts_person_dup changed or is missing';
  end if;
  email_leads := pg_get_indexdef('public.crm_leads_open_email_uq'::regclass);
  email_contacts := pg_get_indexdef('public.contacts_email_uq'::regclass);
  if email_leads is distinct from 'CREATE UNIQUE INDEX crm_leads_open_email_uq ON public.crm_leads USING btree (lower(email)) WHERE ((email <> ''''::text) AND (converted_at IS NULL) AND (archived_at IS NULL))' then
    raise exception 'drift: crm_leads_open_email_uq is %', email_leads;
  end if;
  if email_contacts is distinct from 'CREATE UNIQUE INDEX contacts_email_uq ON public.contacts USING btree (lower(email)) WHERE (email <> ''''::text)' then
    raise exception 'drift: contacts_email_uq is %', email_contacts;
  end if;
  if to_regclass('public.crm_leads_dup_phone_idx') is not null or to_regclass('public.contacts_dup_phone_idx') is not null then
    raise exception 'drift: phone duplicate index already exists';
  end if;
  if has_function_privilege('public', 'private.crm_person_dup()', 'execute')
     or has_function_privilege('anon', 'private.crm_person_dup()', 'execute')
     or not has_function_privilege('authenticated', 'private.crm_person_dup()', 'execute') then
    raise exception 'drift: crm_person_dup grants are not authenticated-only';
  end if;
end
$pre$;

create index crm_leads_dup_phone_idx on public.crm_leads (regexp_replace(phone, '\D', '', 'g'))
  where converted_at is null
    and archived_at is null
    and char_length(regexp_replace(phone, '\D', '', 'g')) >= 7;

create index contacts_dup_phone_idx on public.contacts (regexp_replace(phone, '\D', '', 'g'))
  where crm_archived_at is null
    and char_length(regexp_replace(phone, '\D', '', 'g')) >= 7;

comment on index public.crm_leads_dup_phone_idx is
  'crm_person_dup phone probe: digits only, open leads, at least 7 digits.';
comment on index public.contacts_dup_phone_idx is
  'crm_person_dup phone probe: digits only, clients that are not archived, at least 7 digits.';

create or replace function private.crm_person_dup()
 returns trigger
 language plpgsql
 security definer
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

do $post$
declare
  phone_leads text := pg_get_indexdef('public.crm_leads_dup_phone_idx'::regclass);
  phone_contacts text := pg_get_indexdef('public.contacts_dup_phone_idx'::regclass);
  cfg text[];
begin
  if (select md5(prosrc) from pg_proc where oid = to_regprocedure('private.crm_person_dup()'))
     is distinct from 'ea36530b44b56d404545bf3f60239055' then
    raise exception 'drift: rewritten crm_person_dup() source hash is not ea36530b44b56d404545bf3f60239055';
  end if;
  if not (select prosecdef from pg_proc where oid = to_regprocedure('private.crm_person_dup()')) then
    raise exception 'drift: crm_person_dup() lost security definer';
  end if;
  select proconfig into cfg from pg_proc where oid = to_regprocedure('private.crm_person_dup()');
  if cfg is distinct from array['search_path=pg_catalog, public, extensions']::text[] then
    raise exception 'drift: crm_person_dup() search_path is %', cfg;
  end if;
  if has_function_privilege('public', 'private.crm_person_dup()', 'execute')
     or has_function_privilege('anon', 'private.crm_person_dup()', 'execute')
     or not has_function_privilege('authenticated', 'private.crm_person_dup()', 'execute') then
    raise exception 'drift: crm_person_dup grants changed';
  end if;
  if phone_leads not like 'CREATE INDEX crm_leads_dup_phone_idx ON public.crm_leads USING btree (regexp_replace(phone, %'
     or phone_leads not like '%converted_at IS NULL%'
     or phone_leads not like '%archived_at IS NULL%'
     or phone_leads not like '%char_length(regexp_replace(phone, %>= 7))'
     or phone_leads ilike '%gin%' or phone_leads ilike '%gist%' or phone_leads ilike '%trgm%' then
    raise exception 'drift: crm_leads_dup_phone_idx is %', phone_leads;
  end if;
  if phone_contacts not like 'CREATE INDEX contacts_dup_phone_idx ON public.contacts USING btree (regexp_replace(phone, %'
     or phone_contacts not like '%crm_archived_at IS NULL%'
     or phone_contacts not like '%char_length(regexp_replace(phone, %>= 7))'
     or phone_contacts ilike '%gin%' or phone_contacts ilike '%gist%' or phone_contacts ilike '%trgm%' then
    raise exception 'drift: contacts_dup_phone_idx is %', phone_contacts;
  end if;
end
$post$;

commit;
