-- MF-060 (Matt Landsberg, "Portal Feedback Nov 22" notes + recording; Matt's confirm-back reply Nov 22 2026, 1:54 PM ET, Gmail 1a2049c9ec631d7b).
-- On a PURCHASE file, when the settlement (closing) date changes, the disbursement date changes to match it. Not for refinances.
-- The disbursement date can still be set by hand afterward. A hand-set date lasts until the next settlement date change:
-- a save that changes closing_date and leaves disbursement_date as it was clears the hand-set date, so the file shows
-- the closing date again (blank disbursement_date = automatic = the closing date on a purchase; see 20261119010000).
-- A save that changes both dates at once keeps the disbursement date it was given.
-- Refinances keep their own rule (4th business day after closing, or the processor's date) and are not touched.
-- Row security and who may update deals are unchanged. The buyer closing-date lock is not touched.
-- Rollback: supabase/rollbacks/20261129040000_disbursement_follows_settlement.sql
begin;
set local lock_timeout = '3s';
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deals' and column_name = 'disbursement_date') then
    raise exception 'drift: deals.disbursement_date is missing (20261119010000 first)'; end if;
  if to_regprocedure('private.deal_disbursement_follows_closing()') is not null then
    raise exception 'drift: private.deal_disbursement_follows_closing already exists'; end if;
  if exists (select 1 from pg_trigger where tgrelid = 'public.deals'::regclass and tgname = 'deals_disbursement_follows') then
    raise exception 'drift: deals_disbursement_follows trigger already exists'; end if;
end $$;

create function private.deal_disbursement_follows_closing() returns trigger
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

create trigger deals_disbursement_follows before update of closing_date on public.deals
  for each row execute function private.deal_disbursement_follows_closing();

do $check$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.deals'::regclass and tgname = 'deals_disbursement_follows' and not tgisinternal) then
    raise exception 'readback: deals_disbursement_follows is missing'; end if;
end
$check$;
commit;
