#!/bin/bash
# JC-AGENT-EDIT-1 (John Coester, Nov 25 2026, 1:57 PM ET): only an Admin or Super admin can edit another person's agent profile
# and upload their picture; the agent's own save still works. Disposable local Postgres only. Does not connect to TEST and
# does not use its data. The agent-profile helpers are the exact TEST bodies (test/sql/agent-profile-helpers.sql).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DATA="$(mktemp -d "${TMPDIR:-/tmp}/cla-agent-edit-XXXXXX")"
PORT=$(( 56000 + RANDOM % 4000 ))
cleanup() { "$BIN/pg_ctl" -D "$DATA/db" -m immediate -w stop >/dev/null 2>&1 || true; rm -rf "$DATA"; }
trap cleanup EXIT
"$BIN/initdb" -D "$DATA/db" --username=postgres --auth=trust --no-instructions >/dev/null
"$BIN/pg_ctl" -D "$DATA/db" -o "-p $PORT -k $DATA -c listen_addresses=''" -l "$DATA/server.log" -w start >/dev/null
export PGHOST="$DATA" PGPORT="$PORT" PGUSER=postgres PGDATABASE=postgres
q() { psql -X -q -v ON_ERROR_STOP=1 "$@"; }
val() { psql -X -q -tA -v ON_ERROR_STOP=1 -c "$1"; }
fail=0
ok() { if [ "$1" = "$2" ]; then echo "ok $3"; else echo "FAIL $3 (got '$1', want '$2')"; fail=1; fi; }
# run SQL as a signed-in portal user (role authenticated); prints OK or the error message
as() { local uid="$1"; shift; local err; err=$(psql -X -q -tA -v ON_ERROR_STOP=1 -c "set app.uid = '$uid'; set role authenticated; $*" 2>&1 >/dev/null || true); err=$(printf '%s\n' "$err" | grep -m1 'ERROR' | sed -e 's/^.*ERROR: *//' || true); if [ -n "$err" ]; then printf '%s' "$err"; else printf 'OK'; fi; }

SA=10000000-0000-0000-0000-000000000001; AD=10000000-0000-0000-0000-000000000002; PR=10000000-0000-0000-0000-000000000003
SP=10000000-0000-0000-0000-000000000004; ST=10000000-0000-0000-0000-000000000005; PA=10000000-0000-0000-0000-000000000006
AG=20000000-0000-0000-0000-000000000001; AG2=20000000-0000-0000-0000-000000000002; CL=20000000-0000-0000-0000-000000000003
NEW=20000000-0000-0000-0000-000000000004; DEMO=20000000-0000-0000-0000-000000000005

q <<SQL
create schema private; create schema extensions; create schema storage;
create role authenticated nologin; create role anon nologin;
grant usage on schema public, private, storage to authenticated, anon;
create table public.profiles (id uuid primary key, email text, first_name text, last_name text, phone text, role text, status text default 'active', is_admin boolean default false, is_demo boolean default false);
create table public.contacts (id uuid primary key default gen_random_uuid(), profile_id uuid, company text, contact_type text, created_at timestamptz default now());
create table public.deal_participants (id uuid primary key default gen_random_uuid(), deal_id uuid, contact_id uuid, role text);
create table public.agent_profiles (profile_id uuid primary key, cell_phone text, office_phone text, brokerage text, license_number text, street text, city text, state text, zip text, other_contact text, photo_path text, photo_shape text default 'circle', updated_at timestamptz);
create table public.agent_private (profile_id uuid primary key, birth_month int, birth_day int, birthdate date, updated_at timestamptz, updated_by uuid);
grant select on public.agent_profiles, public.profiles to authenticated;
create function private.effective_uid() returns uuid language sql stable as \$\$ select nullif(current_setting('app.uid', true), '')::uuid \$\$;
create function private.viewer_is_demo() returns boolean language sql stable security definer as \$\$ select coalesce((select is_demo from public.profiles where id = private.effective_uid()), false) \$\$;
create function private.can_invite_agents() returns boolean language sql stable security definer as \$\$ select exists (select 1 from public.profiles where id = private.effective_uid() and (is_admin or role <> 'Outside user')) \$\$;
grant execute on all functions in schema private to authenticated;
-- storage.objects as Supabase has it (only the columns the policies use), RLS on
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, unique (bucket_id, name));
create function storage.foldername(name text) returns text[] language sql immutable as \$\$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] \$\$;
grant execute on function storage.foldername(text) to authenticated;
alter table storage.objects enable row level security;
grant select, insert, update on storage.objects to authenticated;
-- TEST's existing agent-photos policies (read, insert, update), unchanged by the migration
create function private.agent_photo_visible(p_name text) returns boolean language sql stable security definer as \$\$ select coalesce((storage.foldername(p_name))[1] = private.effective_uid()::text, false) or private.can_invite_agents() \$\$;
create policy agent_photos_read on storage.objects for select to authenticated using ((bucket_id = 'agent-photos') and private.agent_photo_visible(name));
create policy agent_photos_insert on storage.objects for insert to authenticated with check ((bucket_id = 'agent-photos') and ((storage.foldername(name))[1] = (private.effective_uid())::text) and (exists (select 1 from public.agent_profiles where agent_profiles.profile_id = private.effective_uid())));
create policy agent_photos_update on storage.objects for update to authenticated using ((bucket_id = 'agent-photos') and ((storage.foldername(name))[1] = (private.effective_uid())::text)) with check ((bucket_id = 'agent-photos') and ((storage.foldername(name))[1] = (private.effective_uid())::text));
SQL
q -f "$ROOT/test/sql/agent-profile-helpers.sql" >/dev/null
q -c "grant execute on all functions in schema private to authenticated; grant execute on function public.update_my_agent_profile(jsonb) to authenticated;"

