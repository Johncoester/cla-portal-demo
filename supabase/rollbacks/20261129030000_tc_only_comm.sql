-- Rollback for 20261129030000_tc_only_comm.sql (TC-ONLY-1). Emails and alerts go to agents again as before.
-- The audit rows in comm_redirect_log are dropped with the table; held outbox rows keep their send_blocked note.
begin;
set local lock_timeout = '3s';
drop trigger if exists outbox_tc_only on public.outbox;
drop trigger if exists notifications_tc_only on public.notifications;
drop function if exists public.comm_route_emails(uuid, text[], text[], text[], boolean);
drop function if exists public.set_participant_tc_only(uuid, boolean);
drop function if exists public.tc_only_status(uuid);
drop function if exists private.trg_outbox_tc_only();
drop function if exists private.trg_notifications_tc_only();
drop function if exists private.tc_only_alert(uuid, text);
drop function if exists private.tc_only_held_text(uuid, text, text, text, boolean);
drop function if exists private.comm_swap_greeting(text, text, text);
drop function if exists private.resolve_recipients(uuid, uuid, text);
drop function if exists private.tc_only_targets(uuid);
drop table if exists public.comm_redirect_log;
drop index if exists public.deal_participants_tc_only_idx;
alter table public.deal_participants drop column if exists tc_only;
-- Task Builder "Transaction coordinator" goes back to the CLA staff role only (20261128010000_task_flow_non_referring_agents.sql)
create or replace function private.task_flow_is_recipient(p_deal uuid, p_role text, p_contact uuid, p_send_to text) returns boolean
language plpgsql stable security definer set search_path to pg_catalog, public, extensions as $$
declare v_src text; v_code text; v_who text;
begin
  if p_send_to is distinct from 'non_referring_agents' then return p_role = p_send_to; end if;
  if p_role not in ('Buyer Agent', 'Listing Agent') then return false; end if;
  select btrim(coalesce(source, '')) into v_src from public.deal_business_sources where deal_id = p_deal;
  v_code := split_part(coalesce(v_src, ''), ':', 1);
  v_who := case when position(':' in coalesce(v_src, '')) > 0 then split_part(v_src, ':', 2) else '' end;
  if v_code not in ('buyer_agent', 'listing_agent') then return true; end if;
  if v_who <> '' then return coalesce(p_contact::text, '') <> v_who; end if;
  return p_role <> case v_code when 'buyer_agent' then 'Buyer Agent' else 'Listing Agent' end;
end $$;
revoke all on function private.task_flow_is_recipient(uuid, text, uuid, text) from public, anon, authenticated;
commit;
