-- Exact rollback of 20261109234000_crm_module_roles.sql.
-- One transaction. lock_timeout 3s.
-- Puts the CRM page gates back on private.crm_user(), restores Processor and
-- Preprocessor on crm_deal_scope_all, and drops private.crm_module_user().
-- Does not edit private.crm_user() and does not change any RLS policy.
-- Refuses unless the switched functions still have the single module gate
-- this migration installed.

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public, extensions;

do $rb$
declare
  src text;
  r record;
  def text;
  hits int;
begin
  select p.prosrc into src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'crm_user' and pg_get_function_identity_arguments(p.oid) = '';
  if src is null or md5(src) is distinct from '75e25644876850b4644d5ece3606d864' then
    raise exception 'drift: private.crm_user() is not the captured definition; refusing to roll back';
  end if;
  if to_regprocedure('private.crm_module_user()') is null then
    raise exception 'drift: private.crm_module_user() is missing; refusing to roll back';
  end if;

  select p.prosrc into src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'crm_deal_scope_all' and pg_get_function_identity_arguments(p.oid) = '';
  if src is null or src like '%Preprocessor%' or src not like '%Sales Team%' or src not like '%private.crm_user()%' then
    raise exception 'drift: private.crm_deal_scope_all() is not the module-roles definition';
  end if;

  for r in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname, p.proname) in (
      ('private', 'crm_need'),
      ('private', 'rpc_crm_deals'),
      ('private', 'rpc_crm_deal_filters'),
      ('private', 'rpc_crm_list_export'),
      ('public', 'crm_deals'),
      ('public', 'crm_deal_filters')
    )
  loop
    def := pg_get_functiondef(r.oid);
    hits := (length(def) - length(replace(def, 'if not private.crm_module_user()', ''))) / length('if not private.crm_module_user()');
    if hits is distinct from 1 or def like '%if not private.crm_user()%' then
      raise exception 'drift: a CRM page function is not the module-roles gate';
    end if;
    execute replace(def, 'if not private.crm_module_user()', 'if not private.crm_user()');
  end loop;
end
$rb$;

create or replace function private.crm_deal_scope_all()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $fn$
  select private.crm_user() and (private.is_admin() or coalesce(private.me_role() in ('Processor', 'Preprocessor', 'Sales Team'), false))
$fn$;

drop function private.crm_module_user();

do $after$
declare
  callers text;
  expect_callers text := 'private.crm_account_visible,private.crm_all,private.crm_contact_visible,private.crm_dash_visible,private.crm_deal_scope_all,private.crm_deal_visible,private.crm_editor,private.crm_email_record_visible,private.crm_need,private.crm_opp_visible,private.crm_owner_ok,private.crm_read_all,private.crm_report_visible,private.crm_template_visible,private.crm_view_editable,private.crm_view_visible,private.rpc_crm_deal_filters,private.rpc_crm_deals,private.rpc_crm_list_export,public.crm_deal_filters,public.crm_deals';
  src text;
begin
  select p.prosrc into src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'crm_user' and pg_get_function_identity_arguments(p.oid) = '';
  if md5(src) is distinct from '75e25644876850b4644d5ece3606d864' then
    raise exception 'drift: private.crm_user() changed during rollback';
  end if;
  select string_agg(n.nspname || '.' || p.proname, ',' order by n.nspname, p.proname)
    into callers
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prosrc like '%private.crm_user()%';
  if callers is distinct from expect_callers then
    raise exception 'drift: crm_user() callers after rollback are %', callers;
  end if;
  if to_regprocedure('private.crm_module_user()') is not null then
    raise exception 'drift: private.crm_module_user() is still present';
  end if;
end
$after$;

commit;
