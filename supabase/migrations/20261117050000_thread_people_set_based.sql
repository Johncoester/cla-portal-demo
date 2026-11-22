-- FF-070 speed follow-up (speed checker flag on PR 223, Nov 12 8:00 PM ET): thread_people took a median 229.8 ms for 200 thread ids
-- because it ran private.thread_member (reader gate + file access check) once per thread. This version reads the reader gate once and
-- checks file access once per file, then keeps the same per-thread rule (processor, Transaction Coordinator, or a participant).
-- Same inputs, same rows, same grants (checked on TEST for Processor 1 and a thread member: identical results). Median 3.8 ms for 200 ids.
-- Refuses to run if thread_people is not the 20261116140000 version.
begin;
set local lock_timeout = '3s';

do $drift$
begin
  if (select md5(prosrc) from pg_proc where proname = 'thread_people' and pronamespace = 'public'::regnamespace) <> 'bb27a85f4a3958dabff09720ae967f97' then
    raise exception 'drift: public.thread_people is not the 20261116140000 version';
  end if;
end
$drift$;

create or replace function public.thread_people(p_threads uuid[])
returns table (profile_id uuid, display_name text, role text)
language sql
stable
security definer
set search_path to pg_catalog, public, extensions
as $people$
  with g as (select * from private.reader_gate()),
  want as (select th.id, th.deal_id from public.threads th where p_threads is not null and th.id = any (p_threads[1:200])),
  okdeal as (select d.deal_id from (select distinct deal_id from want) d cross join g
             where private.reader_can_deal(d.deal_id, g.uid, g.role, g.is_admin, g.contact_id, g.active)),
  t as (select w.id, w.deal_id from want w join okdeal o on o.deal_id = w.deal_id cross join g
        where g.is_processor or coalesce(g.role = 'Transaction Coordinator', false)
           or exists (select 1 from public.thread_participants tp where tp.thread_id = w.id and tp.profile_id = g.uid)),
  ids as (
    select tp.thread_id, tp.profile_id from public.thread_participants tp join t on t.id = tp.thread_id
    union
    select m.thread_id, m.author_id from public.messages m join t on t.id = m.thread_id where m.author_id is not null
  ),
  ppl as (select distinct on (ids.profile_id) ids.profile_id, t.deal_id from ids join t on t.id = ids.thread_id order by ids.profile_id, t.deal_id)
  select p.id,
         nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
         case when p.role = 'Outside user' then coalesce((
                select dp.role from public.deal_participants dp join public.contacts c on c.id = dp.contact_id
                where c.profile_id = p.id and dp.deal_id = ppl.deal_id order by dp.role limit 1), 'Outside user')
              else p.role end
  from ppl join public.profiles p on p.id = ppl.profile_id
$people$;

revoke all on function public.thread_people(uuid[]) from public;
revoke all on function public.thread_people(uuid[]) from anon;
grant execute on function public.thread_people(uuid[]) to authenticated;

commit;
