-- Already applied on TEST. Do not apply this file to TEST again.
-- Source: TEST history, supabase_migrations.schema_migrations, project aqcervntopidtcazcmlv.
-- Version 20261105222924, name crm_settings.
-- The text below this label is the exact history statement. The label is not part of that text.
-- =====================================================================
-- =====================================================================
-- Migration 25 (Janine / John, Nov 2): CRM SETTINGS. See docs/CRM.md "CRM Settings". Re-runnable (idempotent). Builds on 22 + 24.
--  * crm_picklist_options: the editable pick lists (Relationship Status, Lead Source, Role in Company, Company Type, Pipeline Stage,
--    Task Subject (suggestions), Task Status, Task Priority, Meeting Type) and each dropdown custom field's own options ('cf:<field id>').
--    value = stable (stored on records), label = shown. Rename = new label only. Retire = no longer offered; records keep the value.
--    Options are never deleted. Locked options (the CRM depends on them) cannot be retired; every list keeps one active option.
--  * crm_custom_fields: Admin-defined fields on leads / clients / companies / opportunities (11 types). "Delete" = archived_at
--    (hidden; the stored values are kept and come back on restore). Rows are never deleted; a field's entity and type never change.
--  * crm_field_settings: hide optional built-in fields; un-require Role in Company / Relationship Status / State. Protected fields
--    (Owner, First / Last Name, Company, Email, Phone; Company Name, Type, Company Owner) are not in the list, so they cannot be touched.
--  * custom jsonb on contacts, crm_leads, crm_accounts, crm_opportunities: {"<field id>": value}, validated per type by a trigger.
--  * The hard CHECKs on picklist columns (migrations 22 / 24) are replaced by a trigger that checks the value against this table:
--    a new or changed value must be an active option; an unchanged value (e.g. retired) is always kept. Non-picklist checks are re-added.
--  * RLS: Admin / Super admin (private.is_admin) write; everyone with CRM access (private.crm_user) reads; the 'crm' switch applies.
-- NOTE: migration 24 skips its picklist CHECKs when crm_picklist_options exists. Re-running 24 by hand restores 24's versions of the
-- functions below (crm_row_guard, crm_create_contact, ...), so re-run 25 after it (the test runner always runs them in order).
-- =====================================================================

-- ---------- tables ----------
create or replace function private.crm_list_keys() returns text[] language sql immutable as $$
  select array['relationshipStatus', 'leadSource', 'roleInCompany', 'accountKind', 'oppStage', 'taskSubject', 'taskStatus', 'taskPriority', 'meetingType'] $$;
create or replace function private.crm_list_label(k text) returns text language sql immutable as $$
  select case k when 'relationshipStatus' then 'Relationship Status' when 'leadSource' then 'Lead Source' when 'roleInCompany' then 'Role in Company' when 'accountKind' then 'Company Type'
    when 'oppStage' then 'Pipeline Stage' when 'taskSubject' then 'Task Subject' when 'taskStatus' then 'Task Status' when 'taskPriority' then 'Task Priority' when 'meetingType' then 'Meeting Type' else 'value' end $$;
create or replace function private.crm_locked_option(k text, v text) returns boolean language sql immutable as $$
  select (k, v) in (('relationshipStatus', 'Converted/Current Client'), ('taskStatus', 'Not Started'), ('taskStatus', 'Completed'), ('oppStage', 'New'), ('accountKind', 'other')) $$;
create or replace function private.crm_person_field_keys() returns text[] language sql immutable as $$
  select array['roleInCompany', 'relationshipStatus', 'state', 'title', 'mobile', 'assistant', 'asstPhone', 'leadSource', 'agentSplit', 'licenseNo', 'salesVolumeLastYear',
    'dealsClosedLastYear', 'zillowUrl', 'contactType', 'tags', 'street', 'city', 'zip', 'county', 'description']
    || (select array_agg('links.' || k) from unnest(private.crm_link_keys()) k) $$;

create table if not exists public.crm_picklist_options (
  list_key text not null check (list_key = any (private.crm_list_keys()) or list_key ~ '^cf:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  value text not null check (char_length(btrim(value)) between 1 and 80),
  label text not null check (char_length(btrim(label)) between 1 and 60 and label !~ '[[:cntrl:]]' and label = btrim(label)),
  position integer not null default 0, retired boolean not null default false,
  modified_by uuid references public.profiles (id), modified_at timestamptz not null default now(),
  primary key (list_key, value));
create unique index if not exists crm_picklist_options_label_idx on public.crm_picklist_options (list_key, lower(label));

create table if not exists public.crm_custom_fields (
  id uuid primary key default gen_random_uuid(),
  entity text not null check (entity in ('lead', 'contact', 'account', 'opportunity')),
  label text not null check (char_length(btrim(label)) between 1 and 60 and label !~ '[[:cntrl:]]' and label = btrim(label)),
  type text not null check (type in ('text', 'textarea', 'number', 'currency', 'percent', 'date', 'checkbox', 'dropdown', 'email', 'phone', 'url')),
  required boolean not null default false,
  section text not null default 'additional',
  position integer not null default 0, show_in_list boolean not null default true, archived_at timestamptz,
  created_by uuid references public.profiles (id), created_at timestamptz not null default now(), modified_by uuid references public.profiles (id), modified_at timestamptz,
  constraint crm_custom_fields_rules check (not (type = 'checkbox' and required)
    and (case entity when 'opportunity' then section = 'info' when 'account' then section in ('info', 'additional') else section in ('info', 'address', 'description', 'additional') end)));
create unique index if not exists crm_custom_fields_label_idx on public.crm_custom_fields (entity, lower(label));   -- deleted ones too: restore instead

create table if not exists public.crm_field_settings (
  scope text not null, key text not null, hidden boolean not null default false, required boolean not null default false,
  modified_by uuid references public.profiles (id), modified_at timestamptz not null default now(),
  primary key (scope, key),
  constraint crm_field_settings_rules check (
    ((scope = 'person' and key = any (private.crm_person_field_keys())) or (scope = 'account' and key in ('phone', 'website', 'city', 'state', 'notes')))
    and not (hidden and required) and (not required or (scope = 'person' and key in ('roleInCompany', 'relationshipStatus', 'state')))));

-- defaults (never overwrite what an Admin changed)
insert into public.crm_picklist_options (list_key, value, label, position)
  select l.k, o.v, o.v, o.n * 10 from (values
    ('relationshipStatus', private.crm_statuses()), ('leadSource', private.crm_sources()), ('roleInCompany', private.crm_roles()),
    ('oppStage', array['New', 'Meeting set', 'Proposal', 'Won', 'Lost']), ('taskSubject', array['Email', 'Call', 'Follow-up', 'Send Quote', 'Send Letter', 'Send Email', 'Other']),
    ('taskStatus', private.crm_task_statuses()), ('taskPriority', private.crm_priorities()), ('meetingType', private.crm_meeting_types())) l(k, a)
  cross join lateral unnest(l.a) with ordinality o(v, n)
  on conflict do nothing;
insert into public.crm_picklist_options (list_key, value, label, position) values ('accountKind', 'brokerage', 'Brokerage', 10), ('accountKind', 'lender', 'Lender', 20), ('accountKind', 'other', 'Other', 30)
  on conflict do nothing;
insert into public.crm_field_settings (scope, key, required) select 'person', k, k in ('roleInCompany', 'relationshipStatus', 'state') from unnest(private.crm_person_field_keys()) k on conflict do nothing;
insert into public.crm_field_settings (scope, key) select 'account', k from unnest(array['phone', 'website', 'city', 'state', 'notes']) k on conflict do nothing;

-- custom values on the records
do $c$ declare t text; begin foreach t in array array['contacts', 'crm_leads', 'crm_accounts', 'crm_opportunities'] loop
  execute format('alter table public.%I add column if not exists custom jsonb not null default %L', t, '{}');
  execute format('alter table public.%I drop constraint if exists %I', t, t || '_custom_check');
  execute format('alter table public.%I add constraint %I check (jsonb_typeof(custom) = %L)', t, t || '_custom_check', 'object');
end loop; end $c$;

-- ---------- helpers ----------
create or replace function private.crm_required(k text) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select required from public.crm_field_settings where scope = 'person' and key = k), k in ('roleInCompany', 'relationshipStatus', 'state')) $$;
create or replace function private.crm_option_active(k text, v text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.crm_picklist_options where list_key = k and value = v and not retired) $$;
create or replace function private.crm_first_option(k text) returns text language sql stable security definer set search_path = public as $$
  select value from public.crm_picklist_options where list_key = k and not retired order by position, value limit 1 $$;
