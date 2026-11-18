-- Puts Citizenship back to the dropdown from 20261112060400. Does not change spouse_info.citizenship
-- and does not put a check back (TEST had none). Saved answers stay on the task.
begin;
set local lock_timeout = '3s';

update public.task_templates t
set fields = (
  select jsonb_agg(
    case
      when elem->>'k' = 'citizenship' then (elem - 'keep') || jsonb_build_object(
        'type', 'select',
        'opts', jsonb_build_array('U.S. Citizen', 'Permanent Resident', 'Non-Resident Alien', 'Other', 'US Citizen')
      )
      else elem
    end
    order by ord
  )
  from jsonb_array_elements(t.fields) with ordinality as x(elem, ord)
)
where jsonb_typeof(t.fields) = 'array'
  and exists (
    select 1 from jsonb_array_elements(t.fields) f
    where f->>'k' = 'citizenship' and f->>'type' = 'text'
  );

do $readback$
declare fields jsonb;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'spouse_info' and column_name = 'citizenship'
      and data_type = 'text' and is_nullable = 'NO'
  ) then
    raise exception 'rollback check: spouse_info.citizenship changed';
  end if;
  select t.fields into fields from public.task_templates t
  where t.code = 'personal_info' and t.active order by t.version desc limit 1;
  if not exists (
    select 1 from jsonb_array_elements(fields) f
    where f->>'k' = 'citizenship' and f->>'type' = 'select'
      and f->'opts' ? 'U.S. Citizen' and f->'opts' ? 'Permanent Resident'
      and f->'opts' ? 'Non-Resident Alien' and f->'opts' ? 'Other' and f->'opts' ? 'US Citizen'
  ) then
    raise exception 'rollback check: citizenship is not the dropdown';
  end if;
end
$readback$;
commit;
