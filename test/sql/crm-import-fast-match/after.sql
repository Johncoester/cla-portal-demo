-- New function. Compare every preview row to the old function, then time again.

analyze public.crm_leads;
analyze public.contacts;
discard plans;

do $notes$
declare t0 timestamptz := clock_timestamp(); r jsonb;
begin
  r := public.crm_import_batch(false, 'leads', 'notes', 'notes.csv', '[]'::jsonb,
    (select rows from public.scratch_payload where name = 'notes'));
  insert into public.scratch_log(label, ms, detail, body)
  values ('notes_after', round(1000 * extract(epoch from clock_timestamp() - t0), 3), r->'counts', r->'rows');
end
$notes$;

do $clients$
declare t0 timestamptz := clock_timestamp(); r jsonb;
begin
  r := public.crm_import_batch(false, 'contacts', 'notes', 'clients.csv', '[]'::jsonb,
    (select rows from public.scratch_payload where name = 'clients'));
  insert into public.scratch_log(label, ms, detail, body)
  values ('clients_after', round(1000 * extract(epoch from clock_timestamp() - t0), 3), r->'counts', r->'rows');
end
$clients$;

do $people$
declare t0 timestamptz := clock_timestamp(); r jsonb;
begin
  r := public.crm_import_batch(false, 'leads', 'records', 'people-small.csv', '[]'::jsonb,
    (select rows from public.scratch_payload where name = 'people'));
  insert into public.scratch_log(label, ms, detail, body)
  values ('people_small_after', round(1000 * extract(epoch from clock_timestamp() - t0), 3), r->'counts', r->'rows');
end
$people$;

do $same$
declare
  bad_before jsonb;
  bad_after jsonb;
begin
  select b.value, a.value into bad_before, bad_after
  from jsonb_array_elements((select body from public.scratch_log where label = 'notes_before')) with ordinality b(value, n)
  join jsonb_array_elements((select body from public.scratch_log where label = 'notes_after')) with ordinality a(value, n) using (n)
  where b.value is distinct from a.value
  limit 1;
  if bad_before is not null then
    raise exception 'note row changed. before % after %', bad_before, bad_after;
  end if;
  select b.value, a.value into bad_before, bad_after
  from jsonb_array_elements((select body from public.scratch_log where label = 'clients_before')) with ordinality b(value, n)
  join jsonb_array_elements((select body from public.scratch_log where label = 'clients_after')) with ordinality a(value, n) using (n)
  where b.value is distinct from a.value
  limit 1;
  if bad_before is not null then
    raise exception 'client note row changed. before % after %', bad_before, bad_after;
  end if;
  -- A new person gets a new id. Compare the row the user reads, not that id.
  select b.value - 'id' - 'link', a.value - 'id' - 'link' into bad_before, bad_after
  from jsonb_array_elements((select body from public.scratch_log where label = 'people_small_before')) with ordinality b(value, n)
  join jsonb_array_elements((select body from public.scratch_log where label = 'people_small_after')) with ordinality a(value, n) using (n)
  where (b.value - 'id' - 'link') is distinct from (a.value - 'id' - 'link')
  limit 1;
  if bad_before is not null then
    raise exception 'people row changed. before % after %', bad_before, bad_after;
  end if;
end
$same$;

do $equiv$
declare
  mismatches int;
begin
  with emails as (
    select 'scale-' || g || '@scale.example.test' as em from generate_series(1, 500) g
    union all select 'scale-50000@scale.example.test'
    union all select 'scale-109999@scale.example.test'
    union all select lower(email) from public.crm_leads where notes = 'TEST-TIE' and email not like ' %'
    union all select 'spaced@tie.example.test'
    union all select 'nobody@tie.example.test'
    union all select 'case@tie.example.test'
  ),
  picked as (
    select distinct on (lower(l.email))
      lower(l.email) as em,
      l.id
    from public.crm_leads l
    where lower(l.email) in (select em from emails)
    order by lower(l.email), (l.archived_at is null) desc, l.created_at
  )
  select count(*) into mismatches
  from emails e
  left join picked p on p.em = e.em
  where p.id is distinct from (
    select l.id from public.crm_leads l
    where lower(l.email) = e.em
    order by (l.archived_at is null) desc, l.created_at
    limit 1
  );
  if mismatches <> 0 then
    raise exception 'email tie-break mismatch on % addresses', mismatches;
  end if;

  if (select id from public.crm_leads where lower(email) = 'open-beats-older@tie.example.test'
      order by (archived_at is null) desc, created_at limit 1)
     is distinct from 'a1111111-1111-4111-8111-111111111111'::uuid then
    raise exception 'open lead did not beat archived copies';
  end if;
  if (select id from public.crm_leads where lower(email) = 'earliest-archived@tie.example.test'
      order by (archived_at is null) desc, created_at limit 1)
     is distinct from 'b1111111-1111-4111-8111-111111111111'::uuid then
    raise exception 'earliest archived lead was not chosen';
  end if;
  if (select id from public.crm_leads where lower(email) = 'open-null-created@tie.example.test'
      order by (archived_at is null) desc, created_at limit 1)
     is distinct from 'c1111111-1111-4111-8111-111111111111'::uuid then
    raise exception 'open lead was not chosen over an older archived lead';
  end if;

  -- created_at is NOT NULL on crm_leads. This side table is only here so a null
  -- created_at still sorts last, the same way in both queries.
  create temp table scratch_nulls (id int, email text, archived_at timestamptz, created_at timestamptz);
  insert into scratch_nulls values
    (1, 'n@x', timestamp '2018-01-01', null),
    (2, 'n@x', timestamp '2018-01-01', timestamp '2015-01-01'),
    (3, 'n@x', null, timestamp '2030-01-01');
  if (select id from scratch_nulls order by (archived_at is null) desc, created_at limit 1) <> 3
     or (select id from (
           select distinct on (email) id from scratch_nulls
           order by email, (archived_at is null) desc, created_at
         ) s) <> 3 then
    raise exception 'distinct on did not keep the open row when created_at is null on another row';
  end if;
  if (select id from scratch_nulls where archived_at is not null order by created_at limit 1) <> 2
     or (select id from (
           select distinct on (email) id from scratch_nulls where archived_at is not null
           order by email, (archived_at is null) desc, created_at
         ) s) <> 2 then
    raise exception 'a null created_at did not sort last';
  end if;
