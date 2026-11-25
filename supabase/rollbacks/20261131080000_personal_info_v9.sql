-- Rollback for 20261131080000_personal_info_v9.sql: personal_info v8 active again; untouched v9 copies move back.
-- Copies with answers on v9 keep them (nothing deleted); the v9 row stays inactive so those copies still open.
-- The seller-only forwarding_address task is not touched.
begin;
update public.tasks task set template_id = prev.id, template_version = prev.version, title = prev.title, description = prev.description
from public.task_templates prev
where task.template_code = 'personal_info' and prev.code = 'personal_info' and prev.version = 8 and task.template_version = 9
  and task.kind = 'form' and task.status = 'todo' and task.saved_at is null and coalesce(task.form_data, '{}'::jsonb) = '{}'::jsonb;
update public.task_templates set active = false where code = 'personal_info' and version = 9;
update public.task_templates set active = true where code = 'personal_info' and version = 8;
commit;
