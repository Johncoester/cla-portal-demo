#!/usr/bin/env bash
# Throwaway local Postgres. Does not connect to TEST. Fake rows only.
# Applies 20261112060200 and 20261112060300, then calls them as two buyers and a buyer agent.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
PGDATA="$(mktemp -d /tmp/cla-holder.XXXXXX)"
PORT=54348
cleanup() { "$BIN/pg_ctl" -D "$PGDATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$PGDATA"; }
trap cleanup EXIT
"$BIN/initdb" -D "$PGDATA" --auth=trust --username=postgres >/dev/null
"$BIN/pg_ctl" -D "$PGDATA" -l "$PGDATA/log" -o "-p $PORT -k /tmp -c listen_addresses=" -w start >/dev/null
P=("$BIN/psql" -h /tmp -p "$PORT" -U postgres -d postgres -X -q -v ON_ERROR_STOP=1)

DEAL=11111111-1111-4111-8111-111111111111
BA=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1
BB=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2
AG=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1
PR=cccccccc-cccc-4ccc-8ccc-ccccccccccc1
CA=dddddddd-dddd-4ddd-8ddd-ddddddddddd1
CB=dddddddd-dddd-4ddd-8ddd-ddddddddddd2
CG=dddddddd-dddd-4ddd-8ddd-ddddddddddd3
CP=dddddddd-dddd-4ddd-8ddd-ddddddddddd4
PA=eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1
PB=eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2
TA=ffffffff-ffff-4fff-8fff-fffffffffff1
TB=ffffffff-ffff-4fff-8fff-fffffffffff2
TN=ffffffff-ffff-4fff-8fff-fffffffffff3

"${P[@]}" <<SQL
create schema if not exists auth;
create schema if not exists private;
create schema if not exists extensions;
create function auth.uid() returns uuid language sql stable as \$\$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
\$\$;
create function private.effective_uid() returns uuid language sql stable as \$\$
  select auth.uid()
\$\$;
create table public.profiles (
  id uuid primary key, first_name text, last_name text, email text, role text, status text, is_demo boolean
);
create table public.contacts (
  id uuid primary key, profile_id uuid, first_name text, last_name text, email text
);
create table public.deals (
  id uuid primary key, processor_id uuid, preprocessor_user_id uuid, tc_user_id uuid, sales_person_id uuid, is_demo boolean
);
create table public.deal_participants (
  id uuid primary key, deal_id uuid, contact_id uuid, role text
);
create table public.deal_sales_people (deal_id uuid, sales_id uuid);
create table public.task_templates (id uuid primary key, fields jsonb);
create table public.tasks (
  id uuid primary key, deal_id uuid, participant_id uuid, owner_profile_id uuid, assigned_role text,
  template_id uuid, template_code text, kind text, status text, title text, form_data jsonb,
  saved_at timestamptz, saved_by uuid, completed_at timestamptz, completed_by uuid
);
create table private.party_ssn (
  task_id uuid, subject text, ciphertext bytea, last4 text, updated_at timestamptz, updated_by uuid,
  primary key (task_id, subject)
);
create function private.can_access_deal(p_deal uuid) returns boolean language sql stable as \$\$
  select exists (
    select 1 from public.deal_participants dp
    join public.contacts c on c.id = dp.contact_id
    where dp.deal_id = p_deal and c.profile_id = private.effective_uid()
  )
\$\$;
create function private.task_visible(p_owner uuid, p_role text, p_deal uuid) returns boolean language sql stable as \$\$
  select true
\$\$;
create function private.form_owner_or_manager(p_owner uuid) returns boolean language sql stable as \$\$
  select p_owner = private.effective_uid()
\$\$;
create function private.agent_can_fill(p_task uuid) returns boolean language sql stable as \$\$ select false \$\$;
create function private.is_processor() returns boolean language sql stable as \$\$
  select exists (select 1 from public.profiles p where p.id = private.effective_uid() and p.role = 'Processor')
\$\$;
create function private.is_manager() returns boolean language sql stable as \$\$ select false \$\$;
create function private.is_staffish() returns boolean language sql stable as \$\$
  select exists (select 1 from public.profiles p where p.id = private.effective_uid() and p.role is distinct from 'Outside user')
\$\$;
create function private.me_role() returns text language sql stable as \$\$
  select p.role from public.profiles p where p.id = private.effective_uid()
\$\$;
create function private.masked_keys(p_template uuid) returns text[] language sql stable as \$\$ select '{}'::text[] \$\$;
create function private.fields_for_role(p_fields jsonb, p_role text) returns jsonb language sql stable as \$\$ select '[]'::jsonb \$\$;
create function private.validate_form(p_fields jsonb, p_data jsonb, p_complete boolean, p_deal uuid) returns jsonb language sql stable as \$\$
  select coalesce(p_data, '{}'::jsonb)
