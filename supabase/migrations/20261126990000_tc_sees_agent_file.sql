-- TC-VIS-1. John Coester, Nov 20 2026 (standing rule, restated) and Nov 21 2026: a transaction coordinator
-- sees everything their agent sees on the file, open and closed tasks, commissions and other agent fees.
-- Rule 9 waived by John for this fix (chat, Nov 21 2026, 11:19 AM ET).
--
-- Cause: every coordinator check looked only at public.agent_tc_links. On TEST that table is empty, and
-- coordinators were put on files directly as "Buyer Agent TC" or "Listing Agent TC". Those coordinators got
-- none of their agent's tasks or fees. Now a coordinator acts for an agent when either is true:
--   1. they are linked to the agent (agent_tc_links), or
--   2. they are on this file as that side's coordinator and that side has an agent.
-- Nothing is stored or moved. Only read and permission functions change.
-- Rollback: supabase/rollbacks/20261126990000_tc_sees_agent_file.sql
begin;
set local lock_timeout = '3s';

do $$
declare v record;
begin
  for v in select * from (values
    ('private.linked_agent_roles(uuid,uuid)', '79e1bb88381a7851b93ffc6268dae7fa08454a17bac0ef3085576408ffbd03cd'),
    ('private.tc_for_agent(uuid,uuid,uuid,text)', '8366990fdb9dbe6a7ee03abad01d98edca68d83c31a17b9cbaaffb708151b5ad'),
    ('private.task_visible(uuid,text,uuid)', 'ca5f51d35ecdf61c97ef5c48028508a85252bc6d42a1f5ae349438535bab4dbe'),
    ('private.outside_readable_task_ids()', 'd9a866e501c224f78c3635af8f5a214d64a8c2994231f9421edf2b8cb82941b8'),
    ('private.task_outside_audience(uuid)', 'a1bea056402f2f946db4b0e8716eeceb19de72f4d8506a77c8219cd60be2ff4a'),
    ('private.agent_fee_actor(uuid,text)', 'e10cc2aac7263787f330f1554a55ac3c6b0581535aeb8b90433710c7d1af7d46'),
    ('private.agent_answers_visible(tasks)', '409eae5708571866ce9f2be2e52c6b7114eb405865e4d74f947f4d9afc727eac'),
    ('private.rpc_get_task_form(uuid)', '16d9d25b459ed8e537815806e44d7a3ea09bfee6235585e19b4920e3f2e4248b'),
    ('private.rpc_save_task_form(uuid,jsonb,boolean)', '8d21fa6cad81ea6ec2db3502dea2d7489e711f92ff1e55e1db2aafb5d8e4119a'),
    ('public.my_task_list(text)', 'd273a0ce8144af9b8ec9568acfc83bd966251d652adb4787bd074d356977879c')
  ) as w(sig, h) loop
    if to_regprocedure(v.sig) is null then
      raise exception 'drift: % is missing', v.sig;
    end if;
    if (select encode(sha256(convert_to(prosrc, 'UTF8')), 'hex') from pg_proc where oid = to_regprocedure(v.sig)) <> v.h then
      raise exception 'drift: % is not the captured TEST body', v.sig;
    end if;
  end loop;
  if to_regclass('public.agent_tc_links') is null then
    raise exception 'drift: agent_tc_links is missing (TC-2)';
  end if;
end $$;

-- my_task_list runs as the signed-in person. It asks this helper for the coordinator roles on one file.
create or replace function private.my_tc_agent_roles(d uuid)
returns text[]
language sql
stable
security definer
set search_path to pg_catalog, public, extensions
as $function$
  select private.linked_agent_roles(private.effective_uid(), d)
$function$;