create or replace function private.crm_option_label(k text, v text) returns text language sql stable security definer set search_path = public as $$
  select coalesce((select label from public.crm_picklist_options where list_key = k and value = v), v) $$;
-- a pick-list value: blank (if allowed), unchanged (old value, or the value carried over from the converted lead), or an active option
create or replace function private.crm_list_check(k text, v text, p_old text, p_carried text, p_blank_ok boolean, p_label text default null) returns void language plpgsql stable security definer set search_path = public as $$
declare lab text := coalesce(p_label, private.crm_list_label(k));
begin
  if v is null or v = '' then if p_blank_ok then return; end if; raise exception 'Pick a % from the list.', lab using errcode = '23514'; end if;
  if v is not distinct from p_old or v is not distinct from p_carried or private.crm_option_active(k, v) then return; end if;
  if exists (select 1 from public.crm_picklist_options where list_key = k and value = v) then
    raise exception '"%" is retired; pick another %.', private.crm_option_label(k, v), lab using errcode = '23514'; end if;
  raise exception 'Pick a % from the list.', lab using errcode = '23514'; end $$;

-- custom values: {"<field id>": value}. Update = merge onto the old values (a key set to null / '' clears it).
-- Deleted (archived) fields: their stored values are kept and cannot be changed until the field is restored.
create or replace function private.crm_custom_in(p_entity text, p_new jsonb, p_old jsonb, p_insert boolean, p_require boolean) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb; k text; v jsonb; s text; n numeric; f public.crm_custom_fields; o jsonb := coalesce(p_old, '{}');
begin
  if p_new is null then p_new := '{}'; end if;
  if jsonb_typeof(p_new) <> 'object' then raise exception 'Custom values must be a JSON object.' using errcode = '23514'; end if;
  r := case when p_insert then p_new else o || p_new end;
  for k in select jsonb_object_keys(r) loop
    f := null; select * into f from public.crm_custom_fields cf where cf.id::text = k and cf.entity = p_entity;
    if f.id is null then raise exception 'Unknown custom field.' using errcode = '23514'; end if;
    v := r -> k;
    if f.archived_at is not null then
      if v is distinct from o -> k then raise exception 'The field "%" was deleted; restore it to change its value.', f.label using errcode = 'P0001'; end if; continue; end if;
    if jsonb_typeof(v) = 'null' or (jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = '') then r := r - k; continue; end if;
    if v = o -> k then continue; end if;   -- unchanged (e.g. a retired dropdown option)
    if jsonb_typeof(v) not in ('string', 'number', 'boolean') then raise exception '% has an invalid value.', f.label using errcode = '23514'; end if;
    s := btrim(v #>> '{}');
    case f.type
      when 'text' then if char_length(s) > 255 then raise exception '% can be at most 255 characters.', f.label using errcode = '23514'; end if; r := jsonb_set(r, array[k], to_jsonb(s));
      when 'textarea' then if char_length(s) > 4000 then raise exception '% can be at most 4000 characters.', f.label using errcode = '23514'; end if; r := jsonb_set(r, array[k], to_jsonb(s));
      when 'number', 'currency', 'percent' then
        s := regexp_replace(s, case when f.type = 'number' then ',' else '[$,%\s]' end, '', 'g');
        if s !~ '^-?([0-9]+(\.[0-9]*)?|\.[0-9]+)$' then raise exception '% must be a number.', f.label using errcode = '23514'; end if;
        n := s::numeric; if abs(n) > 1e13 then raise exception '% is too large.', f.label using errcode = '23514'; end if;
        if f.type <> 'number' then n := round(n, 2); end if; r := jsonb_set(r, array[k], to_jsonb(n));
      when 'date' then
        begin if s !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or to_char(to_date(s, 'YYYY-MM-DD'), 'YYYY-MM-DD') <> s then s := 'bad'; end if;
        exception when others then s := 'bad'; end;
        if s = 'bad' then raise exception '% must be a real date (YYYY-MM-DD).', f.label using errcode = '23514'; end if;
        r := jsonb_set(r, array[k], to_jsonb(s));
      when 'checkbox' then r := jsonb_set(r, array[k], to_jsonb(lower(s) in ('true', '1', 'on', 'yes')));
      when 'dropdown' then
        perform private.crm_list_check('cf:' || f.id::text, s, o ->> k, null, false, f.label); r := jsonb_set(r, array[k], to_jsonb(s));
      when 'email' then s := lower(s);
        if char_length(s) > 200 or s !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception '% is not a valid email address.', f.label using errcode = '23514'; end if; r := jsonb_set(r, array[k], to_jsonb(s));
      when 'phone' then s := regexp_replace(s, '\D', '', 'g');
        if char_length(s) <> 10 then raise exception '% must be a 10-digit phone number (xxx-xxx-xxxx).', f.label using errcode = '23514'; end if;
        r := jsonb_set(r, array[k], to_jsonb(substr(s, 1, 3) || '-' || substr(s, 4, 3) || '-' || substr(s, 7)));
      when 'url' then r := jsonb_set(r, array[k], to_jsonb(private.crm_url_in(s)));
    end case;
  end loop;
  -- required: on a new record (direct writes and the create functions), and a value once set cannot be blanked
  for f in select * from public.crm_custom_fields cf where cf.entity = p_entity and cf.archived_at is null and cf.required loop
    if not (r ? f.id::text) and (p_require or (not p_insert and o ? f.id::text)) then raise exception '% is required.', f.label using errcode = 'P0001'; end if;
  end loop;
  return r; end $$;

-- ---------- the record check (fires after the guards: trigger names sort after *_guard) ----------
create or replace function private.crm_lead_values(p_id uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('role_in_company', role_in_company, 'source', source, 'status', status) from public.crm_leads where id = p_id $$;
-- SECURITY INVOKER on purpose: current_user tells a write from the app ('authenticated') from one made inside a CRM function such as
-- convert (the function owner). Everything it reads goes through the security-definer helpers above.
create or replace function private.crm_settings_row() returns trigger language plpgsql security invoker set search_path = public as $$
declare o jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end; l jsonb; ent text;
  direct boolean := current_user = 'authenticated';   -- a write from the app (not from a CRM function such as convert)
begin
  if coalesce(current_setting('crm.spawn', true), '') = '1' then return new; end if;   -- a repeating task's next occurrence copies its values
  if tg_table_name = 'contacts' then
    if new.crm_lead_id is not null then l := private.crm_lead_values(new.crm_lead_id); end if;
    perform private.crm_list_check('roleInCompany', new.role_in_company, o ->> 'role_in_company', l ->> 'role_in_company', true);
    perform private.crm_list_check('leadSource', new.lead_source, o ->> 'lead_source', l ->> 'source', true);
    perform private.crm_list_check('relationshipStatus', new.relationship_status, o ->> 'relationship_status', l ->> 'status', true);
    ent := 'contact';
  elsif tg_table_name = 'crm_leads' then
    if coalesce(new.status, '') = '' then
      if private.crm_required('relationshipStatus') then raise exception 'Relationship Status is required.' using errcode = 'P0001'; end if;
      new.status := private.crm_first_option('relationshipStatus'); end if;
    if tg_op = 'INSERT' and new.status = 'Potential/Warm' and not private.crm_option_active('relationshipStatus', new.status) then new.status := private.crm_first_option('relationshipStatus'); end if;   -- column default retired
    perform private.crm_list_check('roleInCompany', new.role_in_company, o ->> 'role_in_company', null, true);
    perform private.crm_list_check('leadSource', new.source, o ->> 'source', null, true);
    perform private.crm_list_check('relationshipStatus', new.status, o ->> 'status', null, false);
    ent := 'lead';
  elsif tg_table_name = 'crm_accounts' then perform private.crm_list_check('accountKind', new.kind, o ->> 'kind', null, false); ent := 'account';
  elsif tg_table_name = 'crm_opportunities' then perform private.crm_list_check('oppStage', new.stage, o ->> 'stage', null, false); ent := 'opportunity';
  elsif tg_table_name = 'crm_activities' then
    if new.kind = 'task' then
      if tg_op = 'INSERT' and new.priority = 'High' and not private.crm_option_active('taskPriority', 'High') then new.priority := private.crm_first_option('taskPriority'); end if;   -- column default retired
      perform private.crm_list_check('taskStatus', new.status, o ->> 'status', null, false);
      perform private.crm_list_check('taskPriority', new.priority, o ->> 'priority', null, false);
    elsif new.kind = 'meeting' then perform private.crm_list_check('meetingType', new.meeting_type, o ->> 'meeting_type', null, true); end if;
    return new;
  end if;
  new.custom := private.crm_custom_in(ent, new.custom, o -> 'custom', tg_op = 'INSERT', direct and tg_op = 'INSERT' and ent <> 'contact');
  return new; end $$;
do $t$ declare t text; begin foreach t in array array['contacts', 'crm_leads', 'crm_accounts', 'crm_opportunities', 'crm_activities'] loop
  execute format('drop trigger if exists %I on public.%I', t || '_zz_settings', t);
  execute format('create trigger %I before insert or update on public.%I for each row execute function private.crm_settings_row()', t || '_zz_settings', t);
end loop; end $t$;

-- ---------- replace the hard picklist CHECKs (22 / 24); the other rules are re-added under new names ----------
alter table public.contacts drop constraint if exists contacts_zoho_lists_check;
alter table public.crm_leads drop constraint if exists crm_leads_source_check;
alter table public.crm_leads drop constraint if exists crm_leads_status_check;
alter table public.crm_accounts drop constraint if exists crm_accounts_kind_check;
alter table public.crm_opportunities drop constraint if exists crm_opportunities_stage_check;
do $p$ declare t text; begin foreach t in array array['contacts', 'crm_leads'] loop
  execute format('alter table public.%I drop constraint if exists %I', t, t || '_zoho_check');
  execute format('alter table public.%I drop constraint if exists %I', t, t || '_zoho_fields_check');
  execute format($c$alter table public.%I add constraint %I check (
      char_length(role_in_company) <= 80 and char_length(title) <= 100 and char_length(mobile) <= 40 and char_length(assistant) <= 100 and char_length(asst_phone) <= 40 and char_length(license_no) <= 60
      and (agent_split is null or agent_split between 0 and 100) and (sales_volume_last_year is null or sales_volume_last_year >= 0)
      and (deals_closed_last_year is null or deals_closed_last_year between 0 and 100000)
      and private.crm_url_ok(zillow_url) and private.crm_links_ok(links)
      and char_length(crm_street) <= 200 and char_length(crm_city) <= 80 and (crm_state = '' or private.us_state_ok(crm_state))
      and crm_zip ~ '^([0-9]{5}(-[0-9]{4})?)?$' and char_length(crm_county) <= 60)$c$, t, t || '_zoho_fields_check');
end loop; end $p$;
alter table public.crm_activities drop constraint if exists crm_activities_zoho_check;
alter table public.crm_activities drop constraint if exists crm_activities_fields_check;
alter table public.crm_activities add constraint crm_activities_fields_check check (
  (kind = 'task' or status = 'done') and char_length(status) <= 80 and char_length(priority) <= 80 and char_length(meeting_type) <= 80 and (not reminder or reminder_at is not null)
  and repeat_every in ('', 'daily', 'weekly', 'monthly') and (repeat_until is null or due_date is null or repeat_until >= due_date)
  and (kind = 'task' or (repeat_every = '' and not reminder))
  and char_length(location) <= 200
  and (kind <> 'meeting' or starts_at is null or (ends_at is not null and ends_at >= starts_at))
  and cardinality(participants) <= 50 and array_to_string(participants, ',') ~ '^((lead|contact|user):[0-9a-f-]{36}(,|$))*$');

-- ---------- settings rules (triggers) ----------
create or replace function private.crm_settings_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare v_field uuid;
begin
  if tg_op = 'DELETE' then raise exception 'CRM settings are never deleted; retire the option or delete (hide) the field instead.' using errcode = 'P0001'; end if;
  if tg_table_name = 'crm_picklist_options' then
    new.label := btrim(new.label); new.modified_by := coalesce(auth.uid(), new.modified_by); new.modified_at := now();
    if tg_op = 'INSERT' then
      if new.list_key like 'cf:%' then v_field := substr(new.list_key, 4)::uuid;
        if not exists (select 1 from public.crm_custom_fields where id = v_field and type = 'dropdown') then raise exception 'That dropdown field does not exist.' using errcode = 'P0002'; end if; end if;
      if (select count(*) from public.crm_picklist_options where list_key = new.list_key) >= 100 then raise exception 'A list can have at most 100 options.' using errcode = 'P0001'; end if;
      if new.position = 0 then new.position := coalesce((select max(position) from public.crm_picklist_options where list_key = new.list_key), 0) + 10; end if;
    else
      if (new.list_key, new.value) is distinct from (old.list_key, old.value) then raise exception 'An option''s stored value never changes; rename its label instead.' using errcode = 'P0001'; end if;
      if new.retired and not old.retired then
        if private.crm_locked_option(new.list_key, new.value) then raise exception '"%" cannot be retired: the CRM depends on it.', old.label using errcode = 'P0001'; end if;
        if not exists (select 1 from public.crm_picklist_options where list_key = new.list_key and value <> new.value and not retired) then
          raise exception 'Each list keeps at least one active option.' using errcode = 'P0001'; end if; end if;
    end if;
  elsif tg_table_name = 'crm_custom_fields' then
    new.label := btrim(new.label); new.modified_by := coalesce(auth.uid(), new.modified_by); new.modified_at := now();
    if tg_op = 'INSERT' then new.created_by := coalesce(auth.uid(), new.created_by); new.created_at := now();
      if (select count(*) from public.crm_custom_fields where entity = new.entity) >= 50 then raise exception 'At most 50 custom fields per record type.' using errcode = 'P0001'; end if;
      if new.position = 0 then new.position := coalesce((select max(position) from public.crm_custom_fields where entity = new.entity), 0) + 10; end if;
    elsif (new.entity, new.type) is distinct from (old.entity, old.type) then raise exception 'A field''s record type and field type never change (stored values depend on them); add a new field instead.' using errcode = 'P0001'; end if;
  else
    new.modified_by := coalesce(auth.uid(), new.modified_by); new.modified_at := now();
  end if;
  return new; end $$;
do $t$ declare t text; begin foreach t in array array['crm_picklist_options', 'crm_custom_fields', 'crm_field_settings'] loop
  execute format('drop trigger if exists %I on public.%I', t || '_guard', t);
  execute format('create trigger %I before insert or update or delete on public.%I for each row execute function private.crm_settings_guard()', t || '_guard', t);
  execute format('alter table public.%I enable row level security', t);
  execute format('revoke all on public.%I from public, anon, authenticated', t);
  execute format('grant select, insert, update on public.%I to authenticated', t);   -- never delete
  execute format('drop policy if exists %I on public.%I', t || '_read', t);
  execute format('create policy %I on public.%I for select to authenticated using (private.crm_user())', t || '_read', t);
  execute format('drop policy if exists %I on public.%I', t || '_insert', t);
  execute format('create policy %I on public.%I for insert to authenticated with check (private.crm_on() and private.is_admin())', t || '_insert', t);
  execute format('drop policy if exists %I on public.%I', t || '_update', t);
  execute format('create policy %I on public.%I for update to authenticated using (private.crm_on() and private.is_admin()) with check (private.crm_on() and private.is_admin())', t || '_update', t);
end loop; end $t$;
-- a dropdown field needs at least one active option (checked at commit, so crm_create_field can add both)
create or replace function private.crm_dropdown_has_options() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.type = 'dropdown' and new.archived_at is null and not exists (select 1 from public.crm_picklist_options where list_key = 'cf:' || new.id::text and not retired) then
    raise exception 'A dropdown field needs at least one option.' using errcode = 'P0001'; end if;
  return null; end $$;
drop trigger if exists crm_custom_fields_options on public.crm_custom_fields;
create constraint trigger crm_custom_fields_options after insert or update on public.crm_custom_fields deferrable initially deferred for each row execute function private.crm_dropdown_has_options();

-- ---------- functions the screens call ----------
create or replace function private.crm_fields_json() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'entity', f.entity, 'label', f.label, 'type', f.type, 'required', f.required, 'section', f.section, 'position', f.position,
    'showInList', f.show_in_list, 'archivedAt', f.archived_at,
    'options', case when f.type = 'dropdown' then coalesce((select jsonb_agg(jsonb_build_object('value', o.value, 'label', o.label, 'retired', o.retired) order by o.position, o.value)
      from public.crm_picklist_options o where o.list_key = 'cf:' || f.id::text), '[]'::jsonb) end) order by f.entity, f.position, f.label), '[]'::jsonb)
  from public.crm_custom_fields f $$;
