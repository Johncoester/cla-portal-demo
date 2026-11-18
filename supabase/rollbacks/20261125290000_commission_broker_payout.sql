-- Rollback for 20261125290000_commission_broker_payout.sql.
-- Makes the previous commissions template version active again (open copies move back).
-- The v3 with broker fee / payout is kept, switched off, because finished copies may point to it.
-- Restores the AF-8 commission_task_guard (refuse commission_amount only; no total rewrite).
begin;
set local lock_timeout = '3s';

create or replace function private.commission_task_guard() returns trigger
language plpgsql set search_path to pg_catalog, public as $$
begin
  if new.template_code = 'commissions'
     and nullif(btrim(coalesce(new.form_data ->> 'commission_amount', '')), '') is not null
     and (tg_op = 'INSERT' or (new.form_data ->> 'commission_amount') is distinct from (old.form_data ->> 'commission_amount')) then
    raise exception 'Commissions are now kept in the Agent fees box on the file overview. Reload the page and enter it there. Nothing was saved.'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists tasks_commission_task_guard on public.tasks;
create trigger tasks_commission_task_guard before insert or update of form_data on public.tasks
  for each row execute function private.commission_task_guard();

do $$
declare noted public.task_templates; prev public.task_templates;
begin
  select * into noted from public.task_templates t where t.code = 'commissions'
     and exists (select 1 from jsonb_array_elements(t.fields) x where x ->> 'k' = 'broker_fee')
   order by version desc limit 1;
  if noted.id is null then return; end if;
  select * into prev from public.task_templates t where t.code = 'commissions' and t.version < noted.version
   order by version desc limit 1;
  if prev.id is null then return; end if;
  update public.task_templates set active = false where id = noted.id;
  update public.task_templates set active = true where id = prev.id;
  update public.tasks set template_id = prev.id, template_version = prev.version, title = prev.title, description = prev.description
   where template_id = noted.id and status in ('todo', 'in_progress', 'blocked');
end $$;

commit;