\$\$;
create function private.deal_roles(p_deal uuid) returns text[] language sql stable as \$\$
  select coalesce(array_agg(dp.role), '{}'::text[])
  from public.deal_participants dp
  join public.contacts c on c.id = dp.contact_id
  where dp.deal_id = p_deal and c.profile_id = private.effective_uid()
\$\$;
create function private.log_activity(p_deal uuid, p_action text, p_kind text, p_id uuid, p_note text) returns void language sql as \$\$ select null::void \$\$;
create function private.file_role_of(p_profile uuid, p_deal uuid) returns text language sql stable as \$\$ select ''::text \$\$;
create function private.person_name(p_profile uuid) returns text language sql stable as \$\$ select 'Person'::text \$\$;
create function private.person_label(p_profile uuid, p_deal uuid) returns text language sql stable as \$\$ select 'Person'::text \$\$;
create function private.person_label(p_profile uuid, p_deal uuid, p_role text) returns text language sql stable as \$\$ select 'Person'::text \$\$;
create function private.notify(p_who uuid[], p_kind text, p_deal uuid, p_title text, p_link text) returns void language sql as \$\$ select null::void \$\$;
create function private.ssn_staff() returns boolean language sql stable as \$\$ select false \$\$;
create function private.buyer_ssn_key() returns text language sql stable as \$\$ select repeat('k', 32) \$\$;
create function extensions.pgp_sym_encrypt(p_text text, p_key text) returns bytea language sql as \$\$ select convert_to(p_text, 'utf8') \$\$;
create function extensions.pgp_sym_decrypt(p_bytes bytea, p_key text) returns text language sql as \$\$ select convert_from(p_bytes, 'utf8') \$\$;
-- The drift guard looks these up by signature. A missing function errors before the hash check.
create function private.rpc_get_task_form(uuid) returns jsonb language plpgsql as \$\$ begin return '{}'::jsonb; end \$\$;
create function private.rpc_save_task_form(uuid, jsonb, boolean) returns text language plpgsql as \$\$ begin return ''; end \$\$;
create function private.rpc_save_party_ssn(uuid, text, text) returns void language plpgsql as \$\$ begin return; end \$\$;
create function private.rpc_read_party_ssn(uuid, text) returns text language plpgsql as \$\$ begin return ''; end \$\$;
SQL

# The placeholder bodies do not match the hosted hash and do not yet contain the participant check,
# so give them the phrase the drift guard accepts on a second run. The migration then replaces them.
"${P[@]}" -c "comment on function private.rpc_get_task_form(uuid) is 't.participant_id is not null';" >/dev/null
# comment is not prosrc. Put the phrase in the body.
"${P[@]}" <<'SQL'
create or replace function private.rpc_get_task_form(uuid) returns jsonb language plpgsql as $f$
begin
  if false then perform 1 where 't.participant_id is not null' = 'x'; end if;
  return '{}'::jsonb;
end $f$;
create or replace function private.rpc_save_task_form(uuid, jsonb, boolean) returns text language plpgsql as $f$
begin
  if false then perform 1 where 't.participant_id is not null' = 'x'; end if;
  return '';
end $f$;
create or replace function private.rpc_save_party_ssn(uuid, text, text) returns void language plpgsql as $f$
begin
  if false then perform 1 where 't.participant_id is not null' = 'x'; end if;
end $f$;
create or replace function private.rpc_read_party_ssn(uuid, text) returns text language plpgsql as $f$
begin
  if false then perform 1 where 't.participant_id is not null' = 'x'; end if;
  return '';
end $f$;
SQL

"${P[@]}" -f "$ROOT/supabase/migrations/20261112060200_buyer_task_holder.sql"
"${P[@]}" -f "$ROOT/supabase/migrations/20261112060300_outside_processor_picker.sql"

"${P[@]}" <<SQL
insert into public.profiles (id, first_name, last_name, email, role, status, is_demo) values
  ('$BA', 'Ada', 'Buyer', 'ada.buyer@example.test', 'Outside user', 'active', false),
  ('$BB', 'Ben', 'Buyer', 'ben.buyer@example.test', 'Outside user', 'active', false),
  ('$AG', 'Gina', 'Agent', 'gina.agent@example.test', 'Outside user', 'active', false),
  ('$PR', 'Paula', 'Processor', 'paula.processor@example.test', 'Processor', 'active', false);
insert into public.contacts (id, profile_id, first_name, last_name, email) values
  ('$CA', '$BA', 'Ada', 'Buyer', 'ada.buyer@example.test'),
  ('$CB', '$BB', 'Ben', 'Buyer', 'ben.buyer@example.test'),
  ('$CG', '$AG', 'Gina', 'Agent', 'gina.agent@example.test'),
  ('$CP', '$PR', 'Paula', 'Processor', 'paula.processor@example.test');
