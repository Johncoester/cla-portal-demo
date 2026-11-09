#!/bin/bash
# Disposable local Postgres only. Does not connect to the TEST project and does not use its keys.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="${CLA_FILE_NUMBER_TEST_DB:-cla_file_number_test}"
SQL="$ROOT/supabase/migrations/20261109230000_file_number_state_prefix.sql"
BACK="$ROOT/supabase/rollbacks/20261109230000_file_number_state_prefix.sql"
P="sudo -u postgres psql -v ON_ERROR_STOP=1"
$P -c "drop database if exists \"$DB\";"
$P -c "create database \"$DB\";"
$P -d "$DB" -f "$ROOT/test/sql/file-number-harness.sql" >/tmp/file-number-harness.out
$P -d "$DB" -f "$SQL" >/tmp/file-number-migrate.out
$P -d "$DB" -f "$ROOT/test/sql/file-number-checks.sql" >/tmp/file-number-checks.out
$P -d "$DB" -f "$BACK" >/tmp/file-number-rollback.out
$P -d "$DB" -f "$ROOT/test/sql/file-number-rollback-checks.sql" >/tmp/file-number-rollback-checks.out
echo "file number sql passed"
