-- TB-1 Task Builder: the list of flows (John, Nov 13 2026; spec docs/specs/task-builder.md).
-- Admin > Task Builder lets an Admin or Super admin build automated workflows ("flows") for title files.
-- This step stores each flow's name, description, what starts it (the trigger, with a number of days for
-- "EMD not received" and "Days before closing") and an On / Off switch. New flows start Off.
-- Flows do NOT run on files yet: conditions and actions (TB-2) fill the empty `steps` column later.
-- Nothing is deleted: a flow is switched Off. task_flow_log keeps who, when and what for every change.
-- Every read and write goes through the functions below (Admin / Super admin only). Nobody reads or writes the tables directly.
-- Not applied on TEST by this change. Rollback: supabase/rollbacks/20261120010000_task_builder_flows.sql
begin;
set local lock_timeout = '3s';

create table if not exists public.task_flows (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 3 and 80),
  description text not null default '' check (length(description) <= 500),
  trigger text not null check (trigger in ('order_opened', 'contract_received', 'emd_received', 'emd_not_received',
                                           'commitment_received', 'closing_date_set', 'days_before_closing')),
  trigger_days smallint check (trigger_days between 1 and 60),
  active boolean not null default false,
  steps jsonb not null default '[]'::jsonb check (jsonb_typeof(steps) = 'array'),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  check ((trigger in ('emd_not_received', 'days_before_closing')) = (trigger_days is not null))
);
create unique index if not exists task_flows_name_unique on public.task_flows (lower(regexp_replace(btrim(name), '\s+', ' ', 'g')));

create table if not exists public.task_flow_log (
  id bigint generated always as identity primary key,
  flow_id uuid not null references public.task_flows(id) on delete cascade,
  flow_name text not null,
  action text not null check (action in ('created', 'changed', 'turned on', 'turned off')),
  detail text not null default '',
  by_id uuid,
  at timestamptz not null default now()
);
create index if not exists task_flow_log_at on public.task_flow_log (at desc);

alter table public.task_flows enable row level security;
alter table public.task_flow_log enable row level security;
revoke all on public.task_flows from public, anon, authenticated;
revoke all on public.task_flow_log from public, anon, authenticated;

drop trigger if exists aaa_view_as_readonly on public.task_flows;
create trigger aaa_view_as_readonly before insert or delete or update on public.task_flows
  for each row execute function private.view_as_readonly();

-- "EMD not received, 2 days after the order was opened"
create or replace function private.task_flow_trigger_text(p_trigger text, p_days int) returns text
language sql immutable set search_path to pg_catalog as $$
  select case p_trigger
    when 'order_opened' then 'Order opened'
    when 'contract_received' then 'Contract received'
    when 'emd_received' then 'EMD received'
    when 'emd_not_received' then 'EMD not received, ' || p_days || case when p_days = 1 then ' day' else ' days' end || ' after the order was opened'
    when 'commitment_received' then 'Title commitment received'
    when 'closing_date_set' then 'Closing date set or changed'
    when 'days_before_closing' then 'Days before closing, ' || p_days || case when p_days = 1 then ' day' else ' days' end || ' before the closing date'
    else 'Unknown trigger' end $$;

-- Flows plus the 50 latest history entries, for the Task Builder page.
create or replace function public.list_task_flows() returns jsonb
language plpgsql stable security definer set search_path to pg_catalog, public, extensions as $$
begin
  if not private.is_admin() then raise exception 'Only an Admin or Super admin can use Task Builder.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'flows', coalesce((select jsonb_agg(to_jsonb(f) || jsonb_build_object(
        'created_by_name', case when f.created_by is null then '' else private.person_name(f.created_by) end,
        'updated_by_name', case when f.updated_by is null then '' else private.person_name(f.updated_by) end) order by lower(f.name))
      from public.task_flows f), '[]'::jsonb),
    'log', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'flow_id', l.flow_id, 'flow_name', l.flow_name, 'action', l.action, 'detail', l.detail,
        'by', l.by_id, 'by_name', case when l.by_id is null then '' else private.person_name(l.by_id) end, 'at', l.at) order by l.at desc, l.id desc)
      from (select * from public.task_flow_log order by at desc, id desc limit 50) l), '[]'::jsonb));
end $$;

-- Create (p_id null) or change a flow. Returns its id. New flows start Off.
create or replace function public.save_task_flow(p_id uuid, p_name text, p_description text, p_trigger text, p_trigger_days int)
returns uuid
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
declare
  v_uid uuid := private.effective_uid();
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_desc text := btrim(coalesce(p_description, ''));
  v_days int := case when p_trigger in ('emd_not_received', 'days_before_closing') then p_trigger_days else null end;
  v_old public.task_flows; v_id uuid; v_changes text[] := '{}';
