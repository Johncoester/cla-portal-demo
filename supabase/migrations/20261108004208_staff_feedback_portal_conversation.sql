-- Local, unpublished. Follow-up turns and a service-role assistant writeback.
-- Does not reapply the claim migration. Does not read orders or attachment bytes.
-- A message body cannot change status, send mail, or authorize another action.
-- Does not call private.lock_function_search_paths() and does not delete storage.

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
  if n <> 1 then return jsonb_build_object('claimed', false, 'reason', 'in_progress'); end if;
  return jsonb_build_object('claimed', true, 'claim_id', p_claim);
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
  body := private.staff_feedback_clean(p_body, 4000, 'a message');
  mid := gen_random_uuid(); eid := gen_random_uuid();
  insert into public.staff_feedback_messages (id, report_id, author_id, author_kind, author_name, body, visibility, simulation, idempotency_key)
    values (mid, r.id, (who->>'id')::uuid, 'reporter', coalesce(who->>'name', 'CLA staff'), body, 'published', false, p_idempotency);
  insert into public.staff_feedback_outbox (id, report_id, feedback_id, conversation_id, message_id, event_name, delivery_state, dispatch_allowed, reason)
    values (eid, r.id, r.id, r.conversation_id, mid, 'cla.feedback.follow_up', 'pending_dispatch', false, 'bridge_unconfigured');
  update public.staff_feedback_reports set updated_at = pg_catalog.now() where id = r.id;
  return private.staff_feedback_payload(r.id) || jsonb_build_object('turn_event_id', eid, 'turn_message_id', mid);
end $$;

create or replace function private.staff_feedback_record_assistant_reply(p_event uuid, p_body text, p_idempotency uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare ev public.staff_feedback_outbox; r public.staff_feedback_reports; body text; mid uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the assistant service can save a portal reply.' using errcode = 'P0001';
  end if;
  if p_idempotency is null then raise exception 'A reply needs an idempotency key.' using errcode = 'P0001'; end if;
  select * into ev from public.staff_feedback_outbox
    where id = p_event and event_name in ('cla.feedback.created', 'cla.feedback.follow_up');
  if ev.id is null then raise exception 'Event not found.' using errcode = 'P0001'; end if;
  select * into r from public.staff_feedback_reports where id = ev.report_id and is_demo = false
    and reporter_id in ('149e612a-6e14-4ee1-9890-0f29d6f89156'::uuid, 'd02722a1-582b-42c0-b3d1-28d25adb758d'::uuid);
  if r.id is null then raise exception 'Event not found.' using errcode = 'P0001'; end if;
  select m.id into mid from public.staff_feedback_messages m
    where m.report_id = r.id and m.idempotency_key = p_idempotency and m.author_kind = 'bot' and m.simulation = false;
  if mid is not null then
    return jsonb_build_object('ok', true, 'idempotent', true, 'event_id', ev.id, 'feedback_id', r.id, 'message_id', mid, 'simulation', false);
  end if;
  if ev.delivery_state <> 'run_accepted' then
    raise exception 'A reply needs an accepted run for this event.' using errcode = 'P0001';
  end if;
  body := private.staff_feedback_clean(p_body, 4000, 'a reply');
  mid := gen_random_uuid();
  insert into public.staff_feedback_messages (id, report_id, author_id, author_kind, author_name, body, visibility, simulation, idempotency_key)
    values (mid, r.id, null, 'bot', 'Tech assistant', body, 'published', false, p_idempotency);
  update public.staff_feedback_reports set updated_at = pg_catalog.now() where id = r.id;
  return jsonb_build_object('ok', true, 'idempotent', false, 'event_id', ev.id, 'feedback_id', r.id, 'message_id', mid, 'simulation', false, 'status', r.status);
end $$;

create or replace function public.staff_feedback_add_turn(p_report uuid, p_body text, p_idempotency uuid) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.staff_feedback_add_turn(p_report, p_body, p_idempotency) $$;
create or replace function public.staff_feedback_record_assistant_reply(p_event uuid, p_body text, p_idempotency uuid) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.staff_feedback_record_assistant_reply(p_event, p_body, p_idempotency) $$;

revoke all on function private.staff_feedback_add_turn(uuid, text, uuid) from public, anon;
revoke all on function public.staff_feedback_add_turn(uuid, text, uuid) from public, anon;
grant execute on function private.staff_feedback_add_turn(uuid, text, uuid) to authenticated;
grant execute on function public.staff_feedback_add_turn(uuid, text, uuid) to authenticated;

revoke all on function private.staff_feedback_record_assistant_reply(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.staff_feedback_record_assistant_reply(uuid, text, uuid) from public, anon, authenticated;
grant execute on function private.staff_feedback_record_assistant_reply(uuid, text, uuid) to service_role;
grant execute on function public.staff_feedback_record_assistant_reply(uuid, text, uuid) to service_role;
