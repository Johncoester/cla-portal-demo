-- Local, unpublished. Follow-up turns and a service-role assistant writeback.
-- Does not reapply the claim migration. Does not read orders or attachment bytes.
-- A message body cannot change status, send mail, or authorize another action.
-- Does not call private.lock_function_search_paths() and does not delete storage.

alter table public.staff_feedback_messages add column if not exists turn_ord bigint;
with ordered as (
  select id, row_number() over (order by created_at asc, id asc) as n
  from public.staff_feedback_messages
)
update public.staff_feedback_messages m
  set turn_ord = ordered.n
  from ordered
  where m.id = ordered.id;
create sequence if not exists public.staff_feedback_message_turn_ord_seq;
select pg_catalog.setval(
  'public.staff_feedback_message_turn_ord_seq',
  greatest(coalesce((select max(turn_ord) from public.staff_feedback_messages), 1), 1),
  exists (select 1 from public.staff_feedback_messages));
alter table public.staff_feedback_messages alter column turn_ord set default pg_catalog.nextval('public.staff_feedback_message_turn_ord_seq');
alter table public.staff_feedback_messages alter column turn_ord set not null;

alter table public.staff_feedback_outbox add column if not exists reply_enabled boolean not null default false;

alter table public.staff_feedback_outbox drop constraint if exists staff_feedback_outbox_event_chk;
alter table public.staff_feedback_outbox
  add constraint staff_feedback_outbox_event_chk check (event_name in ('cla.feedback.created', 'cla.feedback.staff_reply', 'cla.feedback.follow_up'));

