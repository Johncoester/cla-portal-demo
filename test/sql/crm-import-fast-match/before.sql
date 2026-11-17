-- Old function, before the fast-match migration. Local scratch only.

do $loop$
declare
  t0 timestamptz := clock_timestamp();
  i int;
  r uuid;
begin
  for i in 1..500 loop
    select l.id into r
    from public.crm_leads l
    where lower(l.email) = 'scale-' || i || '@scale.example.test'
    order by (l.archived_at is null) desc, l.created_at
    limit 1;
    if r is null then raise exception 'lookup missed scale-%', i; end if;
  end loop;
  insert into public.scratch_log(label, ms)
  values ('lookup_loop_before', round(1000 * extract(epoch from clock_timestamp() - t0), 3));
end
$loop$;

do $plan$
declare buf text := ''; rec record;
begin
  for rec in
    explain (analyze, buffers)
    select l.id
    from public.crm_leads l
    where lower(l.email) = 'scale-50000@scale.example.test'
    order by (l.archived_at is null) desc, l.created_at
    limit 1
  loop
    buf := buf || rec."QUERY PLAN" || E'\n';
  end loop;
  insert into public.scratch_log(label, plan) values ('explain_one_before', buf);
end
$plan$;

do $notes$
declare t0 timestamptz := clock_timestamp(); r jsonb;
begin
  r := public.crm_import_batch(false, 'leads', 'notes', 'notes.csv', '[]'::jsonb,
    (select rows from public.scratch_payload where name = 'notes'));
  insert into public.scratch_log(label, ms, detail, body)
  values ('notes_before', round(1000 * extract(epoch from clock_timestamp() - t0), 3), r->'counts', r->'rows');
end
$notes$;

do $clients$
declare t0 timestamptz := clock_timestamp(); r jsonb;
begin
  r := public.crm_import_batch(false, 'contacts', 'notes', 'clients.csv', '[]'::jsonb,
    (select rows from public.scratch_payload where name = 'clients'));
  insert into public.scratch_log(label, ms, detail, body)
  values ('clients_before', round(1000 * extract(epoch from clock_timestamp() - t0), 3), r->'counts', r->'rows');
end
$clients$;

do $check$
declare
  rec record;
  got jsonb;
  notes text;
