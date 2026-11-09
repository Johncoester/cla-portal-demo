-- Rollback of 20261109170000_hr_invite_portal_role.sql: restores the exact before-definitions of
-- private.invite_service_accept and private.rpc_hr_accept_invite (HR invites create role 'Employee' again; md5(prosrc)
-- 6a5908277c7699a08ed6aa80c85112d8 / b7069ecd96238da4524b482549a7647d), drops private.hr_portal_role_for, and archives the
-- 'Sales Person' HR designation when no active employee uses it (hr_designations has a no-delete trigger; archiving is HR's own "remove").
-- Profiles created while the migration was live keep their role; change them in Admin if needed.
begin;
set local lock_timeout = '3s';
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
        case when e.country = 'US' and length(regexp_replace(e.phone, '\D', '', 'g')) = 10 then private.fmt_phone(e.phone) else '' end, 'Employee');
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
      case when e.country = 'US' and length(regexp_replace(e.phone, '\D', '', 'g')) = 10 then private.fmt_phone(e.phone) else '' end, 'Employee');   -- profiles.phone is US-only
  end if;
  update public.hr_invites set accepted_at = now(), accepted_profile = me, token_hash = null where id = v.id;
  update public.hr_employees set profile_id = me where id = e.id;   -- the guard lets the new login link ONLY itself, after the invite above
  return e.id;
end $function$;

drop function if exists private.hr_portal_role_for(uuid);

-- archive only while no active employee uses it (HR's guard refuses otherwise; then move them first, or keep it)
update public.hr_designations g set archived_at = now() where lower(btrim(g.name)) = 'sales person' and g.archived_at is null
   and not exists (select 1 from public.hr_employees e where e.designation_id = g.id and e.archived_at is null);

do $$
begin
  if (select md5(prosrc) from pg_proc where oid = to_regprocedure('private.invite_service_accept(text,text,uuid,jsonb)')) is distinct from '6a5908277c7699a08ed6aa80c85112d8' then
    raise exception 'rollback check: private.invite_service_accept not restored'; end if;
  if (select md5(prosrc) from pg_proc where oid = to_regprocedure('private.rpc_hr_accept_invite(text)')) is distinct from 'b7069ecd96238da4524b482549a7647d' then
    raise exception 'rollback check: private.rpc_hr_accept_invite not restored'; end if;
end $$;
commit;
