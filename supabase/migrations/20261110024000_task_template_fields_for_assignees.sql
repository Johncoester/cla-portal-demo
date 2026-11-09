-- Francis FF-NEW-1 (Nov 9): agent (and client) intake tasks open with "template n/a" and no fields.
-- Root cause: templates_select only allows Admin / manager, so Outside users never load task_templates.fields
-- in fetchHostedTask even when they own the task. Form answers already come through get_task_form; this only
-- unlocks the field DEFINITIONS for a template that already has a task on a deal the viewer can open.
-- No schema change. Active/retired templates stay as they are. Write policies unchanged.
-- Rollback: supabase/rollbacks/20261110024000_task_template_fields_for_assignees.sql
begin;
set local lock_timeout = '3s';
do $$
begin
  if (select md5(qual) from pg_policies where schemaname = 'public' and tablename = 'task_templates' and policyname = 'templates_select')
       is distinct from '48e5c19f67a254422ece436d2ae0e009' then
    raise exception 'drift: templates_select changed or missing';
  end if;
end $$;

drop policy templates_select on public.task_templates;
create policy templates_select on public.task_templates for select to authenticated using (
  private.is_admin()
  or private.is_manager()
  or exists (
    select 1 from public.tasks t
    where t.template_id = task_templates.id
      and private.can_access_deal(t.deal_id)
  )
);

do $$
begin
  if (select md5(qual) from pg_policies where schemaname = 'public' and tablename = 'task_templates' and policyname = 'templates_select')
       is distinct from md5($q$ (private.is_admin() OR private.is_manager() OR (EXISTS ( SELECT 1
   FROM tasks t
  WHERE ((t.template_id = task_templates.id) AND private.can_access_deal(t.deal_id))))) $q$) then
    -- Postgres may normalize whitespace; accept either by checking the policy exists and mentions can_access_deal
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'task_templates' and policyname = 'templates_select'
        and qual ilike '%can_access_deal%'
    ) then
      raise exception 'readback: templates_select missing can_access_deal branch';
    end if;
  end if;
end $$;
commit;
