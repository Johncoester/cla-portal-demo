-- MF-011: the Closer on a file. closer_name is what is shown (a staff name or free text).
-- closer_profile_id is set only when that name is one active CLA staff login.
-- No backfill. Existing files stay blank. Not applied by this change.
-- Rollback: supabase/rollbacks/20261110071500_deal_closer.sql
begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'deals' and column_name in ('closer_name', 'closer_profile_id')
  ) then raise exception 'drift: a closer column already exists'; end if;
  if to_regprocedure('private.deal_closer_guard()') is not null then
    raise exception 'drift: private.deal_closer_guard already exists'; end if;
  if exists (select 1 from pg_trigger where tgname = 'deals_closer_guard') then
    raise exception 'drift: deals_closer_guard already exists'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.deals'::regclass) then
    raise exception 'drift: deals RLS is off'; end if;
end $$;

alter table public.deals
  add column closer_name text not null default '',
  add column closer_profile_id uuid references public.profiles(id) on delete set null;

alter table public.deals add constraint deals_closer_name_len check (char_length(closer_name) <= 120);

create index deals_closer_profile_idx on public.deals (closer_profile_id) where closer_profile_id is not null;

comment on column public.deals.closer_name is
  'Closer shown on the file. A staff name or free text. Empty means not set. Not a portal role and not file access.';
comment on column public.deals.closer_profile_id is
  'Set only when closer_name is one active CLA staff member. Null for a typed name.';

-- A new staff id must be an active CLA staff login in the same demo world. An id that is already stored
-- is left alone when the row is saved again, so a person who later becomes inactive is not wiped.
create function private.deal_closer_guard() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  new.closer_name := left(btrim(coalesce(new.closer_name, '')), 120);
  if new.closer_profile_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.closer_profile_id is not distinct from old.closer_profile_id then return new; end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = new.closer_profile_id
      and p.status = 'active'
      and p.role in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin')
      and p.is_demo is not distinct from coalesce(new.is_demo, false)
  ) then
    raise exception 'The closer must be an active CLA staff member, or a typed name with no staff login.' using errcode = 'P0001';
  end if;
  return new;
end $$;

revoke all on function private.deal_closer_guard() from public, anon, authenticated;

create trigger deals_closer_guard
  before insert or update of closer_name, closer_profile_id on public.deals
  for each row execute function private.deal_closer_guard();

do $$
begin
  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'deals' and column_name in ('closer_name', 'closer_profile_id')) <> 2 then
    raise exception 'readback: closer columns missing'; end if;
  if (select is_nullable from information_schema.columns
      where table_schema = 'public' and table_name = 'deals' and column_name = 'closer_name') <> 'NO' then
    raise exception 'readback: closer_name should be required'; end if;
  if not exists (select 1 from pg_constraint where conname = 'deals_closer_name_len' and convalidated) then
    raise exception 'readback: name length check missing'; end if;
  if not exists (select 1 from pg_index where indexrelid = 'public.deals_closer_profile_idx'::regclass) then
    raise exception 'readback: closer index missing'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'deals_closer_guard' and not tgisinternal) then
    raise exception 'readback: trigger missing'; end if;
  if (select count(*) from public.deals where closer_profile_id is not null or closer_name <> '') <> 0 then
    raise exception 'readback: existing files were given a closer'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.deals'::regclass) then
    raise exception 'readback: deals RLS is off'; end if;
end $$;

commit;
