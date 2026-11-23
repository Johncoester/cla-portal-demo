-- Task Builder TB-11, Nov 22 2026 (John, by voice): the "Task completed" trigger.
-- John: "could Task Builder send an automatic email once a task is checked off?... let's create that ASAP for any task that we want to have."
-- Example: "if we received the EMD and we click EMD received, an automatic email should go out."
-- * task_flows.trigger_task: which task, as a key. "tpl:<code>" = a standard task from Admin > Task Templates (any version);
--   "title:<name>" = any other task, matched by name (case and spacing don't count). trigger_task_name is the name shown on the page.
-- * When a task on a file becomes done, the "Task completed" templates that name it start on that file (once per file, like the others) and
--   their first steps run straight away, so an email is queued as soon as the box is ticked. Test-run tasks never start anything.
--   Like the deals trigger, nothing here can stop a task from saving: any error goes to task_flow_errors.
-- * Saved through save_task_flow_v3 (the page uses it only for this trigger). Changing a template to another trigger clears the task.
-- Needs 20261127010000_task_flow_email_step.sql. Not applied on TEST by this change.
-- Rollback: supabase/rollbacks/20261129020000_task_flow_task_completed.sql
begin;
set local lock_timeout = '3s';

do $$
begin
  if to_regprocedure('private.task_flow_send_email(public.task_flow_runs, public.task_flows, jsonb)') is null then
    raise exception 'drift: apply 20261127010000_task_flow_email_step.sql first'; end if;
  if to_regclass('public.task_templates') is null then raise exception 'drift: task_templates is missing'; end if;
end $$;

alter table public.task_flows add column if not exists trigger_task text
  check (trigger_task is null or (char_length(trigger_task) between 5 and 130 and trigger_task ~ '^(tpl|title):'));
alter table public.task_flows add column if not exists trigger_task_name text check (trigger_task_name is null or char_length(trigger_task_name) <= 120);
alter table public.task_flows drop constraint if exists task_flows_trigger_check;
alter table public.task_flows add constraint task_flows_trigger_check check (trigger in ('order_opened', 'contract_received', 'emd_received', 'emd_not_received',
  'commitment_received', 'closing_date_set', 'days_before_closing', 'file_closed', 'task_completed'));

-- a template moved to another trigger forgets its task
create or replace function private.trg_task_flow_clear_task() returns trigger
language plpgsql set search_path to pg_catalog as $$
begin
  if new.trigger <> 'task_completed' then new.trigger_task := null; new.trigger_task_name := null; end if;
  return new;
end $$;
drop trigger if exists task_flow_clear_task on public.task_flows;
create trigger task_flow_clear_task before insert or update of trigger on public.task_flows for each row execute function private.trg_task_flow_clear_task();

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
    when 'task_completed' then 'Task completed'
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
  if p_trigger is null or p_trigger not in ('order_opened', 'contract_received', 'emd_received', 'emd_not_received', 'commitment_received', 'closing_date_set', 'days_before_closing', 'file_closed', 'task_completed') then
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
    when p_trigger not in ('order_opened', 'emd_received', 'emd_not_received', 'closing_date_set', 'days_before_closing', 'file_closed', 'task_completed')
      then 'Flows that start on "Contract received" or "Title commitment received" can be saved but cannot be turned on yet. Those two triggers come in a later step.'
    when not exists (select 1 from jsonb_array_elements(coalesce(p_steps, '[]')) s where s ->> 'type' in ('create_task', 'call_task', 'client_request', 'send_email'))
      then 'Add at least one step that creates a task, requests a form or sends an email before turning the flow on.'
    else '' end $$;

create or replace function public.save_task_flow_v3(p_id uuid, p_name text, p_description text, p_trigger text, p_trigger_days int, p_trigger_task text,
  p_trigger_task_name text, p_conditions jsonb, p_steps jsonb) returns uuid
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
declare
  v_uid uuid := private.effective_uid();
  v_key text := regexp_replace(btrim(coalesce(p_trigger_task, '')), '\s+', ' ', 'g');
  v_name text := left(regexp_replace(btrim(coalesce(p_trigger_task_name, '')), '\s+', ' ', 'g'), 120);
  v_old public.task_flows; v_id uuid;
begin
  if not private.is_admin() then raise exception 'Only an Admin or Super admin can use Task Builder.' using errcode = '42501'; end if;
  if p_trigger = 'task_completed' then
    if v_key = '' then raise exception 'Choose which task starts the template.' using errcode = 'P0001'; end if;
    if char_length(v_key) > 130 or v_key !~ '^(tpl|title):.+'
      or (v_key like 'tpl:%' and (substr(v_key, 5) !~ '^[A-Za-z0-9_-]{1,64}$' or not exists (select 1 from public.task_templates t where t.code = substr(v_key, 5)))) then
      raise exception 'Choose which task starts the template from the list.' using errcode = 'P0001'; end if;
    if v_name = '' then v_name := coalesce((select t.title from public.task_templates t where 'tpl:' || t.code = v_key order by t.version desc limit 1), substr(v_key, strpos(v_key, ':') + 1)); end if;
  else v_key := null; v_name := null; end if;
  if p_id is not null then select * into v_old from public.task_flows where id = p_id; end if;
  v_id := public.save_task_flow_v2(p_id, p_name, p_description, p_trigger, p_trigger_days, p_conditions, p_steps);
  update public.task_flows set trigger_task = v_key, trigger_task_name = v_name where id = v_id;
  if p_trigger = 'task_completed' then
    if p_id is null then   -- the "created" line names the task
      update public.task_flow_log set detail = replace(detail, 'Starts: Task completed.', 'Starts: Task completed: "' || v_name || '".')
        where id = (select max(id) from public.task_flow_log where flow_id = v_id);
    elsif v_old.trigger_task is distinct from v_key then
      update public.task_flows set updated_by = v_uid, updated_at = now() where id = v_id;
      insert into public.task_flow_log (flow_id, flow_name, action, detail, by_id)
        values (v_id, (select name from public.task_flows where id = v_id), 'changed', 'starts when "' || v_name || '" is checked off', v_uid);
    end if;
  end if;
  return v_id;
end $$;

-- a task became done on a file: start the Task completed templates that name it, and move them on straight away
create or replace function private.task_flow_start_task(p_task public.tasks) returns int
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
declare n int := 0; v_run uuid;
begin
  for v_run in
    insert into public.task_flow_runs (flow_id, deal_id)
    select f.id, p_task.deal_id from public.task_flows f join public.deals d on d.id = p_task.deal_id
    where f.active and f.trigger = 'task_completed' and private.task_flow_can_run(f.trigger, f.steps) = '' and coalesce(d.status, 'Open') = 'Open'
      and ((p_task.template_code is not null and f.trigger_task = 'tpl:' || p_task.template_code)
        or lower(f.trigger_task) = 'title:' || lower(regexp_replace(btrim(coalesce(p_task.title, '')), '\s+', ' ', 'g')))
      and not exists (select 1 from public.task_flow_runs r where r.flow_id = f.id and r.deal_id = p_task.deal_id and not r.trial)
    on conflict do nothing
    returning id
  loop
    n := n + 1;
    perform private.task_flow_advance(v_run);
  end loop;
  return n;
end $$;

create or replace function private.trg_task_flow_task_events() returns trigger
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
begin
  if new.status = 'done' and old.status is distinct from 'done' and coalesce(new.description, '') !~ '^Test run\. ' then
    begin perform private.task_flow_start_task(new);
    exception when others then
      begin insert into public.task_flow_errors (deal_id, message) values (new.deal_id, sqlerrm); exception when others then null; end;
    end;
  end if;
  return null;
end $$;
drop trigger if exists zz_task_flow_task_events on public.tasks;
create trigger zz_task_flow_task_events after update of status on public.tasks for each row execute function private.trg_task_flow_task_events();

revoke all on function private.trg_task_flow_clear_task(), private.task_flow_trigger_text(text, int), private.task_flow_can_run(text, jsonb),
  private.task_flow_start_task(public.tasks), private.trg_task_flow_task_events() from public, anon, authenticated;
revoke all on function public.save_task_flow(uuid, text, text, text, int), public.save_task_flow_v3(uuid, text, text, text, int, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.save_task_flow_v3(uuid, text, text, text, int, text, text, jsonb, jsonb) to authenticated;

commit;
