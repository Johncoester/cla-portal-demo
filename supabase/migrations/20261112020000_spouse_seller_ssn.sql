-- FF-021 and FF-022. Generalizes the buyer SSN store so a seller and a spouse can use the same
-- buyer_ssn_key. Spouse details live in spouse_info, not in the primary person's task answers.
-- Seller form questions are a new Personal information version plus updated HOA, ID, and mortgage templates.
-- Not applied by this commit. Apply 20261112010100 first, and create vault secret buyer_ssn_key first.
begin;
set local lock_timeout = '3s';

do $guard$
begin
  if to_regclass('private.buyer_ssn') is null and to_regclass('private.party_ssn') is null then
    raise exception 'drift: private.buyer_ssn is missing; apply 20261112010100 first';
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'buyer_ssn_key' and length(decrypted_secret) >= 32) then
    raise exception 'Create vault secret buyer_ssn_key before applying. Do not put the key in git.';
  end if;
end
$guard$;

alter table if exists private.buyer_ssn rename to party_ssn;
alter table private.party_ssn add column if not exists subject text not null default 'self';
alter table private.party_ssn drop constraint if exists buyer_ssn_pkey;
alter table private.party_ssn drop constraint if exists party_ssn_pkey;
alter table private.party_ssn add primary key (task_id, subject);
alter table private.party_ssn drop constraint if exists party_ssn_subject;
alter table private.party_ssn add constraint party_ssn_subject check (subject in ('self', 'spouse'));
revoke all on table private.party_ssn from public, anon, authenticated;

create table if not exists public.spouse_info (
  participant_id uuid primary key references public.deal_participants(id) on delete cascade,
  deal_id uuid not null,
  full_name text not null default '',
  citizenship text not null default '',
  gender text not null default '',
  marital_status text not null default '',
  cell_phone text not null default '',
  home_phone text not null default '',
  work_phone text not null default '',
  email text not null default '',
  date_of_birth text not null default '',
  poa_given text not null default ''
);
alter table public.spouse_info enable row level security;
revoke all on table public.spouse_info from public, anon, authenticated;

create or replace function private.rpc_save_party_ssn(p_task uuid, p_subject text, p_ssn text) returns void
language plpgsql security definer
set search_path to 'pg_catalog', 'public', 'extensions' as $function$
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
revoke all on function private.rpc_save_party_ssn(uuid, text, text) from public, anon, authenticated;

create or replace function private.rpc_read_party_ssn(p_task uuid, p_subject text) returns text
language plpgsql stable security definer
set search_path to 'pg_catalog', 'public', 'extensions' as $function$
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
revoke all on function private.rpc_read_party_ssn(uuid, text) from public, anon, authenticated;

create or replace function private.rpc_save_buyer_ssn(p_task uuid, p_ssn text) returns void
language plpgsql security definer set search_path to 'pg_catalog', 'public' as $function$
begin perform private.rpc_save_party_ssn(p_task, 'self', p_ssn); end $function$;
create or replace function private.rpc_read_buyer_ssn(p_task uuid) returns text
language plpgsql stable security definer set search_path to 'pg_catalog', 'public' as $function$
begin return private.rpc_read_party_ssn(p_task, 'self'); end $function$;

create or replace function public.save_party_ssn(p_task uuid, p_subject text, p_ssn text) returns void
language plpgsql security definer set search_path to 'pg_catalog', 'public' as $function$
begin perform private.rpc_save_party_ssn(p_task, p_subject, p_ssn); end $function$;
create or replace function public.read_party_ssn(p_task uuid, p_subject text) returns text
language plpgsql stable security definer set search_path to 'pg_catalog', 'public' as $function$
begin return private.rpc_read_party_ssn(p_task, p_subject); end $function$;
revoke all on function public.save_party_ssn(uuid, text, text) from public, anon;
revoke all on function public.read_party_ssn(uuid, text) from public, anon;
grant execute on function public.save_party_ssn(uuid, text, text) to authenticated;
grant execute on function public.read_party_ssn(uuid, text) to authenticated;

