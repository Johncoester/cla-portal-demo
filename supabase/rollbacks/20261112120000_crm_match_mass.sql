-- Rollback 20261112120000_crm_match_mass.
-- These functions and indexes did not exist before that migration.
-- There is no earlier function body to restore.

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

drop function if exists public.crm_mass_email(text, jsonb, text, text);
drop function if exists public.crm_mass_update(text, jsonb, text, text);
drop function if exists public.crm_match_plan(text, jsonb, text);
drop function if exists public.crm_match_ids(text, jsonb);
drop function if exists public.crm_date_bounds(jsonb, timestamptz);

drop index if exists public.crm_match_activities_entity_idx;
drop index if exists public.crm_match_deals_closing_idx;
drop index if exists public.crm_match_deals_open_idx;
drop index if exists public.crm_match_deals_created_idx;
drop index if exists public.crm_match_opps_close_idx;
drop index if exists public.crm_match_opps_modified_idx;
drop index if exists public.crm_match_opps_created_idx;
drop index if exists public.crm_match_accounts_modified_idx;
drop index if exists public.crm_match_accounts_created_idx;
drop index if exists public.crm_match_contacts_modified_idx;
drop index if exists public.crm_match_contacts_created_idx;
drop index if exists public.crm_match_leads_modified_idx;
drop index if exists public.crm_match_leads_created_idx;

do $gone$
begin
  if to_regprocedure('public.crm_match_ids(text, jsonb)') is not null
     or to_regprocedure('public.crm_mass_update(text, jsonb, text, text)') is not null
     or to_regprocedure('public.crm_mass_email(text, jsonb, text, text)') is not null
     or to_regprocedure('public.crm_date_bounds(jsonb, timestamptz)') is not null
     or to_regclass('public.crm_match_leads_created_idx') is not null then
    raise exception 'rollback: match functions or indexes are still present';
  end if;
end
$gone$;

commit;