create or replace function private.crm_usage(k text, p_col text, p_table text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin execute format('select coalesce(jsonb_object_agg(v, n), %L) from (select %I v, count(*) n from public.%I where coalesce(%I, %L) <> %L group by 1) x', '{}', p_col, p_table, p_col, '', '') into r; return r; end $$;
create or replace function private.crm_usage_sum(a jsonb, b jsonb) returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(k, coalesce((a->>k)::int, 0) + coalesce((b->>k)::int, 0)), '{}') from (select jsonb_object_keys(a) k union select jsonb_object_keys(b)) x $$;
-- everything the screens need; usage counts and the stored values of deleted fields' counts only for Admins
create or replace function public.crm_settings() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin perform private.crm_need();
  r := jsonb_build_object('version', 1, 'canEdit', private.is_admin(),
    'picklists', (select jsonb_object_agg(k, coalesce((select jsonb_agg(jsonb_build_object('value', o.value, 'label', o.label, 'retired', o.retired) order by o.position, o.value)
       from public.crm_picklist_options o where o.list_key = k), '[]'::jsonb)) from unnest(private.crm_list_keys()) k),
    'customFields', private.crm_fields_json(),
    'fields', jsonb_build_object('person', coalesce((select jsonb_object_agg(key, jsonb_build_object('hidden', hidden, 'required', required)) from public.crm_field_settings where scope = 'person'), '{}'),
                                 'account', coalesce((select jsonb_object_agg(key, jsonb_build_object('hidden', hidden, 'required', required)) from public.crm_field_settings where scope = 'account'), '{}')));
  if private.is_admin() then
    r := r || jsonb_build_object('usage', jsonb_build_object(
      'relationshipStatus', private.crm_usage_sum(private.crm_usage('relationshipStatus', 'relationship_status', 'contacts'), private.crm_usage('relationshipStatus', 'status', 'crm_leads')),
      'leadSource', private.crm_usage_sum(private.crm_usage('leadSource', 'lead_source', 'contacts'), private.crm_usage('leadSource', 'source', 'crm_leads')),
      'roleInCompany', private.crm_usage_sum(private.crm_usage('roleInCompany', 'role_in_company', 'contacts'), private.crm_usage('roleInCompany', 'role_in_company', 'crm_leads')),
      'accountKind', private.crm_usage('accountKind', 'kind', 'crm_accounts'), 'oppStage', private.crm_usage('oppStage', 'stage', 'crm_opportunities'),
      'taskStatus', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from public.crm_activities where kind = 'task' group by 1) x), '{}'),
      'taskPriority', coalesce((select jsonb_object_agg(priority, n) from (select priority, count(*) n from public.crm_activities where kind = 'task' group by 1) x), '{}'),
      'taskSubject', coalesce((select jsonb_object_agg(subject, n) from (select subject, count(*) n from public.crm_activities where kind = 'task' group by 1) x), '{}'),
      'meetingType', coalesce((select jsonb_object_agg(meeting_type, n) from (select meeting_type, count(*) n from public.crm_activities where kind = 'meeting' and meeting_type <> '' group by 1) x), '{}')),
      'storedValues', coalesce((select jsonb_object_agg(f.id, (select count(*) from (select custom from public.contacts union all select custom from public.crm_leads union all select custom from public.crm_accounts
          union all select custom from public.crm_opportunities) c where c.custom ? f.id::text)) from public.crm_custom_fields f), '{}'));
  end if;
  return r; end $$;
