-- TC-3 (tracker row 367). John Coester, Nov 18 2026, 11:27 AM, confirmed 11:35 AM,
-- and 11:37 AM. When a real estate agent is added to a file, each linked transaction
-- coordinator is added on that same side. A coordinator login can do what that agent
-- can do on the file. Removing the agent does not remove the coordinator.
-- Not applied by this commit. Rollback: supabase/rollbacks/20261125250000_agent_tc_on_file.sql
begin;
set local lock_timeout = '3s';

do $$
begin
  if to_regclass('public.agent_tc_links') is null then
    raise exception 'drift: agent_tc_links is missing (TC-2 must be applied first)';
  end if;
  if to_regprocedure('private.file_roles_of(uuid, uuid)') is null then
    raise exception 'drift: file_roles_of is missing';
  end if;
  if to_regprocedure('private.reader_can_deal(uuid, uuid, text, boolean, uuid, boolean)') is null then
    raise exception 'drift: reader_can_deal is missing';
  end if;
end $$;

-- Roles the signed-in outside user gets because their linked agent holds them on this file.
create or replace function private.linked_agent_roles(pid uuid, d uuid)
returns text[]
language sql
stable
security definer
set search_path to pg_catalog, public, extensions
as $$
  select coalesce((
    select array_agg(s.role order by s.role)
    from (
      select distinct p.role
      from public.agent_tc_links l
      join public.contacts tc on tc.id = l.tc_contact_id and tc.profile_id = pid
      join public.deal_participants p on p.deal_id = d and p.contact_id = l.agent_contact_id
      where p.role in ('Buyer Agent', 'Listing Agent')
        and exists (
          select 1 from public.profiles pr
          where pr.id = pid and pr.role = 'Outside user' and pr.status = 'active'
        )
    ) s
  ), '{}'::text[])
$$;

-- The outside user's own file roles, plus the agent roles they hold through a coordinator link.
create or replace function private.outside_roles(pid uuid, d uuid)
returns text[]
language sql
stable
security definer
set search_path to pg_catalog, public, extensions
as $$
  select coalesce((
    select array_agg(x.role order by array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], x.role))
    from (
      select distinct p.role
      from public.deal_participants p
      join public.contacts c on c.id = p.contact_id
      where p.deal_id = d and c.profile_id = pid
        and p.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller')
      union
      select unnest(private.linked_agent_roles(pid, d))
    ) x
  ), '{}'::text[])
$$;

create or replace function private.tc_for_agent(tc uuid, agent uuid, d uuid, role text)
returns boolean
language sql
stable
security definer
set search_path to pg_catalog, public, extensions
as $$
  select role in ('Buyer Agent', 'Listing Agent')
    and tc is distinct from agent
    and exists (
      select 1
      from public.agent_tc_links l
      join public.contacts tcc on tcc.id = l.tc_contact_id and tcc.profile_id = tc
      join public.contacts ag on ag.id = l.agent_contact_id and ag.profile_id = agent
      join public.deal_participants p on p.deal_id = d and p.contact_id = ag.id and p.role = role
    )
$$;

create or replace function private.file_role_of(pid uuid, d uuid)
returns text
language sql
stable
security definer
set search_path to pg_catalog, public, extensions
as $$
  select case when pr.role is distinct from 'Outside user' then pr.role
    else coalesce(private.outside_roles(pid, d)[1], 'Outside user') end
  from (select (select role from public.profiles where id = pid) as role) pr
$$;

create or replace function private.file_roles_of(pid uuid, d uuid)
returns text[]
language sql
stable
security definer
set search_path to pg_catalog, public, extensions
as $$
  select case
    when pr.role is null then '{}'::text[]
    when pr.role <> 'Outside user' then
      coalesce((
        select array_agg(q.r order by q.ord, array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], q.r))
        from (
          select pr.role as r, 0 as ord
          union all
          select x.role, 1
          from (
            select distinct p.role
            from public.deal_participants p
            join public.contacts c on c.id = p.contact_id
            where p.deal_id = d and c.profile_id = pid
              and p.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller')
          ) x
        ) q
      ), array[pr.role])
    else case when cardinality(private.outside_roles(pid, d)) = 0
      then array['Outside user']::text[]
      else private.outside_roles(pid, d) end
  end
  from (select (select role from public.profiles where id = pid) as role) pr
