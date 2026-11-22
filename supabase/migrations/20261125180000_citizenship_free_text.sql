-- JN-CITIZEN-1 (Janine, Nov 17 2026, via Francis Feedback): Citizenship is a single line again.
-- spouse_info.citizenship is already text. There is no enum. A check that named citizenship,
-- if one were present, is dropped. On TEST there is none, so the column is not altered.
-- The dropdown is the question stored on the Personal information templates. This sets that
-- question back to text on every version and leaves each saved answer where it is.
-- Not applied by this commit.
begin;
set local lock_timeout = '3s';

do $drift$
declare def text;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'spouse_info' and column_name = 'citizenship'
      and data_type = 'text' and is_nullable = 'NO'
  ) then
    raise exception 'drift: spouse_info.citizenship is not plain text';
  end if;
  if exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname ilike '%citizen%') then
    raise exception 'drift: a citizenship enum is present';
  end if;
  if not exists (
    select 1 from public.task_templates t
    cross join lateral jsonb_array_elements(t.fields) f
    where t.code = 'personal_info' and f->>'k' = 'citizenship'
  ) then
    raise exception 'drift: citizenship is not on Personal information';
  end if;
  for def in
    select pg_get_constraintdef(con.oid)
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and con.contype = 'c' and pg_get_constraintdef(con.oid) ilike '%citizenship%'
  loop
    raise notice 'dropping citizenship check: %', def;
  end loop;
end
$drift$;

do $relax$
declare r record;
begin
  for r in
    select n.nspname as schema_name, c.relname as table_name, con.conname
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and con.contype = 'c' and pg_get_constraintdef(con.oid) ilike '%citizenship%'
  loop
    execute format('alter table %I.%I drop constraint %I', r.schema_name, r.table_name, r.conname);
  end loop;
end
$relax$;

update public.task_templates t
set fields = (
  select jsonb_agg(
    case
      when elem->>'k' = 'citizenship' then (elem - 'opts' - 'keep') || jsonb_build_object('type', 'text')
      else elem
    end
    order by ord
  )
  from jsonb_array_elements(t.fields) with ordinality as x(elem, ord)
)
where jsonb_typeof(t.fields) = 'array'
  and exists (
    select 1 from jsonb_array_elements(t.fields) f
    where f->>'k' = 'citizenship' and coalesce(f->>'type', '') is distinct from 'text'
  );

do $readback$
declare fields jsonb; n int;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'spouse_info' and column_name = 'citizenship'
      and data_type = 'text' and is_nullable = 'NO'
  ) then
    raise exception 'readback: spouse_info.citizenship changed';
  end if;
  if exists (
    select 1 from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and con.contype = 'c' and pg_get_constraintdef(con.oid) ilike '%citizenship%'
  ) then
    raise exception 'readback: a citizenship check is still present';
  end if;
  select count(*) into n from public.task_templates t
  cross join lateral jsonb_array_elements(t.fields) f
  where f->>'k' = 'citizenship' and coalesce(f->>'type', '') is distinct from 'text';
  if n <> 0 then raise exception 'readback: citizenship is still a dropdown'; end if;
  select t.fields into fields from public.task_templates t
  where t.code = 'personal_info' and t.active order by t.version desc limit 1;
  if not exists (
    select 1 from jsonb_array_elements(fields) f
    where f->>'k' = 'citizenship' and f->>'type' = 'text' and not (f ? 'opts')
  ) then
    raise exception 'readback: the active Personal information question is not a single line';
  end if;
end
$readback$;
commit;
