-- Rollback for 20261123010000_commission_task_agent_fees.sql: removes the guard and makes the previous commissions template version
-- active again (open copies move back to it). The version with the Agent fees note is kept, switched off, because finished copies may
-- point to it. Commissions already moved into Agent fees stay there (they are in the Agent fees change history).
begin;
drop trigger if exists tasks_commission_task_guard on public.tasks;
drop function if exists private.commission_task_guard();
do $$
declare noted public.task_templates; prev public.task_templates;
begin
  select * into noted from public.task_templates t where t.code = 'commissions'
     and exists (select 1 from jsonb_array_elements(t.fields) x where x ->> 'k' = 'agent_fees_note') order by version desc limit 1;
  if noted.id is null then return; end if;
  select * into prev from public.task_templates t where t.code = 'commissions' and t.version < noted.version order by version desc limit 1;
  if prev.id is null then return; end if;
  update public.task_templates set active = false where id = noted.id;
  update public.task_templates set active = true where id = prev.id;
  update public.tasks set template_id = prev.id, template_version = prev.version, title = prev.title, description = prev.description
   where template_id = noted.id and status in ('todo', 'in_progress', 'blocked');
end $$;
commit;
