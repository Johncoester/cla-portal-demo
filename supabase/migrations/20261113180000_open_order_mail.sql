-- Open Orders unread icons were a second round of queries after the order list:
-- every thread this person is on, then messages in batches, then every deal_emails row.
-- One count replaces that download. It does not add a way to read message bodies.
-- Row security still decides which threads and emails this person can see.
-- Rollback: supabase/rollbacks/20261113180000_open_order_mail.sql

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

do $$
begin
  if to_regclass('public.thread_participants') is null
     or to_regclass('public.threads') is null
     or to_regclass('public.messages') is null
     or to_regclass('public.deal_emails') is null
     or to_regclass('public.deal_email_reads') is null then
    raise exception 'drift: open order mail tables are missing';
  end if;
  if to_regprocedure('public.open_order_mail(jsonb)') is not null then
    raise exception 'drift: public.open_order_mail(jsonb) already exists';
  end if;
end $$;

create function public.open_order_mail(p_local jsonb default '{}'::jsonb)
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

commit;
