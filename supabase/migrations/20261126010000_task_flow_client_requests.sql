-- Task Builder TB-6, Nov 20 2026 (John): client requests, like Qualia's. Spec: docs/specs/task-builder.md "TB-6".
-- Needs 20261121010000_task_flow_engine.sql and 20261122010000_task_flow_try_and_scope.sql.
-- * New step "Request a form from a party": who (buyer, seller, buyer's agent, listing agent), which intake form, due in N days, and reminders
--   (every N days, up to M times; 0 = none). The request IS the party's own form task: the file's existing open copy when there is one,
--   else a new copy of the current template version. It completes itself when the party submits the form (save_task_form marks it done).
-- * ONE EMAIL PER PERSON (John): requests and reminders are never emailed one task at a time. Each person gets one email per file listing
--   everything still needed from them there; reminder emails go at most once a day (20 hours apart). Emails are queued in public.outbox
--   only (template_key 'client_request_digest'), from the file's processor, like every other reminder. A test run emails nobody.
-- * Like every reminder, emails go to people with a portal account (public.outbox needs to_profile_id). A party who has not accepted their
--   portal invite yet keeps their request waiting, and it goes out in the first digest after they have an account.
-- * Reminder state lives in public.task_flow_requests (one row per requested task). Rows stop being reminded once the task is not open.
-- Mirrors js/data/client-requests.js and js/data/mock-part-task-builder.js.
-- Not applied on TEST by this change. Rollback: supabase/rollbacks/20261126010000_task_flow_client_requests.sql
begin;
set local lock_timeout = '3s';

do $$
begin
  if to_regclass('public.task_flow_runs') is null then raise exception 'drift: apply 20261121010000_task_flow_engine.sql first'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'task_flow_runs' and column_name = 'trial') then
    raise exception 'drift: apply 20261122010000_task_flow_try_and_scope.sql first'; end if;
  if to_regclass('public.task_templates') is null or to_regclass('public.outbox') is null then raise exception 'drift: task_templates or outbox is missing'; end if;
end $$;

-- ---------- reminder state, one row per requested task ----------
create table if not exists public.task_flow_requests (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null unique references public.tasks (id) on delete cascade,
  deal_id uuid not null references public.deals (id) on delete cascade,
  flow_id uuid references public.task_flows (id) on delete set null,
  run_id uuid references public.task_flow_runs (id) on delete set null,
  remind_every int not null default 0 check (remind_every between 0 and 14),
  remind_times int not null default 0 check (remind_times between 0 and 10),
  sent int not null default 0,
  next_at timestamptz,
  created_at timestamptz not null default now());
create index if not exists task_flow_requests_due on public.task_flow_requests (next_at) where next_at is not null;
create index if not exists task_flow_requests_deal on public.task_flow_requests (deal_id);
alter table public.task_flow_requests enable row level security;   -- read and written only by the engine (security definer)
create index if not exists outbox_client_request_digest on public.outbox (deal_id, to_profile_id, created_at desc) where template_key = 'client_request_digest';

-- ---------- the forms a request can ask for (js/data/client-requests.js REQUEST_FORMS) ----------
create or replace function private.task_flow_request_forms() returns table (code text, title text, roles text[])
language sql immutable set search_path to pg_catalog as $$
  values ('id_upload', 'Upload identification', array['Client-Buyer', 'Client-Seller']),
         ('personal_info', 'Personal information', array['Client-Buyer', 'Client-Seller']),
         ('title_vesting', 'Title vesting', array['Client-Buyer']),
         ('lender_info', 'Lender information', array['Client-Buyer']),
         ('hoa_info', 'Confirm HOA Information', array['Client-Seller']),
         ('mortgage_info', 'Outstanding Mortgage Information', array['Client-Seller']),
         ('home_warranty', 'Home warranty', array['Client-Buyer', 'Client-Seller']),
         ('commissions', 'Commission information', array['Buyer Agent', 'Listing Agent']),
         ('forwarding_address', 'Forwarding address', array['Client-Seller']),
         ('seller_proceeds', 'How you want your proceeds', array['Client-Seller']) $$;