end
$equiv$;

do $loop$
declare t0 timestamptz := clock_timestamp(); i int; r uuid;
begin
  for i in 1..500 loop
    select l.id into r from public.crm_leads l
    where lower(l.email) = 'scale-' || i || '@scale.example.test'
    order by (l.archived_at is null) desc, l.created_at
    limit 1;
  end loop;
  insert into public.scratch_log(label, ms)
  values ('lookup_loop_after', round(1000 * extract(epoch from clock_timestamp() - t0), 3));
end
$loop$;

do $plan$
declare buf text := ''; rec record;
begin
  for rec in
    explain (analyze, buffers)
    select l.id from public.crm_leads l
    where lower(l.email) = 'scale-50000@scale.example.test'
    order by (l.archived_at is null) desc, l.created_at
    limit 1
  loop
    buf := buf || rec."QUERY PLAN" || E'\n';
  end loop;
  insert into public.scratch_log(label, plan) values ('explain_one_after', buf);
  if buf !~ 'crm_leads_import_email_idx' or buf ~* 'Seq Scan' then
    raise exception 'single-row note match did not use crm_leads_import_email_idx: %', buf;
  end if;

  buf := '';
  for rec in
    explain (analyze, buffers)
    select distinct on (lower(l.email)) lower(l.email) as em, l.id
    from public.crm_leads l
    where lower(l.email) in (
      select 'scale-' || g || '@scale.example.test' from generate_series(1, 500) g
    )
    order by lower(l.email), (l.archived_at is null) desc, l.created_at
  loop
    buf := buf || rec."QUERY PLAN" || E'\n';
  end loop;
  insert into public.scratch_log(label, plan) values ('explain_set_after', buf);
end
$plan$;

do $tenk$
declare
  t0 timestamptz := clock_timestamp();
  i int;
  r jsonb;
  rows jsonb;
  ok int := 0;
  dup int := 0;
  err int := 0;
begin
  for i in 0..19 loop
    select jsonb_agg(jsonb_build_object(
      'line', g,
      'values', jsonb_build_object(
        'firstName', 'New',
        'lastName', 'Person ' || g,
        'email', 'person-' || g || '@people.example.test',
        'phone', (9100000000 + g)::text,
        'roleInCompany', 'Realtor',
        'relationshipStatus', 'Prospecting',
        'state', 'MD'
      )
    ) order by g)
    into rows
    from generate_series(i * 500 + 1, i * 500 + 500) g;
    r := public.crm_import_batch(false, 'leads', 'records', 'people.csv', '[]'::jsonb, rows);
    ok := ok + coalesce((r->'counts'->>'ok')::int, 0);
    dup := dup + coalesce((r->'counts'->>'duplicates')::int, 0);
    err := err + coalesce((r->'counts'->>'errors')::int, 0);
  end loop;
  insert into public.scratch_log(label, ms, detail)
  values ('people_10000_after', round(1000 * extract(epoch from clock_timestamp() - t0), 3),
    jsonb_build_object('ok', ok, 'duplicates', dup, 'errors', err, 'total', ok + dup + err));
  if (select detail - 'sample' from public.scratch_log where label = 'people_10000_before')
     is distinct from (select detail from public.scratch_log where label = 'people_10000_after') then
    raise exception '10000-row people counts changed. before % after %',
      (select detail from public.scratch_log where label = 'people_10000_before'),
      (select detail from public.scratch_log where label = 'people_10000_after');
  end if;
end
$tenk$;

do $speed$
declare note_ms numeric; set_ms numeric;
begin
  select ms into note_ms from public.scratch_log where label = 'notes_after';
  if note_ms >= 1000 then
    raise exception '500-row note preview took % ms', note_ms;
  end if;
  select substring(plan from 'Execution Time: ([0-9.]+) ms')::numeric into set_ms
  from public.scratch_log where label = 'explain_set_after';
  if set_ms is null or set_ms >= 1000 then
    raise exception 'set-based match took % ms', set_ms;
  end if;
end
$speed$;

begin;
select public.crm_import_batch(true, 'leads', 'notes', 'one.csv', '[]'::jsonb,
  jsonb_build_array(jsonb_build_object(
    'line', 1,
    'values', jsonb_build_object('email', 'open-beats-older@tie.example.test', 'note', 'Saved note', 'noteTitle', 'Saved')
  )));
do $commit$
begin
  if (select count(*) from public.crm_activities where body = 'Saved note' and entity_id = 'a1111111-1111-4111-8111-111111111111') <> 1 then
    raise exception 'commit did not attach the note to the open lead';
  end if;
  if (select count(*) from public.crm_leads) < 110000 then
    raise exception 'commit changed the lead count';
  end if;
end
$commit$;
rollback;
