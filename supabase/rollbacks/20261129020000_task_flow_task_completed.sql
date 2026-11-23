-- Rollback for 20261129020000_task_flow_task_completed.sql. NOT APPLIED by this file.
-- Takes the "Task completed" trigger out. Templates that start on it are deleted (with their runs and history lines), because the
-- trigger list goes back to the one before. Tasks and emails those templates already made stay on their files.
begin;
set local lock_timeout = '3s';

drop trigger if exists zz_task_flow_task_events on public.tasks;
drop trigger if exists task_flow_clear_task on public.task_flows;
drop function if exists private.trg_task_flow_task_events();
drop function if exists private.task_flow_start_task(public.tasks);
drop function if exists public.save_task_flow_v3(uuid, text, text, text, int, text, text, jsonb, jsonb);
drop function if exists private.trg_task_flow_clear_task();
delete from public.task_flows where trigger = 'task_completed';
alter table public.task_flows drop constraint if exists task_flows_trigger_check;
alter table public.task_flows add constraint task_flows_trigger_check check (trigger in ('order_opened', 'contract_received', 'emd_received', 'emd_not_received',
  'commitment_received', 'closing_date_set', 'days_before_closing', 'file_closed'));
alter table public.task_flows drop column if exists trigger_task, drop column if exists trigger_task_name;

create or replace function private.task_flow_trigger_text(p_trigger text, p_days int) returns text
language sql immutable set search_path to pg_catalog as $$
  select case p_trigger
    when 'order_opened' then 'Order opened'
    when 'contract_received' then 'Contract received'
    when 'emd_received' then 'EMD received'
    when 'emd_not_received' then 'EMD not received, ' || p_days || case when p_days = 1 then ' day' else ' days' end || ' after the order was opened'
    when 'commitment_received' then 'Title commitment received'
    when 'closing_date_set' then 'Closing date set or changed'
    when 'file_closed' then 'File closed'
    when 'days_before_closing' then 'Days before closing, ' || p_days || case when p_days = 1 then ' day' else ' days' end || ' before the closing date'
    else 'Unknown trigger' end $$;

create or replace function public.save_task_flow(p_id uuid, p_name text, p_description text, p_trigger text, p_trigger_days int)
returns uuid
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
declare
  v_uid uuid := private.effective_uid();
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_desc text := btrim(coalesce(p_description, ''));
  v_days int := case when p_trigger in ('emd_not_received', 'days_before_closing') then p_trigger_days else null end;
  v_old public.task_flows; v_id uuid; v_changes text[] := '{}';
begin
  if not private.is_admin() then raise exception 'Only an Admin or Super admin can use Task Builder.' using errcode = '42501'; end if;
  if v_name = '' then raise exception 'Give the flow a name, for example "EMD reminder".' using errcode = 'P0001'; end if;
  if length(v_name) < 3 then raise exception 'The name is too short. Use at least 3 characters.' using errcode = 'P0001'; end if;
  if length(v_name) > 80 then raise exception 'The name is too long. Use 80 characters or fewer.' using errcode = 'P0001'; end if;
  if length(v_desc) > 500 then raise exception 'The description is too long. Use 500 characters or fewer.' using errcode = 'P0001'; end if;
  if p_trigger is null or p_trigger not in ('order_opened', 'contract_received', 'emd_received', 'emd_not_received', 'commitment_received', 'closing_date_set', 'days_before_closing', 'file_closed') then
    raise exception 'Choose what starts the flow.' using errcode = 'P0001'; end if;
  if p_trigger in ('emd_not_received', 'days_before_closing') and (v_days is null or v_days < 1 or v_days > 60) then
    raise exception 'Days must be a whole number from 1 to 60.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.task_flows f where f.id is distinct from p_id and lower(regexp_replace(btrim(f.name), '\s+', ' ', 'g')) = lower(v_name)) then
    raise exception 'Another flow already has that name. Use a different name.' using errcode = 'P0001'; end if;

  if p_id is null then
    insert into public.task_flows (name, description, trigger, trigger_days, active, created_by, updated_by)
      values (v_name, v_desc, p_trigger, v_days, false, v_uid, v_uid) returning id into v_id;
    insert into public.task_flow_log (flow_id, flow_name, action, detail, by_id)
      values (v_id, v_name, 'created', 'Starts: ' || private.task_flow_trigger_text(p_trigger, v_days) || '. Off.', v_uid);
    return v_id;
  end if;

  select * into v_old from public.task_flows where id = p_id for update;
  if not found then raise exception 'That flow was not found. Refresh the page and try again.' using errcode = 'P0001'; end if;
  if v_old.name <> v_name then v_changes := v_changes || ('name was "' || v_old.name || '"'); end if;
  if v_old.trigger <> p_trigger or v_old.trigger_days is distinct from v_days then
    v_changes := v_changes || ('starts: was ' || private.task_flow_trigger_text(v_old.trigger, v_old.trigger_days) || ', now ' || private.task_flow_trigger_text(p_trigger, v_days)); end if;
  if v_old.description <> v_desc then v_changes := v_changes || 'description changed'::text; end if;
  if cardinality(v_changes) = 0 then return p_id; end if;
  update public.task_flows set name = v_name, description = v_desc, trigger = p_trigger, trigger_days = v_days, updated_by = v_uid, updated_at = now() where id = p_id;
  insert into public.task_flow_log (flow_id, flow_name, action, detail, by_id) values (p_id, v_name, 'changed', array_to_string(v_changes, '; '), v_uid);
  return p_id;
end $$;

create or replace function private.task_flow_can_run(p_trigger text, p_steps jsonb) returns text
language sql immutable set search_path to pg_catalog as $$
  select case
    when p_trigger not in ('order_opened', 'emd_received', 'emd_not_received', 'closing_date_set', 'days_before_closing', 'file_closed')
      then 'Flows that start on "Contract received" or "Title commitment received" can be saved but cannot be turned on yet. Those two triggers come in a later step.'
    when not exists (select 1 from jsonb_array_elements(coalesce(p_steps, '[]')) s where s ->> 'type' in ('create_task', 'call_task', 'client_request', 'send_email'))
      then 'Add at least one step that creates a task, requests a form or sends an email before turning the flow on.'
    else '' end $$;

commit;
