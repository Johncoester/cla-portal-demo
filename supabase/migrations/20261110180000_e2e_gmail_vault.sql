-- One-time Gmail consent for the role-smoke test inbox (clatestportal@gmail.com).
-- NOT APPLIED. TEST project aqcervntopidtcazcmlv only. Does not change the staff Gmail
-- client, mail_accounts, or any gmail_refresh_* vault secret.
--
-- The staff OAuth client cannot be reused: it is an Internal @clatitle.com app, its
-- callback refuses every other domain, and it never asks for gmail.modify (trash).
-- This file stores a separate External client's id, secret, and the test inbox's
-- refresh token in Vault. The browser never reads them back.
--
-- Rollback: supabase/rollbacks/20261110180000_e2e_gmail_vault.sql
--   Deletes only the three e2e_gmail_* vault secrets and these functions. Never auth users.

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

do $$
begin
  if to_regclass('public.profiles') is null or to_regclass('vault.secrets') is null or to_regclass('vault.decrypted_secrets') is null then
    raise exception 'drift: profiles or vault is missing';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'vault' and p.proname in ('create_secret', 'update_secret')
    group by n.nspname having count(distinct p.proname) = 2
  ) then
    raise exception 'drift: vault.create_secret or vault.update_secret is missing';
  end if;
  if exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'profiles'
             and c.column_name in ('id', 'role', 'status', 'is_admin', 'is_demo')
             having count(*) < 5) then
    raise exception 'drift: profiles is missing a column this setup checks';
  end if;
  if to_regclass('private.e2e_gmail_setup') is not null
     or exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname in ('public', 'private') and p.proname like 'e2e\_gmail\_%') then
    raise exception 'drift: e2e gmail setup already exists';
  end if;
  if not exists (select 1 from pg_roles where rolname in ('anon', 'authenticated', 'service_role') group by 1 having count(*) = 3) then
    raise exception 'drift: anon, authenticated, or service_role is missing';
  end if;
end $$;

create schema if not exists private;

create table private.e2e_gmail_setup (
  id int primary key check (id = 1),
  status text not null default 'open' check (status in ('open', 'armed', 'exchanging', 'closed')),
  state_hash text check (state_hash is null or state_hash ~ '^[0-9a-f]{64}$'),
  code_verifier text check (code_verifier is null or char_length(code_verifier) between 43 and 128),
  armed_at timestamptz,
  closed_at timestamptz);
revoke all on private.e2e_gmail_setup from public, anon, authenticated;
insert into private.e2e_gmail_setup (id, status) values (1, 'open');

create function private.e2e_gmail_admin(p_actor uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_actor and p.status = 'active' and p.is_admin is true and p.is_demo is false
      and p.role in ('Admin', 'Super admin')) $$;

create function private.e2e_gmail_vault_put(p_name text, p_value text, p_description text) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_id uuid;
begin
  if p_name not in ('e2e_gmail_client_id', 'e2e_gmail_client_secret', 'e2e_gmail_refresh_token') then
    raise exception 'refusing: that vault name is not an e2e gmail secret';
  end if;
  if coalesce(p_value, '') = '' then raise exception 'refusing: empty secret'; end if;
  select s.id into v_id from vault.secrets s where s.name = p_name;
  if v_id is null then perform vault.create_secret(p_value, p_name, p_description);
  else perform vault.update_secret(v_id, p_value, p_name, p_description); end if;
end $$;

create function private.e2e_gmail_vault_get(p_name text) returns text
language sql stable security definer set search_path = pg_catalog, public as $$
  select d.decrypted_secret from vault.decrypted_secrets d
   where d.name = p_name and p_name in ('e2e_gmail_client_id', 'e2e_gmail_client_secret', 'e2e_gmail_refresh_token') $$;

