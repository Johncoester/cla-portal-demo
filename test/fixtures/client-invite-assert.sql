-- Local checks for the unapplied buyer/seller invite migration. Tokens stay in private.test_tokens.
\set ON_ERROR_STOP on

create or replace function public.service_invite_email(p_kind text, p_token text) returns text
language plpgsql security invoker set search_path = pg_catalog as $$
begin return private.invite_service_email(p_kind, p_token); end $$;
create or replace function public.service_accept_invite(p_kind text, p_token text, p_user uuid, p jsonb default '{}'::jsonb) returns uuid
language plpgsql security invoker set search_path = pg_catalog as $$
begin return private.invite_service_accept(p_kind, p_token, p_user, p); end $$;
grant execute on function public.service_invite_email(text, text) to service_role;
grant execute on function public.service_accept_invite(text, text, uuid, jsonb) to service_role;

create or replace function private.as_user(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', false);
  perform set_config('cla.effective_uid', '', false);
  perform set_config('cla.viewer_is_demo', '', false);
end $$;
create or replace function private.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claim.role', 'service_role', false);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', false);
  perform set_config('cla.effective_uid', '', false);
  perform set_config('cla.viewer_is_demo', '', false);
end $$;

create or replace function private.keep_token(p_id int, p_deal uuid, p_contact uuid, p_actor uuid default '11111111-1111-4111-8111-111111111111') returns void language plpgsql as $$
declare r record; th text;
begin
  perform private.as_user(p_actor);
  select * into r from public.create_client_invite(p_deal, p_contact);
  if r.token is null or r.token !~ '^[0-9a-f]{64}$' then raise exception 'token shape'; end if;
  select token_hash into th from public.client_invites where id = r.invite_id;
  if th is null or th = r.token or th <> encode(extensions.digest(r.token, 'sha256'), 'hex') then raise exception 'token was not hashed'; end if;
  if exists (select 1 from public.activity a where a.detail like '%' || r.token || '%' or a.detail like '%' || th || '%') then
    raise exception 'activity stored the token'; end if;
  insert into private.test_tokens (id, token) values (p_id, r.token)
  on conflict (id) do update set token = excluded.token;
end $$;

create or replace function private.accept_token(p_id int, p_user uuid, p jsonb default '{}'::jsonb) returns void language plpgsql as $$
declare tok text;
begin
  select token into tok from private.test_tokens where id = p_id;
  perform private.as_service();
  perform public.service_accept_invite('client', tok, p_user, coalesce(p, '{}'::jsonb));
end $$;

create or replace function private.expect_accept_fail(p_id int, p_user uuid, p jsonb, p_like text) returns void language plpgsql as $$
begin
  perform private.accept_token(p_id, p_user, p);
  raise exception 'accept should have failed';
exception when others then
  if sqlerrm = 'accept should have failed' then raise; end if;
  if sqlerrm not like p_like then raise exception 'unexpected failure'; end if;
end $$;

create or replace function private.expect_create_fail(p_user uuid, p_deal uuid, p_contact uuid, p_like text) returns void language plpgsql as $$
begin
  perform private.as_user(p_user);
  perform public.create_client_invite(p_deal, p_contact);
  raise exception 'create should have failed';
exception when others then
  if sqlerrm = 'create should have failed' then raise; end if;
  if sqlerrm not like p_like then raise exception 'unexpected failure'; end if;
end $$;

create or replace function private.test_client_on_deal(p_deal uuid, p_role text default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.deal_participants dp
    join public.contacts c on c.id = dp.contact_id
    where dp.deal_id = p_deal and c.profile_id = auth.uid()
      and (p_role is null or dp.role = p_role)
  )
$$;
revoke all on function private.test_client_on_deal(uuid, text) from public, anon, authenticated;
grant execute on function private.test_client_on_deal(uuid, text) to authenticated;

alter table public.deals enable row level security;
alter table public.documents enable row level security;
drop policy if exists deals_test_own on public.deals;
drop policy if exists docs_test_own on public.documents;
create policy deals_test_own on public.deals for select to authenticated using (
  private.client_invite_actor(id) or private.test_client_on_deal(id, null)
);
create policy docs_test_own on public.documents for select to authenticated using (
  private.client_invite_actor(deal_id)
  or (
    private.test_client_on_deal(deal_id, null)
    and visibility <> 'staff'
    and (wire_instructions is not true or private.test_client_on_deal(deal_id, 'Client-Buyer'))
  )
);
grant select on public.deals, public.documents to authenticated;

