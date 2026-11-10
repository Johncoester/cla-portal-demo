-- Turn on the TEST wires feature only: private.features name = 'wires'.
-- Leaves accounting, crm, funding, policy, and title untouched.
-- Does not insert wire rows, escrow rows, or bank numbers.
-- The portal does not apply this. Apply it once on TEST if wires should open for staff
-- who already pass private.fwp_staff (Admin while Accounting is in beta; Processor and
-- Funding Team once Accounting is Live).
-- Rollback: supabase/review/20261111_enable_wires_feature_rollback.sql

do $$
declare
  before jsonb;
begin
  if to_regclass('private.features') is null then
    raise exception 'private.features is missing';
  end if;
  if not exists (select 1 from private.features where name = 'wires') then
    raise exception 'private.features has no wires row.';
  end if;
  select coalesce(jsonb_object_agg(name, enabled), '{}'::jsonb)
    into before
  from private.features
  where name <> 'wires';

  update private.features set enabled = true where name = 'wires';

  if (select enabled from private.features where name = 'wires') is distinct from true then
    raise exception 'wires did not turn on.';
  end if;
  if exists (
    select 1 from private.features f
    where before ? f.name
      and f.enabled is distinct from (before->>f.name)::boolean
  ) then
    raise exception 'A feature other than wires changed. Roll back.';
  end if;
end $$;
