#!/bin/bash
# Disposable local Postgres only. Does not connect to TEST or production.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="cla_tax_rates_$$"
PSQL=(sudo -u postgres psql -v ON_ERROR_STOP=1 -X -q)
cleanup() { sudo -u postgres psql -d postgres -c "drop database if exists \"$DB\";" >/dev/null 2>&1 || true; }
trap cleanup EXIT
"${PSQL[@]}" -d postgres -c "drop database if exists \"$DB\";"
"${PSQL[@]}" -d postgres -c "create database \"$DB\";"
"${PSQL[@]}" -d "$DB" -c "create extension if not exists pgcrypto;"
"${PSQL[@]}" -d "$DB" -f "$ROOT/test/sql/tax-rate-sheets-harness.sql" >/tmp/tax-rates-harness.out
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/20261125170000_tax_rate_sheets.sql" >/tmp/tax-rates-migrate.out
"${PSQL[@]}" -d "$DB" -f "$ROOT/test/sql/tax-rate-sheets-checks.sql" >/tmp/tax-rates-checks.out
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/rollbacks/20261125170000_tax_rate_sheets.sql" >/tmp/tax-rates-rollback.out
gone="$("${PSQL[@]}" -d "$DB" -tAc "select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'tax_jurisdictions'")"
if [ "$gone" != "0" ]; then
  echo "FAIL rollback left tax_jurisdictions in place" >&2
  exit 1
fi
echo "tax rate sheets sql passed"