create or replace function private.linked_agent_roles(pid uuid, d uuid)
returns text[]
language plpgsql
stable
security definer
set search_path to pg_catalog, public, extensions
as $function$
-- plpgsql keeps its query plan between calls. This runs once per file for every list of files and tasks.
begin
  return coalesce((
    select array_agg(s.role order by s.role)
    from (
      select p.role
      from public.agent_tc_links l
      join public.contacts tc on tc.id = l.tc_contact_id and tc.profile_id = pid
      join public.deal_participants p on p.deal_id = d and p.contact_id = l.agent_contact_id
      where p.role in ('Buyer Agent', 'Listing Agent')
      union
      select a.role
      from public.deal_participants x
      join public.contacts tc on tc.id = x.contact_id and tc.profile_id = pid
      join public.deal_participants a
        on a.deal_id = x.deal_id
       and a.role = case x.role when 'Buyer Agent TC' then 'Buyer Agent' else 'Listing Agent' end
      where x.deal_id = d and x.role in ('Buyer Agent TC', 'Listing Agent TC')
    ) s
    where exists (
      select 1 from public.profiles pr
      where pr.id = pid and pr.role = 'Outside user' and pr.status = 'active'
    )
  ), '{}'::text[]);
end
$function$;

create or replace function private.tc_for_agent(tc uuid, agent uuid, d uuid, role text)
returns boolean
language plpgsql
stable
security definer
set search_path to pg_catalog, public, extensions
as $function$
begin
  return tc_for_agent.role in ('Buyer Agent', 'Listing Agent')
    and tc is distinct from agent
    and (
      exists (
        select 1
        from public.agent_tc_links l
        join public.contacts tcc on tcc.id = l.tc_contact_id and tcc.profile_id = tc
        join public.contacts ag on ag.id = l.agent_contact_id and ag.profile_id = agent
        join public.deal_participants p on p.deal_id = d and p.contact_id = ag.id and p.role = tc_for_agent.role
      )
      or exists (
        select 1
        from public.deal_participants x
        join public.contacts tcc on tcc.id = x.contact_id and tcc.profile_id = tc
        join public.deal_participants a on a.deal_id = d and a.role = tc_for_agent.role
        join public.contacts ag on ag.id = a.contact_id and ag.profile_id = agent
        where x.deal_id = d and x.role = tc_for_agent.role || ' TC'
      )
    );
end
$function$;

create or replace function private.tc_acts_on_task(p_task uuid)
returns boolean
language sql
stable
security definer
set search_path to pg_catalog, public, extensions
as $function$
  select coalesce((
    select t.assigned_role in ('Buyer Agent', 'Listing Agent')
      and t.owner_profile_id is distinct from private.effective_uid()
      and (
        (t.owner_profile_id is not null
          and private.tc_for_agent(private.effective_uid(), t.owner_profile_id, t.deal_id, t.assigned_role))
        or (t.owner_profile_id is null and t.participant_id is not null and exists (
          select 1
          from public.deal_participants a
          where a.id = t.participant_id and a.deal_id = t.deal_id and a.role = t.assigned_role
            and (
              exists (
                select 1 from public.agent_tc_links l
                join public.contacts tc on tc.id = l.tc_contact_id and tc.profile_id = private.effective_uid()
                where l.agent_contact_id = a.contact_id and l.tc_contact_id <> a.contact_id)
              or exists (
                select 1 from public.deal_participants x
                join public.contacts tc on tc.id = x.contact_id and tc.profile_id = private.effective_uid()
                where x.deal_id = t.deal_id and x.role = t.assigned_role || ' TC' and x.contact_id <> a.contact_id)
            )
        ))
      )
    from public.tasks t
    where t.id = p_task
  ), false)
$function$;

create or replace function private.task_visible(owner uuid, assigned text, d uuid)
returns boolean
language sql
stable
security definer
set search_path to pg_catalog, public, extensions
as $function$
  select private.is_staffish()
      or owner = private.effective_uid()
      or (owner is null and assigned = any (private.deal_roles(d)))
      or (owner is not null and private.tc_for_agent(private.effective_uid(), owner, d, assigned))
$function$;

CREATE OR REPLACE FUNCTION private.outside_readable_task_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER ROWS 200
 SET search_path TO 'pg_catalog', 'public', 'extensions'
 SET jit TO 'off'
