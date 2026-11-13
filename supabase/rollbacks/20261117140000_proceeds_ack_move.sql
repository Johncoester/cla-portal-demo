-- Rollback for 20261117140000_proceeds_ack_move.sql: makes personal_info v6 and seller_proceeds v1 active again and moves untouched
-- copies back. Copies with answers on v7 / v2 keep them (nothing is deleted); the v7 / v2 rows stay, inactive, so those copies still open.
begin;
update public.tasks task set template_id = prev.id, template_version = prev.version, title = prev.title, description = prev.description
from public.task_templates prev
where ((task.template_code = 'personal_info' and prev.code = 'personal_info' and prev.version = 6 and task.template_version = 7)
    or (task.template_code = 'seller_proceeds' and prev.code = 'seller_proceeds' and prev.version = 1 and task.template_version = 2))
  and task.kind = 'form' and task.status = 'todo' and task.saved_at is null and coalesce(task.form_data, '{}'::jsonb) = '{}'::jsonb;
update public.task_templates set active = false where (code = 'personal_info' and version = 7) or (code = 'seller_proceeds' and version = 2);
update public.task_templates set active = true where (code = 'personal_info' and version = 6) or (code = 'seller_proceeds' and version = 1);
commit;
