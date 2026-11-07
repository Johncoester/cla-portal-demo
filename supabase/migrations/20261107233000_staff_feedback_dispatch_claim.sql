-- Unapplied. Reserves one pending feedback event before a webhook post.
-- Not an acknowledgement, a draft, or a published reply.
-- Does not call private.lock_function_search_paths() and does not delete storage.

alter table public.staff_feedback_outbox
  add column if not exists claim_id uuid,
  add column if not exists claimed_at timestamptz,
  add column if not exists dispatch_outcome text,
  add column if not exists last_http_status integer;

alter table public.staff_feedback_outbox drop constraint if exists staff_feedback_outbox_outcome_chk;
alter table public.staff_feedback_outbox
  add constraint staff_feedback_outbox_outcome_chk check (dispatch_outcome is null or dispatch_outcome in ('claimed', 'run_accepted', 'accepted_unrecorded', 'outcome_unknown', 'transport_rejected'));

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

create or replace function public.staff_feedback_claim_dispatch(p_event uuid, p_claim uuid) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.staff_feedback_claim_dispatch(p_event, p_claim) $$;
create or replace function public.staff_feedback_finish_dispatch(p_event uuid, p_claim uuid, p_outcome text, p_http integer) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.staff_feedback_finish_dispatch(p_event, p_claim, p_outcome, p_http) $$;

revoke all on function private.staff_feedback_claim_dispatch(uuid, uuid) from public, anon, authenticated;
revoke all on function private.staff_feedback_finish_dispatch(uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.staff_feedback_claim_dispatch(uuid, uuid) from public, anon, authenticated;
revoke all on function public.staff_feedback_finish_dispatch(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function private.staff_feedback_claim_dispatch(uuid, uuid) to service_role;
grant execute on function private.staff_feedback_finish_dispatch(uuid, uuid, text, integer) to service_role;
grant execute on function public.staff_feedback_claim_dispatch(uuid, uuid) to service_role;
grant execute on function public.staff_feedback_finish_dispatch(uuid, uuid, text, integer) to service_role;
