-- Reconstructed from TEST's Nov 9 hand change. Not in TEST's migration history.
-- Never applied to TEST (TEST already moved past it). Kept so a fresh database loads.
-- private.acct_editor md5 d7af7375e60e791c1a200e4d07c7ca47
-- private.acct_reader md5 5f5ed67de41251c5576147908b07abff
-- Bodies copied from test/sql/role-access-harness.sql. No other object is changed.

CREATE OR REPLACE FUNCTION private.acct_editor(d uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select private.acct_on() and coalesce(private.is_admin() or private.me_role() in ('Processor', 'Preprocessor'), false) and private.can_access_deal(d) $function$;
CREATE OR REPLACE FUNCTION private.acct_reader(d uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select private.acct_on() and coalesce(private.is_admin() or private.me_role() in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator'), false) and private.can_access_deal(d) $function$;
