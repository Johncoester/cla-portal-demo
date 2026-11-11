-- Rollback 20261112130000_crm_date_ops.
-- Restores public.crm_date_bounds from before that migration
-- (md5 268485523c31ac857f1b1b82c76e75c1) and drops crm_list_page.

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

drop function if exists public.crm_list_page(text, jsonb, integer, integer);

CREATE OR REPLACE FUNCTION public.crm_date_bounds(p_spec jsonb, p_now timestamp with time zone DEFAULT now())
 RETURNS TABLE(mode text, lo timestamp with time zone, hi timestamp with time zone, lo_date date, hi_date date)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  d0 date;
  d1 date;
begin
  mode := 'none'; lo := null; hi := null; lo_date := null; hi_date := null;
  if p_spec is null or jsonb_typeof(p_spec) <> 'object' then
    return next; return;
  end if;
  if coalesce(p_spec->>'op', '') = 'empty' then mode := 'empty'; return next; return; end if;
  if coalesce(p_spec->>'op', '') = 'not_empty' then mode := 'present'; return next; return; end if;
  if coalesce(p_spec->>'op', '') = 'not_between' then mode := 'outside';
  else mode := 'range';
  end if;
  begin
    d0 := nullif(p_spec->>'from', '')::date;
    d1 := nullif(p_spec->>'to', '')::date;
  exception when others then
    raise exception 'Enter a real date.' using errcode = '22023';
  end;
  if d0 is null and d1 is null and coalesce(p_spec->>'op', '') = '' then
    mode := 'none'; return next; return;
  end if;
  if coalesce(p_spec->>'op', '') in ('not_between', 'between') and (d0 is null or d1 is null) then
    raise exception 'Enter both dates.' using errcode = '22023';
  end if;
  if d0 is not null and d1 is not null and d1 < d0 then
    declare
      swap date;
    begin
      swap := d0; d0 := d1; d1 := swap;
    end;
  end if;
  if d0 is not null then
    lo := d0::timestamp at time zone 'America/New_York';
    lo_date := d0;
  end if;
  if d1 is not null then
    hi := (d1 + 1)::timestamp at time zone 'America/New_York';
    hi_date := d1 + 1;
  end if;
  return next;
end
$function$;

revoke all on function public.crm_date_bounds(jsonb, timestamptz) from public, anon;
grant execute on function public.crm_date_bounds(jsonb, timestamptz) to authenticated;

do $restored$
declare
  got text;
begin
  got := md5(pg_get_functiondef('public.crm_date_bounds(jsonb, timestamptz)'::regprocedure));
  if got is distinct from '268485523c31ac857f1b1b82c76e75c1' then
    raise exception 'rollback: public.crm_date_bounds md5 %', got;
  end if;
  if to_regprocedure('public.crm_list_page(text, jsonb, integer, integer)') is not null then
    raise exception 'rollback: crm_list_page is still present';
  end if;
end
$restored$;

commit;
