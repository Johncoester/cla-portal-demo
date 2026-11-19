-- CRM visibility: everyone who can open the CRM can see every CRM record.
-- Only an Admin or Super admin, or the record's owner, can change or archive it.
-- Read from TEST (aqcervntopidtcazcmlv) on 2026-11-18. Not applied here.
-- The lead applies this file. Do not run it on hosted TEST from a pull request.
--
-- public.deals is the portal order table, not a CRM-only table. Its policies were
-- read and are guarded below so this file aborts if they have drifted. This file
-- does not drop, create, or alter any policy on public.deals.
-- public.contacts keeps its portal policies (contacts_select, contacts_insert,
-- contacts_update, demo_scope). Two extra CRM policies match only a contact
-- with a CRM stage (a CRM client). A person on a file is not included.
-- Staff profile ids are read once per query. CRM columns on a client still go
-- through private.contacts_crm_guard, which allows the owner or an admin.
--
-- Rollback: supabase/rollbacks/20261125330000_crm_visibility_edit_own.sql
-- Before text: supabase/review/20261125330000_crm_visibility_before.sql

begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Guards. Abort if a policy is not the definition read from TEST.
-- ---------------------------------------------------------------------------
do $guard$
declare
  q text;
  c text;
  n int;
begin
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'crm_leads';
  if n <> 3 then raise exception 'drift: crm_leads has % policies, expected 3', n; end if;
  select qual, with_check into q, c from pg_policies
   where schemaname = 'public' and tablename = 'crm_leads' and policyname = 'crm_leads_select';
  if q is distinct from 'private.crm_owner_ok(owner_id)' or c is not null then
    raise exception 'drift: crm_leads_select qual=% check=%', q, c; end if;
  select qual, with_check into q, c from pg_policies
   where schemaname = 'public' and tablename = 'crm_leads' and policyname = 'crm_leads_insert';
  if q is not null or c is distinct from '(private.crm_editor() AND private.crm_owner_ok(owner_id))' then
    raise exception 'drift: crm_leads_insert qual=% check=%', q, c; end if;
  select qual, with_check into q, c from pg_policies
   where schemaname = 'public' and tablename = 'crm_leads' and policyname = 'crm_leads_update';
  if q is distinct from '(private.crm_editor() AND private.crm_owner_ok(owner_id))'
     or c is distinct from '(private.crm_editor() AND private.crm_owner_ok(owner_id))' then
    raise exception 'drift: crm_leads_update qual=% check=%', q, c; end if;

  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'crm_accounts';
  if n <> 3 then raise exception 'drift: crm_accounts has % policies, expected 3', n; end if;
  select qual, with_check into q, c from pg_policies
   where schemaname = 'public' and tablename = 'crm_accounts' and policyname = 'crm_accounts_select';
  if q is distinct from 'private.crm_account_visible(id)' or c is not null then
    raise exception 'drift: crm_accounts_select qual=% check=%', q, c; end if;
  select qual, with_check into q, c from pg_policies
   where schemaname = 'public' and tablename = 'crm_accounts' and policyname = 'crm_accounts_insert';
  if q is not null or c is distinct from '(private.crm_editor() AND private.crm_owner_ok(owner_id))' then
    raise exception 'drift: crm_accounts_insert qual=% check=%', q, c; end if;
  select qual, with_check into q, c from pg_policies
   where schemaname = 'public' and tablename = 'crm_accounts' and policyname = 'crm_accounts_update';
  if q is distinct from '(private.crm_editor() AND private.crm_account_visible(id))'
     or c is distinct from 'private.crm_editor()' then
    raise exception 'drift: crm_accounts_update qual=% check=%', q, c; end if;

  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'crm_opportunities';
  if n <> 3 then raise exception 'drift: crm_opportunities has % policies, expected 3', n; end if;
  select qual, with_check into q, c from pg_policies
   where schemaname = 'public' and tablename = 'crm_opportunities' and policyname = 'crm_opps_select';
  if q is distinct from 'private.crm_opp_visible(id)' or c is not null then
    raise exception 'drift: crm_opps_select qual=% check=%', q, c; end if;
  select qual, with_check into q, c from pg_policies
   where schemaname = 'public' and tablename = 'crm_opportunities' and policyname = 'crm_opps_insert';
  if q is not null or c is distinct from '(private.crm_editor() AND (private.crm_owner_ok(owner_id) OR ((contact_id IS NOT NULL) AND private.crm_contact_visible(contact_id)) OR ((account_id IS NOT NULL) AND private.crm_account_visible(account_id))))' then
    raise exception 'drift: crm_opps_insert qual=% check=%', q, c; end if;
  select qual, with_check into q, c from pg_policies
   where schemaname = 'public' and tablename = 'crm_opportunities' and policyname = 'crm_opps_update';
  if q is distinct from '(private.crm_editor() AND private.crm_opp_visible(id))'
     or c is distinct from 'private.crm_editor()' then
    raise exception 'drift: crm_opps_update qual=% check=%', q, c; end if;

  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'crm_activities';
  if n <> 3 then raise exception 'drift: crm_activities has % policies, expected 3', n; end if;
  select qual, with_check into q, c from pg_policies
   where schemaname = 'public' and tablename = 'crm_activities' and policyname = 'crm_acts_select';
  if q is distinct from 'private.crm_entity_visible(entity, entity_id)' or c is not null then
    raise exception 'drift: crm_acts_select qual=% check=%', q, c; end if;
  select qual, with_check into q, c from pg_policies
   where schemaname = 'public' and tablename = 'crm_activities' and policyname = 'crm_acts_insert';
  if q is not null or c is distinct from '(private.crm_editor() AND (NOT system) AND private.crm_entity_visible(entity, entity_id))' then
    raise exception 'drift: crm_acts_insert qual=% check=%', q, c; end if;
  select qual, with_check into q, c from pg_policies
   where schemaname = 'public' and tablename = 'crm_activities' and policyname = 'crm_acts_update';
  if q is distinct from '(private.crm_editor() AND private.crm_entity_visible(entity, entity_id))'
     or c is distinct from 'private.crm_editor()' then
    raise exception 'drift: crm_acts_update qual=% check=%', q, c; end if;

  -- Portal contact policies. Read and left in place.
  select qual, with_check into q, c from pg_policies
   where schemaname = 'public' and tablename = 'contacts' and policyname = 'contacts_select';
  if q is distinct from 'private.contact_visible(id)' or c is not null then
    raise exception 'drift: contacts_select qual=% check=%', q, c; end if;
  select qual, with_check into q, c from pg_policies
   where schemaname = 'public' and tablename = 'contacts' and policyname = 'contacts_update';
  if q is distinct from '((private.me_role() <> ''Preprocessor''::text) AND private.is_processor())'
     or c is distinct from '((private.me_role() <> ''Preprocessor''::text) AND private.is_processor())' then
    raise exception 'drift: contacts_update qual=% check=%', q, c; end if;
  select qual, with_check into q, c from pg_policies
   where schemaname = 'public' and tablename = 'contacts' and policyname = 'contacts_insert';
  if q is not null or c is distinct from '((NOT private.is_preprocessor()) AND private.is_processor())' then
    raise exception 'drift: contacts_insert qual=% check=%', q, c; end if;
  select qual, with_check into q, c from pg_policies
   where schemaname = 'public' and tablename = 'contacts' and policyname = 'demo_scope';
  if q is distinct from '(is_demo = private.viewer_is_demo())'
     or c is distinct from '(is_demo = private.viewer_is_demo())' then
    raise exception 'drift: contacts demo_scope qual=% check=%', q, c; end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'contacts' and policyname in ('crm_clients_read', 'crm_clients_change')) then
    raise exception 'drift: CRM client policies already exist'; end if;
  if to_regprocedure('private.crm_staff_profile_ids()') is not null then
    raise exception 'drift: private.crm_staff_profile_ids() already exists'; end if;

  -- Shared portal orders. Guard only. Not modified.
  select qual, with_check into q, c from pg_policies
   where schemaname = 'public' and tablename = 'deals' and policyname = 'deals_select';
  if q is distinct from '(( SELECT ((private.me_role() IS NOT NULL) AND (private.is_admin() OR (private.me_role() = ANY (ARRAY[''Processor''::text, ''Sales Team''::text, ''Transaction Coordinator''::text]))))) OR private.can_access_deal(id))'
     or c is not null then
    raise exception 'drift: deals_select qual=% check=%', q, c; end if;
  select qual, with_check into q, c from pg_policies
   where schemaname = 'public' and tablename = 'deals' and policyname = 'deals_update';
  if q is distinct from 'private.can_run_deal(id)' or c is distinct from 'private.can_run_deal(id)' then
    raise exception 'drift: deals_update qual=% check=%', q, c; end if;
  select qual, with_check into q, c from pg_policies
   where schemaname = 'public' and tablename = 'deals' and policyname = 'deals_insert';
  if q is not null or c is distinct from '(private.is_processor() AND (created_by = private.effective_uid()) AND ((NOT private.is_preprocessor()) OR (preprocessor_user_id = private.effective_uid())))' then
    raise exception 'drift: deals_insert qual=% check=%', q, c; end if;
  select qual, with_check into q, c from pg_policies
   where schemaname = 'public' and tablename = 'deals' and policyname = 'demo_scope';
  if q is distinct from '(is_demo = ( SELECT private.viewer_is_demo() AS viewer_is_demo))'
     or c is distinct from '(is_demo = ( SELECT private.viewer_is_demo() AS viewer_is_demo))' then
    raise exception 'drift: deals demo_scope qual=% check=%', q, c; end if;

  if to_regclass('public.crm_leads_owner_idx') is null then
    raise exception 'drift: crm_leads_owner_idx is missing'; end if;
  if to_regclass('public.contacts_crm_owner_idx') is null then
    raise exception 'drift: contacts_crm_owner_idx is missing'; end if;
  if to_regclass('public.crm_activities_owner_idx') is null then
    raise exception 'drift: crm_activities_owner_idx is missing'; end if;
  if to_regclass('public.crm_accounts_owner_idx') is not null
     or to_regclass('public.crm_opportunities_owner_idx') is not null then
    raise exception 'drift: an owner index this file adds is already present'; end if;
