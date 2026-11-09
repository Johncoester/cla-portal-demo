-- Francis (Nov 9, "Sales Person Portal- (HR Portal)") + John: a person added in HR as a Processor or Sales Person must get
-- that portal role when they accept their HR invite. Until now every HR invite created profiles.role = 'Employee'
-- (HR area only), so an HR-created Processor saw no files.
--   1. HR designation 'Sales Person' (Department 'Sales' already exists on TEST). Data only, no schema change.
--   2. private.hr_portal_role_for(designation) : a small explicit map, by designation name (case/space-insensitive):
--        Processor -> 'Processor', Sales Person -> 'Sales Person', Preprocessor -> 'Preprocessor',
--        Transaction Coordinator -> 'Transaction Coordinator', anything else (or none) -> 'Employee' (as before).
--      It NEVER returns Admin or Super admin (the designation 'Administrator' stays 'Employee'), and never sets is_admin.
--   3. The two accept paths (private.invite_service_accept 'hr' branch = the accept-invite edge function, and
--      private.rpc_hr_accept_invite) use it ONLY when they create a NEW profile. An existing login that is linked keeps
--      its role. Existing profiles are not touched by this migration.
-- No RLS policy or existing private.* helper is changed. Grants on the two functions are kept (CREATE OR REPLACE).
-- Rollback: supabase/rollbacks/20261109170000_hr_invite_portal_role.sql
begin;
set local lock_timeout = '3s';
do $$
begin
  if (select md5(prosrc) from pg_proc where oid = to_regprocedure('private.invite_service_accept(text,text,uuid,jsonb)')) is distinct from '6a5908277c7699a08ed6aa80c85112d8' then
    raise exception 'drift: private.invite_service_accept changed or missing'; end if;
  if (select md5(prosrc) from pg_proc where oid = to_regprocedure('private.rpc_hr_accept_invite(text)')) is distinct from 'b7069ecd96238da4524b482549a7647d' then
    raise exception 'drift: private.rpc_hr_accept_invite changed or missing'; end if;
  if to_regprocedure('private.hr_portal_role_for(uuid)') is not null then
    raise exception 'drift: private.hr_portal_role_for(uuid) already exists'; end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_role_check'
                 and pg_get_constraintdef(oid) like '%''Sales Person''%' and pg_get_constraintdef(oid) like '%''Transaction Coordinator''%'
                 and pg_get_constraintdef(oid) like '%''Preprocessor''%' and pg_get_constraintdef(oid) like '%''Employee''%') then
    raise exception 'drift: profiles_role_check no longer allows the mapped roles'; end if;
end $$;

insert into public.hr_designations (name)
select 'Sales Person' where not exists (select 1 from public.hr_designations where lower(btrim(name)) = 'sales person' and archived_at is null);

create function private.hr_portal_role_for(p_designation uuid) returns text
language sql stable security definer set search_path = pg_catalog, public, extensions as $$
  select coalesce((select case lower(regexp_replace(btrim(g.name), '\s+', ' ', 'g'))
      when 'processor' then 'Processor'
      when 'sales person' then 'Sales Person'
      when 'preprocessor' then 'Preprocessor'
      when 'transaction coordinator' then 'Transaction Coordinator'
    end from public.hr_designations g where g.id = p_designation), 'Employee') $$;
revoke all on function private.hr_portal_role_for(uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION private.invite_service_accept(p_kind text, p_token text, p_user uuid, p jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
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
        private.hr_portal_role_for(e.designation_id));   -- Nov 9: Processor / Sales Person / Preprocessor / TC from the designation, else 'Employee'
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
    if cid is null then
      insert into public.contacts (profile_id, first_name, last_name, email, phone, company)
      values (p_user, f, l, em, private.fmt_phone(p ->> 'cellPhone'), coalesce(p ->> 'brokerage', '')) returning id into cid;
    else
      update public.contacts set profile_id = p_user, first_name = f, last_name = l, email = em, phone = private.fmt_phone(p ->> 'cellPhone') where id = cid;
    end if;
    perform private.agent_profile_write(p_user, p || jsonb_build_object('email', em));
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
declare v public.hr_invites; e public.hr_employees; me uuid := private.effective_uid(); pr public.profiles;
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
  else
    if exists (select 1 from public.profiles where lower(email) = lower(e.email)) then raise exception 'Someone with that email already has a portal login.' using errcode = 'P0001'; end if;
    insert into public.profiles (id, email, first_name, last_name, phone, role) values (me, e.email, e.first_name, e.last_name,
      case when e.country = 'US' and length(regexp_replace(e.phone, '\D', '', 'g')) = 10 then private.fmt_phone(e.phone) else '' end,   -- profiles.phone is US-only
      private.hr_portal_role_for(e.designation_id));   -- Nov 9: role from the designation, else 'Employee'
  end if;
  update public.hr_invites set accepted_at = now(), accepted_profile = me, token_hash = null where id = v.id;
  update public.hr_employees set profile_id = me where id = e.id;   -- the guard lets the new login link ONLY itself, after the invite above
  return e.id;
end $function$;

do $$
begin
  if private.hr_portal_role_for(null) <> 'Employee' then raise exception 'self-check: null designation must map to Employee'; end if;
  if exists (select 1 from public.hr_designations g where private.hr_portal_role_for(g.id) in ('Admin', 'Super admin')) then
    raise exception 'self-check: a designation maps to an Admin role'; end if;
end $$;
commit;
