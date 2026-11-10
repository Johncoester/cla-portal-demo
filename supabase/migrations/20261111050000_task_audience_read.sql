-- A one-off task save returns the new row, including audiences.
-- authenticated may INSERT tasks.audiences and tasks.due_overridden, and may not SELECT them.
-- PostgREST's RETURNING then raises 42501 permission denied for table tasks, and the insert is rolled back.
-- Run 42822473375: POST /rest/v1/tasks returned 403, proxy-status PostgREST error=42501,
-- body {"code":"42501","message":"permission denied for table tasks","hint":"GRANT SELECT ON public.tasks TO authenticated"}.
-- The request body was a simple task with audiences ["buyer"]. No row was stored. The page toasted the error, not "Task saved".
--
-- This grants SELECT on those two columns only. Row visibility stays with the existing policies.
-- It also lets a client see an unowned one-off task when the assigned role is their own side and that side is in audiences.
-- A template copy with audiences null is unchanged: the copy trigger stores the template's audiences, and every active template on TEST is null.
--
-- Rollback: supabase/rollbacks/20261111050000_task_audience_read.sql
begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

do $guard$
begin
  if not has_column_privilege('authenticated', 'public.tasks', 'audiences', 'INSERT')
     or has_column_privilege('authenticated', 'public.tasks', 'audiences', 'SELECT') then
    raise exception 'drift: tasks.audiences privileges are not insert-only for authenticated';
  end if;
  if not has_column_privilege('authenticated', 'public.tasks', 'due_overridden', 'INSERT')
     or has_column_privilege('authenticated', 'public.tasks', 'due_overridden', 'SELECT') then
    raise exception 'drift: tasks.due_overridden privileges are not insert-only for authenticated';
  end if;
  if has_column_privilege('authenticated', 'public.tasks', 'audiences', 'UPDATE') then
    raise exception 'drift: authenticated can already update tasks.audiences';
  end if;
  if to_regprocedure('private.task_outside_audience(uuid)') is null
     or (select md5(prosrc) from pg_proc where oid = to_regprocedure('private.task_outside_audience(uuid)'))
        is distinct from '613b579bcdaf51b4b4bcb9e465d7adb3' then
    raise exception 'drift: private.task_outside_audience changed or missing';
  end if;
end
$guard$;

grant select (audiences, due_overridden) on public.tasks to authenticated;
grant update (audiences) on public.tasks to authenticated;

create or replace function private.task_outside_audience(p_task uuid)
returns boolean
language sql
stable security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
  select exists (select 1 from public.tasks t where t.id = p_task and t.audiences is not null and (
    ('Client-Buyer' = any (private.deal_roles(t.deal_id)) and 'buyer' = any (t.audiences) and (t.owner_profile_id = (select private.effective_uid()) or (t.owner_profile_id is null and t.assigned_role = 'Client-Buyer')) and not (t.audiences = array['internal']::text[]))
    or ('Client-Seller' = any (private.deal_roles(t.deal_id)) and 'seller' = any (t.audiences) and (t.owner_profile_id = (select private.effective_uid()) or (t.owner_profile_id is null and t.assigned_role = 'Client-Seller')) and not (t.audiences = array['internal']::text[]))
    or ('Buyer Agent' = any (private.deal_roles(t.deal_id)) and 'buyer_agent' = any (t.audiences))
    or ('Listing Agent' = any (private.deal_roles(t.deal_id)) and 'listing_agent' = any (t.audiences)))) $function$;

do $readback$
begin
  if not has_column_privilege('authenticated', 'public.tasks', 'audiences', 'SELECT')
     or not has_column_privilege('authenticated', 'public.tasks', 'due_overridden', 'SELECT')
     or not has_column_privilege('authenticated', 'public.tasks', 'audiences', 'UPDATE') then
    raise exception 'readback: the audience read grants are missing';
  end if;
  if (select position('assigned_role = ''Client-Buyer''' in prosrc) from pg_proc where oid = to_regprocedure('private.task_outside_audience(uuid)')) = 0
     or (select position('buyer_agent' in prosrc) from pg_proc where oid = to_regprocedure('private.task_outside_audience(uuid)')) = 0 then
    raise exception 'readback: the audience check lost a branch';
  end if;
end
$readback$;
commit;
