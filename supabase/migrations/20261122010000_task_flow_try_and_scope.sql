-- Task Builder, Nov 14 2026 (John): "new files only" or "existing open files too", and "Try on one file".
-- Needs 20261121010000_task_flow_engine.sql (TB-2).
-- * Turning a flow on now asks which files: new files only (the default) means files opened after the flow was turned on, so a flow never
--   sweeps the open files already there by surprise. Existing open files too also covers them. Turning it off and on again starts "from now"
--   again. Flows already On before this file keep running as before (activated_at is empty, which counts as existing files too).
-- * Try on one file: one test run of a flow on one chosen open file, now, whether the flow is On or Off. Waits are skipped so every step
--   shows at once; the tasks are real tasks on that file, marked "Test run". A test run never blocks or counts as the flow's real run.
-- Not applied on TEST by this change. Rollback: supabase/rollbacks/20261122010000_task_flow_try_and_scope.sql
begin;
set local lock_timeout = '3s';

do $$
begin
  if to_regclass('public.task_flow_runs') is null then raise exception 'drift: apply 20261121010000_task_flow_engine.sql first'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deals' and column_name = 'created_at') then
    raise exception 'drift: deals.created_at is missing'; end if;
end $$;

alter table public.task_flows add column if not exists scope text not null default 'new' check (scope in ('new', 'all'));
alter table public.task_flows add column if not exists activated_at timestamptz;
update public.task_flows set scope = 'all' where active and activated_at is null;   -- flows already On keep working as before
alter table public.task_flow_runs add column if not exists trial boolean not null default false;

-- Turn a flow on (with which files) or off. set_task_flow_active (TB-2) stays and means "new files only".
create or replace function public.set_task_flow_active_scoped(p_id uuid, p_active boolean, p_scope text) returns void
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
declare v_uid uuid := private.effective_uid(); v_old public.task_flows; v_why text; v_scope text := case when p_scope = 'all' then 'all' else 'new' end;
begin
  if not private.is_admin() then raise exception 'Only an Admin or Super admin can use Task Builder.' using errcode = '42501'; end if;
  select * into v_old from public.task_flows where id = p_id for update;
  if not found then raise exception 'That flow was not found. Refresh the page and try again.' using errcode = 'P0001'; end if;
  if v_old.active = coalesce(p_active, false) then return; end if;
  if p_active then
    v_why := private.task_flow_can_run(v_old.trigger, v_old.steps);
    if v_why <> '' then raise exception '%', v_why using errcode = 'P0001'; end if;
    update public.task_flows set active = true, scope = v_scope, activated_at = now(), updated_by = v_uid, updated_at = now() where id = p_id;
    insert into public.task_flow_log (flow_id, flow_name, action, detail, by_id)
      values (p_id, v_old.name, 'turned on', case when v_scope = 'all' then 'New and existing open files.' else 'New files only.' end, v_uid);
  else
    update public.task_flows set active = false, updated_by = v_uid, updated_at = now() where id = p_id;
    insert into public.task_flow_log (flow_id, flow_name, action, by_id) values (p_id, v_old.name, 'turned off', v_uid);
  end if;
end $$;

create or replace function public.set_task_flow_active(p_id uuid, p_active boolean) returns void
language sql security definer set search_path to pg_catalog, public, extensions as $$
  select public.set_task_flow_active_scoped(p_id, p_active, 'new') $$;

create or replace function public.list_task_flows() returns jsonb
language plpgsql stable security definer set search_path to pg_catalog, public, extensions as $$
begin
  if not private.is_admin() then raise exception 'Only an Admin or Super admin can use Task Builder.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'flows', coalesce((select jsonb_agg(to_jsonb(f) || jsonb_build_object(
        'created_by_name', case when f.created_by is null then '' else private.person_name(f.created_by) end,
        'updated_by_name', case when f.updated_by is null then '' else private.person_name(f.updated_by) end) order by lower(f.name))
      from public.task_flows f), '[]'::jsonb),
    'log', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'flow_id', l.flow_id, 'flow_name', l.flow_name, 'action', l.action, 'detail', l.detail,
        'by', l.by_id, 'by_name', case when l.by_id is null then '' else private.person_name(l.by_id) end, 'at', l.at) order by l.at desc, l.id desc)
      from (select * from public.task_flow_log order by at desc, id desc limit 50) l), '[]'::jsonb),
    'runs', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'flow_id', r.flow_id, 'deal_id', r.deal_id, 'flow_name', f.name, 'file_number', d.file_number,
        'status', r.status, 'trial', r.trial, 'step_index', r.step_index, 'next_at', r.next_at, 'started_at', r.started_at, 'finished_at', r.finished_at, 'log', r.log) order by r.started_at desc)
      from (select * from public.task_flow_runs order by started_at desc limit 50) r join public.task_flows f on f.id = r.flow_id join public.deals d on d.id = r.deal_id), '[]'::jsonb));
end $$;

