-- Rollback of 20261110140000_e2e_role_profiles.sql
-- Deletes only contacts tagged company 'E2E Role Seed' whose email matches
-- ^clatestportal\+e2e-[a-z-]+@gmail\.com$, and the matching profiles.
-- Never deletes auth.users. Roll back 20261110140100_e2e_role_file_seed.sql first
-- so the file is not left pointing at these contacts.
-- NOT APPLIED.

begin;
set local lock_timeout = '3s';

do $e2e$
declare
  auth_before int;
  auth_after int;
begin
  if to_regclass('auth.users') is null or to_regclass('public.profiles') is null or to_regclass('public.contacts') is null then
    raise exception 'refusing: auth.users, profiles, or contacts is missing';
  end if;
  select count(*) into auth_before from auth.users;

  if to_regclass('public.deals') is not null and exists (
    select 1 from public.deals d where d.notes = 'E2E-ROLE-FILE'
  ) then
    raise exception 'refusing: roll back 20261110140100_e2e_role_file_seed.sql first';
  end if;
  if to_regclass('public.deal_participants') is not null and exists (
    select 1
    from public.deal_participants p
    join public.contacts c on c.id = p.contact_id
    where c.company = 'E2E Role Seed'
      and lower(c.email) ~ '^clatestportal\+e2e-[a-z-]+@gmail\.com$'
  ) then
    raise exception 'refusing: an e2e contact is still on a file';
  end if;
  if to_regclass('public.deal_sales_people') is not null and exists (
    select 1
    from public.deal_sales_people s
    join public.profiles p on p.id = s.sales_id
    where lower(p.email) ~ '^clatestportal\+e2e-[a-z-]+@gmail\.com$'
  ) then
    raise exception 'refusing: an e2e profile is still a salesperson on a file';
  end if;

  delete from public.contacts c
  where c.company = 'E2E Role Seed'
    and lower(c.email) ~ '^clatestportal\+e2e-[a-z-]+@gmail\.com$';

  delete from public.profiles p
  where lower(p.email) ~ '^clatestportal\+e2e-[a-z-]+@gmail\.com$';

  select count(*) into auth_after from auth.users;
  if auth_after is distinct from auth_before then
    raise exception 'refusing: rollback changed auth.users (% -> %)', auth_before, auth_after;
  end if;
end
$e2e$;

commit;
