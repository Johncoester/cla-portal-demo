-- Rollback of 20261109180000_hr_tc_designation.sql: archives the 'Transaction Coordinator'
-- HR designation only when no active employee uses it (hr_designations has a no-delete trigger;
-- archiving is HR's own "remove"). Profiles created while it was live keep their role.
begin;
set local lock_timeout = '3s';
update public.hr_designations g
   set archived_at = now()
 where lower(btrim(g.name)) = 'transaction coordinator'
   and g.archived_at is null
   and not exists (
     select 1 from public.hr_employees e
     where e.designation_id = g.id and e.archived_at is null
   );
commit;