-- ---------- the engine: same as TB-2, plus which files (scope) and test runs ----------
create or replace function private.task_flow_start(p_deal uuid, p_event text) returns int
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
declare n int;
begin
  insert into public.task_flow_runs (flow_id, deal_id)
  select f.id, p_deal from public.task_flows f join public.deals d on d.id = p_deal
  where f.active and f.trigger = p_event and private.task_flow_can_run(f.trigger, f.steps) = '' and coalesce(d.status, 'Open') = 'Open'
    and (f.scope = 'all' or f.activated_at is null or d.created_at >= f.activated_at)
    and (not exists (select 1 from public.task_flow_runs r where r.flow_id = f.id and r.deal_id = p_deal and not r.trial)
      or (f.trigger = 'closing_date_set' and not exists (select 1 from public.task_flow_runs r where r.flow_id = f.id and r.deal_id = p_deal and r.status = 'waiting' and not r.trial)))
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function private.task_flow_advance(p_run uuid) returns int
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
declare
  r public.task_flow_runs; f public.task_flows; d record; s jsonb; made int := 0; n int; owners uuid[]; guard int := 0;
  v_title text;
begin
  select * into r from public.task_flow_runs where id = p_run for update skip locked;
  if not found or r.status <> 'waiting' or r.next_at > now() then return 0; end if;
  select * into f from public.task_flows where id = r.flow_id;
  if not found or (not f.active and not r.trial) then return 0; end if;   -- a test run runs whether the flow is On or Off
  select * into d from public.deals where id = r.deal_id;
  if not found or coalesce(d.status, 'Open') <> 'Open' then
    update public.task_flow_runs set status = 'stopped', finished_at = now(), log = log || jsonb_build_object('at', now(), 'text', 'Stopped: the file is no longer open.') where id = p_run;
    return 0;
  end if;
  if not r.checked then
    r.checked := true;
    if not private.task_flow_matches(f.conditions, r.deal_id) then
      update public.task_flow_runs set checked = true, status = 'skipped', finished_at = now(),
        log = log || jsonb_build_object('at', now(), 'text', 'Skipped: this file does not match the flow''s conditions.') where id = p_run;
      return 0;
    end if;
  end if;
  loop
    guard := guard + 1;
    if guard > 21 or r.step_index >= jsonb_array_length(f.steps) then
      r.status := 'done'; r.finished_at := now(); r.log := r.log || jsonb_build_object('at', now(), 'text', 'Finished.'); exit;
    end if;
    s := f.steps -> r.step_index;
    r.step_index := r.step_index + 1;
    if s ->> 'type' in ('create_task', 'call_task') then
      v_title := s ->> 'title';
      -- everyone on the file with that role; for the processor, pre-processor and TC, the person set on the order when the party list has none
      with holders as (
        select p.id as pid, c.profile_id as prof from public.deal_participants p left join public.contacts c on c.id = p.contact_id
        where p.deal_id = r.deal_id and p.role = s ->> 'assignTo'),
      who as (
        select pid, prof from holders
        union all
        select null::uuid, case s ->> 'assignTo' when 'Processor' then d.processor_id when 'Preprocessor' then d.preprocessor_user_id when 'Transaction Coordinator' then d.tc_user_id end
        where not exists (select 1 from holders)
          and case s ->> 'assignTo' when 'Processor' then d.processor_id when 'Preprocessor' then d.preprocessor_user_id when 'Transaction Coordinator' then d.tc_user_id end is not null),
      ins as (
        insert into public.tasks (deal_id, title, description, assigned_role, status, due_date, due_overridden, created_by, kind, participant_id, owner_profile_id, flow_run_id)
        select r.deal_id, v_title,
          case when r.trial then 'Test run. ' else '' end || case when s ->> 'type' = 'call_task' then 'Phone call. ' else '' end || 'Added by the "' || f.name || '" flow (Task Builder).',
          s ->> 'assignTo', 'todo', current_date + (s ->> 'dueDays')::int, false, null, 'simple', who.pid, who.prof, r.id
        from who
        returning owner_profile_id)
      select count(*), array_agg(owner_profile_id) filter (where owner_profile_id is not null) into n, owners from ins;
      made := made + n;
      if n = 0 then
        r.log := r.log || jsonb_build_object('at', now(), 'text', 'No ' || (s ->> 'assignTo') || ' on this file, so "' || v_title || '" was not created.');
      else
        r.log := r.log || jsonb_build_object('at', now(), 'text', 'Step ' || r.step_index || ': ' || case when s ->> 'type' = 'call_task' then 'phone call task' else 'task' end || ' "' || v_title || '" for ' || n || ' ' || (s ->> 'assignTo'));
        if owners is not null then
          begin perform private.notify(owners, 'task', r.deal_id, 'New task: ' || v_title, '#/deals/' || r.deal_id || '/tasks');
          exception when others then null; end;
        end if;
      end if;
    elsif s ->> 'type' = 'wait' and r.trial then
      r.log := r.log || jsonb_build_object('at', now(), 'text', 'Step ' || r.step_index || ': wait ' || (s ->> 'days') || case when (s ->> 'days')::int = 1 then ' day' else ' days' end || ' (skipped in a test run)');
    elsif s ->> 'type' = 'wait' then
      r.next_at := now() + make_interval(days => (s ->> 'days')::int);
      r.log := r.log || jsonb_build_object('at', now(), 'text', 'Step ' || r.step_index || ': waiting ' || (s ->> 'days') || case when (s ->> 'days')::int = 1 then ' day' else ' days' end);
      exit;
    elsif s ->> 'type' = 'stop_if_emd_received' then
      if coalesce(d.emd_received, false) then
        r.status := 'stopped'; r.finished_at := now(); r.log := r.log || jsonb_build_object('at', now(), 'text', 'Step ' || r.step_index || ': stopped, the EMD has been received.'); exit;
      end if;
      r.log := r.log || jsonb_build_object('at', now(), 'text', 'Step ' || r.step_index || ': EMD not received yet, going on');
    end if;
  end loop;
  update public.task_flow_runs set step_index = r.step_index, next_at = r.next_at, status = r.status, checked = r.checked, log = r.log, finished_at = r.finished_at where id = p_run;
  return made;