begin
  if not private.is_admin() then raise exception 'Only an Admin or Super admin can use Task Builder.' using errcode = '42501'; end if;
  if v_name = '' then raise exception 'Give the flow a name, for example "EMD reminder".' using errcode = 'P0001'; end if;
  if length(v_name) < 3 then raise exception 'The name is too short. Use at least 3 characters.' using errcode = 'P0001'; end if;
  if length(v_name) > 80 then raise exception 'The name is too long. Use 80 characters or fewer.' using errcode = 'P0001'; end if;
  if length(v_desc) > 500 then raise exception 'The description is too long. Use 500 characters or fewer.' using errcode = 'P0001'; end if;
  if p_trigger is null or p_trigger not in ('order_opened', 'contract_received', 'emd_received', 'emd_not_received', 'commitment_received', 'closing_date_set', 'days_before_closing') then
    raise exception 'Choose what starts the flow.' using errcode = 'P0001'; end if;
  if p_trigger in ('emd_not_received', 'days_before_closing') and (v_days is null or v_days < 1 or v_days > 60) then
    raise exception 'Days must be a whole number from 1 to 60.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.task_flows f where f.id is distinct from p_id and lower(regexp_replace(btrim(f.name), '\s+', ' ', 'g')) = lower(v_name)) then
    raise exception 'Another flow already has that name. Use a different name.' using errcode = 'P0001'; end if;

  if p_id is null then
    insert into public.task_flows (name, description, trigger, trigger_days, active, created_by, updated_by)
      values (v_name, v_desc, p_trigger, v_days, false, v_uid, v_uid) returning id into v_id;
    insert into public.task_flow_log (flow_id, flow_name, action, detail, by_id)
      values (v_id, v_name, 'created', 'Starts: ' || private.task_flow_trigger_text(p_trigger, v_days) || '. Off.', v_uid);
    return v_id;
  end if;

  select * into v_old from public.task_flows where id = p_id for update;
  if not found then raise exception 'That flow was not found. Refresh the page and try again.' using errcode = 'P0001'; end if;
  if v_old.name <> v_name then v_changes := v_changes || ('name was "' || v_old.name || '"'); end if;
  if v_old.trigger <> p_trigger or v_old.trigger_days is distinct from v_days then
    v_changes := v_changes || ('starts: was ' || private.task_flow_trigger_text(v_old.trigger, v_old.trigger_days) || ', now ' || private.task_flow_trigger_text(p_trigger, v_days)); end if;
  if v_old.description <> v_desc then v_changes := v_changes || 'description changed'::text; end if;
  if cardinality(v_changes) = 0 then return p_id; end if;
  update public.task_flows set name = v_name, description = v_desc, trigger = p_trigger, trigger_days = v_days, updated_by = v_uid, updated_at = now() where id = p_id;
  insert into public.task_flow_log (flow_id, flow_name, action, detail, by_id) values (p_id, v_name, 'changed', array_to_string(v_changes, '; '), v_uid);
  return p_id;
end $$;

-- Switch a flow On or Off. Switching to the state it is already in changes nothing.
create or replace function public.set_task_flow_active(p_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
declare v_uid uuid := private.effective_uid(); v_old public.task_flows;
begin
  if not private.is_admin() then raise exception 'Only an Admin or Super admin can use Task Builder.' using errcode = '42501'; end if;
  select * into v_old from public.task_flows where id = p_id for update;
  if not found then raise exception 'That flow was not found. Refresh the page and try again.' using errcode = 'P0001'; end if;
  if v_old.active = coalesce(p_active, false) then return; end if;
  update public.task_flows set active = coalesce(p_active, false), updated_by = v_uid, updated_at = now() where id = p_id;
  insert into public.task_flow_log (flow_id, flow_name, action, by_id) values (p_id, v_old.name, case when p_active then 'turned on' else 'turned off' end, v_uid);
end $$;

comment on table public.task_flows is 'TB-1 Task Builder flows: name, trigger, On / Off. steps (conditions and actions) come in TB-2. Read and write only through list_task_flows / save_task_flow / set_task_flow_active.';
comment on table public.task_flow_log is 'TB-1: every Task Builder change: who, when, what.';

revoke all on function private.task_flow_trigger_text(text, int) from public, anon, authenticated;
revoke all on function public.list_task_flows(), public.save_task_flow(uuid, text, text, text, int), public.set_task_flow_active(uuid, boolean) from public, anon;
grant execute on function public.list_task_flows(), public.save_task_flow(uuid, text, text, text, int), public.set_task_flow_active(uuid, boolean) to authenticated;

commit;
