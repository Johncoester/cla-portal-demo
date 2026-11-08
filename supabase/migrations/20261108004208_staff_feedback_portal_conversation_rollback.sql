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

alter table public.staff_feedback_messages drop column if exists turn_ord;

alter table public.staff_feedback_outbox drop constraint if exists staff_feedback_outbox_event_chk;
alter table public.staff_feedback_outbox
  add constraint staff_feedback_outbox_event_chk check (event_name in ('cla.feedback.created', 'cla.feedback.staff_reply'));