$$;

create or replace function private.can_access_deal(d uuid)
returns boolean
language sql
stable
security definer
set search_path to pg_catalog, public, extensions
as $$
  select private.me_role() is not null and (
    private.is_admin() or private.me_role() in ('Processor', 'Sales Team', 'Transaction Coordinator')
    or (private.me_role() = 'Preprocessor' and exists (select 1 from public.deals x where x.id = d and x.preprocessor_user_id = private.effective_uid()))
    or (private.me_role() in ('Sales Person', 'Sales Team') and exists (select 1 from public.deal_sales_people s where s.deal_id = d and s.sales_id = private.effective_uid()))
    or exists (select 1 from public.deal_participants p where p.deal_id = d and p.contact_id = private.my_contact_id())
    or cardinality(private.linked_agent_roles(private.effective_uid(), d)) > 0)
$$;

create or replace function private.reader_can_deal(
  p_deal uuid, p_uid uuid, p_role text, p_admin boolean, p_contact uuid, p_active boolean
) returns boolean
language sql
stable
security definer
set search_path to pg_catalog, public, extensions
set jit = off
as $$
  select coalesce(p_active, false) and (
    coalesce(p_admin, false)
    or coalesce(p_role in ('Processor', 'Sales Team', 'Transaction Coordinator'), false)
    or (p_role = 'Preprocessor' and exists (
          select 1 from public.deals x where x.id = p_deal and x.preprocessor_user_id = p_uid))
    or (p_role in ('Sales Person', 'Sales Team') and exists (
          select 1 from public.deal_sales_people s where s.deal_id = p_deal and s.sales_id = p_uid))
    or exists (
          select 1 from public.deal_participants p
          where p.deal_id = p_deal and p.contact_id = p_contact)
    or cardinality(private.linked_agent_roles(p_uid, p_deal)) > 0
  )
$$;

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
      or private.tc_for_agent(private.effective_uid(), owner, d, assigned)
$$;

-- Add each linked coordinator on the agent's side. A refinance has none.
-- p_deal null: open files only (a new link). p_deal set: that file (the agent was just added).
-- Never removes a coordinator when the agent is removed.
create or replace function private.place_agent_tcs(p_agent uuid, p_deal uuid)
returns void
language plpgsql
security definer
set search_path to pg_catalog, public, extensions
as $$
begin
  insert into public.deal_participants (deal_id, contact_id, role)
  select p.deal_id, l.tc_contact_id,
         case p.role when 'Listing Agent' then 'Listing Agent TC' else 'Buyer Agent TC' end
  from public.deal_participants p
  join public.deals d on d.id = p.deal_id
  join public.agent_tc_links l on l.agent_contact_id = p.contact_id
  where p.contact_id = p_agent
    and p.role in ('Buyer Agent', 'Listing Agent')
    and (p_deal is null or p.deal_id = p_deal)
    and (p_deal is not null or d.status = 'Open')
    and d.transaction_type is distinct from 'Refinance'
    and l.tc_contact_id is distinct from p.contact_id
    and not exists (
      select 1 from public.deal_participants x
      where x.deal_id = p.deal_id
        and x.contact_id = l.tc_contact_id
        and x.role = case p.role when 'Listing Agent' then 'Listing Agent TC' else 'Buyer Agent TC' end
    );
end $$;

create or replace function private.place_agent_tcs_row()
returns trigger
language plpgsql
security definer
set search_path to pg_catalog, public, extensions
as $$
begin
  perform private.place_agent_tcs(new.contact_id, new.deal_id);
  return new;
end $$;

drop trigger if exists agent_tc_place_on_agent on public.deal_participants;
create trigger agent_tc_place_on_agent
  after insert on public.deal_participants
  for each row
  when (new.role in ('Buyer Agent', 'Listing Agent'))
  execute function private.place_agent_tcs_row();

create or replace function private.place_agent_tcs_link()
returns trigger
language plpgsql
security definer
set search_path to pg_catalog, public, extensions
as $$
begin
  perform private.place_agent_tcs(new.agent_contact_id, null);
  return new;
end $$;

drop trigger if exists agent_tc_place_on_link on public.agent_tc_links;
create trigger agent_tc_place_on_link
  after insert on public.agent_tc_links
  for each row
  execute function private.place_agent_tcs_link();

