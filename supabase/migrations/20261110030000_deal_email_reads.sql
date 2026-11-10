-- Per-user read cursor for file Gmail (deal_emails). MF-001 / MF-002.
-- One row per person per file: read_at is the moment they opened that file's Email tab.
-- Mail with sent_at after read_at is unread for that person only. Someone else's cursor is invisible.
-- This migration only ADDS objects. It does not alter public.deal_emails, its columns, or deal_emails_staff_select.
-- Buyers, sellers, and agents still cannot read deal_emails. They keep portal unread on thread_participants.last_read_at.
-- The write check repeats the existing deal_emails staff predicate (staff who can open the file) and does not replace it.
-- The browser still works if this migration has not been applied: it keeps the cursor in local storage and does not throw.
-- Rollback: supabase/rollbacks/20261110030000_deal_email_reads.sql

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

do $$
begin
  if to_regclass('public.deal_emails') is null then
    raise exception 'drift: public.deal_emails is missing';
  end if;
  if to_regclass('public.deal_email_reads') is not null then
    raise exception 'drift: public.deal_email_reads already exists';
  end if;
  if to_regprocedure('public.deal_email_unread_counts()') is not null then
    raise exception 'drift: public.deal_email_unread_counts() already exists';
  end if;
  if to_regprocedure('private.is_staffish()') is null then
    raise exception 'drift: private.is_staffish() is missing';
  end if;
end $$;

create table public.deal_email_reads (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  deal_id uuid not null references public.deals(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (profile_id, deal_id)
);

alter table public.deal_email_reads enable row level security;
revoke all on public.deal_email_reads from public, anon, authenticated;
grant select, insert, update on public.deal_email_reads to authenticated;
grant all on public.deal_email_reads to service_role;

-- Own cursor only. No email body lives here. A person cannot read another person's cursor.
create policy deal_email_reads_select on public.deal_email_reads
  for select to authenticated
  using (profile_id = (select auth.uid()));

-- Insert / update only your own row, and only on a file whose Gmail you can already open
-- (same predicate as deal_emails_staff_select: staff + the deals select policy). Not a new way in.
create policy deal_email_reads_insert on public.deal_email_reads
  for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and (select private.is_staffish())
    and exists (select 1 from public.deals d where d.id = deal_id)
  );

create policy deal_email_reads_update on public.deal_email_reads
  for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (
    profile_id = (select auth.uid())
    and (select private.is_staffish())
    and exists (select 1 from public.deals d where d.id = deal_id)
  );

-- Counts for the signed-in user. security invoker: deal_emails RLS still decides which rows exist
-- (staff who can open the file). Buyers, sellers, and agents get no rows. Does not bypass RLS.
create function public.deal_email_unread_counts()
returns table (deal_id uuid, unread integer)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select e.deal_id, count(*)::integer
  from public.deal_emails e
  left join public.deal_email_reads r
    on r.deal_id = e.deal_id
   and r.profile_id = (select auth.uid())
  where (select auth.uid()) is not null
    and e.sent_at > coalesce(r.read_at, '-infinity'::timestamptz)
    and e.sent_by is distinct from (select auth.uid())
    and not (
      e.direction = 'out'
      and e.mailbox_profile_id is not distinct from (select auth.uid())
    )
  group by e.deal_id
$$;

revoke all on function public.deal_email_unread_counts() from public, anon;
grant execute on function public.deal_email_unread_counts() to authenticated;

commit;
