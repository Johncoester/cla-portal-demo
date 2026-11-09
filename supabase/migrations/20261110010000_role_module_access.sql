-- ROLE ACCESS (John, Nov 9 2026: "allows super admins to allow who sees what").
-- A Super admin decides which roles get each staff area on Admin / Settings > Role access, instead of hard-coded role lists.
--   public.role_module_access      one row per eligible (role, module); CLA staff read it, only public.set_role_access() writes it
--   public.role_module_access_log  every change (who, when, old -> new); Admins read it; never changed or deleted
--   private.role_can(module)       one indexed lookup for the signed-in (or viewed-as) person; Admins / Super admins always true
--   private.crm_module_user()      crm_user() and role_can('crm'), for CRM entry checks
-- SEED = today's behaviour exactly (nothing changes until a Super admin saves). Admin / Super admin rows do not exist (always everything, no lockout);
-- Outside user / Employee rows can never exist (CHECK). private.crm_user() is NOT changed: the shared tables that read it (crm_picklist_options for
-- Place Order source of business, crm_user_signatures, crm_email_*) keep working for every role exactly as before.
-- Gated with role_can (only on the non-admin branch, so Admins pay nothing):
--   CRM: crm_need() and the CRM deals / deal filters / list export entry checks; crm_all / crm_read_all (Processor read-all); crm_editor (Sales edit)
--   CRM all deals: crm_deal_scope_all() (the hard-coded role list replaced by the 'crm_all_deals' row, which also needs the 'crm' row)
--   Accounting: acct_reader / acct_editor
--   HR: app only (the HR workspace menu); HR data keeps its own HR-role rules.
-- Guarded: every function changed here must still have the exact body captured from TEST on Nov 9 (md5), or nothing is applied.
-- Rollback: supabase/rollbacks/20261110010000_role_module_access.sql (restores every function body exactly, drops the new objects).

do $$
declare r record; want jsonb := jsonb_build_object(
  'private.crm_need', 'ab3fa9bbcf8ce29cefd733083b3a04eb', 'private.rpc_crm_deal_filters', '140b376d7bbbdb223764090645bc8e53',
  'private.rpc_crm_deals', '557eddad55a634d0d2f1d61c817f2337', 'private.rpc_crm_list_export', '2d60b9008eedf826c82e7271b7c5ca44',
  'public.crm_deal_filters', 'ddc6f858448455510e2ab0906719cce7', 'public.crm_deals', '4914d497c21f30d8a65eced8b9034d7a',
  'private.crm_all', '5062c4326d61ec3539df8e580f1c35b4', 'private.crm_read_all', '5062c4326d61ec3539df8e580f1c35b4',
  'private.crm_editor', '19d3508b097d1d1a600d41522bb6960c', 'private.crm_deal_scope_all', 'b58c738cd4ab6c030bcfef6927bd4300',
  'private.acct_reader', '5f5ed67de41251c5576147908b07abff', 'private.acct_editor', 'd7af7375e60e791c1a200e4d07c7ca47');
  k text; n int;
begin
  if to_regclass('public.role_module_access') is not null then raise exception 'role_module_access already exists'; end if;
  for k in select jsonb_object_keys(want) loop
    select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname || '.' || p.proname = k;
    if n <> 1 then raise exception 'expected one function %, found %', k, n; end if;
    select md5(p.prosrc) as h into r from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname || '.' || p.proname = k;
    if r.h <> want ->> k then raise exception 'function % changed since Nov 9 (md5 %), not applying', k, r.h; end if;
  end loop;
end $$;

