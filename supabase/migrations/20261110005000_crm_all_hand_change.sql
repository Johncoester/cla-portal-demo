-- Hand change on TEST between the Nov 2 CRM history and Nov 9. Already on TEST. Do not apply this file to TEST again.
-- Not in TEST's migration history. Kept so a fresh database reaches the November 9 role-access check.
-- private.crm_all copied exactly from supabase/rollbacks/20261110010000_role_module_access.sql.
-- The Nov 2 history body does not include Preprocessor. This copy does.
CREATE OR REPLACE FUNCTION private.crm_all()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select private.crm_user() and (private.is_admin() or coalesce(private.me_role() in ('Processor', 'Preprocessor'), false)) $function$;
