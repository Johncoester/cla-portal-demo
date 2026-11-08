-- Undo 20261108004208_staff_feedback_portal_conversation.sql.
-- Does not delete reports, messages, or storage. Stops if a follow-up event exists.

do $$ begin
  if exists (select 1 from public.staff_feedback_outbox where event_name = 'cla.feedback.follow_up') then
    raise exception 'Follow-up events exist. They were not deleted.';
  end if;
  if to_regclass('private.staff_feedback_reply_slot') is not null
     and exists (select 1 from private.staff_feedback_reply_slot) then
    raise exception 'Reply slots exist. They were not deleted.';
  end if;
end $$;

drop function if exists public.staff_feedback_receiver_read(uuid, uuid, uuid);
drop function if exists private.staff_feedback_receiver_read(uuid, uuid, uuid);
drop function if exists public.staff_feedback_record_assistant_reply(uuid, text, uuid);
drop function if exists private.staff_feedback_record_assistant_reply(uuid, text, uuid);
drop function if exists private.staff_feedback_receiver_session_ok();
drop table if exists private.staff_feedback_reply_slot;
drop function if exists public.staff_feedback_add_turn(uuid, text, uuid);
drop function if exists private.staff_feedback_add_turn(uuid, text, uuid);

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
      and e.event_name = 'cla.feedback.created'
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
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'report_id', m.report_id, 'author_kind', m.author_kind, 'author_name', m.author_name, 'body', m.body, 'visibility', m.visibility, 'simulation', m.simulation, 'created_at', m.created_at) order by m.created_at) from public.staff_feedback_messages m where m.report_id = r.id and m.visibility = 'published'), '[]'::jsonb),
    'drafts', case when support then coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'body', m.body, 'author_name', m.author_name, 'visibility', m.visibility, 'created_at', m.created_at) order by m.created_at) from public.staff_feedback_messages m where m.report_id = r.id and m.visibility = 'draft_pending'), '[]'::jsonb) else '[]'::jsonb end,
    'attachments', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'file_name', a.file_name, 'mime_type', a.mime_type, 'size_bytes', a.size_bytes, 'created_at', a.created_at) order by a.created_at) from public.staff_feedback_attachments a where a.report_id = r.id), '[]'::jsonb)
  );
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
      where e.id = p_event and e.feedback_id = r.id and e.claim_id = p_claim;
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
  insert into public.staff_feedback_outbox (id, report_id, feedback_id, conversation_id, event_name, delivery_state, dispatch_allowed, reason)
    values (eid, rid, rid, cid, 'cla.feedback.created', 'pending_dispatch', false, 'bridge_unconfigured');
  return private.staff_feedback_payload(rid);
end $$;

drop function if exists private.staff_feedback_publish_prepared(uuid);
alter table public.staff_feedback_outbox drop column if exists reply_enabled;
alter table public.staff_feedback_messages drop column if exists turn_ord;
drop sequence if exists public.staff_feedback_message_turn_ord_seq;

alter table public.staff_feedback_outbox drop constraint if exists staff_feedback_outbox_event_chk;
alter table public.staff_feedback_outbox
  add constraint staff_feedback_outbox_event_chk check (event_name in ('cla.feedback.created', 'cla.feedback.staff_reply'));
