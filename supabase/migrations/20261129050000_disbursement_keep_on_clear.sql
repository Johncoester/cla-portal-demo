-- MF-060b (CLA CRM Bot's post-merge review of PR 413, Nov 23 2026; John asked for it the same morning). Follow-up to MF-060 (20261129040000).
-- 1. Clearing the settlement (closing) date no longer wipes the disbursement date: the reset runs only when the new closing date is set.
-- 2. When the trigger resets a hand-set disbursement date, it writes one activity log entry ('disbursement.date') through the existing
--    private.log_activity helper (the same one the deals_activity trigger uses for 'closing.date'). A date that was already automatic logs nothing.
-- Purchase only, as before; refinances are not touched. The function stays plain plpgsql (not SECURITY DEFINER) with a pinned search_path.
-- No table, policy or grant change. The Disbursement Details date is not touched. The buyer closing-date lock is not touched.
-- Rollback: supabase/rollbacks/20261129050000_disbursement_keep_on_clear.sql (puts back the 20261129040000 body).
begin;
set local lock_timeout = '3s';
do $$
declare src text;
begin
  if to_regprocedure('private.deal_disbursement_follows_closing()') is null then
    raise exception 'drift: private.deal_disbursement_follows_closing is missing (20261129040000 first)'; end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.deals'::regclass and tgname = 'deals_disbursement_follows') then
    raise exception 'drift: deals_disbursement_follows trigger is missing (20261129040000 first)'; end if;
  if to_regprocedure('private.log_activity(uuid,text,text,uuid,text)') is null then
    raise exception 'drift: private.log_activity(uuid,text,text,uuid,text) is missing'; end if;
  select prosrc into src from pg_proc where oid = 'private.deal_disbursement_follows_closing()'::regprocedure;
  if src like '%MF-060b%' then raise exception 'drift: MF-060b is already applied'; end if;
  if src not like '%new.disbursement_date := null;%' or src like '%new.closing_date is not null%' then
    raise exception 'drift: private.deal_disbursement_follows_closing is not the 20261129040000 body'; end if;
end $$;

create or replace function private.deal_disbursement_follows_closing() returns trigger
language plpgsql set search_path = pg_catalog, public as $fn$
begin
  -- MF-060b: only when a new settlement date is set; clearing it leaves the disbursement date alone
  if new.closing_date is distinct from old.closing_date
     and new.closing_date is not null
     and coalesce(new.transaction_type, '') <> 'Refinance'
     and new.disbursement_date is not distinct from old.disbursement_date then
    if old.disbursement_date is not null then
      perform private.log_activity(new.id, 'disbursement.date', 'deal', new.id,
        'Disbursement date ' || old.disbursement_date::text || ' reset to follow the closing date (' || new.closing_date::text || ')');
    end if;
    new.disbursement_date := null;
  end if;
  return new;
end $fn$;

revoke all on function private.deal_disbursement_follows_closing() from public;

do $check$
declare src text;
begin
  select prosrc into src from pg_proc where oid = 'private.deal_disbursement_follows_closing()'::regprocedure;
  if src not like '%new.closing_date is not null%' or src not like '%private.log_activity%' then
    raise exception 'readback: MF-060b body not in place'; end if;
  if exists (select 1 from pg_proc where oid = 'private.deal_disbursement_follows_closing()'::regprocedure and prosecdef) then
    raise exception 'readback: function must not be SECURITY DEFINER'; end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.deals'::regclass and tgname = 'deals_disbursement_follows' and tgenabled <> 'D') then
    raise exception 'readback: deals_disbursement_follows is missing or disabled'; end if;
end
$check$;
commit;
