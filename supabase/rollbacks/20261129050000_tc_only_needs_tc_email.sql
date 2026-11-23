-- Rollback TC-ONLY-2c: set_participant_tc_only goes back to the TC-ONLY-1 version (a linked TC with no email can be ticked again).
begin;
set local lock_timeout = '3s';
create or replace function public.set_participant_tc_only(p_participant uuid, p_on boolean) returns jsonb
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
declare a public.deal_participants; v_name text; v_side text; v_tcs text[];
begin
  select * into a from public.deal_participants where id = p_participant;
  if not found or a.role not in ('Buyer Agent', 'Listing Agent') then
    raise exception 'Pick the buyer''s agent or listing agent on this file.' using errcode = 'P0001'; end if;
  if not (private.is_manager() and private.can_access_deal(a.deal_id)) then
    raise exception 'Only CLA staff on this file can change who gets the agent''s emails.' using errcode = '42501'; end if;
  v_side := case a.role when 'Listing Agent' then 'listing' else 'buyer' end;
  select array_agg(coalesce(nullif(full_name, ''), email) order by full_name) into v_tcs from private.tc_only_targets(a.id);
  if coalesce(p_on, false) and v_tcs is null then
    raise exception 'This agent has no TC on the % side of this file. Add their transaction coordinator on Contacts first, then tick Only communicate with TC.', v_side using errcode = 'P0001'; end if;
  update public.deal_participants set tc_only = coalesce(p_on, false) where id = a.id;
  select btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into v_name from public.contacts where id = a.contact_id;
  perform private.log_activity(a.deal_id, 'participant.tc_only', 'deal', a.deal_id,
    case when coalesce(p_on, false) then coalesce(nullif(v_name, ''), 'The agent') || ' (' || v_side || ' side): Only communicate with TC is on. Emails and alerts go to ' || array_to_string(v_tcs, ', ') || '.'
         else coalesce(nullif(v_name, ''), 'The agent') || ' (' || v_side || ' side): Only communicate with TC is off. The agent gets emails again.' end);
  return jsonb_build_object('participantId', a.id, 'tcOnly', coalesce(p_on, false), 'tcs', to_jsonb(coalesce(v_tcs, '{}'::text[])));
end $$;

revoke all on function public.set_participant_tc_only(uuid, boolean) from public, anon;
grant execute on function public.set_participant_tc_only(uuid, boolean) to authenticated;
commit;
