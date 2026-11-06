-- Workflows (John, Nov 6). Definitions only.
-- An Admin or Super admin lays task templates out as a flowchart and assigns that flowchart
-- to a role and/or file type (Purchase or Refinance) and an optional state.
-- This does not copy tasks onto files. Opening a file and adding a person are unchanged.
-- Not applied on TEST by this change. Does not create or alter anything in schema auth.
-- Write path: public.save_workflow (admin check, one transaction).
-- Read path: RLS. CLA staff may select. Only an active Admin or Super admin may write.
-- private.is_admin / private.is_staffish / private.effective_uid / private.log_activity already exist.

create table public.workflows (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  active boolean not null default true,
  audience text not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  constraint workflows_name_len check (char_length(btrim(name)) between 1 and 80),
  constraint workflows_description_len check (char_length(description) <= 500),
  constraint workflows_audience check (audience in ('processing', 'client'))
);

create table public.workflow_steps (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows (id) on delete cascade,
  task_template_id uuid not null references public.task_templates (id) on delete restrict,
  position integer not null,
  depends_on uuid references public.workflow_steps (id) on delete set null,
  constraint workflow_steps_position check (position > 0),
  constraint workflow_steps_position_unique unique (workflow_id, position)
);

create table public.workflow_assignments (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows (id) on delete cascade,
  role text not null default '',
  file_type text not null default '',
  state text not null default '',
  constraint workflow_assignments_role check (role in (
    '', 'Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator',
    'Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller')),
  constraint workflow_assignments_file_type check (file_type in ('', 'Purchase', 'Refinance')),
  constraint workflow_assignments_state check (state = '' or state ~ '^[A-Z]{2}$'),
  constraint workflow_assignments_unique unique (workflow_id, role, file_type, state)
);

create index workflow_steps_workflow_id_idx on public.workflow_steps (workflow_id);
create index workflow_steps_template_id_idx on public.workflow_steps (task_template_id);
create index workflow_steps_depends_on_idx on public.workflow_steps (depends_on);
create index workflow_assignments_workflow_id_idx on public.workflow_assignments (workflow_id);
create index workflow_assignments_match_idx on public.workflow_assignments (role, file_type, state);

comment on table public.workflows is 'Named flowchart of task templates. Does not create tasks on files.';
comment on table public.workflow_steps is 'One task template in a workflow. depends_on is an earlier step in the same workflow (light branching or a parallel sibling).';
comment on table public.workflow_assignments is 'Which role and/or file type and optional state this workflow is for. Blank means any.';

create or replace function private.workflow_step_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.depends_on is not null then
    if new.depends_on = new.id then
      raise exception 'A step cannot depend on itself.' using errcode = '23514';
    end if;
    if not exists (
      select 1 from public.workflow_steps s
      where s.id = new.depends_on and s.workflow_id = new.workflow_id
    ) then
      raise exception 'A step can only depend on another step in the same workflow.' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists workflow_steps_guard on public.workflow_steps;
create trigger workflow_steps_guard
  before insert or update of depends_on, workflow_id on public.workflow_steps
  for each row execute function private.workflow_step_guard();

