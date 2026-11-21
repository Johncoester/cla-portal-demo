-- Rollback for 20261127010000_task_flow_email_step.sql. NOT APPLIED by this file.
-- Puts the TB-6 engine back and removes email steps and the File closed trigger. Email steps are taken out of saved flows first; File
-- closed flows are turned off and set to "Closing date set or changed" (the old list cannot hold them; rename or delete them after);
-- flows left with no task step are turned off. Queued flow emails to people with no portal account are removed (the old outbox rule
-- cannot hold them; TEST never sends them).
begin;
set local lock_timeout = '3s';

update public.task_flows set steps = coalesce((select jsonb_agg(s order by n) from jsonb_array_elements(steps) with ordinality x(s, n) where s ->> 'type' <> 'send_email'), '[]')
  where steps @> '[{"type":"send_email"}]';
update public.task_flows set active = false, trigger = 'closing_date_set' where trigger = 'file_closed';
update public.task_flows set active = false where active and not exists (select 1 from jsonb_array_elements(steps) s where s ->> 'type' in ('create_task', 'call_task', 'client_request'));
alter table public.task_flows drop constraint if exists task_flows_trigger_check;
alter table public.task_flows add constraint task_flows_trigger_check check (trigger in ('order_opened', 'contract_received', 'emd_received', 'emd_not_received',
  'commitment_received', 'closing_date_set', 'days_before_closing'));
delete from public.outbox where kind = 'task_flow_email' and to_profile_id is null;
alter table public.outbox drop constraint outbox_recipient_check;
alter table public.outbox add constraint outbox_recipient_check check ((to_profile_id is not null)
  or (title_package and char_length(to_email) > 3 and char_length(to_name) > 0)
  or (post_closing_type is not null and char_length(to_email) > 3)
  or (kind = 'scheduling' and char_length(to_email) > 3 and char_length(to_name) > 0));

create or replace function private.task_flow_trigger_text(p_trigger text, p_days int) returns text
language sql immutable set search_path to pg_catalog as $$
  select case p_trigger
    when 'order_opened' then 'Order opened'
    when 'contract_received' then 'Contract received'
    when 'emd_received' then 'EMD received'
    when 'emd_not_received' then 'EMD not received, ' || p_days || case when p_days = 1 then ' day' else ' days' end || ' after the order was opened'
    when 'commitment_received' then 'Title commitment received'
    when 'closing_date_set' then 'Closing date set or changed'
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
  if p_trigger is null or p_trigger not in ('order_opened', 'contract_received', 'emd_received', 'emd_not_received', 'commitment_received', 'closing_date_set', 'days_before_closing') then
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
    elsif t = 'client_request' then
      out := out || jsonb_build_array(private.task_flow_clean_request(s, i));
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
    when not exists (select 1 from jsonb_array_elements(coalesce(p_steps, '[]')) s where s ->> 'type' in ('create_task', 'call_task', 'client_request'))
      then 'Add at least one "Create a task", "Create a phone call task" or "Request a form from a party" step before turning the flow on.'
    else '' end $$;

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
  v_title text; v_req jsonb;
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
    elsif s ->> 'type' = 'client_request' then
      v_req := private.task_flow_make_requests(r, f, s);
      made := made + (v_req ->> 'made')::int;
      r.log := r.log || private.task_flow_request_log(r, s)
        || coalesce((select jsonb_agg(jsonb_build_object('at', now(), 'text', x)) from jsonb_array_elements_text(v_req -> 'notes') x), '[]');
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
  -- new requests go out straight away: one email per person and file (a test run emails nobody)
  if not r.trial and exists (select 1 from public.task_flow_requests q where q.run_id = p_run and q.sent = 0) then
    perform private.task_flow_send_digests(r.deal_id);
  end if;
  return made;
end $$;

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

create or replace function public.try_task_flow_on_file(p_flow uuid, p_deal uuid) returns jsonb
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
declare f public.task_flows; d record; v_run uuid; n int; r public.task_flow_runs;
begin
  if not private.is_admin() then raise exception 'Only an Admin or Super admin can use Task Builder.' using errcode = '42501'; end if;
  select * into f from public.task_flows where id = p_flow;
  if not found then raise exception 'That flow was not found. Refresh the page and try again.' using errcode = 'P0001'; end if;
  if not exists (select 1 from jsonb_array_elements(f.steps) s where s ->> 'type' in ('create_task', 'call_task', 'client_request')) then
    raise exception 'Add at least one "Create a task", "Create a phone call task" or "Request a form from a party" step before turning the flow on.' using errcode = 'P0001'; end if;
  select * into d from public.deals where id = p_deal;
  if not found then raise exception 'Choose a file to try the flow on.' using errcode = 'P0001'; end if;
  if coalesce(d.status, 'Open') <> 'Open' then raise exception 'That file is not open. Choose an open file.' using errcode = 'P0001'; end if;
  insert into public.task_flow_runs (flow_id, deal_id, trial) values (p_flow, p_deal, true) returning id into v_run;
  n := private.task_flow_advance(v_run);
  select * into r from public.task_flow_runs where id = v_run;
  return jsonb_build_object('run_id', v_run, 'status', r.status, 'tasks', n, 'log', r.log, 'file_number', d.file_number);
end $$;

drop trigger if exists zz_task_flow_events on public.deals;
create trigger zz_task_flow_events after insert or update of emd_received, closing_date on public.deals
  for each row execute function private.trg_task_flow_deal_events();
drop function if exists private.task_flow_send_email(public.task_flow_runs, public.task_flows, jsonb);
drop function if exists private.task_flow_render(text, jsonb);
drop function if exists private.task_flow_merge_values(uuid, text);
drop function if exists private.task_flow_join_names(text[]);
drop function if exists private.task_flow_html_text(text);
drop function if exists private.task_flow_clean_email(jsonb, int);
drop function if exists private.task_flow_merge_keys();
drop function if exists private.task_flow_is_recipient(uuid, text, uuid, text);
drop function if exists private.task_flow_email_role(text);
alter table public.task_flow_runs drop column if exists trial_to;

commit;
