-- Processor and Preprocessor lose the CRM module. Admins, Sales Person, and Sales Team keep it.
-- Not applied by this commit.
-- One transaction. lock_timeout 3s. Refuses if private.crm_user() or its caller list
-- is not the captured TEST definition. Does not edit private.crm_user().
-- Does not change any RLS policy.
--
-- private.crm_user() stays the gate for shared reads the rest of the portal uses:
-- crm_picklist_options_read, crm_user_signatures, crm_email_folders_read,
-- crm_email_templates_read, crm_email_favorites, and the visibility helpers
-- (crm_owner_ok, crm_all, crm_editor, crm_deal_visible, crm_email_record_visible, ...).
--
-- CRM page RPCs switch to private.crm_module_user():
--   private.crm_need (the shared gate for the other CRM-page RPCs),
--   public.crm_deals, private.rpc_crm_deals,
--   public.crm_deal_filters, private.rpc_crm_deal_filters,
--   private.rpc_crm_list_export.
-- crm_deal_scope_all drops Processor and Preprocessor and keeps Sales Team.
-- It still calls crm_user(), so a Processor remains a portal CRM-table reader
-- and simply no longer sees every deal.

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public, extensions;

create or replace function private.crm_module_user()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $fn$
  select private.crm_on() and (private.is_admin() or coalesce(private.me_role() in ('Sales Person', 'Sales Team'), false))
$fn$;

revoke all on function private.crm_module_user() from public;

do $pre$
declare
  src text;
  callers text;
  expect_callers text := 'private.crm_account_visible,private.crm_all,private.crm_contact_visible,private.crm_dash_visible,private.crm_deal_scope_all,private.crm_deal_visible,private.crm_editor,private.crm_email_record_visible,private.crm_need,private.crm_opp_visible,private.crm_owner_ok,private.crm_read_all,private.crm_report_visible,private.crm_template_visible,private.crm_view_editable,private.crm_view_visible,private.rpc_crm_deal_filters,private.rpc_crm_deals,private.rpc_crm_list_export,public.crm_deal_filters,public.crm_deals';
  r record;
  def text;
  hits int;
begin
  select p.prosrc into src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'crm_user' and pg_get_function_identity_arguments(p.oid) = '';
  if src is null or md5(src) is distinct from '75e25644876850b4644d5ece3606d864' then
    raise exception 'drift: private.crm_user() is not the captured definition (md5 %)', md5(src);
  end if;

  select string_agg(n.nspname || '.' || p.proname, ',' order by n.nspname, p.proname)
    into callers
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prosrc like '%private.crm_user()%';
  if callers is distinct from expect_callers then
    raise exception 'drift: private.crm_user() callers are %', callers;
  end if;

  if md5((select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'private' and p.proname = 'crm_need' and pg_get_function_identity_arguments(p.oid) = 'p_edit boolean'))
     is distinct from 'ab3fa9bbcf8ce29cefd733083b3a04eb' then
    raise exception 'drift: private.crm_need(boolean) is not the captured definition';
  end if;
  if md5((select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'private' and p.proname = 'crm_deal_scope_all' and pg_get_function_identity_arguments(p.oid) = ''))
     is distinct from 'b58c738cd4ab6c030bcfef6927bd4300' then
    raise exception 'drift: private.crm_deal_scope_all() is not the captured definition';
  end if;
  if md5((select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'crm_deals'
            and pg_get_function_identity_arguments(p.oid) = 'p_status text, p_owner text, p_client uuid, p_source text'))
     is distinct from '4914d497c21f30d8a65eced8b9034d7a' then
    raise exception 'drift: public.crm_deals(text, text, uuid, text) is not the captured definition';
  end if;
  if md5((select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'private' and p.proname = 'rpc_crm_deals'
            and pg_get_function_identity_arguments(p.oid) = 'p_status text, p_owner text, p_client uuid, p_source text'))
     is distinct from '557eddad55a634d0d2f1d61c817f2337' then
    raise exception 'drift: private.rpc_crm_deals(text, text, uuid, text) is not the captured definition';
  end if;
  if md5((select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'crm_deal_filters' and pg_get_function_identity_arguments(p.oid) = ''))
     is distinct from 'ddc6f858448455510e2ab0906719cce7' then
    raise exception 'drift: public.crm_deal_filters() is not the captured definition';
  end if;
  if md5((select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'private' and p.proname = 'rpc_crm_deal_filters' and pg_get_function_identity_arguments(p.oid) = ''))
     is distinct from '140b376d7bbbdb223764090645bc8e53' then
    raise exception 'drift: private.rpc_crm_deal_filters() is not the captured definition';
  end if;
  if md5((select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'private' and p.proname = 'rpc_crm_list_export'
            and pg_get_function_identity_arguments(p.oid) = 'p_module text, p_rows integer'))
     is distinct from '2d60b9008eedf826c82e7271b7c5ca44' then
    raise exception 'drift: private.rpc_crm_list_export(text, integer) is not the captured definition';
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
    hits := (length(def) - length(replace(def, 'if not private.crm_user()', ''))) / length('if not private.crm_user()');
    if hits is distinct from 1 then
      raise exception 'drift: a CRM page function does not have exactly one crm_user() gate';
    end if;
    execute replace(def, 'if not private.crm_user()', 'if not private.crm_module_user()');
  end loop;

  select p.prosrc into src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'crm_user' and pg_get_function_identity_arguments(p.oid) = '';
  if md5(src) is distinct from '75e25644876850b4644d5ece3606d864' then
    raise exception 'drift: private.crm_user() changed during the migration';
  end if;
end
$pre$;

create or replace function private.crm_deal_scope_all()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $fn$
  select private.crm_user() and (private.is_admin() or coalesce(private.me_role() in ('Sales Team'), false))
$fn$;

do $after$
declare
  callers text;
  expect_callers text := 'private.crm_account_visible,private.crm_all,private.crm_contact_visible,private.crm_dash_visible,private.crm_deal_scope_all,private.crm_deal_visible,private.crm_editor,private.crm_email_record_visible,private.crm_opp_visible,private.crm_owner_ok,private.crm_read_all,private.crm_report_visible,private.crm_template_visible,private.crm_view_editable,private.crm_view_visible';
  src text;
begin
  select string_agg(n.nspname || '.' || p.proname, ',' order by n.nspname, p.proname)
    into callers
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prosrc like '%private.crm_user()%';
  if callers is distinct from expect_callers then
    raise exception 'drift: crm_user() callers after the switch are %', callers;
  end if;
  select p.prosrc into src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'crm_deal_scope_all';
  if src like '%Preprocessor%' or src not like '%Sales Team%' or src not like '%private.crm_user()%' then
    raise exception 'drift: crm_deal_scope_all did not drop only Processor and Preprocessor';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname, p.proname) in (
      ('private', 'crm_need'), ('public', 'crm_deals'), ('private', 'rpc_crm_deals'),
      ('public', 'crm_deal_filters'), ('private', 'rpc_crm_deal_filters'), ('private', 'rpc_crm_list_export')
    ) and (p.prosrc like '%private.crm_user()%' or p.prosrc not like '%private.crm_module_user()%')
  ) then
    raise exception 'drift: a CRM page function still calls crm_user() or missed crm_module_user()';
  end if;
end
$after$;

commit;