begin
  if (select detail->>'total' from public.scratch_log where label = 'notes_before') <> '500' then
    raise exception 'note preview total %', (select detail from public.scratch_log where label = 'notes_before');
  end if;
  for rec in select * from public.scratch_note_case order by line loop
    select value into got
    from jsonb_array_elements((select body from public.scratch_log where label = 'notes_before')) e(value)
    where (value->>'line')::int = rec.line;
    if got is null then raise exception 'missing note line %', rec.line; end if;
    if got->>'status' is distinct from rec.expect_status then
      raise exception 'line % status [%] message [%] expected %', rec.line, got->>'status', got->>'message', rec.expect_status;
    end if;
    if got->>'message' is distinct from rec.expect_message then
      raise exception 'line % message [%] expected [%]', rec.line, got->>'message', rec.expect_message;
    end if;
    if rec.expect_id is null then
      if got->>'id' is not null then raise exception 'line % should have no id, got %', rec.line, got->>'id'; end if;
    elsif (got->>'id')::uuid is distinct from rec.expect_id then
      raise exception 'line % id % expected % name %', rec.line, got->>'id', rec.expect_id, got->>'name';
    end if;
  end loop;
  select (value->'notes')::text into notes
  from jsonb_array_elements((select body from public.scratch_log where label = 'notes_before')) e(value)
  where (value->>'line')::int = 471;
  if notes is distinct from '["linked by email"]' then raise exception 'open lead note text %', notes; end if;
  select (value->'notes')::text into notes
  from jsonb_array_elements((select body from public.scratch_log where label = 'notes_before')) e(value)
  where (value->>'line')::int = 472;
  if notes is distinct from '["on an archived lead"]' then raise exception 'archived lead note text %', notes; end if;
  -- An email that matches nobody still says "linked by email" when the name matches.
  -- That wording is the existing rule: the label follows the typed email, not which column hit.
  select (value->'notes')::text into notes
  from jsonb_array_elements((select body from public.scratch_log where label = 'notes_before')) e(value)
  where (value->>'line')::int = 475;
  if notes is distinct from '["linked by email"]' then raise exception 'missed-email name note text %', notes; end if;
  select (value->'notes')::text into notes
  from jsonb_array_elements((select body from public.scratch_log where label = 'notes_before')) e(value)
  where (value->>'line')::int = 479;
  if notes is distinct from '["linked by name"]' then raise exception 'name-only note text %', notes; end if;
  select (value->'notes')::text into notes
  from jsonb_array_elements((select body from public.scratch_log where label = 'notes_before')) e(value)
  where (value->>'line')::int = 481;
  if notes is distinct from '["on an archived lead"]' then raise exception 'archived name note text %', notes; end if;

  if (select count(*) from jsonb_array_elements((select body from public.scratch_log where label = 'clients_before'))) <> 9 then
    raise exception 'client preview row count';
  end if;
  perform 1 from jsonb_array_elements((select body from public.scratch_log where label = 'clients_before')) e(value)
  where (value->>'line')::int = 1 and (value->>'id')::uuid = 'c1111111-aaaa-4111-8111-111111111111' and value->'notes' = '["linked by email"]'::jsonb;
  if not found then raise exception 'client open winner wrong'; end if;
  perform 1 from jsonb_array_elements((select body from public.scratch_log where label = 'clients_before')) e(value)
  where (value->>'line')::int = 2 and (value->>'id')::uuid = 'c3333333-aaaa-4333-8333-333333333333' and value->'notes' = '["on an archived contact"]'::jsonb;
  if not found then raise exception 'client earliest archived wrong'; end if;
  perform 1 from jsonb_array_elements((select body from public.scratch_log where label = 'clients_before')) e(value)
  where (value->>'line')::int = 3 and (value->>'id')::uuid = 'c5555555-aaaa-4555-8555-555555555555';
  if not found then raise exception 'client earliest created_at should win'; end if;
  perform 1 from jsonb_array_elements((select body from public.scratch_log where label = 'clients_before')) e(value)
  where (value->>'line')::int = 4 and (value->>'id')::uuid = 'c7777777-aaaa-4777-8777-777777777777' and value->'notes' = '["linked by email"]'::jsonb;
  if not found then raise exception 'client email should win over an ambiguous name'; end if;
  perform 1 from jsonb_array_elements((select body from public.scratch_log where label = 'clients_before')) e(value)
  where (value->>'line')::int = 5 and value->>'message' = '2 clients are named "pat dup"; add the email to pick one.';
  if not found then raise exception 'client ambiguous name message changed'; end if;
  perform 1 from jsonb_array_elements((select body from public.scratch_log where label = 'clients_before')) e(value)
  where (value->>'line')::int = 6 and (value->>'id')::uuid = 'c9999999-aaaa-4999-8999-999999999999' and value->'notes' = '["linked by name"]'::jsonb;
  if not found then raise exception 'client name match wrong'; end if;
  perform 1 from jsonb_array_elements((select body from public.scratch_log where label = 'clients_before')) e(value)
  where (value->>'line')::int = 7 and value->'notes' = '["on an archived contact"]'::jsonb;
  if not found then raise exception 'archived client name wrong'; end if;
  perform 1 from jsonb_array_elements((select body from public.scratch_log where label = 'clients_before')) e(value)
  where (value->>'line')::int = 8 and value->>'message' = 'No client has the email nobody@client.example.test.';
  if not found then raise exception 'client missing email message changed'; end if;
  perform 1 from jsonb_array_elements((select body from public.scratch_log where label = 'clients_before')) e(value)
  where (value->>'line')::int = 9 and value->>'message' = 'Give the email or the name of the client for this note.';
  if not found then raise exception 'client blank message changed'; end if;
end
$check$;
