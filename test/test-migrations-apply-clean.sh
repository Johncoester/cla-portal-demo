#!/bin/bash
# Fresh scratch database only. Does not connect to hosted TEST or production.
# Applies the idempotent precondition, then every forward file in supabase/migrations
# in filename order. The three rollback files that sit in that folder undo a forward
# file, so they are not part of the load. The first error stops the check and prints
# the file name and the database message. The tables and columns that remain are
# compared with the list saved from TEST.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="cla_migrate_clean_$$"
PRE="$ROOT/supabase/baseline/test_precondition.sql"
LIST="$ROOT/supabase/baseline/test_columns.txt"
PSQL=(sudo -u postgres psql -v ON_ERROR_STOP=1 -X -q)
cleanup() { sudo -u postgres psql -d postgres -c "drop database if exists \"$DB\";" >/dev/null 2>&1 || true; }
trap cleanup EXIT

"${PSQL[@]}" -d postgres -c "drop database if exists \"$DB\";"
"${PSQL[@]}" -d postgres -c "create database \"$DB\";"
"${PSQL[@]}" -d "$DB" -c "create schema if not exists extensions; create extension if not exists pgcrypto with schema extensions;"
"${PSQL[@]}" -d "$DB" -f "$PRE"

# pg_net and pg_cron are not part of stock Postgres. The Gmail schedule file
# creates both extensions, then calls net.http_post and cron.schedule. This
# scratch database gets those two calls as ordinary SQL (no HTTP, no scheduler).
# The folder for the control file is taken from the Postgres that is actually
# running, because pg_config can point at a different version. On the GitHub
# runner that Postgres is 16. A real install is left in place.
"${PSQL[@]}" -d "$DB" <<'SQL'
create schema if not exists net;
create or replace function net.http_post(
  url text,
  body jsonb default '{}'::jsonb,
  params jsonb default '{}'::jsonb,
  headers jsonb default '{}'::jsonb,
  timeout_milliseconds integer default 1000
) returns bigint
language sql
as $$ select 0::bigint $$;

create schema if not exists cron;
create table if not exists cron.job (
  jobid bigint generated always as identity primary key,
  schedule text not null,
  command text not null,
  jobname text
);
create or replace function cron.schedule(job_name text, schedule text, command text) returns bigint
language sql
as $$
  insert into cron.job (schedule, command, jobname)
  values (schedule, command, job_name)
  returning jobid
$$;
create or replace function cron.unschedule(job_id bigint) returns boolean
language plpgsql
as $$
begin
  delete from cron.job where jobid = job_id;
  return found;
end $$;
SQL
# The Gmail file still runs CREATE EXTENSION, which needs a control file beside
# the running server. The functions are the SQL above. This file only lets that
# create succeed and does not build them again.
major="$("${PSQL[@]}" -d "$DB" -tAc "select current_setting('server_version_num')::int / 10000")"
share="/usr/share/postgresql/${major}/extension"
write_standin() {
  local ext="$1" schema="$2"
  if [ -f "$share/$ext.control" ] && ! grep -q 'stand-in' "$share/$ext.control"; then
    return 0
  fi
  sudo tee "$share/$ext.control" >/dev/null <<EOF
comment = 'Scratch stand-in so the Gmail schedule file can create the extension'
default_version = '0.0.1'
relocatable = false
schema = ${schema}
EOF
  sudo tee "$share/$ext--0.0.1.sql" >/dev/null <<'EOF'
-- The check already created net.http_post and cron.schedule as ordinary SQL.
select 1;
EOF
}
write_standin pg_net extensions
write_standin pg_cron pg_catalog

while IFS= read -r f; do
  base="$(basename "$f")"
  case "$base" in
    *rollback*) continue ;;
  esac
  if ! "${PSQL[@]}" -d "$DB" -f "$f" >/tmp/cla-migrate-clean.out 2>/tmp/cla-migrate-clean.err; then
    echo "FAIL $base" >&2
    cat /tmp/cla-migrate-clean.err >&2
    exit 1
  fi
done < <(find "$ROOT/supabase/migrations" -name '*.sql' | sort)

got="$(mktemp)"
"${PSQL[@]}" -d "$DB" -tAc "select n.nspname||'.'||c.relname||'.'||a.attname from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r' and a.attnum>0 and not a.attisdropped order by 1" > "$got"
if ! diff -u "$LIST" "$got"; then
  echo "FAIL column list does not match the saved TEST list" >&2
  exit 1
fi
echo "migrations apply clean; public and private columns match TEST"