q <<SQL
insert into public.profiles (id, email, first_name, last_name, phone, role, is_admin) values
 ('$SA', 'king.john@example.test', 'King', 'John', '', 'Super admin', true),
 ('$AD', 'adam.admin@example.test', 'Adam', 'Admin', '', 'Admin', true),
 ('$PR', 'paula.processor@example.test', 'Paula', 'Processor', '', 'Processor', false),
 ('$SP', 'sam.sales@example.test', 'Sam', 'Salesperson', '', 'Sales Person', false),
 ('$ST', 'tina.team@example.test', 'Tina', 'Salesteam', '', 'Sales Team', false),
 ('$PA', 'pete.proc-admin@example.test', 'Pete', 'Proc-Admin', '', 'Processor', true),
 ('$AG', 'bianca.agent@example.test', 'Bianca', 'Buyer-Agent', '301-555-0105', 'Outside user', false),
 ('$AG2', 'larry.agent@example.test', 'Larry', 'Listing-Agent', '301-555-0106', 'Outside user', false),
 ('$CL', 'ben.buyer@example.test', 'Ben', 'Buyer', '301-555-0107', 'Outside user', false),
 ('$NEW', 'nora.new-agent@example.test', 'Nora', 'New-Agent', '301-555-0108', 'Outside user', false);
insert into public.profiles (id, email, first_name, last_name, phone, role, is_admin, is_demo) values ('$DEMO', 'dana.demo@example.test', 'Dana', 'Demo', '301-555-0109', 'Outside user', false, true);
insert into public.agent_profiles (profile_id, cell_phone, brokerage, license_number, photo_shape) values ('$AG', '301-555-0105', 'Harbor Realty (fake)', 'FAKE-MD-0505', 'circle'), ('$AG2', '301-555-0106', 'Oak Street Realty (fake)', 'FAKE-MD-0606', 'square'), ('$DEMO', '301-555-0109', 'Demo Realty (fake)', '', 'circle');
insert into public.contacts (profile_id, company, contact_type) values ('$CL', '', 'buyer_seller');
insert into public.contacts (id, profile_id, company, contact_type) values ('30000000-0000-0000-0000-000000000004', '$NEW', 'Newbie Realty (fake)', null);
insert into public.deal_participants (deal_id, contact_id, role) values (gen_random_uuid(), '30000000-0000-0000-0000-000000000004', 'Listing Agent');
SQL

q -f "$ROOT/supabase/migrations/20261131060000_admin_edit_agent_profile.sql" >/dev/null 2>&1
q -f "$ROOT/supabase/migrations/20261131060000_admin_edit_agent_profile.sql" >/dev/null   # applying twice is harmless
ok "$(val "select count(*) from pg_policies where schemaname = 'storage' and policyname like 'agent_photos%'")" "5" 'migration adds 2 storage policies next to the 3 existing ones'