create or replace function public.save_workflow(
  p_id uuid,
  p_name text,
  p_description text,
  p_active boolean,
  p_audience text,
  p_steps jsonb,
  p_assignments jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_uid uuid;
  v_name text;
  v_desc text;
  v_audience text;
  v_active boolean;
  rec record;
  step record;
  v_key text;
  v_dep text;
  v_tpl uuid;
  v_pos integer;
  v_role text;
  v_ftype text;
  v_state text;
  new_id uuid;
  map jsonb := '{}'::jsonb;
begin
  if not private.is_admin() then
    raise exception 'Only an Admin or Super admin can edit workflows.' using errcode = '42501';
  end if;
  v_name := btrim(coalesce(p_name, ''));
  if char_length(v_name) < 1 or char_length(v_name) > 80 then
    raise exception 'Workflow name must be 1 to 80 characters.' using errcode = 'P0001';
  end if;
  v_desc := left(btrim(coalesce(p_description, '')), 500);
  if char_length(btrim(coalesce(p_description, ''))) > 500 then
    raise exception 'Description must be 500 characters or fewer.' using errcode = 'P0001';
  end if;
  v_audience := btrim(coalesce(p_audience, ''));
  if v_audience not in ('processing', 'client') then
    raise exception 'Audience must be processing or client.' using errcode = 'P0001';
  end if;
  v_active := coalesce(p_active, true);
  if p_steps is null or jsonb_typeof(p_steps) <> 'array' then
    raise exception 'Steps must be a list.' using errcode = 'P0001';
  end if;
  if p_assignments is null or jsonb_typeof(p_assignments) <> 'array' then
    raise exception 'Assignments must be a list.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_steps) > 40 then
    raise exception 'A workflow can have at most 40 steps.' using errcode = 'P0001';
  end if;

  create temporary table if not exists _wf_steps (
    key text primary key,
    task_template_id uuid not null,
    position integer not null,
    depends_on text
  ) on commit drop;
  truncate _wf_steps;
  create temporary table if not exists _wf_asg (
    role text not null,
    file_type text not null,
    state text not null,
    primary key (role, file_type, state)
  ) on commit drop;
  truncate _wf_asg;

  for rec in select value from jsonb_array_elements(p_steps) as t(value)
  loop
    if jsonb_typeof(rec.value) <> 'object' then
      raise exception 'Each step must use an existing task template.' using errcode = 'P0001';
    end if;
    v_key := btrim(coalesce(rec.value->>'key', ''));
    if v_key = '' or exists (select 1 from _wf_steps s where s.key = v_key) then
      raise exception 'Each step needs its own key.' using errcode = 'P0001';
    end if;
    begin
      v_tpl := nullif(rec.value->>'task_template_id', '')::uuid;
    exception when invalid_text_representation then
      raise exception 'Each step must use an existing task template.' using errcode = 'P0001';
    end;
    if v_tpl is null or not exists (select 1 from public.task_templates t where t.id = v_tpl) then
      raise exception 'Each step must use an existing task template.' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.task_templates t where t.id = v_tpl and t.retired_at is not null) then
      raise exception 'That task is retired. Pick a current task template.' using errcode = 'P0001';
    end if;
    begin
      v_pos := (rec.value->>'position')::integer;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Each step needs a position.' using errcode = 'P0001';
    end;
    if v_pos is null or v_pos < 1 then
      raise exception 'Each step needs a position.' using errcode = 'P0001';
    end if;
    v_dep := nullif(btrim(coalesce(rec.value->>'depends_on', '')), '');
    insert into _wf_steps (key, task_template_id, position, depends_on) values (v_key, v_tpl, v_pos, v_dep);
  end loop;

  if exists (select 1 from _wf_steps group by position having count(*) > 1) then
    raise exception 'Two steps cannot share a position.' using errcode = 'P0001';
  end if;
  if exists (select 1 from _wf_steps s where s.depends_on is not null and s.depends_on = s.key) then
    raise exception 'A step cannot depend on itself.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from _wf_steps s
    where s.depends_on is not null
      and not exists (select 1 from _wf_steps p where p.key = s.depends_on and p.position < s.position)
  ) then
    raise exception 'A step can only depend on an earlier step in this workflow.' using errcode = 'P0001';
  end if;

  for rec in select value from jsonb_array_elements(p_assignments) as t(value)
  loop
    if jsonb_typeof(rec.value) <> 'object' then
      raise exception 'Assignments must be a list.' using errcode = 'P0001';
    end if;
    v_role := btrim(coalesce(rec.value->>'role', ''));
    v_ftype := btrim(coalesce(rec.value->>'file_type', ''));
    v_state := upper(btrim(coalesce(rec.value->>'state', '')));
    if v_role <> '' and v_role not in (
      'Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator',
      'Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'
    ) then
      raise exception 'Unknown role for a workflow assignment.' using errcode = 'P0001';
    end if;
    if v_ftype not in ('', 'Purchase', 'Refinance') then
      raise exception 'File type must be Purchase, Refinance, or any.' using errcode = 'P0001';
    end if;
    if v_state <> '' and v_state !~ '^[A-Z]{2}$' then
      raise exception 'State must be a 2-letter code or blank.' using errcode = 'P0001';
    end if;
    begin
      insert into _wf_asg (role, file_type, state) values (v_role, v_ftype, v_state);
    exception when unique_violation then
      raise exception 'That role, file type, and state is already on this workflow.' using errcode = 'P0001';
    end;
  end loop;

  v_uid := private.effective_uid();
  if v_uid is not null and not exists (select 1 from public.profiles where id = v_uid) then
    v_uid := null;
  end if;

  if p_id is null then
    insert into public.workflows (name, description, active, audience, created_by, updated_by)
    values (v_name, v_desc, v_active, v_audience, v_uid, v_uid)
    returning id into v_id;
  else
    update public.workflows
       set name = v_name,
           description = v_desc,
           active = v_active,
           audience = v_audience,
           updated_at = now(),
           updated_by = v_uid
     where id = p_id
     returning id into v_id;
    if v_id is null then
      raise exception 'Workflow not found.' using errcode = 'P0001';
    end if;
    update public.workflow_steps set depends_on = null where workflow_id = v_id;
    delete from public.workflow_steps where workflow_id = v_id;
    delete from public.workflow_assignments where workflow_id = v_id;
  end if;

  if v_active and exists (
    select 1
      from public.workflow_assignments a
      join public.workflows w on w.id = a.workflow_id
      join _wf_asg n on n.role = a.role and n.file_type = a.file_type and n.state = a.state
     where w.active and w.id <> v_id
  ) then
    raise exception 'Another active workflow already applies to that role, file type, and state.' using errcode = 'P0001';
  end if;

  for step in select key, task_template_id, position, depends_on from _wf_steps order by position
  loop
    new_id := gen_random_uuid();
    map := map || jsonb_build_object(step.key, new_id::text);
    insert into public.workflow_steps (id, workflow_id, task_template_id, position, depends_on)
    values (new_id, v_id, step.task_template_id, step.position, null);
  end loop;

  update public.workflow_steps s
     set depends_on = (map ->> p.depends_on)::uuid
    from _wf_steps p
   where s.workflow_id = v_id
     and s.id = (map ->> p.key)::uuid
     and p.depends_on is not null;

  insert into public.workflow_assignments (workflow_id, role, file_type, state)
  select v_id, role, file_type, state from _wf_asg;

  perform private.log_activity(null, 'workflow.saved', 'workflow', v_id, v_name);
  return v_id;