end
$guard$;

-- Owner lookups for companies and pipeline deals (crm_opportunities).
create index crm_accounts_owner_idx on public.crm_accounts (owner_id);
create index crm_opportunities_owner_idx on public.crm_opportunities (owner_id);

-- See: one initplan, every CRM user, every row. No per-row helper.
-- Change: the existing row's owner, or an admin. WITH CHECK stays a CRM user so
-- the owner can hand the record to another person who can own CRM records.
-- The trigger still checks profiles.can_own_crm on that new owner.

drop policy crm_leads_select on public.crm_leads;
create policy crm_leads_select on public.crm_leads
  for select to authenticated
  using ((select private.crm_user()));
drop policy crm_leads_insert on public.crm_leads;
create policy crm_leads_insert on public.crm_leads
  for insert to authenticated
  with check (
    (select private.crm_user())
    and (select private.crm_editor())
  );
drop policy crm_leads_update on public.crm_leads;
create policy crm_leads_update on public.crm_leads
  for update to authenticated
  using (
    (select private.crm_user())
    and ((select private.is_admin()) or owner_id = (select auth.uid()))
  )
  with check ((select private.crm_user()));

drop policy crm_accounts_select on public.crm_accounts;
create policy crm_accounts_select on public.crm_accounts
  for select to authenticated
  using ((select private.crm_user()));
