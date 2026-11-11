#!/bin/bash
# Disposable local Postgres only. Does not connect to the TEST project.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="${CLA_MASS_EMAIL_CAP_DB:-cla_mass_email_cap}"
P="${CLA_PSQL:-sudo -u postgres psql} -X -q -v ON_ERROR_STOP=1"
$P -c "drop database if exists \"$DB\";"
$P -c "create database \"$DB\";"
$P -d "$DB" <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select '11111111-1111-4111-8111-111111111111'::uuid $$;
create table public.profiles (id uuid primary key, first_name text, last_name text, email text, role text);
insert into public.profiles (id, first_name, last_name, email, role) values ('11111111-1111-4111-8111-111111111111', 'Ada', 'Admin', 'ada@example.test', 'Super admin');
create table public.crm_leads (id uuid primary key, email text);
create table public.crm_emails (
  id bigint generated always as identity primary key,
  entity text, entity_id uuid, from_email text, to_emails text[], cc_emails text[], bcc_emails text[],
  subject text, body_html text, status text, scheduled_at timestamptz, created_by uuid
);
create function public.crm_match_ids(p_module text, p_filter jsonb) returns setof uuid language sql stable as $$ select id from public.crm_leads $$;
SQL
$P -d "$DB" -f "$ROOT/supabase/migrations/20261116040000_crm_mass_email_cap.sql" >/tmp/crm-mass-email-cap-migrate.out
anon_exec=$($P -d "$DB" -tA -c "select has_function_privilege('anon', 'public.crm_mass_email(text, jsonb, text, text, uuid[], boolean)', 'execute')")
auth_exec=$($P -d "$DB" -tA -c "select has_function_privilege('authenticated', 'public.crm_mass_email(text, jsonb, text, text, uuid[], boolean)', 'execute')")
test "$anon_exec" = "f"
test "$auth_exec" = "t"
$P -d "$DB" <<'SQL'
insert into public.crm_leads (id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Ada@example.test'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'ada@example.test'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'bea@example.test');
SQL
count=$($P -d "$DB" -tA -c "select public.crm_mass_email('lead', '{}'::jsonb, '', '', array['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3']::uuid[], true)->>'recipients'")
test "$count" = "2"
saved=$($P -d "$DB" -tA -c "select public.crm_mass_email('lead', '{}'::jsonb, 'Hello', '<p>Hi</p>', array['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3']::uuid[], false)->>'drafted'")
rows=$($P -d "$DB" -tA -c "select count(*) from public.crm_emails where status = 'drafted'")
test "$saved" = "2"
test "$rows" = "2"
$P -d "$DB" -c "insert into public.crm_leads (id, email) select ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'p' || i || '@example.test' from generate_series(1, 249) i;"
if $P -d "$DB" -c "select public.crm_mass_email('lead', '{}'::jsonb, 'Too many', '<p>Hi</p>', null, false);" >/tmp/crm-mass-email-cap-over.out 2>&1; then
  echo "FAIL: over the cap was saved" >&2
  exit 1
fi
grep -q "251 recipients is over the limit of 250" /tmp/crm-mass-email-cap-over.out
after=$($P -d "$DB" -tA -c "select count(*) from public.crm_emails")
test "$after" = "2"
$P -d "$DB" -f "$ROOT/supabase/rollbacks/20261116040000_crm_mass_email_cap.sql" >/tmp/crm-mass-email-cap-rollback.out
sig=$($P -d "$DB" -tA -c "select pg_get_function_identity_arguments(oid) from pg_proc where proname = 'crm_mass_email'")
test "$sig" = "p_module text, p_filter jsonb, p_subject text, p_html text"
$P -c "drop database if exists \"$DB\";"
echo "crm mass email cap passed"