end $$;

revoke all on function public.save_workflow(uuid, text, text, boolean, text, jsonb, jsonb) from public, anon;
grant execute on function public.save_workflow(uuid, text, text, boolean, text, jsonb, jsonb) to authenticated;
revoke all on function private.workflow_step_guard() from public, anon;
grant execute on function private.workflow_step_guard() to authenticated;

alter table public.workflows enable row level security;
alter table public.workflow_steps enable row level security;
alter table public.workflow_assignments enable row level security;

revoke all on table public.workflows from public, anon;
revoke all on table public.workflow_steps from public, anon;
revoke all on table public.workflow_assignments from public, anon;
grant select, insert, update, delete on public.workflows to authenticated;
grant select, insert, update, delete on public.workflow_steps to authenticated;
grant select, insert, update, delete on public.workflow_assignments to authenticated;

create policy workflows_staff_read on public.workflows
  for select to authenticated using (private.is_staffish());
create policy workflows_admin_insert on public.workflows
  for insert to authenticated with check (private.is_admin());
create policy workflows_admin_update on public.workflows
  for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy workflows_admin_delete on public.workflows
  for delete to authenticated using (private.is_admin());

create policy workflow_steps_staff_read on public.workflow_steps
  for select to authenticated using (private.is_staffish());
create policy workflow_steps_admin_insert on public.workflow_steps
  for insert to authenticated with check (private.is_admin());
create policy workflow_steps_admin_update on public.workflow_steps
  for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy workflow_steps_admin_delete on public.workflow_steps
  for delete to authenticated using (private.is_admin());

create policy workflow_assignments_staff_read on public.workflow_assignments
  for select to authenticated using (private.is_staffish());
create policy workflow_assignments_admin_insert on public.workflow_assignments
  for insert to authenticated with check (private.is_admin());
create policy workflow_assignments_admin_update on public.workflow_assignments
  for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy workflow_assignments_admin_delete on public.workflow_assignments
  for delete to authenticated using (private.is_admin());

select private.lock_function_search_paths();