create or replace function private.task_flow_role_name(p text) returns text
language sql immutable set search_path to pg_catalog as $$
  select case p when 'Client-Buyer' then 'buyer' when 'Client-Seller' then 'seller' when 'Buyer Agent' then 'buyer''s agent' when 'Listing Agent' then 'listing agent' else lower(p) end $$;

-- check one request step (same words as cleanRequestStep)
create or replace function private.task_flow_clean_request(s jsonb, i int) returns jsonb
language plpgsql immutable set search_path to pg_catalog as $$
declare fm record; due int; ev int; tm int; v text;
begin
  select * into fm from private.task_flow_request_forms() x where x.code = s ->> 'formCode';
  if not found then raise exception 'Step %: choose which form to request.', i using errcode = 'P0001'; end if;
  if coalesce(s ->> 'sendTo', '') not in ('Client-Buyer', 'Client-Seller', 'Buyer Agent', 'Listing Agent') then
    raise exception 'Step %: choose who the request goes to.', i using errcode = 'P0001'; end if;
  if not ((s ->> 'sendTo') = any (fm.roles)) then
    raise exception 'Step %: "%" is not filled in by the %. Choose %.', i, fm.title, private.task_flow_role_name(s ->> 'sendTo'),
      (select string_agg('the ' || private.task_flow_role_name(r), ' or ') from unnest(fm.roles) r) using errcode = 'P0001'; end if;
  due := case when coalesce(s ->> 'dueDays', '') ~ '^[0-9]{1,2}$' then (s ->> 'dueDays')::int end;
  if due is null or due > 60 then raise exception 'Step %: due in must be a whole number of days from 0 to 60.', i using errcode = 'P0001'; end if;
  v := coalesce(nullif(s ->> 'remindEvery', ''), '0');
  ev := case when v ~ '^[0-9]{1,2}$' then v::int end;
  if ev is null or ev > 14 then raise exception 'Step %: remind every must be a whole number of days from 0 (no reminders) to 14.', i using errcode = 'P0001'; end if;
  v := coalesce(nullif(s ->> 'remindTimes', ''), '0');
  tm := case when v ~ '^[0-9]{1,2}$' then v::int end;
  if tm is null or tm > 10 then raise exception 'Step %: remind up to must be a whole number from 0 to 10.', i using errcode = 'P0001'; end if;
  if ev = 0 then tm := 0;
  elsif tm = 0 then raise exception 'Step %: say how many reminders to send (1 to 10), or set remind every to 0 for none.', i using errcode = 'P0001'; end if;
  return jsonb_build_object('type', 'client_request', 'formCode', fm.code, 'sendTo', s ->> 'sendTo', 'dueDays', due, 'remindEvery', ev, 'remindTimes', tm);
end $$;

-- the run's log line for a request step (same words as requestStepText)
create or replace function private.task_flow_request_log(r public.task_flow_runs, s jsonb) returns jsonb
language sql stable set search_path to pg_catalog, public as $$
  select jsonb_build_object('at', now(), 'text', 'Step ' || r.step_index || ': Request "' || (select title from private.task_flow_request_forms() where code = s ->> 'formCode')
    || '" from the ' || private.task_flow_role_name(s ->> 'sendTo') || ', '
    || case when (s ->> 'dueDays')::int = 0 then 'due the same day' else 'due in ' || (s ->> 'dueDays') || case when (s ->> 'dueDays')::int = 1 then ' day' else ' days' end end || ', '
    || case when coalesce((s ->> 'remindEvery')::int, 0) = 0 then 'no reminders'
       else 'reminder every ' || (s ->> 'remindEvery') || case when (s ->> 'remindEvery')::int = 1 then ' day' else ' days' end || ', up to ' || (s ->> 'remindTimes')
         || case when (s ->> 'remindTimes')::int = 1 then ' time' else ' times' end end
    || case when r.trial then ' (test run: no email)' else '' end) $$;

