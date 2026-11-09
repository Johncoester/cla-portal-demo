-- Checks after the role access migration (disposable local Postgres only). Any failure stops psql (ON_ERROR_STOP).
create or replace function public.ra_ok(c boolean, msg text) returns void language plpgsql as $$ begin if c is not true then raise exception 'FAIL: %', msg; end if; end $$;
create or replace function public.ra_err(q text, pat text, msg text) returns void language plpgsql as $$
begin execute q; raise exception 'FAIL (no error): %', msg; exception when others then if sqlerrm like 'FAIL (no error)%' or sqlerrm !~* pat then raise exception 'FAIL: % (got: %)', msg, sqlerrm; end if; end $$;
grant execute on function public.ra_ok(boolean, text), public.ra_err(text, text, text) to authenticated;

-- 1. seeded behaviour is identical to before for every role (each person, every surface in ra_behavior)
select public.ra_ok((select count(*) from public.ra_snap where phase = 'before') = 9, 'nine people in the before snapshot');
select public.ra_ok(not exists (select 1 from public.ra_snap b join public.ra_snap a on a.uid = b.uid and a.phase = 'after' where b.phase = 'before' and a.data is distinct from b.data),
  'seed: every person sees exactly what they saw before (' || coalesce((select string_agg(p.role || ' ' || b.data::text || ' -> ' || a.data::text, ' | ') from public.ra_snap b join public.ra_snap a on a.uid = b.uid and a.phase = 'after' join public.profiles p on p.id = b.uid where b.phase = 'before' and a.data is distinct from b.data), '') || ')');
select public.ra_ok((select count(*) from public.role_module_access) = 18, 'eighteen seeded rows');
select public.ra_ok(not exists (select 1 from public.role_module_access where role in ('Admin', 'Super admin', 'Outside user', 'Employee')), 'no Admin / Super admin / outside / Employee rows');

-- 2. who can read the table: CLA staff yes, outside user and HR-only login no
select public.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
select public.ra_ok((select count(*) from public.role_module_access) = 18, 'processor reads all rows');
select public.ra_ok((select count(*) from public.role_module_access_log) = 0, 'processor reads no log');
reset role; select public.as_user('00000000-0000-0000-0000-000000000009'); set role authenticated;
select public.ra_ok((select count(*) from public.role_module_access) = 0, 'outside user reads nothing');
select public.ra_ok(private.role_can('crm') = false and private.role_can('accounting') = false and private.role_can('hr') = false, 'outside user never gets a staff module');
reset role;

-- 3. nobody but an active Super admin writes; no direct writes at all; Admin / Super admin rows can never exist
select public.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
select public.ra_err($q$select public.set_role_access('Processor', 'crm', false)$q$, 'Only a Super admin', 'processor cannot call set_role_access');
select public.ra_err($q$update public.role_module_access set allowed = false$q$, 'permission denied', 'processor cannot update the table');
select public.ra_err($q$insert into public.role_module_access (role, module, allowed) values ('Transaction Coordinator', 'crm', true)$q$, 'permission denied', 'processor cannot insert');
select public.ra_err($q$delete from public.role_module_access$q$, 'permission denied', 'processor cannot delete');
reset role; select public.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
select public.ra_err($q$select public.set_role_access('Processor', 'crm', false)$q$, 'Only a Super admin', 'a plain Admin cannot change role access');
select public.ra_err($q$update public.role_module_access set allowed = false$q$, 'permission denied', 'Admin cannot update the table directly');
reset role; select public.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select public.ra_err($q$update public.role_module_access set allowed = false$q$, 'permission denied', 'even a Super admin cannot update the table directly');
select public.ra_err($q$select public.set_role_access('Super admin', 'crm', false)$q$, 'always have every module', 'Super admin cannot remove own access');
select public.ra_err($q$select public.set_role_access('Admin', 'accounting', false)$q$, 'always have every module', 'Admin access cannot be removed');
select public.ra_err($q$select public.set_role_access('Outside user', 'crm', true)$q$, 'cannot get that module', 'outside users are never grantable');
select public.ra_err($q$select public.set_role_access('Transaction Coordinator', 'crm', true)$q$, 'cannot get that module', 'TC cannot be granted the CRM (never had it)');
select public.ra_err($q$select public.set_role_access('Processor', 'crm', null)$q$, 'on or off', 'null refused');
reset role;
select public.ra_err($q$insert into public.role_module_access (role, module, allowed) values ('Super admin', 'crm', false)$q$, 'role_module_access_eligible', 'CHECK refuses a Super admin row even for the owner');
select public.ra_err($q$insert into public.role_module_access (role, module, allowed) values ('Outside user', 'accounting', true)$q$, 'role_module_access_eligible', 'CHECK refuses an outside user row');
-- view as: a Super admin viewing as someone cannot write
insert into private.view_as_sessions (actor_id, target_id, expires_at) values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', now() + interval '1 hour');
select public.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select public.ra_err($q$select public.set_role_access('Processor', 'crm', false)$q$, 'View as is read-only', 'no writes while viewing as');
select public.ra_ok(private.role_can('accounting') and private.me_role() = 'Processor', 'view as reads the viewed person''s role');
reset role; update private.view_as_sessions set stopped_at = now();

