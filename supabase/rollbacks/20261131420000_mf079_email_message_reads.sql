-- Undo MF-079: drop per-message reads and restore the file-level-cursor counts
-- in open_order_mail and deal_email_unread_counts. deal_email_reads is kept.
begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

drop function if exists public.mark_deal_email_read(uuid, uuid);

drop policy if exists deal_email_message_reads_update on public.deal_email_message_reads;
drop policy if exists deal_email_message_reads_insert on public.deal_email_message_reads;
drop policy if exists deal_email_message_reads_select on public.deal_email_message_reads;
drop table if exists public.deal_email_message_reads;

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
    where e.sent_by is distinct from (select auth.uid())
      and not (e.direction = 'out' and e.mailbox_profile_id is not distinct from (select auth.uid()))
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

select private.lock_function_search_paths();

commit;

notify pgrst, 'reload schema';