-- make the request tasks for one step: the party's existing open form copy, else a new copy; then the reminder state (not in a test run)
create or replace function private.task_flow_make_requests(r public.task_flow_runs, f public.task_flows, s jsonb) returns jsonb
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
declare p record; t public.tasks; tp public.task_templates; made int := 0; notes jsonb := '[]'; v_title text; v_name text; seen int := 0;
begin
  select title into v_title from private.task_flow_request_forms() where code = s ->> 'formCode';
  select * into tp from public.task_templates where code = s ->> 'formCode' and active and retired_at is null and private.task_enabled(code) order by version desc limit 1;
  for p in select dp.id, dp.role, c.profile_id, pr.id as active_prof, nullif(btrim(concat_ws(' ', c.first_name, c.last_name)), '') as nm
      from public.deal_participants dp left join public.contacts c on c.id = dp.contact_id left join public.profiles pr on pr.id = c.profile_id and pr.status = 'active'
      where dp.deal_id = r.deal_id and dp.role = s ->> 'sendTo' loop
    seen := seen + 1; v_name := coalesce(p.nm, 'the ' || private.task_flow_role_name(p.role));
    select * into t from public.tasks where participant_id = p.id and template_code = s ->> 'formCode' and status <> 'cancelled' order by created_at desc limit 1;
    if found and t.status = 'done' then                                -- already submitted: nothing to ask
      notes := notes || jsonb_build_array('"' || v_title || '" was already submitted by ' || v_name || ', so it was not requested again.'); continue; end if;
    if not found then
      if tp.id is null then                                           -- the form is switched off or retired
        notes := notes || jsonb_build_array('The "' || v_title || '" form is switched off or retired, so it was not requested.'); continue; end if;
      insert into public.tasks (deal_id, title, description, assigned_role, status, due_date, due_overridden, created_by, kind, participant_id, owner_profile_id,
          template_id, template_code, template_version, lane, audiences, flow_run_id)
        values (r.deal_id, tp.title, btrim(case when r.trial then 'Test run. ' else '' end || 'Requested by the "' || f.name || '" flow (Task Builder). ' || coalesce(tp.description, '')),
          p.role, 'todo', current_date + (s ->> 'dueDays')::int, false, null, 'form', p.id, p.profile_id, tp.id, tp.code, tp.version, tp.lane, tp.audiences, r.id)
        returning * into t;
      made := made + 1;
    end if;
    if r.trial then continue; end if;
    if p.active_prof is null then
      notes := notes || jsonb_build_array(v_name || ' has no portal account yet, so the "' || v_title || '" email waits until they accept their invite.'); end if;
    insert into public.task_flow_requests (task_id, deal_id, flow_id, run_id, remind_every, remind_times, sent, next_at)
      values (t.id, r.deal_id, f.id, r.id, (s ->> 'remindEvery')::int, (s ->> 'remindTimes')::int, 0, now())
      on conflict (task_id) do nothing;                               -- already requested by another flow: one set of reminders
  end loop;
  if seen = 0 then notes := notes || jsonb_build_array('No ' || (s ->> 'sendTo') || ' on this file, so "' || v_title || '" was not requested.'); end if;
  return jsonb_build_object('made', made, 'notes', notes);
end $$;