create or replace function private.staff_feedback_claim_dispatch(p_event uuid, p_claim uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Dispatch claim is only for the portal function.' using errcode = 'P0001';
  end if;
  update public.staff_feedback_outbox e
    set claim_id = p_claim, claimed_at = pg_catalog.now(), attempt_count = e.attempt_count + 1, dispatch_outcome = 'claimed'
    from public.staff_feedback_reports r
    join public.profiles p on p.id = r.reporter_id
    where e.id = p_event
      and e.feedback_id = r.id
      and e.event_name in ('cla.feedback.created', 'cla.feedback.follow_up')
      and e.delivery_state = 'pending_dispatch'
      and r.is_demo = false
      and r.reporter_id in ('149e612a-6e14-4ee1-9890-0f29d6f89156'::uuid, 'd02722a1-582b-42c0-b3d1-28d25adb758d'::uuid)
      and p.status = 'active'
      and p.is_demo = false
      and (e.claim_id is null or e.claimed_at < pg_catalog.now() - interval '2 minutes')
      and coalesce(e.dispatch_outcome, '') not in ('accepted_unrecorded', 'outcome_unknown', 'run_accepted');
  get diagnostics n = row_count;
  if n = 1 then return jsonb_build_object('claimed', true, 'claim_id', p_claim); end if;
  return coalesce((
    select case
      when e.dispatch_outcome = 'accepted_unrecorded' then jsonb_build_object('claimed', false, 'reason', 'accepted_unrecorded', 'claim_id', e.claim_id)
      when e.dispatch_outcome = 'outcome_unknown' then jsonb_build_object('claimed', false, 'reason', 'needs_reconciliation', 'claim_id', e.claim_id)
      else jsonb_build_object('claimed', false, 'reason', 'in_progress')
    end
    from public.staff_feedback_outbox e
    where e.id = p_event
  ), jsonb_build_object('claimed', false, 'reason', 'in_progress'));
end $$;

create or replace function private.staff_feedback_finish_dispatch(p_event uuid, p_claim uuid, p_outcome text, p_http integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Dispatch claim is only for the portal function.' using errcode = 'P0001';
  end if;
  if p_outcome = 'run_accepted' and p_http = 200 then
    update public.staff_feedback_outbox
      set delivery_state = 'run_accepted', reason = 'run_started', dispatch_allowed = true,
          dispatch_outcome = 'run_accepted', last_http_status = 200, accepted_at = coalesce(accepted_at, pg_catalog.now())
      where id = p_event and claim_id = p_claim and delivery_state = 'pending_dispatch';
    get diagnostics n = row_count;
    if n <> 1 then return jsonb_build_object('ok', false, 'delivery_state', 'pending_dispatch'); end if;
    update public.staff_feedback_reports r
      set delivery_state = 'run_accepted', delivery_reason = 'run_started', updated_at = pg_catalog.now()
      from public.staff_feedback_outbox e
      where e.id = p_event and e.feedback_id = r.id and e.claim_id = p_claim and e.event_name = 'cla.feedback.created';
    perform private.staff_feedback_publish_prepared(p_event);
    return jsonb_build_object('ok', true, 'delivery_state', 'run_accepted');
  end if;
  if p_outcome in ('accepted_unrecorded', 'outcome_unknown', 'transport_rejected') then
    update public.staff_feedback_outbox
      set dispatch_outcome = p_outcome, last_http_status = p_http
      where id = p_event and claim_id = p_claim and delivery_state = 'pending_dispatch';
    get diagnostics n = row_count;
    return jsonb_build_object('ok', n = 1, 'delivery_state', 'pending_dispatch', 'outcome', p_outcome);
  end if;
  return jsonb_build_object('ok', false, 'delivery_state', 'pending_dispatch');
end $$;

create or replace function private.staff_feedback_add_turn(p_report uuid, p_body text, p_idempotency uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare who jsonb; r public.staff_feedback_reports; body text; mid uuid; eid uuid;
begin
  who := private.staff_feedback_require(false);
  if p_idempotency is null or not private.staff_feedback_visible(p_report) then raise exception 'Report not found.' using errcode = 'P0001'; end if;
  select * into r from public.staff_feedback_reports where id = p_report;
  if r.id is null or r.reporter_id <> (who->>'id')::uuid then raise exception 'Report not found.' using errcode = 'P0001'; end if;
  select m.id, e.id into mid, eid
    from public.staff_feedback_messages m
    join public.staff_feedback_outbox e on e.message_id = m.id and e.event_name = 'cla.feedback.follow_up'
    where m.report_id = r.id and m.idempotency_key = p_idempotency;
  if mid is not null then
    return private.staff_feedback_payload(r.id) || jsonb_build_object('turn_event_id', eid, 'turn_message_id', mid);
  end if;
  if r.status in ('fixed', 'wont_fix') then raise exception 'This conversation is closed.' using errcode = 'P0001'; end if;
  if (select count(*) from public.staff_feedback_outbox e where e.report_id = r.id and e.event_name = 'cla.feedback.follow_up') >= 20 then
    raise exception 'This conversation has reached the message limit.' using errcode = 'P0001'; end if;
  if (select count(*) from public.staff_feedback_outbox e where e.report_id = r.id and e.event_name = 'cla.feedback.follow_up' and e.created_at > pg_catalog.now() - interval '10 minutes') >= 8 then
    raise exception 'Send the next message in a few minutes.' using errcode = 'P0001'; end if;
  body := private.staff_feedback_clean(p_body, 4000, 'a message');
  mid := gen_random_uuid(); eid := gen_random_uuid();
  insert into public.staff_feedback_messages (id, report_id, author_id, author_kind, author_name, body, visibility, simulation, idempotency_key)
    values (mid, r.id, (who->>'id')::uuid, 'reporter', coalesce(who->>'name', 'CLA staff'), body, 'published', false, p_idempotency);
  insert into public.staff_feedback_outbox (id, report_id, feedback_id, conversation_id, message_id, event_name, delivery_state, dispatch_allowed, reason, reply_enabled)
    values (eid, r.id, r.id, r.conversation_id, mid, 'cla.feedback.follow_up', 'pending_dispatch', false, 'pending_explicit', true);
  update public.staff_feedback_reports set updated_at = pg_catalog.now() where id = r.id;
  return private.staff_feedback_payload(r.id) || jsonb_build_object('turn_event_id', eid, 'turn_message_id', mid);
end $$;

create table private.staff_feedback_reply_slot (
  idempotency_key uuid primary key,
  event_id uuid not null unique,
  report_id uuid not null,
  body text not null,
  state text not null check (state in ('prepared', 'written')),
  message_id uuid,
  created_at timestamptz not null default pg_catalog.now(),
  written_at timestamptz,
  constraint staff_feedback_reply_slot_written_chk check (
    (state = 'prepared' and message_id is null and written_at is null)
    or (state = 'written' and message_id is not null and written_at is not null))
);
alter table private.staff_feedback_reply_slot enable row level security;
alter table private.staff_feedback_reply_slot force row level security;
revoke all on table private.staff_feedback_reply_slot from public, anon, authenticated, service_role;

create or replace function private.staff_feedback_receiver_session_ok() returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare who text := coalesce(auth.role(), '');
begin
  if auth.uid() is not null then return false; end if;
  if current_user in ('anon', 'authenticated') then return false; end if;
  if who in ('service_role', '') then return true; end if;
  if current_user in ('postgres', 'supabase_admin', 'service_role') then return true; end if;
  return false;
end $$;
revoke all on function private.staff_feedback_receiver_session_ok() from public, anon, authenticated;

create or replace function private.staff_feedback_receiver_read(p_event uuid, p_feedback uuid, p_conversation uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare ev public.staff_feedback_outbox; r public.staff_feedback_reports; cur public.staff_feedback_messages;
  ctx jsonb; limited boolean := false; n int;
begin
  if not private.staff_feedback_receiver_session_ok() then
    raise exception 'The portal user cannot read the receiver view.' using errcode = 'P0001';
  end if;
  select * into ev from public.staff_feedback_outbox
    where id = p_event and feedback_id = p_feedback and conversation_id = p_conversation
      and event_name in ('cla.feedback.created', 'cla.feedback.follow_up');
  if ev.id is null then raise exception 'Event not found.' using errcode = 'P0001'; end if;
  select rep.* into r from public.staff_feedback_reports rep
    join public.profiles p on p.id = rep.reporter_id
    where rep.id = ev.feedback_id and rep.conversation_id = ev.conversation_id and rep.is_demo = false
      and rep.reporter_id in ('149e612a-6e14-4ee1-9890-0f29d6f89156'::uuid, 'd02722a1-582b-42c0-b3d1-28d25adb758d'::uuid)
      and p.status = 'active' and p.is_demo = false;
  if r.id is null then raise exception 'Event not found.' using errcode = 'P0001'; end if;
  if ev.message_id is not null then
    select * into cur from public.staff_feedback_messages
      where id = ev.message_id and report_id = r.id and visibility = 'published' and simulation = false and author_kind = 'reporter';
  elsif ev.event_name = 'cla.feedback.created' then
    select * into cur from public.staff_feedback_messages
      where report_id = r.id and visibility = 'published' and simulation = false and author_kind = 'reporter'
      order by turn_ord asc limit 1;
  end if;
  if cur.id is null then raise exception 'Event message does not match.' using errcode = 'P0001'; end if;
  select count(*) into n from public.staff_feedback_messages m
    where m.report_id = r.id and m.visibility = 'published' and m.simulation = false
      and m.author_kind in ('reporter', 'bot')
      and m.turn_ord < cur.turn_ord;
  limited := n > 16;
  select coalesce(jsonb_agg(jsonb_build_object(
      'message_id', older.id, 'author_kind', older.author_kind, 'body', older.body, 'created_at', older.created_at)
      order by older.turn_ord asc), '[]'::jsonb) into ctx
    from (
      select m.id, m.author_kind, m.body, m.created_at, m.turn_ord
        from public.staff_feedback_messages m
        where m.report_id = r.id and m.visibility = 'published' and m.simulation = false
          and m.author_kind in ('reporter', 'bot')
          and m.turn_ord < cur.turn_ord
        order by m.turn_ord desc
        limit 16
    ) older;
  return jsonb_build_object(
    'ok', true, 'event_id', ev.id, 'feedback_id', r.id, 'conversation_id', r.conversation_id,
    'event_name', ev.event_name, 'delivery_state', ev.delivery_state, 'reply_enabled', ev.reply_enabled, 'reporter_id', r.reporter_id,
    'current', jsonb_build_object('message_id', cur.id, 'author_kind', cur.author_kind, 'body', cur.body, 'created_at', cur.created_at),
    'context', ctx, 'context_limited', limited);
end $$;

create or replace function private.staff_feedback_publish_prepared(p_event uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare ev public.staff_feedback_outbox; slot private.staff_feedback_reply_slot; mid uuid; st text;
begin
  select * into ev from public.staff_feedback_outbox where id = p_event for update;
  if ev.id is null or ev.reply_enabled is not true then
    return jsonb_build_object('ok', false, 'state', 'refused', 'completed', false, 'retry_write', false, 'reason', 'reply_not_enabled');
  end if;
  if ev.delivery_state = 'pending_dispatch' and ev.dispatch_outcome = 'accepted_unrecorded' and ev.last_http_status = 200 and ev.claim_id is not null then
    update public.staff_feedback_outbox
      set delivery_state = 'run_accepted', reason = 'run_started', dispatch_allowed = true,
          dispatch_outcome = 'run_accepted', accepted_at = coalesce(accepted_at, pg_catalog.now())
      where id = ev.id and delivery_state = 'pending_dispatch' and dispatch_outcome = 'accepted_unrecorded' and last_http_status = 200;
    update public.staff_feedback_reports r
      set delivery_state = 'run_accepted', delivery_reason = 'run_started', updated_at = pg_catalog.now()
      where r.id = ev.feedback_id and ev.event_name = 'cla.feedback.created';
    select * into ev from public.staff_feedback_outbox where id = p_event;
  end if;
  if ev.delivery_state not in ('run_accepted', 'bot_acknowledged', 'replied') then
    return jsonb_build_object('ok', true, 'state', 'prepared', 'completed', false, 'retry_write', true,
      'reason', case when ev.dispatch_outcome = 'outcome_unknown' then 'outcome_unknown' else 'awaiting_acceptance' end,
      'event_id', ev.id, 'feedback_id', ev.feedback_id, 'message_id', null);
  end if;
  select * into slot from private.staff_feedback_reply_slot where event_id = ev.id for update;
  if slot.idempotency_key is null then
    return jsonb_build_object('ok', true, 'state', 'none', 'completed', false, 'retry_write', false, 'event_id', ev.id, 'feedback_id', ev.feedback_id);
  end if;
  if slot.state = 'written' then
    return jsonb_build_object('ok', true, 'state', 'written', 'idempotent', true, 'completed', true, 'retry_write', false,
      'event_id', ev.id, 'feedback_id', ev.feedback_id, 'message_id', slot.message_id, 'idempotency_key', slot.idempotency_key, 'simulation', false);
  end if;
  mid := gen_random_uuid();
  insert into public.staff_feedback_messages (id, report_id, author_id, author_kind, author_name, body, visibility, simulation, idempotency_key)
    values (mid, ev.report_id, null, 'bot', 'Tech assistant', slot.body, 'published', false, slot.idempotency_key);
  update private.staff_feedback_reply_slot
    set state = 'written', message_id = mid, written_at = pg_catalog.now()
    where idempotency_key = slot.idempotency_key and state = 'prepared';
  select status into st from public.staff_feedback_reports where id = ev.report_id;
  update public.staff_feedback_reports set updated_at = pg_catalog.now() where id = ev.report_id;
  return jsonb_build_object('ok', true, 'state', 'written', 'idempotent', false, 'completed', true, 'retry_write', false,
    'event_id', ev.id, 'feedback_id', ev.feedback_id, 'message_id', mid, 'idempotency_key', slot.idempotency_key, 'simulation', false, 'status', st);
end $$;
revoke all on function private.staff_feedback_publish_prepared(uuid) from public, anon, authenticated;

create or replace function private.staff_feedback_record_assistant_reply(p_event uuid, p_body text, p_idempotency uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare ev public.staff_feedback_outbox; r public.staff_feedback_reports; slot private.staff_feedback_reply_slot; body text; published jsonb;
begin
  if not private.staff_feedback_receiver_session_ok() then
    raise exception 'The portal user cannot save an assistant reply.' using errcode = 'P0001';
  end if;
  if p_idempotency is null then raise exception 'A reply needs one response key.' using errcode = 'P0001'; end if;
  select * into ev from public.staff_feedback_outbox
    where id = p_event and event_name in ('cla.feedback.created', 'cla.feedback.follow_up')
    for update;
  if ev.id is null then raise exception 'Event not found.' using errcode = 'P0001'; end if;
  if ev.reply_enabled is not true then
    return jsonb_build_object('ok', false, 'state', 'refused', 'completed', false, 'retry_write', false, 'reason', 'reply_not_enabled', 'event_id', ev.id);
  end if;
  select rep.* into r from public.staff_feedback_reports rep
    join public.profiles p on p.id = rep.reporter_id
    where rep.id = ev.report_id and rep.is_demo = false
      and rep.reporter_id in ('149e612a-6e14-4ee1-9890-0f29d6f89156'::uuid, 'd02722a1-582b-42c0-b3d1-28d25adb758d'::uuid)
      and p.status = 'active' and p.is_demo = false;
  if r.id is null then raise exception 'Event not found.' using errcode = 'P0001'; end if;
  body := private.staff_feedback_clean(p_body, 4000, 'a reply');
  select * into slot from private.staff_feedback_reply_slot
    where idempotency_key = p_idempotency or event_id = ev.id
    for update;
  if slot.idempotency_key is not null and (slot.idempotency_key <> p_idempotency or slot.event_id <> ev.id or slot.body is distinct from body) then
    return jsonb_build_object('ok', false, 'conflict', true, 'state', slot.state, 'completed', false, 'retry_write', false,
      'reason', 'response_key_conflict', 'event_id', slot.event_id, 'feedback_id', r.id,
      'idempotency_key', slot.idempotency_key, 'message_id', slot.message_id, 'simulation', false);
  end if;
  if slot.state = 'written' then
    return jsonb_build_object('ok', true, 'state', 'written', 'idempotent', true, 'completed', true, 'retry_write', false,
      'event_id', ev.id, 'feedback_id', r.id, 'message_id', slot.message_id, 'idempotency_key', slot.idempotency_key, 'simulation', false);
  end if;
  if slot.idempotency_key is null then
    insert into private.staff_feedback_reply_slot (idempotency_key, event_id, report_id, body, state)
      values (p_idempotency, ev.id, r.id, body, 'prepared');
  end if;
  published := private.staff_feedback_publish_prepared(ev.id);
  if published->>'state' = 'written' then return published || jsonb_build_object('feedback_id', r.id, 'simulation', false); end if;
  return jsonb_build_object('ok', true, 'state', 'prepared', 'idempotent', slot.idempotency_key is not null,
    'completed', false, 'retry_write', true, 'reason', coalesce(published->>'reason', 'awaiting_acceptance'),
    'event_id', ev.id, 'feedback_id', r.id, 'idempotency_key', p_idempotency, 'message_id', null, 'simulation', false);
end $$;

create or replace function public.staff_feedback_add_turn(p_report uuid, p_body text, p_idempotency uuid) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.staff_feedback_add_turn(p_report, p_body, p_idempotency) $$;
create or replace function public.staff_feedback_record_assistant_reply(p_event uuid, p_body text, p_idempotency uuid) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.staff_feedback_record_assistant_reply(p_event, p_body, p_idempotency) $$;
create or replace function public.staff_feedback_receiver_read(p_event uuid, p_feedback uuid, p_conversation uuid) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.staff_feedback_receiver_read(p_event, p_feedback, p_conversation) $$;

revoke all on function private.staff_feedback_add_turn(uuid, text, uuid) from public, anon;
revoke all on function public.staff_feedback_add_turn(uuid, text, uuid) from public, anon;
grant execute on function private.staff_feedback_add_turn(uuid, text, uuid) to authenticated;
grant execute on function public.staff_feedback_add_turn(uuid, text, uuid) to authenticated;

revoke all on function private.staff_feedback_record_assistant_reply(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.staff_feedback_record_assistant_reply(uuid, text, uuid) from public, anon, authenticated;
revoke all on function private.staff_feedback_receiver_read(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.staff_feedback_receiver_read(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function private.staff_feedback_record_assistant_reply(uuid, text, uuid) to service_role;
grant execute on function public.staff_feedback_record_assistant_reply(uuid, text, uuid) to service_role;
grant execute on function private.staff_feedback_receiver_read(uuid, uuid, uuid) to service_role;
grant execute on function public.staff_feedback_receiver_read(uuid, uuid, uuid) to service_role;
grant usage on schema private to service_role;

create or replace function private.staff_feedback_create(p_title text, p_body text, p_include_page boolean, p_page text, p_include_order boolean, p_file_number text, p_idempotency uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare who jsonb; existing uuid; title text; body text; page text; deal uuid; file_no text; n int; rid uuid; cid uuid; eid uuid; mid uuid;
begin
  who := private.staff_feedback_require(false);
  if p_idempotency is null then raise exception 'Save could not be retried safely. Reload this page.' using errcode = 'P0001'; end if;
  select id into existing from public.staff_feedback_reports where reporter_id = (who->>'id')::uuid and idempotency_key = p_idempotency;
  if existing is not null then return private.staff_feedback_payload(existing); end if;
  title := private.staff_feedback_clean(p_title, 140, 'a short title');
  body := private.staff_feedback_clean(p_body, 4000, 'what happened');
  if coalesce(p_include_page, false) then
    page := left(btrim(coalesce(p_page, '')), 200);
    if page !~ '^#/[A-Za-z0-9_./-]+$' or page ~* 'token|bearer|secret|password|apikey|api_key|eyJ' then
      raise exception 'The page note must be a portal path such as #/orders, with no query or secrets.' using errcode = 'P0001'; end if;
  end if;
  if coalesce(p_include_order, false) then
    file_no := btrim(coalesce(p_file_number, ''));
    if file_no = '' or file_no !~ '^[A-Za-z0-9-]+$' or char_length(file_no) > 40 then
      raise exception 'Enter the file number to include, or leave the order box unchecked.' using errcode = 'P0001'; end if;
    select count(*) into n from public.deals d where d.file_number = file_no and coalesce(d.is_demo, false) is not distinct from private.viewer_is_demo() and private.can_access_deal(d.id);
    if n <> 1 then raise exception 'That order is not on your account, so it was not attached.' using errcode = 'P0001'; end if;
    select d.id, d.file_number into deal, file_no from public.deals d where d.file_number = file_no and coalesce(d.is_demo, false) is not distinct from private.viewer_is_demo() and private.can_access_deal(d.id);
  end if;
  rid := gen_random_uuid(); cid := gen_random_uuid(); eid := gen_random_uuid(); mid := gen_random_uuid();
  insert into public.staff_feedback_reports (id, conversation_id, reporter_id, reporter_role, reporter_name, is_demo, title, body, status, delivery_state, delivery_reason, page_path, order_deal_id, order_file_number, idempotency_key, created_event_id)
    values (rid, cid, (who->>'id')::uuid, who->>'role', coalesce(who->>'name', 'CLA staff'), (who->>'is_demo')::boolean, title, body, 'open', 'pending_dispatch', 'bridge_unconfigured', page, deal, file_no, p_idempotency, eid);
  insert into public.staff_feedback_messages (id, report_id, author_id, author_kind, author_name, body, visibility, idempotency_key)
    values (mid, rid, (who->>'id')::uuid, 'reporter', coalesce(who->>'name', 'CLA staff'), body, 'published', p_idempotency);
  insert into public.staff_feedback_outbox (id, report_id, feedback_id, conversation_id, message_id, event_name, delivery_state, dispatch_allowed, reason, reply_enabled)
    values (eid, rid, rid, cid, mid, 'cla.feedback.created', 'pending_dispatch', false, 'bridge_unconfigured', true);
  return private.staff_feedback_payload(rid);
end $$;

create or replace function private.staff_feedback_payload(p_report uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare who jsonb; r public.staff_feedback_reports; support boolean;
begin
  who := private.staff_feedback_require(false);
  if not private.staff_feedback_visible(p_report) then raise exception 'Report not found.' using errcode = 'P0001'; end if;
  select * into r from public.staff_feedback_reports where id = p_report;
  support := (who->>'is_admin')::boolean and r.is_demo is not distinct from (who->>'is_demo')::boolean;
  return jsonb_build_object(
    'id', r.id, 'conversation_id', r.conversation_id, 'title', r.title, 'body', r.body, 'status', r.status,
    'delivery_state', r.delivery_state, 'delivery_reason', r.delivery_reason,
    'notice', private.staff_feedback_notice(r.delivery_state, r.delivery_reason),
    'page_path', r.page_path, 'order_deal_id', r.order_deal_id, 'order_file_number', r.order_file_number,
    'reporter_id', r.reporter_id, 'reporter_role', r.reporter_role, 'reporter_name', r.reporter_name,
    'is_demo', r.is_demo, 'created_at', r.created_at, 'updated_at', r.updated_at,
    'mine', r.reporter_id = (who->>'id')::uuid, 'can_support', support,
    'portal_saved', true, 'sent', false,
    'run_accepted', r.delivery_state in ('run_accepted', 'bot_acknowledged', 'replied'),
    'bot_read', r.delivery_state in ('bot_acknowledged', 'replied'),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'report_id', m.report_id, 'author_kind', m.author_kind, 'author_name', m.author_name, 'body', m.body, 'visibility', m.visibility, 'simulation', m.simulation, 'created_at', m.created_at, 'turn_ord', m.turn_ord) order by m.turn_ord) from public.staff_feedback_messages m where m.report_id = r.id and m.visibility = 'published'), '[]'::jsonb),
    'drafts', case when support then coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'body', m.body, 'author_name', m.author_name, 'visibility', m.visibility, 'created_at', m.created_at, 'turn_ord', m.turn_ord) order by m.turn_ord) from public.staff_feedback_messages m where m.report_id = r.id and m.visibility = 'draft_pending'), '[]'::jsonb) else '[]'::jsonb end,
    'attachments', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'file_name', a.file_name, 'mime_type', a.mime_type, 'size_bytes', a.size_bytes, 'created_at', a.created_at) order by a.created_at) from public.staff_feedback_attachments a where a.report_id = r.id), '[]'::jsonb)
  );
end $$;
