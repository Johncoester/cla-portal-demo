-- Turn on TEST Accounting only: private.features name = 'accounting'.
-- Leaves funding, wires, policy, title, and every other feature untouched.
-- Does not insert contract figures and does not alter orders.
-- Apply after 20261107_test_accounting_contract_terms.sql. Parent applies this.

do $$
declare
  before jsonb;
begin
  if not exists (select 1 from private.features where name = 'accounting') then
    raise exception 'private.features has no accounting row.';
  end if;
  select coalesce(jsonb_object_agg(name, enabled), '{}'::jsonb)
    into before
  from private.features
  where name <> 'accounting';

  update private.features set enabled = true where name = 'accounting';

  if (select enabled from private.features where name = 'accounting') is distinct from true then
    raise exception 'accounting did not turn on.';
  end if;
  if exists (
    select 1 from private.features f
    where before ? f.name
      and f.enabled is distinct from (before->>f.name)::boolean
  ) then
    raise exception 'A feature other than accounting changed. Roll back.';
  end if;
  if exists (select 1 from private.features where name in ('funding', 'wires', 'policy', 'title') and enabled) then
    raise exception 'funding, wires, policy, or title is enabled. This script does not authorize them.';
  end if;
end $$;