-- a custom field and (dropdown) its options in one step. p: {entity, label, type, required, section, showInList, options: ["A", "B"]}
create or replace function public.crm_create_field(p jsonb) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := gen_random_uuid(); v_label text := btrim(coalesce(p->>'label', '')); o text; n int := 0;
begin perform private.crm_need();
  if not private.is_admin() then raise exception 'Only an Admin or Super admin can change the CRM settings.' using errcode = '42501'; end if;
  if v_label = '' then raise exception 'Give the field a name.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.crm_custom_fields where entity = p->>'entity' and lower(label) = lower(v_label)) then
    raise exception 'A field named "%" already exists here (a deleted one can be restored instead).', v_label using errcode = '23505'; end if;
  insert into public.crm_custom_fields (id, entity, label, type, required, section, show_in_list)
    values (v_id, p->>'entity', v_label, p->>'type', coalesce((p->>'required')::boolean, false), coalesce(nullif(p->>'section', ''), case when p->>'entity' = 'opportunity' then 'info' else 'additional' end),
      coalesce((p->>'showInList')::boolean, true));
  if p->>'type' = 'dropdown' then
    for o in select distinct on (lower(btrim(x))) btrim(x) from jsonb_array_elements_text(coalesce(p->'options', '[]')) x where btrim(x) <> '' loop
      n := n + 1; insert into public.crm_picklist_options (list_key, value, label, position) values ('cf:' || v_id::text, o, o, n * 10); end loop;
    if n = 0 then raise exception 'A dropdown field needs at least one option.' using errcode = 'P0001'; end if; end if;
  return v_id; end $$;

