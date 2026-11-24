-- STAFF-INVITE-1 (John Coester, chat Nov 23 2026 5:07 PM ET):
--   Any CLA Title employee who can open orders can click Invite to portal and send the invite
--   (Processor, Preprocessor, Sales Person, Sales Team, Transaction Coordinator, Admin, Super admin).
--   This adds Transaction Coordinator to private.can_invite_agents(). The other five staff roles
--   and Admin / Super admin were already allowed. HR-only Employee and outside users stay blocked.
--   Invites still go from testportal@clatitle.com; this file does not change the send path.
-- Replaces only private.can_invite_agents. No table, policy, or grant change; no lock-holding DDL.
-- Pre-flight: stops unless the live body is the current TEST body (or this change is already applied).
-- Rollback: supabase/rollbacks/20261129120000_staff_invite_cla_employees.sql

begin;
set local lock_timeout = '3s';

do $$
declare old_md5 text := '44c379d3ed83df27959587cac0da69ec';
  new_md5 text := 'afb2be409dc4d683382ed7f79541dcea';
  h text;
begin
  select md5(p.prosrc) into h
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'can_invite_agents';
  if h is null then raise exception 'drift: private.can_invite_agents is missing'; end if;
  if h = new_md5 then return; end if;
  if h <> old_md5 then raise exception 'drift: private.can_invite_agents is not the expected live body (md5 %, want %); already changed elsewhere', h, old_md5; end if;
end $$;

create or replace function private.can_invite_agents()
returns boolean
language sql
stable security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
  select coalesce(private.is_admin() or private.me_role() in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin'), false) $function$;

do $$
declare want text := 'afb2be409dc4d683382ed7f79541dcea';
  h text;
  conf text;
  grant_ok boolean;
begin
  select md5(p.prosrc), array_to_string(p.proconfig, ',') into h, conf
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'can_invite_agents';
  if h is distinct from want then raise exception 'readback: private.can_invite_agents body md5 % (want %)', h, want; end if;
  if conf is distinct from 'search_path=pg_catalog, public, extensions' then raise exception 'readback: search_path %', conf; end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'can_invite_agents' and p.prosecdef and p.provolatile = 's'
  ) then raise exception 'readback: expected STABLE SECURITY DEFINER'; end if;
  select
    has_function_privilege('authenticated', 'private.can_invite_agents()', 'execute')
    and not has_function_privilege('anon', 'private.can_invite_agents()', 'execute')
    and not has_function_privilege('public', 'private.can_invite_agents()', 'execute')
    into grant_ok;
  if not grant_ok then raise exception 'readback: grants changed (authenticated must keep execute; anon and public must not)'; end if;
end $$;

commit;
