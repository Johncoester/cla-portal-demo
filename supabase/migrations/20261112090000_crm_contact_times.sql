-- CRM Clients list times. NOT applied to hosted TEST (aqcervntopidtcazcmlv).
-- The lead applies this file. Do not backfill. No new per-row helper.
-- Does not change shared RLS helpers, crm_row_guard, or deals, tasks, or profiles policies.
--
-- private.crm_contact_json is what crm_contact_list returns. It had no createdAt
-- or modifiedAt, so the Clients list showed a blank Created Time and Modified Time.
-- Leads and Companies already return those times.
-- private.rpc_crm_update_contact never wrote contacts.modified_at. An update now sets
-- modified_at = now() and modified_by = private.effective_uid(). Every other line stays.
-- Rows already stored are left alone. The Clients list shows modifiedAt, or createdAt
-- when modifiedAt is still null.
--
-- Drift guard: md5(pg_get_functiondef) read from TEST on 2026-11-10.
--   private.crm_contact_json(uuid)              a1ea62a930abe15fdddf1e2b5acc1854
--   private.rpc_crm_update_contact(uuid, jsonb) ea5203bd6388e3dc63c7c188e11a2005
-- Rollback: supabase/rollbacks/20261112090000_crm_contact_times.sql
-- That rollback is the before-definitions, verbatim from pg_get_functiondef.

begin;
set local lock_timeout = '3s';

do $guard$
declare
  j text;
  u text;
begin
  if to_regprocedure('private.crm_contact_json(uuid)') is null then
    raise exception 'drift: private.crm_contact_json(uuid) is missing';
  end if;
  if to_regprocedure('private.rpc_crm_update_contact(uuid, jsonb)') is null then
    raise exception 'drift: private.rpc_crm_update_contact(uuid, jsonb) is missing';
  end if;
  if pg_get_function_result('private.crm_contact_json(uuid)'::regprocedure) is distinct from 'jsonb' then
    raise exception 'drift: private.crm_contact_json(uuid) does not return jsonb';
  end if;
  if pg_get_function_result('private.rpc_crm_update_contact(uuid, jsonb)'::regprocedure) is distinct from 'void' then
    raise exception 'drift: private.rpc_crm_update_contact(uuid, jsonb) does not return void';
  end if;
  j := md5(pg_get_functiondef('private.crm_contact_json(uuid)'::regprocedure));
  u := md5(pg_get_functiondef('private.rpc_crm_update_contact(uuid, jsonb)'::regprocedure));
  if j is distinct from 'a1ea62a930abe15fdddf1e2b5acc1854' then
    raise exception 'drift: private.crm_contact_json(uuid) md5 %', j;
  end if;
  if u is distinct from 'ea5203bd6388e3dc63c7c188e11a2005' then
    raise exception 'drift: private.rpc_crm_update_contact(uuid, jsonb) md5 %', u;
  end if;
end
$guard$;

