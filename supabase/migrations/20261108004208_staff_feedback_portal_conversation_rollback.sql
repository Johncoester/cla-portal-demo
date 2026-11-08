-- Undo 20261108004208_staff_feedback_portal_conversation.sql.
-- Does not delete reports, messages, or storage. Stops if a follow-up event exists.

do $$ begin
  if exists (select 1 from public.staff_feedback_outbox where event_name = 'cla.feedback.follow_up') then
    raise exception 'Follow-up events exist. They were not deleted.';
  end if;
end $$;

drop function if exists public.staff_feedback_record_assistant_reply(uuid, text, uuid);
drop function if exists private.staff_feedback_record_assistant_reply(uuid, text, uuid);
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

alter table public.staff_feedback_outbox drop constraint if exists staff_feedback_outbox_event_chk;
alter table public.staff_feedback_outbox
  add constraint staff_feedback_outbox_event_chk check (event_name in ('cla.feedback.created', 'cla.feedback.staff_reply'));
