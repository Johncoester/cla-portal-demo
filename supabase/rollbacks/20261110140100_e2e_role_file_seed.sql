-- Rollback of 20261110140100_e2e_role_file_seed.sql
-- Deletes only the deal tagged notes = 'E2E-ROLE-FILE', its participants,
-- its sales links, and tasks on that deal. Never deletes auth users or profiles.
-- NOT APPLIED.

begin;
set local lock_timeout = '3s';

do $e2e$
declare
  auth_before int;
  auth_after int;
  profiles_before int;
  profiles_after int;
begin
  if to_regclass('public.deals') is null then
    raise exception 'refusing: public.deals is missing';
  end if;
  if to_regclass('auth.users') is not null then
    select count(*) into auth_before from auth.users;
  end if;
  if to_regclass('public.profiles') is not null then
    select count(*) into profiles_before from public.profiles;
  end if;

  if to_regclass('public.tasks') is not null then
    delete from public.tasks t
    using public.deals d
    where t.deal_id = d.id and d.notes = 'E2E-ROLE-FILE';
  end if;
  if to_regclass('public.deal_participants') is not null then
    delete from public.deal_participants p
    using public.deals d
    where p.deal_id = d.id and d.notes = 'E2E-ROLE-FILE';
  end if;
  if to_regclass('public.deal_sales_people') is not null then
    delete from public.deal_sales_people s
    using public.deals d
    where s.deal_id = d.id and d.notes = 'E2E-ROLE-FILE';
  end if;
  delete from public.deals where notes = 'E2E-ROLE-FILE';

  if to_regclass('auth.users') is not null then
    select count(*) into auth_after from auth.users;
    if auth_after is distinct from auth_before then
      raise exception 'refusing: rollback changed auth.users (% -> %)', auth_before, auth_after;
    end if;
  end if;
  if to_regclass('public.profiles') is not null then
    select count(*) into profiles_after from public.profiles;
    if profiles_after is distinct from profiles_before then
      raise exception 'refusing: file rollback changed profiles (% -> %)', profiles_before, profiles_after;
    end if;
  end if;
end
$e2e$;

commit;