-- ONE email per person and file, listing everything still needed from them there. p_deal null = every file.
-- The person is whoever holds the request's form task now (the party's portal account), worked out at send time.
-- Due = an open request whose next_at has come; a brand-new request (sent 0) always goes now, a reminder only if no digest went to
-- that person on that file in the last 20 hours. Returns the number of emails queued.
create or replace function private.task_flow_send_digests(p_deal uuid) returns int
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
declare g record; d record; v_list text; v_n int; v_rem boolean; v_subject text; emails int := 0;
begin
  update public.task_flow_requests q set next_at = null from public.tasks t
    where t.id = q.task_id and q.next_at is not null and t.status not in ('todo', 'in_progress', 'blocked') and (p_deal is null or q.deal_id = p_deal);
  if to_regclass('pg_temp.tfr_open') is null then
    create temp table tfr_open (req uuid, deal_id uuid, prof uuid, sent int, next_at timestamptz, title text, due date) on commit drop;
  else truncate tfr_open; end if;
  insert into tfr_open
    select q.id, q.deal_id, pr.id, q.sent, q.next_at, t.title, t.due_date
    from public.task_flow_requests q join public.tasks t on t.id = q.task_id join public.deals dl on dl.id = q.deal_id
      join public.deal_participants dp on dp.id = t.participant_id join public.contacts c on c.id = dp.contact_id
      join public.profiles pr on pr.id = coalesce(t.owner_profile_id, c.profile_id) and pr.status = 'active' and pr.email is not null
    where t.status in ('todo', 'in_progress', 'blocked') and coalesce(dl.status, 'Open') = 'Open' and (p_deal is null or q.deal_id = p_deal);
  for g in
    select o.deal_id, o.prof, bool_or(o.sent = 0 and o.next_at <= now()) as has_new from tfr_open o
    where o.next_at is not null and o.next_at <= now() group by o.deal_id, o.prof
  loop
    if not g.has_new and exists (select 1 from public.outbox x where x.template_key = 'client_request_digest' and x.deal_id = g.deal_id
        and x.to_profile_id = g.prof and x.created_at > now() - interval '20 hours') then continue; end if;
    select file_number, street, city into d from public.deals where id = g.deal_id;
    select string_agg('- ' || o.title || coalesce(' (due ' || o.due || ')', ''), E'\n' order by o.due nulls last, o.title), count(*) into v_list, v_n
      from tfr_open o where o.deal_id = g.deal_id and o.prof = g.prof;
    v_rem := not g.has_new;
    v_subject := case when v_rem then 'Reminder: ' else '' end || case when v_n = 1 then '1 item' else v_n || ' items' end || ' still needed for ' || d.file_number;
    insert into public.outbox (to_profile_id, to_email, to_name, subject, body, task_id, deal_id, created_by, sender_type, template_key)
      select pr.id, pr.email, btrim(concat_ws(' ', pr.first_name, pr.last_name)), v_subject,
        'Hello ' || coalesce(nullif(pr.first_name, ''), 'there') || E',\n\n' || case when v_rem then 'This is a reminder that CLA Title & Escrow still needs' else 'CLA Title & Escrow needs' end
          || ' the following from you for ' || coalesce(nullif(concat_ws(', ', nullif(d.street, ''), nullif(d.city, '')), ''), 'your order') || ' (order ' || d.file_number || E'):\n\n'
          || v_list || E'\n\nPlease sign in to the portal to fill these in. Each item comes off this list once you submit it.\n\nCLA Title & Escrow',
        null, g.deal_id, null, 'processor', 'client_request_digest'
      from public.profiles pr where pr.id = g.prof;
    emails := emails + 1;
    -- count the email on every due request it listed, and set its next reminder (none once the reminders are used up)
    update public.task_flow_requests q set sent = q.sent + 1,
        next_at = case when q.remind_every > 0 and q.sent < q.remind_times then now() + make_interval(days => q.remind_every) end
      from tfr_open o where o.req = q.id and o.deal_id = g.deal_id and o.prof = g.prof and q.next_at is not null and q.next_at <= now();
    begin perform private.notify(array[g.prof], 'reminder', g.deal_id, v_subject, '#/deals/' || g.deal_id || '/tasks');
    exception when others then null; end;
  end loop;
  return emails;
end $$;

-- ---------- the engine, with the new step (replaces TB-2 / Nov 14 versions) ----------
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

create or replace function private.run_task_flows() returns jsonb
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
declare f record; dl record; run record; started int := 0; made int := 0; emails int := 0;
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
  begin emails := private.task_flow_send_digests(null);   -- reminders that are due, one email per person and file
  exception when others then insert into public.task_flow_errors (message) values ('Client request emails: ' || sqlerrm); end;
  return jsonb_build_object('started', started, 'tasks', made, 'emails', emails);
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

revoke all on function private.task_flow_clean_request(jsonb, int), private.task_flow_make_requests(public.task_flow_runs, public.task_flows, jsonb),
  private.task_flow_send_digests(uuid), private.task_flow_request_log(public.task_flow_runs, jsonb), private.task_flow_request_forms(),
  private.task_flow_role_name(text) from public, anon, authenticated;

commit;
