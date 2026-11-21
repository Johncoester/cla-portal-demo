-- Rollback for 20261128990000_tc_file_role_label.sql: puts back the TC-3 body (20261125250000_agent_tc_on_file.sql), where a
-- coordinator on a file through their agent is labelled with the agent's side. Only the label column differs.
create or replace function private.rpc_my_file_roles_full()
returns table(deal_id uuid, role text, roles text[], label text, self_rep boolean)
language sql stable security definer
set search_path to pg_catalog, public, extensions
set jit to 'off' as $$
  with g as materialized (
    select * from private.reader_gate()
  ),
  visible as (
    select d.id
    from public.deals d
    cross join g
    where private.reader_can_deal(d.id, g.uid, g.role, g.is_admin, g.contact_id, g.active)
  ),
  party as (
    select v.id as deal_id, p.role
    from visible v
    cross join g
    join public.deal_participants p on p.deal_id = v.id
    join public.contacts c on c.id = p.contact_id and c.profile_id = g.uid
    where p.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller')
    union
    select v.id, r.role
    from visible v
    cross join g
    cross join lateral unnest(private.linked_agent_roles(g.uid, v.id)) as r(role)
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
$$;
