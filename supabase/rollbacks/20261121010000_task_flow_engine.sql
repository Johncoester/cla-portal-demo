-- Rollback for 20261121010000_task_flow_engine.sql. NOT APPLIED by this file.
-- Stops the 15-minute job and the deals trigger, removes runs, errors, conditions and the engine, and puts TB-1's
-- set_task_flow_active and list_task_flows back. Tasks the flows already created stay on their files (their flow link is dropped).
-- Saved steps stay in task_flows.steps (TB-1 kept that column).
begin;
set local lock_timeout = '3s';

select cron.unschedule(jobid) from cron.job where jobname = 'task-flows-every-15-min';
drop trigger if exists zz_task_flow_events on public.deals;
drop function if exists private.trg_task_flow_deal_events();
drop function if exists public.run_task_flows_now();
drop function if exists private.run_task_flows();
drop function if exists private.task_flow_advance(uuid);
drop function if exists private.task_flow_matches(jsonb, uuid);
drop function if exists private.task_flow_start(uuid, text);
drop function if exists public.save_task_flow_v2(uuid, text, text, text, int, jsonb, jsonb);
drop function if exists private.task_flow_can_run(text, jsonb);
drop function if exists private.task_flow_clean_steps(jsonb);
drop function if exists private.task_flow_clean_conditions(jsonb);
alter table public.tasks drop column if exists flow_run_id;
drop table if exists public.task_flow_errors;
drop table if exists public.task_flow_runs;
alter table public.task_flows drop column if exists conditions;

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

commit;
