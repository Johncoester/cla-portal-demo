-- Hosted CRM CSV import. Not applied by this commit.
-- One transaction. lock_timeout 3s.
--
-- The 2026-11-09 TEST export (test_crm_schema_export_410f.sql) lists
-- crm_accounts, crm_activities, crm_attachments, crm_emails, crm_leads,
-- and crm_opportunities. It does not list crm_imports or a row table
-- (that export only included the tables it was asked for). The hosted
-- screen already reads public.crm_imports, so this file refuses if that
-- table, its primary key, or the columns the log needs are missing or
-- the wrong type. It adds the count / defaults columns only when they
-- are absent, and it creates public.crm_import_rows only when absent.
--
-- public.crm_import_batch checks private.is_admin() once, then inserts
-- every row in this same transaction. Leads go through crm_leads, so
-- crm_row_guard, crm_owner_check, crm_person_dup, and crm_settings_row
-- still run. Clients go through the existing public.crm_create_contact(p jsonb).
-- Notes go through crm_activities, so crm_row_guard still runs.
-- A preview raises P0004 after those inserts. That rolls the transaction
-- back, so nothing is saved, and the row results travel in the error detail.
-- No session_replication_role change, no new RLS policy, and no change to
-- private.* helpers or to deals, tasks, or profiles policies.

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public, extensions;

do $pre$
declare
  cols text;
  typ text;
  extra text;
  marker text := 'crm-hosted-import 20261109231000';
begin
  if to_regclass('public.crm_imports') is null then
    raise exception 'drift: public.crm_imports is missing';
  end if;
  select string_agg(column_name || ' ' || data_type, ', ' order by ordinal_position)
    into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'crm_imports';

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.crm_imports'::regclass and contype = 'p'
  ) then
    raise exception 'drift: public.crm_imports has no primary key. Columns: %', cols;
  end if;

  select data_type, column_default into typ, extra
  from information_schema.columns
  where table_schema = 'public' and table_name = 'crm_imports' and column_name = 'id';
  if typ is distinct from 'uuid' or extra is null then
    raise exception 'drift: public.crm_imports.id must be a uuid with a default. Columns: %', cols;
  end if;

  perform 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'crm_imports' and column_name = 'module'
    and data_type in ('text', 'character varying');
  if not found then raise exception 'drift: public.crm_imports.module text is missing. Columns: %', cols; end if;
  perform 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'crm_imports' and column_name = 'kind'
    and data_type in ('text', 'character varying');
  if not found then raise exception 'drift: public.crm_imports.kind text is missing. Columns: %', cols; end if;
  perform 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'crm_imports' and column_name = 'file_name'
    and data_type in ('text', 'character varying');
  if not found then raise exception 'drift: public.crm_imports.file_name text is missing. Columns: %', cols; end if;
  perform 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'crm_imports' and column_name = 'created_by' and data_type = 'uuid';
  if not found then raise exception 'drift: public.crm_imports.created_by uuid is missing. Columns: %', cols; end if;
  perform 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'crm_imports' and column_name = 'created_at'
    and data_type = 'timestamp with time zone';
  if not found then raise exception 'drift: public.crm_imports.created_at timestamptz is missing. Columns: %', cols; end if;

  foreach extra in array ARRAY['created', 'duplicates', 'errors']::text[] loop
    select data_type into typ from information_schema.columns
    where table_schema = 'public' and table_name = 'crm_imports' and column_name = extra;
    if typ is null then
      execute format('alter table public.crm_imports add column %I integer not null default 0', extra);
      execute format('comment on column public.crm_imports.%I is %L', extra, marker);
    elsif typ not in ('integer', 'bigint', 'smallint') then
      raise exception 'drift: public.crm_imports.% is %, expected an integer count. Columns: %', extra, typ, cols;
    end if;
  end loop;

  select data_type into typ from information_schema.columns
  where table_schema = 'public' and table_name = 'crm_imports' and column_name = 'defaults';
  if typ is null then
    alter table public.crm_imports add column defaults jsonb not null default '[]'::jsonb;
    comment on column public.crm_imports.defaults is 'crm-hosted-import 20261109231000';
  elsif typ is distinct from 'jsonb' then
    raise exception 'drift: public.crm_imports.defaults is %, expected jsonb. Columns: %', typ, cols;
  end if;

  select string_agg(column_name, ', ' order by column_name) into extra
  from information_schema.columns
  where table_schema = 'public' and table_name = 'crm_imports'
    and is_nullable = 'NO' and column_default is null
    and column_name not in ('module', 'kind', 'file_name', 'created_by', 'created', 'duplicates', 'errors', 'defaults');
  if extra is not null then
    raise exception 'drift: public.crm_imports has required columns this import does not fill: %', extra;
  end if;

  if to_regprocedure('public.crm_create_contact(jsonb)') is null
     or not exists (
       select 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'crm_create_contact'
         and pg_get_function_identity_arguments(p.oid) = 'p jsonb'
         and pg_get_function_result(p.oid) = 'uuid'
     ) then
    raise exception 'drift: public.crm_create_contact(p jsonb) returns uuid is missing';
  end if;

  if to_regclass('public.crm_import_rows') is null then
    create table public.crm_import_rows (
      import_id uuid not null references public.crm_imports(id),
      line integer not null,
      status text not null,
      message text not null default ''::text,
      record_id uuid,
      record_name text not null default ''::text,
      constraint crm_import_rows_pkey primary key (import_id, line),
      constraint crm_import_rows_line_check check (line > 0),
      constraint crm_import_rows_status_check check (status = any (array['ok'::text, 'duplicate'::text, 'error'::text]))
    );
    comment on table public.crm_import_rows is 'crm-hosted-import 20261109231000';
    alter table public.crm_import_rows enable row level security;
    revoke all on table public.crm_import_rows from public;
    if exists (select 1 from pg_roles where rolname = 'anon') then
      revoke all on table public.crm_import_rows from anon;
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      revoke all on table public.crm_import_rows from authenticated;
    end if;
  else
    foreach extra in array ARRAY['import_id', 'line', 'status', 'message', 'record_id', 'record_name']::text[] loop
      perform 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'crm_import_rows' and column_name = extra;
      if not found then
        raise exception 'drift: public.crm_import_rows.% is missing', extra;
      end if;
    end loop;
    select data_type into typ from information_schema.columns
    where table_schema = 'public' and table_name = 'crm_import_rows' and column_name = 'import_id';
    if typ is distinct from 'uuid' then
      raise exception 'drift: public.crm_import_rows.import_id is %, expected uuid', typ;
    end if;
    select data_type into typ from information_schema.columns
    where table_schema = 'public' and table_name = 'crm_import_rows' and column_name = 'line';
    if typ not in ('integer', 'bigint', 'smallint') then
      raise exception 'drift: public.crm_import_rows.line is %, expected integer', typ;
    end if;
  end if;
