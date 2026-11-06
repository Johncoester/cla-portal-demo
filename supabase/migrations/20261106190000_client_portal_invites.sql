-- Buyer / seller portal invites. UNAPPLIED. Do not run this against a hosted project from the review.
-- Additive. Does not create or alter anything in schema auth. Public sign-up stays off.
-- Nothing is emailed. The raw token is returned once from the create / regenerate RPCs and is not stored.
-- Only its sha256 hash is kept. Accept, revoke, expiry and a new link all retire that hash.
-- The portal login stays Outside user. Buyer / Seller remains the role on the file.
-- An existing Outside user may link only the invited contact. A staff login is never downgraded.

create table if not exists private.invite_accept_attempts (
  bucket text primary key,
  attempts integer not null default 0,
  window_start timestamptz not null default pg_catalog.now()
);
revoke all on table private.invite_accept_attempts from public, anon, authenticated;

create table if not exists public.client_invites (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts (id),
  deal_id uuid not null references public.deals (id),
  role text not null check (role in ('Client-Buyer', 'Client-Seller')),
  email text not null,
  first_name text not null default '',
  last_name text not null default '',
  phone text not null default '',
  token_hash text,
  expires_at timestamptz not null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default pg_catalog.now(),
  accepted_at timestamptz,
  accepted_profile uuid references public.profiles (id),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id)
);
create unique index if not exists client_invites_token_hash_key on public.client_invites (token_hash) where token_hash is not null;
create unique index if not exists client_invites_one_open on public.client_invites (contact_id) where accepted_at is null and revoked_at is null;
create index if not exists client_invites_deal_idx on public.client_invites (deal_id);

revoke all on table public.client_invites from public, anon, authenticated;
grant select (id, contact_id, deal_id, role, email, first_name, last_name, phone, expires_at, created_by, created_at, accepted_at, accepted_profile, revoked_at, revoked_by)
  on public.client_invites to authenticated;

alter table public.client_invites enable row level security;

-- True only for an active processor or admin on this real file. Demo, view-as, sales, and clients are false.
create or replace function private.client_invite_actor(p_deal uuid) returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  pr public.profiles;
  d public.deals;
begin
  if me is null or me is distinct from private.effective_uid() or private.viewer_is_demo() then
    return false;
  end if;
  select * into pr from public.profiles where id = me;
  if not found or pr.status is distinct from 'active' or pr.is_demo is true or pr.role = 'Outside user' then
    return false;
  end if;
  if not (pr.is_admin or pr.role in ('Processor', 'Preprocessor')) then
    return false;
  end if;
  select * into d from public.deals where id = p_deal;
  if not found or d.is_demo is true then
    return false;
  end if;
  if pr.role = 'Preprocessor' and pr.is_admin is not true and d.preprocessor_user_id is distinct from me then
    return false;
  end if;
  return true;
end $$;

drop policy if exists client_invites_select on public.client_invites;
create policy client_invites_select on public.client_invites
  for select to authenticated
  using (private.client_invite_actor(deal_id));

create or replace function private.client_invite_guard(p_deal uuid) returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  pr public.profiles;
begin
  if me is null then
    raise exception 'Please sign in.' using errcode = '42501';
  end if;
  if me is distinct from private.effective_uid() or private.viewer_is_demo() then
    raise exception 'A demo or view-as session cannot invite a real person.' using errcode = '42501';
  end if;
  select * into pr from public.profiles where id = me;
  if not found or pr.status is distinct from 'active' or pr.is_demo is true then
    raise exception 'This account cannot invite a buyer or seller.' using errcode = '42501';
  end if;
  if not private.client_invite_actor(p_deal) then
    if pr.is_admin or pr.role in ('Processor', 'Preprocessor') then
      raise exception 'Order not found.' using errcode = '42501';
    end if;
    raise exception 'Only a processor or admin on this file can invite a buyer or seller.' using errcode = '42501';
  end if;
