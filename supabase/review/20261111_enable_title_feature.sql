-- Turn on the TEST title feature only: private.features name = 'title'.
-- Leaves accounting, crm, funding, wires, and policy untouched.
-- Does not insert title rows. Apply once on TEST. Not run by the portal.
-- Rollback: supabase/review/20261111_enable_title_feature_rollback.sql

do $$
declare
  before jsonb;
begin
  if to_regclass('private.features') is null then
    raise exception 'private.features is missing';
  end if;
  if not exists (select 1 from private.features where name = 'title') then
    raise exception 'private.features has no title row.';
  end if;
  select coalesce(jsonb_object_agg(name, enabled), '{}'::jsonb) into before
  from private.features where name <> 'title';
  update private.features set enabled = true where name = 'title';
  if (select enabled from private.features where name = 'title') is distinct from true then
    raise exception 'title did not turn on.';
  end if;
  if exists (
    select 1 from private.features f
    where before ? f.name and f.enabled is distinct from (before->>f.name)::boolean
  ) then
    raise exception 'A feature other than title changed. Roll back.';
  end if;
end $$;
