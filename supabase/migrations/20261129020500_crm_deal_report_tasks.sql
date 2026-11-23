-- RPT-2 (John, Nov 22 2026): task dates for the CRM report builder's Deals report.
-- John's pre-closing report shows when tasks such as "Confirm EMD Receipt" and
-- "Title - CLEAR TO CLOSE" are due and when they were completed. This adds ONE new
-- read-only function that returns each file's tasks (name, due date, completed
-- time, status). It changes no table and no existing function.
--
-- Who sees what: the same files as the Deals list and RPT-1-SEC, via
-- private.crm_visible_deal_ids() (caller scope once, demo/real files separated).
-- Buyers, sellers and agents cannot call it (private.crm_user()). Cancelled
-- tasks are left out. Only the task's name, dates and status are returned: no
-- description, no answers.
--
-- Security: SECURITY INVOKER, no new GRANT on public.tasks (authenticated already
-- has column-level SELECT on the five columns this reads). Disabled and retired
-- template rules stay with the existing tasks policies. A DEFINER variant with
-- the same visible-files join plus those filters by hand was timed on TEST
-- (read-only, rolled back): INVOKER was slightly faster with identical output
-- for a real Processor, a demo Processor, and a Sales Person, so this file
-- uses INVOKER.
--
-- Needs 20261129060000_crm_deal_report_fields_sec.sql (RPT-1-SEC) for
-- private.crm_visible_deal_ids(). Not applied by this commit. Apply on TEST
-- after the pull request merges.
-- Rollback: supabase/rollbacks/20261129020500_crm_deal_report_tasks.sql
begin;
set local lock_timeout = '3s';

do $$
begin
  if to_regprocedure('private.crm_visible_deal_ids()') is null or to_regprocedure('private.crm_user()') is null then
    raise exception 'drift: the CRM deal helpers are missing';
  end if;
  if to_regprocedure('public.crm_deal_report_tasks()') is not null then
    raise exception 'drift: public.crm_deal_report_tasks() already exists';
  end if;
end $$;

create function public.crm_deal_report_tasks()
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
begin
  if not private.crm_user() then raise exception 'The CRM is for CLA staff only.' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('dealId', t.deal_id, 'title', t.title, 'dueDate', t.due_date, 'completedAt', t.completed_at, 'status', t.status))
    from public.tasks t
    join private.crm_visible_deal_ids() v(id) on v.id = t.deal_id
    where t.status <> 'cancelled' and btrim(coalesce(t.title, '')) <> ''
  ), '[]'::jsonb);
end $$;

revoke all on function public.crm_deal_report_tasks() from public, anon;
grant execute on function public.crm_deal_report_tasks() to authenticated;

do $readback$
declare src text;
begin
  select pg_get_functiondef('public.crm_deal_report_tasks()'::regprocedure) into src;
  if position('private.crm_user()' in src) = 0 or position('private.crm_visible_deal_ids()' in src) = 0 then
    raise exception 'readback: the staff-only check or the visible-files helper is missing';
  end if;
  if (select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'crm_deal_report_tasks') then
    raise exception 'readback: crm_deal_report_tasks is not SECURITY INVOKER';
  end if;
  if position('description' in src) > 0 or position('form_data' in src) > 0 then
    raise exception 'readback: the function returns more than names, dates and status';
  end if;
  if has_function_privilege('anon', 'public.crm_deal_report_tasks()', 'execute') then
    raise exception 'readback: anon can call crm_deal_report_tasks';
  end if;
end
$readback$;
commit;
