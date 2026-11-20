-- TC-INVITE-1. John Coester, Nov 20 2026, 10:41 AM ET (chat, screenshot of Order Contacts on MD-26-97260):
-- "yes of course a TC needs an invite". This reverses the FF-088 decision that agent-side transaction coordinator
-- rows (Buyer Agent TC / Listing Agent TC) get no portal invite.
--
-- What this changes, and nothing else:
--  * private.rpc_create_portal_invite (Order Contacts > Invite to portal) also accepts a Buyer Agent TC or Listing Agent TC row.
--    The invite kind for a TC is 'client' (short login form, Outside user, no brokerage / license, no agent profile).
--  * private.rpc_create_thread_invited (Share Files to someone with no portal login) accepts the same two roles, so Share Files matches.
--  * The refusal sentence for other roles now names the coordinator too.
-- Each function is copied exactly from its live TEST definition (read Nov 20 2026, 10:50 AM ET; last defined in
-- 20261109233000_portal_invite_clients.sql and 20261119030000_share_invited_hold.sql), with only the role list and that sentence changed.
-- Unchanged: private.can_invite_agents() (a CLA staff Transaction Coordinator still cannot invite), the TC self-block trigger (PR 372),
-- agent_tc_links, private.rpc_invite_after_email_change, invite_send_info and invite_service_accept. Grants are kept by create or replace.
-- Apply on TEST (aqcervntopidtcazcmlv) only. Never production. Rollback: supabase/rollbacks/20261125360000_tc_portal_invite.sql

begin;
set local lock_timeout = '3s';

-- drift guard: stop if either function changed since it was read on TEST (Nov 20 2026)
do $tc_invite_drift$
begin
  if (select md5(prosrc) from pg_proc where oid = to_regprocedure('private.rpc_create_portal_invite(uuid,uuid,text)')) is distinct from '150cb04c7b6eda8be11071077f9f6b7f' then
    raise exception 'drift: private.rpc_create_portal_invite changed or missing';
  end if;
  if (select md5(prosrc) from pg_proc where oid = to_regprocedure('private.rpc_create_thread_invited(uuid,text,uuid,text)')) is distinct from 'c7eaa26169b75f5dfe958f309d8bb726' then
    raise exception 'drift: private.rpc_create_thread_invited changed or missing';
  end if;
end
$tc_invite_drift$;

