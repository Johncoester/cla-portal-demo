-- Checks for the unapplied workflows migration, against the local fixture only.
do $$
declare wf uuid; n int;
begin
  perform set_config('test.admin', 'on', false);
  perform set_config('test.staff', 'on', false);

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'tasks') then
    raise exception 'this migration must not create a tasks table';
  end if;

  wf := public.save_workflow(
    null, 'Processing — Purchase', 'Processor order', true, 'processing',
    jsonb_build_array(
      jsonb_build_object('key', 'a', 'task_template_id', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'position', 1, 'depends_on', null),
      jsonb_build_object('key', 'b', 'task_template_id', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'position', 2, 'depends_on', 'a'),
      jsonb_build_object('key', 'c', 'task_template_id', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'position', 3, 'depends_on', 'a')
    ),
    jsonb_build_array(jsonb_build_object('role', 'Processor', 'file_type', 'Purchase', 'state', 'md'))
  );
  if wf is null then raise exception 'save returned null'; end if;
  if (select state from public.workflow_assignments where workflow_id = wf) <> 'MD' then
    raise exception 'state was not stored in capitals';
  end if;
  if (select count(*) from public.workflow_steps where workflow_id = wf) <> 3 then
    raise exception 'expected 3 steps';
  end if;
  if (select count(distinct depends_on) from public.workflow_steps where workflow_id = wf and position > 1) <> 1 then
    raise exception 'side-by-side steps should share one parent';
  end if;

  begin
    perform public.save_workflow(null, 'Clash', '', true, 'processing', '[]'::jsonb,
      jsonb_build_array(jsonb_build_object('role', 'Processor', 'file_type', 'Purchase', 'state', 'MD')));
    raise exception 'duplicate assignment was allowed';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%already applies%' then raise exception 'unexpected clash error: %', sqlerrm; end if;
  end;

  begin
    perform public.save_workflow(null, 'Loop', '', true, 'client',
      jsonb_build_array(
        jsonb_build_object('key', 'a', 'task_template_id', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'position', 1, 'depends_on', 'b'),
        jsonb_build_object('key', 'b', 'task_template_id', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'position', 2, 'depends_on', 'a')
      ), '[]'::jsonb);
    raise exception 'a later dependency was allowed';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%earlier step%' then raise exception 'unexpected dependency error: %', sqlerrm; end if;
  end;

  begin
    perform public.save_workflow(null, 'Old', '', true, 'client',
      jsonb_build_array(jsonb_build_object('key', 'a', 'task_template_id', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'position', 1, 'depends_on', null)),
      '[]'::jsonb);
    raise exception 'a retired template was allowed';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%retired%' then raise exception 'unexpected retired error: %', sqlerrm; end if;
  end;

  perform set_config('test.admin', 'off', false);
  begin
    perform public.save_workflow(null, 'Denied', '', true, 'client', '[]'::jsonb, '[]'::jsonb);
    raise exception 'a non-admin save was allowed';
  exception when insufficient_privilege then
    null;
  end;

  if (select proconfig::text from pg_proc where proname = 'save_workflow') not like '%pg_catalog%' then
    raise exception 'save_workflow search_path was not locked';
  end if;
end $$;

do $$
declare n int;
begin
  perform set_config('test.admin', 'off', false);
  perform set_config('test.staff', 'on', false);
  execute 'set role authenticated';
  select count(*) into n from public.workflows;
  if n <> 1 then raise exception 'staff should read workflows, got %', n; end if;
  begin
    insert into public.workflows (name, audience) values ('Nope', 'client');
    raise exception 'staff insert was allowed';
  exception when insufficient_privilege then
    null;
  end;
  perform set_config('test.staff', 'off', false);
  select count(*) into n from public.workflows;
  if n <> 0 then raise exception 'someone who is not staff should see no workflows, got %', n; end if;
  execute 'reset role';
end $$;

do $$
begin
  execute 'set role anon';
  begin
    perform 1 from public.workflows;
    raise exception 'anon could read workflows';
  exception when insufficient_privilege then
    null;
  end;
  execute 'reset role';
end $$;
