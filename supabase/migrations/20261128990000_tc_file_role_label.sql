-- TC-PROFILE-1 (John, Nov 21 2026): an outside transaction coordinator who is on a file only because they work for
-- that file's agent (private.linked_agent_roles) is labelled 'Transaction Coordinator' instead of the agent's side.
-- Only the label column changes. deal_id, role, roles and self_rep are exactly as before, so nothing about what
-- anyone can see or do changes: the portal still treats the coordinator as their agent on that file for access.
-- A person who is on the file in their own right (as an agent or a client) keeps the label they had.
create or replace function private.rpc_my_file_roles_full()
 returns table(deal_id uuid, role text, roles text[], label text, self_rep boolean)
 language sql
 stable security definer
 set search_path to 'pg_catalog', 'public', 'extensions'
 set jit to 'off'
as $function$
  with g as materialized (
    select * from private.reader_gate()
  ),
  visible as (
    select d.id
    from public.deals d
    cross join g
    where private.reader_can_deal(d.id, g.uid, g.role, g.is_admin, g.contact_id, g.active)
  ),
  own as (
    select v.id as deal_id, p.role
    from visible v
    cross join g
    join public.deal_participants p on p.deal_id = v.id
    join public.contacts c on c.id = p.contact_id and c.profile_id = g.uid
    where p.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller')
  ),
  linked as (
    select v.id as deal_id, r.role
    from visible v
    cross join g
    cross join lateral unnest(private.linked_agent_roles(g.uid, v.id)) as r(role)
  ),
  party as (
    select o.deal_id, o.role from own o
    union
    select l.deal_id, l.role from linked l
  ),
  roles as (
    select v.id as deal_id,
      case
        when g.role is null then '{}'::text[]
        when g.role <> 'Outside user' then
          coalesce((
            select array_agg(q.r order by q.ord, array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], q.r))
            from (
              select g.role as r, 0 as ord
              union all
              select p.role, 1 from party p where p.deal_id = v.id
            ) q
          ), array[g.role]::text[])
        else coalesce((
          select array_agg(p.role order by array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], p.role))
          from party p where p.deal_id = v.id
        ), array['Outside user']::text[])
      end as roles
    from visible v
    cross join g
  )
  select r.deal_id,
         case
           when g.role is null then null::text
           when g.role <> 'Outside user' then g.role
           else coalesce(r.roles[1], 'Outside user')
         end,
         case when g.role is null then '{}'::text[] else r.roles end,
         case
           when r.roles @> array['Client-Buyer', 'Buyer Agent']::text[] then 'Buyer + Buyer''s Agent'
           when r.roles @> array['Client-Seller', 'Listing Agent']::text[] then 'Seller + Listing Agent'
           when g.role is distinct from 'Outside user' then g.role
           when exists (select 1 from linked l where l.deal_id = r.deal_id)
            and not exists (select 1 from own o where o.deal_id = r.deal_id) then 'Transaction Coordinator'
           else coalesce(r.roles[1], 'Outside user')
         end,
         coalesce((
           select cardinality(array_agg(distinct p.role)) = 2 and (
             (array_agg(distinct p.role) @> array['Client-Buyer', 'Buyer Agent']::text[])
             or (array_agg(distinct p.role) @> array['Client-Seller', 'Listing Agent']::text[])
           )
           from party p where p.deal_id = r.deal_id
         ), false)
  from roles r
  cross join g
  where g.active
$function$;