AS $function$
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
    union
    -- On the file as that side's transaction coordinator, with an agent on that side.
    select x.deal_id, a.role
    from public.deal_participants x
    join public.contacts tc on tc.id = x.contact_id
    join public.deal_participants a
      on a.deal_id = x.deal_id
     and a.role = case x.role when 'Buyer Agent TC' then 'Buyer Agent' else 'Listing Agent' end
    cross join g
    where g.role = 'Outside user'
      and tc.profile_id = g.uid
      and x.role in ('Buyer Agent TC', 'Listing Agent TC')
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
      or (
        t.assigned_role in ('Buyer Agent', 'Listing Agent')
        and t.owner_profile_id is not null
        and exists (
          select 1
          from public.deal_participants x
          join public.contacts tc on tc.id = x.contact_id and tc.profile_id = g.uid
          join public.deal_participants a on a.deal_id = t.deal_id and a.role = t.assigned_role
          join public.contacts ag on ag.id = a.contact_id and ag.profile_id = t.owner_profile_id
          where x.deal_id = t.deal_id
            and x.role = t.assigned_role || ' TC'
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
$function$;

CREATE OR REPLACE FUNCTION private.task_outside_audience(p_task uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
 SET jit TO 'off'
AS $function$
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
          union
          select a.role
          from public.deal_participants x
          join public.contacts tc on tc.id = x.contact_id and tc.profile_id = g.uid
          join public.deal_participants a
            on a.deal_id = x.deal_id
           and a.role = case x.role when 'Buyer Agent TC' then 'Buyer Agent' else 'Listing Agent' end
          where x.deal_id = t.deal_id
            and x.role in ('Buyer Agent TC', 'Listing Agent TC')
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
               or (t.assigned_role = 'Buyer Agent' and t.owner_profile_id is not null
                   and private.tc_for_agent(g.uid, t.owner_profile_id, t.deal_id, 'Buyer Agent'))))
        or ('Listing Agent' = any (r.roles) and 'listing_agent' = any (t.audiences)
          and (t.owner_profile_id = g.uid
               or (t.owner_profile_id is null and t.assigned_role = 'Listing Agent')
               or (t.assigned_role = 'Listing Agent' and t.owner_profile_id is not null
                   and private.tc_for_agent(g.uid, t.owner_profile_id, t.deal_id, 'Listing Agent'))))
      )
  )
$function$;

-- A coordinator login (staff role) on this file as that side's coordinator, or linked to that side's agent.
create or replace function private.agent_fee_tc_side(p_uid uuid, d uuid, p_side text)
returns text
language sql
stable
security definer
set search_path to pg_catalog, public, extensions
as $function$
  select case when exists (
      select 1 from public.deal_participants x
      join public.contacts c on c.id = x.contact_id and c.profile_id = p_uid
      where x.deal_id = d and x.role = case p_side when 'buyer' then 'Buyer Agent TC' else 'Listing Agent TC' end
    ) or exists (
      select 1 from public.agent_tc_links l
      join public.contacts tc on tc.id = l.tc_contact_id and tc.profile_id = p_uid
      join public.deal_participants p on p.deal_id = d and p.contact_id = l.agent_contact_id
      where p.role = case p_side when 'buyer' then 'Buyer Agent' else 'Listing Agent' end
    ) then 'tc' end
$function$;

