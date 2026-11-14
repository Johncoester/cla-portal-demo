-- TB-2 Task Builder: conditions, steps and the engine that runs flows on files (John, Nov 13 2026; spec docs/specs/task-builder.md).
-- Needs 20261120010000_task_builder_flows.sql (TB-1) and pg_cron (installed on TEST by 20261109200100_gmail_sync_schedule.sql).
--
-- * task_flows.conditions: which files a flow applies to. {"transactionTypes": [...], "states": [...], "salesPeople": [...]}.
--   An empty list means any. All filled lists must match; inside a list any value matches.
--   Transaction type: Refinance, Purchase (with a loan amount) or Cash purchase (no loan amount).
-- * task_flows.steps: run in order. create_task / call_task {title, assignTo, dueDays 0-60}, wait {days 1-60}, stop_if_emd_received.
--   A task goes to every person on the file (deal_participants) with that role, like a template copy; staff mark it done.
--   For the processor, pre-processor and TC, the person set on the order gets it when the party list has nobody in that role.
-- * task_flow_runs: one flow on one file. A flow starts once per file; "closing date set or changed" can start again after its last run ended.
--   Order opened, EMD received (deals.emd_received false -> true) and closing date set or changed start runs from a trigger on deals.
--   "EMD not received, N days after opened" and "N days before closing" are checked by the 15-minute job, which also moves runs on.
--   A new order's run moves on at the next check, after Place Order has added the people. Conditions are checked on a run's first move.
-- * Nothing here can stop an order from saving: the deals trigger catches any error and writes it to task_flow_errors.
-- * Only open files (status Open) run. Runs of a flow that is turned off wait until it is turned back on.
-- Not applied on TEST by this change. Rollback: supabase/rollbacks/20261121010000_task_flow_engine.sql
begin;
set local lock_timeout = '3s';

do $$
begin
  if to_regclass('public.task_flows') is null then raise exception 'drift: apply 20261120010000_task_builder_flows.sql first'; end if;
  if to_regnamespace('cron') is null then raise exception 'drift: pg_cron is not installed (20261109200100_gmail_sync_schedule.sql)'; end if;
end $$;

alter table public.task_flows add column if not exists conditions jsonb not null default '{"transactionTypes": [], "states": [], "salesPeople": []}'::jsonb
  check (jsonb_typeof(conditions) = 'object');