CREATE OR REPLACE FUNCTION private.rpc_create_portal_invite(p_deal uuid, p_contact uuid, p_email text DEFAULT NULL::text)
 RETURNS TABLE(invite_id uuid, token text, expires_at timestamp with time zone, invite_kind text, first_name text, last_name text, email text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
#variable_conflict use_column
declare c public.contacts; r text; k text; t text := private.new_token(); e text; v_id uuid;
begin
  if not private.can_invite_agents() then raise exception 'Only CLA staff (Processor, Preprocessor, Sales Person, Sales Team, Admin) can invite people to the portal.' using errcode = '42501'; end if;
  if p_deal is null or not private.can_access_deal(p_deal) then raise exception 'Order not found.' using errcode = '42501'; end if;
  select * into c from public.contacts x where x.id = p_contact; if not found then raise exception 'Contact not found.' using errcode = 'P0001'; end if;
  select dp.role into r from public.deal_participants dp where dp.deal_id = p_deal and dp.contact_id = p_contact
    and dp.role in ('Client-Buyer', 'Client-Seller', 'Buyer Agent', 'Listing Agent', 'Buyer Agent TC', 'Listing Agent TC')
    order by case when dp.role in ('Buyer Agent', 'Listing Agent') then 0 else 1 end limit 1;
  if r is null then raise exception 'Only a buyer, seller, buyer agent or listing agent on this file, or an agent''s transaction coordinator, can be invited.' using errcode = 'P0001'; end if;
  k := case when r in ('Buyer Agent', 'Listing Agent') then 'agent' else 'client' end;
  if c.profile_id is not null and exists (select 1 from public.profiles where id = c.profile_id and status = 'active') then raise exception 'That person already has a portal login.' using errcode = 'P0001'; end if;
  if btrim(coalesce(c.first_name, '')) = '' or btrim(coalesce(c.last_name, '')) = '' then raise exception 'Add a first and last name to this contact (Edit) before inviting.' using errcode = '22023'; end if;
  e := lower(btrim(coalesce(nullif(btrim(coalesce(c.email, '')), ''), p_email, '')));
  if e !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'Enter a valid email for this person.' using errcode = '22023'; end if;
  if exists (select 1 from public.profiles where lower(email) = e and status = 'active') then raise exception 'Someone with that email already has a portal login.' using errcode = 'P0001'; end if;
  if btrim(coalesce(c.email, '')) = '' then update public.contacts set email = e, modified_by = private.effective_uid(), modified_at = now() where id = c.id; end if;
  update public.agent_invites ai set status = 'revoked', revoked_at = now(), revoked_by = private.effective_uid(), token_hash = null where lower(ai.email) = e and ai.status = 'pending' and ai.expires_at < now();
  insert into public.agent_invites (token_hash, contact_id, deal_id, first_name, last_name, email, created_by, invite_kind)
  values (encode(digest(t, 'sha256'), 'hex'), c.id, p_deal, btrim(c.first_name), btrim(c.last_name), e, private.effective_uid(), k) returning agent_invites.id into v_id;
  perform private.log_activity(p_deal, case when k = 'agent' then 'agent.invited' else 'client.invited' end, 'agent_invite', v_id, btrim(c.first_name) || ' ' || btrim(c.last_name) || ' (' || r || ') invited to the portal (link shown, nothing sent)');
  return query select v_id, t, (select ai.expires_at from public.agent_invites ai where ai.id = v_id), k, btrim(c.first_name), btrim(c.last_name), e;
exception when unique_violation then raise exception 'There is already a pending invite for that email. Use Resend on Agent Invites.' using errcode = 'P0001';
end $function$;

CREATE OR REPLACE FUNCTION private.rpc_create_thread_invited(p_deal uuid, p_subject text, p_contact uuid, p_body text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare tid uuid; c public.contacts; r text; e text; who text; me uuid := private.effective_uid();
begin
  if me is null or p_deal is null or not private.can_access_deal(p_deal) or private.is_view_only() then raise exception 'Not allowed' using errcode = '42501'; end if;
  if not private.can_invite_agents() then
    raise exception 'Only CLA staff who can invite people to the portal can share with someone who has no portal login yet.' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_body, ''))) = 0 then raise exception 'Write a message first' using errcode = 'P0001'; end if;
  select * into c from public.contacts x where x.id = p_contact;
  if not found then raise exception 'That person is not on this order.' using errcode = 'P0001'; end if;
  who := nullif(btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), '');
  if not exists (select 1 from public.deal_participants dp where dp.deal_id = p_deal and dp.contact_id = p_contact) then
    raise exception 'That person is not on this order.' using errcode = 'P0001'; end if;
  select dp.role into r from public.deal_participants dp where dp.deal_id = p_deal and dp.contact_id = p_contact
    and dp.role in ('Client-Buyer', 'Client-Seller', 'Buyer Agent', 'Listing Agent', 'Buyer Agent TC', 'Listing Agent TC')
    order by case when dp.role in ('Buyer Agent', 'Listing Agent') then 0 else 1 end limit 1;
  if r is null then
    raise exception '% has no portal login, and only a buyer, seller, buyer agent or listing agent on this file, or an agent''s transaction coordinator, can be invited to the portal.', coalesce(who, 'That person') using errcode = 'P0001'; end if;
  if c.profile_id is not null and exists (select 1 from public.profiles p where p.id = c.profile_id and p.status = 'active') then
    raise exception '% now has a portal login. Close this window, open Share Files again and pick them.', coalesce(who, 'That person') using errcode = 'P0001'; end if;
  if btrim(coalesce(c.first_name, '')) = '' or btrim(coalesce(c.last_name, '')) = '' then
    raise exception 'Add a first and last name to this contact (File Contacts > Edit) before sharing with them.' using errcode = '22023'; end if;
  e := lower(btrim(coalesce(c.email, '')));
  if e !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'Add a valid email for % (File Contacts > Edit) before sharing with them.', who using errcode = '22023'; end if;
  if exists (select 1 from public.profiles p where lower(p.email) = e and p.status = 'active') then
    raise exception 'Someone with the email % already has a portal login, but this contact is not linked to it. Ask an admin to link the contact, then share again.', e using errcode = 'P0001'; end if;

  insert into public.threads (deal_id, subject, created_by)
    values (p_deal, left(coalesce(nullif(trim(p_subject), ''), 'New conversation'), 150), me) returning id into tid;
  insert into public.thread_participants (thread_id, profile_id, last_read_at) values (tid, me, now());
  insert into public.thread_invitees (thread_id, contact_id, added_by) values (tid, p_contact, me);
  insert into public.messages (thread_id, author_id, body) values (tid, me, left(trim(p_body), 4000));
  perform private.log_activity(p_deal, 'message.thread_invited', 'thread', tid, 'Shared with ' || who || ' (' || r || '), who has no portal login yet. It is held until they sign in.');
  return tid;
end $function$;

commit;