-- Submit stays with the agent's task. The coordinator is recorded on behalf of that agent.
create or replace function private.rpc_submit_agent_task(p_task uuid, p_answers jsonb)
returns integer
language plpgsql
security definer
set search_path to pg_catalog, public, extensions
as $$
declare t public.tasks; n int; saved jsonb; note text := ''; sched boolean;
begin
  select * into t from public.tasks where id = p_task and kind = 'agent';
  if not found or not private.can_access_deal(t.deal_id) or not private.task_visible(t.owner_profile_id, t.assigned_role, t.deal_id) then
    raise exception 'Task not found' using errcode = 'P0001';
  end if;
  if t.owner_profile_id is distinct from private.effective_uid() then
    if not private.tc_for_agent(private.effective_uid(), t.owner_profile_id, t.deal_id, t.assigned_role) then
      raise exception 'Only the agent this task is for can submit it.' using errcode = 'P0001';
    end if;
    note := ' on behalf of ' || private.person_name(t.owner_profile_id);
  end if;
  if t.status = 'cancelled' then raise exception 'This task was cancelled.' using errcode = 'P0001'; end if;
  sched := t.template_code = 'agent_schedule_settlement' and to_regprocedure('private.save_side_schedule(uuid, jsonb, text)') is not null
    and not exists (select 1 from pg_trigger where tgname = 'tasks_schedule_apply' and tgrelid = 'public.tasks'::regclass);
  if sched then
    p_answers := coalesce(p_answers, '{}'::jsonb) || jsonb_build_object('side', case when t.assigned_role = 'Listing Agent' then 'seller' else 'buyer' end);
  end if;
  perform private.agent_validate(t.template_code, p_answers);
  if sched then
    saved := private.save_side_schedule(t.deal_id, p_answers, 'agent');
    p_answers := saved;
  end if;
  select coalesce(max(r.n), 0) + 1 into n from public.agent_task_revisions r where r.task_id = p_task;
  insert into public.agent_task_revisions (task_id, n, answers, by_profile) values (p_task, n, p_answers, private.effective_uid());
  perform set_config('cla.form_rpc', 'on', true);
  update public.tasks set form_data = p_answers, saved_at = now(), saved_by = private.effective_uid(), status = 'done', completed_at = now(), completed_by = private.effective_uid() where id = p_task;
  perform set_config('cla.form_rpc', '', true);
  perform private.log_activity(t.deal_id, case when n = 1 then 'task.submitted' else 'task.revised' end, 'task', t.id,
    t.title || case when n = 1 then ': submitted' else ': revision ' || (n - 1) || ' submitted' end || note);
  perform private.notify(array[(select processor_id from public.deals where id = t.deal_id)], 'task', t.deal_id,
    private.person_name(private.effective_uid()) || case when n = 1 then ' completed "' else ' revised "' end || t.title || '"' || note,
    '#/deals/' || t.deal_id || '/tasks/' || t.id);
  return n;
end $$;

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

revoke all on function private.linked_agent_roles(uuid, uuid) from public, anon, authenticated;
revoke all on function private.outside_roles(uuid, uuid) from public, anon, authenticated;
revoke all on function private.tc_for_agent(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.place_agent_tcs(uuid, uuid) from public, anon, authenticated;
revoke all on function private.place_agent_tcs_row() from public, anon, authenticated;
revoke all on function private.place_agent_tcs_link() from public, anon, authenticated;

do $$
begin
  if position('outside_roles' in pg_get_functiondef('private.file_roles_of(uuid, uuid)'::regprocedure)) = 0 then
    raise exception 'readback: file_roles_of does not use the coordinator roles';
  end if;
  if position('linked_agent_roles' in pg_get_functiondef('private.can_access_deal(uuid)'::regprocedure)) = 0 then
    raise exception 'readback: can_access_deal does not see a linked coordinator';
  end if;
  if position('on behalf of' in pg_get_functiondef('private.rpc_submit_agent_task(uuid, jsonb)'::regprocedure)) = 0 then
    raise exception 'readback: submitting a task does not record on behalf of the agent';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'agent_tc_place_on_agent') then
    raise exception 'readback: adding an agent does not add the coordinator';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'agent_tc_place_on_link') then
    raise exception 'readback: a new link does not add the coordinator to open files';
  end if;
end $$;

select private.lock_function_search_paths();
commit;
notify pgrst, 'reload schema';
