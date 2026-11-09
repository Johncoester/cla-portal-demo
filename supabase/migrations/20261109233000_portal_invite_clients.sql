-- Portal invites from a file for buyers and sellers too (John + Francis, Nov 9: "a processor needs to be able to invite").
-- NOT APPLIED. Review, then apply on TEST only.
--
-- Before this, the only way to give someone a portal login from a file was the agent invite (Buyer Agent / Listing Agent rows).
-- Client-Buyer / Client-Seller rows had no invite at all, and an agent row whose contact had no email failed with
-- "First name, last name and a valid email are required." with no place to type the email.
--
-- What this adds:
--  * agent_invites.invite_kind ('agent' | 'client'). Existing rows stay 'agent'. Clients reuse the same table, link page,
--    Resend / Revoke, the accept-invite edge function (kind 'agent') and service_invite_email, so no edge function deploy.
--  * public.create_portal_invite(deal, contact, email): staff who can invite (private.can_invite_agents(): Processor,
--    Preprocessor, Sales Person, Sales Team, Admin, Super admin; NOT Transaction Coordinator) invite a Client-Buyer,
--    Client-Seller, Buyer Agent or Listing Agent on a file they can open. If the contact has no email, the email typed in
--    the dialog is saved on the contact first (only when it was blank). Nothing is emailed: the link is shown to copy.
--  * public.portal_invite_lookup(token): agent_invite_lookup plus the kind, so the link page shows the short client form.
--  * private.invite_service_accept: a 'client' invite creates the Outside user login, links the existing contact, and does
--    NOT create an agent profile (no brokerage / license fields). The 'agent' and 'hr' branches are unchanged.

-- drift guard: stop if the accept function changed since it was read on TEST (Nov 9, 5:45 PM ET)
do $$ begin
  if (select md5(prosrc) from pg_proc where oid = to_regprocedure('private.invite_service_accept(text,text,uuid,jsonb)')) is distinct from '3a6dc1f06beab05afd2530777daa30af' then
    raise exception 'drift: private.invite_service_accept changed or missing'; end if;
end $$;

alter table public.agent_invites add column if not exists invite_kind text not null default 'agent';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'agent_invites_invite_kind_check') then
    alter table public.agent_invites add constraint agent_invites_invite_kind_check check (invite_kind in ('agent', 'client'));
  end if;
end $$;

create or replace function private.rpc_create_portal_invite(p_deal uuid, p_contact uuid, p_email text default null)
returns table(invite_id uuid, token text, expires_at timestamptz, invite_kind text, first_name text, last_name text, email text)
language plpgsql security definer set search_path to 'pg_catalog', 'public', 'extensions' as $function$
#variable_conflict use_column
declare c public.contacts; r text; k text; t text := private.new_token(); e text; v_id uuid;
begin
  if not private.can_invite_agents() then raise exception 'Only CLA staff (Processor, Preprocessor, Sales Person, Sales Team, Admin) can invite people to the portal.' using errcode = '42501'; end if;
  if p_deal is null or not private.can_access_deal(p_deal) then raise exception 'Order not found.' using errcode = '42501'; end if;
  select * into c from public.contacts x where x.id = p_contact; if not found then raise exception 'Contact not found.' using errcode = 'P0001'; end if;
  select dp.role into r from public.deal_participants dp where dp.deal_id = p_deal and dp.contact_id = p_contact
    and dp.role in ('Client-Buyer', 'Client-Seller', 'Buyer Agent', 'Listing Agent')
    order by case when dp.role in ('Buyer Agent', 'Listing Agent') then 0 else 1 end limit 1;
  if r is null then raise exception 'Only a buyer, seller, buyer agent or listing agent on this file can be invited.' using errcode = 'P0001'; end if;
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

create or replace function public.create_portal_invite(p_deal uuid, p_contact uuid, p_email text default null)
returns table(invite_id uuid, token text, expires_at timestamptz, invite_kind text, first_name text, last_name text, email text)
language plpgsql set search_path to 'pg_catalog', 'public', 'extensions' as $function$
begin return query select * from private.rpc_create_portal_invite(p_deal, p_contact, p_email); end; $function$;

