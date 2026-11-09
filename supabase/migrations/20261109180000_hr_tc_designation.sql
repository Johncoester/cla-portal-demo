-- John's email to Francis, Nov 9 (~12:13 PM ET): add HR designation 'Transaction Coordinator'
-- so Francis can pick it when adding a TC. private.hr_portal_role_for already maps
-- 'transaction coordinator' -> 'Transaction Coordinator' (PR62 / 20261109170000).
-- Data only: one active hr_designations row. No helper, RLS, or profile changes.
-- Rollback: supabase/rollbacks/20261109180000_hr_tc_designation.sql
begin;
set local lock_timeout = '3s';
do $$
begin
  if to_regprocedure('private.hr_portal_role_for(uuid)') is null then
    raise exception 'drift: private.hr_portal_role_for(uuid) missing (apply 20261109170000 first)';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass and conname = 'profiles_role_check'
      and pg_get_constraintdef(oid) like '%''Transaction Coordinator''%'
  ) then
    raise exception 'drift: profiles_role_check no longer allows Transaction Coordinator';
  end if;
end $$;

insert into public.hr_designations (name)
select 'Transaction Coordinator'
where not exists (
  select 1 from public.hr_designations
  where lower(btrim(name)) = 'transaction coordinator' and archived_at is null
);

do $$
declare des uuid;
begin
  select id into des from public.hr_designations
  where lower(btrim(name)) = 'transaction coordinator' and archived_at is null;
  if des is null then
    raise exception 'self-check: Transaction Coordinator designation missing after insert';
  end if;
  if private.hr_portal_role_for(des) is distinct from 'Transaction Coordinator' then
    raise exception 'self-check: hr_portal_role_for(%) = %', des, private.hr_portal_role_for(des);
  end if;
end $$;
commit;
