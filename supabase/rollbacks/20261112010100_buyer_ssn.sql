-- Removes the private Social Security number store and the staff/buyer read.
-- Restores task-answer saves to the body from 20261111080000 (no SSN keys are stripped there).
-- The ciphertext is deleted with the table. The Vault secret buyer_ssn_key is left in place.
begin;
set local lock_timeout = '3s';

drop trigger if exists tasks_strip_ssn on public.tasks;
drop function if exists private.strip_task_ssn();
drop function if exists public.save_buyer_ssn(uuid, text);
drop function if exists public.read_buyer_ssn(uuid);
drop function if exists private.rpc_save_buyer_ssn(uuid, text);
drop function if exists private.rpc_read_buyer_ssn(uuid);
drop function if exists private.ssn_staff();
drop function if exists private.buyer_ssn_key();
drop table if exists private.buyer_ssn;

create or replace function private.rpc_save_task_form(p_task uuid, p_data jsonb, p_complete boolean default false)
returns text
language plpgsql
security definer
set search_path to pg_catalog, public, extensions
as $fn$
declare t public.tasks; tp public.task_templates; clean jsonb; for_client boolean; prev uuid; note text := ''; self_rep boolean;
begin
  select * into t from public.tasks where id = p_task;
  if not found or not private.can_access_deal(t.deal_id) or not private.task_visible(t.owner_profile_id, t.assigned_role, t.deal_id) then raise exception 'Task not found'; end if;
  for_client := t.owner_profile_id is distinct from private.effective_uid() and private.agent_can_fill(p_task);
  if t.kind <> 'form' or t.status = 'cancelled' or not (t.owner_profile_id = private.effective_uid() or private.is_manager() or for_client) then raise exception 'You cannot fill in this task.'; end if;
  select * into tp from public.task_templates where id = t.template_id;
  clean := private.validate_form(private.fields_for_role(tp.fields, t.assigned_role), coalesce(p_data, '{}'), p_complete, t.deal_id);
  prev := coalesce(t.saved_by, t.completed_by);
  self_rep := cardinality(private.deal_roles(t.deal_id)) > 1;
  if for_client then note := ' by ' || private.person_label(private.effective_uid(), t.deal_id) || ' on behalf of ' || private.person_name(t.owner_profile_id);
  elsif t.owner_profile_id = private.effective_uid() and prev is not null and prev <> private.effective_uid() and private.file_role_of(prev, t.deal_id) in ('Buyer Agent', 'Listing Agent') then
    note := ' by ' || case when self_rep then private.person_label(private.effective_uid(), t.deal_id, t.assigned_role) else private.person_name(private.effective_uid()) end
         || ' (changed answers entered by ' || private.person_label(prev, t.deal_id) || ')';
  elsif t.owner_profile_id is not null and t.owner_profile_id <> private.effective_uid() then note := ' by ' || private.person_label(private.effective_uid(), t.deal_id);
  elsif self_rep then note := ' by ' || private.person_label(private.effective_uid(), t.deal_id, case when t.owner_profile_id = private.effective_uid() then t.assigned_role end); end if;
  if for_client and coalesce(p_complete, false) then
    raise exception 'You can only complete tasks assigned to you';
  end if;
  perform set_config('cla.form_rpc', 'on', true);
  if for_client then
    update public.tasks set form_data = clean, saved_at = now(), saved_by = private.effective_uid() where id = p_task;
  else
    update public.tasks set form_data = clean, saved_at = now(), saved_by = private.effective_uid(),
      status = case when p_complete then 'done' when t.status = 'blocked' then 'blocked' else 'in_progress' end,
      completed_at = case when p_complete then now() end, completed_by = case when p_complete then private.effective_uid() end where id = p_task;
  end if;
  perform set_config('cla.form_rpc', 'off', true);
  perform private.log_activity(t.deal_id, case when p_complete then 'task.completed' else 'task.saved' end, 'task', t.id,
    t.title || case when p_complete then ': completed' else ': progress saved' end || note);
  if p_complete then perform private.notify(array[(select processor_id from public.deals where id = t.deal_id)], 'task', t.deal_id, 'Completed: ' || t.title, '#/deals/' || t.deal_id || '/tasks/' || t.id); end if;
  if for_client then perform private.notify(array[t.owner_profile_id], 'task', t.deal_id,
    private.person_name(private.effective_uid()) || case when p_complete then ' completed ' else ' started ' end || t.title || ' for you - please check the answers', '#/deals/' || t.deal_id || '/tasks/' || t.id); end if;
  return case when for_client then t.status when p_complete then 'done' else 'in_progress' end; end $fn$;

do $readback$
declare src text;
begin
  src := (select p.prosrc from pg_proc p where p.oid = 'private.rpc_save_task_form(uuid,jsonb,boolean)'::regprocedure);
  if position('ssn' in src) > 0 then
    raise exception 'rollback check: task answers still mention the number';
  end if;
  if position('You can only complete tasks assigned to you' in src) = 0 then
    raise exception 'rollback check: the client complete rule is missing';
  end if;
  if to_regclass('private.buyer_ssn') is not null then
    raise exception 'rollback check: private.buyer_ssn still exists';
  end if;
end
$readback$;
commit;
