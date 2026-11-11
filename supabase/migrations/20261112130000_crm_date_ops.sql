-- CRM date operators (JN-48). NOT applied to hosted TEST (aqcervntopidtcazcmlv).
-- Replaces public.crm_date_bounds only. crm_match_ids already compares the bare
-- column to bounds computed once, so Created Time and the other ranges stay sargable.
-- Weeks start on Sunday. Months use calendar intervals in America/New_York.
-- Drift: md5 of the JN-47 function, read on scratch after 20261112120000.
--   public.crm_date_bounds(jsonb, timestamptz) 268485523c31ac857f1b1b82c76e75c1
-- Rollback: supabase/rollbacks/20261112130000_crm_date_ops.sql

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

do $guard$
declare
  got text;
begin
  if to_regprocedure('public.crm_date_bounds(jsonb, timestamptz)') is null then
    raise exception 'drift: public.crm_date_bounds(jsonb, timestamptz) is missing';
  end if;
  if to_regprocedure('public.crm_match_ids(text, jsonb)') is null then
    raise exception 'drift: public.crm_match_ids(text, jsonb) is missing';
  end if;
  got := md5(pg_get_functiondef('public.crm_date_bounds(jsonb, timestamptz)'::regprocedure));
  if got is distinct from '268485523c31ac857f1b1b82c76e75c1' then
    raise exception 'drift: public.crm_date_bounds(jsonb, timestamptz) md5 %', got;
  end if;
end
$guard$;

create or replace function public.crm_date_bounds(p_spec jsonb, p_now timestamptz default now())
returns table(mode text, lo timestamptz, hi timestamptz, lo_date date, hi_date date)
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
  op text;
  unit text;
  n int;
  span int;
  today date;
  tomorrow date;
  yesterday date;
  d0 date;
  d1 date;
  start_d date;
  end_d date;
  swap date;
begin
  mode := 'none'; lo := null; hi := null; lo_date := null; hi_date := null;
  if p_spec is null or jsonb_typeof(p_spec) <> 'object' then return next; return; end if;
  op := coalesce(p_spec->>'op', '');
  today := (p_now at time zone 'America/New_York')::date;
  tomorrow := today + 1;
  yesterday := today - 1;
  if op = '' then
    begin
      d0 := nullif(p_spec->>'from', '')::date;
      d1 := nullif(p_spec->>'to', '')::date;
    exception when others then return next; return; end;
    if d0 is null and d1 is null then return next; return; end if;
    if d0 is null then d0 := d1; end if;
    if d1 is null then d1 := d0; end if;
    op := 'between';
  end if;
  if op = 'empty' then mode := 'empty'; return next; return; end if;
  if op = 'not_empty' then mode := 'present'; return next; return; end if;
  if op in ('age_in', 'due_in', 'prev_n', 'next_n') then
    unit := coalesce(nullif(p_spec->>'unit', ''), 'days');
    if unit not in ('days', 'weeks', 'months') then return next; return; end if;
    begin n := nullif(p_spec->>'n', '')::int; exception when others then return next; return; end;
    if n is null or n < 1 then return next; return; end if;
    if (unit = 'days' and n > 3650) or (unit = 'weeks' and n > 520) or (unit = 'months' and n > 240) then return next; return; end if;
    span := case when unit = 'weeks' then n * 7 else n end;
  end if;
  if op in ('on', 'before', 'after', 'between', 'not_between') then
    begin
      d0 := coalesce(nullif(p_spec->>'value', ''), nullif(p_spec->>'from', ''))::date;
      d1 := coalesce(nullif(p_spec->>'value2', ''), nullif(p_spec->>'to', ''))::date;
    exception when others then return next; return; end;
    if op in ('on', 'before', 'after') and d0 is null then return next; return; end if;
    if op in ('between', 'not_between') and (d0 is null or d1 is null) then return next; return; end if;
    if d0 is not null and d1 is not null and d1 < d0 then swap := d0; d0 := d1; d1 := swap; end if;
  end if;
  if op = 'today' then start_d := today; end_d := tomorrow;
  elsif op = 'tomorrow' then start_d := tomorrow; end_d := tomorrow + 1;
  elsif op = 'yesterday' then start_d := yesterday; end_d := today;
  elsif op = 'till_yesterday' then start_d := null; end_d := today;
  elsif op = 'starting_tomorrow' then start_d := tomorrow; end_d := null;
  elsif op = 'this_week' then start_d := today - extract(dow from today)::int; end_d := start_d + 7;
  elsif op = 'prev_week' then end_d := today - extract(dow from today)::int; start_d := end_d - 7;
  elsif op = 'this_month' then start_d := date_trunc('month', today)::date; end_d := (start_d + interval '1 month')::date;
  elsif op = 'prev_month' then end_d := date_trunc('month', today)::date; start_d := (end_d - interval '1 month')::date;
  elsif op = 'this_year' then start_d := date_trunc('year', today)::date; end_d := (start_d + interval '1 year')::date;
  elsif op = 'next_year' then start_d := (date_trunc('year', today)::date + interval '1 year')::date; end_d := (start_d + interval '1 year')::date;
  elsif op = 'on' then start_d := d0; end_d := d0 + 1;
  elsif op = 'before' then start_d := null; end_d := d0;
  elsif op = 'after' then start_d := d0 + 1; end_d := null;
  elsif op in ('between', 'not_between') then start_d := d0; end_d := d1 + 1;
  elsif op = 'prev_n' and unit = 'months' then end_d := date_trunc('month', today)::date; start_d := (end_d - make_interval(months => n))::date;
  elsif op = 'next_n' and unit = 'months' then start_d := (date_trunc('month', today)::date + interval '1 month')::date; end_d := (start_d + make_interval(months => n))::date;
  elsif op = 'age_in' and unit = 'months' then start_d := (today - make_interval(months => n))::date; end_d := tomorrow;
  elsif op = 'due_in' and unit = 'months' then start_d := today; end_d := ((today + make_interval(months => n))::date + 1);
  elsif op = 'age_in' then start_d := today - (span - 1); end_d := tomorrow;
  elsif op = 'due_in' then start_d := today; end_d := today + span;
  elsif op = 'prev_n' then start_d := today - span; end_d := today;
  elsif op = 'next_n' then start_d := tomorrow; end_d := tomorrow + span;
  else return next; return;
  end if;
  mode := case when op = 'not_between' then 'outside' else 'range' end;
  if start_d is not null then lo := start_d::timestamp at time zone 'America/New_York'; lo_date := start_d; end if;
  if end_d is not null then hi := end_d::timestamp at time zone 'America/New_York'; hi_date := end_d; end if;
  return next;
