-- Rollback for 20261131240000_connect_5_questions_wording.sql:
-- personal_info v9 and seller_proceeds v2 become active again; untouched v10 / v3 copies move back.
-- Copies with answers on the new versions keep them (nothing deleted); the new rows stay inactive so those copies still open.
-- Citizenship and the seller-only forwarding_address task are not touched.
begin;
update public.tasks task set template_id = prev.id, template_version = prev.version, title = prev.title, description = prev.description
from public.task_templates prev
where task.template_code = 'personal_info' and prev.code = 'personal_info' and prev.version = 9 and task.template_version = 10
  and task.kind = 'form' and task.status = 'todo' and task.saved_at is null and coalesce(task.form_data, '{}'::jsonb) = '{}'::jsonb;
update public.tasks task set template_id = prev.id, template_version = prev.version, title = prev.title, description = prev.description
from public.task_templates prev
where task.template_code = 'seller_proceeds' and prev.code = 'seller_proceeds' and prev.version = 2 and task.template_version = 3
  and task.kind = 'form' and task.status = 'todo' and task.saved_at is null and coalesce(task.form_data, '{}'::jsonb) = '{}'::jsonb;
update public.task_templates set active = false where (code = 'personal_info' and version = 10) or (code = 'seller_proceeds' and version = 3);
update public.task_templates set active = true where (code = 'personal_info' and version = 9) or (code = 'seller_proceeds' and version = 2);
commit;