insert into public.deals (id, processor_id, is_demo) values ('$DEAL', '$PR', false);
insert into public.deal_participants (id, deal_id, contact_id, role) values
  ('$PA', '$DEAL', '$CA', 'Client-Buyer'),
  ('$PB', '$DEAL', '$CB', 'Client-Buyer'),
  ('$CG', '$DEAL', '$CG', 'Buyer Agent'),
  ('$CP', '$DEAL', '$CP', 'Processor');
insert into public.tasks (id, deal_id, participant_id, owner_profile_id, assigned_role, template_code, kind, status, title, form_data) values
  ('$TA', '$DEAL', '$PA', null, 'Client-Buyer', 'personal_info', 'form', 'todo', 'Ada personal', '{"citizenship":"U.S. Citizen"}'),
  ('$TB', '$DEAL', '$PB', null, 'Client-Buyer', 'personal_info', 'form', 'todo', 'Ben personal', '{"citizenship":"Permanent Resident"}'),
  ('$TN', '$DEAL', null, null, 'Client-Buyer', 'personal_info', 'form', 'todo', 'No participant', '{"citizenship":"Other"}');

create table public.probe (ord int, who text, step text, result text);
create function public.probe_call(p_ord int, p_who text, p_uid uuid, p_step text, p_sql text) returns void language plpgsql as \$\$
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  execute 'insert into public.probe (ord, who, step, result) select \$1, \$2, \$3, (' || p_sql || ')::text'
    using p_ord, p_who, p_step;
exception when others then
  insert into public.probe (ord, who, step, result) values (p_ord, p_who, p_step, 'ERROR ' || sqlerrm);
end \$\$;

select public.probe_call(1, 'Ada', '$BA', 'get own form', 'select private.rpc_get_task_form(''$TA'')');
select public.probe_call(2, 'Ada', '$BA', 'get Ben form', 'select private.rpc_get_task_form(''$TB'')');
select public.probe_call(3, 'Ada', '$BA', 'get task with no participant', 'select private.rpc_get_task_form(''$TN'')');
select public.probe_call(4, 'Ben', '$BB', 'get own form', 'select private.rpc_get_task_form(''$TB'')');
select public.probe_call(5, 'Ben', '$BB', 'get Ada form', 'select private.rpc_get_task_form(''$TA'')');
select public.probe_call(6, 'Ada', '$BA', 'save Ben form', 'select private.rpc_save_task_form(''$TB'', ''{"citizenship":"Other"}''::jsonb, false)');
select public.probe_call(7, 'Ada', '$BA', 'save own form', 'select private.rpc_save_task_form(''$TA'', ''{"citizenship":"U.S. Citizen"}''::jsonb, false)');
select public.probe_call(7, 'Ben', '$BB', 'save own form', 'select private.rpc_save_task_form(''$TB'', ''{"citizenship":"Permanent Resident"}''::jsonb, false)');
select public.probe_call(8, 'Ada', '$BA', 'save SSN on Ben', 'select private.rpc_save_party_ssn(''$TB'', ''self'', ''900-12-3456'')');
select public.probe_call(9, 'Ada', '$BA', 'save own SSN', 'select private.rpc_save_party_ssn(''$TA'', ''self'', ''900-12-3456'')');
select public.probe_call(10, 'Ada', '$BA', 'read own SSN', 'select private.rpc_read_party_ssn(''$TA'', ''self'')');
select public.probe_call(11, 'Ben', '$BB', 'read Ada SSN', 'select private.rpc_read_party_ssn(''$TA'', ''self'')');
select public.probe_call(12, 'Ada', '$BA', 'save SSN with no participant', 'select private.rpc_save_party_ssn(''$TN'', ''self'', ''900-12-3456'')');

insert into public.probe (ord, who, step, result)
select 20, 'owner', t.title, coalesce(p.first_name, 'blank')
from public.tasks t
left join public.profiles p on p.id = t.owner_profile_id
where t.id in ('$TA', '$TB', '$TN')
order by t.title;
SQL

echo '--- forms and SSN ---'
"${P[@]}" -c "select ord, who, step, result from public.probe order by ord, step;"

echo '--- recipients ---'
"${P[@]}" <<SQL
begin;
select set_config('request.jwt.claim.sub', '$BA', true);
select 'Ada buyer' as viewer, first_name, last_name, email, role from private.rpc_message_recipients('$DEAL') order by last_name, first_name;
commit;
begin;
select set_config('request.jwt.claim.sub', '$BB', true);
select 'Ben buyer' as viewer, first_name, last_name, email, role from private.rpc_message_recipients('$DEAL') order by last_name, first_name;
commit;
begin;
select set_config('request.jwt.claim.sub', '$AG', true);
select 'Gina agent' as viewer, first_name, last_name, email, role from private.rpc_message_recipients('$DEAL') order by last_name, first_name;
commit;
SQL
