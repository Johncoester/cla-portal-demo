-- An HR designation of Processor, Preprocessor, Sales Person, or Transaction Coordinator
-- gives the linked login that portal role. Employee and those four roles can change.
-- Admin, Super admin, Outside user, and anyone with the admin flag stay as they are.
-- One set-based update. This is not a check inside an RLS policy.
-- Not applied by this commit.
begin;
set local lock_timeout = '3s';

create or replace function private.trg_hr_designation_portal_role()
returns trigger
language plpgsql
security definer
set search_path to pg_catalog, public, extensions
as $function$
begin
  update public.profiles p
  set role = mapped.role
  from (
    select e.profile_id, private.hr_portal_role_for(e.designation_id) as role
    from public.hr_employees e
    where e.id = new.id and e.profile_id is not null and e.archived_at is null
  ) mapped
  where p.id = mapped.profile_id
    and coalesce(p.is_admin, false) = false
    and p.role in ('Employee', 'Processor', 'Preprocessor', 'Sales Person', 'Transaction Coordinator')
    and mapped.role in ('Processor', 'Preprocessor', 'Sales Person', 'Transaction Coordinator')
    and p.role is distinct from mapped.role;
  return new;
end
$function$;

revoke all on function private.trg_hr_designation_portal_role() from public, anon, authenticated;

drop trigger if exists hr_designation_portal_role on public.hr_employees;
create trigger hr_designation_portal_role
  after insert or update of designation_id, profile_id, archived_at
  on public.hr_employees
  for each row execute function private.trg_hr_designation_portal_role();

update public.profiles p
set role = private.hr_portal_role_for(e.designation_id)
from public.hr_employees e
where e.profile_id = p.id
  and e.archived_at is null
  and coalesce(p.is_admin, false) = false
  and p.role in ('Employee', 'Processor', 'Preprocessor', 'Sales Person', 'Transaction Coordinator')
  and private.hr_portal_role_for(e.designation_id) in ('Processor', 'Preprocessor', 'Sales Person', 'Transaction Coordinator')
  and p.role is distinct from private.hr_portal_role_for(e.designation_id);

do $readback$
declare src text;
begin
  select p.prosrc into src from pg_proc p where p.oid = 'private.trg_hr_designation_portal_role()'::regprocedure;
  if position('hr_portal_role_for' in src) = 0 then
    raise exception 'readback: the designation does not set the portal role';
  end if;
  if position('is_admin' in src) = 0 then
    raise exception 'readback: the admin flag is not left alone';
  end if;
  if position('per-row' in src) > 0 then
    raise exception 'readback: the role sync walks one row inside the policy';
  end if;
end
$readback$;
commit;
