-- Hand change on TEST before the November 10 duplicate-index check. Already on TEST. Do not apply this file to TEST again.
-- The lead table is created by 20261105222910_crm.sql. This trigger is the one the scratch
-- precondition attaches when that table already exists. Copied from test_precondition.sql.
-- crm_nov3b (TEST history 20261105222939) now creates the same trigger. Drop it first so
-- this file still runs. The live function body is created later by 20261110040000_crm_person_dup_index.sql
-- (pg_get_functiondef md5 618de60d1b35841405a26ed27364ae8e).
drop trigger if exists crm_leads_person_dup on public.crm_leads;
create trigger crm_leads_person_dup before insert or update of email, phone on public.crm_leads
      for each row execute function private.crm_person_dup();
