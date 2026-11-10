-- Restores the form read and save that treated a blank task owner as nobody.
-- Does not clear owner_profile_id values the forward migration filled in.
begin;
set local lock_timeout = '3s';

create or replace function private.rpc_get_task_form(p_task uuid)
returns jsonb
language plpgsql stable security definer
set search_path to pg_catalog, public, extensions
as $function$
declare t public.tasks; d jsonb; k text;
begin
  select * into t from public.tasks where id = p_task;
  if not found or not private.can_access_deal(t.deal_id) or not private.task_visible(t.owner_profile_id, t.assigned_role, t.deal_id) then raise exception 'Task not found'; end if;
  if not (private.form_owner_or_manager(t.owner_profile_id) or private.agent_can_fill(p_task)) then raise exception 'Only the person, the processor and the coordinator can see these answers'; end if;
  d := t.form_data;
  if not (t.owner_profile_id = private.effective_uid() or private.is_processor()) then
    foreach k in array private.masked_keys(t.template_id) loop
      if d ? k then d := d || jsonb_build_object(k, repeat(chr(8226), 4) || right(d->>k, 4)); end if; end loop; end if;
  return d; end $function$;

create or replace function private.rpc_save_task_form(p_task uuid, p_data jsonb, p_complete boolean default false)
returns text
language plpgsql security definer
set search_path to pg_catalog, public, extensions
as $function$
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

create or replace function private.rpc_save_party_ssn(p_task uuid, p_subject text, p_ssn text)
returns void
language plpgsql security definer
set search_path to pg_catalog, public, extensions
as $function$
declare
  t public.tasks; digits text; key text; who text; staff boolean;
begin
  who := case when p_subject = 'spouse' then 'spouse' else 'self' end;
  select * into t from public.tasks where id = p_task;
  if not found or t.template_code is distinct from 'personal_info'
     or t.assigned_role not in ('Client-Buyer', 'Client-Seller')
     or not private.can_access_deal(t.deal_id) then
    raise exception 'Not available' using errcode = '42501';
  end if;
  staff := private.ssn_staff();
  if t.owner_profile_id is distinct from private.effective_uid() and not staff then
    raise exception 'Not available' using errcode = '42501';
  end if;
  digits := regexp_replace(coalesce(p_ssn, ''), '\D', '', 'g');
  if digits !~ '^[0-9]{9}$' then raise exception 'Enter a 9-digit Social Security number.' using errcode = 'P0001'; end if;
  key := private.buyer_ssn_key();
  if key is null or length(key) < 32 then raise exception 'Social Security storage is not configured.' using errcode = 'P0001'; end if;
  insert into private.party_ssn (task_id, subject, ciphertext, last4, updated_at, updated_by)
  values (t.id, who, extensions.pgp_sym_encrypt(digits, key), right(digits, 4), now(), private.effective_uid())
  on conflict (task_id, subject) do update
    set ciphertext = excluded.ciphertext, last4 = excluded.last4, updated_at = now(), updated_by = private.effective_uid();
  perform private.log_activity(t.deal_id, 'task.ssn', 'task', t.id,
    case when who = 'spouse' then 'Spouse Social Security number saved' else 'Social Security number saved' end);
end
$function$;

create or replace function private.rpc_read_party_ssn(p_task uuid, p_subject text)
returns text
language plpgsql stable security definer
set search_path to pg_catalog, public, extensions
as $function$
declare t public.tasks; row private.party_ssn; digits text; who text;
begin
  who := case when p_subject = 'spouse' then 'spouse' else 'self' end;
  select * into t from public.tasks where id = p_task;
  if not found or t.template_code is distinct from 'personal_info'
     or t.assigned_role not in ('Client-Buyer', 'Client-Seller')
     or not private.can_access_deal(t.deal_id) then
    raise exception 'Not available' using errcode = '42501';
  end if;
  select * into row from private.party_ssn where task_id = t.id and subject = who;
  if not found then return ''; end if;
  if private.ssn_staff() then
    digits := extensions.pgp_sym_decrypt(row.ciphertext, private.buyer_ssn_key());
    return substr(digits, 1, 3) || '-' || substr(digits, 4, 2) || '-' || substr(digits, 6, 4);
  end if;
  if t.owner_profile_id = private.effective_uid() then return '***-**-' || row.last4; end if;
  raise exception 'Not available' using errcode = '42501';
end
$function$;
commit;