-- 4. John's first case: Processor CRM off
select public.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select public.ra_ok((public.set_role_access('Processor', 'crm', false) ->> 'allowed') = 'false', 'super admin turns Processor CRM off');
select public.ra_ok(private.role_can('crm') and private.role_can('crm_all_deals') and private.role_can('accounting'), 'Super admin still has everything');
select public.ra_ok(jsonb_array_length(public.crm_deals('All', null, null, null)) = 400, 'Super admin still sees every CRM deal');
reset role;
select public.ra_ok((select count(*) from public.role_module_access_log where role = 'Processor' and module = 'crm' and old_allowed and not new_allowed and changed_by_name = 'Sue Super') = 1, 'change logged with who');
select public.ra_ok((select updated_by from public.role_module_access where role = 'Processor' and module = 'crm') = '00000000-0000-0000-0000-000000000001', 'row stamped with who');
select public.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
select public.ra_err($q$select private.crm_need()$q$, 'turned off for your role', 'Processor: crm_need refuses');
select public.ra_err($q$select public.crm_deals('All', null, null, null)$q$, 'turned off for your role', 'Processor: crm_deals refuses');
select public.ra_err($q$select private.rpc_crm_deals('All', null, null, null)$q$, 'turned off for your role', 'Processor: rpc_crm_deals refuses');
select public.ra_err($q$select public.crm_deal_filters()$q$, 'turned off for your role', 'Processor: crm_deal_filters refuses');
select public.ra_err($q$select private.rpc_crm_deal_filters()$q$, 'turned off for your role', 'Processor: rpc_crm_deal_filters refuses');
select public.ra_err($q$select private.rpc_crm_list_export('leads', 1)$q$, 'turned off for your role', 'Processor: list export refuses');
select public.ra_ok(not private.crm_all() and not private.crm_read_all() and not private.crm_deal_scope_all() and not private.crm_module_user(), 'Processor: no read-all, no all deals');
select public.ra_ok((select count(*) from public.crm_leads) = 0, 'Processor: no CRM leads through the table either');
select public.ra_ok(private.crm_user(), 'crm_user() itself is unchanged for the shared tables');
select public.ra_ok((select count(*) from public.crm_picklist_options where list_key = 'leadSource') = 2, 'Processor: Place Order leadSource picklist still reads');
select public.ra_ok((select count(*) from public.source_of_business_options()) = 2, 'Processor: source_of_business_options still works');
insert into public.crm_user_signatures (user_id, html) values ('00000000-0000-0000-0000-000000000003', '<p>Pat</p>');
update public.crm_user_signatures set html = '<p>Pat P.</p>' where user_id = '00000000-0000-0000-0000-000000000003';
select public.ra_ok((select html from public.crm_user_signatures where user_id = '00000000-0000-0000-0000-000000000003') = '<p>Pat P.</p>', 'Processor: signature read / insert / update still work');
select public.ra_ok(private.acct_reader('10000000-0000-0000-0000-000000000001') and private.acct_editor('10000000-0000-0000-0000-000000000001'), 'Processor keeps Accounting');
reset role; select public.as_user('00000000-0000-0000-0000-000000000004'); set role authenticated;
select public.ra_ok(private.crm_all() and jsonb_array_length(public.crm_deals('All', null, null, null)) = 400 and (select count(*) from public.crm_leads) = 2000, 'Preprocessor unaffected');
reset role;

