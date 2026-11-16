-- Hand change on TEST before the November 10 duplicate-index check. Already on TEST. Do not apply this file to TEST again.
-- The lead table is created by 20261105222910_crm.sql. This trigger is the one the scratch
-- precondition attaches when that table already exists. Copied from test_precondition.sql.
create trigger crm_leads_person_dup before insert or update of email, phone on public.crm_leads
      for each row execute function private.crm_person_dup();
