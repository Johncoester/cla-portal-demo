-- Francis, Nov 10: the invite email names the property, and one follow-up lists the tasks
-- assigned to that invited person. TEST only. Not applied to production.
--
-- invite_send_info gains partyRole (buyer, seller, or agent), the open task titles for that
-- person on the file, and the task ids already covered by a follow-up.
-- invite_svc_mark_task_notice records one batch. A later batch is only the tasks not in that list.
-- Refuses a database that does not have the Live Test Gmail sync secret.

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public, extensions;

do $$ begin
  if to_regprocedure('public.invite_send_info(text,text)') is null or to_regclass('public.agent_invites') is null then
    raise exception 'drift: apply 20261110001000_invite_auto_email first'; end if;
  if not exists (select 1 from vault.secrets where name = 'gmail_sync_token') then
    raise exception 'refusing: this invite mail change is for CLA Portal Live Test only'; end if;
end $$;

alter table public.agent_invites
  add column if not exists task_notice_at timestamptz,
  add column if not exists task_notice_ids uuid[] not null default '{}';

create or replace function public.invite_send_info(p_kind text, p_token text)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog', 'public', 'extensions' as $function$
declare th text := encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex'); i public.agent_invites; v public.hr_invites; e public.hr_employees; d public.deals;
  v_role text; v_tasks jsonb;
begin
  if p_kind = 'agent' then
    if not private.can_invite_agents() then raise exception 'Only CLA staff can send portal invites.' using errcode = '42501'; end if;
    select * into i from public.agent_invites where token_hash = th;
    if not found or public.agent_invite_status(i) <> 'pending' then raise exception 'This invite is no longer pending. Make a new link.' using errcode = 'P0001'; end if;
    if i.deal_id is not null then
      if not private.can_access_deal(i.deal_id) then raise exception 'Order not found.' using errcode = '42501'; end if;
      select * into d from public.deals where id = i.deal_id;
      select case dp.role when 'Client-Buyer' then 'buyer' when 'Client-Seller' then 'seller' when 'Buyer Agent' then 'agent' when 'Listing Agent' then 'agent' end
        into v_role
      from public.deal_participants dp
      where dp.deal_id = i.deal_id and dp.contact_id = i.contact_id
        and ((i.invite_kind = 'agent' and dp.role in ('Buyer Agent', 'Listing Agent'))
          or (i.invite_kind = 'client' and dp.role in ('Client-Buyer', 'Client-Seller')))
      limit 1;
      if v_role is null and i.invite_kind = 'agent' then v_role := 'agent'; end if;
      select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title) order by t.title), '[]'::jsonb)
        into v_tasks
      from public.tasks t
      join public.deal_participants dp on dp.id = t.participant_id
      where dp.deal_id = i.deal_id and dp.contact_id = i.contact_id and t.status <> 'cancelled'
        and ((i.invite_kind = 'agent' and dp.role in ('Buyer Agent', 'Listing Agent'))
          or (i.invite_kind = 'client' and dp.role in ('Client-Buyer', 'Client-Seller')));
    end if;
    return jsonb_build_object('kind', 'agent', 'inviteKind', i.invite_kind, 'email', i.email, 'firstName', i.first_name, 'lastName', i.last_name, 'expiresAt', i.expires_at,
      'dealId', d.id, 'fileNumber', d.file_number, 'street', d.street, 'city', d.city, 'state', d.state, 'zip', d.zip,
      'partyRole', v_role, 'tasks', coalesce(v_tasks, '[]'::jsonb), 'taskNoticeIds', to_jsonb(coalesce(i.task_notice_ids, '{}'::uuid[])));
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

create or replace function public.invite_svc_mark_task_notice(p_kind text, p_token text, p_profile uuid, p_ids uuid[], p_message_id text, p_error text)
returns void language plpgsql security definer set search_path to 'pg_catalog', 'public', 'extensions' as $function$
declare th text := encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex'); v_deal uuid; v_id uuid; n int;
begin
  if p_kind <> 'agent' then raise exception 'Task notices are only for file invites.' using errcode = '22023'; end if;
  n := coalesce(cardinality(p_ids), 0);
  if p_error is null then
    update public.agent_invites set task_notice_at = now(),
      task_notice_ids = (select coalesce(array_agg(distinct x), '{}') from unnest(coalesce(task_notice_ids, '{}') || coalesce(p_ids, '{}')) x)
      where token_hash = th returning deal_id, id into v_deal, v_id;
  else
    select deal_id, id into v_deal, v_id from public.agent_invites where token_hash = th;
  end if;
  if v_deal is not null then
    insert into public.activity_log (deal_id, actor_id, action, entity, entity_id, detail)
    values (v_deal, p_profile, case when p_error is null then 'invite.tasks_emailed' else 'invite.tasks_email_failed' end, 'agent_invite', v_id,
      left(case when p_error is null then 'One task email for ' || n || ' task(s) sent from Gmail' else 'Task email not sent: ' || p_error end, 300));
  end if;
end $function$;

revoke all on function public.invite_send_info(text, text) from public, anon;
grant execute on function public.invite_send_info(text, text) to authenticated;
revoke all on function public.invite_svc_mark_task_notice(text, text, uuid, uuid[], text, text) from public, anon, authenticated;
grant execute on function public.invite_svc_mark_task_notice(text, text, uuid, uuid[], text, text) to service_role;

commit;
