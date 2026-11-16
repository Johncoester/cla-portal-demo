-- Already applied on TEST. Do not apply this file to TEST again.
-- Source: TEST history, supabase_migrations.schema_migrations, project aqcervntopidtcazcmlv.
-- Version 20261105222939, name crm_nov3b.
-- The text below this label is the exact history statement. The label is not part of that text.
-- =====================================================================
-- =====================================================================
-- Migration 30 (John / Janine, Nov 3 b; Zoho videos 7-10). FAKE data only. Re-runnable. Nothing here is ever hard-deleted, and nothing sends email.
--  * video 7: global search (public.crm_search, security invoker: RLS decides what each person finds), recent items / searches,
--    Send Email from a record = a stored row in crm_emails marked "drafted (not sent)" or "scheduled (not sent)"; From = own login email or an alias.
--  * video 8: custom fields: 24 types, tooltip, max characters, no-duplicates, encrypt flag (masked in the app), per-role view / edit permission,
--    layout sections; Client / Lead email (and phone, when on) never duplicated across both modules; required enforced here too.
--  * video 9: dashboards and components (visibility: only me / all users / custom users, roles, departments; lock for shared users; retire, never delete).
--  * video 10: report folders and reports (shared unless restricted), export log (Admin / Super admin only).
-- Limits (documented in docs/CRM.md): per-field VIEW permission is applied by the app (rows are readable as a whole here); EDIT permission is enforced here.
-- "Encrypt" is a flag the app masks on screen; values are stored as plain text in this build.
-- =====================================================================

-- ---------- small helpers ----------
create or replace function private.crm_role_key() returns text language sql stable security definer set search_path = public as $$
  select case when private.is_admin() then 'Admin' else coalesce(private.me_role(), '') end $$;
-- departments are groups of roles (CLA has no department field): Sales = Sales Person + Sales Team, Operations = Processor, Management = Admin + Super admin
create or replace function private.crm_depts_of(p_role text) returns text[] language sql immutable as $$
  select case when p_role in ('Sales Person', 'Sales Team') then array['sales'] when p_role = 'Processor' then array['operations']
    when p_role in ('Admin', 'Super admin') then array['management'] else array[]::text[] end $$;
create or replace function private.crm_no_delete() returns trigger language plpgsql as $$
begin raise exception '% rows are never deleted; retire or hide them instead.', tg_table_name using errcode = 'P0001'; end $$;
-- shared-with lists: {users: [uuid], roles: [text], departments: [text]}
create or replace function private.crm_share_ok(p jsonb) returns boolean language sql immutable as $$
  select p is not null and jsonb_typeof(p) = 'object'
    and coalesce(jsonb_typeof(p -> 'users'), 'array') = 'array' and coalesce(jsonb_typeof(p -> 'roles'), 'array') = 'array' and coalesce(jsonb_typeof(p -> 'departments'), 'array') = 'array'
    and not exists (select 1 from jsonb_array_elements_text(coalesce(p -> 'roles', '[]')) r where r not in ('Sales Person', 'Sales Team', 'Processor', 'Admin'))
    and not exists (select 1 from jsonb_array_elements_text(coalesce(p -> 'departments', '[]')) d where d not in ('sales', 'operations', 'management'))
    and not exists (select 1 from jsonb_array_elements_text(coalesce(p -> 'users', '[]')) u where u !~ '^[0-9a-f-]{36}$') $$;
create or replace function private.crm_shared_with_me(p jsonb) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(p -> 'users', '[]') ? auth.uid()::text or coalesce(p -> 'roles', '[]') ? private.crm_role_key()
    or exists (select 1 from jsonb_array_elements_text(coalesce(p -> 'departments', '[]')) d where d = any (private.crm_depts_of(private.me_role()))) $$;

-- ---------- video 8: layout sections ----------
create table if not exists public.crm_layout_sections (
  entity text not null check (entity in ('lead', 'contact', 'account', 'opportunity')),
  key text not null check (key ~ '^[a-zA-Z][a-zA-Z0-9]{0,40}$'),
  label text not null check (char_length(btrim(label)) between 1 and 60 and label !~ '[[:cntrl:]]' and label = btrim(label)),
  builtin boolean not null default false, position integer not null default 0, hidden boolean not null default false,
  modified_by uuid references public.profiles (id), modified_at timestamptz not null default now(),
  primary key (entity, key), constraint crm_layout_sections_builtin_shown check (not (builtin and hidden)));
create unique index if not exists crm_layout_sections_label_idx on public.crm_layout_sections (entity, lower(label));
insert into public.crm_layout_sections (entity, key, label, builtin, position)
select e, k, case when k = 'info' then case e when 'lead' then 'Leads Information' when 'contact' then 'Clients Information' when 'account' then 'Company details' else 'Opportunity details' end else l end, true, p
from (values ('info', 'Information', 1), ('links', 'Links and Socials', 2), ('salesInfo', 'Sales Info Needed', 3), ('salesNumbers', 'Sales Numbers - Last 12 Months', 4),
  ('openClosedDeals', 'Open and Closed Deals', 5), ('address', 'Address Information', 6), ('description', 'Description Information', 7), ('additional', 'Additional Information', 8)) s(k, l, p)
cross join (values ('lead'), ('contact'), ('account'), ('opportunity')) en(e)
where e in ('lead', 'contact') or (e = 'account' and k in ('info', 'additional')) or (e = 'opportunity' and k = 'info')
on conflict do nothing;
create or replace function private.crm_section_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'Sections are never deleted; hide an added section instead.' using errcode = 'P0001'; end if;
  new.label := btrim(new.label); new.modified_by := coalesce(auth.uid(), new.modified_by); new.modified_at := now();
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.builtin := false; end if;
    if (select count(*) from public.crm_layout_sections where entity = new.entity) >= 30 then raise exception 'At most 30 sections.' using errcode = 'P0001'; end if;
    if new.position = 0 then new.position := coalesce((select max(position) from public.crm_layout_sections where entity = new.entity), 0) + 1; end if;
  else
    if (new.entity, new.key, new.builtin) is distinct from (old.entity, old.key, old.builtin) then raise exception 'A section''s key never changes.' using errcode = 'P0001'; end if;
    if new.hidden and new.builtin then raise exception 'Built-in sections cannot be hidden.' using errcode = '23514'; end if;
    if new.hidden and not old.hidden and exists (select 1 from public.crm_custom_fields where entity = new.entity and section = new.key and archived_at is null) then
      raise exception 'Move the fields out of "%" before hiding it.', old.label using errcode = 'P0001'; end if;
  end if;
  return new; end $$;
drop trigger if exists crm_layout_sections_guard on public.crm_layout_sections;
create trigger crm_layout_sections_guard before insert or update or delete on public.crm_layout_sections for each row execute function private.crm_section_guard();
alter table public.crm_layout_sections enable row level security;
revoke all on public.crm_layout_sections from public, anon, authenticated;
grant select, insert, update on public.crm_layout_sections to authenticated;
drop policy if exists crm_layout_sections_read on public.crm_layout_sections;
create policy crm_layout_sections_read on public.crm_layout_sections for select to authenticated using (private.crm_user());
drop policy if exists crm_layout_sections_insert on public.crm_layout_sections;
create policy crm_layout_sections_insert on public.crm_layout_sections for insert to authenticated with check (private.crm_on() and private.is_admin());
drop policy if exists crm_layout_sections_update on public.crm_layout_sections;
create policy crm_layout_sections_update on public.crm_layout_sections for update to authenticated using (private.crm_on() and private.is_admin()) with check (private.crm_on() and private.is_admin());

-- ---------- video 8: custom field types and properties ----------
alter table public.crm_custom_fields drop constraint if exists crm_custom_fields_type_check;
alter table public.crm_custom_fields add constraint crm_custom_fields_type_check check (type in ('text', 'textarea', 'email', 'phone', 'dropdown', 'multiselect', 'date', 'datetime', 'number',
  'autonumber', 'currency', 'decimal', 'percent', 'longint', 'checkbox', 'url', 'lookup', 'formula', 'user', 'file', 'image', 'rollup', 'radio', 'address'));
