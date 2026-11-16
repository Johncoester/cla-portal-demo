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

drop trigger if exists participants_schedule_task on public.deal_participants;
drop function if exists private.participants_schedule_task();
drop function if exists private.schedule_ensure_task(uuid);
drop function if exists public.submit_schedule_settlement(uuid, jsonb);
drop function if exists public.get_party_schedule(text);
drop function if exists public.submit_party_schedule(text, jsonb);
drop function if exists public.scheduling_copy_links(uuid);
drop function if exists public.save_settlement_agent(uuid, text, uuid, boolean);
drop function if exists public.save_scheduling_notes(uuid, text);
drop function if exists private.save_side_schedule(uuid, jsonb, text);
drop function if exists private.schedule_check(jsonb);

-- The task list, the task check and the task copy (including agent_home_warranty) are left as they were.
-- This rollback does not replace a function that was already on TEST.
-- Drop the submit function only when this migration created it (its body calls save_side_schedule).
do $restore_submit$
begin
  if to_regprocedure('private.rpc_submit_agent_task(uuid, jsonb)') is null then return; end if;
  if position('save_side_schedule' in (select p.prosrc from pg_proc p where p.oid = 'private.rpc_submit_agent_task(uuid, jsonb)'::regprocedure)) = 0 then
    return;
  end if;
  drop function private.rpc_submit_agent_task(uuid, jsonb);
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
