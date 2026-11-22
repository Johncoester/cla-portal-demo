-- FF-050 (Francis, Nov 11 email; tracker row 176): staff can change one file's number.
-- New files still get a number from private.deal_file_number on insert. This trigger runs only when file_number itself is updated.
-- A blank number is refused. A number already on another file is refused in plain words. The old number is written to the activity log.
-- Rollback: supabase/rollbacks/20261123020000_edit_file_number.sql
begin;
set local lock_timeout = '3s';
do $$
begin
  if to_regprocedure('private.deal_file_number_edit()') is not null then
    raise exception 'drift: deal_file_number_edit already exists'; end if;
  if exists (select 1 from pg_trigger where tgrelid = 'public.deals'::regclass and tgname = 'deals_file_number_edit') then
    raise exception 'drift: deals_file_number_edit trigger already exists'; end if;
  if to_regprocedure('private.log_activity(uuid,text,text,uuid,text)') is null then
    raise exception 'drift: private.log_activity is missing'; end if;
end $$;

create function private.deal_file_number_edit() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $fn$
declare
  next_number text;
begin
  next_number := regexp_replace(btrim(coalesce(new.file_number, '')), '\s+', ' ', 'g');
  if next_number = '' then
    raise exception 'Enter a file number.';
  end if;
  if char_length(next_number) > 40 then
    raise exception 'A file number can be up to 40 characters. Shorten it and save again.';
  end if;
  if next_number !~ $re$^[A-Za-z0-9][A-Za-z0-9 ._/#'-]*$$re$ then
    raise exception 'Use letters, numbers, and these marks only: space, hyphen, period, slash, and #.';
  end if;
  new.file_number := next_number;
  if next_number = old.file_number then return new; end if;
  if exists (select 1 from public.deals d where d.id <> old.id and lower(d.file_number) = lower(next_number)) then
    raise exception 'That file number is already on another file. Enter a different number.';
  end if;
  perform private.log_activity(old.id, 'deal.file_number', 'deal', old.id, 'File number changed from ' || old.file_number || ' to ' || next_number);
  return new;
end $fn$;

revoke all on function private.deal_file_number_edit() from public;

create trigger deals_file_number_edit before update of file_number on public.deals
  for each row execute function private.deal_file_number_edit();

commit;
