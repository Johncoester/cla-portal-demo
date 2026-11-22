-- Rollback for 20261119180000_old_commission_keys_permissions.sql. NOT APPLIED by this file.
-- Puts private.old_commission_keys() back to running as the signed-in user, with no execute right
-- for public, anon or authenticated (the state after 20261119030000_agent_fee_one_source.sql).
-- Saving an order will fail again with "permission denied for function old_commission_keys".
-- The key list and the guard stay. Does not put commissions back on the order.
begin;
set local lock_timeout = '3s';

create or replace function private.old_commission_keys() returns text[]
language sql immutable security invoker set search_path to pg_catalog as $$
  select array['commissionBase', 'commissionPercent', 'commissionAdditional', 'commissionTotal', 'commissionPaidBy',
               'listingCommissionPercent', 'listingCommissionAmount', 'buyerCommissionPercent', 'buyerCommissionAmount'] $$;

revoke all on function private.old_commission_keys() from public, anon, authenticated;
comment on function private.old_commission_keys() is null;

do $$
begin
  if to_regprocedure('private.old_commission_keys()') is null then
    raise exception 'rollback check: old_commission_keys is missing';
  end if;
  if (select prosecdef from pg_proc where oid = 'private.old_commission_keys()'::regprocedure) then
    raise exception 'rollback check: old_commission_keys is still security definer';
  end if;
  if (select proconfig from pg_proc where oid = 'private.old_commission_keys()'::regprocedure) is distinct from array['search_path=pg_catalog'] then
    raise exception 'rollback check: search_path was not restored (got %)',
      (select proconfig from pg_proc where oid = 'private.old_commission_keys()'::regprocedure);
  end if;
  if has_function_privilege('authenticated', 'private.old_commission_keys()', 'execute')
     or has_function_privilege('anon', 'private.old_commission_keys()', 'execute')
     or has_function_privilege('public', 'private.old_commission_keys()', 'execute') then
    raise exception 'rollback check: public, anon or authenticated can still execute old_commission_keys';
  end if;
  if (select private.old_commission_keys()) is distinct from array['commissionBase', 'commissionPercent', 'commissionAdditional', 'commissionTotal', 'commissionPaidBy',
    'listingCommissionPercent', 'listingCommissionAmount', 'buyerCommissionPercent', 'buyerCommissionAmount']::text[] then
    raise exception 'rollback check: commission keys changed';
  end if;
end $$;

commit;
