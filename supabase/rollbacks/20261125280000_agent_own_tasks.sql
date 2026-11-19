-- Undo FF-101a. Agents again see every task on their side. Staff unchanged.
-- Restores outside_readable_task_ids from 20261112030000 and task_visible /
-- task_outside_audience to the pre-FF-101a shapes (TC-3 side-wide + behalf).
begin;
set local lock_timeout = '3s';

create or replace function private.outside_readable_task_ids()
returns setof uuid
language sql
stable
security definer
rows 200
set search_path to pg_catalog, public, extensions
set jit = off
as $tasks$
  with g as materialized (
    select * from private.reader_gate()
  ),
  role_src as (
    select p.deal_id, p.role
    from public.deal_participants p
    join public.contacts c on c.id = p.contact_id
    cross join g
    where g.role = 'Outside user'
      and c.profile_id = g.uid
      and p.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller')
  ),
  per_deal as (
    select d.deal_id,
      coalesce((
        select array_agg(x.role order by array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], x.role))
        from (select distinct s.role from role_src s where s.deal_id = d.deal_id) x
      ), array['Outside user']::text[]) as roles,
      coalesce((
        select s.role
        from role_src s
        where s.deal_id = d.deal_id
        order by array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], s.role)
        limit 1
      ), 'Outside user') as one_role
    from (select distinct deal_id from role_src) d
  )
  select t.id
  from public.tasks t
  cross join g
  left join per_deal r on r.deal_id = t.deal_id
  where (
      (g.active and (g.is_admin or coalesce(g.role in ('Processor', 'Sales Team', 'Transaction Coordinator'), false)))
      or private.reader_can_deal(t.deal_id, g.uid, g.role, g.is_admin, g.contact_id, g.active)
    )
    and (
      g.staffish
      or t.owner_profile_id = g.uid
      or (
        t.owner_profile_id is null
        and t.assigned_role = any (
          case
            when g.role is null then '{}'::text[]
            when g.role <> 'Outside user' then array[g.role]::text[]
            else coalesce(r.roles, array['Outside user']::text[])
          end
        )
      )
      or (
        (case
           when g.role is null then null::text
           when g.role <> 'Outside user' then g.role
           else coalesce(r.one_role, 'Outside user')
         end) in ('Buyer Agent', 'Listing Agent')
        and private.side_of(t.assigned_role) = private.side_of(
          case
            when g.role is null then null::text
            when g.role <> 'Outside user' then g.role
            else coalesce(r.one_role, 'Outside user')
          end
        )
      )
    )
    and not (
      t.assigned_role = 'Client-Buyer'
      and private.emd_receipt_title(t.title)
      and g.uid is not null
      and not g.staffish
      and coalesce(
        (case
           when g.role is distinct from 'Outside user' then 'staff'
           else (
             select case when count(distinct s) = 1 then max(s) end
             from (
               select private.side_of(rr) as s
               from unnest(coalesce(r.roles, array['Outside user']::text[])) rr
             ) q
             where s is not null
           )
         end) <> 'staff',
        false
      )
      and 'Client-Buyer' = any (coalesce(r.roles, array['Outside user']::text[]))
      and not (coalesce(r.roles, array['Outside user']::text[]) && array['Buyer Agent', 'Listing Agent']::text[])
    )
$tasks$;

revoke all on function private.outside_readable_task_ids() from public;
grant execute on function private.outside_readable_task_ids() to authenticated;

create or replace function private.task_visible(owner uuid, assigned text, d uuid)
returns boolean
language sql
stable
security definer
set search_path to pg_catalog, public, extensions
as $$
  select private.is_staffish() or owner = private.effective_uid()
      or (owner is null and assigned = any (private.deal_roles(d)))
      or exists (
        select 1 from unnest(private.deal_roles(d)) r
        where r in ('Buyer Agent', 'Listing Agent')
          and private.side_of(assigned) = private.side_of(r)
      )
$$;

create or replace function private.task_outside_audience(p_task uuid)
returns boolean
language sql
stable
security definer
set search_path to pg_catalog, public, extensions
set jit = off
as $aud$
  with g as materialized (
    select * from private.reader_gate()
  ),
  one as (
    select t.* from public.tasks t where t.id = p_task
  ),
  roles as (
    select case
      when g.role is null then '{}'::text[]
      when g.role <> 'Outside user' then array[g.role]::text[]
      else coalesce((
        select array_agg(x.role order by array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], x.role))
        from (
          select distinct p.role
          from public.deal_participants p
          join public.contacts c on c.id = p.contact_id
          where p.deal_id = t.deal_id
            and c.profile_id = g.uid
            and p.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller')
        ) x
      ), array['Outside user']::text[])
    end as roles
    from one t
    cross join g
  )
  select exists (
    select 1
    from one t
    cross join g
    cross join roles r
    where t.audiences is not null
      and (
        ('Client-Buyer' = any (r.roles) and 'buyer' = any (t.audiences)
          and (t.owner_profile_id = g.uid or (t.owner_profile_id is null and t.assigned_role = 'Client-Buyer'))
          and not (t.audiences = array['internal']::text[]))
        or ('Client-Seller' = any (r.roles) and 'seller' = any (t.audiences)
          and (t.owner_profile_id = g.uid or (t.owner_profile_id is null and t.assigned_role = 'Client-Seller'))
          and not (t.audiences = array['internal']::text[]))
        or ('Buyer Agent' = any (r.roles) and 'buyer_agent' = any (t.audiences))
        or ('Listing Agent' = any (r.roles) and 'listing_agent' = any (t.audiences))
      )
  )
$aud$;

select private.lock_function_search_paths();
commit;
notify pgrst, 'reload schema';
