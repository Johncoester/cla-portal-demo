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

# pg_net and pg_cron are installed on TEST by a migration. Stock Postgres does not
# ship them, so the scratch server gets a SQL-only stand-in (no HTTP, no scheduler).
# A real install is left in place.
share="$(sudo -u postgres pg_config --sharedir)/extension"
for ext in pg_net pg_cron; do
  if [ ! -f "$share/$ext.control" ]; then
    sudo cp "$ROOT/test/pg-stubs/$ext.control" "$ROOT/test/pg-stubs/$ext"--*.sql "$share/"
  fi
done

"${PSQL[@]}" -d postgres -c "drop database if exists \"$DB\";"
"${PSQL[@]}" -d postgres -c "create database \"$DB\";"
"${PSQL[@]}" -d "$DB" -c "create schema if not exists extensions; create extension if not exists pgcrypto with schema extensions;"
"${PSQL[@]}" -d "$DB" -f "$PRE"

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
