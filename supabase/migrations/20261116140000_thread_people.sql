-- FF-070 (Janine's video, Nov 12 "CLA Portal Test - Processor and Seller Screens"; Francis Feedback ticket):
-- a seller saw the processor's messages as "Participant" because profiles row security hides CLA staff from outside users.
-- thread_people returns ONLY a display name and a role for the people in conversations the caller is a member of
-- (private.thread_member, the same check as the threads / thread_participants read policies). No email, phone or other profile data.
-- Outside users get their role on that conversation's file (Client-Buyer, Client-Seller, Buyer Agent, ...); CLA staff get their CLA role.
begin;
set local lock_timeout = '3s';

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

comment on function public.thread_people(uuid[]) is
  'FF-070: display name and role (only) of the people in conversations the caller is a member of (private.thread_member). At most 200 thread ids.';

revoke all on function public.thread_people(uuid[]) from public;
revoke all on function public.thread_people(uuid[]) from anon;
grant execute on function public.thread_people(uuid[]) to authenticated;

commit;