CREATE OR REPLACE FUNCTION private.crm_contact_json(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select jsonb_build_object('id', c.id, 'name', btrim(c.first_name || ' ' || c.last_name), 'firstName', c.first_name, 'lastName', c.last_name, 'email', c.email, 'phone', c.phone, 'company', c.company,
    'contactType', c.contact_type, 'hasLogin', c.profile_id is not null, 'ownerId', c.crm_owner_id, 'ownerName', coalesce(private.crm_name(c.crm_owner_id), ''),
    'accountId', c.account_id, 'accountName', coalesce((select name from public.crm_accounts where id = c.account_id), ''), 'stage', c.crm_stage, 'lastContactedOn', c.last_contacted_on,
    'companyName', coalesce((select name from public.crm_accounts where id = c.account_id), c.company),
    'tags', to_jsonb(c.tags), 'notes', c.crm_notes, 'description', c.crm_notes, 'archived', c.crm_archived_at is not null, 'fromLeadId', c.crm_lead_id, 'linked', private.crm_linked(c.id), 'canEdit', private.crm_editor(),
    'leadSource', c.lead_source, 'relationshipStatus', coalesce(c.relationship_status, ''), 'custom', c.custom,
    'salesReps', coalesce((select jsonb_agg(jsonb_build_object('id', l.sales_id, 'name', private.crm_name(l.sales_id))) from public.client_sales_reps l where l.client_id = c.profile_id), '[]'::jsonb),
    'orders', (select count(distinct dp.deal_id) from public.deal_participants dp where dp.contact_id = c.id),
    'volume', coalesce((select sum(d.purchase_price) from public.deals d where d.status <> 'Cancelled' and exists (select 1 from public.deal_participants dp where dp.deal_id = d.id and dp.contact_id = c.id)), 0),
    'createdAt', c.created_at, 'modifiedAt', c.modified_at)
    || private.crm_person_json(to_jsonb(c))
  from public.contacts c where c.id = p_id $function$;

CREATE OR REPLACE FUNCTION private.rpc_crm_update_contact(p_id uuid, p jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare v_acc uuid;
begin perform set_config('crm.person_write', '1', true); perform private.crm_need(true);
  if not private.crm_contact_visible(p_id) then raise exception 'Client not found.' using errcode = 'P0002'; end if;
  if p ? 'accountId' then v_acc := nullif(p->>'accountId', '')::uuid; if v_acc is not null and not private.crm_account_visible(v_acc) then raise exception 'Company not found.' using errcode = 'P0002'; end if; end if;
  if p ? 'roleInCompany' and coalesce(p->>'roleInCompany', '') = '' and private.crm_required('roleInCompany') then raise exception 'Role in Company is required.' using errcode = 'P0001'; end if;
  if p ? 'relationshipStatus' and coalesce(p->>'relationshipStatus', '') = '' and private.crm_required('relationshipStatus') then raise exception 'Relationship Status is required.' using errcode = 'P0001'; end if;
  if p ? 'state' and coalesce(p->>'state', '') = '' and private.crm_required('state') then raise exception 'State is required.' using errcode = 'P0001'; end if;
  if p ? 'custom' and jsonb_typeof(p->'custom') <> 'object' then raise exception 'Custom values must be a JSON object.' using errcode = '23514'; end if;
  update public.contacts set
    crm_owner_id = case when p ? 'ownerId' then nullif(p->>'ownerId', '')::uuid else crm_owner_id end,
    account_id = case when p ? 'accountId' then v_acc else account_id end,
    crm_stage = case when p ? 'stage' then nullif(p->>'stage', '') else crm_stage end,
    last_contacted_on = case when p ? 'lastContactedOn' then nullif(p->>'lastContactedOn', '')::date else last_contacted_on end,
    tags = case when p ? 'tags' then coalesce((select array_agg(distinct lower(btrim(t))) from jsonb_array_elements_text(p->'tags') t where btrim(t) <> ''), '{}') else tags end,
    crm_notes = case when p ? 'description' then coalesce(p->>'description', '') when p ? 'notes' then coalesce(p->>'notes', '') else crm_notes end,
    contact_type = case when p ? 'contactType' then nullif(p->>'contactType', '') else contact_type end,
    company = case when p ? 'company' then coalesce(p->>'company', '') else company end,
    role_in_company = case when p ? 'roleInCompany' then coalesce(p->>'roleInCompany', '') else role_in_company end,
    title = case when p ? 'title' then btrim(coalesce(p->>'title', '')) else title end,
    mobile = case when p ? 'mobile' then btrim(coalesce(p->>'mobile', '')) else mobile end,
    assistant = case when p ? 'assistant' then btrim(coalesce(p->>'assistant', '')) else assistant end,
    asst_phone = case when p ? 'asstPhone' then btrim(coalesce(p->>'asstPhone', '')) else asst_phone end,
    agent_split = case when p ? 'agentSplit' then nullif(btrim(coalesce(p->>'agentSplit', '')), '')::numeric else agent_split end,
    license_no = case when p ? 'licenseNo' then btrim(coalesce(p->>'licenseNo', '')) else license_no end,
    sales_volume_last_year = case when p ? 'salesVolumeLastYear' then nullif(regexp_replace(coalesce(p->>'salesVolumeLastYear', ''), '[$,\s]', '', 'g'), '')::numeric else sales_volume_last_year end,
    deals_closed_last_year = case when p ? 'dealsClosedLastYear' then nullif(btrim(coalesce(p->>'dealsClosedLastYear', '')), '')::int else deals_closed_last_year end,
    zillow_url = case when p ? 'zillowUrl' then private.crm_url_in(p->>'zillowUrl') else zillow_url end,
    crm_street = case when p ? 'street' then btrim(coalesce(p->>'street', '')) else crm_street end,
    crm_city = case when p ? 'city' then btrim(coalesce(p->>'city', '')) else crm_city end,
    crm_state = case when p ? 'state' then upper(btrim(coalesce(p->>'state', ''))) else crm_state end,
    crm_zip = case when p ? 'zip' then btrim(coalesce(p->>'zip', '')) else crm_zip end,
    crm_county = case when p ? 'county' then btrim(coalesce(p->>'county', '')) else crm_county end,
    links = case when p ? 'links' then private.crm_links_in(p->'links') else links end,
    lead_source = case when p ? 'leadSource' then coalesce(p->>'leadSource', '') else lead_source end,
    relationship_status = case when p ? 'relationshipStatus' then p->>'relationshipStatus' else relationship_status end,
    custom = case when p ? 'custom' then custom || (p->'custom') else custom end,
    modified_at = now(),
    modified_by = private.effective_uid()
  where id = p_id; end $function$;

do $readback$
declare
  src text;
begin
  select p.prosrc into src from pg_proc p where p.oid = 'private.crm_contact_json(uuid)'::regprocedure;
  if position('''createdAt'', c.created_at' in src) = 0
     or position('''modifiedAt'', c.modified_at' in src) = 0
     or position('private.crm_person_json(to_jsonb(c))' in src) = 0 then
    raise exception 'readback: private.crm_contact_json is missing the timestamp keys';
  end if;
  select p.prosrc into src from pg_proc p where p.oid = 'private.rpc_crm_update_contact(uuid, jsonb)'::regprocedure;
  if position('modified_at = now()' in src) = 0
     or position('modified_by = private.effective_uid()' in src) = 0
     or position('where id = p_id' in src) = 0 then
    raise exception 'readback: private.rpc_crm_update_contact does not stamp the update';
  end if;
end
$readback$;

commit;
