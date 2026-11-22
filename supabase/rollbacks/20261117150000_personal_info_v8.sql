-- Rollback for 20261117150000_personal_info_v8.sql: personal_info v7 active again; untouched v8 copies move back. Copies with answers on
-- v8 keep them (nothing deleted); the v8 row stays inactive so those copies still open.
begin;
update public.tasks task set template_id = prev.id, template_version = prev.version, title = prev.title, description = prev.description
from public.task_templates prev
where task.template_code = 'personal_info' and prev.code = 'personal_info' and prev.version = 7 and task.template_version = 8
  and task.kind = 'form' and task.status = 'todo' and task.saved_at is null and coalesce(task.form_data, '{}'::jsonb) = '{}'::jsonb;
update public.task_templates set active = false where code = 'personal_info' and version = 8;
update public.task_templates set active = true where code = 'personal_info' and version = 7;
commit;
