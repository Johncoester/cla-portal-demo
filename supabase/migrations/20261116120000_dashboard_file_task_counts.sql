-- Per-file open and overdue task counts for the dashboard files shown.
-- Counts come from the database for those file ids (capped at 100), not from the 200-task page.
begin;
set local lock_timeout = '3s';

create or replace function public.dashboard_file_task_counts(p_deal_ids uuid[])
returns table (deal_id uuid, open_tasks integer, overdue_tasks integer)
language sql
stable
security invoker
set search_path to pg_catalog, public, extensions
set jit = off
as $counts$
  select d.id,
         count(t.id) filter (where t.status in ('todo', 'in_progress', 'blocked'))::int as open_tasks,
         count(t.id) filter (
           where t.status in ('todo', 'in_progress', 'blocked')
             and t.due_date is not null
             and t.due_date < private.office_today()
         )::int as overdue_tasks
  from public.deals d
  left join public.tasks t on t.deal_id = d.id
  where p_deal_ids is not null
    and d.id = any (p_deal_ids[1:100])
  group by d.id
$counts$;

comment on function public.dashboard_file_task_counts(uuid[]) is
  'Dashboard per-file open and overdue task counts for the files shown (at most 100 ids). Invoker: row security still applies. Does not replace the 200-row task list.';

revoke all on function public.dashboard_file_task_counts(uuid[]) from public;
revoke all on function public.dashboard_file_task_counts(uuid[]) from anon;
grant execute on function public.dashboard_file_task_counts(uuid[]) to authenticated;

commit;
