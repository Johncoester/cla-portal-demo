-- Rollback for MF-056 scheduling details. Drops the new columns, the link table and the new functions.
-- Restores the agent task list, the task check, and the task copy the way they were before this change.
-- A scheduling task that was already submitted stays on the file. Ones never submitted are cancelled.
-- Does not drop deals.closer_name (MF-011).
begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public, extensions;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'deals' and column_name = 'sched_buyer_date'
  ) then raise exception 'drift: scheduling columns are not present'; end if;
end $$;

update public.tasks set status = 'cancelled'
 where template_code = 'agent_schedule_settlement' and status <> 'cancelled'
   and (form_data is null or form_data = '{}'::jsonb);

drop trigger if exists tasks_schedule_apply on public.tasks;
drop function if exists private.tasks_schedule_apply();
drop trigger if exists deals_schedule_guard on public.deals;
drop function if exists private.deals_schedule_guard();

alter table public.deals drop constraint if exists deals_sched_buyer_time;
alter table public.deals drop constraint if exists deals_sched_seller_time;
alter table public.deals drop constraint if exists deals_sched_buyer_place;
alter table public.deals drop constraint if exists deals_sched_seller_place;
alter table public.deals drop constraint if exists deals_sched_notes_len;

alter table public.deals
  drop column if exists sched_buyer_ask,
  drop column if exists sched_buyer_date,
  drop column if exists sched_buyer_time,
  drop column if exists sched_buyer_place,
  drop column if exists sched_buyer_office_id,
  drop column if exists sched_buyer_office_name,
  drop column if exists sched_buyer_street,
  drop column if exists sched_buyer_city,
  drop column if exists sched_buyer_state,
  drop column if exists sched_buyer_zip,
  drop column if exists sched_buyer_notes,
  drop column if exists sched_buyer_ron,
  drop column if exists sched_buyer_by,
  drop column if exists sched_seller_ask,
  drop column if exists sched_seller_date,
  drop column if exists sched_seller_time,
  drop column if exists sched_seller_place,
  drop column if exists sched_seller_office_id,
  drop column if exists sched_seller_office_name,
  drop column if exists sched_seller_street,
  drop column if exists sched_seller_city,
  drop column if exists sched_seller_state,
  drop column if exists sched_seller_zip,
  drop column if exists sched_seller_notes,
  drop column if exists sched_seller_ron,
  drop column if exists sched_seller_by,
  drop column if exists settlement_agent_name,
  drop column if exists settlement_agent_profile_id,
  drop column if exists settlement_agent_confirmed,
  drop column if exists scheduling_processor_notes;

drop table if exists public.scheduling_links;

drop function if exists public.get_party_schedule(text);
drop function if exists public.submit_party_schedule(text, jsonb);
drop function if exists public.scheduling_copy_links(uuid);
drop function if exists public.save_settlement_agent(uuid, text, uuid, boolean);
drop function if exists public.save_scheduling_notes(uuid, text);
drop function if exists private.save_side_schedule(uuid, jsonb, text);
drop function if exists private.schedule_check(jsonb);

create or replace function private.agent_task_defs()
returns table(code text, title text, about text, due_days integer)
language sql immutable set search_path = pg_catalog, public, extensions as $$
  values ('agent_client_contacts', 'Confirm Client Contact Information', 'Tell us which of the clients on this order you represent and confirm how to reach them (and their spouse, if married). Add anyone we are missing.', 3),
         ('agent_transaction_info', 'Confirm Your Transaction Information', 'Check the closing date and price we have, give your commission split, any fees or credits for the settlement statement, the earnest money, and the people on your team.', 3),
         ('agent_home_warranty', 'Confirm Home Warranty Information', 'Let us know whether you or someone else will be purchasing a home warranty for this property.', 5)
$$;

create or replace function private.agent_validate(p_code text, a jsonb) returns void
language plpgsql immutable set search_path = pg_catalog, public, extensions as $$
declare c jsonb; begin
  if p_code = 'agent_client_contacts' then
    for c in select * from jsonb_array_elements(coalesce(a->'clients', '[]')) loop
      if coalesce(c->>'represent', '') not in ('Yes', 'No') then raise exception 'Do you represent each client? Choose Yes or No.' using errcode = 'P0001'; end if;
      if c->>'represent' = 'Yes' then
        if not private.agent_person_ok(c, true, true) then raise exception 'Client first name, last name, email and 10-digit phone are required.' using errcode = 'P0001'; end if;
        if coalesce(c->>'maritalStatus', '') not in ('Single', 'Married', 'Divorced', 'Widowed') then raise exception 'Choose a marital status.' using errcode = 'P0001'; end if;
        if c->>'maritalStatus' = 'Married' and not private.agent_person_ok(coalesce(c->'spouse', '{}'), false, false) then raise exception 'Spouse first and last name are required.' using errcode = 'P0001'; end if;
      end if; end loop;
    for c in select * from jsonb_array_elements(coalesce(a->'added', '[]')) loop
      if not private.agent_person_ok(c, true, false) then raise exception 'An added client needs a first name, last name and email.' using errcode = 'P0001'; end if; end loop;
  elsif p_code = 'agent_transaction_info' then
    if coalesce(a->>'closingDate', '') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Estimated closing date is required.' using errcode = 'P0001'; end if;
    perform (a->>'closingDate')::date;
    if coalesce(a->>'purchasePrice', '') !~ '^\d+(\.\d+)?$' then raise exception 'Purchase price is required.' using errcode = 'P0001'; end if;
    if coalesce(a->>'emdAmount', '') !~ '^\d+(\.\d+)?$' then raise exception 'Earnest deposit amount is required (0 if none).' using errcode = 'P0001'; end if;
    if coalesce(a->>'holdingEmd', '') not in ('Yes', 'No') then raise exception 'Are you holding earnest money given to you by the buyer?' using errcode = 'P0001'; end if;
    if jsonb_array_length(coalesce(a->'commissions', '[]')) = 0 then raise exception 'Add your commission (percent or amount).' using errcode = 'P0001'; end if;
    for c in select * from jsonb_array_elements(coalesce(a->'fees', '[]')) loop
      if coalesce(trim(c->>'name'), '') = '' or coalesce(c->>'type', '') not in ('Fee', 'Credit') or coalesce(c->>'paidBy', '') not in ('Buyer', 'Seller') or coalesce(c->>'amount', '') !~ '^\d+(\.\d+)?$' then
        raise exception 'Each fee or credit needs a name, Fee / Credit, an amount and who pays it.' using errcode = 'P0001'; end if; end loop;
    for c in select * from jsonb_array_elements(coalesce(a->'team', '[]')) loop
      if not private.agent_person_ok(c, true, false) then raise exception 'Each team member needs a first name, last name and email.' using errcode = 'P0001'; end if; end loop;
  elsif p_code = 'agent_home_warranty' then
    if coalesce(a->>'willPurchase', '') not in ('Yes', 'No') then raise exception 'Will you or someone else be purchasing a home warranty? Choose Yes or No.' using errcode = 'P0001'; end if;
    if a->>'willPurchase' = 'Yes' and coalesce(a->>'purchaser', '') not in ('Me', 'Someone else') then raise exception 'Who is purchasing it?' using errcode = 'P0001'; end if;
  else raise exception 'Unknown agent task' using errcode = 'P0001'; end if;