-- ---------- required fields follow the settings (replaces 24's versions; same signatures) ----------
create or replace function private.crm_row_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare p text; v_type text; v_id uuid;
begin
  if tg_op = 'DELETE' then raise exception 'CRM records are never deleted; archive them instead.' using errcode = 'P0001'; end if;
  if auth.uid() is not null and not private.crm_editor() then raise exception 'You cannot change CRM records.' using errcode = '42501'; end if;
  if tg_table_name = 'crm_attachments' then
    if tg_op = 'UPDATE' then raise exception 'Attachments are kept as uploaded; they cannot be changed or deleted.' using errcode = 'P0001'; end if;
    new.uploaded_by := coalesce(auth.uid(), new.uploaded_by); new.created_at := now(); return new; end if;
  if tg_table_name = 'crm_activities' then
    if tg_op = 'UPDATE' then
      if old.system then raise exception 'This entry was written by the CRM and cannot be changed.' using errcode = 'P0001'; end if;
      if (new.entity, new.entity_id, new.kind) is distinct from (old.entity, old.entity_id, old.kind) then raise exception 'An activity cannot move to another record.' using errcode = 'P0001'; end if;
      new.modified_by := coalesce(auth.uid(), new.modified_by); new.modified_at := now(); end if;
    if tg_op = 'INSERT' then new.modified_by := coalesce(auth.uid(), new.created_by); new.modified_at := now(); end if;
    if new.kind = 'task' then
      if new.status = 'open' or (tg_op = 'INSERT' and new.status = 'done') then new.status := 'Not Started';
      elsif new.status = 'done' then new.status := 'Completed'; new.cancelled := false;
      elsif new.status = 'cancelled' then new.status := 'Completed'; new.cancelled := true; end if;
      if new.status <> 'Completed' then new.cancelled := false; end if;
      new.owner_id := private.crm_assignee_check(new.owner_id, case when tg_op = 'UPDATE' then old.owner_id end, tg_op = 'INSERT');
      new.closed_at := case when new.status = 'Completed' then coalesce(case when tg_op = 'UPDATE' and old.status = 'Completed' then old.closed_at end, now()) end;
      new.done_at := new.closed_at;
      if not new.reminder then new.reminder_at := null; end if;
      if new.repeat_every = '' then new.repeat_until := null; end if;
    elsif new.kind = 'meeting' and (tg_op = 'INSERT' or (new.starts_at, new.ends_at, new.meeting_type, new.host_id, new.participants, new.all_day) is distinct from (old.starts_at, old.ends_at, old.meeting_type, old.host_id, old.participants, old.all_day)) then
      if new.starts_at is null then raise exception 'From is required.' using errcode = 'P0001'; end if;
      if new.all_day then new.starts_at := date_trunc('day', new.starts_at); new.ends_at := date_trunc('day', coalesce(new.ends_at, new.starts_at)); end if;
      if new.ends_at is null then raise exception 'To is required.' using errcode = 'P0001'; end if;
      if new.ends_at < new.starts_at then raise exception '"To" must be after "From".' using errcode = 'P0001'; end if;
      if new.meeting_type = '' then raise exception 'Type is required.' using errcode = 'P0001'; end if;
      new.host_id := private.crm_assignee_check(new.host_id, case when tg_op = 'UPDATE' then old.host_id end, tg_op = 'INSERT', 'host');
      new.owner_id := new.host_id; new.occurred_on := new.starts_at::date; new.status := 'done';
      select coalesce(array_agg(distinct x), '{}') into new.participants from unnest(new.participants) x;
      foreach p in array new.participants loop
        if p !~ '^(lead|contact|user):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Participants can be leads, clients or CLA users.' using errcode = '23514'; end if;
        v_type := split_part(p, ':', 1); v_id := split_part(p, ':', 2)::uuid;
        if v_type = 'user' then
          if not exists (select 1 from public.profiles where id = v_id and status = 'active' and role <> 'Outside user') then raise exception 'Participants can be leads, clients or CLA users.' using errcode = 'P0001'; end if;
        elsif auth.uid() is not null and not private.crm_entity_visible(v_type, v_id) then raise exception 'Participant not found.' using errcode = 'P0002'; end if;
      end loop;
    elsif new.kind <> 'meeting' then
      new.owner_id := coalesce(new.owner_id, auth.uid()); new.occurred_on := coalesce(new.occurred_on, private.office_today());
      if new.occurred_on > private.office_today() then raise exception 'The date cannot be in the future.' using errcode = 'P0001'; end if; end if;
    if tg_op = 'INSERT' then new.created_by := coalesce(auth.uid(), new.created_by); end if;
    return new; end if;
  new.owner_id := private.crm_owner_check(new.owner_id, case when tg_op = 'UPDATE' then old.owner_id end, tg_op = 'INSERT');
  if tg_op = 'INSERT' then new.created_by := coalesce(auth.uid(), new.created_by); else new.modified_by := coalesce(auth.uid(), new.modified_by); new.modified_at := now(); end if;
  if tg_table_name = 'crm_leads' then
    if new.email <> '' and (tg_op = 'INSERT' or lower(new.email) <> lower(old.email)) and exists (select 1 from public.contacts c where lower(c.email) = lower(new.email)) then
      raise exception 'This person is already a client (one person per email).' using errcode = '23505'; end if;
    if tg_op = 'UPDATE' then if old.converted_at is not null and auth.uid() is not null and new.archived_at is not distinct from old.archived_at then
      raise exception 'This lead was converted; edit the client instead.' using errcode = 'P0001'; end if; end if;
    -- Last Name always; Role in Company / State unless an Admin un-required them (CRM Settings)
    if tg_op = 'INSERT' or new.last_name <> old.last_name then if btrim(new.last_name) = '' then raise exception 'Last Name is required.' using errcode = 'P0001'; end if; end if;
    if tg_op = 'INSERT' or new.role_in_company <> old.role_in_company then if new.role_in_company = '' and private.crm_required('roleInCompany') then raise exception 'Role in Company is required.' using errcode = 'P0001'; end if; end if;
    if tg_op = 'INSERT' or new.crm_state <> old.crm_state then if new.crm_state = '' and private.crm_required('state') then raise exception 'State is required.' using errcode = 'P0001'; end if; end if;
    if tg_op = 'INSERT' then if new.status = 'Converted/Current Client' and new.converted_at is null then raise exception 'A new lead cannot start as Converted/Current Client.' using errcode = 'P0001'; end if; end if;
  end if;
  return new; end $$;

create or replace function private.contacts_crm_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.crm_owner_id, new.account_id, new.crm_stage, new.last_contacted_on, new.tags, new.crm_notes, new.crm_lead_id, new.crm_archived_at, new.role_in_company, new.title, new.mobile, new.assistant,
      new.asst_phone, new.agent_split, new.license_no, new.sales_volume_last_year, new.deals_closed_last_year, new.zillow_url, new.crm_street, new.crm_city, new.crm_state, new.crm_zip, new.crm_county,
      new.links, new.lead_source, new.relationship_status, new.custom)
     is distinct from (old.crm_owner_id, old.account_id, old.crm_stage, old.last_contacted_on, old.tags, old.crm_notes, old.crm_lead_id, old.crm_archived_at, old.role_in_company, old.title, old.mobile, old.assistant,
      old.asst_phone, old.agent_split, old.license_no, old.sales_volume_last_year, old.deals_closed_last_year, old.zillow_url, old.crm_street, old.crm_city, old.crm_state, old.crm_zip, old.crm_county,
      old.links, old.lead_source, old.relationship_status, old.custom) then
    if auth.uid() is not null and not private.crm_editor() then raise exception 'You cannot change CRM details.' using errcode = '42501'; end if;
    if new.crm_owner_id is distinct from old.crm_owner_id then new.crm_owner_id := private.crm_owner_check(new.crm_owner_id, old.crm_owner_id, false); end if;
    if new.last_contacted_on > private.office_today() then raise exception 'Last contacted cannot be in the future.' using errcode = 'P0001'; end if;
    if auth.uid() is not null and old.relationship_status is not null then   -- a CRM client keeps the required fields (CRM Settings)
      if new.relationship_status is null and private.crm_required('relationshipStatus') then raise exception 'Relationship Status is required.' using errcode = 'P0001'; end if;
      if new.role_in_company = '' and old.role_in_company <> '' and private.crm_required('roleInCompany') then raise exception 'Role in Company is required.' using errcode = 'P0001'; end if;
      if new.crm_state = '' and old.crm_state <> '' and private.crm_required('state') then raise exception 'State is required.' using errcode = 'P0001'; end if; end if;
  end if;
  return new; end $$;

