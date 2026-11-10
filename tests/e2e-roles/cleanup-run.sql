-- Removes rows a single E2E run created. NOT a migration. NOT APPLIED.
-- Paste into the TEST SQL editor only, after you set the run id.
-- It does not touch the seeded file whose notes are exactly E2E-ROLE-FILE.
-- Documents cannot be deleted from the portal. This script deletes only rows
-- whose name, subject, or notes contain the run id you pass.
--
--   select set_config('e2e.run_id', '<the id from the summary>', true);

begin;
set local lock_timeout = '3s';
do $clean$
declare
  rid text := btrim(coalesce(current_setting('e2e.run_id', true), ''));
begin
  if rid = '' or rid !~ '^[A-Za-z0-9]+$' then
    raise exception 'refusing: set e2e.run_id to the run id (letters and digits only).';
  end if;
  if not exists (
    select 1 from public.profiles
    where id in ('149e612a-6e14-4ee1-9890-0f29d6f89156'::uuid, 'd02722a1-582b-42c0-b3d1-28d25adb758d'::uuid)
  ) then
    raise exception 'refusing: not the CLA Portal Live Test database.';
  end if;
  if to_regclass('public.documents') is not null then
    delete from public.documents where name like 'e2e-' || rid || '-%';
  end if;
  if to_regclass('public.messages') is not null and to_regclass('public.threads') is not null then
    delete from public.messages where thread_id in (select id from public.threads where subject like 'E2E-RUN-' || rid || '%');
    delete from public.threads where subject like 'E2E-RUN-' || rid || '%';
  end if;
  if to_regclass('public.deals') is not null then
    delete from public.deal_participants where deal_id in (select id from public.deals where notes like 'E2E-RUN-' || rid || '%' and notes is distinct from 'E2E-ROLE-FILE');
    delete from public.deals where notes like 'E2E-RUN-' || rid || '%' and notes is distinct from 'E2E-ROLE-FILE';
  end if;
end
$clean$;
commit;