end $$;

create or replace function private.make_agent_tasks(p_part uuid) returns integer
language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
declare p public.deal_participants; owner uuid; n int;
begin
  select * into p from public.deal_participants where id = p_part;
  if not found or p.role not in ('Buyer Agent', 'Listing Agent') then return 0; end if;
  if not exists (select 1 from public.deals where id = p.deal_id and status = 'Open') then return 0; end if;
  select profile_id into owner from public.contacts where id = p.contact_id; if owner is null then return 0; end if;
  insert into public.tasks (deal_id, title, description, assigned_role, status, due_date, created_by, kind, participant_id, owner_profile_id, template_code, template_version)
  select p.deal_id, a.title, a.about, p.role, 'todo', current_date + a.due_days, private.effective_uid(), 'agent', p.id, owner, a.code, 1 from private.agent_task_defs() a
  where private.task_enabled(a.code) and not exists (select 1 from public.tasks x where x.participant_id = p.id and x.template_code = a.code and x.status <> 'cancelled');
  get diagnostics n = row_count; return n; end $$;

-- Replace the submit function only when this migration created it (its body calls save_side_schedule).
-- A function that was already on TEST is left as it was.
do $restore_submit$
begin
  if to_regprocedure('private.rpc_submit_agent_task(uuid, jsonb)') is null
     or position('save_side_schedule' in (select p.prosrc from pg_proc p where p.oid = 'private.rpc_submit_agent_task(uuid, jsonb)'::regprocedure)) = 0 then
    return;
  end if;
  execute $fn$
create or replace function private.rpc_submit_agent_task(p_task uuid, p_answers jsonb) returns integer
language plpgsql security definer set search_path = pg_catalog, public, extensions as $body$
declare t public.tasks; n int;
begin
  select * into t from public.tasks where id = p_task and kind = 'agent';
  if not found or not private.can_access_deal(t.deal_id) or not private.task_visible(t.owner_profile_id, t.assigned_role, t.deal_id) then raise exception 'Task not found' using errcode = 'P0001'; end if;
  if t.owner_profile_id is distinct from private.effective_uid() then raise exception 'Only the agent this task is for can submit it.' using errcode = 'P0001'; end if;
  if t.status = 'cancelled' then raise exception 'This task was cancelled.' using errcode = 'P0001'; end if;
  perform private.agent_validate(t.template_code, p_answers);
  select coalesce(max(r.n), 0) + 1 into n from public.agent_task_revisions r where r.task_id = p_task;
  insert into public.agent_task_revisions (task_id, n, answers, by_profile) values (p_task, n, p_answers, private.effective_uid());
  perform set_config('cla.form_rpc', 'on', true);
  update public.tasks set form_data = p_answers, saved_at = now(), saved_by = private.effective_uid(), status = 'done', completed_at = now(), completed_by = private.effective_uid() where id = p_task;
  perform set_config('cla.form_rpc', '', true);
  perform private.log_activity(t.deal_id, case when n = 1 then 'task.submitted' else 'task.revised' end, 'task', t.id, t.title || case when n = 1 then ': submitted' else ': revision ' || (n - 1) || ' submitted' end);
  perform private.notify(array[(select processor_id from public.deals where id = t.deal_id)], 'task', t.deal_id, private.person_name(private.effective_uid()) || case when n = 1 then ' completed "' else ' revised "' end || t.title || '"', '#/deals/' || t.deal_id || '/tasks/' || t.id);
  return n; end $body$
  $fn$;
end $restore_submit$;

delete from public.outbox where kind = 'scheduling';
alter table public.outbox drop constraint if exists outbox_recipient_check;
alter table public.outbox add constraint outbox_recipient_check check (
  to_profile_id is not null
  or (title_package and char_length(to_email) > 3 and char_length(to_name) > 0));

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deals' and column_name = 'sched_buyer_date') then
    raise exception 'readback: scheduling columns are still present'; end if;
  if exists (select 1 from private.agent_task_defs() where code = 'agent_schedule_settlement') then
    raise exception 'readback: the scheduling task is still defined'; end if;
end $$;

commit;
