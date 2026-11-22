-- Rollback for MF-058. Removes the per-side phone, email and seller settlement agent/notary columns.
-- Puts the scheduling guard back to the column list from MF-056. Does not drop settlement_agent_name or the closer.
-- Does not change outbox_recipient_check. Reminder rows are the ones whose subject starts with "Reminder: settlement for".
begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public, extensions;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'deals' and column_name = 'settlement_agent_phone'
  ) then raise exception 'drift: the settlement agent phone column is not present'; end if;
end $$;

-- Restore the guard before the new columns go away, so a later file save does not call a missing column.
create or replace function private.deals_schedule_guard() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if current_setting('cla.schedule_rpc', true) = 'on' then return new; end if;
  if new.sched_buyer_ask is distinct from old.sched_buyer_ask
     or new.sched_buyer_date is distinct from old.sched_buyer_date
     or new.sched_buyer_time is distinct from old.sched_buyer_time
     or new.sched_buyer_place is distinct from old.sched_buyer_place
     or new.sched_buyer_office_id is distinct from old.sched_buyer_office_id
     or new.sched_buyer_office_name is distinct from old.sched_buyer_office_name
     or new.sched_buyer_street is distinct from old.sched_buyer_street
     or new.sched_buyer_city is distinct from old.sched_buyer_city
     or new.sched_buyer_state is distinct from old.sched_buyer_state
     or new.sched_buyer_zip is distinct from old.sched_buyer_zip
     or new.sched_buyer_notes is distinct from old.sched_buyer_notes
     or new.sched_buyer_ron is distinct from old.sched_buyer_ron
     or new.sched_buyer_by is distinct from old.sched_buyer_by
     or new.sched_seller_ask is distinct from old.sched_seller_ask
     or new.sched_seller_date is distinct from old.sched_seller_date
     or new.sched_seller_time is distinct from old.sched_seller_time
     or new.sched_seller_place is distinct from old.sched_seller_place
     or new.sched_seller_office_id is distinct from old.sched_seller_office_id
     or new.sched_seller_office_name is distinct from old.sched_seller_office_name
     or new.sched_seller_street is distinct from old.sched_seller_street
     or new.sched_seller_city is distinct from old.sched_seller_city
     or new.sched_seller_state is distinct from old.sched_seller_state
     or new.sched_seller_zip is distinct from old.sched_seller_zip
     or new.sched_seller_notes is distinct from old.sched_seller_notes
     or new.sched_seller_ron is distinct from old.sched_seller_ron
     or new.sched_seller_by is distinct from old.sched_seller_by
     or new.settlement_agent_name is distinct from old.settlement_agent_name
     or new.settlement_agent_profile_id is distinct from old.settlement_agent_profile_id
     or new.settlement_agent_confirmed is distinct from old.settlement_agent_confirmed
     or new.scheduling_processor_notes is distinct from old.scheduling_processor_notes then
    raise exception 'Save scheduling from the Scheduling Details page.' using errcode = '42501';
  end if;
  return new;
end $$;

delete from public.outbox where kind = 'scheduling' and subject like 'Reminder: settlement for %';

drop function if exists public.queue_scheduling_reminder(uuid, text);
drop function if exists public.preview_scheduling_reminder(uuid, text);
drop function if exists private.scheduling_reminder_people(uuid, text);
drop function if exists public.save_side_settlement_agent(uuid, text, text, uuid, text, text, boolean);

alter table public.deals drop constraint if exists deals_sched_agent_contact;
alter table public.deals
  drop column if exists settlement_agent_phone,
  drop column if exists settlement_agent_email,
  drop column if exists seller_settlement_agent_name,
  drop column if exists seller_settlement_agent_profile_id,
  drop column if exists seller_settlement_agent_phone,
  drop column if exists seller_settlement_agent_email,
  drop column if exists seller_settlement_agent_confirmed;

do $$
declare def text;
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deals' and column_name = 'settlement_agent_phone') then
    raise exception 'readback: the settlement agent phone column is still present'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deals' and column_name = 'settlement_agent_name') then
    raise exception 'readback: the original settlement agent name was removed'; end if;
  select pg_get_constraintdef(oid) into def from pg_constraint where conname = 'outbox_recipient_check';
  if def is null or def not like '%post_closing_type%' or def not like '%scheduling%' then
    raise exception 'readback: outbox_recipient_check changed'; end if;
end $$;

commit;
