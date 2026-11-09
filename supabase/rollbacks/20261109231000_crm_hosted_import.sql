-- Exact rollback of 20261109231000_crm_hosted_import.sql.
-- One transaction. lock_timeout 3s.
-- Drops the three import functions. Drops crm_import_rows only when this
-- migration created it (the table comment is the marker). Drops crm_imports
-- columns only when this migration added them (the column comment is the
-- marker). Does not drop crm_imports, and does not change private.* helpers
-- or deals, tasks, or profiles policies.

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public, extensions;

drop function if exists public.crm_import_batch(boolean, text, text, text, jsonb, jsonb);
drop function if exists public.crm_list_imports();
drop function if exists public.crm_list_import_rows(uuid);

do $rb$
declare
  marker text := 'crm-hosted-import 20261109231000';
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
end
$rb$;

commit;
