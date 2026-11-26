-- MF-073 (Matt Landsberg, Portal Feedback Nov 25 2026): Citizenship is a dropdown again.
-- Official options: U.S. Citizen, U.S. National, Lawful Permanent Resident,
-- Non-Citizen Authorized to Work (Matt's four labels, confirmed by Janine Nov 25).
-- This is a new forward file. It does not edit 20261125180000_citizenship_free_text.sql
-- (JN-CITIZEN-1 / PR 334, already merged). Saved answers are not rewritten.
-- Leftover typed answers stay on the file and remain valid until someone picks a new option.
-- spouse_info.citizenship stays plain text. There is no enum and no check.
-- This file does not change private.validate_form or any guard.
-- Rollback: supabase/rollbacks/20261131250000_citizenship_dropdown.sql

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

do $drift$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'spouse_info' and column_name = 'citizenship'
      and data_type = 'text'
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
end
$drift$;

do $upd$
declare official jsonb := '["U.S. Citizen", "U.S. National", "Lawful Permanent Resident", "Non-Citizen Authorized to Work"]'::jsonb;
declare historical jsonb := '["US Citizen", "US citizen", "US", "Permanent Resident", "Non-Resident Alien", "Other"]'::jsonb;
declare extras jsonb;
declare opts jsonb;
declare keep jsonb;
begin
  -- Existing typed answers that are not one of the official four stay valid on save
  -- (private.validate_form already accepts a select value in opts; it is not changed).
  select coalesce(jsonb_agg(distinct v.val) filter (where v.val is not null), '[]'::jsonb)
  into extras
  from (
    select trim(t.form_data->>'citizenship') as val
    from public.tasks t
    where t.form_data ? 'citizenship'
      and char_length(trim(coalesce(t.form_data->>'citizenship', ''))) > 0
      and not (official ? trim(t.form_data->>'citizenship'))
  ) v;

  select coalesce(jsonb_agg(s.x order by s.x), '[]'::jsonb)
  into keep
  from (
    select distinct u.x
    from (
      select jsonb_array_elements_text(historical) as x
      union
      select jsonb_array_elements_text(extras)
    ) u
    where not (official ? u.x)
  ) s;
  -- opts = official four first, then leftover / historical values, so validate_form accepts them
  -- while the form UI only offers the official four plus the answer already on that file.
  opts := official || keep;

  update public.task_templates t
  set fields = (
    select jsonb_agg(
      case
        when elem->>'k' = 'citizenship' then
          (elem - 'opts' - 'keep') || jsonb_build_object('type', 'select', 'opts', opts, 'keep', keep)
        else elem
      end
      order by ord
    )
    from jsonb_array_elements(t.fields) with ordinality as x(elem, ord)
  )
  where jsonb_typeof(t.fields) = 'array'
    and exists (
      select 1 from jsonb_array_elements(t.fields) f
      where f->>'k' = 'citizenship'
        and (
          coalesce(f->>'type', '') is distinct from 'select'
          or coalesce(f->'opts', '[]'::jsonb) is distinct from opts
          or coalesce(f->'keep', '[]'::jsonb) is distinct from keep
        )
    );
end
$upd$;

do $readback$
declare fields jsonb; n int; official jsonb := '["U.S. Citizen", "U.S. National", "Lawful Permanent Resident", "Non-Citizen Authorized to Work"]'::jsonb;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'spouse_info' and column_name = 'citizenship'
      and data_type = 'text'
  ) then
    raise exception 'readback: spouse_info.citizenship changed';
  end if;
  if exists (
    select 1 from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and con.contype = 'c' and pg_get_constraintdef(con.oid) ilike '%citizenship%'
  ) then
    raise exception 'readback: a citizenship check is present';
  end if;
  select count(*) into n from public.task_templates t
  cross join lateral jsonb_array_elements(t.fields) f
  where t.code = 'personal_info' and f->>'k' = 'citizenship'
    and (
      coalesce(f->>'type', '') is distinct from 'select'
      or not (coalesce(f->'opts', '[]'::jsonb) ? 'U.S. Citizen')
      or not (coalesce(f->'opts', '[]'::jsonb) ? 'U.S. National')
      or not (coalesce(f->'opts', '[]'::jsonb) ? 'Lawful Permanent Resident')
      or not (coalesce(f->'opts', '[]'::jsonb) ? 'Non-Citizen Authorized to Work')
    );
  if n <> 0 then raise exception 'readback: citizenship is not Matt''s dropdown on every Personal information template'; end if;
  select t.fields into fields from public.task_templates t
  where t.code = 'personal_info' and t.active order by t.version desc limit 1;
  if not exists (
    select 1 from jsonb_array_elements(fields) f
    where f->>'k' = 'citizenship' and f->>'type' = 'select'
      and (f->'opts'->0) = official->0
      and jsonb_array_length(f->'opts') >= 4
  ) then
    raise exception 'readback: the active Personal information question is not Matt''s dropdown';
  end if;
end
$readback$;
commit;