create table if not exists public.task_flow_runs (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references public.task_flows(id) on delete cascade,
  deal_id uuid not null references public.deals(id) on delete cascade,
  step_index smallint not null default 0,
  next_at timestamptz not null default now(),
  status text not null default 'waiting' check (status in ('waiting', 'done', 'stopped', 'skipped')),
  checked boolean not null default false,
  log jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists task_flow_runs_due on public.task_flow_runs (next_at) where status = 'waiting';
create index if not exists task_flow_runs_flow_deal on public.task_flow_runs (flow_id, deal_id);
create unique index if not exists task_flow_runs_one_waiting on public.task_flow_runs (flow_id, deal_id) where status = 'waiting';

create table if not exists public.task_flow_errors (
  id bigint generated always as identity primary key,
  deal_id uuid,
  run_id uuid,
  at timestamptz not null default now(),
  message text not null
);

alter table public.task_flow_runs enable row level security;
alter table public.task_flow_errors enable row level security;
revoke all on public.task_flow_runs from public, anon, authenticated;
revoke all on public.task_flow_errors from public, anon, authenticated;

alter table public.tasks add column if not exists flow_run_id uuid references public.task_flow_runs(id) on delete set null;

-- ---------- checks (same words as js/data/task-builder.js) ----------
create or replace function private.task_flow_clean_conditions(p jsonb) returns jsonb
language sql immutable set search_path to pg_catalog as $$
  select jsonb_build_object(
    'transactionTypes', coalesce((select jsonb_agg(distinct v) from jsonb_array_elements_text(case when jsonb_typeof(p -> 'transactionTypes') = 'array' then p -> 'transactionTypes' else '[]' end) v
      where v in ('Purchase', 'Cash purchase', 'Refinance')), '[]'),
    'states', coalesce((select jsonb_agg(distinct v) from jsonb_array_elements_text(case when jsonb_typeof(p -> 'states') = 'array' then p -> 'states' else '[]' end) v
      where v in ('MD', 'VA', 'DC', 'FL')), '[]'),
    'salesPeople', coalesce((select jsonb_agg(distinct v) from jsonb_array_elements_text(case when jsonb_typeof(p -> 'salesPeople') = 'array' then p -> 'salesPeople' else '[]' end) v
      where v ~ '^[0-9a-f-]{36}$'), '[]')) $$;

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

-- ---------- save, switch, list (replace TB-1's) ----------
create or replace function public.save_task_flow_v2(p_id uuid, p_name text, p_description text, p_trigger text, p_trigger_days int, p_conditions jsonb, p_steps jsonb)
returns uuid
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
declare
  v_uid uuid := private.effective_uid();
  v_cond jsonb := private.task_flow_clean_conditions(coalesce(p_conditions, '{}'));
  v_steps jsonb := private.task_flow_clean_steps(p_steps);
  v_old public.task_flows; v_id uuid; v_changes text[] := '{}'; v_why text;
begin
  if not private.is_admin() then raise exception 'Only an Admin or Super admin can use Task Builder.' using errcode = '42501'; end if;
  if p_id is not null then
    select * into v_old from public.task_flows where id = p_id for update;
    if not found then raise exception 'That flow was not found. Refresh the page and try again.' using errcode = 'P0001'; end if;
    if v_old.active then
      v_why := private.task_flow_can_run(p_trigger, v_steps);
      if v_why <> '' then raise exception '%', v_why using errcode = 'P0001'; end if;
    end if;
  end if;
  v_id := public.save_task_flow(p_id, p_name, p_description, p_trigger, p_trigger_days);   -- TB-1 checks name, trigger and days, and logs those changes
  if p_id is null then
    update public.task_flows set conditions = v_cond, steps = v_steps where id = v_id;
    update public.task_flow_log set detail = detail || ' ' || jsonb_array_length(v_steps) || case when jsonb_array_length(v_steps) = 1 then ' step.' else ' steps.' end
      where id = (select max(id) from public.task_flow_log where flow_id = v_id);
    return v_id;
  end if;
  if v_old.conditions is distinct from v_cond then v_changes := v_changes || 'which files changed'::text; end if;
  if v_old.steps is distinct from v_steps then v_changes := v_changes || ('steps changed (' || jsonb_array_length(v_steps) || ')'); end if;
  if cardinality(v_changes) > 0 then
    update public.task_flows set conditions = v_cond, steps = v_steps, updated_by = v_uid, updated_at = now() where id = p_id;
    insert into public.task_flow_log (flow_id, flow_name, action, detail, by_id)
      values (p_id, (select name from public.task_flows where id = p_id), 'changed', array_to_string(v_changes, '; '), v_uid);
  end if;
  return p_id;
end $$;

create or replace function public.set_task_flow_active(p_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
declare v_uid uuid := private.effective_uid(); v_old public.task_flows; v_why text;
begin
  if not private.is_admin() then raise exception 'Only an Admin or Super admin can use Task Builder.' using errcode = '42501'; end if;
  select * into v_old from public.task_flows where id = p_id for update;
  if not found then raise exception 'That flow was not found. Refresh the page and try again.' using errcode = 'P0001'; end if;
  if v_old.active = coalesce(p_active, false) then return; end if;
  if p_active then
    v_why := private.task_flow_can_run(v_old.trigger, v_old.steps);
    if v_why <> '' then raise exception '%', v_why using errcode = 'P0001'; end if;
  end if;
  update public.task_flows set active = coalesce(p_active, false), updated_by = v_uid, updated_at = now() where id = p_id;
  insert into public.task_flow_log (flow_id, flow_name, action, by_id) values (p_id, v_old.name, case when p_active then 'turned on' else 'turned off' end, v_uid);
end $$;

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
        'status', r.status, 'step_index', r.step_index, 'next_at', r.next_at, 'started_at', r.started_at, 'finished_at', r.finished_at, 'log', r.log) order by r.started_at desc)
      from (select * from public.task_flow_runs order by started_at desc limit 50) r join public.task_flows f on f.id = r.flow_id join public.deals d on d.id = r.deal_id), '[]'::jsonb));
end $$;

-- ---------- the engine ----------
-- Start the flows an event (or a time trigger) starts on this file. Returns how many runs started.
create or replace function private.task_flow_start(p_deal uuid, p_event text) returns int
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
declare n int;
begin
  insert into public.task_flow_runs (flow_id, deal_id)
  select f.id, p_deal from public.task_flows f join public.deals d on d.id = p_deal
  where f.active and f.trigger = p_event and private.task_flow_can_run(f.trigger, f.steps) = '' and coalesce(d.status, 'Open') = 'Open'
    and (not exists (select 1 from public.task_flow_runs r where r.flow_id = f.id and r.deal_id = p_deal)
      or (f.trigger = 'closing_date_set' and not exists (select 1 from public.task_flow_runs r where r.flow_id = f.id and r.deal_id = p_deal and r.status = 'waiting')))
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- Does the file match the flow's conditions?
create or replace function private.task_flow_matches(p_cond jsonb, p_deal uuid) returns boolean
language plpgsql stable security definer set search_path to pg_catalog, public, extensions as $$
declare d record; kind text;
begin
  select * into d from public.deals where id = p_deal;
  if not found then return false; end if;
  kind := case when d.transaction_type = 'Refinance' then 'Refinance' when coalesce(d.loan_amount, 0) > 0 then 'Purchase' else 'Cash purchase' end;
  if jsonb_array_length(coalesce(p_cond -> 'transactionTypes', '[]')) > 0 and not (p_cond -> 'transactionTypes') ? kind then return false; end if;
  if jsonb_array_length(coalesce(p_cond -> 'states', '[]')) > 0 and not (p_cond -> 'states') ? coalesce(d.state, '') then return false; end if;
  if jsonb_array_length(coalesce(p_cond -> 'salesPeople', '[]')) > 0 and not exists (
      select 1 from public.deal_sales_people s where s.deal_id = p_deal and (p_cond -> 'salesPeople') ? s.sales_id::text) then return false; end if;
  return true;
