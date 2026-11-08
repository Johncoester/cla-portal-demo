#!/bin/bash
# Disposable local Postgres only. Does not connect to the TEST project and does not use its keys.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="${CLA_REFERRAL_TEST_DB:-cla_referral_source_test}"
SQL="$ROOT/supabase/migrations/20261107184500_referral_party_source.sql"
BACK="$ROOT/supabase/rollbacks/20261107184500_referral_party_source_rollback.sql"
if grep -n 'select private.lock_function_search_paths' "$SQL" "$BACK"; then
  echo "referral SQL calls the global search-path helper"
  exit 1
fi
if grep -Ei 'delete[[:space:]]+from[[:space:]]+public\.deal_business_sources' "$SQL" "$BACK"; then
  echo "referral SQL deletes stored sources"
  exit 1
fi
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "drop database if exists \"$DB\";"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "create database \"$DB\";"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/test/sql/referral-source-harness.sql" >/tmp/referral-harness.out
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$SQL" >/tmp/referral-migrate.out
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/test/sql/referral-source-checks.sql" >/tmp/referral-checks.out
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$BACK" >/tmp/referral-rollback.out
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/test/sql/referral-source-rollback-checks.sql" >/tmp/referral-rollback-checks.out
echo "referral source sql passed"