# Super admin and Admin can edit
ok "$(as $SA "select public.admin_update_agent_profile('$AG', '{\"firstName\": \"Bea\", \"lastName\": \"Agent\", \"cellPhone\": \"410-555-0177\", \"officePhone\": \"4105550178\", \"brokerage\": \"Harbor Realty II (fake)\", \"photoShape\": \"square\", \"photoPath\": \"$AG/avatar.jpg\", \"email\": \"hijack@example.test\", \"licenseNumber\": \"CHANGED\", \"birthMonth\": 2, \"street\": \"1 Main\"}')")" "OK" 'Super admin can edit an agent profile'
ok "$(val "select first_name || ' ' || last_name || '|' || email || '|' || phone from public.profiles where id = '$AG'")" "Bea Agent|bianca.agent@example.test|410-555-0177" 'name and cell saved; email unchanged'
ok "$(val "select cell_phone || '|' || office_phone || '|' || brokerage || '|' || license_number || '|' || coalesce(street, '') || '|' || photo_path || '|' || photo_shape from public.agent_profiles where profile_id = '$AG'")" "410-555-0177|4105550178|Harbor Realty II (fake)|FAKE-MD-0505||$AG/avatar.jpg|square" 'brokerage, phones and picture saved; license and address not touched'
ok "$(val "select count(*) from public.agent_private")" "0" 'birthday not touched'
ok "$(as $AD "select public.admin_update_agent_profile('$AG', '{\"brokerage\": \"Harbor Realty III (fake)\"}')")" "OK" 'Admin can edit an agent profile'
ok "$(val "select brokerage || '|' || photo_path from public.agent_profiles where profile_id = '$AG'")" "Harbor Realty III (fake)|$AG/avatar.jpg" 'leaving the picture out keeps it'
ok "$(as $PA "select public.admin_update_agent_profile('$AG', '{\"officePhone\": \"\"}')")" "OK" 'a Processor with the Admin flag counts as an Admin (same check as User List)'
ok "$(as $SA "select public.admin_update_agent_profile('$AG', '{\"photoPath\": \"\"}')")" "OK" 'an Admin can remove the picture'
ok "$(val "select coalesce(photo_path, 'none') from public.agent_profiles where profile_id = '$AG'")" "none" 'picture removed'
ok "$(as $SA "select (public.admin_get_agent_profile('$AG') ->> 'brokerage')")" "OK" 'Admin can read the profile for the edit page'
ok "$(as $AD "select public.admin_update_agent_profile('$NEW', '{\"brokerage\": \"Newbie Realty II (fake)\", \"cellPhone\": \"301-555-0118\"}')")" "OK" 'an agent on a file with no agent profile yet gets one'
ok "$(val "select brokerage from public.agent_profiles where profile_id = '$NEW'")" "Newbie Realty II (fake)" 'new agent profile row saved'

# nobody else can edit someone else's profile
for who in $PR $SP $ST $AG2 $CL; do
  ok "$(as $who "select public.admin_update_agent_profile('$AG', '{\"brokerage\": \"Hijack (fake)\"}')")" "Only an Admin or Super admin can edit an agent profile." "$who cannot edit someone else's agent profile"
  ok "$(as $who "select public.admin_get_agent_profile('$AG')")" "Only an Admin or Super admin can edit an agent profile." "$who cannot read the edit page data"
done
ok "$(as '' "select public.admin_update_agent_profile('$AG', '{\"brokerage\": \"Hijack (fake)\"}')")" "Only an Admin or Super admin can edit an agent profile." 'no sign-in is refused'
ok "$(psql -X -q -tA -c "set role anon; select public.admin_update_agent_profile('$AG', '{}')" 2>&1 | grep -c 'permission denied')" "1" 'anon cannot call it at all'
ok "$(val "select brokerage from public.agent_profiles where profile_id = '$AG'")" "Harbor Realty III (fake)" 'nothing changed by the refused tries'

