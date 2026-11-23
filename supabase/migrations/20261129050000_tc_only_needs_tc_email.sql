-- TC-ONLY-2c (CLA CRM Bot's review of PR 415, Nov 23 2026; requested by John's lead): the server guard that matches the screen.
-- public.set_participant_tc_only refuses to tick "Only communicate with TC" when no TC linked to the agent on that side has an email
-- (a TC with no email can get nothing, so every message would be held). Unticking is always allowed. The activity line and the
-- returned tcs list only the TCs with an email. Same checks as before: staff/manager on the file (private.is_manager + can_access_deal).
-- No table, policy or grant changes. Rollback: supabase/rollbacks/20261129050000_tc_only_needs_tc_email.sql
begin;
set local lock_timeout = '3s';
do $$
begin
  if to_regprocedure('public.set_participant_tc_only(uuid, boolean)') is null then raise exception 'drift: public.set_participant_tc_only is missing (20261129030000 first)'; end if;
  if to_regprocedure('private.tc_only_targets(uuid)') is null then raise exception 'drift: private.tc_only_targets is missing'; end if;
  if position('TC-ONLY-2c' in pg_get_functiondef('public.set_participant_tc_only(uuid, boolean)'::regprocedure)) > 0 then raise exception 'drift: already applied'; end if;
end $$;

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
  -- TC-ONLY-2c: only a linked TC with an email can stand in for the agent (resolve_recipients holds the message otherwise)
  select array_agg(coalesce(nullif(full_name, ''), email) order by full_name) into v_tcs from private.tc_only_targets(a.id) where coalesce(email, '') <> '';
  if coalesce(p_on, false) and v_tcs is null then
    if exists (select 1 from private.tc_only_targets(a.id)) then
      raise exception 'This agent''s TC on the % side has no email address, so nothing could reach them. Add the TC''s email on Contacts first, then tick Only communicate with TC.', v_side using errcode = 'P0001'; end if;
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