create or replace procedure private.check_visibility() language plpgsql as $$
declare n int; wires int; staffn int; othern int;
begin
  perform set_config('request.jwt.claim.sub', '77777777-7777-4777-8777-777777777777', false);
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', false);
  set role authenticated;
  select count(*) into n from public.deals;
  select count(*) into othern from public.deals where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3';
  select count(*) into wires from public.documents where wire_instructions;
  select count(*) into staffn from public.documents where visibility = 'staff';
  reset role;
  if n <> 2 or othern <> 0 or wires <> 1 or staffn <> 0 then raise exception 'buyer visibility'; end if;
  perform set_config('request.jwt.claim.sub', '77777777-7777-4777-8777-777777777778', false);
  set role authenticated;
  select count(*) into n from public.deals;
  select count(*) into wires from public.documents where wire_instructions;
  select count(*) into staffn from public.documents where visibility = 'staff';
  select count(*) into othern from public.documents where name = 'Contract';
  reset role;
  if n <> 1 or wires <> 0 or staffn <> 0 or othern <> 1 then raise exception 'seller visibility'; end if;
end $$;

do $$
declare
  d1 uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
  d2 uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  d3 uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3';
  ddemo uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4';
  proc uuid := '11111111-1111-4111-8111-111111111111';
  pre uuid := '22222222-2222-4222-8222-222222222222';
  sales uuid := '33333333-3333-4333-8333-333333333333';
  exist_user uuid := '55555555-5555-4555-8555-555555555555';
  staff uuid := '66666666-6666-4666-8666-666666666666';
  buyer uuid := '77777777-7777-4777-8777-777777777777';
  seller uuid := '77777777-7777-4777-8777-777777777778';
  wrong uuid := '88888888-8888-4888-8888-888888888888';
  demo_user uuid := '99999999-9999-4999-8999-999999999999';
  off uuid := '12121212-1212-4212-8212-121212121299';
  regen_user uuid := '77777777-7777-4777-8777-77777777777a';
  c_buyer uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  c_seller uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
  c_staff uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4';
  c_exist uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5';
  c_regen uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6';
  c_revoke uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7';
  c_expire uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8';
  c_mismatch uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10';
  c_pre uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11';
  st text; has_acct boolean; tok text; inv uuid; r record;
