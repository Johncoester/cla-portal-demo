-- FF-104b. Francis Santos, Nov 19 2026, 1:15 PM ET, confirmed 2:35 PM ET.
-- A new closing order gets eight folders instead of the five older names.
-- Existing orders, folders and documents are not updated or deleted.
-- Running this again only replaces the same function. It does not rewrite rows.
-- Not applied by this commit. Apply on TEST (aqcervntopidtcazcmlv). Do not touch production.
-- Rollback: supabase/rollbacks/20261125350000_order_default_folders.sql

begin;
set local lock_timeout = '3s';

do $ff104b_drift$
begin
  if to_regprocedure('private.trg_deal()') is null then
    raise exception 'drift: private.trg_deal() is missing';
  end if;
  if to_regclass('public.folders') is null or to_regclass('public.deals') is null then
    raise exception 'drift: folders or deals is missing';
  end if;
end
$ff104b_drift$;

create or replace function private.trg_deal()
returns trigger
language plpgsql
security definer
set search_path to pg_catalog, public, extensions
as $function$
begin
  if tg_op = 'INSERT' then
    perform private.log_activity(new.id, 'deal.created', 'deal', new.id, 'Order ' || new.file_number || ' opened');
    insert into public.tasks (deal_id, title, assigned_role, created_by) values (new.id, 'Collect executed contract', 'Processor', new.created_by);
    insert into public.folders (scope, deal_id, name, created_by)
      select 'deal', new.id, n, new.created_by
      from unnest(array[
        '100 Processing',
        '200 Title',
        '300 Payoffs and Invoices',
        '400 Lender Closing Instructions',
        '450 Final Closing Documents',
        '500 Post Closing - Final Signed Docs',
        '600 Funds, Agent Commission Wire Instructions',
        '700 Recorded Documents and Policies'
      ]) n
      where not exists (
        select 1 from public.folders f
        where f.deal_id = new.id and f.scope = 'deal' and lower(f.name) = lower(n)
      );
  else
    if new.stage <> old.stage then perform private.log_activity(new.id, 'stage.changed', 'deal', new.id, 'Stage set to ' || new.stage); end if;
    if new.status <> old.status then perform private.log_activity(new.id, 'status.changed', 'deal', new.id, 'Status set to ' || new.status); end if;
    if new.closing_date is distinct from old.closing_date then perform private.log_activity(new.id, 'closing.date', 'deal', new.id, 'Closing date set to ' || coalesce(new.closing_date::text, 'none')); end if;
  end if; return new; end $function$;

commit;
