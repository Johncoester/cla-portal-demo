-- RPT-2 (John, Nov 22 2026): task dates for the CRM report builder's Deals report.
-- John's pre-closing report shows when tasks such as "Confirm EMD Receipt" and
-- "Title - CLEAR TO CLOSE" are due and when they were completed. This adds ONE new
-- read-only function that returns each file's tasks (name, due date, completed
-- time, status). It changes no table and no existing function.
--
-- Who sees what: the same rule as the Deals list and RPT-1. A task is returned only
-- when private.crm_deal_visible(its file) is true for the signed-in person. Buyers,
-- sellers and agents cannot call it (private.crm_user()). Cancelled tasks are left out.
-- Only the task's name, dates and status are returned: no description, no answers.
--
-- Needs 20261129010000_crm_deal_report_fields.sql (RPT-1) only for order; it does not call it.
-- Not applied by this commit. Apply on TEST after the pull request merges.
-- Rollback: supabase/rollbacks/20261129020500_crm_deal_report_tasks.sql
begin;
set local lock_timeout = '3s';

do $$
begin
  if to_regprocedure('private.crm_deal_visible(uuid)') is null or to_regprocedure('private.crm_user()') is null then
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
security definer
set search_path = pg_catalog, public
as $$
begin
  if not private.crm_user() then raise exception 'The CRM is for CLA staff only.' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('dealId', t.deal_id, 'title', t.title, 'dueDate', t.due_date, 'completedAt', t.completed_at, 'status', t.status))
    from public.tasks t
    where t.status <> 'cancelled' and btrim(coalesce(t.title, '')) <> ''
      and t.deal_id in (select g.id from public.deals g where private.crm_deal_visible(g.id))), '[]'::jsonb);
end $$;

revoke all on function public.crm_deal_report_tasks() from public, anon;
grant execute on function public.crm_deal_report_tasks() to authenticated;

do $readback$
declare src text;
begin
  select pg_get_functiondef('public.crm_deal_report_tasks()'::regprocedure) into src;
  if position('private.crm_user()' in src) = 0 or position('private.crm_deal_visible(g.id)' in src) = 0 then
    raise exception 'readback: the staff-only check or the deal visibility rule is missing';
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