# only agents, only valid values
ok "$(as $SA "select public.admin_update_agent_profile('$PR', '{\"brokerage\": \"x\"}')")" "Agent not found. Only a real estate agent with an active portal login has an agent profile." 'a staff login is not an agent'
ok "$(as $SA "select public.admin_update_agent_profile('$CL', '{\"brokerage\": \"x\"}')")" "Agent not found. Only a real estate agent with an active portal login has an agent profile." 'a buyer is not an agent'
ok "$(as $SA "select public.admin_update_agent_profile('$DEMO', '{\"brokerage\": \"x\"}')")" "Agent not found. Only a real estate agent with an active portal login has an agent profile." 'a demo agent is out of a real Admin scope'
ok "$(as $SA "select public.admin_update_agent_profile('$AG', '{\"photoPath\": \"$AG2/avatar.jpg\"}')")" "The picture must be uploaded for this agent." "cannot point at another agent's picture"
ok "$(as $SA "select public.admin_update_agent_profile('$AG', '{\"cellPhone\": \"\"}')")" "Cell phone is required." 'cell phone required'
ok "$(as $SA "select public.admin_update_agent_profile('$AG', '{\"cellPhone\": \"12\"}')")" "Cell phone must be a 10-digit phone number." 'cell phone checked like the agent save'
ok "$(as $SA "select public.admin_update_agent_profile('$AG', '{\"firstName\": \" \"}')")" "First and last name are required." 'name required'
ok "$(as $SA "select public.admin_update_agent_profile('$AG', '{\"photoShape\": \"star\"}')")" "Picture shape must be circle or square." 'shape checked'

# the agent's own save still works, and still only for themselves
ok "$(as $AG2 "select public.update_my_agent_profile('{\"brokerage\": \"Oak Street Realty II (fake)\", \"cellPhone\": \"301-555-0166\"}')")" "OK" "the agent's own edit still works"
ok "$(val "select brokerage || '|' || cell_phone from public.agent_profiles where profile_id = '$AG2'")" "Oak Street Realty II (fake)|301-555-0166" "the agent's own edit saved"

# storage: an Admin may write exactly <agent id>/avatar.jpg; others keep only their own folder
ok "$(as $SA "insert into storage.objects (bucket_id, name) values ('agent-photos', '$AG/avatar.jpg')")" "OK" "Admin can upload an agent's picture"
ok "$(as $AD "update storage.objects set owner = '$AD' where bucket_id = 'agent-photos' and name = '$AG/avatar.jpg'")" "OK" "Admin can replace an agent's picture"
ok "$(as $SA "insert into storage.objects (bucket_id, name) values ('agent-photos', '$AG/other.jpg')")" 'new row violates row-level security policy for table "objects"' 'only avatar.jpg'
ok "$(as $SA "insert into storage.objects (bucket_id, name) values ('agent-photos', '$PR/avatar.jpg')")" 'new row violates row-level security policy for table "objects"' 'not into a staff folder'
ok "$(as $SA "insert into storage.objects (bucket_id, name) values ('documents', '$AG/avatar.jpg')")" 'new row violates row-level security policy for table "objects"' 'not into another bucket'
for who in $PR $SP $ST $AG2 $CL; do
  ok "$(as $who "insert into storage.objects (bucket_id, name) values ('agent-photos', '$AG2/x-$who.jpg'), ('agent-photos', '$AG/avatar2.jpg')")" 'new row violates row-level security policy for table "objects"' "$who cannot upload into another agent's folder"
done
ok "$(as $AG2 "insert into storage.objects (bucket_id, name) values ('agent-photos', '$AG2/avatar.jpg')")" "OK" 'an agent still uploads their own picture'

# rollback removes only what was added; re-apply works
q -f "$ROOT/supabase/rollbacks/20261131060000_admin_edit_agent_profile.sql" >/dev/null
ok "$(val "select count(*) from pg_policies where schemaname = 'storage' and policyname like 'agent_photos%'")" "3" 'rollback leaves the 3 original storage policies'
ok "$(val "select count(*) from pg_proc where proname in ('admin_update_agent_profile', 'admin_get_agent_profile', 'rpc_admin_update_agent_profile', 'rpc_admin_get_agent_profile', 'admin_agent_target', 'admin_agent_photo_ok')")" "0" 'rollback drops the new functions'
ok "$(val "select brokerage from public.agent_profiles where profile_id = '$AG'")" "Harbor Realty III (fake)" 'rollback keeps saved values'
ok "$(as $AG2 "select public.update_my_agent_profile('{\"brokerage\": \"Oak Street Realty III (fake)\"}')")" "OK" "the agent's own edit works after rollback"
q -f "$ROOT/supabase/rollbacks/20261131060000_admin_edit_agent_profile.sql" >/dev/null 2>&1   # rollback twice is harmless
q -f "$ROOT/supabase/migrations/20261131060000_admin_edit_agent_profile.sql" >/dev/null 2>&1
ok "$(as $AD "select public.admin_update_agent_profile('$AG', '{\"brokerage\": \"Harbor Realty IV (fake)\"}')")" "OK" 're-applied after rollback'

[ "$fail" = 0 ] && echo "jc-agent-edit-1 sql passed"
exit "$fail"
