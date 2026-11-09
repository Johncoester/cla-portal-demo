-- Rollback of 20261110020000_task_template_fields_for_assignees.sql
begin;
set local lock_timeout = '3s';
drop policy if exists templates_select on public.task_templates;
create policy templates_select on public.task_templates for select to authenticated using (
  private.is_admin() or private.is_manager()
);
do $$
begin
  if (select md5(qual) from pg_policies where schemaname = 'public' and tablename = 'task_templates' and policyname = 'templates_select')
       is distinct from '48e5c19f67a254422ece436d2ae0e009' then
    raise exception 'readback: templates_select did not restore';
  end if;
end $$;
commit;
