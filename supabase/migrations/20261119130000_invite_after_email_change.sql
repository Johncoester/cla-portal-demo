-- FF-073e / MF-055.2 (Janine YES 10:43 AM ET Nov 13; John 1:30 PM ET Nov 13):
-- when a buyer, seller or agent email changes on a file, staff get a fresh portal invite
-- for the new address, matching their role on that file. This function only creates the
-- invite row. The page then emails it from testportal@clatitle.com.
-- TEST only. Not applied to production. Has a rollback.

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public, extensions;

do $$ begin
  if to_regprocedure('public.create_portal_invite(uuid,uuid,text)') is null or to_regclass('public.agent_invites') is null then
    raise exception 'drift: apply 20261109233000_portal_invite_clients first'; end if;
end $$;

create or replace function private.rpc_invite_after_email_change(p_deal uuid, p_contact uuid)
returns table(invite_id uuid, token text, expires_at timestamptz, invite_kind text, first_name text, last_name text, email text)
language plpgsql security definer set search_path to 'pg_catalog', 'public', 'extensions' as $function$
#variable_conflict use_column
declare c public.contacts; r text; k text; t text := private.new_token(); e text; v_id uuid; own uuid;
begin
  if not private.can_invite_agents() then raise exception 'Only CLA staff (Processor, Preprocessor, Sales Person, Sales Team, Admin) can invite people to the portal.' using errcode = '42501'; end if;
  if p_deal is null or not private.can_access_deal(p_deal) then raise exception 'Order not found.' using errcode = '42501'; end if;
  select * into c from public.contacts x where x.id = p_contact; if not found then raise exception 'Contact not found.' using errcode = 'P0001'; end if;
  select dp.role into r from public.deal_participants dp where dp.deal_id = p_deal and dp.contact_id = p_contact
    and dp.role in ('Client-Buyer', 'Client-Seller', 'Buyer Agent', 'Listing Agent')
    order by case when dp.role in ('Buyer Agent', 'Listing Agent') then 0 else 1 end limit 1;
  if r is null then raise exception 'Only a buyer, seller, buyer agent or listing agent on this file can be invited.' using errcode = 'P0001'; end if;
  k := case when r in ('Buyer Agent', 'Listing Agent') then 'agent' else 'client' end;
  if btrim(coalesce(c.first_name, '')) = '' or btrim(coalesce(c.last_name, '')) = '' then raise exception 'Add a first and last name to this contact (Edit) before inviting.' using errcode = '22023'; end if;
  e := lower(btrim(coalesce(c.email, '')));
  if e !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'Enter a valid email for this person.' using errcode = '22023'; end if;
  own := c.profile_id;
  if exists (select 1 from public.profiles pr where lower(pr.email) = e and pr.status = 'active' and (own is null or pr.id <> own)) then
    raise exception 'Someone with that email already has a portal login.' using errcode = 'P0001'; end if;
  -- Retire this contact's leftover pending invites (usually the old address) so the new one can be emailed.
  update public.agent_invites ai set status = 'revoked', revoked_at = now(), revoked_by = private.effective_uid(), token_hash = null
    where ai.contact_id = c.id and ai.status = 'pending';
  insert into public.agent_invites (token_hash, contact_id, deal_id, first_name, last_name, email, created_by, invite_kind)
  values (encode(digest(t, 'sha256'), 'hex'), c.id, p_deal, btrim(c.first_name), btrim(c.last_name), e, private.effective_uid(), k) returning agent_invites.id into v_id;
  perform private.log_activity(p_deal, case when k = 'agent' then 'agent.invited' else 'client.invited' end, 'agent_invite', v_id,
    btrim(c.first_name) || ' ' || btrim(c.last_name) || ' (' || r || ') invited to the portal after an email change');
  return query select v_id, t, (select ai.expires_at from public.agent_invites ai where ai.id = v_id), k, btrim(c.first_name), btrim(c.last_name), e;
exception when unique_violation then raise exception 'There is already a pending invite for that email. Use Resend on Agent Invites.' using errcode = 'P0001';
end $function$;

create or replace function public.invite_after_email_change(p_deal uuid, p_contact uuid)
returns table(invite_id uuid, token text, expires_at timestamptz, invite_kind text, first_name text, last_name text, email text)
language plpgsql security definer set search_path to 'pg_catalog', 'public', 'extensions' as $function$
begin return query select * from private.rpc_invite_after_email_change(p_deal, p_contact); end; $function$;

revoke all on function private.rpc_invite_after_email_change(uuid, uuid) from public, anon;
grant execute on function private.rpc_invite_after_email_change(uuid, uuid) to authenticated;
revoke all on function public.invite_after_email_change(uuid, uuid) from public, anon;
grant execute on function public.invite_after_email_change(uuid, uuid) to authenticated;

do $readback$
begin
  if position('invited to the portal after an email change' in (select p.prosrc from pg_proc p where p.oid = 'private.rpc_invite_after_email_change(uuid,uuid)'::regprocedure)) = 0 then
    raise exception 'readback: private.rpc_invite_after_email_change missing the email-change invite'; end if;
  if to_regprocedure('public.invite_after_email_change(uuid,uuid)') is null then
    raise exception 'readback: public.invite_after_email_change missing'; end if;
end
$readback$;

commit;
