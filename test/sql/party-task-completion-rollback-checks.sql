-- After the rollback, a finished copy no longer stays in the open count.
do $check$
declare
  got record;
begin
  if position('Client-Buyer' in (
    select p.prosrc from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'dashboard_file_task_counts'
  )) > 0 then
    raise exception 'rollback left the party-task rule in place';
  end if;

  select * into got from public.dashboard_file_task_counts(array['00000000-0000-4000-8000-000000000001']::uuid[]);
  if got.open_tasks <> 1 or got.overdue_tasks <> 0 then
    raise exception 'after rollback, one finished buyer copy drops out of the open count, got % / %', got.open_tasks, got.overdue_tasks;
  end if;

  select * into got from public.dashboard_file_task_counts(array['00000000-0000-4000-8000-000000000002']::uuid[]);
  if got.open_tasks <> 0 then
    raise exception 'after rollback, one finished buyer stays done, got %', got.open_tasks;
  end if;

  select * into got from public.dashboard_file_task_counts(array['00000000-0000-4000-8000-000000000003']::uuid[]);
  if got.open_tasks <> 1 or got.overdue_tasks <> 1 then
    raise exception 'after rollback, one overdue task is unchanged, got % / %', got.open_tasks, got.overdue_tasks;
  end if;

  select * into got from public.dashboard_file_task_counts(array['00000000-0000-4000-8000-000000000007']::uuid[]);
  if got.open_tasks <> 1 or got.overdue_tasks <> 0 then
    raise exception 'after rollback, the finished overdue copy does not stay open, got % / %', got.open_tasks, got.overdue_tasks;
  end if;
end
$check$;
