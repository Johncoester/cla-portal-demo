-- Invites email themselves (John, Nov 9: "I want the portal to send it ... just like what staff gets / agents gets"). TEST only. NOT APPLIED.
--
-- Today no invite is emailed: HR invites, agent invites and the new buyer/seller invites all return a one-time link that staff copy by hand
-- (the accept-invite edge function only CREATES the login when the link is used; it never sends mail). Supabase Auth SMTP is only used for
-- password reset and failed with 535 on Nov 8.
--
-- New: when staff create (or Resend) an invite, the page asks the gmail-send edge function (the same one file emails use) to email the invitee
-- from the inviter's own connected @clatitle.com Gmail, with their signature. On Live Test gmail-send still refuses non-test addresses.
--  * public.invite_send_info(kind, token): called AS THE INVITER (their JWT). Checks they may invite (agent / buyer / seller: private.can_invite_agents()
--    and can_access_deal for a file invite; HR: private.hr_admin()), that the token matches a pending, unexpired invite, and returns the
--    recipient (always the invite's own email, never one from the browser) and file details for the subject.
--  * public.invite_svc_mark_sent(kind, token, profile, to, message_id, error): service role only (gmail-send). Records sent_at / sent_via /
--    sent_to / sent_message_id / sent_by / send_count, or the last send_error, on the invite row, plus an activity line for file invites.
--  * agent_invites and hr_invites get those columns (null = never emailed). Existing rows are untouched.

do $$ begin
  if to_regclass('public.agent_invites') is null or to_regclass('public.hr_invites') is null then raise exception 'drift: invite tables missing'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'agent_invites' and column_name = 'invite_kind') then
    raise exception 'drift: apply 20261109233000_portal_invite_clients first'; end if;
  if to_regprocedure('private.hr_admin()') is null or to_regprocedure('private.can_invite_agents()') is null then raise exception 'drift: invite role helpers missing'; end if;
end $$;

alter table public.agent_invites
  add column if not exists sent_at timestamptz, add column if not exists sent_via text, add column if not exists sent_to text,
  add column if not exists sent_message_id text, add column if not exists sent_by uuid references public.profiles(id),
  add column if not exists send_count integer not null default 0, add column if not exists send_error text;
alter table public.hr_invites
  add column if not exists sent_at timestamptz, add column if not exists sent_via text, add column if not exists sent_to text,
  add column if not exists sent_message_id text, add column if not exists sent_by uuid references public.profiles(id),
  add column if not exists send_count integer not null default 0, add column if not exists send_error text;

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

create or replace function public.invite_svc_mark_sent(p_kind text, p_token text, p_profile uuid, p_to text, p_message_id text, p_error text)
returns void language plpgsql security definer set search_path to 'pg_catalog', 'public', 'extensions' as $function$
declare th text := encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex'); v_deal uuid; v_id uuid; v_name text;
begin
  if p_kind = 'agent' then
    if p_error is null then
      update public.agent_invites set sent_at = now(), sent_via = 'gmail', sent_to = lower(p_to), sent_message_id = p_message_id, sent_by = p_profile, send_count = send_count + 1, send_error = null
       where token_hash = th returning deal_id, id, first_name || ' ' || last_name into v_deal, v_id, v_name;
    else
      update public.agent_invites set send_error = left(p_error, 300) where token_hash = th returning deal_id, id, first_name || ' ' || last_name into v_deal, v_id, v_name;
    end if;
    if v_deal is not null then
      insert into public.activity_log (deal_id, actor_id, action, entity, entity_id, detail)
      values (v_deal, p_profile, case when p_error is null then 'invite.emailed' else 'invite.email_failed' end, 'agent_invite', v_id,
        left(case when p_error is null then 'Portal invite emailed to ' || v_name || ' (' || lower(p_to) || ') from Gmail' else 'Portal invite email to ' || v_name || ' not sent: ' || p_error end, 300));
    end if;
  elsif p_kind = 'hr' then
    if p_error is null then
      update public.hr_invites set sent_at = now(), sent_via = 'gmail', sent_to = lower(p_to), sent_message_id = p_message_id, sent_by = p_profile, send_count = send_count + 1, send_error = null where token_hash = th;
    else
      update public.hr_invites set send_error = left(p_error, 300) where token_hash = th;
    end if;
  else
    raise exception 'Unknown invite type.' using errcode = '22023';
  end if;
end $function$;

revoke all on function public.invite_send_info(text, text) from public, anon;
grant execute on function public.invite_send_info(text, text) to authenticated;
revoke all on function public.invite_svc_mark_sent(text, text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.invite_svc_mark_sent(text, text, uuid, text, text, text) to service_role;
