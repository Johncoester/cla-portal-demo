-- Settlement time on a file, 24-hour HH:MM. Empty means not set.
-- Not the scheduled-closing appointment. No backfill. Not applied by this change.
-- Does not write contact custom fields.
-- Rollback: supabase/rollbacks/20261110190000_deal_closing_time.sql
begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

do $$
begin
  if to_regclass('public.deals') is null then
    raise exception 'drift: public.deals is missing'; end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'deals' and column_name = 'closing_time'
  ) then raise exception 'drift: deals.closing_time already exists'; end if;
  if exists (select 1 from pg_constraint where conname = 'deals_closing_time_chk') then
    raise exception 'drift: deals_closing_time_chk already exists'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.deals'::regclass) then
    raise exception 'drift: deals RLS is off'; end if;
end $$;

alter table public.deals add column closing_time text not null default '';

alter table public.deals add constraint deals_closing_time_chk
  check (closing_time = '' or closing_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

comment on column public.deals.closing_time is
  'Settlement time on the file, 24-hour HH:MM. Empty means not set. Not the scheduled closing appointment.';

do $$
begin
  if (select is_nullable from information_schema.columns
      where table_schema = 'public' and table_name = 'deals' and column_name = 'closing_time') <> 'NO' then
    raise exception 'readback: closing_time should be required'; end if;
  if (select column_default from information_schema.columns
      where table_schema = 'public' and table_name = 'deals' and column_name = 'closing_time') is null then
    raise exception 'readback: closing_time should default to blank'; end if;
  if not exists (select 1 from pg_constraint where conname = 'deals_closing_time_chk' and convalidated) then
    raise exception 'readback: closing time check missing'; end if;
  if (select count(*) from public.deals where closing_time <> '') <> 0 then
    raise exception 'readback: existing files were given a time'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.deals'::regclass) then
    raise exception 'readback: deals RLS is off'; end if;
end $$;

commit;
