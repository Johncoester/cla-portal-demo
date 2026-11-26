-- Rollback of 20261131250000_citizenship_dropdown.sql (MF-073).
-- Puts Citizenship back to a typed line on every Personal information template, the same
-- shape JN-CITIZEN-1 left. Saved answers are not rewritten. spouse_info.citizenship is not changed.

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

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
declare n int;
begin
  select count(*) into n from public.task_templates t
  cross join lateral jsonb_array_elements(t.fields) f
  where t.code = 'personal_info' and f->>'k' = 'citizenship' and coalesce(f->>'type', '') is distinct from 'text';
  if n <> 0 then raise exception 'readback: citizenship is still a dropdown'; end if;
end
$readback$;
commit;