CREATE OR REPLACE FUNCTION private.agent_fee_actor(d uuid, p_side text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare v_uid uuid := private.effective_uid(); v_roles text[];
begin
  if v_uid is null or not private.can_access_deal(d) then return null; end if;
  if private.can_run_deal(d) then return 'staff'; end if;
  v_roles := private.file_roles_of(v_uid, d);
  if (p_side = 'buyer' and 'Buyer Agent' = any (v_roles)) or (p_side = 'listing' and 'Listing Agent' = any (v_roles)) then return 'agent'; end if;
  if private.me_role() = 'Transaction Coordinator' and (
       exists (select 1 from public.deals x where x.id = d and x.tc_user_id = v_uid)
       or exists (select 1 from public.deal_participants p join public.contacts c on c.id = p.contact_id
                    join public.team_members ag on ag.profile_id = c.profile_id and ag.member_role = 'agent'
                    join public.team_members co on co.team_id = ag.team_id and co.member_role = 'coordinator' and co.profile_id = v_uid
                   where p.deal_id = d and p.role = case p_side when 'buyer' then 'Buyer Agent' else 'Listing Agent' end)
       or 'tc' = private.agent_fee_tc_side(v_uid, d, p_side)) then
    return 'tc';
  end if;
  if private.is_staffish() and private.me_role() <> 'Transaction Coordinator' then return 'reader'; end if;
  return null;
end $function$;

create or replace function private.agent_answers_visible(t public.tasks)
returns boolean
language sql
stable
security definer
set search_path to pg_catalog, public, extensions
as $function$
  select t.owner_profile_id = private.effective_uid() or private.is_manager() or private.is_admin()
      or private.tc_acts_on_task(t.id) $function$;

CREATE OR REPLACE FUNCTION private.rpc_get_task_form(p_task uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare t public.tasks; d jsonb; k text; own_copy boolean;
begin
  select * into t from public.tasks where id = p_task;
  if not found or not private.can_access_deal(t.deal_id) or not private.task_visible(t.owner_profile_id, t.assigned_role, t.deal_id) then raise exception 'Task not found'; end if;
  -- A blank owner is this caller only when the task names their own participant. No participant, or another buyer's copy, is denied.
  own_copy := t.participant_id is not null and exists (
    select 1 from public.deal_participants dp
    join public.contacts c on c.id = dp.contact_id
    where dp.id = t.participant_id and c.profile_id = private.effective_uid()
  );
  if not coalesce(
    private.form_owner_or_manager(t.owner_profile_id)
    or private.agent_can_fill(p_task)
    or (t.owner_profile_id is null and own_copy)
    or private.tc_acts_on_task(p_task),
    false
  ) then raise exception 'Only the person, the processor and the coordinator can see these answers'; end if;
  d := t.form_data;
  if not (t.owner_profile_id = private.effective_uid() or private.is_processor() or (t.owner_profile_id is null and own_copy)) then
    foreach k in array private.masked_keys(t.template_id) loop
      if d ? k then d := d || jsonb_build_object(k, repeat(chr(8226), 4) || right(d->>k, 4)); end if; end loop; end if;
  return d; end $function$;

CREATE OR REPLACE FUNCTION private.rpc_save_task_form(p_task uuid, p_data jsonb, p_complete boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare t public.tasks; tp public.task_templates; clean jsonb; for_client boolean; prev uuid; note text := ''; self_rep boolean; holder boolean; own_copy boolean; tc_acts boolean;
begin
  p_data := coalesce(p_data, '{}'::jsonb) - 'ssn' - 'social_security' - 'full_ssn' - 'buyer_ssn';
  select * into t from public.tasks where id = p_task;
  if not found or not private.can_access_deal(t.deal_id) or not private.task_visible(t.owner_profile_id, t.assigned_role, t.deal_id) then raise exception 'Task not found'; end if;
  own_copy := t.participant_id is not null and exists (
    select 1 from public.deal_participants dp
    join public.contacts c on c.id = dp.contact_id
    where dp.id = t.participant_id and c.profile_id = private.effective_uid()
  );
  holder := t.owner_profile_id is null and own_copy;
  if holder then t.owner_profile_id := private.effective_uid(); end if;
  for_client := t.owner_profile_id is distinct from private.effective_uid() and private.agent_can_fill(p_task);
  -- A transaction coordinator fills in their agent's form, the same as the agent.
  tc_acts := not holder and not for_client and private.tc_acts_on_task(p_task);
  if t.kind <> 'form' or t.status = 'cancelled' or not coalesce(t.owner_profile_id = private.effective_uid() or private.is_manager() or for_client or holder or tc_acts, false) then raise exception 'You cannot fill in this task.'; end if;
  select * into tp from public.task_templates where id = t.template_id;
  clean := private.validate_form(private.fields_for_role(tp.fields, t.assigned_role), coalesce(p_data, '{}'), p_complete, t.deal_id);
  prev := coalesce(t.saved_by, t.completed_by);
  self_rep := cardinality(private.deal_roles(t.deal_id)) > 1;
  if for_client then note := ' by ' || private.person_label(private.effective_uid(), t.deal_id) || ' on behalf of ' || private.person_name(t.owner_profile_id);
  elsif tc_acts then note := ' by ' || private.person_name(private.effective_uid()) || ' (transaction coordinator) on behalf of '
    || coalesce(case when t.owner_profile_id is not null then private.person_name(t.owner_profile_id) end,
                (select nullif(btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), '')
                 from public.deal_participants a join public.contacts c on c.id = a.contact_id where a.id = t.participant_id),
                'the agent');
  elsif t.owner_profile_id = private.effective_uid() and prev is not null and prev <> private.effective_uid() and private.file_role_of(prev, t.deal_id) in ('Buyer Agent', 'Listing Agent') then
    note := ' by ' || case when self_rep then private.person_label(private.effective_uid(), t.deal_id, t.assigned_role) else private.person_name(private.effective_uid()) end
         || ' (changed answers entered by ' || private.person_label(prev, t.deal_id) || ')';
  elsif t.owner_profile_id is not null and t.owner_profile_id <> private.effective_uid() then note := ' by ' || private.person_label(private.effective_uid(), t.deal_id);
  elsif self_rep then note := ' by ' || private.person_label(private.effective_uid(), t.deal_id, case when t.owner_profile_id = private.effective_uid() then t.assigned_role end); end if;
  if for_client and coalesce(p_complete, false) then
    raise exception 'You can only complete tasks assigned to you';
  end if;
  perform set_config('cla.form_rpc', 'on', true);
  if for_client then
    update public.tasks set form_data = clean, saved_at = now(), saved_by = private.effective_uid(), owner_profile_id = t.owner_profile_id where id = p_task;
  else
    update public.tasks set form_data = clean, saved_at = now(), saved_by = private.effective_uid(), owner_profile_id = t.owner_profile_id,
      status = case when p_complete then 'done' when t.status = 'blocked' then 'blocked' else 'in_progress' end,
      completed_at = case when p_complete then now() end, completed_by = case when p_complete then private.effective_uid() end where id = p_task;
  end if;
  perform set_config('cla.form_rpc', 'off', true);
  perform private.log_activity(t.deal_id, case when p_complete then 'task.completed' else 'task.saved' end, 'task', t.id,
    t.title || case when p_complete then ': completed' else ': progress saved' end || note);
  if p_complete then perform private.notify(array[(select processor_id from public.deals where id = t.deal_id)], 'task', t.deal_id, 'Completed: ' || t.title, '#/deals/' || t.deal_id || '/tasks/' || t.id); end if;
  if for_client then perform private.notify(array[t.owner_profile_id], 'task', t.deal_id,
    private.person_name(private.effective_uid()) || case when p_complete then ' completed ' else ' started ' end || t.title || ' for you - please check the answers', '#/deals/' || t.deal_id || '/tasks/' || t.id); end if;
  return case when for_client then t.status when p_complete then 'done' else 'in_progress' end; end
$function$;

CREATE OR REPLACE FUNCTION public.my_task_list(p_file_status text DEFAULT 'Open'::text)
 RETURNS TABLE(id uuid, deal_id uuid, title text, description text, assigned_role text, status text, due_date date, completed_at timestamp with time zone, completed_by uuid, kind text, participant_id uuid, owner_profile_id uuid, template_code text, template_version integer, created_at timestamp with time zone, file_number text, street text, city text, state text, zip text, closing_date date, deal_status text, owner_name text, overdue boolean, my_roles text[])
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  with me as materialized (
    select (select private.effective_uid()) as uid,
           (select private.is_staffish()) as staffish,
           (select private.me_role()) as role
  ),
  board as (
    select t.id, t.deal_id, t.title, t.description, t.assigned_role, t.status, t.due_date, t.completed_at, t.completed_by,
           t.kind, t.participant_id, t.owner_profile_id, t.template_code, t.template_version, t.created_at,
           d.file_number, d.street, d.city, d.state, d.zip, d.closing_date, d.status as deal_status
    from public.tasks t
    join public.deals d on d.id = t.deal_id
    cross join me
    where (coalesce(p_file_status, 'Open') = 'All' or d.status = p_file_status)
      and (t.owner_profile_id = me.uid or t.participant_id is null
           or (not me.staffish and t.assigned_role in ('Buyer Agent', 'Listing Agent')))
  ),
  roles as (
    select i.deal_id,
           case when me.staffish then array[me.role] else private.deal_roles(i.deal_id) end as my_roles,
           case when me.staffish then '{}'::text[] else private.my_tc_agent_roles(i.deal_id) end as tc_roles
    from (select distinct b.deal_id from board b) i
    cross join me
  ),
  kept as (
    select b.*, r.my_roles, r.tc_roles
    from board b
    join roles r on r.deal_id = b.deal_id
    cross join me
    where b.owner_profile_id = me.uid
       or (b.participant_id is null and (b.assigned_role = any (r.my_roles) or (me.staffish and b.assigned_role = me.role)))
       -- A transaction coordinator also has their agent's own copies.
       or (b.participant_id is not null and b.assigned_role = any (r.tc_roles))
  ),
  names as (
    select n.deal_id, n.participant_id, n.owner_name
    from private.board_owner_names((
      select coalesce(array_agg(distinct k.deal_id), '{}'::uuid[])
      from kept k
      where k.participant_id is not null
    )) n
  )
  select k.id, k.deal_id, k.title, k.description, k.assigned_role, k.status, k.due_date,
         k.completed_at, k.completed_by, k.kind, k.participant_id, k.owner_profile_id,
         k.template_code, k.template_version, k.created_at,
         k.file_number, k.street, k.city, k.state, k.zip, k.closing_date, k.deal_status,
         names.owner_name,
         (k.status in ('todo', 'in_progress', 'blocked') and k.due_date is not null and k.due_date < private.office_today()),
         k.my_roles
  from kept k
  left join names on names.deal_id = k.deal_id and names.participant_id = k.participant_id
  order by k.due_date nulls last, k.file_number, k.title
$function$;

revoke all on function private.tc_acts_on_task(uuid) from public, anon, authenticated;
revoke all on function private.agent_fee_tc_side(uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.my_tc_agent_roles(uuid) from public, anon;
grant execute on function private.my_tc_agent_roles(uuid) to authenticated;

do $$
begin
  if position('Buyer Agent TC' in pg_get_functiondef('private.linked_agent_roles(uuid,uuid)'::regprocedure)) = 0 then
    raise exception 'readback: linked_agent_roles does not see a coordinator on the file';
  end if;
  if position('|| '' TC''' in pg_get_functiondef('private.tc_for_agent(uuid,uuid,uuid,text)'::regprocedure)) = 0 then
    raise exception 'readback: tc_for_agent does not see a coordinator on the file';
  end if;
  if position('tc_for_agent' in pg_get_functiondef('private.task_visible(uuid,text,uuid)'::regprocedure)) = 0 then
    raise exception 'readback: task_visible does not use tc_for_agent';
  end if;
  if position('Buyer Agent TC' in pg_get_functiondef('private.outside_readable_task_ids()'::regprocedure)) = 0 then
    raise exception 'readback: outside_readable_task_ids does not see a coordinator on the file';
  end if;
  if position('Buyer Agent TC' in pg_get_functiondef('private.task_outside_audience(uuid)'::regprocedure)) = 0 then
    raise exception 'readback: task_outside_audience does not see a coordinator on the file';
  end if;
  if position('agent_fee_tc_side' in pg_get_functiondef('private.agent_fee_actor(uuid,text)'::regprocedure)) = 0 then
    raise exception 'readback: agent_fee_actor does not see a coordinator on the file';
  end if;
  if position('tc_acts_on_task' in pg_get_functiondef('private.rpc_save_task_form(uuid,jsonb,boolean)'::regprocedure)) = 0
     or position('tc_acts_on_task' in pg_get_functiondef('private.rpc_get_task_form(uuid)'::regprocedure)) = 0
     or position('tc_acts_on_task' in pg_get_functiondef('private.agent_answers_visible(tasks)'::regprocedure)) = 0 then
    raise exception 'readback: the coordinator cannot open their agent''s answers';
  end if;
  if position('my_tc_agent_roles' in pg_get_functiondef('public.my_task_list(text)'::regprocedure)) = 0 then
    raise exception 'readback: my_task_list does not list the agent''s tasks for the coordinator';
  end if;
end $$;

select private.lock_function_search_paths();
commit;
notify pgrst, 'reload schema';