create function public.e2e_gmail_svc_status(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare v_status text;
begin
  if not private.e2e_gmail_admin(p_actor) then raise exception 'Only an Admin or Super admin can open this setup.' using errcode = '42501'; end if;
  select s.status into v_status from private.e2e_gmail_setup s where s.id = 1;
  return jsonb_build_object(
    'clientSaved', private.e2e_gmail_vault_get('e2e_gmail_client_id') is not null and private.e2e_gmail_vault_get('e2e_gmail_client_secret') is not null,
    'connected', private.e2e_gmail_vault_get('e2e_gmail_refresh_token') is not null,
    'closed', v_status = 'closed',
    'status', v_status);
end $$;

create function public.e2e_gmail_svc_save_client(p_actor uuid, p_client_id text, p_client_secret text) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_status text; v_id text := btrim(coalesce(p_client_id, '')); v_secret text := btrim(coalesce(p_client_secret, ''));
begin
  if not private.e2e_gmail_admin(p_actor) then raise exception 'Only an Admin or Super admin can open this setup.' using errcode = '42501'; end if;
  if v_id !~ '^[0-9A-Za-z-]{10,}\.apps\.googleusercontent\.com$' or char_length(v_secret) < 16 or char_length(v_secret) > 256 or v_secret ~ '\s' then
    raise exception 'That client id or client value does not look like a Google web client.';
  end if;
  select s.status into v_status from private.e2e_gmail_setup s where s.id = 1 for update;
  if v_status = 'closed' then raise exception 'This setup is already finished.'; end if;
  if v_status = 'exchanging' then raise exception 'A consent is in progress.'; end if;
  perform private.e2e_gmail_vault_put('e2e_gmail_client_id', v_id, 'E2E test inbox OAuth client id');
  perform private.e2e_gmail_vault_put('e2e_gmail_client_secret', v_secret, 'E2E test inbox OAuth client secret');
  update private.e2e_gmail_setup set status = 'open', state_hash = null, code_verifier = null, armed_at = null where id = 1;
end $$;

create function public.e2e_gmail_svc_reopen(p_actor uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_status text;
begin
  if not private.e2e_gmail_admin(p_actor) then raise exception 'Only an Admin or Super admin can open this setup.' using errcode = '42501'; end if;
  select s.status into v_status from private.e2e_gmail_setup s where s.id = 1 for update;
  if v_status is distinct from 'closed' then raise exception 'Consent is already allowed.'; end if;
  update private.e2e_gmail_setup set status = 'open', state_hash = null, code_verifier = null, armed_at = null, closed_at = null where id = 1;
end $$;

create function public.e2e_gmail_svc_begin(p_actor uuid, p_state_hash text, p_verifier text) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_status text;
begin
  if not private.e2e_gmail_admin(p_actor) then raise exception 'Only an Admin or Super admin can open this setup.' using errcode = '42501'; end if;
  if p_state_hash !~ '^[0-9a-f]{64}$' or char_length(coalesce(p_verifier, '')) not between 43 and 128 then
    raise exception 'The consent link could not be started.';
  end if;
  if private.e2e_gmail_vault_get('e2e_gmail_client_id') is null or private.e2e_gmail_vault_get('e2e_gmail_client_secret') is null then
    raise exception 'Save the Google client first.';
  end if;
  select s.status into v_status from private.e2e_gmail_setup s where s.id = 1 for update;
  if v_status = 'closed' then raise exception 'This setup is already finished.'; end if;
  if v_status = 'exchanging' then raise exception 'A consent is in progress.'; end if;
  update private.e2e_gmail_setup set status = 'armed', state_hash = p_state_hash, code_verifier = p_verifier, armed_at = now() where id = 1;
end $$;

create function public.e2e_gmail_svc_peek(p_state_hash text) returns table (client_id text, code_verifier text)
language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  if p_state_hash !~ '^[0-9a-f]{64}$' then return; end if;
  return query
  select private.e2e_gmail_vault_get('e2e_gmail_client_id'), s.code_verifier
    from private.e2e_gmail_setup s
   where s.id = 1 and s.status = 'armed' and s.state_hash = p_state_hash and s.armed_at > now() - interval '15 minutes';
end $$;

create function public.e2e_gmail_svc_take(p_state_hash text) returns table (client_id text, client_secret text, code_verifier text)
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_verifier text;
begin
  if p_state_hash !~ '^[0-9a-f]{64}$' then return; end if;
  select s.code_verifier into v_verifier
    from private.e2e_gmail_setup s
   where s.id = 1 and s.status = 'armed' and s.state_hash = p_state_hash and s.armed_at > now() - interval '15 minutes'
   for update;
  if v_verifier is null then return; end if;
  update private.e2e_gmail_setup set status = 'exchanging', state_hash = null, code_verifier = null, armed_at = null where id = 1;
  return query select private.e2e_gmail_vault_get('e2e_gmail_client_id'), private.e2e_gmail_vault_get('e2e_gmail_client_secret'), v_verifier;
end $$;

create function public.e2e_gmail_svc_abort() returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  update private.e2e_gmail_setup set status = 'open', state_hash = null, code_verifier = null, armed_at = null
   where id = 1 and status = 'exchanging';
end $$;

create function public.e2e_gmail_svc_finish(p_refresh text, p_email text, p_scopes text) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_status text; need text;
begin
  if lower(btrim(coalesce(p_email, ''))) is distinct from 'clatestportal@gmail.com' then
    raise exception 'That Google account is not the test inbox.';
  end if;
  if char_length(coalesce(p_refresh, '')) < 20 or char_length(p_refresh) > 512 then
    raise exception 'Google did not return a long-lived token.';
  end if;
  foreach need in array array[
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.modify'
  ] loop
    if need <> all (regexp_split_to_array(coalesce(p_scopes, ''), '\s+')) then
      raise exception 'Google did not grant read, send, and trash.';
    end if;
  end loop;
  select s.status into v_status from private.e2e_gmail_setup s where s.id = 1 for update;
  if v_status is distinct from 'exchanging' then raise exception 'This setup link is already used.'; end if;
  perform private.e2e_gmail_vault_put('e2e_gmail_refresh_token', p_refresh, 'E2E test inbox refresh token');
  update private.e2e_gmail_setup set status = 'closed', state_hash = null, code_verifier = null, armed_at = null, closed_at = now() where id = 1;
end $$;

create function public.e2e_gmail_credentials() returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare v_id text := private.e2e_gmail_vault_get('e2e_gmail_client_id');
        v_secret text := private.e2e_gmail_vault_get('e2e_gmail_client_secret');
        v_refresh text := private.e2e_gmail_vault_get('e2e_gmail_refresh_token');
begin
  if v_id is null or v_secret is null or v_refresh is null then
    raise exception 'The test inbox is not connected yet.';
  end if;
  return jsonb_build_object('client_id', v_id, 'client_secret', v_secret, 'refresh_token', v_refresh);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'e2e_gmail_admin(uuid)', 'e2e_gmail_vault_put(text,text,text)', 'e2e_gmail_vault_get(text)'
  ] loop
    execute format('revoke all on function private.%s from public, anon, authenticated, service_role', f);
  end loop;
  foreach f in array array[
    'e2e_gmail_svc_status(uuid)', 'e2e_gmail_svc_save_client(uuid,text,text)', 'e2e_gmail_svc_reopen(uuid)',
    'e2e_gmail_svc_begin(uuid,text,text)', 'e2e_gmail_svc_peek(text)', 'e2e_gmail_svc_take(text)',
    'e2e_gmail_svc_abort()', 'e2e_gmail_svc_finish(text,text,text)', 'e2e_gmail_credentials()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  if has_function_privilege('anon', 'public.e2e_gmail_credentials()', 'execute')
     or has_function_privilege('authenticated', 'public.e2e_gmail_credentials()', 'execute')
     or has_function_privilege('anon', 'public.e2e_gmail_svc_take(text)', 'execute')
     or has_function_privilege('authenticated', 'public.e2e_gmail_svc_save_client(uuid,text,text)', 'execute') then
    raise exception 'drift: a public role can read or write the e2e gmail secrets';
  end if;
  if not has_function_privilege('service_role', 'public.e2e_gmail_credentials()', 'execute') then
    raise exception 'drift: service_role cannot read the e2e gmail credentials';
  end if;
end $$;

commit;