end
$pre$;

create or replace function public.crm_import_batch(
  p_commit boolean,
  p_module text,
  p_kind text,
  p_file_name text,
  p_defaults jsonb,
  p_rows jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $fn$
declare
  v_uid uuid;
  v_n int;
  v_row jsonb;
  v_rec jsonb;
  v_def jsonb;
  v_field text;
  v_val text;
  v_list text;
  v_line int;
  v_notes jsonb;
  v_first text;
  v_last text;
  v_email text;
  v_phone text;
  v_mobile text;
  v_company text;
  v_role text;
  v_title text;
  v_source text;
  v_status text;
  v_street text;
  v_city text;
  v_state text;
  v_zip text;
  v_county text;
  v_license text;
  v_desc text;
  v_owner uuid;
  v_owner_text text;
  v_account uuid;
  v_acc_name text;
  v_acc_archived timestamptz;
  v_links jsonb;
  v_new uuid;
  v_name text;
  v_link text;
  v_entity text;
  v_body text;
  v_subject text;
  v_em text;
  v_nm text;
  v_hits int;
  v_arch boolean;
  v_msg text;
  v_state_code text;
  v_out_rows jsonb := '[]'::jsonb;
  v_ok int := 0;
  v_dup int := 0;
  v_err int := 0;
  v_total int := 0;
  v_import uuid;
  v_result jsonb;
  v_row_status text;
begin
  -- once per call, before any row is touched
  if coalesce(private.is_admin(), false) is not true then
    raise exception 'Only an Admin or Super admin can import.' using errcode = '42501';
  end if;
  v_uid := private.effective_uid();
  if p_module is distinct from 'leads' and p_module is distinct from 'contacts' then
    raise exception 'Import into Leads or Clients.' using errcode = 'P0001';
  end if;
  if p_kind is distinct from 'records' and p_kind is distinct from 'notes' then
    raise exception 'Import records or notes.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) is null or jsonb_array_length(p_rows) < 1 then
    raise exception 'The file needs a header row and at least one row of data.' using errcode = 'P0001';
  end if;
  v_n := jsonb_array_length(p_rows);
  if v_n > 2000 then
    raise exception 'At most 2000 rows per import.' using errcode = 'P0001';
  end if;
  if (select count(distinct (value->>'line')::int) from jsonb_array_elements(p_rows)) is distinct from v_n then
    raise exception 'Each import row needs its own line number.' using errcode = 'P0001';
  end if;
  if p_defaults is null or jsonb_typeof(p_defaults) = 'null' then
    p_defaults := '[]'::jsonb;
  elsif jsonb_typeof(p_defaults) is distinct from 'array' then
    raise exception 'Defaults must be a list.' using errcode = 'P0001';
  end if;
  if p_kind = 'records' then
    for v_def in select value from jsonb_array_elements(p_defaults) loop
      v_field := btrim(coalesce(v_def->>'field', ''));
      v_val := btrim(coalesce(v_def->>'value', ''));
      if v_field not in ('ownerId', 'roleInCompany', 'relationshipStatus', 'leadSource', 'state') then
        raise exception '"%" cannot have a default value.', v_field using errcode = 'P0001';
      end if;
      if v_val = '' then continue; end if;
      if v_field = 'ownerId' then
        if v_val !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           or not exists (
             select 1 from public.profiles
             where id = v_val::uuid and status = 'active' and role in ('Sales Person', 'Sales Team')
           ) then
          raise exception 'The default Owner must be an active Sales Person or Sales Team user.' using errcode = 'P0001';
        end if;
      elsif v_field = 'state' then
        if not private.us_state_ok(upper(v_val)) then
          raise exception 'Pick a state for the default State.' using errcode = 'P0001';
        end if;
      elsif v_field = 'relationshipStatus' then
        v_list := case when p_module = 'leads' then 'leadRelationshipStatus' else 'relationshipStatus' end;
        if not private.crm_option_active(v_list, v_val) then
          raise exception 'A default Relationship Status must be a current choice. Retired choices stay on records that already have them and can still arrive in the file.' using errcode = 'P0001';
        end if;
      else
        v_list := v_field;
        if not private.crm_option_active(v_list, v_val) then
          if exists (select 1 from public.crm_picklist_options where list_key = v_list and value = v_val) then
            raise exception '"%" is retired; pick another %.', private.crm_option_label(v_list, v_val),
              case when v_field = 'roleInCompany' then 'Role in Company' else 'Lead Source' end using errcode = 'P0001';
          end if;
          raise exception 'Pick a % from the list.', case when v_field = 'roleInCompany' then 'Role in Company' else 'Lead Source' end using errcode = 'P0001';
        end if;
      end if;
    end loop;
  end if;

  -- client duplicate checks run only when the CRM itself is writing
  perform set_config('crm.person_write', '1', true);

  -- rows (private.is_admin already ran once above; nothing in this loop calls it)
  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_total := v_total + 1;
    v_line := (v_row->>'line')::int;
    v_notes := case when jsonb_typeof(v_row->'prepNotes') = 'array' then v_row->'prepNotes' else '[]'::jsonb end;
    v_rec := coalesce(v_row->'values', '{}'::jsonb);
    v_new := null; v_name := null; v_link := null; v_owner := null; v_account := null;
    begin
      if p_kind = 'records' then
        for v_def in select value from jsonb_array_elements(p_defaults) loop
          v_field := v_def->>'field';
          v_val := btrim(coalesce(v_def->>'value', ''));
          if v_val = '' or btrim(coalesce(v_rec->>v_field, '')) <> '' then continue; end if;
          if v_field = 'state' then v_val := upper(v_val); end if;
          v_rec := jsonb_set(v_rec, array[v_field], to_jsonb(v_val), true);
          if v_field = 'ownerId' then
            v_notes := v_notes || jsonb_build_array('Owner: ' || coalesce(private.crm_name(v_val::uuid), v_val) || ' (default)');
          else
            v_notes := v_notes || jsonb_build_array(
              (case v_field when 'roleInCompany' then 'Role in Company' when 'relationshipStatus' then 'Relationship Status'
                when 'leadSource' then 'Lead Source' when 'state' then 'State' else v_field end)
              || ': ' || v_val || ' (default)');
          end if;
        end loop;
        v_first := left(btrim(coalesce(v_rec->>'firstName', '')), 80);
        v_last := left(btrim(coalesce(v_rec->>'lastName', '')), 80);
        v_email := left(lower(btrim(coalesce(v_rec->>'email', ''))), 200);
        v_phone := left(btrim(coalesce(v_rec->>'phone', '')), 40);
        v_mobile := left(btrim(coalesce(v_rec->>'mobile', '')), 40);
        v_company := left(btrim(coalesce(v_rec->>'company', '')), 160);
        v_role := left(btrim(coalesce(v_rec->>'roleInCompany', '')), 80);
        v_title := left(btrim(coalesce(v_rec->>'title', '')), 100);
        v_source := left(btrim(coalesce(v_rec->>'leadSource', '')), 80);
        v_status := left(btrim(coalesce(v_rec->>'relationshipStatus', '')), 80);
        v_street := left(btrim(coalesce(v_rec->>'street', '')), 200);
        v_city := left(btrim(coalesce(v_rec->>'city', '')), 80);
        v_state := upper(left(btrim(coalesce(v_rec->>'state', '')), 2));
        if length(btrim(coalesce(v_rec->>'state', ''))) > 2 then v_state := left(btrim(v_rec->>'state'), 40); end if;
        v_zip := left(btrim(coalesce(v_rec->>'zip', '')), 10);
        v_county := left(btrim(coalesce(v_rec->>'county', '')), 60);
        v_license := left(btrim(coalesce(v_rec->>'licenseNo', '')), 60);
        v_desc := left(btrim(coalesce(v_rec->>'description', '')), 4000);
        if v_email <> '' and v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
          raise exception 'Email is not valid.' using errcode = 'P0001';
        end if;
        if v_state <> '' and not private.us_state_ok(v_state) then
          raise exception 'Pick a US state (or DC).' using errcode = 'P0001';
        end if;
        if v_zip <> '' and v_zip !~ '^[0-9]{5}(-[0-9]{4})?$' then
          raise exception 'Zip Code must be 5 digits (or ZIP+4).' using errcode = 'P0001';
        end if;
        v_owner_text := btrim(coalesce(v_rec->>'ownerId', ''));
        if v_owner_text <> '' then
          if v_owner_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
            select id into v_owner from public.profiles
            where id = v_owner_text::uuid and status = 'active' and role in ('Sales Person', 'Sales Team');
          end if;
          if v_owner is null then
            select count(*) into v_hits from public.profiles
            where status = 'active' and role in ('Sales Person', 'Sales Team')
              and (lower(email) = lower(v_owner_text) or lower(btrim(first_name || ' ' || last_name)) = lower(v_owner_text));
            if v_hits > 1 then
              raise exception 'Owner "%" matches more than one salesperson. Use the email.', v_owner_text using errcode = 'P0001';
            end if;
            select id into v_owner from public.profiles
            where status = 'active' and role in ('Sales Person', 'Sales Team')
              and (lower(email) = lower(v_owner_text) or lower(btrim(first_name || ' ' || last_name)) = lower(v_owner_text));
          end if;
          if v_owner is null then
            raise exception 'Owner "%" is not an active Sales Person or Sales Team user.', v_owner_text using errcode = 'P0001';
          end if;
        end if;
        v_links := '{}'::jsonb;
        if jsonb_typeof(v_rec->'links') = 'object' then
          select coalesce(jsonb_object_agg(e.key, to_jsonb(btrim(e.value #>> '{}'))), '{}'::jsonb) into v_links
          from jsonb_each(v_rec->'links') e
          where e.key = any (private.crm_link_keys()) and jsonb_typeof(e.value) = 'string' and btrim(e.value #>> '{}') <> '';
        end if;
        if v_company <> '' then
          select a.id, a.name, a.archived_at into v_account, v_acc_name, v_acc_archived
          from public.crm_accounts a
          where private.crm_company_key(a.name) = private.crm_company_key(v_company)
          order by a.archived_at nulls first
          limit 1;
          if v_account is not null and v_acc_archived is null then
            v_notes := v_notes || jsonb_build_array('Company: ' || v_acc_name);
          else
            v_account := null;
            v_notes := v_notes || jsonb_build_array('No company called "' || v_company || '" yet: kept as text' || case when p_module = 'leads' then ' (pick it from Companies later)' else '' end);
          end if;
        end if;
        if p_module = 'leads' then
          insert into public.crm_leads (
            first_name, last_name, company, email, phone, mobile, source, status, owner_id, notes,
            role_in_company, title, license_no, crm_street, crm_city, crm_state, crm_zip, crm_county, links, account_id
          ) values (
            v_first, v_last, case when v_account is null then v_company else '' end, v_email, v_phone, v_mobile,
            v_source, v_status, v_owner, v_desc, v_role, v_title, v_license, v_street, v_city, v_state, v_zip, v_county,
            coalesce(v_links, '{}'::jsonb), v_account
          ) returning id, btrim(first_name || ' ' || last_name) into v_new, v_name;
          v_link := '#/crm/leads/' || v_new::text;
        else
          v_new := public.crm_create_contact(jsonb_strip_nulls(jsonb_build_object(
            'firstName', v_first, 'lastName', v_last, 'email', v_email, 'phone', v_phone, 'mobile', v_mobile,
            'company', case when v_account is null then v_company else '' end,
            'accountId', v_account, 'roleInCompany', v_role, 'title', v_title, 'leadSource', v_source,
            'relationshipStatus', nullif(v_status, ''), 'street', v_street, 'city', v_city, 'state', v_state,
            'zip', v_zip, 'county', v_county, 'licenseNo', v_license, 'description', v_desc,
            'ownerId', v_owner, 'links', coalesce(v_links, '{}'::jsonb)
          )));
          select btrim(c.first_name || ' ' || c.last_name) into v_name from public.contacts c where c.id = v_new;
          v_link := '#/crm/contacts/' || v_new::text;
        end if;
      else
        v_body := left(btrim(coalesce(v_rec->>'note', '')), 4000);
        if v_body = '' then raise exception 'Note is required.' using errcode = 'P0001'; end if;
        v_subject := left(btrim(coalesce(v_rec->>'noteTitle', '')), 200);
        if v_subject = '' then v_subject := left(split_part(v_body, E'\n', 1), 80); end if;
        if btrim(v_subject) = '' then raise exception 'Note is required.' using errcode = 'P0001'; end if;
        v_em := lower(left(btrim(coalesce(v_rec->>'email', '')), 200));
        v_nm := lower(btrim(regexp_replace(coalesce(nullif(btrim(coalesce(v_rec->>'fullName', '')), ''),
          btrim(coalesce(v_rec->>'firstName', '') || ' ' || coalesce(v_rec->>'lastName', ''))), '\s+', ' ', 'g')));
        v_entity := case when p_module = 'leads' then 'lead' else 'contact' end;
        v_new := null;
        if p_module = 'leads' then
          if v_em <> '' then
            select l.id, btrim(l.first_name || ' ' || l.last_name), l.archived_at is not null
              into v_new, v_name, v_arch
            from public.crm_leads l
            where lower(l.email) = v_em
            order by (l.archived_at is null) desc, l.created_at
            limit 1;
          end if;
          if v_new is null then
            if v_nm = '' then
              if v_em <> '' then raise exception 'No lead has the email %.', v_em using errcode = 'P0002'; end if;
              raise exception 'Give the email or the name of the lead for this note.' using errcode = 'P0001';
            end if;
            select count(*) into v_hits from public.crm_leads l
            where lower(btrim(regexp_replace(l.first_name || ' ' || l.last_name, '\s+', ' ', 'g'))) = v_nm;
            if v_hits > 1 then
              raise exception '% leads are named "%"; add the email to pick one.', v_hits, v_nm using errcode = 'P0001';
            end if;
            if v_hits = 0 then
              raise exception 'No lead %is named "%".', case when v_em <> '' then 'has the email ' || v_em || ' or ' else '' end, v_nm using errcode = 'P0002';
            end if;
            select l.id, btrim(l.first_name || ' ' || l.last_name), l.archived_at is not null
              into v_new, v_name, v_arch
            from public.crm_leads l
            where lower(btrim(regexp_replace(l.first_name || ' ' || l.last_name, '\s+', ' ', 'g'))) = v_nm
            limit 1;
          end if;
        else
          if v_em <> '' then
            select c.id, btrim(c.first_name || ' ' || c.last_name), c.crm_archived_at is not null
              into v_new, v_name, v_arch
            from public.contacts c
            where lower(c.email) = v_em
            order by (c.crm_archived_at is null) desc, c.created_at
            limit 1;
          end if;
          if v_new is null then
            if v_nm = '' then
              if v_em <> '' then raise exception 'No client has the email %.', v_em using errcode = 'P0002'; end if;
              raise exception 'Give the email or the name of the client for this note.' using errcode = 'P0001';
            end if;
            select count(*) into v_hits from public.contacts c
            where lower(btrim(regexp_replace(c.first_name || ' ' || c.last_name, '\s+', ' ', 'g'))) = v_nm;
            if v_hits > 1 then
              raise exception '% clients are named "%"; add the email to pick one.', v_hits, v_nm using errcode = 'P0001';
            end if;
            if v_hits = 0 then
              raise exception 'No client %is named "%".', case when v_em <> '' then 'has the email ' || v_em || ' or ' else '' end, v_nm using errcode = 'P0002';
            end if;
            select c.id, btrim(c.first_name || ' ' || c.last_name), c.crm_archived_at is not null
              into v_new, v_name, v_arch
            from public.contacts c
            where lower(btrim(regexp_replace(c.first_name || ' ' || c.last_name, '\s+', ' ', 'g'))) = v_nm
            limit 1;
          end if;
        end if;
        if exists (
          select 1 from public.crm_activities a
          where a.kind = 'note' and a.entity = v_entity and a.entity_id = v_new and a.body = v_body and a.subject = v_subject
        ) then
          raise exception 'Duplicate: this note is already on %.', v_name using errcode = '23505';
        end if;
        insert into public.crm_activities (entity, entity_id, kind, subject, body, status)
        values (v_entity, v_new, 'note', v_subject, v_body, 'done');
        v_link := '#/crm/' || case when p_module = 'leads' then 'leads' else 'contacts' end || '/' || v_new::text;
        v_notes := v_notes || jsonb_build_array(case when v_arch then 'on an archived ' || v_entity else 'linked by ' || case when v_em <> '' then 'email' else 'name' end end);
      end if;
      v_ok := v_ok + 1;
      v_out_rows := v_out_rows || jsonb_build_array(jsonb_build_object(
        'line', v_line, 'status', 'ok', 'message', '', 'id', v_new, 'name', coalesce(v_name, ''), 'link', v_link, 'notes', v_notes
      ));
    exception when others then
      get stacked diagnostics v_msg = message_text, v_state_code = returned_sqlstate;
      if v_state_code = '23505' or v_msg ~* 'already (used|exists|a client)|duplicate' then
        v_row_status := 'duplicate';
        v_dup := v_dup + 1;
        if v_state_code = '23505' and v_msg !~* 'already|duplicate' then
          v_msg := 'Duplicate: this email or phone is already on a lead or client.';
        end if;
      else
        v_row_status := 'error';
        v_err := v_err + 1;
      end if;
      v_out_rows := v_out_rows || jsonb_build_array(jsonb_build_object(
        'line', v_line, 'status', v_row_status, 'message', left(coalesce(v_msg, 'This row could not be imported.'), 500),
        'id', null, 'name', '', 'link', '', 'notes', v_notes
      ));
    end;
  end loop;

  v_result := jsonb_build_object(
    'rows', v_out_rows,
    'counts', jsonb_build_object('total', v_total, 'ok', v_ok, 'duplicates', v_dup, 'errors', v_err),
    'importId', null
  );
  if not coalesce(p_commit, false) then
    -- rolls back the lead / client / note inserts. The detail is the preview.
    raise exception 'Import preview only. Nothing was saved.'
      using errcode = 'P0004', detail = v_result::text;
  end if;

  insert into public.crm_imports (module, kind, file_name, created_by, created, duplicates, errors, defaults)
  values (
    p_module, p_kind, left(btrim(coalesce(p_file_name, '')), 200), v_uid, v_ok, v_dup, v_err, p_defaults
  ) returning id into v_import;

  insert into public.crm_import_rows (import_id, line, status, message, record_id, record_name)
  select v_import, (r->>'line')::int, r->>'status', left(coalesce(r->>'message', ''), 500),
         nullif(r->>'id', '')::uuid, left(coalesce(r->>'name', ''), 200)
  from jsonb_array_elements(v_out_rows) r;

  v_result := jsonb_set(v_result, '{importId}', to_jsonb(v_import));
  return v_result;
end
$fn$;

create or replace function public.crm_list_imports()
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, public, extensions
as $fn$
declare
  v_out jsonb;
begin
  if coalesce(private.is_admin(), false) is not true then
    raise exception 'Only an Admin or Super admin can import.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(q.obj order by q.at desc), '[]'::jsonb) into v_out
  from (
    select i.created_at as at, jsonb_build_object(
      'id', i.id,
      'module', i.module,
      'kind', i.kind,
      'fileName', coalesce(i.file_name, ''),
      'at', i.created_at,
      'by', i.created_by,
      'byName', coalesce(private.crm_name(i.created_by), ''),
      'created', case when coalesce(c.n, 0) > 0 then c.ok else i.created end,
      'duplicates', case when coalesce(c.n, 0) > 0 then c.dup else i.duplicates end,
      'errors', case when coalesce(c.n, 0) > 0 then c.err else i.errors end,
      'rowCount', coalesce(c.n, 0),
      'defaults', coalesce(def.defaults, '[]'::jsonb)
    ) as obj
    from public.crm_imports i
    left join lateral (
      select count(*) filter (where r.status = 'ok')::int as ok,
             count(*) filter (where r.status = 'duplicate')::int as dup,
             count(*) filter (where r.status = 'error')::int as err,
             count(*)::int as n
      from public.crm_import_rows r
      where r.import_id = i.id
    ) c on true
    left join lateral (
      select jsonb_agg(jsonb_build_object(
        'field', d->>'field',
        'value', d->>'value',
        'text', case
          when d->>'field' = 'ownerId' and d->>'value' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            then coalesce(private.crm_name((d->>'value')::uuid), d->>'value')
          else d->>'value' end
      )) as defaults
      from jsonb_array_elements(coalesce(i.defaults, '[]'::jsonb)) d
    ) def on true
  ) q;
  return v_out;
end
$fn$;

create or replace function public.crm_list_import_rows(p_import uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, public, extensions
as $fn$
declare
  v_out jsonb;
begin
  if coalesce(private.is_admin(), false) is not true then
    raise exception 'Only an Admin or Super admin can import.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.crm_imports where id = p_import) then
    raise exception 'Import not found.' using errcode = 'P0002';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'importId', r.import_id,
    'line', r.line,
    'status', r.status,
    'message', r.message,
    'recordId', r.record_id,
    'recordName', r.record_name
  ) order by r.line), '[]'::jsonb) into v_out
  from public.crm_import_rows r
  where r.import_id = p_import;
  return v_out;
end
$fn$;

revoke all on function public.crm_import_batch(boolean, text, text, text, jsonb, jsonb) from public;
revoke all on function public.crm_list_imports() from public;
revoke all on function public.crm_list_import_rows(uuid) from public;
grant execute on function public.crm_import_batch(boolean, text, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.crm_list_imports() to authenticated;
grant execute on function public.crm_list_import_rows(uuid) to authenticated;

do $anon$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.crm_import_batch(boolean, text, text, text, jsonb, jsonb) from anon;
    revoke all on function public.crm_list_imports() from anon;
    revoke all on function public.crm_list_import_rows(uuid) from anon;
  end if;
end
$anon$;

commit;