end $$;

create or replace function private.client_invite_create(p_deal uuid, p_contact uuid)
returns table (invite_id uuid, token text, expires_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  c public.contacts;
  v_role text;
  em text;
  tok text;
  th text;
  new_id uuid;
  exp timestamptz;
begin
  perform private.client_invite_guard(p_deal);
  select * into c from public.contacts where id = p_contact;
  if not found then
    raise exception 'Contact not found.' using errcode = 'P0001';
  end if;
  select p.role into v_role from public.deal_participants p
   where p.deal_id = p_deal and p.contact_id = p_contact and p.role in ('Client-Buyer', 'Client-Seller')
   limit 1;
  if v_role is null then
    raise exception 'This contact is not a buyer or seller on this file.' using errcode = 'P0001';
  end if;
  em := lower(btrim(coalesce(c.email, '')));
  if em = '' or position('@' in em) = 0 then
    raise exception 'Add an email on the contact before inviting them.' using errcode = 'P0001';
  end if;
  if c.profile_id is not null then
    raise exception 'This person already has a portal login.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.profiles p where lower(p.email) = em and p.status = 'active' and (p.role is distinct from 'Outside user' or p.is_admin is true)) then
    raise exception 'This email belongs to a staff login and cannot be invited as a buyer or seller.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.client_invites i where i.contact_id = p_contact and i.accepted_at is null and i.revoked_at is null) then
    raise exception 'An invite is already waiting. Create a new link to retire the old one, or revoke it.' using errcode = 'P0001';
  end if;
  tok := encode(extensions.gen_random_bytes(32), 'hex');
  th := encode(extensions.digest(tok, 'sha256'), 'hex');
  exp := pg_catalog.now() + interval '14 days';
  insert into public.client_invites (contact_id, deal_id, role, email, first_name, last_name, phone, token_hash, expires_at, created_by)
  values (p_contact, p_deal, v_role, em, coalesce(c.first_name, ''), coalesce(c.last_name, ''), coalesce(c.phone, ''), th, exp, auth.uid())
  returning id into new_id;
  perform private.log_activity(p_deal, 'client_invite.created', 'contact', p_contact,
    case when v_role = 'Client-Seller'
      then 'Seller invited to the portal. The link is shown once. Nothing is emailed.'
      else 'Buyer invited to the portal. The link is shown once. Nothing is emailed.' end);
  invite_id := new_id; token := tok; expires_at := exp;
  return next;
end $$;

create or replace function private.client_invite_revoke(p_invite uuid) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare ci public.client_invites; n int;
begin
  select * into ci from public.client_invites where id = p_invite;
  if not found then raise exception 'This invite link is not valid or has expired.' using errcode = 'P0001'; end if;
  perform private.client_invite_guard(ci.deal_id);
  update public.client_invites set revoked_at = pg_catalog.now(), revoked_by = auth.uid(), token_hash = null
   where id = ci.id and accepted_at is null and revoked_at is null and token_hash is not null;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'This invite link is not valid or has expired.' using errcode = 'P0001'; end if;
  perform private.log_activity(ci.deal_id, 'client_invite.revoked', 'contact', ci.contact_id, 'Portal invite revoked. Nothing is emailed.');
  return ci.id;
end $$;

create or replace function private.client_invite_regenerate(p_invite uuid)
returns table (invite_id uuid, token text, expires_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare ci public.client_invites; tok text; th text; exp timestamptz; n int;
begin
  select * into ci from public.client_invites where id = p_invite for update;
  if not found then raise exception 'This invite link is not valid or has expired.' using errcode = 'P0001'; end if;
  perform private.client_invite_guard(ci.deal_id);
  if ci.accepted_at is not null or ci.revoked_at is not null or ci.token_hash is null then
    raise exception 'This invite link is not valid or has expired.' using errcode = 'P0001';
  end if;
  tok := encode(extensions.gen_random_bytes(32), 'hex');
  th := encode(extensions.digest(tok, 'sha256'), 'hex');
  exp := pg_catalog.now() + interval '14 days';
  update public.client_invites set token_hash = th, expires_at = exp
   where id = ci.id and accepted_at is null and revoked_at is null and token_hash = ci.token_hash;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'This invite link is not valid or has expired.' using errcode = 'P0001'; end if;
  perform private.log_activity(ci.deal_id, 'client_invite.regenerated', 'contact', ci.contact_id, 'A new portal link replaced the old one. Nothing is emailed.');
  invite_id := ci.id; token := tok; expires_at := exp;
  return next;
end $$;

create or replace function private.client_invite_lookup(p_token text)
returns table (status text, first_name text, last_name text, email text, role text, expires_at timestamptz, has_account boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  th text := encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  ci public.client_invites;
  st text;
  n int;
begin
  if p_token is null or p_token !~ '^[0-9a-fA-F]{64}$' then
    status := 'invalid'; first_name := ''; last_name := ''; email := ''; role := ''; expires_at := null; has_account := false;
    return next; return;
  end if;
  insert into private.invite_accept_attempts (bucket, attempts, window_start)
  values ('lookup:' || left(th, 32), 1, pg_catalog.now())
  on conflict (bucket) do update set
    attempts = case when invite_accept_attempts.window_start < pg_catalog.now() - interval '15 minutes' then 1 else invite_accept_attempts.attempts + 1 end,
    window_start = case when invite_accept_attempts.window_start < pg_catalog.now() - interval '15 minutes' then pg_catalog.now() else invite_accept_attempts.window_start end
  returning attempts into n;
  if n > 30 then
    status := 'invalid'; first_name := ''; last_name := ''; email := ''; role := ''; expires_at := null; has_account := false;
    return next; return;
  end if;
  select * into ci from public.client_invites where token_hash = th;
  if not found then
    status := 'invalid'; first_name := ''; last_name := ''; email := ''; role := ''; expires_at := null; has_account := false;
    return next; return;
  end if;
  st := case
    when ci.accepted_at is not null then 'accepted'
    when ci.revoked_at is not null then 'revoked'
    when ci.expires_at < pg_catalog.now() then 'expired'
    else 'pending' end;
  status := st; first_name := ci.first_name; last_name := ci.last_name; email := ci.email; role := ci.role; expires_at := ci.expires_at;
  has_account := st = 'pending' and exists (
    select 1 from public.profiles p
     where lower(p.email) = ci.email and p.status = 'active' and p.role = 'Outside user' and p.is_admin is not true);
  return next;
end $$;

create or replace function public.create_client_invite(p_deal uuid, p_contact uuid)
returns table (invite_id uuid, token text, expires_at timestamptz)
language sql security definer set search_path = ''
as $$ select * from private.client_invite_create(p_deal, p_contact) $$;

create or replace function public.revoke_client_invite(p_invite uuid) returns uuid
language sql security definer set search_path = ''
as $$ select private.client_invite_revoke(p_invite) $$;

create or replace function public.regenerate_client_invite(p_invite uuid)
returns table (invite_id uuid, token text, expires_at timestamptz)
language sql security definer set search_path = ''
as $$ select * from private.client_invite_regenerate(p_invite) $$;

create or replace function public.client_invite_lookup(p_token text)
returns table (status text, first_name text, last_name text, email text, role text, expires_at timestamptz, has_account boolean)
language sql security definer set search_path = ''
as $$ select * from private.client_invite_lookup(p_token) $$;

-- The edge function looks up kind client through the same service RPCs. HR and agent behavior is unchanged.
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
  elsif p_kind = 'client' then
    select ci.email into em from public.client_invites ci
     where ci.token_hash = th and ci.accepted_at is null and ci.revoked_at is null and ci.expires_at >= pg_catalog.now();
  end if;
  return em;
end $$;

create or replace function private.invite_service_accept(p_kind text, p_token text, p_user uuid, p jsonb default '{}'::jsonb) returns uuid
language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
declare
  th text := encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  v public.hr_invites; e public.hr_employees; i public.agent_invites; pr public.profiles;
  ci public.client_invites;
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
  elsif p_kind = 'client' then
    select * into ci from public.client_invites where token_hash = th for update;
    if not found or ci.accepted_at is not null or ci.revoked_at is not null or ci.expires_at < pg_catalog.now() then
      raise exception 'This invite link is not valid or has expired.' using errcode = 'P0001'; end if;
    em := lower(btrim(ci.email));
    if p ? 'email' and lower(btrim(coalesce(p ->> 'email', ''))) <> em then
      raise exception 'Use the invited email.' using errcode = '22023'; end if;
    select * into pr from public.profiles where id = p_user;
    if found then
      if pr.role is distinct from 'Outside user' or pr.is_admin is true or pr.status is distinct from 'active' or lower(pr.email) <> em then
        raise exception 'This invite link is not valid or has expired.' using errcode = 'P0001'; end if;
    else
      if coalesce(p ->> 'existing', '') in ('true', 't') then
        raise exception 'This invite link is not valid or has expired.' using errcode = 'P0001'; end if;
      if exists (select 1 from public.profiles where lower(email) = em) then
        raise exception 'This invite link is not valid or has expired.' using errcode = 'P0001'; end if;
      insert into public.profiles (id, email, first_name, last_name, phone, role, is_admin, status, is_demo)
      values (p_user, em, ci.first_name, ci.last_name, '', 'Outside user', false, 'active', false);
    end if;
    update public.contacts c set profile_id = p_user
     where c.id = ci.contact_id and lower(c.email) = em and (c.profile_id is null or c.profile_id = p_user);
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'This invite link is not valid or has expired.' using errcode = 'P0001'; end if;
    update public.client_invites set accepted_at = pg_catalog.now(), accepted_profile = p_user, token_hash = null
     where id = ci.id and accepted_at is null and revoked_at is null and token_hash = th;
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'This invite link is not valid or has expired.' using errcode = 'P0001'; end if;
    perform private.log_activity(ci.deal_id, 'client_invite.accepted', 'contact', ci.contact_id, 'Portal login linked for this buyer or seller. Nothing was emailed.');
    return p_user;
  end if;
  raise exception 'This invite link is not valid or has expired.' using errcode = 'P0001';
exception when unique_violation then
  raise exception 'This invite link is not valid or has expired.' using errcode = 'P0001';
end $$;

revoke all on function private.client_invite_actor(uuid) from public, anon, authenticated;
grant execute on function private.client_invite_actor(uuid) to authenticated;
revoke all on function private.client_invite_guard(uuid) from public, anon, authenticated;
revoke all on function private.client_invite_create(uuid, uuid) from public, anon, authenticated;
revoke all on function private.client_invite_revoke(uuid) from public, anon, authenticated;
revoke all on function private.client_invite_regenerate(uuid) from public, anon, authenticated;
revoke all on function private.client_invite_lookup(text) from public, anon, authenticated;
revoke all on function public.create_client_invite(uuid, uuid) from public, anon, authenticated;
revoke all on function public.revoke_client_invite(uuid) from public, anon, authenticated;
revoke all on function public.regenerate_client_invite(uuid) from public, anon, authenticated;
revoke all on function public.client_invite_lookup(text) from public, anon, authenticated;
grant execute on function public.create_client_invite(uuid, uuid) to authenticated;
grant execute on function public.revoke_client_invite(uuid) to authenticated;
grant execute on function public.regenerate_client_invite(uuid) to authenticated;
grant execute on function public.client_invite_lookup(text) to anon, authenticated;

select private.lock_function_search_paths();
