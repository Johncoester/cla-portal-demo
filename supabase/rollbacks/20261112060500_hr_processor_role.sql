-- Removes the designation-to-role sync. Logins already updated keep the role they have.
begin;
set local lock_timeout = '3s';
drop trigger if exists hr_designation_portal_role on public.hr_employees;
drop function if exists private.trg_hr_designation_portal_role();
commit;