drop policy crm_accounts_insert on public.crm_accounts;
create policy crm_accounts_insert on public.crm_accounts
  for insert to authenticated
  with check (
    (select private.crm_user())
    and (select private.crm_editor())
  );
drop policy crm_accounts_update on public.crm_accounts;
create policy crm_accounts_update on public.crm_accounts
  for update to authenticated
  using (
    (select private.crm_user())
    and ((select private.is_admin()) or owner_id = (select auth.uid()))
  )
  with check ((select private.crm_user()));

drop policy crm_opps_select on public.crm_opportunities;
create policy crm_opps_select on public.crm_opportunities
  for select to authenticated
  using ((select private.crm_user()));
drop policy crm_opps_insert on public.crm_opportunities;
create policy crm_opps_insert on public.crm_opportunities
  for insert to authenticated
  with check (
    (select private.crm_user())
    and (select private.crm_editor())
  );
drop policy crm_opps_update on public.crm_opportunities;
create policy crm_opps_update on public.crm_opportunities
  for update to authenticated
  using (
    (select private.crm_user())
    and ((select private.is_admin()) or owner_id = (select auth.uid()))
  )
  with check ((select private.crm_user()));

drop policy crm_acts_select on public.crm_activities;
create policy crm_acts_select on public.crm_activities
  for select to authenticated
  using ((select private.crm_user()));
drop policy crm_acts_insert on public.crm_activities;
create policy crm_acts_insert on public.crm_activities
  for insert to authenticated
  with check (
    (select private.crm_user())
    and not system
    and (
      (select private.crm_editor())
      or owner_id = (select auth.uid())
      or owner_id is null
    )
  );
drop policy crm_acts_update on public.crm_activities;
create policy crm_acts_update on public.crm_activities
  for update to authenticated
  using (
    (select private.crm_user())
    and ((select private.is_admin()) or owner_id = (select auth.uid()))
  )
  with check ((select private.crm_user()));

