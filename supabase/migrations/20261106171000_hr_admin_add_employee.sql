-- HR Add Employee for portal Admins (John, Nov 6). Not applied on TEST.
-- A portal Admin is is_admin and is not a Super admin. They could open HR only as an employee
-- (or not at all) and hr_create_employee / hr_create_invite refused them with 42501
-- "Only HR managers and Super admins add employees."
-- Once HR is Live, an active Admin may add employees, invite them, and use the directory.
-- Still Super admin only: turning the HR module Live, and assigning or removing HR managers.
-- Still refused: granting the Super admin role, and anyone who is not an Admin.
-- Does not create or alter anything in schema auth.

create or replace function private.hr_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select private.hr_is_super()
    or private.hr_is_manager()
    or (private.hr_open() and private.is_admin() and coalesce(private.me_role(), '') <> 'Outside user') $$;

create or replace function private.hr_in() returns boolean
language sql stable security definer set search_path = public as $$
  select private.hr_admin() or (private.hr_open() and private.hr_my_employee() is not null) $$;

create or replace function public.hr_role() returns text
language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then null
    when private.hr_is_super() then 'super'
    when private.hr_open() and private.is_admin() and coalesce(private.me_role(), '') <> 'Outside user' then 'hr_manager'
    when not private.hr_open() or private.hr_my_employee() is null then null
    when private.hr_is_manager() then 'hr_manager'
    else 'employee'
  end $$;

revoke all on function private.hr_admin(), private.hr_in() from public, anon;
revoke all on function public.hr_role() from public, anon;
grant execute on function public.hr_role() to authenticated;

select private.lock_function_search_paths();
