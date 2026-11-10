-- Janine, Nov 5 items 27 and 28. NOT applied to hosted TEST (aqcervntopidtcazcmlv).
-- Item 27: CRM deal name is the property address. The file number stays in fileNumber.
-- The name is computed when a deal is read. No update of stored deals.
-- Item 28: a retired relationship status is not a default and is not imported.
-- The row is an error in the preview. Records that already hold one are left as they are.
-- No new RLS policy and no new per-row helper.

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public, extensions;

create or replace function private.crm_deal_row(g public.deals) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', g.id, 'name', btrim(g.street || ', ' || g.city || ', ' || g.state || ' ' || g.zip), 'fileNumber', g.file_number, 'propertyAddress', g.street || ', ' || g.city || ', ' || g.state || ' ' || g.zip,
    'amount', g.purchase_price, 'loanAmount', g.loan_amount, 'stage', case g.status when 'Open' then 'Active' else g.status end, 'status', g.status,
    'closingDate', g.closing_date, 'openDate', g.open_date, 'county', coalesce(g.county, ''), 'city', g.city, 'transactionType', g.transaction_type,
    'clientName', coalesce((select string_agg(distinct btrim(c.first_name || ' ' || c.last_name), ', ') from public.deal_participants p join public.contacts c on c.id = p.contact_id where p.deal_id = g.id and p.role in ('Client-Buyer', 'Client-Seller')), ''),
    'clientIds', coalesce((select jsonb_agg(distinct p.contact_id) from public.deal_participants p where p.deal_id = g.id and p.role in ('Client-Buyer', 'Client-Seller')), '[]'),
    'contactName', coalesce((select string_agg(distinct btrim(c.first_name || ' ' || c.last_name), ', ') from public.deal_participants p join public.contacts c on c.id = p.contact_id where p.deal_id = g.id and p.role in ('Buyer Agent', 'Listing Agent')), ''),
    'ownerId', (select s.sales_id from public.deal_sales_people s where s.deal_id = g.id order by s.added_at, s.sales_id limit 1),
    'ownerName', coalesce((select private.crm_name(s.sales_id) from public.deal_sales_people s where s.deal_id = g.id order by s.added_at, s.sales_id limit 1), ''),
    'salesIds', coalesce((select jsonb_agg(s.sales_id order by s.added_at, s.sales_id) from public.deal_sales_people s where s.deal_id = g.id), '[]'),
    'salesReps', coalesce((select string_agg(private.crm_name(s.sales_id), ', ' order by s.added_at, s.sales_id) from public.deal_sales_people s where s.deal_id = g.id), ''),
    'source', coalesce((select b.source from public.deal_business_sources b where b.deal_id = g.id), ''),
    'sourceText', coalesce((select private.business_source_label(b.source) from public.deal_business_sources b where b.deal_id = g.id and b.source <> ''), ''),
    'createdAt', g.created_at) $$;

create or replace function public.crm_import_batch(
  p_commit boolean,
  p_module text,
  p_kind text,
  p_file_name text,
  p_defaults jsonb,
  p_rows jsonb,
  p_import uuid default null,
  p_chunk integer default 1
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
  v_canon text;
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
  v_batch_module text;
  v_batch_kind text;
  v_batch_by uuid;
  v_prev_total int;
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
  if p_chunk is null then
    p_chunk := 1;
  end if;
  if p_chunk < 1 or p_chunk > 20 then
    raise exception 'Chunk % is outside 1 to 20. A file is at most 10000 rows, sent 500 at a time.', p_chunk using errcode = 'P0001';
  end if;
  if v_n > 500 then
    raise exception 'At most 500 rows per import call.' using errcode = 'P0001';
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
          raise exception 'A default Relationship Status must be a current choice. Retired statuses are not offered and are not imported.' using errcode = 'P0001';
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
        if v_status <> '' then
          v_list := case when p_module = 'leads' then 'leadRelationshipStatus' else 'relationshipStatus' end;
          select o.value into v_canon
          from public.crm_picklist_options o
          where o.list_key = v_list and not o.retired
            and (o.value = v_status or lower(o.label) = lower(v_status))
          order by (o.value = v_status) desc
          limit 1;
          if v_canon is null then
            if exists (
              select 1 from public.crm_picklist_options o
              where o.list_key = v_list and o.retired
                and (o.value = v_status or lower(o.label) = lower(v_status))
            ) then
              raise exception 'Relationship Status "%" is retired and is not imported. Pick a current status.', v_status using errcode = 'P0001';
            end if;
          else
            v_status := v_canon;
          end if;
        end if;
        if p_module = 'leads' then
          if v_role = '' then
            raise exception 'Role in Company is required.' using errcode = 'P0001';
          end if;
          if v_status = '' then
            raise exception 'Relationship Status is required.' using errcode = 'P0001';
          end if;
          if v_state = '' then
            raise exception 'State is required.' using errcode = 'P0001';
          end if;
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
    exception
      when sqlstate 'P0004' then
        -- assert_failure. WHEN OTHERS does not catch it. A preview must leave
        -- this row and roll the chunk back, so name the code and re-raise.
        raise;
      when others then
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
    -- Rolls the lead / client / note inserts back. The error detail carries every row,
    -- including names and emails, so Postgres logs can keep that text. Fine on TEST
    -- with fake data. Revisit before any real import.
    raise exception 'Import preview only. Nothing was saved.'
      using errcode = 'P0004', detail = v_result::text;
  end if;

  if p_import is null then
    insert into public.crm_imports (module, kind, file_name, created_by, created, duplicates, errors, total, defaults)
    values (
      p_module, p_kind, left(btrim(coalesce(p_file_name, '')), 200), v_uid, v_ok, v_dup, v_err, v_total, p_defaults
    ) returning id into v_import;
  else
    select i.module, i.kind, i.created_by, i.total
      into v_batch_module, v_batch_kind, v_batch_by, v_prev_total
    from public.crm_imports i
    where i.id = p_import
    for update;
    if not found then
      raise exception 'Import batch not found.' using errcode = 'P0002';
    end if;
    if v_batch_by is distinct from v_uid then
      raise exception 'Only the admin who started this import can add a chunk.' using errcode = '42501';
    end if;
    if v_batch_module is distinct from p_module or v_batch_kind is distinct from p_kind then
      raise exception 'This chunk does not match the import it was added to.' using errcode = 'P0001';
    end if;
    if coalesce(v_prev_total, 0) + v_n > 10000 then
      raise exception 'A file is at most 10000 rows. Split the file and import each part.' using errcode = 'P0001';
    end if;
    update public.crm_imports
    set created = created + v_ok,
        duplicates = duplicates + v_dup,
        errors = errors + v_err,
        total = total + v_total
    where id = p_import;
    v_import := p_import;
  end if;

  insert into public.crm_import_rows (import_id, line, status, message, record_id, record_name)
  select v_import, (r->>'line')::int, r->>'status', left(coalesce(r->>'message', ''), 500),
         nullif(r->>'id', '')::uuid, left(coalesce(r->>'name', ''), 200)
  from jsonb_array_elements(v_out_rows) r;

  v_result := jsonb_set(v_result, '{importId}', to_jsonb(v_import));
  return v_result;
end
$fn$;

commit;