-- A CRM client is a contact with a CRM stage. Migration 20261105222920 says
-- "only rows that are CRM clients: they have a CRM stage", and creating a
-- client sets crm_stage (default 'prospect'). relationship_status null means
-- "not a CRM client yet" in that same file. File parties leave crm_stage null,
-- so these policies do not open them.
-- Staff logins are excluded by one initplan: the id list is built once per
-- query, not once per contact. Same people private.crm_in_pool leaves out
-- (role other than Outside user, and not removed).
create or replace function private.crm_staff_profile_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(p.id), '{}'::uuid[])
  from public.profiles p
  where p.role <> 'Outside user'
    and p.status <> 'removed';
$$;
revoke all on function private.crm_staff_profile_ids() from public, anon;
grant execute on function private.crm_staff_profile_ids() to authenticated;

create policy crm_clients_read on public.contacts
  for select to authenticated
  using (
    (select private.crm_user())
    and crm_stage is not null
    and (profile_id is null or not (profile_id = any (((select private.crm_staff_profile_ids()))::uuid[])))
  );
create policy crm_clients_change on public.contacts
  for update to authenticated
  using (
    (select private.crm_user())
    and crm_stage is not null
    and (profile_id is null or not (profile_id = any (((select private.crm_staff_profile_ids()))::uuid[])))
    and ((select private.is_admin()) or crm_owner_id = (select auth.uid()))
  )
  with check (
    (select private.crm_user())
    and crm_stage is not null
    and (profile_id is null or not (profile_id = any (((select private.crm_staff_profile_ids()))::uuid[])))
  );

