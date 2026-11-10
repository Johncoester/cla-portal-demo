-- Rollback of 20261110140000_e2e_role_file_seed.sql
-- Removes only rows tagged E2E Role Seed / E2E-ROLE-FILE. NOT APPLIED.
-- Refuses any database that is not CLA Portal Live Test.
-- Does not delete passwords from this file (none are stored here).
-- Auth users for those emails are removed only when the auth schema is present
-- and the profile email is one of the seeded contacts (company E2E Role Seed).

begin;
set local lock_timeout = '3s';

do $e2e$
declare
  did uuid;
  em text;
begin
  if to_regclass('public.profiles') is null or to_regclass('public.deals') is null then
    raise exception 'refusing: portal tables are missing.';
  end if;
  if not exists (
    select 1 from public.profiles
    where id in ('149e612a-6e14-4ee1-9890-0f29d6f89156'::uuid, 'd02722a1-582b-42c0-b3d1-28d25adb758d'::uuid)
  ) then
    raise exception 'refusing: this database does not have the CLA Portal Live Test staff profiles (project aqcervntopidtcazcmlv).';
  end if;

  for did in select id from public.deals where notes = 'E2E-ROLE-FILE' loop
    if to_regclass('public.tasks') is not null then
      delete from public.tasks where deal_id = did;
    end if;
    if to_regclass('public.deal_participants') is not null then
      delete from public.deal_participants where deal_id = did;
    end if;
    if to_regclass('public.deal_sales_people') is not null then
      delete from public.deal_sales_people where deal_id = did;
    end if;
    delete from public.deals where id = did;
  end loop;

  for em in select lower(email) from public.contacts where company = 'E2E Role Seed' and email is not null loop
    if to_regclass('auth.identities') is not null then
      delete from auth.identities where user_id in (select id from auth.users where lower(email) = em);
    end if;
    if to_regclass('auth.users') is not null then
      delete from auth.users where lower(email) = em;
    end if;
    delete from public.profiles where lower(email) = em;
  end loop;
  delete from public.contacts where company = 'E2E Role Seed';
end
$e2e$;

commit;
