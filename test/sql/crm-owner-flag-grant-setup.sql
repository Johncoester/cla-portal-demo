-- Scratch privileges for CRM-OWNER-1b. Not applied to TEST or production.
-- Same shape as TEST: authenticated may SELECT every profiles column, and may
-- UPDATE only the columns that were granted one by one. can_own_crm is not one
-- of them until the grant file runs. Fake ids only.
\set ON_ERROR_STOP on

insert into public.profiles (id, email, first_name, last_name, role, is_admin) values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'ned.clerk@example.test', 'Ned', 'Clerk', 'Processor', false),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'amy.admin@example.test', 'Amy', 'Admin', 'Admin', true);

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $fn$
  select coalesce((select p.is_admin from public.profiles p where p.id = private.effective_uid() and p.status = 'active'), false)
$fn$;

create or replace function private.me_role()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $fn$
  select p.role from public.profiles p where p.id = private.effective_uid() and p.status = 'active'
$fn$;

revoke all on function private.is_admin() from public;
revoke all on function private.me_role() from public;
grant usage on schema public, private, auth to authenticated;
grant execute on function auth.uid() to authenticated;
grant execute on function private.effective_uid() to authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.me_role() to authenticated;

-- Table SELECT, like TEST. UPDATE stays column by column, and can_own_crm is left out.
grant select on public.profiles to authenticated;
grant update (first_name, last_name, phone, role, status, is_admin) on public.profiles to authenticated;

alter table public.profiles enable row level security;

-- The real select rule also requires a shared file. This scratch rule only lets a
-- signed-in user see profiles, because an update cannot see a row without a select rule.
create policy profiles_select on public.profiles
  for select to authenticated
  using (private.me_role() is not null);

-- Copied from TEST. A processor editing their own row uses profiles_update_self.
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (((id = private.effective_uid()) and (private.me_role() is not null)))
  with check ((id = private.effective_uid()));

create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (private.is_admin())
  with check (private.is_admin());
