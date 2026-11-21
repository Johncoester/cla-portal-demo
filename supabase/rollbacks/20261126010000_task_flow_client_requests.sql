-- Rollback for 20261126010000_task_flow_client_requests.sql. NOT APPLIED by this file.
-- Puts the Nov 14 engine back and removes client requests. Request steps in saved flows are removed from those flows first (the old
-- engine cannot read them); tasks they created stay on their files; emails already queued stay in the outbox.
begin;
set local lock_timeout = '3s';

update public.task_flows set steps = coalesce((select jsonb_agg(s order by n) from jsonb_array_elements(steps) with ordinality x(s, n) where s ->> 'type' <> 'client_request'), '[]')
  where steps @> '[{"type":"client_request"}]';
update public.task_flows set active = false where active and not exists (select 1 from jsonb_array_elements(steps) s where s ->> 'type' in ('create_task', 'call_task'));

create or replace function private.task_flow_clean_steps(p jsonb) returns jsonb
language plpgsql immutable set search_path to pg_catalog as $$
declare s jsonb; i int := 0; out jsonb := '[]'; t text; title text; n int;
begin
  if p is null or jsonb_typeof(p) <> 'array' then return '[]'; end if;
  if jsonb_array_length(p) > 20 then raise exception 'A flow can have up to 20 steps.' using errcode = 'P0001'; end if;
  for s in select value from jsonb_array_elements(p) loop
    i := i + 1; t := s ->> 'type';
    if t in ('create_task', 'call_task') then
      title := regexp_replace(btrim(coalesce(s ->> 'title', '')), '\s+', ' ', 'g');
      if length(title) < 3 then raise exception 'Step %: give the task a name (at least 3 characters).', i using errcode = 'P0001'; end if;
      if length(title) > 120 then raise exception 'Step %: the task name is too long. Use 120 characters or fewer.', i using errcode = 'P0001'; end if;
      if coalesce(s ->> 'assignTo', '') not in ('Processor', 'Preprocessor', 'Sales Person', 'Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller', 'Transaction Coordinator', 'Lender') then
        raise exception 'Step %: choose who the task is for.', i using errcode = 'P0001'; end if;
      n := case when coalesce(s ->> 'dueDays', '') ~ '^[0-9]{1,2}$' then (s ->> 'dueDays')::int end;
      if n is null or n > 60 then raise exception 'Step %: due in must be a whole number of days from 0 to 60.', i using errcode = 'P0001'; end if;
      out := out || jsonb_build_array(jsonb_build_object('type', t, 'title', title, 'assignTo', s ->> 'assignTo', 'dueDays', n));
    elsif t = 'wait' then
      n := case when coalesce(s ->> 'days', '') ~ '^[0-9]{1,2}$' then (s ->> 'days')::int end;
      if n is null or n < 1 or n > 60 then raise exception 'Step %: wait must be a whole number of days from 1 to 60.', i using errcode = 'P0001'; end if;
      out := out || jsonb_build_array(jsonb_build_object('type', t, 'days', n));
    elsif t = 'stop_if_emd_received' then
      out := out || jsonb_build_array(jsonb_build_object('type', t));
    else
      raise exception 'Step %: choose what the step does.', i using errcode = 'P0001';
    end if;
  end loop;
  return out;
end $$;

create or replace function private.task_flow_can_run(p_trigger text, p_steps jsonb) returns text
language sql immutable set search_path to pg_catalog as $$
  select case
    when p_trigger not in ('order_opened', 'emd_received', 'emd_not_received', 'closing_date_set', 'days_before_closing')
      then 'Flows that start on "Contract received" or "Title commitment received" can be saved but cannot be turned on yet. Those two triggers come in a later step.'
    when not exists (select 1 from jsonb_array_elements(coalesce(p_steps, '[]')) s where s ->> 'type' in ('create_task', 'call_task'))
      then 'Add at least one "Create a task" or "Create a phone call task" step before turning the flow on.'
    else '' end $$;

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

drop function if exists private.task_flow_send_digests(uuid);
drop function if exists private.task_flow_make_requests(public.task_flow_runs, public.task_flows, jsonb);
drop function if exists private.task_flow_request_log(public.task_flow_runs, jsonb);
drop function if exists private.task_flow_clean_request(jsonb, int);
drop function if exists private.task_flow_request_forms();
drop function if exists private.task_flow_role_name(text);
drop index if exists public.outbox_client_request_digest;
drop table if exists public.task_flow_requests;

commit;
