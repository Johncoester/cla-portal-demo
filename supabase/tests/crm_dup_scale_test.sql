-- Rolled-back scale check for private.crm_person_dup().
-- Not a migration. Run with psql against a database that already has the CRM
-- lead table and the indexed function (migration 20261110040000). The whole
-- script is one transaction and ends in ROLLBACK, so the TEST-SEED-SCALE rows
-- are never kept.
--
-- It inserts 110000 fake leads, then times one more lead insert and one
-- 500-row insert. Role in Company, Relationship Status, and State are filled
-- (role_in_company Realtor, status Prospecting, crm_state MD). Emails are
-- @scale.example.test. Phones are 10-digit numbers from 9000000001 upward.
-- Notes are the tag TEST-SEED-SCALE.
--
-- Planner statistics ignore rows inserted in this transaction, and a PL/pgSQL
-- trigger caches its first plan. With the table still looking empty, that plan
-- would be a sequential scan and the timing would not measure the index.
-- enable_seqscan is off for that reason, and cached plans are discarded first.
-- The EXPLAIN ANALYZE statements must name the email and phone indexes.
-- To see the planner choose those indexes with sequential scans left on, load
-- the rows in a throwaway database, COMMIT, ANALYZE, DISCARD PLANS, and EXPLAIN
-- again. Do not do that on TEST.

\set ON_ERROR_STOP on
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15min';
set local enable_seqscan = off;
discard plans;

do $guard$
begin
  if to_regclass('public.crm_leads') is null then
    raise exception 'refusing: public.crm_leads is missing';
  end if;
  if to_regclass('public.crm_leads_dup_phone_idx') is null
     or to_regclass('public.contacts_dup_phone_idx') is null then
    raise exception 'refusing: phone duplicate indexes are not installed';
  end if;
  if exists (select 1 from public.crm_leads where notes = 'TEST-SEED-SCALE' or email like '%@scale.example.test')
     or exists (select 1 from public.contacts where email like '%@scale.example.test') then
    raise exception 'refusing: TEST-SEED-SCALE rows are already stored';
  end if;
  if exists (
    select 1 from public.crm_leads
    where regexp_replace(phone, '\D', '', 'g') between '9000000001' and '9000110501'
  ) or exists (
    select 1 from public.contacts
    where regexp_replace(phone, '\D', '', 'g') between '9000000001' and '9000110501'
  ) then
    raise exception 'refusing: the 9000000001 phone range is already in use';
  end if;
end
$guard$;

do $load$
declare
  t0 timestamptz;
  t1 timestamptz;
  n bigint;
begin
  t0 := clock_timestamp();
  insert into public.crm_leads (first_name, last_name, email, phone, status, role_in_company, crm_state, notes)
  select 'Scale', 'Lead ' || g, 'scale-' || g || '@scale.example.test', (9000000000 + g)::text,
         'Prospecting', 'Realtor', 'MD', 'TEST-SEED-SCALE'
    from generate_series(1, 110000) as g;
  get diagnostics n = row_count;
  t1 := clock_timestamp();
  if n <> 110000 then raise exception 'bulk insert wrote % rows', n; end if;
  raise notice 'crm_dup_scale bulk_rows=% bulk_ms=%', n, round(1000 * extract(epoch from t1 - t0), 3);

  t0 := clock_timestamp();
  insert into public.crm_leads (first_name, last_name, email, phone, status, role_in_company, crm_state, notes)
  values ('Scale', 'Lead probe', 'scale-110001@scale.example.test', '9000110001',
          'Prospecting', 'Realtor', 'MD', 'TEST-SEED-SCALE');
  t1 := clock_timestamp();
  raise notice 'crm_dup_scale single_insert_ms=%', round(1000 * extract(epoch from t1 - t0), 3);

  t0 := clock_timestamp();
  insert into public.crm_leads (first_name, last_name, email, phone, status, role_in_company, crm_state, notes)
  select 'Scale', 'Lead ' || g, 'scale-' || g || '@scale.example.test', (9000000000 + g)::text,
         'Prospecting', 'Realtor', 'MD', 'TEST-SEED-SCALE'
    from generate_series(110002, 110501) as g;
  get diagnostics n = row_count;
  t1 := clock_timestamp();
  if n <> 500 then raise exception 'chunk insert wrote % rows', n; end if;
  raise notice 'crm_dup_scale chunk_500_ms=%', round(1000 * extract(epoch from t1 - t0), 3);
end
$load$;

do $plan$
declare
  rec record;
  buf text;
begin
  buf := '';
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
  raise notice 'crm_dup_scale plan lead_email:%', buf;
  if buf ~* 'Seq Scan on (public\.)?crm_leads' or buf not like '%crm_leads_open_email_uq%' then
    raise exception 'lead email plan is not crm_leads_open_email_uq:%', buf;
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
  raise notice 'crm_dup_scale plan lead_phone:%', buf;
  if buf ~* 'Seq Scan on (public\.)?crm_leads' or buf not like '%crm_leads_dup_phone_idx%' or buf ilike '%trgm%' then
    raise exception 'lead phone plan is not crm_leads_dup_phone_idx:%', buf;
  end if;

  buf := '';
  for rec in
    explain (analyze, buffers)
    select c.id from public.contacts c
     where c.crm_archived_at is null and c.email <> ''
       and lower(c.email) = lower(btrim('scale-50000@scale.example.test'))
       and c.id is distinct from null
       and private.crm_in_pool(c.id)
     limit 1
  loop
    buf := buf || rec."QUERY PLAN" || E'\n';
  end loop;
  raise notice 'crm_dup_scale plan client_email:%', buf;
  if buf ~* 'Seq Scan on (public\.)?contacts' or buf not like '%contacts_email_uq%' then
    raise exception 'client email plan is not contacts_email_uq:%', buf;
  end if;

  buf := '';
  for rec in
    explain (analyze, buffers)
    select c.id from public.contacts c
     where c.crm_archived_at is null
       and char_length(regexp_replace(c.phone, '\D', '', 'g')) >= 7
       and regexp_replace(c.phone, '\D', '', 'g') = '9000050000'
       and c.id is distinct from null
       and private.crm_in_pool(c.id)
     limit 1
  loop
    buf := buf || rec."QUERY PLAN" || E'\n';
  end loop;
  raise notice 'crm_dup_scale plan client_phone:%', buf;
  if buf ~* 'Seq Scan on (public\.)?contacts' or buf not like '%contacts_dup_phone_idx%' or buf ilike '%trgm%' then
    raise exception 'client phone plan is not contacts_dup_phone_idx:%', buf;
  end if;
end
$plan$;

do $count$
declare n bigint;
begin
  select count(*) into n from public.crm_leads where notes = 'TEST-SEED-SCALE';
  if n <> 110501 then raise exception 'expected 110501 tagged leads, found %', n; end if;
  raise notice 'crm_dup_scale tagged_leads=% (rolled back)', n;
end
$count$;

rollback;
