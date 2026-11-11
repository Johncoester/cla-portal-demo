-- Restores file_title and deal_party_names to the first-and-last names.
begin;
set local lock_timeout = '3s';

create or replace function private.file_title(p_deal uuid)
returns text
language sql
stable
security definer
set search_path to pg_catalog, public, extensions
as $fn$
  with c as (select dc.role, coalesce(nullif(trim(dc.last_name), ''), trim(dc.first_name)) n, dp.created_at, dp.id
             from public.deal_contacts(p_deal) dc join public.deal_participants dp on dp.id = dc.participant_id
             where dc.role in ('Client-Buyer', 'Client-Seller')),
       g as (select role, n, min(created_at) m, min(id::text) i from c where coalesce(n, '') <> '' group by role, n)
  select concat_ws(' / ', (select string_agg(n, ' & ' order by m, i) from g where role = 'Client-Buyer'),
                          (select string_agg(n, ' & ' order by m, i) from g where role = 'Client-Seller'))
$fn$;

create or replace function private.deal_party_names()
returns table(deal_id uuid, party_names text[])
language sql
stable
security definer
set search_path to pg_catalog, public, extensions
set jit = off
as $fn$
  with g as materialized (
    select * from private.reader_gate()
  ),
  visible as (
    select d.id
    from public.deals d
    cross join g
    where d.is_demo = g.is_demo
      and private.reader_can_deal(d.id, g.uid, g.role, g.is_admin, g.contact_id, g.active)
  ),
  roles as (
    select v.id as deal_id,
      case
        when g.role is null then '{}'::text[]
        when g.role <> 'Outside user' then array[g.role]::text[]
        else coalesce((
          select array_agg(x.role order by array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], x.role))
          from (
            select distinct p.role
            from public.deal_participants p
            join public.contacts c on c.id = p.contact_id
            where p.deal_id = v.id
              and c.profile_id = g.uid
              and p.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller')
          ) x
        ), array['Outside user']::text[])
      end as roles
    from visible v
    cross join g
  ),
  shaped as (
    select r.deal_id,
      r.roles,
      case
        when g.role is null then null::text
        when g.role <> 'Outside user' then g.role
        else coalesce(r.roles[1], 'Outside user')
      end as deal_role,
      case
        when g.role is distinct from 'Outside user' then 'staff'
        else (
          select case when count(distinct s) = 1 then max(s) end
          from (
            select case ur
              when 'Buyer Agent' then 'buyer'
              when 'Client-Buyer' then 'buyer'
              when 'Listing Agent' then 'seller'
              when 'Client-Seller' then 'seller'
            end as s
            from unnest(r.roles) ur
          ) q
          where s is not null
        )
      end as side
    from roles r
    cross join g
  ),
  flags as (
    select s.deal_id, s.deal_role,
      (g.uid is not null and not g.staffish and coalesce(s.side <> 'staff', false)
        and 'Client-Buyer' = any (s.roles)
        and not (s.roles && array['Buyer Agent', 'Listing Agent']::text[])) as pure_buyer,
      (g.uid is not null and not g.staffish and coalesce(s.side <> 'staff', false)
        and 'Client-Seller' = any (s.roles)
        and not ('Client-Buyer' = any (s.roles))
        and not (s.roles && array['Buyer Agent', 'Listing Agent']::text[])) as pure_seller
    from shaped s
    cross join g
  )
  select f.deal_id,
         coalesce(array_agg(distinct trim(c.first_name || ' ' || c.last_name)), '{}'::text[])
  from flags f
  join public.deal_participants dp on dp.deal_id = f.deal_id
  join public.contacts c on c.id = dp.contact_id
  where not (
      f.deal_role in ('Client-Buyer', 'Client-Seller')
      and dp.role like 'Client-%'
      and dp.role <> f.deal_role
    )
    and not (dp.role = 'Listing Agent' and f.pure_buyer)
    and not (dp.role = 'Buyer Agent' and f.pure_seller)
  group by f.deal_id
$fn$;
commit;
