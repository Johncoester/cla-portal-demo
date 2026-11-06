-- Invite acceptance for CLA Portal Live Test while public sign-up stays off.
-- Additive. Does not create or alter anything in schema auth.
-- The edge function (service role) creates the auth user, then calls the functions below.
-- The public functions are invokers so a later API reharden does not move them.
-- The bodies live in private and accept only a service_role JWT (or the operator, with no JWT).
-- Bad tokens return the same generic failure. Nothing is emailed.

create table if not exists private.invite_accept_attempts (
  bucket text primary key,
  attempts integer not null default 0,
  window_start timestamptz not null default pg_catalog.now()
);
revoke all on table private.invite_accept_attempts from public, anon, authenticated;

-- Confirms the caller is the service role (or the database operator with no user JWT),
-- then clears any user id on the request so profile triggers treat the write as the owner.
create or replace function private.assert_invite_service() returns void
language plpgsql security definer set search_path = pg_catalog as $$
declare jwt_role text := coalesce(auth.jwt() ->> 'role', '');
begin
  if jwt_role is distinct from 'service_role' and not (jwt_role = '' and session_user in ('postgres', 'supabase_admin')) then
    raise exception 'This invite link is not valid or has expired.' using errcode = '42501';
  end if;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
end $$;

-- 12 attempts per 15 minutes for one key (a hash of the client address, or of the token).
-- Over the limit returns false. The key is stored; the email and the raw token are not.
create or replace function private.invite_service_gate(p_key text) returns boolean
language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
declare n integer;
begin
  perform private.assert_invite_service();
  if p_key is null or length(p_key) < 16 or length(p_key) > 128 then return false; end if;
  insert into private.invite_accept_attempts (bucket, attempts, window_start)
  values (p_key, 1, pg_catalog.now())
  on conflict (bucket) do update set
    attempts = case when invite_accept_attempts.window_start < pg_catalog.now() - interval '15 minutes' then 1 else invite_accept_attempts.attempts + 1 end,
    window_start = case when invite_accept_attempts.window_start < pg_catalog.now() - interval '15 minutes' then pg_catalog.now() else invite_accept_attempts.window_start end
  returning attempts into n;
  return n <= 12;
end $$;

-- The invited email when the token is pending, unexpired and not revoked. Otherwise null.
-- Null covers a bad token, an expired token, a revoked token and an already-used token.
create or replace function private.invite_service_email(p_kind text, p_token text) returns text
language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
declare th text := encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex'); em text;
begin
  perform private.assert_invite_service();
  if p_kind = 'hr' then
    select v.email into em from public.hr_invites v
      join public.hr_employees e on e.id = v.employee_id
     where v.token_hash = th and v.accepted_at is null and v.revoked_at is null and v.expires_at >= pg_catalog.now()
       and e.archived_at is null and e.profile_id is null;
  elsif p_kind = 'agent' then
    select i.email into em from public.agent_invites i
     where i.token_hash = th and public.agent_invite_status(i) = 'pending';
  end if;
  return em;
end $$;

-- Links the profile the same way hr_accept_invite / accept_agent_invite do, for a user id
-- the edge function already created. Locks the invite row. A second call finds it used and fails.
create or replace function private.invite_service_accept(p_kind text, p_token text, p_user uuid, p jsonb default '{}'::jsonb) returns uuid
language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
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
end $$;

create or replace function public.service_invite_gate(p_key text) returns boolean
language plpgsql security invoker set search_path = pg_catalog as $$
begin return private.invite_service_gate(p_key); end $$;
create or replace function public.service_invite_email(p_kind text, p_token text) returns text
language plpgsql security invoker set search_path = pg_catalog as $$
begin return private.invite_service_email(p_kind, p_token); end $$;
create or replace function public.service_accept_invite(p_kind text, p_token text, p_user uuid, p jsonb default '{}'::jsonb) returns uuid
language plpgsql security invoker set search_path = pg_catalog as $$
begin return private.invite_service_accept(p_kind, p_token, p_user, p); end $$;

revoke all on function private.assert_invite_service() from public, anon, authenticated;
revoke all on function private.invite_service_gate(text) from public, anon, authenticated;
revoke all on function private.invite_service_email(text, text) from public, anon, authenticated;
revoke all on function private.invite_service_accept(text, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.service_invite_gate(text) from public, anon, authenticated;
revoke all on function public.service_invite_email(text, text) from public, anon, authenticated;
revoke all on function public.service_accept_invite(text, text, uuid, jsonb) from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.assert_invite_service() to service_role;
grant execute on function private.invite_service_gate(text) to service_role;
grant execute on function private.invite_service_email(text, text) to service_role;
grant execute on function private.invite_service_accept(text, text, uuid, jsonb) to service_role;
grant execute on function public.service_invite_gate(text) to service_role;
grant execute on function public.service_invite_email(text, text) to service_role;
grant execute on function public.service_accept_invite(text, text, uuid, jsonb) to service_role;

select private.lock_function_search_paths();
