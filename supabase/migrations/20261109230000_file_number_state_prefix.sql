-- John, Nov 9: MD-26-97220 is 3650 Southwest 13th Street, Miami, FL but got the MD prefix.
-- Root cause: deals.file_number defaulted to the hard-coded ('MD-26-' || nextval('file_number_seq')) for every state.
-- Fix:
--   * a new file's number is <property state>-<YY>-<next file_number_seq>, e.g. FL-26-97221 (YY = the current America/New_York year).
--     A blank or non 2-letter state falls back to MD. An explicit file_number on insert (e.g. DEMO-100) is kept.
--   * when the property state changes while the file is still new (status Open and no file email / outbox message has been sent to
--     anyone outside @clatitle.com), the prefix follows the new state and the change is logged as 'deal.file_number'.
--     After something has gone outside, the number is kept. The sequence part never changes, so numbers stay unique.
--   * existing files are NOT renumbered by this migration.
-- Rollback: supabase/rollbacks/20261109230000_file_number_state_prefix.sql
begin;
set local lock_timeout = '3s';
do $$
begin
  if to_regprocedure('private.deal_file_number()') is not null or to_regprocedure('private.file_number_prefix(text)') is not null then
    raise exception 'drift: file number functions already exist'; end if;
  if exists (select 1 from pg_trigger where tgrelid = 'public.deals'::regclass and tgname = 'deals_file_number') then
    raise exception 'drift: deals_file_number trigger already exists'; end if;
  if (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'deals' and column_name = 'file_number')
     is distinct from '(''MD-26-''::text || nextval(''file_number_seq''::regclass))' then
    raise exception 'drift: deals.file_number default is not the expected MD-26- default'; end if;
end $$;

create function private.file_number_prefix(p_state text) returns text
language sql immutable set search_path = pg_catalog as $$
  select case when upper(btrim(coalesce(p_state, ''))) ~ '^[A-Z]{2}$' then upper(btrim(p_state)) else 'MD' end $$;

create function private.deal_file_number() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  m text[]; next_number text;
begin
  if tg_op = 'INSERT' then
    if new.file_number is null or btrim(new.file_number) = '' then
      new.file_number := private.file_number_prefix(new.state) || '-' || to_char(now() at time zone 'America/New_York', 'YY') || '-' || nextval('public.file_number_seq');
    end if;
    return new;
  end if;
  -- UPDATE OF state
  if new.state is not distinct from old.state or new.file_number is distinct from old.file_number or new.status <> 'Open' then return new; end if;
  m := regexp_match(old.file_number, '^([A-Z]{2})-(\d{2})-(\d+)$');
  if m is null then return new; end if;
  next_number := private.file_number_prefix(new.state) || '-' || m[2] || '-' || m[3];
  if next_number = old.file_number then return new; end if;
  if exists (select 1 from public.deal_emails e where e.deal_id = old.id and e.direction = 'out'
               and exists (select 1 from unnest(coalesce(e.to_emails, '{}') || coalesce(e.cc_emails, '{}') || coalesce(e.bcc_emails, '{}')) a
                           where btrim(a) <> '' and lower(btrim(a)) not like '%@clatitle.com'))
     or exists (select 1 from public.outbox o where o.deal_id = old.id and (o.sent_at is not null or o.status = 'sent')
               and exists (select 1 from unnest(array[o.to_email] || coalesce(o.cc_emails, '{}') || coalesce(o.bcc_emails, '{}')) a
                           where btrim(coalesce(a, '')) <> '' and lower(btrim(a)) not like '%@clatitle.com')) then
    return new;   -- something carrying the number already went outside CLA: keep it
  end if;
  if exists (select 1 from public.deals d where d.file_number = next_number and d.id <> old.id) then return new; end if;
  new.file_number := next_number;
  perform private.log_activity(old.id, 'deal.file_number', 'deal', old.id, 'File number changed from ' || old.file_number || ' to ' || next_number || ' (property state ' || coalesce(new.state, '') || ')');
  return new;
end $$;

revoke all on function private.deal_file_number() from public;
revoke all on function private.file_number_prefix(text) from public;

create trigger deals_file_number before insert or update of state on public.deals
  for each row execute function private.deal_file_number();

alter table public.deals alter column file_number drop default;

commit;
