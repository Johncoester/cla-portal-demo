-- FF-020: buyer Social Security number, separate from task answers.
-- Encrypted with pgcrypto using the Vault secret buyer_ssn_key. This file does not create or contain that key.
-- Before applying, run this yourself and do not commit the key:
--   select vault.create_secret('<32 or more random characters>', 'buyer_ssn_key', 'Encrypts buyer Social Security numbers');
-- Not applied by this commit.
begin;
set local lock_timeout = '3s';

do $guard$
begin
  if (select md5(p.prosrc) from pg_proc p where p.oid = 'private.rpc_save_task_form(uuid,jsonb,boolean)'::regprocedure)
       is distinct from '3060685ae08d3ec56095938eb5842dff' then
    raise exception 'drift: private.rpc_save_task_form changed or missing';
  end if;
  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'buyer_ssn_key' and length(decrypted_secret) >= 32
  ) then
    raise exception 'Create vault secret buyer_ssn_key (32 or more random characters) before applying. Do not put the key in git.';
  end if;
end
$guard$;

create table private.buyer_ssn (
  task_id uuid primary key references public.tasks(id) on delete cascade,
  ciphertext bytea not null,
  last4 text not null check (last4 ~ '^[0-9]{4}$'),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table private.buyer_ssn enable row level security;
revoke all on table private.buyer_ssn from public, anon, authenticated;

create or replace function private.buyer_ssn_key() returns text
language sql stable security definer
set search_path to 'pg_catalog', 'vault' as $function$
  select ds.decrypted_secret from vault.decrypted_secrets ds where ds.name = 'buyer_ssn_key' limit 1
$function$;
revoke all on function private.buyer_ssn_key() from public, anon, authenticated;

create or replace function private.ssn_staff() returns boolean
language sql stable security definer
set search_path to 'pg_catalog', 'public' as $function$
  select private.me_role() in (
    'Super admin', 'Admin', 'Processor', 'Preprocessor',
    'Transaction Coordinator', 'Sales Person', 'Sales Team'
  )
$function$;
revoke all on function private.ssn_staff() from public, anon, authenticated;

create or replace function private.rpc_save_buyer_ssn(p_task uuid, p_ssn text) returns void
language plpgsql security definer
set search_path to 'pg_catalog', 'public', 'extensions' as $function$
declare
  t public.tasks;
  digits text;
  key text;
  staff boolean;
begin
  select * into t from public.tasks where id = p_task;
  if not found or t.template_code is distinct from 'personal_info' or t.assigned_role is distinct from 'Client-Buyer'
     or not private.can_access_deal(t.deal_id) then
    raise exception 'Not available' using errcode = '42501';
  end if;
  staff := private.ssn_staff();
  if t.owner_profile_id is distinct from private.effective_uid() and not staff then
    raise exception 'Not available' using errcode = '42501';
  end if;
  digits := regexp_replace(coalesce(p_ssn, ''), '\D', '', 'g');
  if digits !~ '^[0-9]{9}$' then
    raise exception 'Enter a 9-digit Social Security number.' using errcode = 'P0001';
  end if;
  key := private.buyer_ssn_key();
  if key is null or length(key) < 32 then
    raise exception 'Social Security storage is not configured.' using errcode = 'P0001';
  end if;
  insert into private.buyer_ssn (task_id, ciphertext, last4, updated_at, updated_by)
  values (t.id, extensions.pgp_sym_encrypt(digits, key), right(digits, 4), now(), private.effective_uid())
  on conflict (task_id) do update
    set ciphertext = excluded.ciphertext, last4 = excluded.last4, updated_at = now(), updated_by = private.effective_uid();
  perform private.log_activity(t.deal_id, 'task.ssn', 'task', t.id, 'Social Security number saved');
end
$function$;
revoke all on function private.rpc_save_buyer_ssn(uuid, text) from public, anon, authenticated;

create or replace function private.rpc_read_buyer_ssn(p_task uuid) returns text
language plpgsql stable security definer
set search_path to 'pg_catalog', 'public', 'extensions' as $function$
declare
  t public.tasks;
  row private.buyer_ssn;
  digits text;
begin
  select * into t from public.tasks where id = p_task;
  if not found or t.template_code is distinct from 'personal_info' or t.assigned_role is distinct from 'Client-Buyer'
     or not private.can_access_deal(t.deal_id) then
    raise exception 'Not available' using errcode = '42501';
  end if;
  select * into row from private.buyer_ssn where task_id = t.id;
  if not found then return ''; end if;
  if private.ssn_staff() then
    digits := extensions.pgp_sym_decrypt(row.ciphertext, private.buyer_ssn_key());
    return substr(digits, 1, 3) || '-' || substr(digits, 4, 2) || '-' || substr(digits, 6, 4);
  end if;
  if t.owner_profile_id = private.effective_uid() then
    return '***-**-' || row.last4;
  end if;
  raise exception 'Not available' using errcode = '42501';
end
$function$;
revoke all on function private.rpc_read_buyer_ssn(uuid) from public, anon, authenticated;

create or replace function public.save_buyer_ssn(p_task uuid, p_ssn text) returns void
language plpgsql security definer
set search_path to 'pg_catalog', 'public' as $function$
begin
  perform private.rpc_save_buyer_ssn(p_task, p_ssn);
end
$function$;
create or replace function public.read_buyer_ssn(p_task uuid) returns text
language plpgsql stable security definer
set search_path to 'pg_catalog', 'public' as $function$
begin
  return private.rpc_read_buyer_ssn(p_task);
end
$function$;
revoke all on function public.save_buyer_ssn(uuid, text) from public, anon;
revoke all on function public.read_buyer_ssn(uuid) from public, anon;
grant execute on function public.save_buyer_ssn(uuid, text) to authenticated;
grant execute on function public.read_buyer_ssn(uuid) to authenticated;

create or replace function private.strip_task_ssn() returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public' as $function$
begin
  if new.form_data is not null then
    new.form_data := new.form_data - 'ssn' - 'social_security' - 'full_ssn' - 'buyer_ssn';
  end if;
  return new;
end
$function$;
drop trigger if exists tasks_strip_ssn on public.tasks;
create trigger tasks_strip_ssn before insert or update of form_data on public.tasks
for each row execute function private.strip_task_ssn();

create or replace function private.rpc_save_task_form(p_task uuid, p_data jsonb, p_complete boolean default false)
returns text
language plpgsql security definer
set search_path to 'pg_catalog', 'public' as $function$
declare t public.tasks; tp public.task_templates; clean jsonb; for_client boolean; prev uuid; note text := ''; self_rep boolean;
begin
  p_data := coalesce(p_data, '{}'::jsonb) - 'ssn' - 'social_security' - 'full_ssn' - 'buyer_ssn';
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
  return case when for_client then t.status when p_complete then 'done' else 'in_progress' end; end
$function$;

do $readback$
declare src text;
begin
  src := (select p.prosrc from pg_proc p where p.oid = 'private.rpc_save_buyer_ssn(uuid,text)'::regprocedure);
  if position('Social Security number saved' in src) = 0 then
    raise exception 'readback: the activity note is missing';
  end if;
  if position('pgp_sym_encrypt' in src) = 0 then
    raise exception 'readback: the number is not encrypted';
  end if;
  if position('form_data' in src) > 0 then
    raise exception 'readback: save_buyer_ssn writes task answers';
  end if;
  if position(' - ''ssn''' in (select p.prosrc from pg_proc p where p.oid = 'private.rpc_save_task_form(uuid,jsonb,boolean)'::regprocedure)) = 0 then
    raise exception 'readback: task answers can still store the number';
  end if;
end
$readback$;
commit;
