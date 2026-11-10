-- Exact rollback of 20261110100000_crm_hosted_import.sql.
-- One transaction. lock_timeout 3s.
-- Drops the three import functions. Drops crm_import_rows only when this
-- migration created it (the table comment is the marker). Drops crm_imports
-- columns only when this migration added them (the column comment is the
-- marker). Restores crm_imports_total_check and crm_import_rows_line_check
-- to the old limits only when this migration widened them and every stored
-- row still fits. Otherwise it raises and deletes nothing. Does not drop
-- crm_imports, and does not change private.* helpers or deals, tasks, or
-- profiles policies.

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public, extensions;

-- Refuse before any drop if a stored row is outside the old limit.
do $guard$
declare
  marker text := 'crm-hosted-import 20261110100000';
  bad int;
  marked boolean;
begin
  select exists (
    select 1 from pg_constraint c
    join pg_description d on d.objoid = c.oid and d.classoid = 'pg_constraint'::regclass
    where c.conrelid = 'public.crm_imports'::regclass
      and c.conname = 'crm_imports_total_check'
      and d.description = marker
  ) into marked;
  if marked and to_regclass('public.crm_imports') is not null then
    select count(*) into bad from public.crm_imports where total > 2000;
    if bad > 0 then
      raise exception 'Cannot restore crm_imports_total_check (total <= 2000): % import log row(s) have a total above 2000. No rows were deleted.', bad;
    end if;
  end if;
  select exists (
    select 1 from pg_constraint c
    join pg_description d on d.objoid = c.oid and d.classoid = 'pg_constraint'::regclass
    where c.conrelid = 'public.crm_import_rows'::regclass
      and c.conname = 'crm_import_rows_line_check'
      and d.description = marker
  ) into marked;
  if marked and to_regclass('public.crm_import_rows') is not null then
    select count(*) into bad from public.crm_import_rows where line < 2 or line > 2001;
    if bad > 0 then
      raise exception 'Cannot restore crm_import_rows_line_check (line between 2 and 2001): % row(s) are outside that range. No rows were deleted.', bad;
    end if;
  end if;
end
$guard$;

drop function if exists public.crm_import_batch(boolean, text, text, text, jsonb, jsonb, uuid, integer);
drop function if exists public.crm_import_batch(boolean, text, text, text, jsonb, jsonb);
drop function if exists public.crm_list_imports();
drop function if exists public.crm_list_import_rows(uuid);

do $rb$
declare
  marker text := 'crm-hosted-import 20261110100000';
  col text;
begin
  if to_regclass('public.crm_import_rows') is not null
     and exists (
       select 1 from pg_description d
       join pg_class c on c.oid = d.objoid
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'crm_import_rows' and d.objsubid = 0 and d.description = marker
     ) then
    drop table public.crm_import_rows;
  end if;
  if to_regclass('public.crm_imports') is not null then
    for col in
      select a.attname
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_description d on d.objoid = c.oid and d.objsubid = a.attnum
      where n.nspname = 'public' and c.relname = 'crm_imports' and a.attnum > 0 and not a.attisdropped
        and d.description = marker
    loop
      execute format('alter table public.crm_imports drop column %I', col);
    end loop;
  end if;

  if to_regclass('public.crm_imports') is not null
     and exists (
       select 1 from pg_constraint c
       join pg_description d on d.objoid = c.oid and d.classoid = 'pg_constraint'::regclass
       where c.conrelid = 'public.crm_imports'::regclass
         and c.conname = 'crm_imports_total_check'
         and d.description = marker
     ) then
    alter table public.crm_imports drop constraint crm_imports_total_check;
    alter table public.crm_imports add constraint crm_imports_total_check check (total <= 2000);
    comment on constraint crm_imports_total_check on public.crm_imports is null;
  end if;
  if to_regclass('public.crm_import_rows') is not null
     and exists (
       select 1 from pg_constraint c
       join pg_description d on d.objoid = c.oid and d.classoid = 'pg_constraint'::regclass
       where c.conrelid = 'public.crm_import_rows'::regclass
         and c.conname = 'crm_import_rows_line_check'
         and d.description = marker
     ) then
    alter table public.crm_import_rows drop constraint crm_import_rows_line_check;
    alter table public.crm_import_rows add constraint crm_import_rows_line_check check (line >= 2 and line <= 2001);
    comment on constraint crm_import_rows_line_check on public.crm_import_rows is null;
  end if;
end
$rb$;

commit;
