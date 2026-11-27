-- MF-079 (Matt, confirmed Nov 27 2026, Gmail 1a21df0b0dc7c8f3): a file email stays unread
-- until that person opens that specific message. Opening the Email tab no longer marks
-- every message on the file as read. Unread rows get a slight color change in the app.
-- MF-001 (Open Orders bell) and MF-002 (Email tab count) use this per-message state.
--
-- New table public.deal_email_message_reads: one row per person per message (profile_id,
-- email_id), with own-row RLS. A signed-in user can only insert a row for an email they
-- can already see (deal_emails row security, or list_deal_emails for parties). The older
-- deal_email_reads cursor is kept so mail already marked read by opening the tab stays
-- read. This file also updates public.open_order_mail and public.deal_email_unread_counts
-- to skip a message that has a per-message read row.
-- Rollback: supabase/rollbacks/20261131420000_mf079_email_message_reads.sql
begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

do $$
begin
  if to_regclass('public.deal_emails') is null then
    raise exception 'drift: public.deal_emails is missing';
  end if;
  if to_regclass('public.deal_email_reads') is null then
    raise exception 'drift: public.deal_email_reads is missing';
  end if;
  if to_regclass('public.deal_email_message_reads') is not null then
    raise exception 'drift: public.deal_email_message_reads already exists';
  end if;
end $$;

create table public.deal_email_message_reads (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  email_id uuid not null references public.deal_emails(id) on delete cascade,
  deal_id uuid not null references public.deals(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (profile_id, email_id)
);

create index deal_email_message_reads_deal on public.deal_email_message_reads (profile_id, deal_id);

alter table public.deal_email_message_reads enable row level security;
revoke all on public.deal_email_message_reads from public, anon, authenticated;
grant select, insert, update on public.deal_email_message_reads to authenticated;
grant all on public.deal_email_message_reads to service_role;

-- Own rows only. No email body lives here. A person cannot read another person's rows.
create policy deal_email_message_reads_select on public.deal_email_message_reads
  for select to authenticated
  using (profile_id = (select auth.uid()));

-- Insert / update only your own row. Visibility is enforced by public.mark_deal_email_read,
-- which only writes when the caller can already see that email.
create policy deal_email_message_reads_insert on public.deal_email_message_reads
  for insert to authenticated
  with check (profile_id = (select auth.uid()));

create policy deal_email_message_reads_update on public.deal_email_message_reads
  for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create or replace function public.mark_deal_email_read(p_email uuid, p_deal uuid)
returns void
language plpgsql
security definer
set search_path to pg_catalog, public, extensions
as $fn$
declare
  me uuid := private.effective_uid();
  doc record;
  allowed boolean := false;
begin
  if me is null then
    raise exception 'Please sign in.' using errcode = '28000';
  end if;
  if p_email is null or p_deal is null then
    raise exception 'Email not found.' using errcode = 'P0002';
  end if;
  if private.is_viewing_as() then
    return;
  end if;
  select e.id, e.deal_id into doc from public.deal_emails e where e.id = p_email and e.deal_id = p_deal;
  if not found then
    raise exception 'Email not found.' using errcode = 'P0002';
  end if;
  if private.is_staffish() and private.can_access_deal(p_deal)
     and p_deal in (select private.demo_visible_deal_ids()) then
    allowed := true;
  elsif exists (select 1 from public.list_deal_emails(p_deal) x where x.id = p_email) then
    allowed := true;
  end if;
  if not allowed then
    raise exception 'Email not found.' using errcode = 'P0002';
  end if;
  insert into public.deal_email_message_reads (profile_id, email_id, deal_id, read_at)
  values (me, p_email, p_deal, pg_catalog.now())
  on conflict (profile_id, email_id) do update set read_at = excluded.read_at;
end
$fn$;
revoke all on function public.mark_deal_email_read(uuid, uuid) from public, anon;
grant execute on function public.mark_deal_email_read(uuid, uuid) to authenticated;

-- Open Orders bell: portal threads unchanged; Gmail counts skip mail this person already
-- opened (per-message row) or that was already covered by their older file-level cursor.
create or replace function public.open_order_mail(p_local jsonb default '{}'::jsonb)
returns table (deal_id uuid, portal_count integer, gmail_count integer)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  with portal as (
    select t.deal_id, count(*)::integer as n
    from public.thread_participants tp
    join public.threads t on t.id = tp.thread_id
    join public.messages m on m.thread_id = tp.thread_id
    where tp.profile_id = (select auth.uid())
      and m.author_id is distinct from (select auth.uid())
      and m.created_at > coalesce(tp.last_read_at, '-infinity'::timestamptz)
    group by t.deal_id
  ),
  gmail as (
    select e.deal_id, count(*)::integer as n
    from public.deal_emails e
    left join public.deal_email_reads r
      on r.deal_id = e.deal_id and r.profile_id = (select auth.uid())
    left join public.deal_email_message_reads mr
      on mr.email_id = e.id and mr.profile_id = (select auth.uid())
    where e.sent_by is distinct from (select auth.uid())
      and not (e.direction = 'out' and e.mailbox_profile_id is not distinct from (select auth.uid()))
      and mr.email_id is null
      and e.sent_at > greatest(
        coalesce(r.read_at, '-infinity'::timestamptz),
        coalesce(
          case
            when jsonb_typeof(p_local) = 'object'
             and (p_local ->> e.deal_id::text) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
            then (p_local ->> e.deal_id::text)::timestamptz
            else null
          end,
          '-infinity'::timestamptz))
    group by e.deal_id
  )
  select coalesce(p.deal_id, g.deal_id), coalesce(p.n, 0), coalesce(g.n, 0)
  from portal p
  full join gmail g on g.deal_id = p.deal_id
  where coalesce(p.n, 0) + coalesce(g.n, 0) > 0;
$$;

revoke all on function public.open_order_mail(jsonb) from public, anon;
grant execute on function public.open_order_mail(jsonb) to authenticated;

create or replace function public.deal_email_unread_counts()
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
  left join public.deal_email_message_reads mr
    on mr.email_id = e.id and mr.profile_id = (select auth.uid())
  where (select auth.uid()) is not null
    and mr.email_id is null
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

do $chk$
begin
  if not exists (
    select 1 from pg_tables
     where schemaname = 'public' and tablename = 'deal_email_message_reads'
  ) then
    raise exception 'self-check: deal_email_message_reads is missing';
  end if;
  if not has_table_privilege('authenticated', 'public.deal_email_message_reads', 'SELECT')
     or has_table_privilege('anon', 'public.deal_email_message_reads', 'SELECT') then
    raise exception 'self-check: deal_email_message_reads must be for signed-in users only';
  end if;
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'deal_email_message_reads'
       and policyname = 'deal_email_message_reads_select'
       and qual like '%auth.uid()%'
  ) then
    raise exception 'self-check: select policy must be own-row';
  end if;
  if not has_function_privilege('authenticated', 'public.mark_deal_email_read(uuid, uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.mark_deal_email_read(uuid, uuid)', 'EXECUTE') then
    raise exception 'self-check: mark_deal_email_read must be for signed-in users only';
  end if;
end
$chk$;

select private.lock_function_search_paths();

commit;

notify pgrst, 'reload schema';
