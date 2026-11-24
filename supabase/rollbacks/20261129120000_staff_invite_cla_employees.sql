-- Rollback for 20261129120000_staff_invite_cla_employees.sql (STAFF-INVITE-1).
-- Restores private.can_invite_agents to the TEST body from before this change
-- (CLA staff Transaction Coordinator cannot invite). Fingerprint-checked.

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
  if h = old_md5 then return; end if;
  if h <> new_md5 then raise exception 'drift: private.can_invite_agents is not the STAFF-INVITE-1 body (md5 %, want %)', h, new_md5; end if;
end $$;

create or replace function private.can_invite_agents()
returns boolean
language sql
stable security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
  select coalesce(private.is_admin() or private.me_role() in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Admin', 'Super admin'), false) $function$;

do $$
declare want text := '44c379d3ed83df27959587cac0da69ec';
  h text;
begin
  select md5(p.prosrc) into h
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'can_invite_agents';
  if h is distinct from want then raise exception 'rollback readback: private.can_invite_agents body md5 % (want %)', h, want; end if;
end $$;

commit;
