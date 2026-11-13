-- Rollback for 20261117050000_thread_people_set_based.sql: puts back the 20261116140000 per-thread version (same results, slower).
begin;
create or replace function public.thread_people(p_threads uuid[])
returns table (profile_id uuid, display_name text, role text)
language sql
stable
security definer
set search_path to pg_catalog, public, extensions
as $people$
  with t as (
    select th.id, th.deal_id
    from public.threads th
    where p_threads is not null
      and th.id = any (p_threads[1:200])
      and private.thread_member(th.id)
  ), ids as (
    select tp.thread_id, tp.profile_id from public.thread_participants tp join t on t.id = tp.thread_id
    union
    select m.thread_id, m.author_id from public.messages m join t on t.id = m.thread_id where m.author_id is not null
  )
  select distinct on (p.id)
         p.id,
         nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
         case when p.role = 'Outside user' then coalesce((
                select dp.role from public.deal_participants dp join public.contacts c on c.id = dp.contact_id
                where c.profile_id = p.id and dp.deal_id = t.deal_id order by dp.role limit 1), 'Outside user')
              else p.role end
  from ids join t on t.id = ids.thread_id join public.profiles p on p.id = ids.profile_id
  order by p.id
$people$;
revoke all on function public.thread_people(uuid[]) from public;
revoke all on function public.thread_people(uuid[]) from anon;
grant execute on function public.thread_people(uuid[]) to authenticated;
commit;
