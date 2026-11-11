-- An HR designation of Processor, Preprocessor, Sales Person, or Transaction Coordinator
-- gives the linked login that portal role. Employee and those four roles can change.
-- Admin, Super admin, Outside user, and anyone with the admin flag stay as they are.
-- One set-based update. This is not a check inside an RLS policy.
-- Not applied by this commit.
begin;
set local lock_timeout = '3s';

-- Sets one login's portal role. reverting = true only moves Processor, Preprocessor,
-- Sales Person, or Transaction Coordinator back to Employee. Never Admin, Super admin,
-- Outside user, or a login with the admin flag. Skips the caller's own login unless the caller is an admin.
create or replace function private.hr_apply_portal_role(p_profile uuid, p_role text, p_reverting boolean)
returns void
language sql
security definer
set search_path to pg_catalog, public, extensions
as $function$
  update public.profiles p
  set role = p_role
  where p.id = p_profile
    and coalesce(p.is_admin, false) = false
    and p.role not in ('Admin', 'Super admin', 'Outside user')
    and (coalesce(private.is_admin(), false) or p.id is distinct from private.effective_uid())
    and (
      (not p_reverting and p.role in ('Employee', 'Processor', 'Preprocessor', 'Sales Person', 'Transaction Coordinator'))
      or (p_reverting and p.role in ('Processor', 'Preprocessor', 'Sales Person', 'Transaction Coordinator'))
    )
    and p.role is distinct from p_role;
$function$;

revoke all on function private.hr_apply_portal_role(uuid, text, boolean) from public, anon, authenticated;

create or replace function private.trg_hr_designation_portal_role()
returns trigger
language plpgsql
security definer
set search_path to pg_catalog, public, extensions
as $function$
declare
  mapped text;
  old_mapped text;
begin
  mapped := private.hr_portal_role_for(new.designation_id);
  if tg_op = 'UPDATE' then
    old_mapped := private.hr_portal_role_for(old.designation_id);
    if old.profile_id is not null and old.profile_id is distinct from new.profile_id then
      perform private.hr_apply_portal_role(old.profile_id, 'Employee', true);
    end if;
  end if;
  if new.archived_at is not null then
    if new.profile_id is not null then
      perform private.hr_apply_portal_role(new.profile_id, 'Employee', true);
    end if;
    return new;
  end if;
  if new.profile_id is null then
    return new;
  end if;
  if mapped in ('Processor', 'Preprocessor', 'Sales Person', 'Transaction Coordinator') then
    perform private.hr_apply_portal_role(new.profile_id, mapped, false);
  elsif tg_op = 'UPDATE'
    and old_mapped in ('Processor', 'Preprocessor', 'Sales Person', 'Transaction Coordinator')
    and mapped is distinct from old_mapped then
    perform private.hr_apply_portal_role(new.profile_id, 'Employee', true);
  end if;
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
  if position('is_admin' in src) = 0 and position('hr_apply_portal_role' in src) = 0 then
    raise exception 'readback: the admin flag is not left alone';
  end if;
  if position('private.effective_uid()' in (select p.prosrc from pg_proc p where p.oid = 'private.hr_apply_portal_role(uuid,text,boolean)'::regprocedure)) = 0 then
    raise exception 'readback: HR can still change their own portal role';
  end if;
  if position('Employee' in (select p.prosrc from pg_proc p where p.oid = 'private.trg_hr_designation_portal_role()'::regprocedure)) = 0 then
    raise exception 'readback: removing the designation does not return the login to Employee';
  end if;
  if position('per-row' in src) > 0 then
    raise exception 'readback: the role sync walks one row inside the policy';
  end if;
end
$readback$;
commit;