end $$;

create or replace function private.run_task_flows() returns jsonb
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
declare f record; dl record; run record; started int := 0; made int := 0;
begin
  for f in select * from public.task_flows where active and trigger in ('emd_not_received', 'days_before_closing') and private.task_flow_can_run(trigger, steps) = '' loop
    for dl in select d.id from public.deals d where coalesce(d.status, 'Open') = 'Open'
        and (f.scope = 'all' or f.activated_at is null or d.created_at >= f.activated_at)
        and ((f.trigger = 'emd_not_received' and not coalesce(d.emd_received, false) and d.open_date is not null and current_date - d.open_date >= f.trigger_days)
          or (f.trigger = 'days_before_closing' and d.closing_date is not null and d.closing_date - current_date between 0 and f.trigger_days))
        and not exists (select 1 from public.task_flow_runs r where r.flow_id = f.id and r.deal_id = d.id and not r.trial) loop
      begin started := started + private.task_flow_start(dl.id, f.trigger);
      exception when others then insert into public.task_flow_errors (deal_id, message) values (dl.id, sqlerrm); end;
    end loop;
  end loop;
  for run in select id, deal_id from public.task_flow_runs where status = 'waiting' and not trial and next_at <= now() order by next_at limit 500 loop
    begin made := made + private.task_flow_advance(run.id);
    exception when others then insert into public.task_flow_errors (deal_id, run_id, message) values (run.deal_id, run.id, sqlerrm); end;
  end loop;
  return jsonb_build_object('started', started, 'tasks', made);
end $$;

-- Try on one file (Admin / Super admin). Returns the run's status, tasks made and its steps.
create or replace function public.try_task_flow_on_file(p_flow uuid, p_deal uuid) returns jsonb
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
declare f public.task_flows; d record; v_run uuid; n int; r public.task_flow_runs;
begin
  if not private.is_admin() then raise exception 'Only an Admin or Super admin can use Task Builder.' using errcode = '42501'; end if;
  select * into f from public.task_flows where id = p_flow;
  if not found then raise exception 'That flow was not found. Refresh the page and try again.' using errcode = 'P0001'; end if;
  if not exists (select 1 from jsonb_array_elements(f.steps) s where s ->> 'type' in ('create_task', 'call_task')) then
    raise exception 'Add at least one "Create a task" or "Create a phone call task" step before turning the flow on.' using errcode = 'P0001'; end if;
  select * into d from public.deals where id = p_deal;
  if not found then raise exception 'Choose a file to try the flow on.' using errcode = 'P0001'; end if;
  if coalesce(d.status, 'Open') <> 'Open' then raise exception 'That file is not open. Choose an open file.' using errcode = 'P0001'; end if;
  insert into public.task_flow_runs (flow_id, deal_id, trial) values (p_flow, p_deal, true) returning id into v_run;
  n := private.task_flow_advance(v_run);
  select * into r from public.task_flow_runs where id = v_run;
  return jsonb_build_object('run_id', v_run, 'status', r.status, 'tasks', n, 'log', r.log, 'file_number', d.file_number);
end $$;

-- a test run finishes at once, so it never holds the "one waiting run per flow and file" slot
drop index if exists public.task_flow_runs_one_waiting;
create unique index task_flow_runs_one_waiting on public.task_flow_runs (flow_id, deal_id) where status = 'waiting' and not trial;

revoke all on function public.set_task_flow_active_scoped(uuid, boolean, text), public.try_task_flow_on_file(uuid, uuid) from public, anon;
grant execute on function public.set_task_flow_active_scoped(uuid, boolean, text), public.try_task_flow_on_file(uuid, uuid) to authenticated;

commit;
