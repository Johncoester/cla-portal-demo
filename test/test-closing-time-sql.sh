#!/bin/bash
# Scratch Postgres only. Does not connect to hosted TEST.
# The repo migrations are deltas on the hosted schema (roles, private helpers, deals).
# This script creates that deals precondition, applies every forward migration that can
# run, then apply / rollback / reapply of the closing-time migration.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="${CLA_CLOSING_TIME_DB:-cla_closing_time_scratch}"
SQL="$ROOT/supabase/migrations/20261110190000_deal_closing_time.sql"
BACK="$ROOT/supabase/rollbacks/20261110190000_deal_closing_time.sql"
PSQL=(sudo -u postgres psql -v ON_ERROR_STOP=1 -X -q)

"${PSQL[@]}" -d postgres -c "drop database if exists \"$DB\";"
"${PSQL[@]}" -d postgres -c "create database \"$DB\";"
"${PSQL[@]}" -d "$DB" <<'SQL'
create schema if not exists auth;
create schema if not exists extensions;
create schema if not exists private;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;
create table public.deals (
  id uuid primary key default gen_random_uuid(),
  file_number text not null default ''
);
alter table public.deals enable row level security;
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  custom jsonb not null default '{}'::jsonb
);
-- Same refusal the hosted CRM check gives an unknown contacts.custom key.
create or replace function private.crm_custom_in(p jsonb) returns jsonb
language plpgsql as $$
begin
  if p ? 'marker' then
    raise exception 'unknown contacts.custom key';
  end if;
  return p;
end $$;
create or replace function private.contacts_custom_guard() returns trigger
language plpgsql as $$
begin
  new.custom := private.crm_custom_in(coalesce(new.custom, '{}'::jsonb));
  return new;
end $$;
create trigger contacts_custom_guard before insert or update of custom on public.contacts
for each row execute function private.contacts_custom_guard();
insert into public.contacts (custom) values ('{"leadSource":"homeowner"}'::jsonb);
SQL

# Apply every forward migration. Hosted-only deltas stop themselves; record that and continue.
applied=0
refused=0
for f in $(ls "$ROOT"/supabase/migrations/*.sql | grep -v rollback | grep -v 20261110190000 | sort); do
  if "${PSQL[@]}" -d "$DB" -f "$f" >/tmp/closing-time-chain.out 2>/tmp/closing-time-chain.err; then
    applied=$((applied+1))
  else
    refused=$((refused+1))
  fi
done
echo "chain applied=$applied refused=$refused"
grep -q '20261110100000' <(ls "$ROOT"/supabase/migrations/20261110100000_crm_hosted_import.sql)

"${PSQL[@]}" -d "$DB" -f "$SQL"
"${PSQL[@]}" -d "$DB" <<'SQL'
insert into public.deals (closing_time) values ('09:30');
do $$ begin
  begin
    insert into public.deals (closing_time) values ('25:99');
    raise exception 'bad time was accepted';
  exception when check_violation then null;
  end;
  if (select count(*) from public.contacts where custom ? 'marker') <> 0 then
    raise exception 'a marker landed in contacts.custom';
  end if;
  if (select custom->>'leadSource' from public.contacts) is distinct from 'homeowner' then
    raise exception 'contacts.custom changed';
  end if;
end $$;
SQL
"${PSQL[@]}" -d "$DB" -f "$BACK"
"${PSQL[@]}" -d "$DB" -c "do \$\$ begin if exists (select 1 from information_schema.columns where table_name='deals' and column_name='closing_time') then raise exception 'rollback left closing_time'; end if; end \$\$;"
"${PSQL[@]}" -d "$DB" -f "$SQL"
"${PSQL[@]}" -d "$DB" -c "insert into public.deals (closing_time) values (''); select count(*) from public.deals where closing_time = '09:30';"
# a second apply must refuse
if "${PSQL[@]}" -d "$DB" -f "$SQL" >/tmp/closing-time-again.out 2>/tmp/closing-time-again.err; then
  echo "FAIL second apply did not refuse"; exit 1
fi
grep -q 'already exists' /tmp/closing-time-again.err
echo "closing time sql passed (chain applied=$applied refused=$refused)"
