-- Read-only check for CRM module roles. Run as postgres after
-- supabase/migrations/20261109234000_crm_module_roles.sql.
-- One transaction. The last statement is ROLLBACK. Fake profiles only.
--
-- Processor and Preprocessor stay private.crm_user() (pick lists and their
-- own signature) and are not private.crm_module_user() (crm_deals refuses).
-- A Sales Person is a module user and does not see every deal.
-- Sales Team and Admin see every deal. An Outside user is neither.

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public, extensions;

do $setup$
declare
  proc uuid := 'c1111111-1111-4111-8111-111111111111';
  pre uuid := 'c2222222-2222-4222-8222-222222222222';
  sales uuid := 'c3333333-3333-4333-8333-333333333333';
  team uuid := 'c4444444-4444-4444-8444-444444444444';
  admin uuid := 'c5555555-5555-4555-8555-555555555555';
  outsider uuid := 'c6666666-6666-4666-8666-666666666666';
begin
  if to_regprocedure('private.crm_module_user()') is null then
    raise exception 'private.crm_module_user() is missing; apply 20261109234000_crm_module_roles first';
  end if;
  if not coalesce((select enabled from private.features where name = 'crm'), false) then
    raise exception 'private.features crm is off; this check needs it on';
  end if;
  insert into public.profiles (id, email, first_name, last_name, phone, role, status, is_admin, is_demo)
  values
    (proc, 'crm-mod-proc@example.test', 'Fake', 'Processor', '', 'Processor', 'active', false, false),
    (pre, 'crm-mod-pre@example.test', 'Fake', 'Preprocessor', '', 'Preprocessor', 'active', false, false),
    (sales, 'crm-mod-sales@example.test', 'Fake', 'Sales', '', 'Sales Person', 'active', false, false),
    (team, 'crm-mod-team@example.test', 'Fake', 'Team', '', 'Sales Team', 'active', false, false),
    (admin, 'crm-mod-admin@example.test', 'Fake', 'Admin', '', 'Admin', 'active', true, false),
    (outsider, 'crm-mod-out@example.test', 'Fake', 'Outsider', '', 'Outside user', 'active', false, false);
  insert into public.crm_picklist_options (list_key, value, label, position)
  values ('leadSource', 'crm-mod-fake-source', 'CRM module check', 9999);
end
$setup$;

do $check$
declare
  proc uuid := 'c1111111-1111-4111-8111-111111111111';
  pre uuid := 'c2222222-2222-4222-8222-222222222222';
  sales uuid := 'c3333333-3333-4333-8333-333333333333';
  team uuid := 'c4444444-4444-4444-8444-444444444444';
  admin uuid := 'c5555555-5555-4555-8555-555555555555';
  outsider uuid := 'c6666666-6666-4666-8666-666666666666';
  n int;
  msg text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', proc, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', proc::text, true);
  if private.crm_user() is not true or private.crm_module_user() is not false or private.crm_deal_scope_all() is not false then
    raise exception 'Processor: crm_user % module % scope %', private.crm_user(), private.crm_module_user(), private.crm_deal_scope_all();
  end if;
  begin
    perform public.crm_deals(null, null, null, null);
    raise exception 'Processor was allowed to call crm_deals';
  exception when sqlstate '42501' then
    get stacked diagnostics msg = message_text;
    if msg is distinct from 'The CRM is for CLA staff only.' then
      raise exception 'Processor crm_deals message was %', msg;
    end if;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', pre, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pre::text, true);
  if private.crm_user() is not true or private.crm_module_user() is not false or private.crm_deal_scope_all() is not false then
    raise exception 'Preprocessor lost a shared read or kept deal-wide scope';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', sales, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', sales::text, true);
  if private.crm_module_user() is not true or private.crm_deal_scope_all() is not false then
    raise exception 'Sales Person module % scope %', private.crm_module_user(), private.crm_deal_scope_all();
  end if;
  perform public.crm_deals(null, null, null, null);

  perform set_config('request.jwt.claims', json_build_object('sub', team, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', team::text, true);
  if private.crm_module_user() is not true or private.crm_deal_scope_all() is not true then
    raise exception 'Sales Team should see every deal';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', admin::text, true);
  if private.crm_module_user() is not true or private.crm_deal_scope_all() is not true then
    raise exception 'Admin should see every deal';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', outsider, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', outsider::text, true);
  if private.crm_user() is not false or private.crm_module_user() is not false then
    raise exception 'Outside user is not shut out of the CRM';
  end if;

  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', proc, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', proc::text, true);
  set local role authenticated;
  select count(*) into n from public.crm_picklist_options where value = 'crm-mod-fake-source';
  if n is distinct from 1 then
    raise exception 'Processor could not read the lead-source pick list (% rows)', n;
  end if;
  insert into public.crm_user_signatures (user_id, html) values (proc, 'fake signature');
  select count(*) into n from public.crm_user_signatures where user_id = proc;
  if n is distinct from 1 then
    raise exception 'Processor could not keep their own signature';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', outsider, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', outsider::text, true);
  select count(*) into n from public.crm_picklist_options where value = 'crm-mod-fake-source';
  if n is distinct from 0 then
    raise exception 'Outside user saw the pick list';
  end if;
  begin
    insert into public.crm_user_signatures (user_id, html) values (outsider, 'no');
    raise exception 'Outside user inserted a signature';
  exception when insufficient_privilege or check_violation or sqlstate '42501' then
    null;
  end;

  raise notice 'crm module role check passed';
end
$check$;

rollback;
