-- Undo TC-3. Coordinators already on a file stay on that file (they are ordinary people on the file).
-- The link table from TC-2 stays. File roles go back to the person's own roles.
begin;
set local lock_timeout = '3s';

drop trigger if exists agent_tc_place_on_agent on public.deal_participants;
drop trigger if exists agent_tc_place_on_link on public.agent_tc_links;
drop function if exists private.place_agent_tcs_link();
drop function if exists private.place_agent_tcs_row();
drop function if exists private.place_agent_tcs(uuid, uuid);

create or replace function private.file_role_of(pid uuid, d uuid)
returns text
language sql stable security definer
set search_path to pg_catalog, public, extensions
as $$
  select case when pr.role is distinct from 'Outside user' then pr.role
    else coalesce((select p.role from public.deal_participants p join public.contacts c on c.id = p.contact_id
                   where p.deal_id = d and c.profile_id = pid and p.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller')
                   order by array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], p.role) limit 1), 'Outside user') end
  from (select (select role from public.profiles where id = pid) as role) pr
$$;

create or replace function private.file_roles_of(pid uuid, d uuid)
returns text[]
language sql stable security definer
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
    else coalesce((
      select array_agg(x.role order by array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], x.role))
      from (
        select distinct p.role
        from public.deal_participants p
        join public.contacts c on c.id = p.contact_id
        where p.deal_id = d and c.profile_id = pid
          and p.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller')
      ) x
    ), array['Outside user'])
  end
  from (select (select role from public.profiles where id = pid) as role) pr
$$;

create or replace function private.can_access_deal(d uuid) returns boolean
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select private.me_role() is not null and (
    private.is_admin() or private.me_role() in ('Processor', 'Sales Team', 'Transaction Coordinator')
    or (private.me_role() = 'Preprocessor' and exists (select 1 from public.deals x where x.id = d and x.preprocessor_user_id = private.effective_uid()))
    or (private.me_role() in ('Sales Person', 'Sales Team') and exists (select 1 from public.deal_sales_people s where s.deal_id = d and s.sales_id = private.effective_uid()))
    or exists (select 1 from public.deal_participants p where p.deal_id = d and p.contact_id = private.my_contact_id()))
$$;

create or replace function private.reader_can_deal(p_deal uuid, p_uid uuid, p_role text, p_admin boolean, p_contact uuid, p_active boolean)
returns boolean language sql stable security definer set search_path to pg_catalog, public, extensions set jit = off as $$
  select coalesce(p_active, false) and (
    coalesce(p_admin, false)
    or coalesce(p_role in ('Processor', 'Sales Team', 'Transaction Coordinator'), false)
    or (p_role = 'Preprocessor' and exists (select 1 from public.deals x where x.id = p_deal and x.preprocessor_user_id = p_uid))
    or (p_role in ('Sales Person', 'Sales Team') and exists (select 1 from public.deal_sales_people s where s.deal_id = p_deal and s.sales_id = p_uid))
    or exists (select 1 from public.deal_participants p where p.deal_id = p_deal and p.contact_id = p_contact))
$$;

create or replace function private.task_visible(owner uuid, assigned text, d uuid)
returns boolean language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select private.is_staffish() or owner = private.effective_uid()
      or (owner is null and assigned = any (private.deal_roles(d)))
      or (private.deal_role(d) in ('Buyer Agent', 'Listing Agent') and private.side_of(assigned) = private.side_of(private.deal_role(d)))
$$;