create or replace function public.get_spouse(p_deal uuid)
returns table(participant_id uuid, role text, task_id uuid, full_name text, citizenship text, gender text, marital_status text, cell_phone text, home_phone text, work_phone text, email text, date_of_birth text, poa_given text, ssn text)
language plpgsql stable security definer
set search_path to 'pg_catalog', 'public', 'extensions' as $function$
declare staff boolean;
begin
  if not private.can_access_deal(p_deal) then raise exception 'Not available' using errcode = '42501'; end if;
  staff := private.ssn_staff();
  if not staff and not exists (
    select 1 from public.deal_participants dp join public.contacts c on c.id = dp.contact_id
    where dp.deal_id = p_deal and c.profile_id = private.effective_uid() and dp.role in ('Client-Buyer', 'Client-Seller')
  ) then raise exception 'Not available' using errcode = '42501'; end if;
  return query
  select dp.id, dp.role, t.id,
    coalesce(s.full_name, ''), coalesce(s.citizenship, ''), coalesce(s.gender, ''), coalesce(s.marital_status, ''),
    coalesce(s.cell_phone, ''), coalesce(s.home_phone, ''), coalesce(s.work_phone, ''), coalesce(s.email, ''),
    coalesce(s.date_of_birth, ''), coalesce(s.poa_given, ''),
    case
      when sec.task_id is null then ''
      when staff then substr(plain.digits, 1, 3) || '-' || substr(plain.digits, 4, 2) || '-' || substr(plain.digits, 6, 4)
      else '***-**-' || sec.last4
    end
  from public.deal_participants dp
  join public.contacts c on c.id = dp.contact_id
  left join public.spouse_info s on s.participant_id = dp.id
  left join public.tasks t on t.participant_id = dp.id and t.template_code = 'personal_info' and t.status <> 'cancelled'
  left join private.party_ssn sec on sec.task_id = t.id and sec.subject = 'spouse'
  left join lateral (
    select case when staff and sec.ciphertext is not null
      then extensions.pgp_sym_decrypt(sec.ciphertext, private.buyer_ssn_key()) else null end as digits
  ) plain on true
  where dp.deal_id = p_deal and dp.role in ('Client-Buyer', 'Client-Seller')
    and (staff or c.profile_id = private.effective_uid());
end
$function$;
revoke all on function public.get_spouse(uuid) from public, anon;
grant execute on function public.get_spouse(uuid) to authenticated;

create or replace function public.save_spouse(p_deal uuid, p_participant uuid, p_data jsonb) returns void
language plpgsql security definer
set search_path to 'pg_catalog', 'public' as $function$
declare dp public.deal_participants; c public.contacts;
begin
  select * into dp from public.deal_participants where id = p_participant and deal_id = p_deal;
  if not found or dp.role not in ('Client-Buyer', 'Client-Seller') or not private.can_access_deal(p_deal) then
    raise exception 'Not available' using errcode = '42501';
  end if;
  select * into c from public.contacts where id = dp.contact_id;
  if c.profile_id is distinct from private.effective_uid() and not private.ssn_staff() then
    raise exception 'Not available' using errcode = '42501';
  end if;
  insert into public.spouse_info (participant_id, deal_id, full_name, citizenship, gender, marital_status, cell_phone, home_phone, work_phone, email, date_of_birth, poa_given)
  values (dp.id, p_deal,
    left(btrim(coalesce(p_data->>'fullName', '')), 200), left(btrim(coalesce(p_data->>'citizenship', '')), 80),
    left(btrim(coalesce(p_data->>'gender', '')), 40), left(btrim(coalesce(p_data->>'maritalStatus', '')), 40),
    left(btrim(coalesce(p_data->>'cellPhone', '')), 40), left(btrim(coalesce(p_data->>'homePhone', '')), 40),
    left(btrim(coalesce(p_data->>'workPhone', '')), 40), left(btrim(coalesce(p_data->>'email', '')), 200),
    left(btrim(coalesce(p_data->>'dateOfBirth', '')), 20), case when p_data->>'poaGiven' in ('Yes', 'No') then p_data->>'poaGiven' else '' end)
  on conflict (participant_id) do update set
    full_name = excluded.full_name, citizenship = excluded.citizenship, gender = excluded.gender,
    marital_status = excluded.marital_status, cell_phone = excluded.cell_phone, home_phone = excluded.home_phone,
    work_phone = excluded.work_phone, email = excluded.email, date_of_birth = excluded.date_of_birth, poa_given = excluded.poa_given;
  perform private.log_activity(p_deal, 'spouse.saved', 'participant', dp.id, 'Spouse information saved');