create table public.role_module_access (
  role text not null,
  module text not null,
  allowed boolean not null,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz,
  primary key (role, module),
  constraint role_module_access_eligible check (
    (module in ('crm', 'crm_all_deals') and role in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team'))
    or (module in ('accounting', 'hr') and role in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator')))
);
comment on table public.role_module_access is 'Role access (Nov 9): which roles get each staff area. Admin / Super admin always have everything (no rows). Written only by public.set_role_access().';

create table public.role_module_access_log (
  id bigserial primary key,
  role text not null,
  module text not null,
  old_allowed boolean,
  new_allowed boolean not null,
  changed_by uuid references public.profiles(id),
  changed_by_name text not null default '',
  changed_at timestamptz not null default now()
);
create index role_module_access_log_at on public.role_module_access_log (changed_at desc);

-- the seed: exactly the hard-coded lists in use on Nov 9 (crm_user, crm_deal_scope_all, acct_reader / acct_editor, HR for every employee record)
insert into public.role_module_access (role, module, allowed) values
  ('Processor', 'crm', true), ('Preprocessor', 'crm', true), ('Sales Person', 'crm', true), ('Sales Team', 'crm', true),
  ('Processor', 'crm_all_deals', true), ('Preprocessor', 'crm_all_deals', true), ('Sales Person', 'crm_all_deals', false), ('Sales Team', 'crm_all_deals', true),
  ('Processor', 'accounting', true), ('Preprocessor', 'accounting', true), ('Sales Person', 'accounting', true), ('Sales Team', 'accounting', true), ('Transaction Coordinator', 'accounting', true),
  ('Processor', 'hr', true), ('Preprocessor', 'hr', true), ('Sales Person', 'hr', true), ('Sales Team', 'hr', true), ('Transaction Coordinator', 'hr', true);

alter table public.role_module_access enable row level security;
alter table public.role_module_access_log enable row level security;
create policy role_module_access_read on public.role_module_access for select to authenticated using ((select private.is_staffish()));
create policy role_module_access_log_read on public.role_module_access_log for select to authenticated using ((select private.is_admin()));
revoke all on public.role_module_access, public.role_module_access_log from anon, authenticated;
revoke all on sequence public.role_module_access_log_id_seq from anon, authenticated;
grant select on public.role_module_access, public.role_module_access_log to authenticated;

-- one lookup: the person's profile row + the (role, module) row (+ the 'crm' row for 'crm_all_deals'). Admins / Super admins: true. Unknown / inactive: false.
create function private.role_can(p_module text) returns boolean
language sql stable security definer set search_path to 'pg_catalog', 'public', 'extensions' as $$
  select coalesce((
    select p.is_admin or coalesce((select bool_and(r.allowed) and count(*) = case when p_module = 'crm_all_deals' then 2 else 1 end
                                     from public.role_module_access r
                                    where r.role = p.role and r.module in (p_module, case when p_module = 'crm_all_deals' then 'crm' end)), false)
      from public.profiles p where p.id = private.effective_uid() and p.status = 'active'), false) $$;

create function private.crm_module_user() returns boolean
language sql stable security definer set search_path to 'pg_catalog', 'public', 'extensions' as $$
  select private.crm_user() and private.role_can('crm') $$;

create function private.rpc_set_role_access(p_role text, p_module text, p_allowed boolean) returns jsonb
language plpgsql security definer set search_path to 'pg_catalog', 'public', 'extensions' as $$
declare v_old boolean; v_row public.role_module_access; v_name text;
begin
  if auth.uid() is null then raise exception 'Please sign in.' using errcode = '42501'; end if;
  if private.effective_uid() is distinct from auth.uid() then raise exception 'View as is read-only. Go back to your account to make changes.' using errcode = '42501'; end if;
  if not private.is_super_admin() then raise exception 'Only a Super admin can change Role access.' using errcode = '42501'; end if;
  if p_role in ('Admin', 'Super admin') then raise exception 'Admins and Super admins always have every module.' using errcode = '22023'; end if;
  if p_allowed is null then raise exception 'Allowed must be on or off.' using errcode = '22023'; end if;
  select allowed into v_old from public.role_module_access where role = p_role and module = p_module for update;
  if not found then raise exception 'That role cannot get that module.' using errcode = '22023'; end if;
  if v_old is distinct from p_allowed then
    update public.role_module_access set allowed = p_allowed, updated_by = auth.uid(), updated_at = now() where role = p_role and module = p_module;
    select btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into v_name from public.profiles where id = auth.uid();
    insert into public.role_module_access_log (role, module, old_allowed, new_allowed, changed_by, changed_by_name) values (p_role, p_module, v_old, p_allowed, auth.uid(), coalesce(v_name, ''));
  end if;
  select * into v_row from public.role_module_access where role = p_role and module = p_module;
  return jsonb_build_object('role', v_row.role, 'module', v_row.module, 'allowed', v_row.allowed, 'updated_by', v_row.updated_by, 'updated_at', v_row.updated_at);
end $$;

create function public.set_role_access(p_role text, p_module text, p_allowed boolean) returns jsonb
language plpgsql set search_path to 'pg_catalog', 'public', 'extensions' as $$ BEGIN RETURN private.rpc_set_role_access(p_role, p_module, p_allowed); END; $$;

revoke all on function private.role_can(text), private.crm_module_user(), private.rpc_set_role_access(text, text, boolean), public.set_role_access(text, text, boolean) from public, anon;
grant execute on function private.role_can(text), private.crm_module_user(), private.rpc_set_role_access(text, text, boolean), public.set_role_access(text, text, boolean) to authenticated;

-- role lists -> the role access rows. These run per row inside RLS (crm_leads, accounting_fees, CRM deals), so each is ONE profile lookup plus,
-- for a non-admin with the old role, ONE primary-key lookup in role_module_access. Before, each called is_admin() and me_role() (two profile lookups).
-- Same answer as before for every role while the rows are the seed (checked in test/sql/role-access-checks.sql).
create or replace function private.crm_all() returns boolean
language sql stable security definer set search_path to 'pg_catalog', 'public', 'extensions' as $function$
  select private.crm_user() and coalesce((select p.is_admin or (p.role in ('Processor', 'Preprocessor')
      and coalesce((select r.allowed from public.role_module_access r where r.role = p.role and r.module = 'crm'), false))
    from public.profiles p where p.id = private.effective_uid() and p.status = 'active'), false) $function$;
create or replace function private.crm_read_all() returns boolean
language sql stable security definer set search_path to 'pg_catalog', 'public', 'extensions' as $function$
  select private.crm_user() and coalesce((select p.is_admin or (p.role in ('Processor', 'Preprocessor')
      and coalesce((select r.allowed from public.role_module_access r where r.role = p.role and r.module = 'crm'), false))
    from public.profiles p where p.id = private.effective_uid() and p.status = 'active'), false) $function$;
create or replace function private.crm_editor() returns boolean
language sql stable security definer set search_path to 'pg_catalog', 'public', 'extensions' as $function$
  select private.crm_user() and coalesce((select p.is_admin or (p.role in ('Sales Person', 'Sales Team')
      and coalesce((select r.allowed from public.role_module_access r where r.role = p.role and r.module = 'crm'), false))
    from public.profiles p where p.id = private.effective_uid() and p.status = 'active'), false) $function$;
create or replace function private.crm_deal_scope_all() returns boolean
language sql stable security definer set search_path to 'pg_catalog', 'public', 'extensions' as $function$
  select private.crm_user() and coalesce((select p.is_admin or (p.role in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team')
      and coalesce((select bool_and(r.allowed) and count(*) = 2 from public.role_module_access r where r.role = p.role and r.module in ('crm', 'crm_all_deals')), false))
    from public.profiles p where p.id = private.effective_uid() and p.status = 'active'), false) $function$;
create or replace function private.acct_reader(d uuid) returns boolean
language sql stable security definer set search_path to 'pg_catalog', 'public', 'extensions' as $function$
  select private.acct_on() and coalesce((select p.is_admin or (p.role in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator')
      and coalesce((select r.allowed from public.role_module_access r where r.role = p.role and r.module = 'accounting'), false))
    from public.profiles p where p.id = private.effective_uid() and p.status = 'active'), false) and private.can_access_deal(d) $function$;
create or replace function private.acct_editor(d uuid) returns boolean
language sql stable security definer set search_path to 'pg_catalog', 'public', 'extensions' as $function$
  select private.acct_on() and coalesce((select p.is_admin or (p.role in ('Processor', 'Preprocessor')
      and coalesce((select r.allowed from public.role_module_access r where r.role = p.role and r.module = 'accounting'), false))
    from public.profiles p where p.id = private.effective_uid() and p.status = 'active'), false) and private.can_access_deal(d) $function$;

-- CRM entry checks: add one role_can('crm') line right after the existing crm_user() line (the rest of each body is untouched)
do $$
declare k text; def text; old_line text := $l$  if not private.crm_user() then raise exception 'The CRM is for CLA staff only.' using errcode = '42501'; end if;$l$;
  add_line text := $l$
  if not private.role_can('crm') then raise exception 'The CRM is turned off for your role. A Super admin can change this in Admin > Role access.' using errcode = '42501'; end if;$l$;
begin
  foreach k in array array['private.crm_need(boolean)', 'private.rpc_crm_deal_filters()', 'private.rpc_crm_deals(text, text, uuid, text)', 'private.rpc_crm_list_export(text, integer)',
                           'public.crm_deal_filters()', 'public.crm_deals(text, text, uuid, text)'] loop
    def := pg_get_functiondef(k::regprocedure);
    if (length(def) - length(replace(def, old_line, ''))) / length(old_line) <> 1 then raise exception 'entry check not found exactly once in %', k; end if;
    execute replace(def, old_line, old_line || add_line);
  end loop;
end $$;