create or replace function public.crm_create_contact(p jsonb) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := gen_random_uuid(); v_email text := lower(btrim(coalesce(p->>'email', ''))); v_acc uuid := nullif(p->>'accountId', '')::uuid; f record;
begin perform private.crm_need(true);
  if btrim(coalesce(p->>'lastName', '')) = '' then raise exception 'Last Name is required.' using errcode = 'P0001'; end if;
  if coalesce(p->>'roleInCompany', '') = '' and private.crm_required('roleInCompany') then raise exception 'Role in Company is required.' using errcode = 'P0001'; end if;
  if coalesce(p->>'relationshipStatus', '') = '' then
    if private.crm_required('relationshipStatus') then raise exception 'Relationship Status is required.' using errcode = 'P0001'; end if;
    p := p || jsonb_build_object('relationshipStatus', private.crm_first_option('relationshipStatus')); end if;
  if coalesce(p->>'state', '') = '' and private.crm_required('state') then raise exception 'State is required.' using errcode = 'P0001'; end if;
  for f in select id, label from public.crm_custom_fields where entity = 'contact' and archived_at is null and required loop
    if btrim(coalesce(p->'custom'->>f.id::text, '')) = '' then raise exception '% is required.', f.label using errcode = 'P0001'; end if; end loop;
  if v_email <> '' and exists (select 1 from public.contacts where lower(email) = v_email) then raise exception 'A client with this email already exists (one person per email).' using errcode = '23505'; end if;
  if v_email <> '' and exists (select 1 from public.profiles where lower(email) = v_email and status <> 'removed') then raise exception 'A user with this email already exists.' using errcode = '23505'; end if;
  if v_acc is not null and not private.crm_account_visible(v_acc) then raise exception 'Company not found.' using errcode = 'P0002'; end if;
  insert into public.contacts (id, first_name, last_name, email, phone, company, contact_type, created_by, crm_stage, tags, crm_notes, account_id)
    values (v_id, btrim(coalesce(p->>'firstName', '')), btrim(coalesce(p->>'lastName', '')), v_email, coalesce(p->>'phone', ''),
      coalesce(nullif(btrim(coalesce(p->>'company', '')), ''), (select name from public.crm_accounts where id = v_acc), ''), nullif(p->>'contactType', ''), auth.uid(),
      coalesce(nullif(p->>'stage', ''), 'prospect'), coalesce((select array_agg(distinct lower(btrim(t))) from jsonb_array_elements_text(coalesce(p->'tags', '[]'::jsonb)) t where btrim(t) <> ''), '{}'),
      coalesce(p->>'description', p->>'notes', ''), v_acc);
  update public.contacts set crm_owner_id = private.crm_owner_check(nullif(p->>'ownerId', '')::uuid, null, true) where id = v_id;
  perform public.crm_update_contact(v_id, p - 'ownerId' - 'accountId' - 'tags' - 'stage' - 'company' - 'contactType' - 'notes' - 'description');
  return v_id; end $$;
