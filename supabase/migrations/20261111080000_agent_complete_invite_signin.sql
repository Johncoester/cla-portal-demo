-- V-4: a buyer agent or listing agent cannot mark a buyer's or seller's task complete.
-- V-6: a used invite link still resolves, so the page can open Sign in with the email.
-- Captured before replace: task_guard 99f8f7b29785fa16d51225d3be49ae19,
-- rpc_save_task_form 55bfcff4558ee4eac4d251969c0e1c4f,
-- rpc_portal_invite_lookup 5bc251b6be28d7d9c99e238105a8ac25,
-- rpc_hr_invite_lookup 379c0508f9ac7856429ff9df8fbec426.
do $drift$
begin
  if (select md5(p.prosrc) from pg_proc p where p.oid = 'private.task_guard()'::regprocedure) is distinct from '99f8f7b29785fa16d51225d3be49ae19' then
    raise exception 'drift: private.task_guard changed'; end if;
  if (select md5(p.prosrc) from pg_proc p where p.oid = 'private.rpc_save_task_form(uuid,jsonb,boolean)'::regprocedure) is distinct from '55bfcff4558ee4eac4d251969c0e1c4f' then
    raise exception 'drift: private.rpc_save_task_form changed'; end if;
  if (select md5(p.prosrc) from pg_proc p where p.oid = 'private.rpc_portal_invite_lookup(text)'::regprocedure) is distinct from '5bc251b6be28d7d9c99e238105a8ac25' then
    raise exception 'drift: private.rpc_portal_invite_lookup changed'; end if;
  if (select md5(p.prosrc) from pg_proc p where p.oid = 'private.rpc_hr_invite_lookup(text)'::regprocedure) is distinct from '379c0508f9ac7856429ff9df8fbec426' then
    raise exception 'drift: private.rpc_hr_invite_lookup changed'; end if;
end
$drift$;

alter table public.agent_invites add column if not exists opened_token_hash text;
alter table public.hr_invites add column if not exists opened_token_hash text;

create or replace function private.keep_used_invite_token()
returns trigger
language plpgsql
security definer
set search_path to pg_catalog, public, extensions
as $fn$
begin
  if new.token_hash is null and old.token_hash is not null then
    new.opened_token_hash := old.token_hash;
  end if;
  return new;
end
$fn$;

drop trigger if exists agent_invites_keep_token on public.agent_invites;
create trigger agent_invites_keep_token
before update of token_hash on public.agent_invites
for each row execute function private.keep_used_invite_token();

drop trigger if exists hr_invites_keep_token on public.hr_invites;
create trigger hr_invites_keep_token
before update of token_hash on public.hr_invites
for each row execute function private.keep_used_invite_token();

create or replace function private.task_guard()
returns trigger
language plpgsql
security definer
set search_path to pg_catalog, public, extensions
as $fn$
declare tp public.task_templates;
begin
  if new.participant_id is distinct from old.participant_id and new.participant_id is not null then raise exception 'A participant task stays with that participant'; end if;
  if old.owner_profile_id is not null and new.assigned_role <> old.assigned_role then raise exception 'A participant task stays with that participant'; end if;
  if new.assigned_role in ('Client-Buyer', 'Client-Seller')
     and (new.status is distinct from old.status or new.completed_at is distinct from old.completed_at or new.completed_by is distinct from old.completed_by)
     and not private.is_manager()
     and new.owner_profile_id is distinct from private.effective_uid()
     and not (new.owner_profile_id is null and new.assigned_role = any (private.deal_roles(new.deal_id))) then
    raise exception 'You can only complete tasks assigned to you';
  end if;
  if new.kind = 'form' and new.status = 'done' and old.status <> 'done' and coalesce(current_setting('cla.form_rpc', true), '') <> 'on' then
    select * into tp from public.task_templates where id = new.template_id;
    begin perform private.validate_form(private.fields_for_role(tp.fields, new.assigned_role), new.form_data, true, new.deal_id);
    exception when others then raise exception 'The form is not complete yet: %', sqlerrm; end;
    new.completed_at := now(); new.completed_by := private.effective_uid();
  end if;
  return new; end $fn$;
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
create or replace function private.rpc_portal_invite_lookup(p_token text)
returns table(status text, first_name text, last_name text, email text, expires_at timestamptz, invite_kind text)
language sql
stable
security definer
set search_path to pg_catalog, public, extensions
as $fn$
  select case
      when i.id is null then 'invalid'
      when public.agent_invite_status(i) = 'pending'
        and exists (select 1 from public.profiles pr where lower(pr.email) = lower(i.email) and pr.status = 'active')
        then 'exists'
      else public.agent_invite_status(i)
    end,
    i.first_name, i.last_name, i.email, i.expires_at, i.invite_kind
  from (select 1) one
  left join lateral (
    select * from public.agent_invites z
    where z.token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
       or z.opened_token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
    order by (z.token_hash is not null) desc
    limit 1
  ) i on true $fn$;
create or replace function private.rpc_hr_invite_lookup(p_token text)
returns table(status text, first_name text, last_name text, email text, expires_at timestamptz)
language sql
stable
security definer
set search_path to pg_catalog, public, extensions
as $fn$
  select case
      when v.id is null or e.archived_at is not null then 'invalid'
      when v.accepted_at is not null then 'accepted'
      when v.revoked_at is not null then 'revoked'
      when v.expires_at < now() then 'expired'
      when exists (select 1 from public.profiles pr where lower(pr.email) = lower(v.email) and pr.status = 'active') then 'exists'
      else 'pending' end,
    case when v.id is not null then e.first_name end,
    case when v.id is not null then e.last_name end,
    case when v.id is not null then v.email end,
    v.expires_at
  from (select 1) one
  left join lateral (
    select * from public.hr_invites z
    where z.token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
       or z.opened_token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
    order by (z.token_hash is not null) desc
    limit 1
  ) v on true
  left join public.hr_employees e on e.id = v.employee_id $fn$;

do $readback$
begin
  if position('You can only complete tasks assigned to you' in (select p.prosrc from pg_proc p where p.oid = 'private.task_guard()'::regprocedure)) = 0 then
    raise exception 'readback: task_guard missing the client complete check'; end if;
  if position('You can only complete tasks assigned to you' in (select p.prosrc from pg_proc p where p.oid = 'private.rpc_save_task_form(uuid,jsonb,boolean)'::regprocedure)) = 0 then
    raise exception 'readback: save_task_form missing the client complete check'; end if;
  if position('opened_token_hash' in (select p.prosrc from pg_proc p where p.oid = 'private.rpc_portal_invite_lookup(text)'::regprocedure)) = 0
     or position('''exists''' in (select p.prosrc from pg_proc p where p.oid = 'private.rpc_portal_invite_lookup(text)'::regprocedure)) = 0 then
    raise exception 'readback: portal invite lookup missing the used-link email'; end if;
  if position('opened_token_hash' in (select p.prosrc from pg_proc p where p.oid = 'private.rpc_hr_invite_lookup(text)'::regprocedure)) = 0 then
    raise exception 'readback: hr invite lookup missing the used-link email'; end if;
end
$readback$;
