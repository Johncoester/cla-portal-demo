-- Francis V-9 (Nov 9): an HR-created Processor / TC can still land as profiles.role = 'Employee' (HR-only, no files).
-- Causes: (1) invites accepted BEFORE 20261109170000 always created Employee and that migration never backfilled;
-- (2) accepting while linking an EXISTING Employee login keeps Employee forever.
-- This migration:
--   1. One-shot backfill: Employee + linked HR designation that maps to Processor / Preprocessor / Sales Person / TC
--      becomes that portal role. Admin / Super admin / Outside user / already-correct roles are never touched.
--   2. Both accept paths upgrade a linked Employee the same way when the designation maps to a staff portal role.
-- No RLS change. Never sets is_admin. Never maps Administrator/CEO/Manager to Admin.
-- Rollback: supabase/rollbacks/20261110021000_hr_portal_role_backfill.sql
begin;
set local lock_timeout = '3s';
do $$
begin
  if to_regprocedure('private.hr_portal_role_for(uuid)') is null then
    raise exception 'drift: private.hr_portal_role_for(uuid) missing — apply 20261109170000 first';
  end if;
  if (select md5(prosrc) from pg_proc where oid = to_regprocedure('private.invite_service_accept(text,text,uuid,jsonb)'))
       is distinct from '34186fdfe90c71369b8feebdde6fdb1a' then
    raise exception 'drift: private.invite_service_accept changed or missing';
  end if;
  if (select md5(prosrc) from pg_proc where oid = to_regprocedure('private.rpc_hr_accept_invite(text)'))
       is distinct from 'ec593ca11b9a77e302ff6529e195af1b' then
    raise exception 'drift: private.rpc_hr_accept_invite changed or missing';
  end if;
end $$;

-- 1. backfill stuck Employee logins whose designation already maps to a portal staff role
update public.profiles p
   set role = private.hr_portal_role_for(e.designation_id)
  from public.hr_employees e
 where e.profile_id = p.id
   and p.status = 'active'
   and p.role = 'Employee'
   and private.hr_portal_role_for(e.designation_id) in ('Processor', 'Preprocessor', 'Sales Person', 'Transaction Coordinator');

-- 2. accept paths: when linking an existing Employee, upgrade from the designation (new profiles already use the map)
CREATE OR REPLACE FUNCTION private.invite_service_accept(p_kind text, p_token text, p_user uuid, p jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  th text := encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  v public.hr_invites; e public.hr_employees; i public.agent_invites; pr public.profiles;
  f text; l text; em text; cid uuid; n int; mapped text;
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
      -- Nov 9 V-9: an HR-only Employee login that is being linked upgrades to the designation's portal role
      mapped := private.hr_portal_role_for(e.designation_id);
      if pr.role = 'Employee' and mapped in ('Processor', 'Preprocessor', 'Sales Person', 'Transaction Coordinator') then
        update public.profiles set role = mapped where id = p_user and role = 'Employee';
      end if;
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

CREATE OR REPLACE FUNCTION private.rpc_hr_accept_invite(p_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare v public.hr_invites; e public.hr_employees; me uuid := private.effective_uid(); pr public.profiles; mapped text;
begin
  if me is null then raise exception 'Create your sign-in first.' using errcode = '42501'; end if;
  select * into v from public.hr_invites where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex') for update;
  if found then select * into e from public.hr_employees where id = v.employee_id for update; end if;
  if v.id is null or v.accepted_at is not null or v.revoked_at is not null or v.expires_at < now() or e.archived_at is not null then
    raise exception 'This invite link is not valid or has expired. Ask HR for a new one.' using errcode = 'P0001'; end if;
  if e.profile_id is not null then raise exception 'This employee already has a portal login.' using errcode = 'P0001'; end if;
  select * into pr from public.profiles where id = me;
  if found then
    if pr.role = 'Outside user' or pr.status <> 'active' then raise exception 'This sign-in belongs to an agent or client login. Ask HR to use your work email.' using errcode = 'P0001'; end if;
    if lower(pr.email) <> lower(e.email) then raise exception 'This sign-in has a different email than the invite.' using errcode = 'P0001'; end if;
    if exists (select 1 from public.hr_employees z where z.profile_id = me) then raise exception 'This login is already linked to an employee.' using errcode = 'P0001'; end if;
    mapped := private.hr_portal_role_for(e.designation_id);
    if pr.role = 'Employee' and mapped in ('Processor', 'Preprocessor', 'Sales Person', 'Transaction Coordinator') then
      update public.profiles set role = mapped where id = me and role = 'Employee';
    end if;
  else
    if exists (select 1 from public.profiles where lower(email) = lower(e.email)) then raise exception 'Someone with that email already has a portal login.' using errcode = 'P0001'; end if;
    insert into public.profiles (id, email, first_name, last_name, phone, role) values (me, e.email, e.first_name, e.last_name,
      case when e.country = 'US' and length(regexp_replace(e.phone, '\D', '', 'g')) = 10 then private.fmt_phone(e.phone) else '' end,
      private.hr_portal_role_for(e.designation_id));
  end if;
  update public.hr_invites set accepted_at = now(), accepted_profile = me, token_hash = null where id = v.id;
  update public.hr_employees set profile_id = me where id = e.id;
  return e.id;
end $function$;

do $$
begin
  if private.hr_portal_role_for(null) <> 'Employee' then raise exception 'self-check: null designation must map to Employee'; end if;
  if exists (select 1 from public.hr_designations g where private.hr_portal_role_for(g.id) in ('Admin', 'Super admin')) then
    raise exception 'self-check: a designation maps to an Admin role';
  end if;
  if position('mapped := private.hr_portal_role_for' in (select prosrc from pg_proc where oid = to_regprocedure('private.invite_service_accept(text,text,uuid,jsonb)'))) = 0 then
    raise exception 'readback: invite_service_accept missing Employee upgrade';
  end if;
  if position('mapped := private.hr_portal_role_for' in (select prosrc from pg_proc where oid = to_regprocedure('private.rpc_hr_accept_invite(text)'))) = 0 then
    raise exception 'readback: rpc_hr_accept_invite missing Employee upgrade';
  end if;
end $$;
commit;
