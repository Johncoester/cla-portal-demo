-- Hand change, already on TEST, do not apply again.
-- private.crm_person_dup copied exactly from supabase/migrations/20261110040000_crm_person_dup_index.sql.
-- That file installs this body after it checks the older one. This copy runs just after it.
-- Full definition checksum must be 618de60d1b35841405a26ed27364ae8e, the same as TEST.
-- Do not apply this file to TEST again.

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
