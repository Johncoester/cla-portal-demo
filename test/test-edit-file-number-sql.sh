#!/bin/bash
# Disposable local Postgres only. Does not connect to the TEST project and does not use its keys.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="${CLA_EDIT_FILE_NUMBER_TEST_DB:-cla_edit_file_number_test}"
P="sudo -u postgres psql -v ON_ERROR_STOP=1"
$P -c "drop database if exists \"$DB\";"
$P -c "create database \"$DB\";"
$P -d "$DB" -f "$ROOT/test/sql/file-number-harness.sql" >/tmp/edit-file-number-harness.out
$P -d "$DB" -f "$ROOT/supabase/migrations/20261109230000_file_number_state_prefix.sql" >/tmp/edit-file-number-base.out
$P -d "$DB" -f "$ROOT/supabase/migrations/20261123020000_edit_file_number.sql" >/tmp/edit-file-number-migrate.out
$P -d "$DB" -f "$ROOT/test/sql/edit-file-number-checks.sql" >/tmp/edit-file-number-checks.out
$P -d "$DB" -f "$ROOT/supabase/rollbacks/20261123020000_edit_file_number.sql" >/tmp/edit-file-number-rollback.out
$P -d "$DB" -f "$ROOT/test/sql/edit-file-number-rollback-checks.sql" >/tmp/edit-file-number-rollback-checks.out
echo "edit file number sql passed"
