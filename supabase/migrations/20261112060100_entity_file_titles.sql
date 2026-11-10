-- Open Orders title: an entity buyer or seller is named by the entity, not a blank first and last name.
-- Same function the orders list already calls. One set-based read. Not applied by this commit.
begin;
set local lock_timeout = '3s';

create or replace function public.deal_file_titles(p_deal uuid default null)
returns table (deal_id uuid, file_title text)
language sql
stable
security definer
set search_path to pg_catalog, public, extensions
set jit = off
as $titles$
  with g as materialized (
    select * from private.reader_gate()
  ),
  visible as (
    select d.id
    from public.deals d
    cross join g
    where (p_deal is null or d.id = p_deal)
      and d.is_demo = g.is_demo
      and private.reader_can_deal(d.id, g.uid, g.role, g.is_admin, g.contact_id, g.active)
  ),
  file_role as (
    select v.id as deal_id,
      case
        when g.role is distinct from 'Outside user' then g.role
        else coalesce((
          select p.role
          from public.deal_participants p
          join public.contacts c on c.id = p.contact_id
          where p.deal_id = v.id
            and c.profile_id = g.uid
            and p.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller')
          order by array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], p.role)
          limit 1
        ), 'Outside user')
      end as deal_role
    from visible v
    cross join g
  ),
  people as (
    select fr.deal_id,
           dp.role,
           coalesce(nullif(btrim(ent.name), ''), nullif(btrim(c.last_name), ''), nullif(btrim(c.first_name), ''), nullif(btrim(c.company), '')) as n,
           dp.created_at,
           dp.id
    from file_role fr
    join public.deal_participants dp on dp.deal_id = fr.deal_id
    join public.contacts c on c.id = dp.contact_id
    left join (
      select distinct on (e.participant_id) e.participant_id, e.name
      from public.participant_entities e
      where e.removed_at is null and btrim(coalesce(e.name, '')) <> ''
      order by e.participant_id, e.set_at desc nulls last
    ) ent on ent.participant_id = dp.id
    where dp.role in ('Client-Buyer', 'Client-Seller')
      and not (
        fr.deal_role in ('Client-Buyer', 'Client-Seller')
        and dp.role like 'Client-%'
        and dp.role <> fr.deal_role
      )
  ),
  grouped as (
    select deal_id, role, n, min(created_at) as m, min(id::text) as i
    from people
    where coalesce(n, '') <> ''
    group by deal_id, role, n
  )
  select v.id,
         concat_ws(' / ',
           (select string_agg(gr.n, ' & ' order by gr.m, gr.i) from grouped gr where gr.deal_id = v.id and gr.role = 'Client-Buyer'),
           (select string_agg(gr.n, ' & ' order by gr.m, gr.i) from grouped gr where gr.deal_id = v.id and gr.role = 'Client-Seller'))
  from visible v
$titles$;

do $readback$
begin
  if position('participant_entities' in (select p.prosrc from pg_proc p where p.oid = 'public.deal_file_titles(uuid)'::regprocedure)) = 0 then
    raise exception 'readback: the order title still ignores an entity name';
  end if;
end
$readback$;
commit;