end
$$;

revoke all on function public.crm_date_bounds(jsonb, timestamptz) from public, anon;
grant execute on function public.crm_date_bounds(jsonb, timestamptz) to authenticated;

create or replace function public.crm_list_page(p_module text, p_filter jsonb, p_page integer, p_size integer)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  size int := least(greatest(coalesce(p_size, 100), 1), 100);
  page int := greatest(coalesce(p_page, 1), 1);
  total int;
  ids jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in required.' using errcode = '42501'; end if;
  select count(*) into total from public.crm_match_ids(p_module, coalesce(p_filter, '{}'::jsonb));
  select coalesce(jsonb_agg(s.match_id), '[]'::jsonb) into ids from (
    select crm_match_ids as match_id from public.crm_match_ids(p_module, coalesce(p_filter, '{}'::jsonb))
    order by 1
    offset (page - 1) * size
    limit size
  ) s;
  return jsonb_build_object('total', total, 'ids', ids);
end
$$;

revoke all on function public.crm_list_page(text, jsonb, integer, integer) from public, anon;
grant execute on function public.crm_list_page(text, jsonb, integer, integer) to authenticated;

do $readback$
begin
  if position('America/New_York' in pg_get_functiondef('public.crm_date_bounds(jsonb, timestamptz)'::regprocedure)) = 0
     or position('extract(dow from today)' in pg_get_functiondef('public.crm_date_bounds(jsonb, timestamptz)'::regprocedure)) = 0
     or position('make_interval(months => n)' in pg_get_functiondef('public.crm_date_bounds(jsonb, timestamptz)'::regprocedure)) = 0 then
    raise exception 'readback: date bounds are missing New York, Sunday weeks, or calendar months';
  end if;
  if position('private.' in pg_get_functiondef('public.crm_date_bounds(jsonb, timestamptz)'::regprocedure)) > 0
     or position('private.' in pg_get_functiondef('public.crm_list_page(text, jsonb, integer, integer)'::regprocedure)) > 0 then
    raise exception 'readback: a date function calls private';
  end if;
end
$readback$;

commit;