create or replace function private.rpc_portal_invite_lookup(p_token text)
returns table(status text, first_name text, last_name text, email text, expires_at timestamptz, invite_kind text)
language sql stable security definer set search_path to 'pg_catalog', 'public', 'extensions' as $function$
  select coalesce((select public.agent_invite_status(i) from public.agent_invites i where i.token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')), 'invalid'),
    i.first_name, i.last_name, i.email, i.expires_at, i.invite_kind
  from (select 1) one left join public.agent_invites i on i.token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex') and public.agent_invite_status(i) = 'pending' $function$;

create or replace function public.portal_invite_lookup(p_token text)
returns table(status text, first_name text, last_name text, email text, expires_at timestamptz, invite_kind text)
language plpgsql stable set search_path to 'pg_catalog', 'public', 'extensions' as $function$
begin return query select * from private.rpc_portal_invite_lookup(p_token); end; $function$;

-- Same as the live definition (Nov 9, hr portal role), plus the 'client' branch inside kind 'agent'.
create or replace function private.invite_service_accept(p_kind text, p_token text, p_user uuid, p jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path to 'pg_catalog', 'public', 'extensions' as $function$
declare
  th text := encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  v public.hr_invites; e public.hr_employees; i public.agent_invites; pr public.profiles;
  f text; l text; em text; cid uuid; n int;
begin
  perform private.assert_invite_service();
  p := coalesce(p, '{}'::jsonb);
  if p_user is null then raise exception 'This invite link is not valid or has expired.' using errcode = 'P0001'; end if;
  if p_kind = 'hr' then
    select * into v from public.hr_invites where token_hash = th for update;
    if found then select * into e from public.hr_employees where id = v.employee_id for update; end if;
    if v.id is null or v.accepted_at is not null or v.revoked_at is not null or v.expires_at < pg_catalog.now()
       or e.id is null or e.archived_at is not null or e.profile_id is not null then
      raise exception 'This invite link is not valid or has expired.' using errcode = 'P0001'; end if;
    select * into pr from public.profiles where id = p_user;
    if found then
      if pr.role = 'Outside user' or pr.status <> 'active' or lower(pr.email) <> lower(e.email)
         or exists (select 1 from public.hr_employees z where z.profile_id = p_user) then
        raise exception 'This invite link is not valid or has expired.' using errcode = 'P0001'; end if;
    else
      if exists (select 1 from public.profiles where lower(email) = lower(e.email)) then
        raise exception 'This invite link is not valid or has expired.' using errcode = 'P0001'; end if;
      insert into public.profiles (id, email, first_name, last_name, phone, role) values (p_user, e.email, e.first_name, e.last_name,
        case when e.country = 'US' and length(regexp_replace(e.phone, '\D', '', 'g')) = 10 then private.fmt_phone(e.phone) else '' end,
        private.hr_portal_role_for(e.designation_id));
    end if;
    update public.hr_invites set accepted_at = pg_catalog.now(), accepted_profile = p_user, token_hash = null
     where id = v.id and accepted_at is null;
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'This invite link is not valid or has expired.' using errcode = 'P0001'; end if;
    update public.hr_employees set profile_id = p_user where id = e.id;
    return e.id;
  elsif p_kind = 'agent' then
    select * into i from public.agent_invites where token_hash = th for update;
    if not found or public.agent_invite_status(i) <> 'pending' then
      raise exception 'This invite link is not valid or has expired.' using errcode = 'P0001'; end if;
    f := btrim(coalesce(p ->> 'firstName', '')); l := btrim(coalesce(p ->> 'lastName', '')); em := lower(i.email);
    if f = '' or l = '' or coalesce(p ->> 'cellPhone', '') = '' then
      raise exception 'First name, last name and cell phone are required.' using errcode = '22023'; end if;
    if p ? 'email' and lower(btrim(p ->> 'email')) <> em then
      raise exception 'Use the invited email.' using errcode = '22023'; end if;
    if length(regexp_replace(coalesce(p ->> 'cellPhone', ''), '\D', '', 'g')) <> 10
       and not (length(regexp_replace(coalesce(p ->> 'cellPhone', ''), '\D', '', 'g')) = 11
                and left(regexp_replace(p ->> 'cellPhone', '\D', '', 'g'), 1) = '1') then
      raise exception 'Cell phone must be a 10-digit phone number.' using errcode = '22023'; end if;
    if exists (select 1 from public.profiles where id = p_user or (lower(email) = em and status = 'active')) then
      raise exception 'This invite link is not valid or has expired.' using errcode = 'P0001'; end if;
    insert into public.profiles (id, email, first_name, last_name, phone, role)
    values (p_user, em, f, l, private.fmt_phone(p ->> 'cellPhone'), 'Outside user');
    cid := coalesce(i.contact_id, (select c.id from public.contacts c where c.profile_id is null and lower(c.email) = em limit 1));
    if i.invite_kind = 'client' then
      -- buyer / seller: link the contact already on the file; no agent profile, no brokerage
      if cid is null then
        insert into public.contacts (profile_id, first_name, last_name, email, phone, contact_type)
        values (p_user, f, l, em, private.fmt_phone(p ->> 'cellPhone'), 'buyer_seller') returning id into cid;
      else
        update public.contacts set profile_id = p_user, first_name = f, last_name = l, email = em, phone = private.fmt_phone(p ->> 'cellPhone') where id = cid;
      end if;
      if i.deal_id is not null then perform private.log_activity(i.deal_id, 'client.joined', 'agent_invite', i.id, f || ' ' || l || ' set up their portal login'); end if;
    else
      if cid is null then
        insert into public.contacts (profile_id, first_name, last_name, email, phone, company)
        values (p_user, f, l, em, private.fmt_phone(p ->> 'cellPhone'), coalesce(p ->> 'brokerage', '')) returning id into cid;
      else
        update public.contacts set profile_id = p_user, first_name = f, last_name = l, email = em, phone = private.fmt_phone(p ->> 'cellPhone') where id = cid;
      end if;
      perform private.agent_profile_write(p_user, p || jsonb_build_object('email', em));
    end if;
    update public.agent_invites set status = 'accepted', accepted_at = pg_catalog.now(), accepted_profile = p_user, token_hash = null
     where id = i.id and status = 'pending' and token_hash = th;
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'This invite link is not valid or has expired.' using errcode = 'P0001'; end if;
    return p_user;
  end if;
  raise exception 'This invite link is not valid or has expired.' using errcode = 'P0001';
exception when unique_violation then
  raise exception 'This invite link is not valid or has expired.' using errcode = 'P0001';
end $function$;

-- same grants as rpc_create_agent_invite / rpc_agent_invite_lookup (the public wrappers run as the caller)
revoke all on function private.rpc_create_portal_invite(uuid, uuid, text) from public, anon;
grant execute on function private.rpc_create_portal_invite(uuid, uuid, text) to authenticated;
revoke all on function private.rpc_portal_invite_lookup(text) from public;
grant execute on function private.rpc_portal_invite_lookup(text) to anon, authenticated;
revoke all on function private.invite_service_accept(text, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.create_portal_invite(uuid, uuid, text) from public, anon;
grant execute on function public.create_portal_invite(uuid, uuid, text) to authenticated;
revoke all on function public.portal_invite_lookup(text) from public;
grant execute on function public.portal_invite_lookup(text) to anon, authenticated;
