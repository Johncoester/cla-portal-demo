-- Puts back the CRM policies and write checks read from TEST on 2026-11-18.
-- Pair of supabase/migrations/20261125330000_crm_visibility_edit_own.sql.
-- Does not change public.deals. Drops only the two client policies this change added.
-- Each function is rebuilt from the live definition by putting the old sentence
-- back, then refused unless md5(pg_get_functiondef) is the TEST value again.

begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $swap$
declare
  r record;
  src text;
  got text;
  i int;
  n int;
  needle text;
  repl text;
begin
  for r in
    select * from (values
      ('private.rpc_crm_contact_list()'::text, '4ee8f376359b9d87c9c0ec61087ec7ed',
        array['where private.crm_in_pool(c.id)'],
        array['where private.crm_contact_visible(c.id)']),
      ('private.rpc_crm_contact_detail(uuid)'::text, '9d161ae6084b0d22a87a3b3e0951f4a6',
        array['if not private.crm_in_pool(p_id)'],
        array['if not private.crm_contact_visible(p_id)']),
      ('private.rpc_crm_account_list()'::text, 'b7017588c3065049eb5c0ce6535bed37',
        array['where true', '''contacts'', (select count(*) from public.contacts c where c.account_id = a.id and private.crm_in_pool(c.id))', '''canEdit'', ((select private.is_admin()) or a.owner_id = (select auth.uid()))'],
        array['where private.crm_account_visible(a.id)', '''contacts'', (select count(*) from public.contacts c where c.account_id = a.id and private.crm_contact_visible(c.id))', '''canEdit'', private.crm_editor()']),
      ('private.rpc_crm_account_detail(uuid)'::text, 'a1e592c741d739205ff76d75de4d5474',
        array['if not exists (select 1 from public.crm_accounts a where a.id = p_id)', '''contactList'', coalesce((select jsonb_agg(private.crm_contact_json(c.id)) from public.contacts c where c.account_id = p_id and private.crm_in_pool(c.id))'],
        array['if not private.crm_account_visible(p_id)', '''contactList'', coalesce((select jsonb_agg(private.crm_contact_json(c.id)) from public.contacts c where c.account_id = p_id and private.crm_contact_visible(c.id))']),
      ('private.rpc_crm_follow_ups(uuid, text, boolean)'::text, '5fa1af54f098b93cb0c83a714191d18f',
        array['coalesce(p_owner, private.effective_uid()))), ''[]''::jsonb)'],
        array['coalesce(p_owner, private.effective_uid())) and private.crm_entity_visible(a.entity, a.entity_id)), ''[]''::jsonb)']),
      ('private.rpc_crm_report(date, date)'::text, 'cc40c7052426d6aa0e4b31e68f179bb3',
        array['public.crm_leads where archived_at is null'],
        array['public.crm_leads where private.crm_owner_ok(owner_id) and archived_at is null']),
      ('private.rpc_crm_invited_meetings(text, uuid)'::text, 'ec97be86328006b4ab8b7dcac069ac39',
        array['if not exists (select 1 from public.crm_leads where p_entity = ''lead'' and id = p_id union all select 1 from public.contacts where p_entity = ''contact'' and id = p_id union all select 1 from public.crm_accounts where p_entity = ''account'' and id = p_id union all select 1 from public.crm_opportunities where p_entity = ''opportunity'' and id = p_id) then raise exception ''Record not found.'' using errcode = ''P0002''; end if;'],
        array['if not private.crm_entity_visible(p_entity, p_id) then raise exception ''Record not found.'' using errcode = ''P0002''; end if;']),
      ('private.rpc_crm_convert_lead(uuid, jsonb)'::text, '622947fd79b14c039a5efaf57bce4047',
        array['perform private.crm_need();',
              'if l.id is null then raise exception ''Lead not found.'' using errcode = ''P0002''; end if; if coalesce(private.is_admin(), false) is not true and l.owner_id is distinct from auth.uid() then raise exception ''Only the owner or an admin can change this record.'' using errcode = ''42501''; end if;',
              'not exists (select 1 from public.crm_accounts a where a.id = v_acc)'],
        array['perform private.crm_need(true);',
              'if l.id is null or not private.crm_owner_ok(l.owner_id) then raise exception ''Lead not found.'' using errcode = ''P0002''; end if;',
              'not private.crm_account_visible(v_acc)']),
      ('private.rpc_crm_update_contact(uuid, jsonb)'::text, 'b2c4e337b3e4384ba4b85d33c7b3e90a',
        array['perform private.crm_need();',
              'if not private.crm_in_pool(p_id) then raise exception ''Client not found.'' using errcode = ''P0002''; end if; if auth.uid() is not null and coalesce(private.is_admin(), false) is not true and (select c.crm_owner_id from public.contacts c where c.id = p_id) is distinct from auth.uid() then raise exception ''Only the owner or an admin can change this record.'' using errcode = ''42501''; end if;',
              'not exists (select 1 from public.crm_accounts a where a.id = v_acc)'],
        array['perform private.crm_need(true);',
              'if not private.crm_contact_visible(p_id) then raise exception ''Client not found.'' using errcode = ''P0002''; end if;',
              'not private.crm_account_visible(v_acc)']),
      ('private.rpc_crm_close_task(uuid)'::text, 'f5578227e9a699990d00086c9f5aba8a',
        array['perform private.crm_need();',
              'if a.id is null then raise exception ''Task not found.'' using errcode = ''P0002''; end if; if coalesce(private.is_admin(), false) is not true and a.owner_id is distinct from auth.uid() then raise exception ''Only the owner or an admin can change this record.'' using errcode = ''42501''; end if;'],
        array['perform private.crm_need(true);',
              'if a.id is null or not private.crm_entity_visible(a.entity, a.entity_id) then raise exception ''Task not found.'' using errcode = ''P0002''; end if;']),
      ('private.rpc_crm_archive(text, uuid, boolean)'::text, 'eef5a08bf76909431f1467fd67db1609',
        array['declare v timestamptz := case when p_archived then now() end; v_owner uuid;',
              'perform private.crm_need();',
              'if p_entity = ''contact'' then select c.crm_owner_id into v_owner from public.contacts c where c.id = p_id and private.crm_in_pool(c.id); elsif p_entity = ''lead'' then select l.owner_id into v_owner from public.crm_leads l where l.id = p_id; elsif p_entity = ''account'' then select a.owner_id into v_owner from public.crm_accounts a where a.id = p_id; elsif p_entity = ''opportunity'' then select o.owner_id into v_owner from public.crm_opportunities o where o.id = p_id; else raise exception ''Record not found.'' using errcode = ''P0002''; end if; if not found then raise exception ''Record not found.'' using errcode = ''P0002''; end if; if coalesce(private.is_admin(), false) is not true and v_owner is distinct from auth.uid() then raise exception ''Only the owner or an admin can change this record.'' using errcode = ''42501''; end if;'],
        array['declare v timestamptz := case when p_archived then now() end;',
              'perform private.crm_need(true);',
              'if not private.crm_entity_visible(p_entity, p_id) then raise exception ''Record not found.'' using errcode = ''P0002''; end if;']),
      ('private.crm_row_guard()'::text, 'fa817fbc0bbf15af35ad9c8681ff9e97',
        array['if private.effective_uid() is not null then if tg_table_name in (''crm_leads'', ''crm_accounts'', ''crm_opportunities'', ''crm_activities'') then if tg_op = ''UPDATE'' and coalesce(private.is_admin(), false) is not true and old.owner_id is distinct from auth.uid() then raise exception ''Only the owner or an admin can change this record.'' using errcode = ''42501''; end if; if tg_op = ''INSERT'' and tg_table_name = ''crm_activities'' and coalesce(new.system, false) is not true and coalesce(private.is_admin(), false) is not true and not private.crm_editor() and new.owner_id is not null and new.owner_id is distinct from auth.uid() then raise exception ''Only the owner or an admin can change this record.'' using errcode = ''42501''; end if; if tg_op = ''INSERT'' and tg_table_name <> ''crm_activities'' and coalesce(private.is_admin(), false) is not true and not private.crm_editor() and new.owner_id is not null and new.owner_id is distinct from auth.uid() then raise exception ''Only the owner or an admin can change this record.'' using errcode = ''42501''; end if; elsif not private.crm_editor() then raise exception ''You cannot change CRM records.'' using errcode = ''42501''; end if; end if;'],
        array['if private.effective_uid() is not null and not private.crm_editor() then raise exception ''You cannot change CRM records.'' using errcode = ''42501''; end if;']),
      ('private.contacts_crm_guard()'::text, '1c14372504fe5cc9c612e05c7c5683c1',
        array['if private.effective_uid() is not null and coalesce(private.is_admin(), false) is not true and old.crm_owner_id is distinct from auth.uid() and (new.crm_owner_id is distinct from old.crm_owner_id or new.account_id is distinct from old.account_id or new.crm_stage is distinct from old.crm_stage or new.tags is distinct from old.tags or new.crm_notes is distinct from old.crm_notes or new.crm_lead_id is distinct from old.crm_lead_id or new.crm_archived_at is distinct from old.crm_archived_at or new.role_in_company is distinct from old.role_in_company or new.title is distinct from old.title or new.mobile is distinct from old.mobile or new.assistant is distinct from old.assistant or new.asst_phone is distinct from old.asst_phone or new.agent_split is distinct from old.agent_split or new.license_no is distinct from old.license_no or new.sales_volume_last_year is distinct from old.sales_volume_last_year or new.deals_closed_last_year is distinct from old.deals_closed_last_year or new.zillow_url is distinct from old.zillow_url or new.crm_street is distinct from old.crm_street or new.crm_city is distinct from old.crm_city or new.crm_state is distinct from old.crm_state or new.crm_zip is distinct from old.crm_zip or new.crm_county is distinct from old.crm_county or new.links is distinct from old.links or new.lead_source is distinct from old.lead_source or new.relationship_status is distinct from old.relationship_status or new.custom is distinct from old.custom) then raise exception ''Only the owner or an admin can change this record.'' using errcode = ''42501''; end if;'],
        array['if private.effective_uid() is not null and not private.crm_editor() then raise exception ''You cannot change CRM details.'' using errcode = ''42501''; end if;'])
    ) as v(sig, expect, olds, news)
  loop
    src := pg_get_functiondef(r.sig::regprocedure);
    for i in 1 .. cardinality(r.olds) loop
      needle := r.olds[i];
      repl := r.news[i];
      n := (length(src) - length(replace(src, needle, ''))) / nullif(length(needle), 0);
      if coalesce(n, 0) <> 1 then
        raise exception 'rollback drift: % needle occurs % times: %', r.sig, n, needle;
      end if;
      src := replace(src, needle, repl);
    end loop;
    got := md5(src);
    if got is distinct from r.expect then
      raise exception 'rollback drift: % would become md5 % not %', r.sig, got, r.expect;
    end if;
    execute src;
    if md5(pg_get_functiondef(r.sig::regprocedure)) is distinct from r.expect then
      raise exception 'rollback drift: % md5 after execute is not the TEST value', r.sig;
    end if;
  end loop;
end
$swap$;


do $mass_now$
declare src text;
begin
  src := pg_get_functiondef('public.crm_mass_update(text, jsonb, text, text, uuid[])'::regprocedure);
  if position('v_admin or owner_id' in src) = 0 then
    raise exception 'rollback drift: crm_mass_update is not the visibility version';
  end if;
end
$mass_now$;

CREATE OR REPLACE FUNCTION public.crm_mass_update(p_module text, p_filter jsonb, p_field text, p_value text, p_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  m text := case lower(btrim(coalesce(p_module, '')))
    when 'leads' then 'lead' when 'contacts' then 'contact' when 'clients' then 'contact'
    when 'accounts' then 'account' when 'companies' then 'account'
    when 'opportunities' then 'opportunity' when 'deals' then 'deal' else lower(btrim(coalesce(p_module, ''))) end;
  field text := btrim(coalesce(p_field, ''));
  val text := btrim(coalesce(p_value, ''));
  author text;
  stamp text;
  n int;
begin
  if auth.uid() is null then raise exception 'Sign in required.' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('Processor', 'Preprocessor')) then
    raise exception 'The Processor has read-only access to the CRM.' using errcode = '42501';
  end if;
  if val = '' then raise exception 'Enter the new value.' using errcode = '22023'; end if;
  if m = 'lead' and field not in ('notes', 'relationshipStatus', 'leadSource') then raise exception 'That field cannot be changed for every selected record.' using errcode = '22023'; end if;
  if m = 'contact' and field <> 'notes' then raise exception 'That field cannot be changed for every selected record.' using errcode = '22023'; end if;
  if m = 'account' and field not in ('notes', 'kind') then raise exception 'That field cannot be changed for every selected record.' using errcode = '22023'; end if;
  if m = 'opportunity' and field not in ('notes', 'stage') then raise exception 'That field cannot be changed for every selected record.' using errcode = '22023'; end if;
  if m = 'deal' and field <> 'notes' then raise exception 'That field cannot be changed for every selected record.' using errcode = '22023'; end if;
  if p_ids is not null and cardinality(p_ids) > 100 then raise exception 'Select at most one page of records.' using errcode = '22023'; end if;
  if field = 'notes' then
    select case
      when btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) <> ''
        then btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
      else coalesce(nullif(btrim(p.email), ''), 'CLA Title')
    end into author
    from public.profiles p where p.id = auth.uid();
    stamp := to_char(timezone('America/New_York', clock_timestamp()), 'FMMon FMDD, YYYY') || ' — ' || coalesce(author, 'CLA Title');
  end if;
  if m = 'lead' and field = 'notes' then
    update public.crm_leads set notes = case when btrim(coalesce(notes, '')) = '' then stamp || E'\n' || val else btrim(notes) || E'\n\n---\n' || stamp || E'\n' || val end, modified_at = now()
    where case when p_ids is null then id in (select public.crm_match_ids(m, coalesce(p_filter, '{}'::jsonb))) else id = any(p_ids) end;
  elsif m = 'lead' and field = 'relationshipStatus' then update public.crm_leads set status = val, modified_at = now() where case when p_ids is null then id in (select public.crm_match_ids(m, coalesce(p_filter, '{}'::jsonb))) else id = any(p_ids) end;
  elsif m = 'lead' and field = 'leadSource' then update public.crm_leads set source = val, modified_at = now() where case when p_ids is null then id in (select public.crm_match_ids(m, coalesce(p_filter, '{}'::jsonb))) else id = any(p_ids) end;
  elsif m = 'contact' then
    update public.contacts set crm_notes = case when btrim(coalesce(crm_notes, '')) = '' then stamp || E'\n' || val else btrim(crm_notes) || E'\n\n---\n' || stamp || E'\n' || val end, modified_at = now(), modified_by = auth.uid()
    where case when p_ids is null then id in (select public.crm_match_ids(m, coalesce(p_filter, '{}'::jsonb))) else id = any(p_ids) end;
  elsif m = 'account' and field = 'notes' then
    update public.crm_accounts set notes = case when btrim(coalesce(notes, '')) = '' then stamp || E'\n' || val else btrim(notes) || E'\n\n---\n' || stamp || E'\n' || val end, modified_at = now()
    where case when p_ids is null then id in (select public.crm_match_ids(m, coalesce(p_filter, '{}'::jsonb))) else id = any(p_ids) end;
  elsif m = 'account' and field = 'kind' then update public.crm_accounts set kind = val, modified_at = now() where case when p_ids is null then id in (select public.crm_match_ids(m, coalesce(p_filter, '{}'::jsonb))) else id = any(p_ids) end;
  elsif m = 'opportunity' and field = 'notes' then
    update public.crm_opportunities set notes = case when btrim(coalesce(notes, '')) = '' then stamp || E'\n' || val else btrim(notes) || E'\n\n---\n' || stamp || E'\n' || val end, modified_at = now()
    where case when p_ids is null then id in (select public.crm_match_ids(m, coalesce(p_filter, '{}'::jsonb))) else id = any(p_ids) end;
  elsif m = 'opportunity' and field = 'stage' then update public.crm_opportunities set stage = val, modified_at = now() where case when p_ids is null then id in (select public.crm_match_ids(m, coalesce(p_filter, '{}'::jsonb))) else id = any(p_ids) end;
  elsif m = 'deal' then
    update public.deals set notes = case when btrim(coalesce(notes, '')) = '' then stamp || E'\n' || val else btrim(notes) || E'\n\n---\n' || stamp || E'\n' || val end
    where case when p_ids is null then id in (select public.crm_match_ids(m, coalesce(p_filter, '{}'::jsonb))) else id = any(p_ids) end;
  else raise exception 'Unknown list.' using errcode = '22023';
  end if;
  get diagnostics n = row_count;
  return jsonb_build_object('count', n, 'updated', n, 'failed', 0);
end
$function$;


drop policy if exists crm_leads_select on public.crm_leads;
drop policy if exists crm_leads_insert on public.crm_leads;
drop policy if exists crm_leads_update on public.crm_leads;
create policy crm_leads_select on public.crm_leads for select to authenticated using (private.crm_owner_ok(owner_id));
create policy crm_leads_insert on public.crm_leads for insert to authenticated with check (private.crm_editor() and private.crm_owner_ok(owner_id));
create policy crm_leads_update on public.crm_leads for update to authenticated using (private.crm_editor() and private.crm_owner_ok(owner_id)) with check (private.crm_editor() and private.crm_owner_ok(owner_id));

drop policy if exists crm_accounts_select on public.crm_accounts;
drop policy if exists crm_accounts_insert on public.crm_accounts;
drop policy if exists crm_accounts_update on public.crm_accounts;
create policy crm_accounts_select on public.crm_accounts for select to authenticated using (private.crm_account_visible(id));
create policy crm_accounts_insert on public.crm_accounts for insert to authenticated with check (private.crm_editor() and private.crm_owner_ok(owner_id));
create policy crm_accounts_update on public.crm_accounts for update to authenticated using (private.crm_editor() and private.crm_account_visible(id)) with check (private.crm_editor());

drop policy if exists crm_opps_select on public.crm_opportunities;
drop policy if exists crm_opps_insert on public.crm_opportunities;
drop policy if exists crm_opps_update on public.crm_opportunities;
create policy crm_opps_select on public.crm_opportunities for select to authenticated using (private.crm_opp_visible(id));
create policy crm_opps_insert on public.crm_opportunities for insert to authenticated with check (private.crm_editor() and (private.crm_owner_ok(owner_id) or (contact_id is not null and private.crm_contact_visible(contact_id)) or (account_id is not null and private.crm_account_visible(account_id))));
create policy crm_opps_update on public.crm_opportunities for update to authenticated using (private.crm_editor() and private.crm_opp_visible(id)) with check (private.crm_editor());

drop policy if exists crm_acts_select on public.crm_activities;
drop policy if exists crm_acts_insert on public.crm_activities;
drop policy if exists crm_acts_update on public.crm_activities;
create policy crm_acts_select on public.crm_activities for select to authenticated using (private.crm_entity_visible(entity, entity_id));
create policy crm_acts_insert on public.crm_activities for insert to authenticated with check (private.crm_editor() and not system and private.crm_entity_visible(entity, entity_id));
create policy crm_acts_update on public.crm_activities for update to authenticated using (private.crm_editor() and private.crm_entity_visible(entity, entity_id)) with check (private.crm_editor());

drop policy if exists crm_clients_read on public.contacts;
drop policy if exists crm_clients_change on public.contacts;
drop function if exists private.crm_staff_profile_ids();

drop index if exists public.crm_accounts_owner_idx;
drop index if exists public.crm_opportunities_owner_idx;


do $back$
declare q text; c text; got text;
begin
  select qual, with_check into q, c from pg_policies where schemaname='public' and tablename='crm_leads' and policyname='crm_leads_select';
  if q is distinct from 'private.crm_owner_ok(owner_id)' or c is not null then
    raise exception 'rollback readback: crm_leads_select % / %', q, c; end if;
  select qual, with_check into q, c from pg_policies where schemaname='public' and tablename='crm_leads' and policyname='crm_leads_update';
  if q is distinct from '(private.crm_editor() AND private.crm_owner_ok(owner_id))'
     or c is distinct from '(private.crm_editor() AND private.crm_owner_ok(owner_id))' then
    raise exception 'rollback readback: crm_leads_update % / %', q, c; end if;
  select qual into q from pg_policies where schemaname='public' and tablename='crm_accounts' and policyname='crm_accounts_select';
  if q is distinct from 'private.crm_account_visible(id)' then raise exception 'rollback readback: crm_accounts_select %', q; end if;
  select qual into q from pg_policies where schemaname='public' and tablename='crm_opportunities' and policyname='crm_opps_select';
  if q is distinct from 'private.crm_opp_visible(id)' then raise exception 'rollback readback: crm_opps_select %', q; end if;
  select qual into q from pg_policies where schemaname='public' and tablename='crm_activities' and policyname='crm_acts_select';
  if q is distinct from 'private.crm_entity_visible(entity, entity_id)' then raise exception 'rollback readback: crm_acts_select %', q; end if;
  select with_check into c from pg_policies where schemaname='public' and tablename='crm_opportunities' and policyname='crm_opps_insert';
  if c is distinct from '(private.crm_editor() AND (private.crm_owner_ok(owner_id) OR ((contact_id IS NOT NULL) AND private.crm_contact_visible(contact_id)) OR ((account_id IS NOT NULL) AND private.crm_account_visible(account_id))))' then
    raise exception 'rollback readback: crm_opps_insert %', c; end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='contacts' and policyname in ('crm_clients_read','crm_clients_change')) then
    raise exception 'rollback readback: client policies remain'; end if;
  if to_regprocedure('private.crm_staff_profile_ids()') is not null then
    raise exception 'rollback readback: crm_staff_profile_ids remains'; end if;
  if to_regclass('public.crm_accounts_owner_idx') is not null or to_regclass('public.crm_opportunities_owner_idx') is not null then
    raise exception 'rollback readback: owner index remains'; end if;
  got := md5(pg_get_functiondef('public.crm_mass_update(text, jsonb, text, text, uuid[])'::regprocedure));
  if got is distinct from '676dc1427542fe531650b996357e79e1' then
    raise exception 'rollback readback: crm_mass_update md5 %', got; end if;
  select qual into q from pg_policies where schemaname='public' and tablename='deals' and policyname='deals_select';
  if q is distinct from '(( SELECT ((private.me_role() IS NOT NULL) AND (private.is_admin() OR (private.me_role() = ANY (ARRAY[''Processor''::text, ''Sales Team''::text, ''Transaction Coordinator''::text]))))) OR private.can_access_deal(id))' then
    raise exception 'rollback readback: deals_select changed'; end if;
end
$back$;

commit;