-- 5. all deals: needs CRM; Sales Person can be given all deals; Sales Team can be narrowed to own
select public.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select public.set_role_access('Preprocessor', 'crm', false);
reset role; select public.as_user('00000000-0000-0000-0000-000000000004'); set role authenticated;
select public.ra_ok(not private.role_can('crm_all_deals') and not private.crm_deal_scope_all(), 'all deals is off when the CRM is off, even with its own box on');
reset role; select public.as_user('00000000-0000-0000-0000-000000000005'); set role authenticated;
select public.ra_ok(jsonb_array_length(public.crm_deals('All', null, null, null)) = 10 and public.crm_deal_filters() ->> 'scope' = 'own', 'Sales Person: own deals by default');
reset role; select public.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select public.set_role_access('Sales Person', 'crm_all_deals', true); select public.set_role_access('Sales Team', 'crm_all_deals', false);
reset role; select public.as_user('00000000-0000-0000-0000-000000000005'); set role authenticated;
select public.ra_ok(jsonb_array_length(public.crm_deals('All', null, null, null)) = 400 and public.crm_deal_filters() ->> 'scope' = 'all', 'Sales Person given all deals');
reset role; select public.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
select public.ra_ok(jsonb_array_length(public.crm_deals('All', null, null, null)) = 0 and public.crm_deal_filters() ->> 'scope' = 'own', 'Sales Team narrowed to own deals');
reset role;

-- 6. Sales Person CRM off: no CRM edit; Accounting off for TC; HR rows are app-only (no database effect)
select public.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select public.set_role_access('Sales Person', 'crm', false); select public.set_role_access('Transaction Coordinator', 'accounting', false); select public.set_role_access('Processor', 'accounting', false);
reset role; select public.as_user('00000000-0000-0000-0000-000000000005'); set role authenticated;
select public.ra_ok(not private.crm_editor(), 'Sales Person with CRM off is not a CRM editor');
select public.ra_err($q$select private.crm_need(true)$q$, 'turned off for your role', 'Sales Person: crm_need(edit) refuses');
reset role; select public.as_user('00000000-0000-0000-0000-000000000007'); set role authenticated;
select public.ra_ok(not private.acct_reader('10000000-0000-0000-0000-000000000001') and (select count(*) from public.accounting_fees) = 0, 'TC Accounting off: no fees');
reset role; select public.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
select public.ra_ok(not private.acct_editor('10000000-0000-0000-0000-000000000001') and not private.acct_reader('10000000-0000-0000-0000-000000000001'), 'Processor Accounting off: no read, no edit');
reset role; select public.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
select public.ra_ok(private.acct_editor('10000000-0000-0000-0000-000000000001') and private.crm_all(), 'Admin keeps everything');
reset role;
-- 7. turning back on restores it; the log keeps every change
select public.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select public.set_role_access(role, module, true) from public.role_module_access where not allowed and not (role = 'Sales Person' and module = 'crm_all_deals');
select public.set_role_access('Sales Person', 'crm_all_deals', false); select public.set_role_access('Sales Team', 'crm_all_deals', true);
select public.ra_ok((select count(*) from public.role_module_access_log) >= 12, 'every change logged');
reset role;
select public.ra_ok(not exists (select 1 from public.role_module_access r where r.allowed is distinct from (r.role <> 'Sales Person' or r.module <> 'crm_all_deals')), 'back to the seed');
