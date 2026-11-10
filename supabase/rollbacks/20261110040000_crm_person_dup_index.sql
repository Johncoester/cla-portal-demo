-- Rollback of 20261110040000_crm_person_dup_index.sql.
-- Not applied by this commit.
-- One transaction. lock_timeout 3s. Restores private.crm_person_dup() to md5(prosrc)
-- b590bd6b5cae11bcce28b6662cf0c794 and drops the two phone expression indexes.
-- Refuses unless the rewritten function is still ea36530b44b56d404545bf3f60239055
-- and those indexes are the btree digit indexes this migration created.
-- Does not drop crm_leads_open_email_uq or contacts_email_uq. Does not delete leads or clients.
-- CREATE OR REPLACE keeps the owner and the grants.

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

do $pre$
declare
  phone_leads text := pg_get_indexdef('public.crm_leads_dup_phone_idx'::regclass);
  phone_contacts text := pg_get_indexdef('public.contacts_dup_phone_idx'::regclass);
begin
  if (select md5(prosrc) from pg_proc where oid = to_regprocedure('private.crm_person_dup()'))
     is distinct from 'ea36530b44b56d404545bf3f60239055' then
    raise exception 'drift: private.crm_person_dup() is not the indexed rewrite';
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
$pre$;

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

drop index public.contacts_dup_phone_idx;
drop index public.crm_leads_dup_phone_idx;

do $post$
begin
  if (select md5(prosrc) from pg_proc where oid = to_regprocedure('private.crm_person_dup()'))
     is distinct from 'b590bd6b5cae11bcce28b6662cf0c794' then
    raise exception 'drift: restored crm_person_dup() is not the previous source';
  end if;
  if to_regclass('public.crm_leads_dup_phone_idx') is not null
     or to_regclass('public.contacts_dup_phone_idx') is not null then
    raise exception 'drift: phone duplicate index still exists';
  end if;
  if has_function_privilege('public', 'private.crm_person_dup()', 'execute')
     or has_function_privilege('anon', 'private.crm_person_dup()', 'execute')
     or not has_function_privilege('authenticated', 'private.crm_person_dup()', 'execute') then
    raise exception 'drift: crm_person_dup grants changed';
  end if;
end
$post$;

commit;