end
$function$;
revoke all on function public.save_spouse(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_spouse(uuid, uuid, jsonb) to authenticated;

-- Seller questions ride the existing Personal information template. HOA, ID, and mortgage keep their codes
-- and gain a new version. Untouched to-do copies with no answers move forward.
-- task_templates_one_active allows one active row per code, so the current row is turned off before the new one is inserted.
-- If those new versions are already the active rows, this block leaves them in place.
do $tpl$
declare
  personal jsonb;
  idfields jsonb;
  hoa jsonb;
  personal_active integer;
  id_active integer;
  hoa_active integer;
  mortgage_active integer;
begin
  select t.version into personal_active from public.task_templates t where t.code = 'personal_info' and t.active order by t.version desc limit 1;
  select t.version into id_active from public.task_templates t where t.code = 'id_upload' and t.active order by t.version desc limit 1;
  select t.version into hoa_active from public.task_templates t where t.code = 'hoa_info' and t.active order by t.version desc limit 1;
  select t.version into mortgage_active from public.task_templates t where t.code = 'mortgage_info' and t.active order by t.version desc limit 1;

  if personal_active = 6 and id_active = 2 and hoa_active = 2 and mortgage_active = 2 then
    null;
  elsif personal_active is distinct from 5 or id_active is distinct from 1 or hoa_active is distinct from 1 or mortgage_active is distinct from 1
     or exists (select 1 from public.task_templates t where (t.code = 'personal_info' and t.version = 6) or (t.code = 'id_upload' and t.version = 2) or (t.code = 'hoa_info' and t.version = 2) or (t.code = 'mortgage_info' and t.version = 2)) then
    raise exception 'drift: seller templates are not the expected active versions';
  else

  select jsonb_agg(
    case when elem->>'k' in ('citizenship', 'gender', 'date_of_birth', 'forwarding_address', 'leaving_town', 'divorce', 'primary_residence')
      then jsonb_set(elem, '{roles}', '["Client-Buyer","Client-Seller"]'::jsonb) else elem end
    order by ord) into personal
  from public.task_templates t
  cross join lateral jsonb_array_elements(t.fields) with ordinality as e(elem, ord)
  where t.code = 'personal_info' and t.version = 5;
  personal := personal || $seller$[
    {"k":"ground_rent","label":"Ground rent?","type":"select","req":false,"opts":["Yes","No"],"roles":["Client-Seller"]},
    {"k":"front_foot","label":"Front foot benefit charge?","type":"select","req":false,"opts":["Yes","No"],"roles":["Client-Seller"]},
    {"k":"travel_dates","label":"Travel dates","type":"text","req":true,"roles":["Client-Seller"],"when":["leaving_town","Yes"]},
    {"k":"homestead","label":"Homestead?","type":"select","req":false,"opts":["Yes","No"],"roles":["Client-Seller"]},
    {"k":"tenants_after","label":"Tenants at or after closing?","type":"select","req":false,"opts":["Yes","No"],"roles":["Client-Seller"]},
    {"k":"water_provider","label":"Water service provider","type":"text","req":false,"roles":["Client-Seller"]},
    {"k":"deceased_owners","label":"Any vested owners deceased?","type":"select","req":false,"opts":["Yes","No"],"roles":["Client-Seller"]},
    {"k":"in_state","label":"In-state resident?","type":"select","req":false,"opts":["Yes","No"],"roles":["Client-Seller"]},
    {"k":"name_changed","label":"Name changed since purchase?","type":"select","req":false,"opts":["Yes","No"],"roles":["Client-Seller"]},
    {"k":"existing_survey","label":"Existing survey?","type":"select","req":false,"opts":["Yes","No"],"roles":["Client-Seller"]},
    {"k":"bankruptcy","label":"Ever declared bankruptcy?","type":"select","req":false,"opts":["Yes","No"],"roles":["Client-Seller"]},
    {"k":"water_meter","label":"Water meter location","type":"select","req":false,"opts":["Inside","Outside"],"roles":["Client-Seller"]},
    {"k":"water_meter_where","label":"Where is the water meter?","type":"text","req":false,"roles":["Client-Seller"]},
    {"k":"proceeds_statement","label":"Seller proceeds","type":"info","req":false,"roles":["Client-Seller"],"text":"I understand that all seller proceeds must be disbursed to the seller(s) of record. If the seller is an entity or trust, the proceeds must be disbursed directly to that entity or trust."},
    {"k":"proceeds_ack","label":"I acknowledge and understand the above statement.","type":"checkbox","req":true,"roles":["Client-Seller"]}
  ]$seller$::jsonb;

  select jsonb_agg(
    case when elem->>'k' = 'id_document' then jsonb_set(elem, '{roles}', '["Client-Buyer"]'::jsonb) else elem end
    order by ord) into idfields
  from public.task_templates t
  cross join lateral jsonb_array_elements(t.fields) with ordinality as e(elem, ord)
  where t.code = 'id_upload' and t.version = 1;
  idfields := idfields || $id$[
    {"k":"id_front","label":"Identification, front","type":"doc","req":true,"roles":["Client-Seller"]},
    {"k":"id_back","label":"Identification, back","type":"doc","req":true,"roles":["Client-Seller"]}
  ]$id$::jsonb;

  select t.fields || $hoa$[{"k":"confirm_hoa","label":"I have reviewed and confirm these HOA details.","type":"checkbox","req":true}]$hoa$::jsonb
    into hoa from public.task_templates t where t.code = 'hoa_info' and t.version = 1;

  update public.task_templates set active = false where code = 'personal_info' and active;
  insert into public.task_templates (code, version, title, description, roles, due_days, due_anchor, fields, active, published_at, agent_roles, client_only, lane, audiences)
  select t.code, 6, t.title,
    'Buyer and seller personal details. Sellers also confirm proceeds, the property, and utilities. Spouse details are on the Spouse tab, not here.',
    t.roles, t.due_days, t.due_anchor, personal, true, now(), t.agent_roles, t.client_only, t.lane, t.audiences
  from public.task_templates t where t.code = 'personal_info' and t.version = 5;

  update public.task_templates set active = false where code = 'id_upload' and active;
  insert into public.task_templates (code, version, title, description, roles, due_days, due_anchor, fields, active, published_at, agent_roles, client_only, lane, audiences)
  select t.code, 2, 'Upload identification',
    'A clear photo or scan of a government ID. Sellers upload the front and the back.',
    t.roles, t.due_days, t.due_anchor, idfields, true, now(), t.agent_roles, t.client_only, t.lane, t.audiences
  from public.task_templates t where t.code = 'id_upload' and t.version = 1;

  update public.task_templates set active = false where code = 'hoa_info' and active;
  insert into public.task_templates (code, version, title, description, roles, due_days, due_anchor, fields, active, published_at, agent_roles, client_only, lane, audiences)
  select t.code, 2, 'Confirm HOA Information',
    'Review the HOA or condo details and confirm they are right.',
    t.roles, t.due_days, t.due_anchor, hoa, true, now(), t.agent_roles, t.client_only, t.lane, t.audiences
  from public.task_templates t where t.code = 'hoa_info' and t.version = 1;

  update public.task_templates set active = false where code = 'mortgage_info' and active;
  insert into public.task_templates (code, version, title, description, roles, due_days, due_anchor, fields, active, published_at, agent_roles, client_only, lane, audiences)
  select t.code, 2, 'Outstanding Mortgage Information',
    'Each mortgage to be paid off at closing. Add another mortgage if there is more than one.',
    t.roles, t.due_days, t.due_anchor,
    $mort$[{"k":"none","label":"No mortgage on this property","type":"checkbox","req":false},{"k":"mortgages","label":"Mortgages","type":"mortgages","req":false}]$mort$::jsonb,
    true, now(), t.agent_roles, t.client_only, t.lane, t.audiences
  from public.task_templates t where t.code = 'mortgage_info' and t.version = 1;
  end if;

  update public.tasks task
  set template_id = nxt.id, template_version = nxt.version, title = nxt.title, description = nxt.description
  from public.task_templates nxt
  where nxt.active and nxt.code = task.template_code
    and task.template_code in ('personal_info', 'id_upload', 'hoa_info', 'mortgage_info')
    and task.kind = 'form' and task.status = 'todo' and task.saved_at is null
    and coalesce(task.form_data, '{}'::jsonb) = '{}'::jsonb
    and task.template_version < nxt.version;
end
$tpl$;

do $readback$
declare fields jsonb;
begin
  if to_regclass('private.party_ssn') is null then raise exception 'readback: party_ssn missing'; end if;
  if to_regclass('public.spouse_info') is null then raise exception 'readback: spouse_info missing'; end if;
  if position('buyer_ssn_key' in (select p.prosrc from pg_proc p where p.oid = 'private.buyer_ssn_key()'::regprocedure)) = 0 then
    raise exception 'readback: encryption key name changed';
  end if;
  if position('Client-Seller' in (select p.prosrc from pg_proc p where p.oid = 'private.rpc_save_party_ssn(uuid,text,text)'::regprocedure)) = 0 then
    raise exception 'readback: a seller cannot save a number';
  end if;
  select t.fields into fields from public.task_templates t where t.code = 'personal_info' and t.active;
  if not exists (select 1 from jsonb_array_elements(fields) f where f->>'k' = 'proceeds_ack' and f->>'req' = 'true' and f->'roles' ? 'Client-Seller') then
    raise exception 'readback: the proceeds acknowledgment is not required for the seller';
  end if;
  if not exists (select 1 from jsonb_array_elements(fields) f where f->>'k' = 'citizenship' and f->'roles' ? 'Client-Seller') then
    raise exception 'readback: citizenship is not on the seller form';
  end if;
  if exists (select 1 from jsonb_array_elements(fields) f where f->>'k' ~* 'ssn|social_security|spouse') then
    raise exception 'readback: SSN or spouse answers were added to the task form';
  end if;
  select t.fields into fields from public.task_templates t where t.code = 'id_upload' and t.active;
  if not exists (select 1 from jsonb_array_elements(fields) f where f->>'k' = 'id_front' and f->>'req' = 'true')
     or not exists (select 1 from jsonb_array_elements(fields) f where f->>'k' = 'id_back' and f->>'req' = 'true') then
    raise exception 'readback: front and back identification are not both required';
  end if;
  select t.fields into fields from public.task_templates t where t.code = 'mortgage_info' and t.active;
  if not exists (select 1 from jsonb_array_elements(fields) f where f->>'k' = 'mortgages' and f->>'type' = 'mortgages') then
    raise exception 'readback: mortgages are not repeatable';
  end if;
  select t.fields into fields from public.task_templates t where t.code = 'hoa_info' and t.active;
  if not exists (select 1 from jsonb_array_elements(fields) f where f->>'k' = 'confirm_hoa' and f->>'req' = 'true') then
    raise exception 'readback: HOA confirmation is missing';
  end if;
end
$readback$;
commit;
