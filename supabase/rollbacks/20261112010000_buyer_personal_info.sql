-- Removes Personal information version 5. Copies that already have answers stay on version 5,
-- and the version row stays (inactive) so those answers still have their questions.
-- Untouched copies return to version 4, which becomes the active template again.
begin;
set local lock_timeout = '3s';

do $guard$
begin
  if not exists (select 1 from public.task_templates where code = 'personal_info' and version = 5) then
    raise exception 'rollback: personal_info version 5 is missing';
  end if;
  if not exists (select 1 from public.task_templates where code = 'personal_info' and version = 4) then
    raise exception 'rollback: personal_info version 4 is missing';
  end if;
end
$guard$;

update public.tasks task
set template_id = prev.id, template_version = prev.version, title = prev.title, description = prev.description
from public.task_templates prev
where prev.code = 'personal_info' and prev.version = 4
  and task.template_code = 'personal_info'
  and task.template_version = 5
  and task.kind = 'form'
  and task.status = 'todo'
  and task.saved_at is null
  and coalesce(task.form_data, '{}'::jsonb) = '{}'::jsonb;

update public.task_templates set active = false where code = 'personal_info' and version = 5;
update public.task_templates set active = true where code = 'personal_info' and version = 4;

delete from public.task_templates t
where t.code = 'personal_info' and t.version = 5
  and not exists (select 1 from public.tasks task where task.template_id = t.id);

do $readback$
begin
  if not exists (select 1 from public.task_templates where code = 'personal_info' and version = 4 and active) then
    raise exception 'rollback check: personal_info version 4 is not active';
  end if;
  if exists (
    select 1 from public.task_templates t
    where t.code = 'personal_info' and t.version = 5 and t.active
  ) then
    raise exception 'rollback check: personal_info version 5 is still active';
  end if;
end
$readback$;
commit;