create or replace function public.crm_update_contact(p_id uuid, p jsonb) returns void language plpgsql security definer set search_path = public as $$
declare v_acc uuid;
begin perform private.crm_need(true);
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
    custom = case when p ? 'custom' then custom || (p->'custom') else custom end
  where id = p_id; end $$;

-- client JSON carries the custom values (as 24's, plus custom)
create or replace function private.crm_contact_json(p_id uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', c.id, 'name', btrim(c.first_name || ' ' || c.last_name), 'firstName', c.first_name, 'lastName', c.last_name, 'email', c.email, 'phone', c.phone, 'company', c.company,
    'contactType', c.contact_type, 'hasLogin', c.profile_id is not null, 'ownerId', c.crm_owner_id, 'ownerName', coalesce(private.crm_name(c.crm_owner_id), ''),
    'accountId', c.account_id, 'accountName', coalesce((select name from public.crm_accounts where id = c.account_id), ''), 'stage', c.crm_stage, 'lastContactedOn', c.last_contacted_on,
    'companyName', coalesce((select name from public.crm_accounts where id = c.account_id), c.company),
    'tags', to_jsonb(c.tags), 'notes', c.crm_notes, 'description', c.crm_notes, 'archived', c.crm_archived_at is not null, 'fromLeadId', c.crm_lead_id, 'linked', private.crm_linked(c.id), 'canEdit', private.crm_editor(),
    'leadSource', c.lead_source, 'relationshipStatus', coalesce(c.relationship_status, ''), 'custom', c.custom,
    'salesReps', coalesce((select jsonb_agg(jsonb_build_object('id', l.sales_id, 'name', private.crm_name(l.sales_id))) from public.client_sales_reps l where l.client_id = c.profile_id), '[]'::jsonb),
    'orders', (select count(distinct dp.deal_id) from public.deal_participants dp where dp.contact_id = c.id),
    'volume', coalesce((select sum(d.purchase_price) from public.deals d where d.status <> 'Cancelled' and exists (select 1 from public.deal_participants dp where dp.deal_id = d.id and dp.contact_id = c.id)), 0))
    || private.crm_person_json(to_jsonb(c))
  from public.contacts c where c.id = p_id $$;

-- lead -> client: the client gets the lead's custom values for fields with the same name and type (dropdowns by option name);
-- values the client already has win (as the mock's carryCustom)
create or replace function private.crm_carry_custom() returns trigger language plpgsql security definer set search_path = public as $$
declare lf record; t record; v jsonb; c jsonb; lab text; ov text;
begin
  if new.converted_contact_id is null or old.converted_contact_id is not null then return null; end if;
  select custom into c from public.contacts where id = new.converted_contact_id; c := coalesce(c, '{}');
  for lf in select * from public.crm_custom_fields where entity = 'lead' and archived_at is null loop
    v := new.custom -> lf.id::text; if v is null then continue; end if;
    select * into t from public.crm_custom_fields where entity = 'contact' and archived_at is null and lower(label) = lower(lf.label) and type = lf.type;
    if t.id is null or c ? t.id::text then continue; end if;
    if lf.type = 'dropdown' then lab := private.crm_option_label('cf:' || lf.id::text, v #>> '{}');
      select value into ov from public.crm_picklist_options where list_key = 'cf:' || t.id::text and lower(label) = lower(lab) and not retired;
      if ov is null then continue; end if; v := to_jsonb(ov); end if;
    c := c || jsonb_build_object(t.id::text, v); end loop;
  update public.contacts set custom = c where id = new.converted_contact_id and custom is distinct from c;
  return null; end $$;
drop trigger if exists crm_leads_carry_custom on public.crm_leads;
create trigger crm_leads_carry_custom after update on public.crm_leads for each row execute function private.crm_carry_custom();

-- REPORTS (as 24's): lead sources / statuses grouped by stored value, named by the current label, ordered like the list
create or replace function public.crm_report(p_from date default null, p_to date default null) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin perform private.crm_need();
  if p_from is not null and p_to is not null and p_from > p_to then raise exception '"From" must be on or before "To".' using errcode = 'P0001'; end if;
  with d as (select * from public.deals where private.can_access_deal(id) and (p_from is null or open_date >= p_from) and (p_to is null or open_date <= p_to)),
  g as (
    select distinct 'realtor' grp, c.id::text k, btrim(c.first_name || ' ' || c.last_name) nm, coalesce((select name from public.crm_accounts where id = c.account_id), c.company) co, d.id deal_id, d.status, d.purchase_price
      from d join public.deal_participants dp on dp.deal_id = d.id and dp.role in ('Buyer Agent', 'Listing Agent') join public.contacts c on c.id = dp.contact_id
    union select distinct 'brokerage', coalesce('acc:' || c.account_id::text, case when c.company <> '' then 'co:' || lower(c.company) else 'none' end), coalesce((select name from public.crm_accounts where id = c.account_id), nullif(c.company, ''), '(no company)'), null, d.id, d.status, d.purchase_price
      from d join public.deal_participants dp on dp.deal_id = d.id and dp.role in ('Buyer Agent', 'Listing Agent') join public.contacts c on c.id = dp.contact_id
    union select distinct 'lender', c.id::text, btrim(c.first_name || ' ' || c.last_name), coalesce((select name from public.crm_accounts where id = c.account_id), c.company), d.id, d.status, d.purchase_price
      from d join public.deal_participants dp on dp.deal_id = d.id and dp.role = 'Lender' join public.contacts c on c.id = dp.contact_id
    union select distinct 'lender', 'name:' || lower(d.lender_name), coalesce(nullif(d.lender_contact, ''), d.lender_name), d.lender_name, d.id, d.status, d.purchase_price
      from d where d.lender_name <> '' and not exists (select 1 from public.deal_participants dp where dp.deal_id = d.id and dp.role = 'Lender')
    union select distinct 'sales', s.sales_id::text, private.crm_name(s.sales_id), null, d.id, d.status, d.purchase_price from d join public.deal_sales_people s on s.deal_id = d.id),
  t as (select grp, k, min(nm) nm, min(co) co, count(*) orders, count(*) filter (where status not in ('Closed', 'Cancelled')) open, count(*) filter (where status = 'Closed') closed,
      count(*) filter (where status = 'Cancelled') cancelled, coalesce(sum(purchase_price) filter (where status <> 'Cancelled'), 0) volume from g group by grp, k),
  l as (select * from public.crm_leads where private.crm_owner_ok(owner_id) and archived_at is null and (p_from is null or (created_at at time zone 'America/New_York')::date >= p_from) and (p_to is null or (created_at at time zone 'America/New_York')::date <= p_to))
  select jsonb_build_object('from', p_from, 'to', p_to,
    'totals', (select jsonb_build_object('orders', count(*), 'open', count(*) filter (where status not in ('Closed', 'Cancelled')), 'closed', count(*) filter (where status = 'Closed'), 'cancelled', count(*) filter (where status = 'Cancelled'), 'volume', coalesce(sum(purchase_price) filter (where status <> 'Cancelled'), 0)) from d),
    'byRealtor', coalesce((select jsonb_agg(jsonb_build_object('key', k, 'name', nm, 'company', coalesce(co, ''), 'orders', orders, 'open', open, 'closed', closed, 'cancelled', cancelled, 'volume', volume) order by orders desc, volume desc, nm) from t where grp = 'realtor'), '[]'),
    'byLender', coalesce((select jsonb_agg(jsonb_build_object('key', k, 'name', nm, 'company', coalesce(co, ''), 'orders', orders, 'open', open, 'closed', closed, 'cancelled', cancelled, 'volume', volume) order by orders desc, volume desc, nm) from t where grp = 'lender'), '[]'),
    'byBrokerage', coalesce((select jsonb_agg(jsonb_build_object('key', k, 'name', nm, 'orders', orders, 'open', open, 'closed', closed, 'cancelled', cancelled, 'volume', volume) order by orders desc, volume desc, nm) from t where grp = 'brokerage'), '[]'),
    'bySalesperson', coalesce((select jsonb_agg(jsonb_build_object('key', k, 'name', nm, 'orders', orders, 'open', open, 'closed', closed, 'cancelled', cancelled, 'volume', volume) order by orders desc, volume desc, nm) from t where grp = 'sales'), '[]'),
    'leadsBySource', coalesce((select jsonb_agg(jsonb_build_object('name', case when source = '' then '(none)' else private.crm_option_label('leadSource', source) end, 'value', source, 'leads', n, 'converted', cv) order by n desc, source)
      from (select source, count(*) n, count(*) filter (where converted_at is not null) cv from l group by source) s), '[]'),
    'leadsByStatus', coalesce((select jsonb_agg(jsonb_build_object('name', private.crm_option_label('relationshipStatus', status), 'value', status, 'leads', n, 'converted', cv)
      order by (select position from public.crm_picklist_options o where o.list_key = 'relationshipStatus' and o.value = s.status) nulls last, status)
      from (select status, count(*) n, count(*) filter (where converted_at is not null) cv from l group by status) s), '[]'),
    'leadCount', (select count(*) from l)) into r;
  return r; end $$;

do $g$ declare f text; begin foreach f in array array['crm_settings()', 'crm_create_field(jsonb)', 'crm_create_contact(jsonb)', 'crm_update_contact(uuid, jsonb)', 'crm_report(date, date)'] loop
  execute 'revoke all on function public.' || f || ' from public, anon'; execute 'grant execute on function public.' || f || ' to authenticated'; end loop; end $g$;
