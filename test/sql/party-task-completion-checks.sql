-- Fake files only. Expects dashboard_file_task_counts after MF-057.
insert into public.deals (id) values
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-000000000003'),
  ('00000000-0000-4000-8000-000000000004'),
  ('00000000-0000-4000-8000-000000000005'),
  ('00000000-0000-4000-8000-000000000006'),
  ('00000000-0000-4000-8000-000000000007'),
  ('00000000-0000-4000-8000-000000000008'),
  ('00000000-0000-4000-8000-000000000009');

insert into public.tasks (id, deal_id, title, assigned_role, status, due_date, participant_id, template_code) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Upload ID', 'Client-Buyer', 'done', '2026-11-01', '20000000-0000-4000-8000-000000000001', 'id_upload'),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Upload ID', 'Client-Buyer', 'todo', '2026-12-01', '20000000-0000-4000-8000-000000000002', 'id_upload'),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', 'Upload ID', 'Client-Buyer', 'done', '2026-11-01', '20000000-0000-4000-8000-000000000003', 'id_upload'),
  ('10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000003', 'Upload ID', 'Client-Buyer', 'todo', '2026-11-01', '20000000-0000-4000-8000-000000000004', 'id_upload'),
  ('10000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000004', 'Payoff', 'Client-Seller', 'done', '2026-11-01', '20000000-0000-4000-8000-000000000005', 'payoff'),
  ('10000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000004', 'Payoff', 'Client-Seller', 'done', '2026-11-01', '20000000-0000-4000-8000-000000000006', 'payoff'),
  ('10000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-000000000005', 'Upload ID', 'Client-Buyer', 'cancelled', '2026-11-01', '20000000-0000-4000-8000-000000000007', 'id_upload'),
  ('10000000-0000-4000-8000-000000000008', '00000000-0000-4000-8000-000000000005', 'Upload ID', 'Client-Buyer', 'done', '2026-11-01', '20000000-0000-4000-8000-000000000008', 'id_upload'),
  ('10000000-0000-4000-8000-000000000009', '00000000-0000-4000-8000-000000000006', 'Collect contract', 'Processor', 'todo', '2026-11-01', null, null),
  ('10000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000007', 'Upload ID', 'Client-Buyer', 'done', '2026-11-01', '20000000-0000-4000-8000-000000000010', 'id_upload'),
  ('10000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000007', 'Upload ID', 'Client-Buyer', 'todo', '2026-12-01', '20000000-0000-4000-8000-000000000011', 'id_upload'),
  ('10000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000008', 'Commission', 'Buyer Agent', 'done', '2026-11-01', '20000000-0000-4000-8000-000000000012', 'commissions'),
  ('10000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000008', 'Commission', 'Buyer Agent', 'todo', '2026-11-01', '20000000-0000-4000-8000-000000000013', 'commissions');

do $check$
declare
  got record;
begin
  select * into got from public.dashboard_file_task_counts(array['00000000-0000-4000-8000-000000000001']::uuid[]);
  if got.open_tasks <> 2 or got.overdue_tasks <> 0 then
    raise exception 'two buyers, one finished, should stay open (2) and not overdue, got % / %', got.open_tasks, got.overdue_tasks;
  end if;

  select * into got from public.dashboard_file_task_counts(array['00000000-0000-4000-8000-000000000002']::uuid[]);
  if got.open_tasks <> 0 or got.overdue_tasks <> 0 then
    raise exception 'one buyer who finished should stay done, got % / %', got.open_tasks, got.overdue_tasks;
  end if;

  select * into got from public.dashboard_file_task_counts(array['00000000-0000-4000-8000-000000000003']::uuid[]);
  if got.open_tasks <> 1 or got.overdue_tasks <> 1 then
    raise exception 'one overdue buyer task should stay 1 open and 1 overdue, got % / %', got.open_tasks, got.overdue_tasks;
  end if;

  select * into got from public.dashboard_file_task_counts(array['00000000-0000-4000-8000-000000000004']::uuid[]);
  if got.open_tasks <> 0 then
    raise exception 'two sellers who both finished should be done, got %', got.open_tasks;
  end if;

  select * into got from public.dashboard_file_task_counts(array['00000000-0000-4000-8000-000000000005']::uuid[]);
  if got.open_tasks <> 0 then
    raise exception 'a cancelled second buyer should not keep a finished copy open, got %', got.open_tasks;
  end if;

  select * into got from public.dashboard_file_task_counts(array['00000000-0000-4000-8000-000000000006']::uuid[]);
  if got.open_tasks <> 1 or got.overdue_tasks <> 1 then
    raise exception 'a staff task should count as it does today, got % / %', got.open_tasks, got.overdue_tasks;
  end if;

  select * into got from public.dashboard_file_task_counts(array['00000000-0000-4000-8000-000000000007']::uuid[]);
  if got.open_tasks <> 2 or got.overdue_tasks <> 0 then
    raise exception 'a finished copy with a past due date is not overdue while the other buyer is still open, got % / %', got.open_tasks, got.overdue_tasks;
  end if;

  select * into got from public.dashboard_file_task_counts(array['00000000-0000-4000-8000-000000000008']::uuid[]);
  if got.open_tasks <> 1 or got.overdue_tasks <> 1 then
    raise exception 'agent copies should stay one open task when one agent has finished, got % / %', got.open_tasks, got.overdue_tasks;
  end if;

  select * into got from public.dashboard_file_task_counts(array['00000000-0000-4000-8000-000000000009']::uuid[]);
  if got.open_tasks <> 0 or got.overdue_tasks <> 0 then
    raise exception 'a file with no tasks should stay 0, got % / %', got.open_tasks, got.overdue_tasks;
  end if;
end
$check$;
