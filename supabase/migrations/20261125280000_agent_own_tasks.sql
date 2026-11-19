-- FF-101a (tracker row FF-101a). Francis Santos, Nov 18 2026 11 AM meeting notes,
-- confirmed by John Nov 18 2:13 PM ET. Real estate agents (buyer agent / listing agent)
-- and a transaction coordinator acting for them see only their own tasks on a file.
-- Staff views are unchanged. Does not apply itself. Rollback:
-- supabase/rollbacks/20261125280000_agent_own_tasks.sql
begin;
set local lock_timeout = '3s';

do $pre$
begin
  if to_regprocedure('private.outside_readable_task_ids()') is null then
    raise exception 'drift: private.outside_readable_task_ids() is missing';
  end if;
  if to_regprocedure('private.reader_gate()') is null then
    raise exception 'drift: private.reader_gate() is missing';
  end if;
  if to_regclass('public.agent_tc_links') is null then
    raise exception 'drift: agent_tc_links is missing (TC-2 must be applied first)';
  end if;
end
$pre$;

-- Outside users: own tasks, tasks for a role they hold on the file (including a
-- linked agent's role for a coordinator), or an agent task they finish on behalf
-- of that agent. No more "every task on my side".
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
    union
    select p.deal_id, p.role
    from public.agent_tc_links l
    join public.contacts tc on tc.id = l.tc_contact_id
    join public.deal_participants p
      on p.contact_id = l.agent_contact_id
     and p.role in ('Buyer Agent', 'Listing Agent')
    cross join g
    where g.role = 'Outside user'
      and tc.profile_id = g.uid
  ),
  per_deal as (
    select d.deal_id,
      coalesce((
        select array_agg(x.role order by array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], x.role))
        from (select distinct s.role from role_src s where s.deal_id = d.deal_id) x
      ), array['Outside user']::text[]) as roles
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
        t.assigned_role in ('Buyer Agent', 'Listing Agent')
        and t.owner_profile_id is not null
        and exists (
          select 1
          from public.agent_tc_links l
          join public.contacts tc on tc.id = l.tc_contact_id and tc.profile_id = g.uid
          join public.contacts ag on ag.id = l.agent_contact_id and ag.profile_id = t.owner_profile_id
          join public.deal_participants p
            on p.deal_id = t.deal_id
           and p.contact_id = ag.id
           and p.role = t.assigned_role
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

-- Keep the older per-row helper in the same shape when something still calls it.
create or replace function private.task_readable(p_task uuid)
returns boolean
language sql
stable
security definer
set search_path to pg_catalog, public, extensions
set jit = off
as $task$
  select exists (
    select 1
    from private.reader_gate() g
    join public.tasks t on t.id = p_task
    where (
        (g.active and (g.is_admin or coalesce(g.role in ('Processor', 'Sales Team', 'Transaction Coordinator'), false)))
        or private.reader_can_deal(t.deal_id, g.uid, g.role, g.is_admin, g.contact_id, g.active)
      )
      and (
        g.staffish
        or t.id in (select private.outside_readable_task_ids())
      )
  )
$task$;

revoke all on function private.task_readable(uuid) from public;
grant execute on function private.task_readable(uuid) to authenticated;

-- Write / submit helper used by agent task RPCs (TC-3). Own tasks only, plus TC on behalf.
create or replace function private.task_visible(owner uuid, assigned text, d uuid)
returns boolean
language sql
stable
security definer
set search_path to pg_catalog, public, extensions
as $$
  select private.is_staffish()
      or owner = private.effective_uid()
      or (owner is null and assigned = any (private.deal_roles(d)))
      or (
        assigned in ('Buyer Agent', 'Listing Agent')
        and owner is not null
        and exists (
          select 1
          from public.agent_tc_links l
          join public.contacts tc on tc.id = l.tc_contact_id and tc.profile_id = private.effective_uid()
          join public.contacts ag on ag.id = l.agent_contact_id and ag.profile_id = owner
          join public.deal_participants p
            on p.deal_id = d
           and p.contact_id = ag.id
           and p.role = assigned
        )
      )
$$;

-- Audience limit: an agent audience still requires the task to be theirs (or their TC's).
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
          union
          select p.role
          from public.agent_tc_links l
          join public.contacts tc on tc.id = l.tc_contact_id and tc.profile_id = g.uid
          join public.deal_participants p
            on p.deal_id = t.deal_id
           and p.contact_id = l.agent_contact_id
           and p.role in ('Buyer Agent', 'Listing Agent')
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
        or ('Buyer Agent' = any (r.roles) and 'buyer_agent' = any (t.audiences)
          and (t.owner_profile_id = g.uid
               or (t.owner_profile_id is null and t.assigned_role = 'Buyer Agent')
               or (t.assigned_role = 'Buyer Agent' and t.owner_profile_id is not null and exists (
                     select 1 from public.agent_tc_links l
                     join public.contacts tc on tc.id = l.tc_contact_id and tc.profile_id = g.uid
                     join public.contacts ag on ag.id = l.agent_contact_id and ag.profile_id = t.owner_profile_id
                     join public.deal_participants p on p.deal_id = t.deal_id and p.contact_id = ag.id and p.role = 'Buyer Agent'
                   ))))
        or ('Listing Agent' = any (r.roles) and 'listing_agent' = any (t.audiences)
          and (t.owner_profile_id = g.uid
               or (t.owner_profile_id is null and t.assigned_role = 'Listing Agent')
               or (t.assigned_role = 'Listing Agent' and t.owner_profile_id is not null and exists (
                     select 1 from public.agent_tc_links l
                     join public.contacts tc on tc.id = l.tc_contact_id and tc.profile_id = g.uid
                     join public.contacts ag on ag.id = l.agent_contact_id and ag.profile_id = t.owner_profile_id
                     join public.deal_participants p on p.deal_id = t.deal_id and p.contact_id = ag.id and p.role = 'Listing Agent'
                   ))))
      )
  )
$aud$;

do $check$
begin
  if position('agent_tc_links' in pg_get_functiondef('private.outside_readable_task_ids()'::regprocedure)) = 0 then
    raise exception 'readback: outside_readable_task_ids does not keep a coordinator on the agent''s tasks';
  end if;
  if position('side_of(t.assigned_role)' in pg_get_functiondef('private.outside_readable_task_ids()'::regprocedure)) > 0 then
    raise exception 'readback: outside_readable_task_ids still opens every task on the agent''s side';
  end if;
  if position('agent_tc_links' in pg_get_functiondef('private.task_visible(uuid, text, uuid)'::regprocedure)) = 0 then
    raise exception 'readback: task_visible does not keep a coordinator on the agent''s tasks';
  end if;
end
$check$;

select private.lock_function_search_paths();
commit;
notify pgrst, 'reload schema';
