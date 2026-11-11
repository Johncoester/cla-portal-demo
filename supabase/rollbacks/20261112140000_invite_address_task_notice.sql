-- Rollback for 20261112140000_invite_address_task_notice.sql.
-- Restores invite_send_info without party role or tasks, and drops the task-notice record.
-- TEST only. Not applied to production.

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public, extensions;

do $$ begin
  if not exists (select 1 from vault.secrets where name = 'gmail_sync_token') then
    raise exception 'refusing: this rollback is for CLA Portal Live Test only'; end if;
end $$;

drop function if exists public.invite_svc_mark_task_notice(text, text, uuid, uuid[], text, text);

create or replace function public.invite_send_info(p_kind text, p_token text)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog', 'public', 'extensions' as $function$
declare th text := encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex'); i public.agent_invites; v public.hr_invites; e public.hr_employees; d public.deals;
begin
  if p_kind = 'agent' then
    if not private.can_invite_agents() then raise exception 'Only CLA staff can send portal invites.' using errcode = '42501'; end if;
    select * into i from public.agent_invites where token_hash = th;
    if not found or public.agent_invite_status(i) <> 'pending' then raise exception 'This invite is no longer pending. Make a new link.' using errcode = 'P0001'; end if;
    if i.deal_id is not null then
      if not private.can_access_deal(i.deal_id) then raise exception 'Order not found.' using errcode = '42501'; end if;
      select * into d from public.deals where id = i.deal_id;
    end if;
    return jsonb_build_object('kind', 'agent', 'inviteKind', i.invite_kind, 'email', i.email, 'firstName', i.first_name, 'lastName', i.last_name, 'expiresAt', i.expires_at,
      'dealId', d.id, 'fileNumber', d.file_number, 'street', d.street, 'city', d.city, 'state', d.state, 'zip', d.zip);
  elsif p_kind = 'hr' then
    if not private.hr_admin() then raise exception 'Only HR managers and Super admins send HR invites.' using errcode = '42501'; end if;
    select * into v from public.hr_invites where token_hash = th;
    if not found or v.accepted_at is not null or v.revoked_at is not null or v.expires_at < now() then raise exception 'This invite is no longer pending. Make a new link.' using errcode = 'P0001'; end if;
    select * into e from public.hr_employees where id = v.employee_id;
    if e.id is null or e.archived_at is not null or e.profile_id is not null then raise exception 'This invite is no longer pending. Make a new link.' using errcode = 'P0001'; end if;
    return jsonb_build_object('kind', 'hr', 'inviteKind', 'staff', 'email', v.email, 'firstName', e.first_name, 'lastName', e.last_name, 'expiresAt', v.expires_at);
  end if;
  raise exception 'Unknown invite type.' using errcode = '22023';
end $function$;

alter table public.agent_invites drop column if exists task_notice_at, drop column if exists task_notice_ids;

revoke all on function public.invite_send_info(text, text) from public, anon;
grant execute on function public.invite_send_info(text, text) to authenticated;

commit;
