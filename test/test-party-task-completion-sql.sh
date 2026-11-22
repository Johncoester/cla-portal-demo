#!/bin/bash
# Disposable local Postgres only. Does not connect to the TEST project and does not use its keys.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="${CLA_PARTY_TASK_TEST_DB:-cla_party_task_completion_test}"
P="sudo -u postgres psql -v ON_ERROR_STOP=1"
$P -c "drop database if exists \"$DB\";"
$P -c "create database \"$DB\";"
$P -d "$DB" -f "$ROOT/test/sql/party-task-completion-harness.sql" >/tmp/party-task-harness.out
$P -d "$DB" -f "$ROOT/supabase/migrations/20261124100000_party_task_completion.sql" >/tmp/party-task-migrate.out
$P -d "$DB" -f "$ROOT/test/sql/party-task-completion-checks.sql" >/tmp/party-task-checks.out
$P -d "$DB" -f "$ROOT/supabase/rollbacks/20261124100000_party_task_completion.sql" >/tmp/party-task-rollback.out
$P -d "$DB" -f "$ROOT/test/sql/party-task-completion-rollback-checks.sql" >/tmp/party-task-rollback-checks.out
echo "party task completion sql passed"
