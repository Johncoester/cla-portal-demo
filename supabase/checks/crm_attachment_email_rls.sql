-- Read-only check for crm_attachments rows whose entity is email.
-- Run as postgres (table owner / superuser) in the SQL editor, before and after
-- supabase/migrations/20261109172229_crm_attachment_email_rls.sql.
-- One transaction. There is no COMMIT. The last statement is ROLLBACK.
-- Every profile, lead, email, and attachment below is fake and is discarded.
--
-- The column is entity, not entity_type. Email attachments are entity = 'email'.
-- The staff persona is a Sales Person (CLA staff who may edit the CRM).
-- The non-staff persona is an Outside user.
-- private.features 'crm' must be enabled, which it is on TEST.
--
-- Expected while the policies still say e.id = e.entity_id, and no crm_emails
-- row has id = entity_id (the notice at the top reports that count):
--   STAFF select: (none)
--   STAFF insert linked to the email: denied
--   STAFF insert not linked to an email: denied
--   NONSTAFF select: (none)
--   NONSTAFF insert linked to the email: denied
--   NONSTAFF insert not linked to an email: denied
--
-- Expected after the migration (attachment.entity_id = crm_emails.id):
--   STAFF select: linked a5555555-5555-4555-8555-555555555555
--   STAFF insert linked to the email: allowed
--   STAFF insert not linked to an email: denied
--   NONSTAFF select: (none)
--   NONSTAFF insert linked to the email: denied
--   NONSTAFF insert not linked to an email: denied
-- A Processor is staff for reading and read-only for inserts; this script's
-- staff persona is a Sales Person so the insert check can succeed.

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public, extensions;

do $setup$
declare
  staff uuid := 'a1111111-1111-4111-8111-111111111111';
  outsider uuid := 'a2222222-2222-4222-8222-222222222222';
  lead uuid := 'a3333333-3333-4333-8333-333333333333';
  email uuid := 'a4444444-4444-4444-8444-444444444444';
  linked uuid := 'a5555555-5555-4555-8555-555555555555';
  orphan uuid := 'a6666666-6666-4666-8666-666666666666';
  role_value text;
  self_compare int;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  if private.effective_uid() is not null then
    raise exception 'setup expected no JWT user before the fake profiles are inserted';
  end if;
  if not coalesce((select enabled from private.features where name = 'crm'), false) then
    raise exception 'private.features crm is off; this check needs it on';
  end if;

  insert into public.profiles (id, email, first_name, last_name, phone, role, status, is_admin, is_demo)
  values
    (staff, 'crm-att-rls-staff-59c4@example.test', 'Rls', 'Staff', '', 'Sales Person', 'active', false, false),
    (outsider, 'crm-att-rls-outsider-59c4@example.test', 'Rls', 'Outsider', '', 'Outside user', 'active', false, false);

  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', staff::text, true);

  select o.value into role_value
  from public.crm_picklist_options o
  where o.list_key = 'roleInCompany' and not o.retired
  order by o.position
  limit 1;

  insert into public.crm_leads (id, first_name, last_name, email, owner_id, role_in_company, crm_state)
  values (lead, 'Fake', 'Rlslead', 'crm-att-rls-lead-59c4@example.test', staff, coalesce(role_value, ''), 'MD');

  insert into public.crm_emails (id, entity, entity_id, from_email, to_emails, subject, body_html, status)
  values (email, 'lead', lead, 'crm-att-rls-staff-59c4@example.test', array['crm-att-rls-lead-59c4@example.test'], 'RLS check', '', 'drafted');

  insert into public.crm_attachments (id, entity, entity_id, name)
  values
    (linked, 'email', email, 'linked.pdf'),
    (orphan, 'email', 'a9999999-9999-4999-8999-999999999999', 'orphan.pdf');

  select count(*) into self_compare from public.crm_emails where id = entity_id;
  raise notice 'emails whose id equals entity_id (old predicate can match these): %', self_compare;
end
$setup$;

select set_config('request.jwt.claims', json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);
set local role authenticated;

do $staff_select$
declare seen text;
begin
  select coalesce(string_agg(id::text || ' ' || case id
      when 'a5555555-5555-4555-8555-555555555555' then 'linked'
      when 'a6666666-6666-4666-8666-666666666666' then 'orphan'
      else 'other' end, ', ' order by id), '(none)')
    into seen
  from public.crm_attachments
  where entity = 'email'
    and id in ('a5555555-5555-4555-8555-555555555555', 'a6666666-6666-4666-8666-666666666666');
  raise notice 'STAFF select: %', seen;
end
$staff_select$;

savepoint staff_linked;
do $staff_ins_linked$
begin
  insert into public.crm_attachments (id, entity, entity_id, name)
  values ('a7777777-7777-4777-8777-777777777777', 'email', 'a4444444-4444-4444-8444-444444444444', 'staff-linked.pdf');
  raise notice 'STAFF insert linked to the email: allowed';
exception when others then
  raise notice 'STAFF insert linked to the email: denied (%)', sqlerrm;
end
$staff_ins_linked$;
rollback to savepoint staff_linked;

savepoint staff_orphan;
do $staff_ins_orphan$
begin
  insert into public.crm_attachments (id, entity, entity_id, name)
  values ('a8888888-8888-4888-8888-888888888888', 'email', 'a9999999-9999-4999-8999-999999999999', 'staff-orphan.pdf');
  raise notice 'STAFF insert not linked to an email: allowed';
exception when others then
  raise notice 'STAFF insert not linked to an email: denied (%)', sqlerrm;
end
$staff_ins_orphan$;
rollback to savepoint staff_orphan;

reset role;

select set_config('request.jwt.claims', json_build_object('sub', 'a2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', 'a2222222-2222-4222-8222-222222222222', true);
set local role authenticated;

do $outsider_select$
declare seen text;
begin
  select coalesce(string_agg(id::text || ' ' || case id
      when 'a5555555-5555-4555-8555-555555555555' then 'linked'
      when 'a6666666-6666-4666-8666-666666666666' then 'orphan'
      else 'other' end, ', ' order by id), '(none)')
    into seen
  from public.crm_attachments
  where entity = 'email'
    and id in ('a5555555-5555-4555-8555-555555555555', 'a6666666-6666-4666-8666-666666666666');
  raise notice 'NONSTAFF select: %', seen;
end
$outsider_select$;

savepoint outsider_linked;
do $outsider_ins_linked$
begin
  insert into public.crm_attachments (id, entity, entity_id, name)
  values ('a7777777-7777-4777-8777-777777777777', 'email', 'a4444444-4444-4444-8444-444444444444', 'outsider-linked.pdf');
  raise notice 'NONSTAFF insert linked to the email: allowed';
exception when others then
  raise notice 'NONSTAFF insert linked to the email: denied (%)', sqlerrm;
end
$outsider_ins_linked$;
rollback to savepoint outsider_linked;

savepoint outsider_orphan;
do $outsider_ins_orphan$
begin
  insert into public.crm_attachments (id, entity, entity_id, name)
  values ('a8888888-8888-4888-8888-888888888888', 'email', 'a9999999-9999-4999-8999-999999999999', 'outsider-orphan.pdf');
  raise notice 'NONSTAFF insert not linked to an email: allowed';
exception when others then
  raise notice 'NONSTAFF insert not linked to an email: denied (%)', sqlerrm;
end
$outsider_ins_orphan$;
rollback to savepoint outsider_orphan;

reset role;
rollback;
