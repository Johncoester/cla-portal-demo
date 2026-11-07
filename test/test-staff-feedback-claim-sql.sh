#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="${CLA_CLAIM_TEST_DB:-cla_dispatch_claim_test}"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "drop database if exists \"$DB\";"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "create database \"$DB\";"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/test/sql/staff-feedback-harness.sql" >/tmp/claim-harness.out
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/supabase/migrations/20261107180000_staff_feedback_chat.sql" >/tmp/claim-base.out
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/supabase/migrations/20261107233000_staff_feedback_dispatch_claim.sql" >/tmp/claim-migrate.out
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/test/sql/staff-feedback-claim-checks.sql" >/tmp/claim-checks.out
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/supabase/migrations/20261107233000_staff_feedback_dispatch_claim_rollback.sql" >/tmp/claim-rollback.out
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -c "select to_regprocedure('public.staff_feedback_claim_dispatch(uuid,uuid)') is null and exists (select 1 from public.staff_feedback_reports) and not exists (select 1 from information_schema.columns where table_schema='public' and table_name='staff_feedback_outbox' and column_name='claim_id');" | grep -q t
echo "dispatch claim sql passed"
