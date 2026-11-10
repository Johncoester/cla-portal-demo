-- Removes the spouse table, the seller/spouse SSN subject, and the seller template versions.
-- A buyer's own number stays in private.buyer_ssn. Copies that already have answers stay on the new versions.
-- Untouched copies return to the previous active version. Does not delete the Vault key.
begin;
set local lock_timeout = '3s';

do $guard$
begin
  if to_regclass('private.party_ssn') is null and to_regclass('private.buyer_ssn') is null then
    raise exception 'rollback: the Social Security table is missing';
  end if;
  if not exists (select 1 from public.task_templates where code = 'personal_info' and version = 5) then
    raise exception 'rollback: personal_info version 5 is missing';
  end if;
  if not exists (select 1 from public.task_templates where code = 'personal_info' and version = 6)
     and not exists (select 1 from public.task_templates where code = 'personal_info' and version = 5 and active) then
    raise exception 'rollback: personal_info version 6 is missing and version 5 is not active';
  end if;
end
$guard$;

update public.tasks task
set template_id = prev.id, template_version = prev.version, title = prev.title, description = prev.description
from public.task_templates prev
where prev.code = task.template_code
  and ((task.template_code = 'personal_info' and task.template_version = 6 and prev.version = 5)
    or (task.template_code = 'id_upload' and task.template_version = 2 and prev.version = 1)
    or (task.template_code = 'hoa_info' and task.template_version = 2 and prev.version = 1)
    or (task.template_code = 'mortgage_info' and task.template_version = 2 and prev.version = 1))
  and task.kind = 'form' and task.status = 'todo' and task.saved_at is null
  and coalesce(task.form_data, '{}'::jsonb) = '{}'::jsonb;

-- Turn each new version off before its previous version comes back on. One active row per code.
update public.task_templates set active = false where code = 'personal_info' and version = 6;
update public.task_templates set active = true where code = 'personal_info' and version = 5;
update public.task_templates set active = false where code = 'id_upload' and version = 2;
update public.task_templates set active = true where code = 'id_upload' and version = 1;
update public.task_templates set active = false where code = 'hoa_info' and version = 2;
update public.task_templates set active = true where code = 'hoa_info' and version = 1;
update public.task_templates set active = false where code = 'mortgage_info' and version = 2;
update public.task_templates set active = true where code = 'mortgage_info' and version = 1;

delete from public.task_templates t
where ((t.code = 'personal_info' and t.version = 6) or (t.code = 'id_upload' and t.version = 2)
    or (t.code = 'hoa_info' and t.version = 2) or (t.code = 'mortgage_info' and t.version = 2))
  and not exists (select 1 from public.tasks task where task.template_id = t.id);

drop function if exists public.get_spouse(uuid);
drop function if exists public.save_spouse(uuid, uuid, jsonb);
drop function if exists public.save_party_ssn(uuid, text, text);
drop function if exists public.read_party_ssn(uuid, text);
drop function if exists private.rpc_save_party_ssn(uuid, text, text);
drop function if exists private.rpc_read_party_ssn(uuid, text);
drop table if exists public.spouse_info;

do $restore$
begin
  if to_regclass('private.party_ssn') is null then
    return;
  end if;
  delete from private.party_ssn where subject = 'spouse';
  alter table private.party_ssn drop constraint if exists party_ssn_subject;
  alter table private.party_ssn drop constraint if exists party_ssn_pkey;
  alter table private.party_ssn drop column if exists subject;
  alter table private.party_ssn add primary key (task_id);
  alter table private.party_ssn rename to buyer_ssn;
  revoke all on table private.buyer_ssn from public, anon, authenticated;
end
$restore$;

create or replace function private.rpc_save_buyer_ssn(p_task uuid, p_ssn text) returns void
language plpgsql security definer
set search_path to 'pg_catalog', 'public', 'extensions' as $function$
declare
  t public.tasks; digits text; key text; staff boolean;
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
  if digits !~ '^[0-9]{9}$' then raise exception 'Enter a 9-digit Social Security number.' using errcode = 'P0001'; end if;
  key := private.buyer_ssn_key();
  if key is null or length(key) < 32 then raise exception 'Social Security storage is not configured.' using errcode = 'P0001'; end if;
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
declare t public.tasks; row private.buyer_ssn; digits text;
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
  if t.owner_profile_id = private.effective_uid() then return '***-**-' || row.last4; end if;
  raise exception 'Not available' using errcode = '42501';
end
$function$;
revoke all on function private.rpc_read_buyer_ssn(uuid) from public, anon, authenticated;

do $readback$
begin
  if to_regclass('private.buyer_ssn') is null or to_regclass('private.party_ssn') is not null then
    raise exception 'rollback check: the buyer number table was not restored';
  end if;
  if to_regclass('public.spouse_info') is not null then raise exception 'rollback check: spouse_info remains'; end if;
  if position('Client-Seller' in (select p.prosrc from pg_proc p where p.oid = 'private.rpc_save_buyer_ssn(uuid,text)'::regprocedure)) > 0 then
    raise exception 'rollback check: a seller can still save a number through the buyer function';
  end if;
  if not exists (select 1 from public.task_templates where code = 'personal_info' and version = 5 and active) then
    raise exception 'rollback check: personal_info version 5 is not active';
  end if;
end
$readback$;
commit;
