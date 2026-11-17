-- People preview with private.crm_person_dup installed. Local scratch only.

do $plan$
declare buf text := ''; rec record;
begin
  for rec in
    explain (analyze, buffers)
    select l.id from public.crm_leads l
     where l.converted_at is null and l.archived_at is null and l.email <> ''
       and lower(l.email) = lower(btrim('scale-50000@scale.example.test'))
       and l.id is distinct from '00000000-0000-4000-8000-00000000d001'::uuid
       and l.id is distinct from null
     limit 1
  loop
    buf := buf || rec."QUERY PLAN" || E'\n';
  end loop;
  insert into public.scratch_log(label, plan) values ('explain_dup_email', buf);
  if buf !~ 'crm_leads_open_email_uq' then
    raise exception 'person dup email plan is not crm_leads_open_email_uq: %', buf;
  end if;

  buf := '';
  for rec in
    explain (analyze, buffers)
    select l.id from public.crm_leads l
     where l.converted_at is null and l.archived_at is null
       and char_length(regexp_replace(l.phone, '\D', '', 'g')) >= 7
       and regexp_replace(l.phone, '\D', '', 'g') = '9000050000'
       and l.id is distinct from '00000000-0000-4000-8000-00000000d001'::uuid
       and l.id is distinct from null
     limit 1
  loop
    buf := buf || rec."QUERY PLAN" || E'\n';
  end loop;
  insert into public.scratch_log(label, plan) values ('explain_dup_phone', buf);
  if buf !~ 'crm_leads_dup_phone_idx' then
    raise exception 'person dup phone plan is not crm_leads_dup_phone_idx: %', buf;
  end if;
end
$plan$;

do $small$
declare t0 timestamptz := clock_timestamp(); r jsonb;
begin
  r := public.crm_import_batch(false, 'leads', 'records', 'people-small.csv', '[]'::jsonb,
    (select rows from public.scratch_payload where name = 'people'));
  insert into public.scratch_log(label, ms, detail, body)
  values ('people_small_before', round(1000 * extract(epoch from clock_timestamp() - t0), 3), r->'counts', r->'rows');
  if not exists (
    select 1 from jsonb_array_elements(r->'rows') e(value)
    where (value->>'line')::int = 2 and value->>'status' = 'duplicate' and value->>'message' ilike '%already used%'
  ) then
    raise exception 'duplicate person did not come from crm_person_dup: %', r->'rows';
  end if;
end
$small$;

do $tenk$
declare
  t0 timestamptz := clock_timestamp();
  i int;
  r jsonb;
  rows jsonb;
  ok int := 0;
  dup int := 0;
  err int := 0;
  sample jsonb;
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
    if err > 0 and sample is null then
      select value into sample from jsonb_array_elements(r->'rows') e(value) where value->>'status' = 'error' limit 1;
    end if;
  end loop;
  insert into public.scratch_log(label, ms, detail)
  values ('people_10000_before', round(1000 * extract(epoch from clock_timestamp() - t0), 3),
    jsonb_build_object('ok', ok, 'duplicates', dup, 'errors', err, 'total', ok + dup + err, 'sample', sample));
  if ok <> 10000 or dup <> 0 or err <> 0 then
    raise exception '10000-row people preview before: %', (select detail from public.scratch_log where label = 'people_10000_before');
  end if;
end
$tenk$;
