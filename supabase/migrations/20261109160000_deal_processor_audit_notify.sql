-- John (Nov 9): staff can assign or change a file's Processor at any time (Edit order details). Every change must be
-- recorded in the file's activity, and the newly assigned Processor gets ONE in-app notification (no email, no SMS).
-- Adds one small AFTER UPDATE OF processor_id trigger on public.deals; private.trg_deal and every RLS policy are untouched.
--   activity_log 'deal.processor': 'Processor set to <name>' / 'Processor unassigned' (same wording as the mock adapter)
--   notifications kind 'processor' for the new Processor only, link #/deals/<id>; private.notify already skips the actor
--   (effective_uid) and inactive profiles. Unassign (new value null) logs only.
-- Cost: fires only when processor_id actually changes (WHEN clause); one primary-key lookup on profiles + one file_number read.
-- Rollback: supabase/rollbacks/20261109160000_deal_processor_audit_notify.sql
begin;
set local lock_timeout = '3s';
do $$
begin
  if exists (select 1 from pg_trigger where tgrelid = 'public.deals'::regclass and tgname = 'deals_processor_activity') then
    raise exception 'drift: deals_processor_activity trigger already exists'; end if;
  if to_regprocedure('private.trg_deal_processor()') is not null then
    raise exception 'drift: private.trg_deal_processor() already exists'; end if;
  if (select md5(prosrc) from pg_proc where oid = to_regprocedure('private.log_activity(uuid,text,text,uuid,text)')) is distinct from '122ffb0ad2fe7a16ca00bc9d4716b0e8' then
    raise exception 'drift: private.log_activity changed or missing'; end if;
  if (select md5(prosrc) from pg_proc where oid = to_regprocedure('private.notify(uuid[],text,uuid,text,text)')) is distinct from '3b83dd0a781cd01afea62c29ea975457' then
    raise exception 'drift: private.notify changed or missing'; end if;
  if (select md5(prosrc) from pg_proc where oid = to_regprocedure('private.trg_deal()')) is distinct from '0bd05140a5c19aa77dbbe906f73aa50f' then
    raise exception 'drift: private.trg_deal changed (it must still not log processor changes)'; end if;
end $$;

create function private.trg_deal_processor() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
declare v_name text;
begin
  if new.processor_id is not distinct from old.processor_id then return new; end if;
  if new.processor_id is null then
    perform private.log_activity(new.id, 'deal.processor', 'deal', new.id, 'Processor unassigned');
    return new;
  end if;
  select coalesce(nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), nullif(p.email, ''), 'a user')
    into v_name from public.profiles p where p.id = new.processor_id;
  perform private.log_activity(new.id, 'deal.processor', 'deal', new.id, 'Processor set to ' || coalesce(v_name, 'a user'));
  perform private.notify(array[new.processor_id], 'processor', new.id,
    'You are now the Processor on ' || coalesce(nullif(new.file_number, ''), 'an order'), '#/deals/' || new.id::text);
  return new;
end $$;

revoke all on function private.trg_deal_processor() from public, anon, authenticated;

create trigger deals_processor_activity
  after update of processor_id on public.deals
  for each row when (old.processor_id is distinct from new.processor_id)
  execute function private.trg_deal_processor();

commit;