end $$;

-- Move one run on as far as it can go now (same rules as advanceRun in js/data/task-builder.js). Returns tasks created.
create or replace function private.task_flow_advance(p_run uuid) returns int
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
declare
  r public.task_flow_runs; f public.task_flows; d record; s jsonb; made int := 0; n int; owners uuid[]; guard int := 0;
  v_title text;
begin
  select * into r from public.task_flow_runs where id = p_run for update skip locked;
  if not found or r.status <> 'waiting' or r.next_at > now() then return 0; end if;
  select * into f from public.task_flows where id = r.flow_id;
  if not found or not f.active then return 0; end if;
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
          case when s ->> 'type' = 'call_task' then 'Phone call. ' else '' end || 'Added by the "' || f.name || '" flow (Task Builder).',
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

-- The 15-minute job: start the day-based triggers that are met, then move on every run that is due. One file's problem never stops the others.
create or replace function private.run_task_flows() returns jsonb
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
declare f record; dl record; run record; started int := 0; made int := 0;
begin
  for f in select * from public.task_flows where active and trigger in ('emd_not_received', 'days_before_closing') and private.task_flow_can_run(trigger, steps) = '' loop
    for dl in select d.id from public.deals d where coalesce(d.status, 'Open') = 'Open'
        and ((f.trigger = 'emd_not_received' and not coalesce(d.emd_received, false) and d.open_date is not null and current_date - d.open_date >= f.trigger_days)
          or (f.trigger = 'days_before_closing' and d.closing_date is not null and d.closing_date - current_date between 0 and f.trigger_days))
        and not exists (select 1 from public.task_flow_runs r where r.flow_id = f.id and r.deal_id = d.id) loop
      begin started := started + private.task_flow_start(dl.id, f.trigger);
      exception when others then insert into public.task_flow_errors (deal_id, message) values (dl.id, sqlerrm); end;
    end loop;
  end loop;
  for run in select id, deal_id from public.task_flow_runs where status = 'waiting' and next_at <= now() order by next_at limit 500 loop
    begin made := made + private.task_flow_advance(run.id);
    exception when others then insert into public.task_flow_errors (deal_id, run_id, message) values (run.deal_id, run.id, sqlerrm); end;
  end loop;
  return jsonb_build_object('started', started, 'tasks', made);
end $$;

-- "Check files now" on the Task Builder page (Admin / Super admin).
create or replace function public.run_task_flows_now() returns jsonb
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
begin
  if not private.is_admin() then raise exception 'Only an Admin or Super admin can use Task Builder.' using errcode = '42501'; end if;
  return private.run_task_flows();
end $$;

-- Events on a file. Never stops the order from saving.
create or replace function private.trg_task_flow_deal_events() returns trigger
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
begin
  begin
    if tg_op = 'INSERT' then perform private.task_flow_start(new.id, 'order_opened');
    else
      if coalesce(new.emd_received, false) and not coalesce(old.emd_received, false) then perform private.task_flow_start(new.id, 'emd_received'); end if;
      if new.closing_date is not null and new.closing_date is distinct from old.closing_date then perform private.task_flow_start(new.id, 'closing_date_set'); end if;
    end if;
  exception when others then
    begin insert into public.task_flow_errors (deal_id, message) values (new.id, sqlerrm); exception when others then null; end;
  end;
  return null;
end $$;
drop trigger if exists zz_task_flow_events on public.deals;
create trigger zz_task_flow_events after insert or update of emd_received, closing_date on public.deals
  for each row execute function private.trg_task_flow_deal_events();

comment on table public.task_flow_runs is 'TB-2: one Task Builder flow on one file. Written only by the engine (private.task_flow_start / task_flow_advance).';
comment on table public.task_flow_errors is 'TB-2: problems the Task Builder engine hit on a file. They never stop an order from saving.';

revoke all on function private.task_flow_clean_conditions(jsonb), private.task_flow_clean_steps(jsonb), private.task_flow_can_run(text, jsonb),
  private.task_flow_start(uuid, text), private.task_flow_matches(jsonb, uuid), private.task_flow_advance(uuid), private.run_task_flows(),
  private.trg_task_flow_deal_events() from public, anon, authenticated;
revoke all on function public.save_task_flow_v2(uuid, text, text, text, int, jsonb, jsonb), public.run_task_flows_now() from public, anon;
grant execute on function public.save_task_flow_v2(uuid, text, text, text, int, jsonb, jsonb), public.run_task_flows_now() to authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'task-flows-every-15-min';
select cron.schedule('task-flows-every-15-min', '*/15 * * * *', 'select private.run_task_flows()');

commit;