alter table public.crm_custom_fields add column if not exists tooltip text not null default '';
alter table public.crm_custom_fields add column if not exists show_tooltip boolean not null default false;
alter table public.crm_custom_fields add column if not exists max_chars integer;
alter table public.crm_custom_fields add column if not exists unique_values boolean not null default false;
alter table public.crm_custom_fields add column if not exists encrypted boolean not null default false;
alter table public.crm_custom_fields add column if not exists perm_view text[];
alter table public.crm_custom_fields add column if not exists perm_edit text[];
alter table public.crm_custom_fields add column if not exists config jsonb not null default '{}';
alter table public.crm_custom_fields add column if not exists default_value jsonb;   -- Set Default Values (video 8): pre-fills new records; checked by the app like a typed value
alter table public.crm_custom_fields drop constraint if exists crm_custom_fields_rules;
alter table public.crm_custom_fields add constraint crm_custom_fields_rules check (not (type in ('checkbox', 'formula', 'rollup', 'autonumber', 'file', 'image') and required)
  and section ~ '^[a-zA-Z][a-zA-Z0-9]{0,40}$' and (entity <> 'opportunity' or (section = 'info' and type not in ('file', 'image'))));
alter table public.crm_custom_fields drop constraint if exists crm_custom_fields_props;
alter table public.crm_custom_fields add constraint crm_custom_fields_props check (char_length(tooltip) <= 255 and tooltip !~ '[[:cntrl:]]'
  and (max_chars is null or (type in ('text', 'textarea', 'email', 'phone', 'url') and max_chars between 1 and case type when 'textarea' then 4000 when 'email' then 200 when 'phone' then 30 when 'url' then 500 else 255 end))
  and (not unique_values or type in ('text', 'email', 'phone', 'number', 'decimal', 'longint', 'currency', 'url'))
  and (not encrypted or type in ('text', 'email', 'phone', 'number', 'decimal', 'longint', 'currency', 'percent', 'date'))
  and (perm_view is null or perm_view <@ array['Sales Person', 'Sales Team', 'Processor']) and (perm_edit is null or perm_edit <@ array['Sales Person', 'Sales Team', 'Processor'])
  and (perm_edit is null or perm_view is null or perm_edit <@ perm_view)
  and jsonb_typeof(config) = 'object'
  and (type <> 'lookup' or coalesce(config ->> 'target', '') in ('contacts', 'leads', 'accounts', 'deals', 'opportunities'))
  and (type <> 'formula' or (char_length(coalesce(config ->> 'expression', '')) between 1 and 500 and coalesce(config ->> 'returnType', 'number') in ('number', 'currency', 'percent')))
  and (type <> 'rollup' or (config ->> 'related' in ('deals', 'tasks', 'meetings', 'calls', 'opportunities', 'contacts') and coalesce(config ->> 'fn', 'count') in ('count', 'sum', 'avg', 'min', 'max')))
  and (type <> 'autonumber' or (jsonb_typeof(config -> 'next') = 'number' and char_length(coalesce(config ->> 'prefix', '')) <= 20 and char_length(coalesce(config ->> 'suffix', '')) <= 20))
  and (type <> 'decimal' or coalesce((config ->> 'decimals')::int, 2) between 0 and 9));
-- the section must exist and be shown (checked on insert or when it moves)
create or replace function private.crm_field_section() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.section is distinct from old.section then
    if not exists (select 1 from public.crm_layout_sections where entity = new.entity and key = new.section and not hidden) then
      raise exception 'Pick a section that exists for this record type.' using errcode = '23514'; end if; end if;
  if new.type in ('formula', 'rollup', 'autonumber') and new.unique_values then raise exception 'A calculated field cannot be unique.' using errcode = '23514'; end if;
  return new; end $$;