-- ---------------------------------------------------------------------------
-- Security-definer writers and the lists they filter. Each body is swapped
-- only when md5(pg_get_functiondef) is still the value read from TEST, and
-- the old sentence occurs once.
-- ---------------------------------------------------------------------------
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
        array['where private.crm_contact_visible(c.id)'],
        array['where private.crm_in_pool(c.id)']),
      ('private.rpc_crm_contact_detail(uuid)'::text, '9d161ae6084b0d22a87a3b3e0951f4a6',
        array['if not private.crm_contact_visible(p_id)'],
        array['if not private.crm_in_pool(p_id)']),
      ('private.rpc_crm_account_list()'::text, 'b7017588c3065049eb5c0ce6535bed37',
        array['where private.crm_account_visible(a.id)', 'private.crm_contact_visible(c.id)', '''canEdit'', private.crm_editor()'],
        array['where true', 'private.crm_in_pool(c.id)', '''canEdit'', ((select private.is_admin()) or a.owner_id = (select auth.uid()))']),
      ('private.rpc_crm_account_detail(uuid)'::text, 'a1e592c741d739205ff76d75de4d5474',
        array['if not private.crm_account_visible(p_id)', 'private.crm_contact_visible(c.id)'],
        array['if not exists (select 1 from public.crm_accounts a where a.id = p_id)', 'private.crm_in_pool(c.id)']),
      ('private.rpc_crm_follow_ups(uuid, text, boolean)'::text, '5fa1af54f098b93cb0c83a714191d18f',
        array['coalesce(p_owner, private.effective_uid())) and private.crm_entity_visible(a.entity, a.entity_id)), ''[]''::jsonb)'],
        array['coalesce(p_owner, private.effective_uid())), ''[]''::jsonb)']),
      ('private.rpc_crm_report(date, date)'::text, 'cc40c7052426d6aa0e4b31e68f179bb3',
        array['public.crm_leads where private.crm_owner_ok(owner_id) and archived_at is null'],
        array['public.crm_leads where archived_at is null']),
      ('private.rpc_crm_invited_meetings(text, uuid)'::text, 'ec97be86328006b4ab8b7dcac069ac39',
        array['if not private.crm_entity_visible(p_entity, p_id) then raise exception ''Record not found.'' using errcode = ''P0002''; end if;'],
        array['if not exists (select 1 from public.crm_leads where p_entity = ''lead'' and id = p_id union all select 1 from public.contacts where p_entity = ''contact'' and id = p_id union all select 1 from public.crm_accounts where p_entity = ''account'' and id = p_id union all select 1 from public.crm_opportunities where p_entity = ''opportunity'' and id = p_id) then raise exception ''Record not found.'' using errcode = ''P0002''; end if;']),
      ('private.rpc_crm_convert_lead(uuid, jsonb)'::text, '622947fd79b14c039a5efaf57bce4047',
        array['perform private.crm_need(true);',
              'if l.id is null or not private.crm_owner_ok(l.owner_id) then raise exception ''Lead not found.'' using errcode = ''P0002''; end if;',
              'not private.crm_account_visible(v_acc)'],
        array['perform private.crm_need();',
              'if l.id is null then raise exception ''Lead not found.'' using errcode = ''P0002''; end if; if coalesce(private.is_admin(), false) is not true and l.owner_id is distinct from auth.uid() then raise exception ''Only the owner or an admin can change this record.'' using errcode = ''42501''; end if;',
              'not exists (select 1 from public.crm_accounts a where a.id = v_acc)']),
      ('private.rpc_crm_update_contact(uuid, jsonb)'::text, 'b2c4e337b3e4384ba4b85d33c7b3e90a',
        array['perform private.crm_need(true);',
              'if not private.crm_contact_visible(p_id) then raise exception ''Client not found.'' using errcode = ''P0002''; end if;',
              'not private.crm_account_visible(v_acc)'],
        array['perform private.crm_need();',
              'if not private.crm_in_pool(p_id) then raise exception ''Client not found.'' using errcode = ''P0002''; end if; if auth.uid() is not null and coalesce(private.is_admin(), false) is not true and (select c.crm_owner_id from public.contacts c where c.id = p_id) is distinct from auth.uid() then raise exception ''Only the owner or an admin can change this record.'' using errcode = ''42501''; end if;',
              'not exists (select 1 from public.crm_accounts a where a.id = v_acc)']),
      ('private.rpc_crm_close_task(uuid)'::text, 'f5578227e9a699990d00086c9f5aba8a',
        array['perform private.crm_need(true);',
              'if a.id is null or not private.crm_entity_visible(a.entity, a.entity_id) then raise exception ''Task not found.'' using errcode = ''P0002''; end if;'],
        array['perform private.crm_need();',
              'if a.id is null then raise exception ''Task not found.'' using errcode = ''P0002''; end if; if coalesce(private.is_admin(), false) is not true and a.owner_id is distinct from auth.uid() then raise exception ''Only the owner or an admin can change this record.'' using errcode = ''42501''; end if;']),
      ('private.rpc_crm_archive(text, uuid, boolean)'::text, 'eef5a08bf76909431f1467fd67db1609',
        array['declare v timestamptz := case when p_archived then now() end;',
              'perform private.crm_need(true);',
              'if not private.crm_entity_visible(p_entity, p_id) then raise exception ''Record not found.'' using errcode = ''P0002''; end if;'],
        array['declare v timestamptz := case when p_archived then now() end; v_owner uuid;',
              'perform private.crm_need();',
              'if p_entity = ''contact'' then select c.crm_owner_id into v_owner from public.contacts c where c.id = p_id and private.crm_in_pool(c.id); elsif p_entity = ''lead'' then select l.owner_id into v_owner from public.crm_leads l where l.id = p_id; elsif p_entity = ''account'' then select a.owner_id into v_owner from public.crm_accounts a where a.id = p_id; elsif p_entity = ''opportunity'' then select o.owner_id into v_owner from public.crm_opportunities o where o.id = p_id; else raise exception ''Record not found.'' using errcode = ''P0002''; end if; if not found then raise exception ''Record not found.'' using errcode = ''P0002''; end if; if coalesce(private.is_admin(), false) is not true and v_owner is distinct from auth.uid() then raise exception ''Only the owner or an admin can change this record.'' using errcode = ''42501''; end if;']),
      ('private.crm_row_guard()'::text, 'fa817fbc0bbf15af35ad9c8681ff9e97',
        array['if private.effective_uid() is not null and not private.crm_editor() then raise exception ''You cannot change CRM records.'' using errcode = ''42501''; end if;'],
        array['if private.effective_uid() is not null then if tg_table_name in (''crm_leads'', ''crm_accounts'', ''crm_opportunities'', ''crm_activities'') then if tg_op = ''UPDATE'' and coalesce(private.is_admin(), false) is not true and old.owner_id is distinct from auth.uid() then raise exception ''Only the owner or an admin can change this record.'' using errcode = ''42501''; end if; if tg_op = ''INSERT'' and tg_table_name = ''crm_activities'' and coalesce(new.system, false) is not true and coalesce(private.is_admin(), false) is not true and not private.crm_editor() and new.owner_id is not null and new.owner_id is distinct from auth.uid() then raise exception ''Only the owner or an admin can change this record.'' using errcode = ''42501''; end if; if tg_op = ''INSERT'' and tg_table_name <> ''crm_activities'' and coalesce(private.is_admin(), false) is not true and not private.crm_editor() and new.owner_id is not null and new.owner_id is distinct from auth.uid() then raise exception ''Only the owner or an admin can change this record.'' using errcode = ''42501''; end if; elsif not private.crm_editor() then raise exception ''You cannot change CRM records.'' using errcode = ''42501''; end if; end if;']),
      ('private.contacts_crm_guard()'::text, '1c14372504fe5cc9c612e05c7c5683c1',
        array['if private.effective_uid() is not null and not private.crm_editor() then raise exception ''You cannot change CRM details.'' using errcode = ''42501''; end if;'],
        array['if private.effective_uid() is not null and coalesce(private.is_admin(), false) is not true and old.crm_owner_id is distinct from auth.uid() and (new.crm_owner_id is distinct from old.crm_owner_id or new.account_id is distinct from old.account_id or new.crm_stage is distinct from old.crm_stage or new.tags is distinct from old.tags or new.crm_notes is distinct from old.crm_notes or new.crm_lead_id is distinct from old.crm_lead_id or new.crm_archived_at is distinct from old.crm_archived_at or new.role_in_company is distinct from old.role_in_company or new.title is distinct from old.title or new.mobile is distinct from old.mobile or new.assistant is distinct from old.assistant or new.asst_phone is distinct from old.asst_phone or new.agent_split is distinct from old.agent_split or new.license_no is distinct from old.license_no or new.sales_volume_last_year is distinct from old.sales_volume_last_year or new.deals_closed_last_year is distinct from old.deals_closed_last_year or new.zillow_url is distinct from old.zillow_url or new.crm_street is distinct from old.crm_street or new.crm_city is distinct from old.crm_city or new.crm_state is distinct from old.crm_state or new.crm_zip is distinct from old.crm_zip or new.crm_county is distinct from old.crm_county or new.links is distinct from old.links or new.lead_source is distinct from old.lead_source or new.relationship_status is distinct from old.relationship_status or new.custom is distinct from old.custom) then raise exception ''Only the owner or an admin can change this record.'' using errcode = ''42501''; end if;'])
    ) as v(sig, expect, olds, news)
  loop
    src := pg_get_functiondef(r.sig::regprocedure);
    got := md5(src);
    if got is distinct from r.expect then
      raise exception 'drift: % md5 %', r.sig, got;
    end if;
    for i in 1 .. cardinality(r.olds) loop
      needle := r.olds[i];
      repl := r.news[i];
      n := (length(src) - length(replace(src, needle, ''))) / nullif(length(needle), 0);
      if coalesce(n, 0) <> 1 then
        raise exception 'drift: % needle occurs % times: %', r.sig, n, needle;
      end if;
      src := replace(src, needle, repl);
    end loop;
    execute src;
  end loop;
end
$swap$;

-- Mass update stays security invoker (no private.* call). It skips rows the
-- signer does not own. Portal deals are unchanged, including the processor stop.
do $mass_before$
declare got text;
begin
  got := md5(pg_get_functiondef('public.crm_mass_update(text, jsonb, text, text, uuid[])'::regprocedure));
  if got is distinct from '676dc1427542fe531650b996357e79e1' then
    raise exception 'drift: crm_mass_update md5 %', got;
  end if;
end
$mass_before$;

create or replace function public.crm_mass_update(p_module text, p_filter jsonb, p_field text, p_value text, p_ids uuid[] default null)
returns jsonb
language plpgsql
volatile
set search_path = pg_catalog, public, extensions
as $$
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
  matched int := 0;
  skipped int := 0;
  v_admin boolean := false;
  v_uid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required.' using errcode = '42501'; end if;
  if val = '' then raise exception 'Enter the new value.' using errcode = '22023'; end if;
  if m = 'lead' and field not in ('notes', 'relationshipStatus', 'leadSource') then raise exception 'That field cannot be changed for every selected record.' using errcode = '22023'; end if;
  if m = 'contact' and field <> 'notes' then raise exception 'That field cannot be changed for every selected record.' using errcode = '22023'; end if;
  if m = 'account' and field not in ('notes', 'kind') then raise exception 'That field cannot be changed for every selected record.' using errcode = '22023'; end if;
  if m = 'opportunity' and field not in ('notes', 'stage') then raise exception 'That field cannot be changed for every selected record.' using errcode = '22023'; end if;
  if m = 'deal' and field <> 'notes' then raise exception 'That field cannot be changed for every selected record.' using errcode = '22023'; end if;
  if p_ids is not null and cardinality(p_ids) > 100 then raise exception 'Select at most one page of records.' using errcode = '22023'; end if;
  if m = 'deal' and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('Processor', 'Preprocessor')) then
    raise exception 'The Processor has read-only access to the CRM.' using errcode = '42501';
  end if;
  select coalesce(p.is_admin, false) into v_admin
    from public.profiles p where p.id = auth.uid() and p.status = 'active';
  v_admin := coalesce(v_admin, false);
  v_uid := auth.uid();
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
    select count(*) into matched from public.crm_leads where case when p_ids is null then id in (select public.crm_match_ids(m, coalesce(p_filter, '{}'::jsonb))) else id = any(p_ids) end;
    update public.crm_leads set notes = case when btrim(coalesce(notes, '')) = '' then stamp || E'\n' || val else btrim(notes) || E'\n\n---\n' || stamp || E'\n' || val end, modified_at = now()
    where case when p_ids is null then id in (select public.crm_match_ids(m, coalesce(p_filter, '{}'::jsonb))) else id = any(p_ids) end
      and (v_admin or owner_id = v_uid);
  elsif m = 'lead' and field = 'relationshipStatus' then
    select count(*) into matched from public.crm_leads where case when p_ids is null then id in (select public.crm_match_ids(m, coalesce(p_filter, '{}'::jsonb))) else id = any(p_ids) end;
    update public.crm_leads set status = val, modified_at = now() where case when p_ids is null then id in (select public.crm_match_ids(m, coalesce(p_filter, '{}'::jsonb))) else id = any(p_ids) end and (v_admin or owner_id = v_uid);
  elsif m = 'lead' and field = 'leadSource' then
    select count(*) into matched from public.crm_leads where case when p_ids is null then id in (select public.crm_match_ids(m, coalesce(p_filter, '{}'::jsonb))) else id = any(p_ids) end;
    update public.crm_leads set source = val, modified_at = now() where case when p_ids is null then id in (select public.crm_match_ids(m, coalesce(p_filter, '{}'::jsonb))) else id = any(p_ids) end and (v_admin or owner_id = v_uid);
  elsif m = 'contact' then
    select count(*) into matched from public.contacts where case when p_ids is null then id in (select public.crm_match_ids(m, coalesce(p_filter, '{}'::jsonb))) else id = any(p_ids) end;
    update public.contacts set crm_notes = case when btrim(coalesce(crm_notes, '')) = '' then stamp || E'\n' || val else btrim(crm_notes) || E'\n\n---\n' || stamp || E'\n' || val end, modified_at = now(), modified_by = auth.uid()
    where case when p_ids is null then id in (select public.crm_match_ids(m, coalesce(p_filter, '{}'::jsonb))) else id = any(p_ids) end
      and (v_admin or crm_owner_id = v_uid);
  elsif m = 'account' and field = 'notes' then
    select count(*) into matched from public.crm_accounts where case when p_ids is null then id in (select public.crm_match_ids(m, coalesce(p_filter, '{}'::jsonb))) else id = any(p_ids) end;
    update public.crm_accounts set notes = case when btrim(coalesce(notes, '')) = '' then stamp || E'\n' || val else btrim(notes) || E'\n\n---\n' || stamp || E'\n' || val end, modified_at = now()
    where case when p_ids is null then id in (select public.crm_match_ids(m, coalesce(p_filter, '{}'::jsonb))) else id = any(p_ids) end
      and (v_admin or owner_id = v_uid);
  elsif m = 'account' and field = 'kind' then
    select count(*) into matched from public.crm_accounts where case when p_ids is null then id in (select public.crm_match_ids(m, coalesce(p_filter, '{}'::jsonb))) else id = any(p_ids) end;
    update public.crm_accounts set kind = val, modified_at = now() where case when p_ids is null then id in (select public.crm_match_ids(m, coalesce(p_filter, '{}'::jsonb))) else id = any(p_ids) end and (v_admin or owner_id = v_uid);
  elsif m = 'opportunity' and field = 'notes' then
    select count(*) into matched from public.crm_opportunities where case when p_ids is null then id in (select public.crm_match_ids(m, coalesce(p_filter, '{}'::jsonb))) else id = any(p_ids) end;
    update public.crm_opportunities set notes = case when btrim(coalesce(notes, '')) = '' then stamp || E'\n' || val else btrim(notes) || E'\n\n---\n' || stamp || E'\n' || val end, modified_at = now()
    where case when p_ids is null then id in (select public.crm_match_ids(m, coalesce(p_filter, '{}'::jsonb))) else id = any(p_ids) end
      and (v_admin or owner_id = v_uid);
  elsif m = 'opportunity' and field = 'stage' then
    select count(*) into matched from public.crm_opportunities where case when p_ids is null then id in (select public.crm_match_ids(m, coalesce(p_filter, '{}'::jsonb))) else id = any(p_ids) end;
    update public.crm_opportunities set stage = val, modified_at = now() where case when p_ids is null then id in (select public.crm_match_ids(m, coalesce(p_filter, '{}'::jsonb))) else id = any(p_ids) end and (v_admin or owner_id = v_uid);
  elsif m = 'deal' then
    update public.deals set notes = case when btrim(coalesce(notes, '')) = '' then stamp || E'\n' || val else btrim(notes) || E'\n\n---\n' || stamp || E'\n' || val end
    where case when p_ids is null then id in (select public.crm_match_ids(m, coalesce(p_filter, '{}'::jsonb))) else id = any(p_ids) end;
  else raise exception 'Unknown list.' using errcode = '22023';
  end if;
  get diagnostics n = row_count;
  if m <> 'deal' then skipped := greatest(matched - n, 0); end if;
  return jsonb_build_object('count', n, 'updated', n, 'failed', 0, 'skipped', skipped);
