-- Undo FF-104b: new orders go back to the five older folder names.
-- Folders already saved on any order are left as they are. Nothing is deleted.
-- Not applied by this commit.

begin;
set local lock_timeout = '3s';

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
      select 'deal', new.id, n, new.created_by from unnest(array['Contract & addenda', 'IDs & personal', 'Lender & payoff', 'HOA', 'Closing']) n;
  else
    if new.stage <> old.stage then perform private.log_activity(new.id, 'stage.changed', 'deal', new.id, 'Stage set to ' || new.stage); end if;
    if new.status <> old.status then perform private.log_activity(new.id, 'status.changed', 'deal', new.id, 'Status set to ' || new.status); end if;
    if new.closing_date is distinct from old.closing_date then perform private.log_activity(new.id, 'closing.date', 'deal', new.id, 'Closing date set to ' || coalesce(new.closing_date::text, 'none')); end if;
  end if; return new; end $function$;

commit;
