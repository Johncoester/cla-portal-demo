-- Turn on the TEST final-policy feature only: private.features name = 'policy'.
-- Leaves accounting, crm, funding, wires, and title untouched.
-- Does not insert policy rows. Apply once on TEST. Not run by the portal.
-- Rollback: supabase/review/20261111_enable_policy_feature_rollback.sql

do $$
declare
  before jsonb;
begin
  if to_regclass('private.features') is null then
    raise exception 'private.features is missing';
  end if;
  if not exists (select 1 from private.features where name = 'policy') then
    raise exception 'private.features has no policy row.';
  end if;
  select coalesce(jsonb_object_agg(name, enabled), '{}'::jsonb) into before
  from private.features where name <> 'policy';
  update private.features set enabled = true where name = 'policy';
  if (select enabled from private.features where name = 'policy') is distinct from true then
    raise exception 'policy did not turn on.';
  end if;
  if exists (
    select 1 from private.features f
    where before ? f.name and f.enabled is distinct from (before->>f.name)::boolean
  ) then
    raise exception 'A feature other than policy changed. Roll back.';
  end if;
end $$;