end
$$;

revoke all on function public.crm_mass_update(text, jsonb, text, text, uuid[]) from public, anon;
grant execute on function public.crm_mass_update(text, jsonb, text, text, uuid[]) to authenticated;

do $readback$
declare
  q text;
  src text;
  deals_q text;
begin
  select qual into q from pg_policies
   where schemaname = 'public' and tablename = 'crm_leads' and policyname = 'crm_leads_update';
  if q !~ '\( SELECT private\.is_admin\(\) AS is_admin\)' and q !~ '\(SELECT private\.is_admin\(\)\)' and position('(select private.is_admin())' in lower(q)) = 0 then
    raise exception 'readback: lead update is not an initplan admin check: %', q;
  end if;
  if position('auth.uid()' in q) = 0 or position('owner_id' in q) = 0 then
    raise exception 'readback: lead update does not compare owner_id to auth.uid(): %', q;
  end if;
  if q ~ 'crm_owner_ok|crm_account_visible|crm_entity_visible|crm_contact_visible' then
    raise exception 'readback: lead update still calls a per-row helper: %', q;
  end if;
  select qual into q from pg_policies
   where schemaname = 'public' and tablename = 'crm_leads' and policyname = 'crm_leads_select';
  if position('crm_user()' in q) = 0 or q ~ 'crm_owner_ok' then
    raise exception 'readback: lead select is %', q;
  end if;
  select qual into deals_q from pg_policies
   where schemaname = 'public' and tablename = 'deals' and policyname = 'deals_select';
  if deals_q is distinct from '(( SELECT ((private.me_role() IS NOT NULL) AND (private.is_admin() OR (private.me_role() = ANY (ARRAY[''Processor''::text, ''Sales Team''::text, ''Transaction Coordinator''::text]))))) OR private.can_access_deal(id))' then
    raise exception 'readback: deals_select changed';
  end if;
  select pg_get_functiondef('public.crm_mass_update(text, jsonb, text, text, uuid[])'::regprocedure) into src;
  if position('private.' in src) > 0 then
    raise exception 'readback: mass update calls private';
  end if;
  if position('v_admin or owner_id' in src) = 0 or position('v_admin or crm_owner_id' in src) = 0 or position('''skipped''' in src) = 0 then
    raise exception 'readback: mass update does not skip other owners';
  end if;
  if position('update public.deals set notes' in src) = 0 then
    raise exception 'readback: deal mass update was rewritten';
  end if;
  if position('Only the owner or an admin can change this record.' in pg_get_functiondef('private.crm_row_guard()'::regprocedure)) = 0 then
    raise exception 'readback: row guard does not state the owner rule';
  end if;
  if to_regclass('public.crm_accounts_owner_idx') is null or to_regclass('public.crm_opportunities_owner_idx') is null then
    raise exception 'readback: owner index missing';
  end if;
  select qual, with_check into q, src from pg_policies
   where schemaname = 'public' and tablename = 'contacts' and policyname = 'crm_clients_read';
  if position('crm_stage IS NOT NULL' in q) = 0 and position('crm_stage is not null' in q) = 0 then
    raise exception 'readback: client read is not limited to a CRM stage: %', q;
  end if;
  if position('crm_staff_profile_ids' in q) = 0 or q ~ 'not exists' then
    raise exception 'readback: client read still looks up profiles per row: %', q;
  end if;
  if to_regprocedure('private.crm_staff_profile_ids()') is null then
    raise exception 'readback: crm_staff_profile_ids is missing';
  end if;
end
$readback$;

commit;
