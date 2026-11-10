-- Turn on the TEST funding feature only: private.features name = 'funding'.
-- Leaves accounting, crm, wires, policy, and title untouched.
-- Does not insert funding rows. Apply once on TEST. Not run by the portal.
-- Rollback: supabase/review/20261111_enable_funding_feature_rollback.sql

do $$
declare
  before jsonb;
begin
  if to_regclass('private.features') is null then
    raise exception 'private.features is missing';
  end if;
  if not exists (select 1 from private.features where name = 'funding') then
    raise exception 'private.features has no funding row.';
  end if;
  select coalesce(jsonb_object_agg(name, enabled), '{}'::jsonb) into before
  from private.features where name <> 'funding';
  update private.features set enabled = true where name = 'funding';
  if (select enabled from private.features where name = 'funding') is distinct from true then
    raise exception 'funding did not turn on.';
  end if;
  if exists (
    select 1 from private.features f
    where before ? f.name and f.enabled is distinct from (before->>f.name)::boolean
  ) then
    raise exception 'A feature other than funding changed. Roll back.';
  end if;
end $$;