begin
  if has_function_privilege('anon', 'public.create_client_invite(uuid,uuid)', 'EXECUTE') then raise exception 'anon can create'; end if;
  if not has_function_privilege('authenticated', 'public.create_client_invite(uuid,uuid)', 'EXECUTE') then raise exception 'staff cannot create'; end if;
  if not has_function_privilege('anon', 'public.client_invite_lookup(text)', 'EXECUTE') then raise exception 'lookup is closed'; end if;
  if has_column_privilege('authenticated', 'public.client_invites', 'token_hash', 'SELECT') then raise exception 'token hash is readable'; end if;
  if has_column_privilege('anon', 'public.client_invites', 'email', 'SELECT') then raise exception 'anon can read invites'; end if;

  perform private.keep_token(1, d1, c_buyer);
  select token into tok from private.test_tokens where id = 1;
  select l.status, l.has_account into st, has_acct from public.client_invite_lookup(tok) l;
  if st <> 'pending' or has_acct then raise exception 'lookup status'; end if;
  perform private.accept_token(1, buyer, jsonb_build_object('role', 'Super admin', 'is_admin', true, 'email', 'buyer@example.test'));
  if (select role from public.profiles where id = buyer) <> 'Outside user' then raise exception 'role changed'; end if;
  if (select is_admin from public.profiles where id = buyer) then raise exception 'admin granted'; end if;
  if (select is_demo from public.profiles where id = buyer) then raise exception 'demo granted'; end if;
  if (select profile_id from public.contacts where id = c_buyer) <> buyer then raise exception 'buyer not linked'; end if;
  if (select profile_id from public.contacts where id = c_seller) is not null then raise exception 'seller contact linked early'; end if;
  if (select count(*) from public.deal_participants where contact_id = c_buyer and role = 'Client-Buyer') <> 2 then raise exception 'file role changed'; end if;
  perform private.expect_accept_fail(1, buyer, '{}'::jsonb, '%not valid%');

  perform private.keep_token(2, d1, c_seller);
  perform private.accept_token(2, seller, '{}'::jsonb);
  if (select role from public.profiles where id = seller) <> 'Outside user' or (select is_admin from public.profiles where id = seller) then raise exception 'seller privilege'; end if;
  if (select profile_id from public.contacts where id = c_seller) <> seller then raise exception 'seller not linked'; end if;
  if (select profile_id from public.contacts where id = c_buyer) <> buyer then raise exception 'buyer link overwritten'; end if;
  call private.check_visibility();

  perform private.keep_token(3, d1, c_expire);
  update public.client_invites set expires_at = pg_catalog.now() - interval '1 minute' where contact_id = c_expire and accepted_at is null;
  perform private.expect_accept_fail(3, '77777777-7777-4777-8777-777777777771', '{}'::jsonb, '%not valid%');
  if exists (select 1 from public.profiles where email = 'expire@example.test') then raise exception 'expired created a login'; end if;

  perform private.keep_token(4, d1, c_revoke);
  perform private.as_user(proc);
  perform public.revoke_client_invite((select id from public.client_invites where contact_id = c_revoke and revoked_at is null limit 1));
  perform private.expect_accept_fail(4, '77777777-7777-4777-8777-777777777772', '{}'::jsonb, '%not valid%');
  if exists (select 1 from public.profiles where email = 'revoke@example.test') then raise exception 'revoked created a login'; end if;

  perform private.keep_token(5, d1, c_regen);
  select id into inv from public.client_invites where contact_id = c_regen and accepted_at is null;
  perform private.as_user(proc);
  select * into r from public.regenerate_client_invite(inv);
  if r.token = (select token from private.test_tokens where id = 5) then raise exception 'regenerate reused the token'; end if;
  insert into private.test_tokens (id, token) values (6, r.token);
  perform private.expect_accept_fail(5, regen_user, '{}'::jsonb, '%not valid%');
  perform private.accept_token(6, regen_user, '{}'::jsonb);
  if (select role from public.profiles where id = regen_user) <> 'Outside user' then raise exception 'regen role'; end if;

  perform private.keep_token(7, d2, c_mismatch);
  perform private.expect_accept_fail(7, '77777777-7777-4777-8777-777777777773', jsonb_build_object('email', 'other@example.test'), '%invited email%');
  if exists (select 1 from public.profiles where email = 'mismatch@example.test') then raise exception 'mismatch created a login'; end if;

  perform private.keep_token(8, d2, c_exist);
  perform private.expect_accept_fail(8, wrong, jsonb_build_object('existing', true), '%not valid%');
  if (select role from public.profiles where id = wrong) <> 'Outside user' or (select is_admin from public.profiles where id = wrong) then raise exception 'wrong user changed'; end if;
  if (select profile_id from public.contacts where id = c_exist) is not null then raise exception 'wrong user linked'; end if;
  perform private.accept_token(8, exist_user, jsonb_build_object('existing', true, 'role', 'Super admin', 'is_admin', true));
  if (select role from public.profiles where id = exist_user) <> 'Outside user' or (select is_admin from public.profiles where id = exist_user) then raise exception 'existing account changed'; end if;
  if (select count(*) from public.profiles where lower(email) = 'exist@example.test') <> 1 then raise exception 'duplicate exist login'; end if;
  if (select profile_id from public.contacts where id = c_exist) <> exist_user then raise exception 'existing contact not linked'; end if;

  perform private.expect_create_fail(proc, d1, c_staff, '%staff login%');
  tok := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.client_invites (contact_id, deal_id, role, email, first_name, last_name, token_hash, expires_at, created_by)
  values (c_staff, d1, 'Client-Buyer', 'staff@example.test', 'Stan', 'Staff', encode(extensions.digest(tok, 'sha256'), 'hex'), pg_catalog.now() + interval '1 day', proc);
  insert into private.test_tokens (id, token) values (9, tok);
  perform private.expect_accept_fail(9, staff, '{}'::jsonb, '%not valid%');
  if (select role from public.profiles where id = staff) <> 'Admin' or not (select is_admin from public.profiles where id = staff) then raise exception 'staff was downgraded'; end if;
  if (select profile_id from public.contacts where id = c_staff) is not null then raise exception 'staff contact linked'; end if;

  perform private.expect_create_fail(sales, d1, c_pre, '%processor or admin%');
  perform private.expect_create_fail(exist_user, d1, c_pre, '%processor or admin%');
  perform private.expect_create_fail(pre, d2, c_exist, '%Order not found%');
  perform private.keep_token(10, d1, c_pre, pre);
  perform private.expect_create_fail(demo_user, d1, c_pre, '%cannot invite%');
  perform private.expect_create_fail(off, d1, c_pre, '%cannot invite%');
  perform private.as_user(proc);
  perform set_config('cla.viewer_is_demo', '1', false);
  begin
    perform public.create_client_invite(d1, c_pre);
    raise exception 'demo should have failed';
  exception when others then
    if sqlerrm = 'demo should have failed' then raise; end if;
    if sqlerrm not like '%demo or view-as%' then raise exception 'unexpected failure'; end if;
  end;
  perform private.as_user(proc);
  perform set_config('cla.effective_uid', exist_user::text, false);
  begin
    perform public.create_client_invite(d1, c_pre);
    raise exception 'view-as should have failed';
  exception when others then
    if sqlerrm = 'view-as should have failed' then raise; end if;
    if sqlerrm not like '%demo or view-as%' then raise exception 'unexpected failure'; end if;
  end;
  perform private.expect_create_fail(proc, ddemo, c_buyer, '%Order not found%');

  perform private.keep_token(90, d1, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9');
end $$;

select 'ready-for-race';
