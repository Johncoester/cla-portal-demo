-- Place Order failed on TEST after 20261119030000_agent_fee_one_source.sql was applied (John, Nov 13 2026).
-- That file's guard runs as the signed-in user and calls private.old_commission_keys() on every insert and
-- update of an order. The same file then took away that user's right to run the function, so a normal save
-- failed with "permission denied for function old_commission_keys" instead of saving.
-- This file does not change the key list or the guard. It lets a signed-in user run the key list (as the
-- function owner, with a fixed search path) so a save that does not write an old commission works again.
-- An old commission is still refused with the plain Agent fees message.
-- Does not edit 20261119030000_agent_fee_one_source.sql. Not applied on TEST by this file.
-- Rollback: supabase/rollbacks/20261119180000_old_commission_keys_permissions.sql
begin;
set local lock_timeout = '3s';

do $$
begin
  if to_regprocedure('private.old_commission_keys()') is null
     or to_regprocedure('private.deal_old_commission_guard()') is null then
    raise exception 'drift: apply 20261119030000_agent_fee_one_source.sql first';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated')
     or not exists (select 1 from pg_roles where rolname = 'anon') then
    raise exception 'drift: roles authenticated and anon must already exist';
  end if;
end $$;

-- same nine keys, same order, still a plain list (immutable). Security definer so the call is the owner's,
-- and search_path is fixed. The signed-in user still needs execute, granted below.
create or replace function private.old_commission_keys() returns text[]
language sql immutable security definer set search_path = public as $$
  select array['commissionBase', 'commissionPercent', 'commissionAdditional', 'commissionTotal', 'commissionPaidBy',
               'listingCommissionPercent', 'listingCommissionAmount', 'buyerCommissionPercent', 'buyerCommissionAmount'] $$;

revoke all on function private.old_commission_keys() from public, anon;
grant execute on function private.old_commission_keys() to authenticated;

comment on function private.old_commission_keys() is
  'The nine commission keys that used to be stored on the order. Signed-in users may run it so saving an order can check those keys. The list is unchanged.';

do $$
declare v text[];
begin
  if not (select prosecdef from pg_proc where oid = 'private.old_commission_keys()'::regprocedure) then
    raise exception 'readback: old_commission_keys is not security definer';
  end if;
  if (select provolatile from pg_proc where oid = 'private.old_commission_keys()'::regprocedure) is distinct from 'i' then
    raise exception 'readback: old_commission_keys must stay immutable';
  end if;
  if (select proconfig from pg_proc where oid = 'private.old_commission_keys()'::regprocedure) is distinct from array['search_path=public'] then
    raise exception 'readback: search_path is not public (got %)',
      (select proconfig from pg_proc where oid = 'private.old_commission_keys()'::regprocedure);
  end if;
  if (select prosecdef from pg_proc where oid = 'private.deal_old_commission_guard()'::regprocedure) then
    raise exception 'readback: the commission guard must keep running as the signed-in user';
  end if;
  if not has_function_privilege('authenticated', 'private.old_commission_keys()', 'execute') then
    raise exception 'readback: authenticated cannot execute old_commission_keys';
  end if;
  if has_function_privilege('anon', 'private.old_commission_keys()', 'execute')
     or has_function_privilege('public', 'private.old_commission_keys()', 'execute') then
    raise exception 'readback: anon or public can still execute old_commission_keys';
  end if;
  v := private.old_commission_keys();
  if v is distinct from array['commissionBase', 'commissionPercent', 'commissionAdditional', 'commissionTotal', 'commissionPaidBy',
    'listingCommissionPercent', 'listingCommissionAmount', 'buyerCommissionPercent', 'buyerCommissionAmount']::text[] then
    raise exception 'readback: commission keys changed';
  end if;
end $$;

commit;
