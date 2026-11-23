-- Rollback MF-060b: puts back the 20261129040000 (MF-060) body exactly. Activity log entries already written stay.
begin;
set local lock_timeout = '3s';
create or replace function private.deal_disbursement_follows_closing() returns trigger
language plpgsql set search_path = pg_catalog, public as $fn$
begin
  if new.closing_date is distinct from old.closing_date
     and coalesce(new.transaction_type, '') <> 'Refinance'
     and new.disbursement_date is not distinct from old.disbursement_date then
    new.disbursement_date := null;
  end if;
  return new;
end $fn$;
revoke all on function private.deal_disbursement_follows_closing() from public;
commit;