drop trigger if exists crm_custom_fields_section on public.crm_custom_fields;
create trigger crm_custom_fields_section before insert or update on public.crm_custom_fields for each row execute function private.crm_field_section();
-- option lists now belong to pick list, multi select and radio button fields (patch 25's guard and option check in place; re-run safe)
do $p$ declare d text; begin
  d := pg_get_functiondef('private.crm_settings_guard()'::regprocedure);
  if position('type = ''dropdown''' in d) > 0 then execute replace(d, 'type = ''dropdown''', 'type in (''dropdown'', ''multiselect'', ''radio'')'); end if;
  d := pg_get_functiondef('private.crm_dropdown_has_options()'::regprocedure);
  if position('new.type = ''dropdown''' in d) > 0 then execute replace(d, 'new.type = ''dropdown''', 'new.type in (''dropdown'', ''multiselect'', ''radio'')'); end if;
end $p$;

-- ---------- custom values: the 24 types, max characters, per-role edit permission, auto numbers (replaces 25's version; same signature) ----------
create or replace function private.crm_custom_in(p_entity text, p_new jsonb, p_old jsonb, p_insert boolean, p_require boolean) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r jsonb; k text; v jsonb; s text; n numeric; f public.crm_custom_fields; o jsonb := coalesce(p_old, '{}'); x text; arr jsonb; part text; m int; ok boolean;
  editor boolean := private.is_admin() or auth.uid() is null;
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
    if f.type in ('formula', 'rollup') then r := r - k; continue; end if;   -- calculated by the app when shown; never stored
    if f.type = 'autonumber' then if p_insert then r := r - k; else r := jsonb_set(r, array[k], coalesce(o -> k, 'null')); if o -> k is null then r := r - k; end if; end if; continue; end if;
    if v is not distinct from o -> k then continue; end if;   -- unchanged (e.g. a retired option)
    -- video 8 Set Permission: a role without Edit cannot change the value (Admin / Super admin always can)
    if not editor and f.perm_edit is not null and not (private.me_role() = any (f.perm_edit)) then
      raise exception 'You cannot change "%".', f.label using errcode = '42501'; end if;
    if jsonb_typeof(v) = 'null' or (jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = '') or (jsonb_typeof(v) = 'array' and jsonb_array_length(v) = 0) then r := r - k; continue; end if;
    if f.type = 'multiselect' then
      if jsonb_typeof(v) <> 'array' then raise exception '% takes a list of options.', f.label using errcode = '23514'; end if;
      arr := '[]';
      for x in select distinct btrim(e) from jsonb_array_elements_text(v) e where btrim(e) <> '' loop
        perform private.crm_list_check('cf:' || f.id::text, x, case when coalesce(o -> k, '[]') ? x then x end, null, false, f.label); arr := arr || to_jsonb(x); end loop;
      r := jsonb_set(r, array[k], arr); continue; end if;
    if f.type = 'address' then
      if jsonb_typeof(v) <> 'object' then raise exception '% takes street, city, state, zip code and country.', f.label using errcode = '23514'; end if;
      arr := '{}';
      for part in select jsonb_object_keys(v) loop
        if part not in ('street', 'city', 'state', 'zip', 'country') then raise exception '% has an unknown part.', f.label using errcode = '23514'; end if;
        x := btrim(v ->> part); if char_length(x) > 120 or x ~ '[[:cntrl:]]' then raise exception '% (%) can be at most 120 characters.', f.label, part using errcode = '23514'; end if;
        if part = 'zip' and x <> '' and x !~ '^[A-Za-z0-9 -]{3,10}$' then raise exception '% (Zip Code) is not valid.', f.label using errcode = '23514'; end if;
        if x <> '' then arr := arr || jsonb_build_object(part, x); end if; end loop;
      if arr = '{}' then r := r - k; else r := jsonb_set(r, array[k], arr); end if; continue; end if;
    if f.type in ('file', 'image') then
      if jsonb_typeof(v) <> 'array' then raise exception '% takes uploaded files.', f.label using errcode = '23514'; end if;
      if exists (select 1 from jsonb_array_elements_text(v) e where e !~ '^[0-9a-f-]{36}$' or not exists (select 1 from public.crm_attachments a where a.id = e::uuid and a.entity = p_entity)) then
        raise exception '% must point at files uploaded to this record.', f.label using errcode = '23514'; end if;
      if f.type = 'image' and exists (select 1 from jsonb_array_elements_text(v) e join public.crm_attachments a on a.id = e::uuid where lower(substring(a.name from '\.([^.]+)$')) not in ('png', 'jpg', 'jpeg', 'gif', 'webp')) then
        raise exception '% takes an image (png, jpg, jpeg, gif, webp).', f.label using errcode = '23514'; end if;
      continue; end if;
    if jsonb_typeof(v) not in ('string', 'number', 'boolean') then raise exception '% has an invalid value.', f.label using errcode = '23514'; end if;
    s := btrim(v #>> '{}');
    if f.max_chars is not null and char_length(s) > f.max_chars then raise exception '% can be at most % characters.', f.label, f.max_chars using errcode = '23514'; end if;
    case f.type
      when 'text' then if char_length(s) > 255 then raise exception '% can be at most 255 characters.', f.label using errcode = '23514'; end if; r := jsonb_set(r, array[k], to_jsonb(s));
      when 'textarea' then if char_length(s) > 4000 then raise exception '% can be at most 4000 characters.', f.label using errcode = '23514'; end if; r := jsonb_set(r, array[k], to_jsonb(s));
      when 'number', 'currency', 'percent', 'decimal' then
        s := regexp_replace(s, case when f.type in ('number', 'decimal') then ',' else '[$,%\s]' end, '', 'g');
        if s !~ '^-?([0-9]+(\.[0-9]*)?|\.[0-9]+)$' then raise exception '% must be a number.', f.label using errcode = '23514'; end if;
        n := s::numeric; if abs(n) > 1e13 then raise exception '% is too large.', f.label using errcode = '23514'; end if;
        if f.type = 'decimal' then n := round(n, coalesce((f.config ->> 'decimals')::int, 2)); elsif f.type <> 'number' then n := round(n, 2); end if; r := jsonb_set(r, array[k], to_jsonb(n));
      when 'longint' then s := replace(s, ',', '');
        if s !~ '^-?[0-9]{1,16}$' or abs(s::numeric) > 9007199254740991 then raise exception '% must be a whole number.', f.label using errcode = '23514'; end if; r := jsonb_set(r, array[k], to_jsonb(s::bigint));
      when 'date' then
        begin if s !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or to_char(to_date(s, 'YYYY-MM-DD'), 'YYYY-MM-DD') <> s then s := 'bad'; end if;
        exception when others then s := 'bad'; end;
        if s = 'bad' then raise exception '% must be a real date (YYYY-MM-DD).', f.label using errcode = '23514'; end if;
        r := jsonb_set(r, array[k], to_jsonb(s));
      when 'datetime' then
        ok := s ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}';
        if ok then begin s := substr(s, 1, 10) || 'T' || substr(s, 12, 5); ok := to_char(to_timestamp(s, 'YYYY-MM-DD"T"HH24:MI'), 'YYYY-MM-DD"T"HH24:MI') = s; exception when others then ok := false; end; end if;
        if not ok then raise exception '% must be a real date and time.', f.label using errcode = '23514'; end if; r := jsonb_set(r, array[k], to_jsonb(s));
      when 'checkbox' then r := jsonb_set(r, array[k], to_jsonb(lower(s) in ('true', '1', 'on', 'yes')));
      when 'dropdown', 'radio' then
        perform private.crm_list_check('cf:' || f.id::text, s, o ->> k, null, false, f.label); r := jsonb_set(r, array[k], to_jsonb(s));
      when 'email' then s := lower(s);
        if char_length(s) > 200 or s !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception '% is not a valid email address.', f.label using errcode = '23514'; end if; r := jsonb_set(r, array[k], to_jsonb(s));
      when 'phone' then s := regexp_replace(s, '\D', '', 'g');
        if char_length(s) <> 10 then raise exception '% must be a 10-digit phone number (xxx-xxx-xxxx).', f.label using errcode = '23514'; end if;
        r := jsonb_set(r, array[k], to_jsonb(substr(s, 1, 3) || '-' || substr(s, 4, 3) || '-' || substr(s, 7)));
      when 'url' then r := jsonb_set(r, array[k], to_jsonb(private.crm_url_in(s)));
      when 'user' then
        if s !~ '^[0-9a-f-]{36}$' or not exists (select 1 from public.profiles p where p.id = s::uuid and p.status = 'active' and p.role in ('Processor', 'Sales Person', 'Sales Team', 'Admin', 'Super admin')) then
          raise exception 'Pick a CLA user for %.', f.label using errcode = '23514'; end if; r := jsonb_set(r, array[k], to_jsonb(s));
      when 'lookup' then
        ok := s ~ '^[0-9a-f-]{36}$';
        if ok then ok := case f.config ->> 'target' when 'contacts' then private.crm_in_pool(s::uuid) when 'leads' then exists (select 1 from public.crm_leads where id = s::uuid)
          when 'accounts' then exists (select 1 from public.crm_accounts where id = s::uuid) when 'opportunities' then exists (select 1 from public.crm_opportunities where id = s::uuid)
          when 'deals' then exists (select 1 from public.deals where id = s::uuid) else false end; end if;
        if not ok then raise exception 'Pick a record from %.', f.label using errcode = '23514'; end if; r := jsonb_set(r, array[k], to_jsonb(s));
      else raise exception '% has an invalid value.', f.label using errcode = '23514';
    end case;
  end loop;
  -- auto numbers: assigned on a new record, never typed
  if p_insert then
    for f in select * from public.crm_custom_fields cf where cf.entity = p_entity and cf.archived_at is null and cf.type = 'autonumber' order by cf.position for update loop
      m := coalesce((f.config ->> 'next')::int, 1);
      r := jsonb_set(r, array[f.id::text], to_jsonb(coalesce(f.config ->> 'prefix', '') || m || coalesce(f.config ->> 'suffix', '')));
      update public.crm_custom_fields set config = jsonb_set(config, '{next}', to_jsonb(m + 1)) where id = f.id; end loop; end if;
  -- required: on a new record (direct writes and the create functions), and a value once set cannot be blanked
  for f in select * from public.crm_custom_fields cf where cf.entity = p_entity and cf.archived_at is null and cf.required loop
    if not (r ? f.id::text) and (p_require or (not p_insert and o ? f.id::text)) then raise exception '% is required.', f.label using errcode = 'P0001'; end if;
  end loop;
  return r; end $$;

-- "Do not allow duplicate values" (per field; phones by digits, text case-insensitive). Checked after crm_custom_in (trigger name sorts after *_zz_settings).
create or replace function private.crm_dup_key(p_type text, v jsonb) returns text language sql immutable as $$
  select case when v is null or jsonb_typeof(v) = 'null' then null when p_type = 'phone' then nullif(regexp_replace(v #>> '{}', '\D', '', 'g'), '')
    when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric::text else nullif(lower(btrim(v #>> '{}')), '') end $$;
create or replace function private.crm_custom_unique() returns trigger language plpgsql security definer set search_path = public as $$
declare f public.crm_custom_fields; ent text := case tg_table_name when 'crm_leads' then 'lead' when 'contacts' then 'contact' when 'crm_accounts' then 'account' else 'opportunity' end; hit uuid; key text;
begin
  for f in select * from public.crm_custom_fields cf where cf.entity = ent and cf.archived_at is null and cf.unique_values loop
    key := private.crm_dup_key(f.type, new.custom -> f.id::text); if key is null then continue; end if;
    if tg_op = 'UPDATE' and private.crm_dup_key(f.type, old.custom -> f.id::text) is not distinct from key then continue; end if;
    execute format('select id from public.%I where id <> $1 and private.crm_dup_key($2, custom -> $3) = $4 limit 1', tg_table_name) into hit using new.id, f.type, f.id::text, key;
    if hit is not null then raise exception '% "%" is already used on another record. Duplicates are not allowed.', f.label, new.custom ->> f.id::text using errcode = '23505'; end if;
  end loop;
  return new; end $$;
do $t$ declare t text; begin foreach t in array array['contacts', 'crm_leads', 'crm_accounts', 'crm_opportunities'] loop
  execute format('drop trigger if exists %I on public.%I', t || '_zzz_unique', t);
  execute format('create trigger %I before insert or update of custom on public.%I for each row execute function private.crm_custom_unique()', t || '_zzz_unique', t);
end loop; end $t$;
-- turning "no duplicates" on is refused while two records already share a value
create or replace function private.crm_unique_on() returns trigger language plpgsql security definer set search_path = public as $$
declare tbl text := case new.entity when 'lead' then 'crm_leads' when 'contact' then 'contacts' when 'account' then 'crm_accounts' else 'crm_opportunities' end; dup boolean;
begin
  if new.unique_values and (tg_op = 'INSERT' or not old.unique_values) then
    execute format('select exists (select 1 from public.%I where private.crm_dup_key($1, custom -> $2) is not null group by private.crm_dup_key($1, custom -> $2) having count(*) > 1)', tbl) into dup using new.type, new.id::text;
    if dup then raise exception 'Two records already hold the same "%"; fix them before turning on Do not allow duplicate values.', new.label using errcode = '23505'; end if; end if;
  return new; end $$;
drop trigger if exists crm_custom_fields_unique_on on public.crm_custom_fields;
create trigger crm_custom_fields_unique_on before insert or update of unique_values on public.crm_custom_fields for each row execute function private.crm_unique_on();
-- a new auto-number field numbers the records that already exist (oldest first)
create or replace function private.crm_autonumber_backfill() returns trigger language plpgsql security definer set search_path = public as $$
declare tbl text := case new.entity when 'lead' then 'crm_leads' when 'contact' then 'contacts' when 'account' then 'crm_accounts' else 'crm_opportunities' end; m int; rid uuid; claims text;
begin
  if new.type <> 'autonumber' then return null; end if;
  m := coalesce((new.config ->> 'next')::int, 1); claims := current_setting('request.jwt.claims', true);
  perform set_config('crm.spawn', '1', true); perform set_config('request.jwt.claims', '', true);   -- system numbering: not a user edit (converted leads are numbered too)
  for rid in execute format('select id from public.%I where not (coalesce(custom, ''{}'') ? $1) order by created_at, id', tbl) using new.id::text loop
    execute format('update public.%I set custom = jsonb_set(coalesce(custom, ''{}''), array[$1], to_jsonb($2::text)) where id = $3', tbl) using new.id::text, coalesce(new.config ->> 'prefix', '') || m || coalesce(new.config ->> 'suffix', ''), rid;
    m := m + 1; end loop;
  perform set_config('crm.spawn', '', true); perform set_config('request.jwt.claims', coalesce(claims, ''), true);
  update public.crm_custom_fields set config = jsonb_set(config, '{next}', to_jsonb(m)) where id = new.id;
  return null; end $$;
drop trigger if exists crm_custom_fields_autonumber on public.crm_custom_fields;
create trigger crm_custom_fields_autonumber after insert on public.crm_custom_fields for each row execute function private.crm_autonumber_backfill();

-- ---------- video 8: Clients and Leads never share an email (always) or a phone (rule on by default) ----------
create table if not exists public.crm_dup_rules (
  key text primary key check (key in ('email', 'phone')), enabled boolean not null default true,
  modified_by uuid references public.profiles (id), modified_at timestamptz not null default now(),
  constraint crm_dup_rules_email_always check (key <> 'email' or enabled));
insert into public.crm_dup_rules (key, enabled) values ('email', true), ('phone', true) on conflict do nothing;
drop trigger if exists crm_dup_rules_no_delete on public.crm_dup_rules;
create trigger crm_dup_rules_no_delete before delete on public.crm_dup_rules for each row execute function private.crm_no_delete();
alter table public.crm_dup_rules enable row level security;
revoke all on public.crm_dup_rules from public, anon, authenticated;
grant select, update on public.crm_dup_rules to authenticated;
drop policy if exists crm_dup_rules_read on public.crm_dup_rules;
create policy crm_dup_rules_read on public.crm_dup_rules for select to authenticated using (private.crm_user());
drop policy if exists crm_dup_rules_update on public.crm_dup_rules;
create policy crm_dup_rules_update on public.crm_dup_rules for update to authenticated using (private.crm_on() and private.is_admin()) with check (private.crm_on() and private.is_admin());
create or replace function private.crm_person_dup() returns trigger language plpgsql security definer set search_path = public as $$
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
  return new; end $$;
-- the CRM's own client functions mark their writes (direct table writes from the app are always checked)
do $p$ declare fn text; d text; begin
  foreach fn in array array['public.crm_create_contact(jsonb)', 'public.crm_update_contact(uuid, jsonb)'] loop
    d := pg_get_functiondef(fn::regprocedure);
    if position('crm.person_write' in d) = 0 then execute regexp_replace(d, '\mbegin\M', 'begin perform set_config(''crm.person_write'', ''1'', true);'); end if; end loop;
end $p$;
drop trigger if exists crm_leads_person_dup on public.crm_leads;
create trigger crm_leads_person_dup before insert or update of email, phone on public.crm_leads for each row execute function private.crm_person_dup();
drop trigger if exists contacts_person_dup on public.contacts;
create trigger contacts_person_dup before insert or update of email, phone on public.contacts for each row execute function private.crm_person_dup();

-- ---------- video 7 Calls: Call Type, Call Start Time, Call Duration ----------
alter table public.crm_activities add column if not exists call_type text;
alter table public.crm_activities add column if not exists call_start timestamptz;
alter table public.crm_activities add column if not exists call_duration integer;
alter table public.crm_activities drop constraint if exists crm_activities_call;
alter table public.crm_activities add constraint crm_activities_call check ((kind = 'call' or (call_type is null and call_start is null and call_duration is null))
  and (call_type is null or call_type in ('Outbound', 'Inbound', 'Missed')) and (call_duration is null or call_duration between 0 and 1440));
create or replace function private.crm_call_guard() returns trigger language plpgsql as $$
begin
  if new.call_start is not null and (tg_op = 'INSERT' or new.call_start is distinct from old.call_start) and new.call_start > now() + interval '5 minutes' then
    raise exception 'Call Start Time cannot be in the future.' using errcode = '23514'; end if;
  return new; end $$;
drop trigger if exists crm_activities_call_guard on public.crm_activities;
create trigger crm_activities_call_guard before insert or update of call_start on public.crm_activities for each row execute function private.crm_call_guard();

-- ---------- video 7: recent items and recent searches (own rows; updated in place, never deleted) ----------
create table if not exists public.crm_recent_items (
  user_id uuid not null references public.profiles (id), module text not null check (module in ('lead', 'contact', 'account', 'opportunity', 'deal')), record_id uuid not null,
  viewed_at timestamptz not null default now(), primary key (user_id, module, record_id));
create table if not exists public.crm_recent_searches (
  user_id uuid not null references public.profiles (id), q text not null check (char_length(btrim(q)) between 1 and 100 and q !~ '[[:cntrl:]]'),
  searched_at timestamptz not null default now(), primary key (user_id, q));
do $t$ declare t text; begin foreach t in array array['crm_recent_items', 'crm_recent_searches'] loop
  execute format('drop trigger if exists %I on public.%I', t || '_no_delete', t);
  execute format('create trigger %I before delete on public.%I for each row execute function private.crm_no_delete()', t || '_no_delete', t);
  execute format('alter table public.%I enable row level security', t);
  execute format('revoke all on public.%I from public, anon, authenticated', t);
  execute format('grant select, insert, update on public.%I to authenticated', t);
  execute format('drop policy if exists %I on public.%I', t || '_own', t);
  execute format('create policy %I on public.%I for all to authenticated using (user_id = auth.uid() and private.crm_user()) with check (user_id = auth.uid() and private.crm_user())', t || '_own', t);
end loop; end $t$;

-- ---------- video 7: Send Email (stored only; nothing is ever sent) ----------
create table if not exists public.crm_email_aliases (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles (id),
  email text not null check (char_length(email) <= 200 and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' and email = lower(email)),
  created_at timestamptz not null default now(), retired_at timestamptz);
create unique index if not exists crm_email_aliases_uq on public.crm_email_aliases (user_id, email);
create or replace function private.crm_alias_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'An alias is never deleted; retire it instead.' using errcode = 'P0001'; end if;
  if tg_op = 'UPDATE' and (new.user_id, new.email) is distinct from (old.user_id, old.email) then raise exception 'Add a new alias instead of changing one.' using errcode = 'P0001'; end if;
  if tg_op = 'INSERT' and (select count(*) from public.crm_email_aliases where user_id = new.user_id and retired_at is null) >= 5 then raise exception 'At most 5 aliases.' using errcode = 'P0001'; end if;
  return new; end $$;
drop trigger if exists crm_email_aliases_guard on public.crm_email_aliases;
create trigger crm_email_aliases_guard before insert or update or delete on public.crm_email_aliases for each row execute function private.crm_alias_guard();
alter table public.crm_email_aliases enable row level security;
revoke all on public.crm_email_aliases from public, anon, authenticated;
grant select, insert, update on public.crm_email_aliases to authenticated;
drop policy if exists crm_email_aliases_own on public.crm_email_aliases;
create policy crm_email_aliases_own on public.crm_email_aliases for all to authenticated using (user_id = auth.uid() and private.crm_user()) with check (user_id = auth.uid() and private.crm_user());

create or replace function private.crm_email_record_visible(p_entity text, p_id uuid) returns boolean language sql stable security definer set search_path = public as $$
  select private.crm_user() and case when p_entity = 'deal' then private.can_access_deal(p_id) else private.crm_entity_visible(p_entity, p_id) end $$;
create or replace function private.crm_emails_ok(a text[]) returns boolean language sql immutable as $$
  select cardinality(a) <= 100 and not exists (select 1 from unnest(a) e where char_length(e) > 200 or e !~ '^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$' or e <> lower(e)) $$;
create table if not exists public.crm_emails (
  id uuid primary key default gen_random_uuid(),
  entity text not null check (entity in ('lead', 'contact', 'account', 'deal')), entity_id uuid not null,
  from_email text not null, to_emails text[] not null check (cardinality(to_emails) between 1 and 50), cc_emails text[] not null default '{}', bcc_emails text[] not null default '{}',
  subject text not null check (char_length(btrim(subject)) between 1 and 250 and subject !~ '[[:cntrl:]]'),
  body_html text not null default '' check (char_length(body_html) <= 200000),
  status text not null check (status in ('drafted', 'scheduled')), scheduled_at timestamptz, template_id uuid references public.crm_email_templates (id),
  created_by uuid not null references public.profiles (id), created_at timestamptz not null default now(),
  constraint crm_emails_schedule check ((status = 'scheduled') = (scheduled_at is not null)),
  constraint crm_emails_addresses check (private.crm_emails_ok(to_emails || cc_emails || bcc_emails)));
create index if not exists crm_emails_entity_idx on public.crm_emails (entity, entity_id);
create or replace function private.crm_emails_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare mine text;
begin
  if tg_op <> 'INSERT' then raise exception 'A saved email is never changed or deleted (and never sent).' using errcode = 'P0001'; end if;
  new.created_by := auth.uid(); new.created_at := now();
  if not private.crm_editor() then raise exception 'The Processor has read-only access to the CRM.' using errcode = '42501'; end if;
  mine := lower((select email from public.profiles where id = auth.uid()));
  if new.from_email is distinct from mine and not exists (select 1 from public.crm_email_aliases where user_id = auth.uid() and email = new.from_email and retired_at is null) then
    raise exception 'Send from your own address or one of your aliases.' using errcode = '42501'; end if;
  if new.status = 'scheduled' and new.scheduled_at <= now() then raise exception 'Pick a time in the future to schedule.' using errcode = '23514'; end if;
  if not private.crm_html_safe(new.body_html) then raise exception 'The email body has content that is not allowed (scripts or event handlers).' using errcode = '23514'; end if;
  if new.template_id is not null and not private.crm_template_visible(new.template_id) then raise exception 'That template is not available.' using errcode = '42501'; end if;
  return new; end $$;
drop trigger if exists crm_emails_guard on public.crm_emails;
create trigger crm_emails_guard before insert or update or delete on public.crm_emails for each row execute function private.crm_emails_guard();
alter table public.crm_emails enable row level security;
revoke all on public.crm_emails from public, anon, authenticated;
grant select, insert on public.crm_emails to authenticated;
drop policy if exists crm_emails_select on public.crm_emails;
create policy crm_emails_select on public.crm_emails for select to authenticated using (private.crm_email_record_visible(entity, entity_id));
drop policy if exists crm_emails_insert on public.crm_emails;
create policy crm_emails_insert on public.crm_emails for insert to authenticated with check (created_by = auth.uid() and private.crm_editor() and private.crm_email_record_visible(entity, entity_id));
-- email attachments and the new deal / opportunity file fields ride in crm_attachments
alter table public.crm_attachments drop constraint if exists crm_attachments_entity_check;
alter table public.crm_attachments add constraint crm_attachments_entity_check check (entity in ('lead', 'contact', 'account', 'template', 'email'));
drop policy if exists crm_att_select_email on public.crm_attachments;
create policy crm_att_select_email on public.crm_attachments for select to authenticated
  using (entity = 'email' and exists (select 1 from public.crm_emails e where e.id = entity_id and private.crm_email_record_visible(e.entity, e.entity_id)));
drop policy if exists crm_att_insert_email on public.crm_attachments;
create policy crm_att_insert_email on public.crm_attachments for insert to authenticated
  with check (entity = 'email' and private.crm_editor() and exists (select 1 from public.crm_emails e where e.id = entity_id and e.created_by = auth.uid()));

-- ---------- video 9: dashboards and components ----------
create table if not exists public.crm_dashboards (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100 and name !~ '[[:cntrl:]]'),
  description text not null default '' check (char_length(description) <= 500),
  builtin boolean not null default false, owner_id uuid references public.profiles (id),
  visibility text not null default 'me' check (visibility in ('me', 'all', 'custom')), share jsonb not null default '{}' check (private.crm_share_ok(share)),
  locked boolean not null default false, filters jsonb not null default '{}' check (jsonb_typeof(filters) = 'object'), position integer not null default 0,
  created_by uuid references public.profiles (id), created_at timestamptz not null default now(), modified_by uuid references public.profiles (id), modified_at timestamptz not null default now(),
  retired_at timestamptz, retired_by uuid references public.profiles (id),
  constraint crm_dashboards_owner check (builtin or owner_id is not null));
create table if not exists public.crm_dash_components (
  id uuid primary key default gen_random_uuid(), dashboard_id uuid not null references public.crm_dashboards (id),
  name text not null check (char_length(btrim(name)) between 1 and 100 and name !~ '[[:cntrl:]]'),
  type text not null check (type in ('chart', 'kpi', 'target', 'funnel')),
  module text not null check (module in ('contacts', 'leads', 'accounts', 'deals', 'tasks', 'meetings', 'calls', 'opportunities')),
  chart_type text check (chart_type is null or chart_type in ('column', 'bar', 'stacked', 'pie', 'doughnut', 'table', 'line', 'area')),
  measure jsonb not null default '{"fn": "count"}' check (jsonb_typeof(measure) = 'object' and coalesce(measure ->> 'fn', 'count') in ('count', 'sum', 'avg')),
  grouping jsonb not null default '{}' check (jsonb_typeof(grouping) = 'object'), criteria jsonb not null default '[]' check (jsonb_typeof(criteria) = 'array' and jsonb_array_length(criteria) <= 10),
  target numeric check (target is null or target >= 0), width smallint not null default 1 check (width between 1 and 3), height smallint not null default 1 check (height between 1 and 2),
  position integer not null default 0,
  created_by uuid references public.profiles (id), created_at timestamptz not null default now(), modified_by uuid references public.profiles (id), modified_at timestamptz not null default now(),
  retired_at timestamptz, constraint crm_dash_components_chart check ((type = 'chart') = (chart_type is not null)));
create index if not exists crm_dash_components_dash_idx on public.crm_dash_components (dashboard_id, position);
create or replace function private.crm_dash_visible(p_id uuid) returns boolean language sql stable security definer set search_path = public as $$
  select private.crm_user() and exists (select 1 from public.crm_dashboards d where d.id = p_id and (d.builtin or d.owner_id = auth.uid() or d.visibility = 'all'
    or (d.visibility = 'custom' and private.crm_shared_with_me(d.share)))) $$;
-- built-ins: Admins. Own: the owner (a Sales role; the Processor is read-only). Shared and not locked: Admins too.
create or replace function private.crm_dash_editable(p_id uuid) returns boolean language sql stable security definer set search_path = public as $$
  select private.crm_editor() and exists (select 1 from public.crm_dashboards d where d.id = p_id and d.retired_at is null
    and ((d.builtin and private.is_admin()) or d.owner_id = auth.uid() or (private.is_admin() and not d.locked and d.visibility <> 'me'))) $$;
create or replace function private.crm_dash_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'Dashboards and components are never deleted; retire them instead.' using errcode = 'P0001'; end if;
  new.modified_by := coalesce(auth.uid(), new.modified_by); new.modified_at := now();
  if tg_table_name = 'crm_dashboards' then
    if tg_op = 'INSERT' then
      if auth.uid() is not null then new.builtin := false; new.owner_id := auth.uid(); new.created_by := auth.uid(); new.retired_at := null; end if;
    else
      if (new.builtin, new.owner_id, new.created_by) is distinct from (old.builtin, old.owner_id, old.created_by) then raise exception 'A dashboard''s owner never changes; clone it instead.' using errcode = 'P0001'; end if;
      if old.retired_at is not null and new.retired_at is not null and new is distinct from old then raise exception 'Restore the dashboard before changing it.' using errcode = 'P0001'; end if;
      if new.retired_at is not null and old.retired_at is null then new.retired_by := auth.uid(); end if;
      if new.builtin and new.retired_at is not null then raise exception 'Built-in dashboards cannot be retired.' using errcode = 'P0001'; end if;
    end if;
  else
    if tg_op = 'INSERT' then new.created_by := coalesce(auth.uid(), new.created_by);
      if auth.uid() is not null and not private.crm_dash_editable(new.dashboard_id) then raise exception 'You cannot change this dashboard.' using errcode = '42501'; end if;
      if (select count(*) from public.crm_dash_components where dashboard_id = new.dashboard_id and retired_at is null) >= 30 then raise exception 'At most 30 components per dashboard.' using errcode = 'P0001'; end if;
    elsif auth.uid() is not null and (not private.crm_dash_editable(old.dashboard_id) or not private.crm_dash_editable(new.dashboard_id)) then
      raise exception 'You cannot change this dashboard.' using errcode = '42501'; end if;
  end if;
  return new; end $$;
do $t$ declare t text; begin foreach t in array array['crm_dashboards', 'crm_dash_components'] loop
  execute format('drop trigger if exists %I on public.%I', t || '_guard', t);
  execute format('create trigger %I before insert or update or delete on public.%I for each row execute function private.crm_dash_guard()', t || '_guard', t);
  execute format('alter table public.%I enable row level security', t);
  execute format('revoke all on public.%I from public, anon, authenticated', t);
  execute format('grant select, insert, update on public.%I to authenticated', t);
end loop; end $t$;
drop policy if exists crm_dashboards_select on public.crm_dashboards;
create policy crm_dashboards_select on public.crm_dashboards for select to authenticated using (private.crm_dash_visible(id));
drop policy if exists crm_dashboards_insert on public.crm_dashboards;
create policy crm_dashboards_insert on public.crm_dashboards for insert to authenticated with check (private.crm_editor() and owner_id = auth.uid() and not builtin);
drop policy if exists crm_dashboards_update on public.crm_dashboards;
create policy crm_dashboards_update on public.crm_dashboards for update to authenticated using (private.crm_dash_visible(id) and (private.crm_dash_editable(id)
  or (retired_at is not null and (owner_id = auth.uid() or private.is_admin()) and private.crm_editor()))) with check (private.crm_editor());
drop policy if exists crm_dash_components_select on public.crm_dash_components;
create policy crm_dash_components_select on public.crm_dash_components for select to authenticated using (private.crm_dash_visible(dashboard_id));
drop policy if exists crm_dash_components_insert on public.crm_dash_components;
create policy crm_dash_components_insert on public.crm_dash_components for insert to authenticated with check (private.crm_dash_editable(dashboard_id));
drop policy if exists crm_dash_components_update on public.crm_dash_components;
create policy crm_dash_components_update on public.crm_dash_components for update to authenticated using (private.crm_dash_editable(dashboard_id)) with check (private.crm_dash_editable(dashboard_id));
-- the four built-in dashboards (fixed ids so a re-run does not duplicate them)
insert into public.crm_dashboards (id, name, description, builtin, visibility, position) values
  ('d0000000-0000-4000-8000-000000000001', 'Lead Dashboards', 'Leads by source, status and month.', true, 'all', 1),
  ('d0000000-0000-4000-8000-000000000002', 'Company and Client Dashboards', 'Clients and companies at a glance.', true, 'all', 2),
  ('d0000000-0000-4000-8000-000000000003', 'Deal Dashboards', 'Deals (the portal''s orders) by stage and month.', true, 'all', 3),
  ('d0000000-0000-4000-8000-000000000004', 'Task Dashboards', 'Open and overdue tasks.', true, 'all', 4)
on conflict (id) do nothing;
insert into public.crm_dash_components (id, dashboard_id, name, type, module, chart_type, measure, grouping, criteria, target, width, position) values
  ('dc000000-0000-4000-8000-000000000011', 'd0000000-0000-4000-8000-000000000001', 'Leads by Lead Source', 'chart', 'leads', 'column', '{"fn": "count"}', '{"field": "leadSource"}', '[{"field": "archived", "op": "is", "value": "no"}]', null, 2, 1),
  ('dc000000-0000-4000-8000-000000000012', 'd0000000-0000-4000-8000-000000000001', 'Open Leads', 'kpi', 'leads', null, '{"fn": "count"}', '{}', '[{"field": "archived", "op": "is", "value": "no"}, {"field": "converted", "op": "is", "value": "no"}]', null, 1, 2),
  ('dc000000-0000-4000-8000-000000000013', 'd0000000-0000-4000-8000-000000000001', 'Leads by Relationship Status', 'chart', 'leads', 'pie', '{"fn": "count"}', '{"field": "relationshipStatus"}', '[{"field": "archived", "op": "is", "value": "no"}]', null, 1, 3),
  ('dc000000-0000-4000-8000-000000000014', 'd0000000-0000-4000-8000-000000000001', 'Leads Created by Month', 'chart', 'leads', 'line', '{"fn": "count"}', '{"field": "createdAt", "bucket": "month"}', '[]', null, 2, 4),
  ('dc000000-0000-4000-8000-000000000021', 'd0000000-0000-4000-8000-000000000002', 'Clients by Relationship Status', 'chart', 'contacts', 'doughnut', '{"fn": "count"}', '{"field": "relationshipStatus"}', '[{"field": "archived", "op": "is", "value": "no"}]', null, 1, 1),
  ('dc000000-0000-4000-8000-000000000022', 'd0000000-0000-4000-8000-000000000002', 'Total Clients', 'kpi', 'contacts', null, '{"fn": "count"}', '{}', '[{"field": "archived", "op": "is", "value": "no"}]', null, 1, 2),
  ('dc000000-0000-4000-8000-000000000023', 'd0000000-0000-4000-8000-000000000002', 'Companies by Type', 'chart', 'accounts', 'bar', '{"fn": "count"}', '{"field": "kind"}', '[{"field": "archived", "op": "is", "value": "no"}]', null, 1, 3),
  ('dc000000-0000-4000-8000-000000000024', 'd0000000-0000-4000-8000-000000000002', 'Clients by Owner', 'chart', 'contacts', 'column', '{"fn": "count"}', '{"field": "ownerId"}', '[{"field": "archived", "op": "is", "value": "no"}]', null, 3, 4),
  ('dc000000-0000-4000-8000-000000000031', 'd0000000-0000-4000-8000-000000000003', 'Deals by Stage', 'funnel', 'deals', null, '{"fn": "count"}', '{"field": "stage"}', '[]', null, 1, 1),
  ('dc000000-0000-4000-8000-000000000032', 'd0000000-0000-4000-8000-000000000003', 'Active Deal Amount', 'kpi', 'deals', null, '{"fn": "sum", "field": "amount"}', '{}', '[{"field": "stage", "op": "is", "value": "Active"}]', null, 1, 2),
  ('dc000000-0000-4000-8000-000000000033', 'd0000000-0000-4000-8000-000000000003', 'Closed Deals This Year', 'target', 'deals', null, '{"fn": "count"}', '{}', '[{"field": "stage", "op": "is", "value": "Closed"}, {"field": "closingDate", "op": "is", "value": "this_year"}]', 50, 1, 3),
  ('dc000000-0000-4000-8000-000000000034', 'd0000000-0000-4000-8000-000000000003', 'Deal Amount by Closing Month', 'chart', 'deals', 'stacked', '{"fn": "sum", "field": "amount"}', '{"field": "closingDate", "bucket": "month", "second": {"field": "stage"}}', '[]', null, 3, 4),
  ('dc000000-0000-4000-8000-000000000041', 'd0000000-0000-4000-8000-000000000004', 'Open Tasks', 'chart', 'tasks', 'column', '{"fn": "count"}', '{"field": "dueDate", "bucket": "day"}', '[{"field": "status", "op": "isnt", "value": "Completed"}]', null, 2, 1),
  ('dc000000-0000-4000-8000-000000000042', 'd0000000-0000-4000-8000-000000000004', 'Overdue Tasks', 'kpi', 'tasks', null, '{"fn": "count"}', '{}', '[{"field": "status", "op": "isnt", "value": "Completed"}, {"field": "dueDate", "op": "before", "value": "today"}]', null, 1, 2),
  ('dc000000-0000-4000-8000-000000000043', 'd0000000-0000-4000-8000-000000000004', 'Tasks by Status', 'chart', 'tasks', 'pie', '{"fn": "count"}', '{"field": "status"}', '[]', null, 1, 3),
  ('dc000000-0000-4000-8000-000000000044', 'd0000000-0000-4000-8000-000000000004', 'Open Tasks by Owner', 'chart', 'tasks', 'stacked', '{"fn": "count"}', '{"field": "ownerId", "second": {"field": "priority"}}', '[{"field": "status", "op": "isnt", "value": "Completed"}]', null, 2, 4),
  ('dc000000-0000-4000-8000-000000000045', 'd0000000-0000-4000-8000-000000000004', 'My Tasks Table', 'chart', 'tasks', 'table', '{"fn": "count"}', '{"field": "status"}', '[]', null, 1, 5)
on conflict (id) do nothing;

-- ---------- video 10: report folders and reports ----------
create table if not exists public.crm_report_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60 and name !~ '[[:cntrl:]]' and name = btrim(name)),
  created_by uuid references public.profiles (id), created_at timestamptz not null default now(), modified_by uuid references public.profiles (id), modified_at timestamptz not null default now());
create unique index if not exists crm_report_folders_name_idx on public.crm_report_folders (lower(name));
insert into public.crm_report_folders (id, name) values
  ('f0000000-0000-4000-8000-000000000001', 'Company and Client Reports'), ('f0000000-0000-4000-8000-000000000002', 'Dashboards'),
  ('f0000000-0000-4000-8000-000000000003', 'Lead Reports'), ('f0000000-0000-4000-8000-000000000004', 'Outside Reports'),
  ('f0000000-0000-4000-8000-000000000005', 'Campaign Reports'), ('f0000000-0000-4000-8000-000000000006', 'Lead and Deal Reports'),
  ('f0000000-0000-4000-8000-000000000007', 'Pipeline Reports')
on conflict do nothing;
create table if not exists public.crm_reports (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120 and name !~ '[[:cntrl:]]'),
  description text not null default '' check (char_length(description) <= 500),
  folder_id uuid references public.crm_report_folders (id), personal_owner uuid references public.profiles (id),
  module text not null check (module in ('contacts', 'leads', 'accounts', 'deals', 'tasks', 'meetings', 'calls')),
  related text[] not null default '{}' check (related <@ array['contacts', 'leads', 'accounts', 'deals', 'tasks', 'meetings', 'calls'] and cardinality(related) <= 3),
  columns jsonb not null default '[]' check (jsonb_typeof(columns) = 'array' and jsonb_array_length(columns) between 1 and 40),
  row_groups jsonb not null default '[]' check (jsonb_typeof(row_groups) = 'array' and jsonb_array_length(row_groups) <= 3),
  aggregates jsonb not null default '[]' check (jsonb_typeof(aggregates) = 'array' and jsonb_array_length(aggregates) <= 10
    and not jsonb_path_exists(aggregates, '$[*] ? (!(@.fn == "sum" || @.fn == "avg" || @.fn == "min" || @.fn == "max" || @.fn == "count"))')),
  filters jsonb not null default '[]' check (jsonb_typeof(filters) = 'array' and jsonb_array_length(filters) <= 20),
  logic text not null default 'and' check (logic in ('and', 'or')), sort jsonb,
  share_mode text not null default 'all' check (share_mode in ('all', 'custom')), share jsonb not null default '{}' check (private.crm_share_ok(share)),
  created_by uuid references public.profiles (id), created_at timestamptz not null default now(), modified_by uuid references public.profiles (id), modified_at timestamptz not null default now(),
  last_accessed_at timestamptz, retired_at timestamptz, retired_by uuid references public.profiles (id),
  constraint crm_reports_one_folder check ((folder_id is null) <> (personal_owner is null)),
  constraint crm_reports_related_not_primary check (not (module = any (related))));
create or replace function private.crm_report_visible(p_id uuid) returns boolean language sql stable security definer set search_path = public as $$
  select private.crm_user() and exists (select 1 from public.crm_reports r where r.id = p_id and (r.created_by = auth.uid() or r.personal_owner = auth.uid() or private.is_admin()
    or (r.personal_owner is null and (r.share_mode = 'all' or private.crm_shared_with_me(r.share))))) $$;
create or replace function private.crm_report_editable(p_id uuid) returns boolean language sql stable security definer set search_path = public as $$
  select private.crm_editor() and exists (select 1 from public.crm_reports r where r.id = p_id and (r.created_by = auth.uid() or r.personal_owner = auth.uid()
    or (private.is_admin() and r.personal_owner is null))) $$;
create or replace function private.crm_report_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception '% rows are never deleted; retire them instead.', tg_table_name using errcode = 'P0001'; end if;
  if tg_op = 'UPDATE' and coalesce(current_setting('crm.spawn', true), '') = '1' then return new; end if;   -- crm_report_touch: Last Accessed Date only
  new.modified_by := coalesce(auth.uid(), new.modified_by); new.modified_at := now();
  if tg_table_name = 'crm_report_folders' then
    new.name := btrim(new.name); if tg_op = 'INSERT' then new.created_by := coalesce(auth.uid(), new.created_by); end if; return new; end if;
  if tg_op = 'INSERT' then new.created_by := coalesce(auth.uid(), new.created_by); new.created_at := now(); new.retired_at := null;
    if auth.uid() is not null and new.personal_owner is not null and new.personal_owner <> auth.uid() then raise exception 'Save into your own folder or a shared one.' using errcode = '42501'; end if;
  else
    if new.created_by is distinct from old.created_by then raise exception 'A report''s creator never changes; clone it instead.' using errcode = 'P0001'; end if;
    if new.module is distinct from old.module then raise exception 'A report''s primary module never changes; create a new report instead.' using errcode = 'P0001'; end if;
    if auth.uid() is not null and new.personal_owner is not null and new.personal_owner is distinct from old.personal_owner and new.personal_owner <> auth.uid() then
      raise exception 'Save into your own folder or a shared one.' using errcode = '42501'; end if;
    if new.retired_at is not null and old.retired_at is null then new.retired_by := auth.uid(); end if;
  end if;
  return new; end $$;
do $t$ declare t text; begin foreach t in array array['crm_report_folders', 'crm_reports'] loop
  execute format('drop trigger if exists %I on public.%I', t || '_guard', t);
  execute format('create trigger %I before insert or update or delete on public.%I for each row execute function private.crm_report_guard()', t || '_guard', t);
  execute format('alter table public.%I enable row level security', t);
  execute format('revoke all on public.%I from public, anon, authenticated', t);
  execute format('grant select, insert, update on public.%I to authenticated', t);
end loop; end $t$;
drop policy if exists crm_report_folders_read on public.crm_report_folders;
create policy crm_report_folders_read on public.crm_report_folders for select to authenticated using (private.crm_user());
drop policy if exists crm_report_folders_insert on public.crm_report_folders;
create policy crm_report_folders_insert on public.crm_report_folders for insert to authenticated with check (private.crm_on() and private.is_admin());
drop policy if exists crm_report_folders_update on public.crm_report_folders;
create policy crm_report_folders_update on public.crm_report_folders for update to authenticated using (private.crm_on() and private.is_admin()) with check (private.crm_on() and private.is_admin());
drop policy if exists crm_reports_select on public.crm_reports;
create policy crm_reports_select on public.crm_reports for select to authenticated using (private.crm_report_visible(id));
drop policy if exists crm_reports_insert on public.crm_reports;
create policy crm_reports_insert on public.crm_reports for insert to authenticated with check (private.crm_editor() and created_by = auth.uid());
drop policy if exists crm_reports_update on public.crm_reports;
create policy crm_reports_update on public.crm_reports for update to authenticated using (private.crm_report_editable(id)) with check (private.crm_editor());
insert into public.crm_reports (id, name, description, folder_id, module, columns, row_groups, aggregates, filters) values
  ('e0000000-0000-4000-8000-000000000001', 'FL Clients', 'Clients whose mailing state is Florida (fake sample, video 10).', 'f0000000-0000-4000-8000-000000000001', 'contacts',
    '["name","companyName","email","phone","relationshipStatus","state"]', '["ownerId"]', '[]', '[{"field":"state","op":"is","value":"FL"}]'),
  ('e0000000-0000-4000-8000-000000000002', 'MD Clients', 'Clients in Maryland, grouped by Client Owner.', 'f0000000-0000-4000-8000-000000000001', 'contacts',
    '["name","companyName","email","phone","relationshipStatus"]', '["ownerId"]', '[]', '[{"field":"state","op":"is","value":"MD"}]'),
  ('e0000000-0000-4000-8000-000000000003', 'Closed Deals Last Month', 'Deals closed in the previous month, grouped by Deal Owner (video 10 example).', 'f0000000-0000-4000-8000-000000000006', 'deals',
    '["fileNumber","name","clientName","propertyAddress","amount"]', '["ownerId"]', '[{"field":"amount","fn":"sum"}]', '[{"field":"closingDate","op":"is","value":"prev_month"},{"field":"stage","op":"is","value":"Closed"}]'),
  ('e0000000-0000-4000-8000-000000000004', 'Leads by Lead Source', 'Every lead, grouped by Lead Source.', 'f0000000-0000-4000-8000-000000000003', 'leads',
    '["name","company","email","relationshipStatus","ownerId"]', '["leadSource"]', '[]', '[]'),
  ('e0000000-0000-4000-8000-000000000005', 'Open Tasks by Owner', 'Tasks that are not Completed.', 'f0000000-0000-4000-8000-000000000007', 'tasks',
    '["subject","dueDate","status","priority","relatedTo","contactName"]', '["ownerId"]', '[]', '[{"field":"status","op":"isnt","value":"Completed"}]')
on conflict (id) do nothing;
-- Last Accessed Date (the app runs the report, then stamps it; anyone who can see it)
create or replace function public.crm_report_touch(p_report uuid) returns void language plpgsql security definer set search_path = public as $$
begin perform private.crm_need();
  if not private.crm_report_visible(p_report) then raise exception 'That report does not exist.' using errcode = 'P0002'; end if;
  perform set_config('crm.spawn', '1', true);
  update public.crm_reports set last_accessed_at = now() where id = p_report;
  perform set_config('crm.spawn', '', true); end $$;
-- Export CSV: Admin / Super admin only; every export is logged (the CSV itself is built by the app from rows the person can read)
create table if not exists public.crm_report_exports (
  id uuid primary key default gen_random_uuid(), report_id uuid not null references public.crm_reports (id), exported_by uuid not null references public.profiles (id),
  exported_at timestamptz not null default now(), row_count integer not null default 0 check (row_count >= 0));
drop trigger if exists crm_report_exports_no_change on public.crm_report_exports;
create or replace function private.crm_log_only() returns trigger language plpgsql as $$
begin raise exception 'The export log is never changed or deleted.' using errcode = 'P0001'; end $$;
create trigger crm_report_exports_no_change before update or delete on public.crm_report_exports for each row execute function private.crm_log_only();
alter table public.crm_report_exports enable row level security;
revoke all on public.crm_report_exports from public, anon, authenticated;
grant select on public.crm_report_exports to authenticated;
drop policy if exists crm_report_exports_read on public.crm_report_exports;
create policy crm_report_exports_read on public.crm_report_exports for select to authenticated using (private.crm_on() and private.is_admin());
create or replace function public.crm_report_export(p_report uuid, p_rows integer default 0) returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin perform private.crm_need();
  if not private.is_admin() then raise exception 'Only an Admin or Super admin can export a report.' using errcode = '42501'; end if;
  if not private.crm_report_visible(p_report) then raise exception 'That report does not exist.' using errcode = 'P0002'; end if;
  insert into public.crm_report_exports (report_id, exported_by, row_count) values (p_report, auth.uid(), greatest(coalesce(p_rows, 0), 0)) returning id into v;
  return v; end $$;
revoke all on function public.crm_report_export(uuid, integer) from public, anon;
grant execute on function public.crm_report_export(uuid, integer) to authenticated;
revoke all on function public.crm_report_touch(uuid) from public, anon;
grant execute on function public.crm_report_touch(uuid) to authenticated;

-- ---------- video 7: global search. SECURITY INVOKER: every table's own RLS decides what each person finds (plus the CRM contact rule).
-- Matches a name, email or phone (phone on digits only). Returns {module: [rows]} with the Zoho columns of each group. ----------
create or replace function private.crm_related_name(p_entity text, p_id uuid) returns text language sql stable security definer set search_path = public as $$
  select case p_entity when 'lead' then (select btrim(first_name || ' ' || last_name) from public.crm_leads where id = p_id)
    when 'contact' then (select btrim(first_name || ' ' || last_name) from public.contacts where id = p_id)
    when 'account' then (select name from public.crm_accounts where id = p_id) when 'opportunity' then (select name from public.crm_opportunities where id = p_id) end $$;
create or replace function public.crm_search(p_q text, p_module text default null, p_limit integer default 5) returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare q text := btrim(coalesce(p_q, '')); d text; lim int := least(greatest(coalesce(p_limit, 5), 1), 100); pat text; out jsonb := '{}';
begin
  perform private.crm_need();
  if char_length(q) < 2 then return out; end if;
  if char_length(q) > 100 then raise exception 'Search for at most 100 characters.' using errcode = '22023'; end if;
  if p_module is not null and p_module not in ('contacts', 'leads', 'accounts', 'deals', 'tasks', 'meetings', 'calls') then raise exception 'Unknown module.' using errcode = '22023'; end if;
  d := regexp_replace(q, '\D', '', 'g'); if char_length(d) < 3 or q ~ '[^0-9()+. -]' then d := null; end if;   -- a phone search: digits and phone punctuation only
  pat := '%' || replace(replace(replace(lower(q), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  if p_module is null or p_module = 'contacts' then
    out := out || jsonb_build_object('contacts', coalesce((select jsonb_agg(x) from (select jsonb_build_object('id', c.id, 'name', btrim(c.first_name || ' ' || c.last_name), 'email', c.email, 'phone', c.phone,
        'createdBy', private.crm_name(c.created_by), 'ownerName', private.crm_name(c.crm_owner_id)) x
      from public.contacts c where private.crm_contact_visible(c.id) and (lower(btrim(c.first_name || ' ' || c.last_name)) like pat or lower(c.email) like pat or (d is not null and regexp_replace(c.phone, '\D', '', 'g') like '%' || d || '%'))
      order by c.last_name, c.first_name limit lim) s), '[]')); end if;
  if p_module is null or p_module = 'leads' then
    out := out || jsonb_build_object('leads', coalesce((select jsonb_agg(x) from (select jsonb_build_object('id', l.id, 'name', btrim(l.first_name || ' ' || l.last_name), 'email', l.email, 'phone', l.phone, 'company', l.company,
        'ownerName', private.crm_name(l.owner_id)) x
      from public.crm_leads l where (lower(btrim(l.first_name || ' ' || l.last_name)) like pat or lower(l.email) like pat or lower(l.company) like pat or (d is not null and regexp_replace(l.phone, '\D', '', 'g') like '%' || d || '%'))
      order by l.last_name, l.first_name limit lim) s), '[]')); end if;
  if p_module is null or p_module = 'accounts' then
    out := out || jsonb_build_object('accounts', coalesce((select jsonb_agg(x) from (select jsonb_build_object('id', a.id, 'name', a.name, 'phone', a.phone, 'ownerName', private.crm_name(a.owner_id)) x
      from public.crm_accounts a where (lower(a.name) like pat or (d is not null and regexp_replace(a.phone, '\D', '', 'g') like '%' || d || '%')) order by a.name limit lim) s), '[]')); end if;
  if p_module is null or p_module = 'deals' then
    out := out || jsonb_build_object('deals', coalesce((select jsonb_agg(x) from (select jsonb_build_object('id', g.id, 'name', g.file_number || ' ' || g.street, 'amount', coalesce(g.purchase_price, g.loan_amount),
        'stage', case g.status when 'Open' then 'Active' else g.status end, 'closingDate', g.closing_date,
        'clientName', (select string_agg(btrim(c.first_name || ' ' || c.last_name), ', ') from public.deal_participants p join public.contacts c on c.id = p.contact_id where p.deal_id = g.id and p.role in ('Client-Buyer', 'Client-Seller'))) x
      from public.deals g where (lower(g.file_number || ' ' || g.street || ' ' || g.city) like pat
        or exists (select 1 from public.deal_participants p join public.contacts c on c.id = p.contact_id where p.deal_id = g.id
          and (lower(btrim(c.first_name || ' ' || c.last_name)) like pat or lower(c.email) like pat or (d is not null and regexp_replace(c.phone, '\D', '', 'g') like '%' || d || '%'))))
      order by g.created_at desc limit lim) s), '[]')); end if;
  if p_module is null or p_module in ('tasks', 'meetings', 'calls') then
    out := out || coalesce((select jsonb_object_agg(m, rows) from (select m, coalesce((select jsonb_agg(x) from (select jsonb_build_object('id', a.id, 'subject', a.subject, 'dueDate', a.due_date, 'status', a.status, 'priority', a.priority,
          'from', a.starts_at, 'to', a.ends_at, 'callType', a.call_type, 'callStart', a.call_start, 'callDuration', a.call_duration,
          'relatedTo', private.crm_related_name(a.entity, a.entity_id), 'entity', a.entity, 'entityId', a.entity_id) x
        from public.crm_activities a where a.kind = case m when 'tasks' then 'task' when 'meetings' then 'meeting' else 'call' end
          and (lower(a.subject) like pat or lower(coalesce(private.crm_related_name(a.entity, a.entity_id), '')) like pat) order by a.created_at desc limit lim) s), '[]') rows
      from unnest(array['tasks', 'meetings', 'calls']) m where p_module is null or p_module = m) z), '{}'); end if;
  return out; end $$;
revoke all on function public.crm_search(text, text, integer) from public, anon;
grant execute on function public.crm_search(text, text, integer) to authenticated;
