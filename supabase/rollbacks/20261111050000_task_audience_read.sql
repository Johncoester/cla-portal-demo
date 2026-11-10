-- Exact rollback of 20261111050000_task_audience_read.sql.
-- Removes the new SELECT and UPDATE grants and restores private.task_outside_audience
-- to the body captured on TEST (md5 613b579bcdaf51b4b4bcb9e465d7adb3).
begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

do $guard$
begin
  if not has_column_privilege('authenticated', 'public.tasks', 'audiences', 'SELECT')
     or not has_column_privilege('authenticated', 'public.tasks', 'due_overridden', 'SELECT')
     or not has_column_privilege('authenticated', 'public.tasks', 'audiences', 'UPDATE') then
    raise exception 'drift: the audience read grants are missing';
  end if;
  if (select position('assigned_role = ''Client-Buyer''' in prosrc) from pg_proc where oid = to_regprocedure('private.task_outside_audience(uuid)')) = 0 then
    raise exception 'drift: private.task_outside_audience is not the one-off form';
  end if;
end
$guard$;

revoke select (audiences, due_overridden) on public.tasks from authenticated;
revoke update (audiences) on public.tasks from authenticated;

create or replace function private.task_outside_audience(p_task uuid)
returns boolean
language sql
stable security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
  select exists (select 1 from public.tasks t where t.id = p_task and t.audiences is not null and (
    ('Client-Buyer' = any (private.deal_roles(t.deal_id)) and 'buyer' = any (t.audiences) and t.owner_profile_id = (select private.effective_uid()) and not (t.audiences = array['internal']::text[]))
    or ('Client-Seller' = any (private.deal_roles(t.deal_id)) and 'seller' = any (t.audiences) and t.owner_profile_id = (select private.effective_uid()) and not (t.audiences = array['internal']::text[]))
    or ('Buyer Agent' = any (private.deal_roles(t.deal_id)) and 'buyer_agent' = any (t.audiences))
    or ('Listing Agent' = any (private.deal_roles(t.deal_id)) and 'listing_agent' = any (t.audiences)))) $function$;

do $readback$
begin
  if has_column_privilege('authenticated', 'public.tasks', 'audiences', 'SELECT')
     or has_column_privilege('authenticated', 'public.tasks', 'due_overridden', 'SELECT')
     or has_column_privilege('authenticated', 'public.tasks', 'audiences', 'UPDATE') then
    raise exception 'readback: an audience grant is still present';
  end if;
  if (select md5(prosrc) from pg_proc where oid = to_regprocedure('private.task_outside_audience(uuid)'))
       is distinct from '613b579bcdaf51b4b4bcb9e465d7adb3' then
    raise exception 'readback: task_outside_audience was not restored';
  end if;
end
$readback$;
commit;
