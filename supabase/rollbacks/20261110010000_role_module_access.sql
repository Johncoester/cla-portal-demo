-- ROLLBACK for 20261110010000_role_module_access.sql: every function body back exactly as captured from TEST on Nov 9, new objects dropped.
-- Nothing else changes. Role access rows and their log are dropped with the tables (the seed is the old behaviour, so access returns to the hard-coded lists).

-- 1. the CRM entry checks: remove the added role_can('crm') line (md5 must then match the Nov 9 body)
do $$
declare k text; def text; h text; add_line text := $l$
  if not private.role_can('crm') then raise exception 'The CRM is turned off for your role. A Super admin can change this in Admin > Role access.' using errcode = '42501'; end if;$l$;
  want jsonb := jsonb_build_object('private.crm_need(boolean)', 'ab3fa9bbcf8ce29cefd733083b3a04eb', 'private.rpc_crm_deal_filters()', '140b376d7bbbdb223764090645bc8e53',
    'private.rpc_crm_deals(text, text, uuid, text)', '557eddad55a634d0d2f1d61c817f2337', 'private.rpc_crm_list_export(text, integer)', '2d60b9008eedf826c82e7271b7c5ca44',
    'public.crm_deal_filters()', 'ddc6f858448455510e2ab0906719cce7', 'public.crm_deals(text, text, uuid, text)', '4914d497c21f30d8a65eced8b9034d7a');
begin
  for k in select jsonb_object_keys(want) loop
    def := pg_get_functiondef(k::regprocedure);
    if position(add_line in def) > 0 then execute replace(def, add_line, ''); end if;
    select md5(prosrc) into h from pg_proc where oid = k::regprocedure;
    if h <> want ->> k then raise exception 'rollback: % does not match the Nov 9 body (md5 %)', k, h; end if;
  end loop;
end $$;

-- 2. the role-list functions, exactly as on Nov 9
CREATE OR REPLACE FUNCTION private.crm_all()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select private.crm_user() and (private.is_admin() or coalesce(private.me_role() in ('Processor', 'Preprocessor'), false)) $function$;
CREATE OR REPLACE FUNCTION private.crm_read_all()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select private.crm_user() and (private.is_admin() or coalesce(private.me_role() in ('Processor', 'Preprocessor'), false)) $function$;
CREATE OR REPLACE FUNCTION private.crm_editor()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select private.crm_user() and (private.is_admin() or coalesce(private.me_role() in ('Sales Person', 'Sales Team'), false)) $function$;
CREATE OR REPLACE FUNCTION private.crm_deal_scope_all()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select private.crm_user() and (private.is_admin() or coalesce(private.me_role() in ('Processor', 'Preprocessor', 'Sales Team'), false)) $function$;
CREATE OR REPLACE FUNCTION private.acct_reader(d uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select private.acct_on() and coalesce(private.is_admin() or private.me_role() in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator'), false) and private.can_access_deal(d) $function$;
CREATE OR REPLACE FUNCTION private.acct_editor(d uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select private.acct_on() and coalesce(private.is_admin() or private.me_role() in ('Processor', 'Preprocessor'), false) and private.can_access_deal(d) $function$;

-- 3. the new objects
drop function if exists public.set_role_access(text, text, boolean);
drop function if exists private.rpc_set_role_access(text, text, boolean);
drop function if exists private.crm_module_user();
drop function if exists private.role_can(text);
drop table if exists public.role_module_access_log;
drop table if exists public.role_module_access;