create or replace function private.rpc_my_file_roles_full()
returns table(deal_id uuid, role text, roles text[], label text, self_rep boolean)
language sql stable security definer
set search_path to pg_catalog, public, extensions
set jit to 'off' as $$
  with g as materialized (select * from private.reader_gate()),
  visible as (
    select d.id from public.deals d cross join g
    where private.reader_can_deal(d.id, g.uid, g.role, g.is_admin, g.contact_id, g.active)
  ),
  party as (
    select v.id as deal_id, p.role
    from visible v cross join g
    join public.deal_participants p on p.deal_id = v.id
    join public.contacts c on c.id = p.contact_id and c.profile_id = g.uid
    where p.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller')
  ),
  roles as (
    select v.id as deal_id,
      case
        when g.role is null then '{}'::text[]
        when g.role <> 'Outside user' then
          coalesce((
            select array_agg(q.r order by q.ord, array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], q.r))
            from (select g.role as r, 0 as ord union all select p.role, 1 from party p where p.deal_id = v.id) q
          ), array[g.role]::text[])
        else coalesce((
          select array_agg(p.role order by array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], p.role))
          from party p where p.deal_id = v.id
        ), array['Outside user']::text[])
      end as roles
    from visible v cross join g
  )
  select r.deal_id,
         case when g.role is null then null::text when g.role <> 'Outside user' then g.role else coalesce(r.roles[1], 'Outside user') end,
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
           ) from party p where p.deal_id = r.deal_id
         ), false)
  from roles r cross join g where g.active
$$;

create or replace function private.rpc_submit_agent_task(p_task uuid, p_answers jsonb)
returns integer language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
declare t public.tasks; n int; saved jsonb; sched boolean;
begin
  select * into t from public.tasks where id = p_task and kind = 'agent';
  if not found or not private.can_access_deal(t.deal_id) or not private.task_visible(t.owner_profile_id, t.assigned_role, t.deal_id) then
    raise exception 'Task not found' using errcode = 'P0001';
  end if;
  if t.owner_profile_id is distinct from private.effective_uid() then
    raise exception 'Only the agent this task is for can submit it.' using errcode = 'P0001';
  end if;
  if t.status = 'cancelled' then raise exception 'This task was cancelled.' using errcode = 'P0001'; end if;
  sched := t.template_code = 'agent_schedule_settlement' and to_regprocedure('private.save_side_schedule(uuid, jsonb, text)') is not null
    and not exists (select 1 from pg_trigger where tgname = 'tasks_schedule_apply' and tgrelid = 'public.tasks'::regclass);
  if sched then
    p_answers := coalesce(p_answers, '{}'::jsonb) || jsonb_build_object('side', case when t.assigned_role = 'Listing Agent' then 'seller' else 'buyer' end);
  end if;
  perform private.agent_validate(t.template_code, p_answers);
  if sched then saved := private.save_side_schedule(t.deal_id, p_answers, 'agent'); p_answers := saved; end if;
  select coalesce(max(r.n), 0) + 1 into n from public.agent_task_revisions r where r.task_id = p_task;
  insert into public.agent_task_revisions (task_id, n, answers, by_profile) values (p_task, n, p_answers, private.effective_uid());
  perform set_config('cla.form_rpc', 'on', true);
  update public.tasks set form_data = p_answers, saved_at = now(), saved_by = private.effective_uid(), status = 'done', completed_at = now(), completed_by = private.effective_uid() where id = p_task;
  perform set_config('cla.form_rpc', '', true);
  perform private.log_activity(t.deal_id, case when n = 1 then 'task.submitted' else 'task.revised' end, 'task', t.id, t.title || case when n = 1 then ': submitted' else ': revision ' || (n - 1) || ' submitted' end);
  perform private.notify(array[(select processor_id from public.deals where id = t.deal_id)], 'task', t.deal_id, private.person_name(private.effective_uid()) || case when n = 1 then ' completed "' else ' revised "' end || t.title || '"', '#/deals/' || t.deal_id || '/tasks/' || t.id);
  return n;
end $$;

drop function if exists private.tc_for_agent(uuid, uuid, uuid, text);
drop function if exists private.outside_roles(uuid, uuid);
drop function if exists private.linked_agent_roles(uuid, uuid);

do $$
begin
  if position('linked_agent_roles' in pg_get_functiondef('private.file_roles_of(uuid, uuid)'::regprocedure)) > 0
     or position('outside_roles' in pg_get_functiondef('private.file_roles_of(uuid, uuid)'::regprocedure)) > 0 then
    raise exception 'readback: file_roles_of still uses coordinator roles';
  end if;
  if exists (select 1 from pg_trigger where tgname in ('agent_tc_place_on_agent', 'agent_tc_place_on_link')) then
    raise exception 'readback: a coordinator place trigger is still present';
  end if;
end $$;

commit;
notify pgrst, 'reload schema';
