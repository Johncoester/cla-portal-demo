#!/bin/bash
# Disposable local Postgres. Does not connect to the hosted TEST project.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="${CLA_CONTEXT_TEST_DB:-cla_context_files_test}"
if grep -n 'select private.lock_function_search_paths' "$ROOT/supabase/migrations/20261107223000_staff_feedback_context_files.sql"; then
  echo "context migration calls the global helper"; exit 1
fi
if grep -Ei 'delete[[:space:]]+from[[:space:]]+storage\.(buckets|objects)' "$ROOT/supabase/migrations/20261107223000_staff_feedback_context_files_rollback.sql"; then
  echo "context rollback deletes storage metadata"; exit 1
fi
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "drop database if exists \"$DB\";"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "create database \"$DB\";"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/test/sql/staff-feedback-harness.sql" >/tmp/context-harness.out
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/supabase/migrations/20261107180000_staff_feedback_chat.sql" >/tmp/context-base.out
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/test/sql/staff-feedback-freeze-check.sql" >/tmp/context-freeze-before.out
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/supabase/migrations/20261107223000_staff_feedback_context_files.sql" >/tmp/context-migrate.out
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/test/sql/staff-feedback-context-checks.sql" >/tmp/context-checks.out
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/test/sql/staff-feedback-freeze-check.sql" >/tmp/context-freeze-after.out
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/supabase/migrations/20261107223000_staff_feedback_context_files_rollback.sql" >/tmp/context-rollback.out
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/test/sql/staff-feedback-freeze-check.sql" >/tmp/context-freeze-rollback.out
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -c "select to_regprocedure('public.staff_feedback_add_context_file(uuid,text,text,integer,text,uuid,integer)') is null and exists (select 1 from public.staff_feedback_attachments where mime_type = 'application/pdf') and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'staff_feedback_attachments' and column_name = 'analysis_state') and exists (select 1 from storage.objects where bucket_id = 'staff-feedback') and exists (select 1 from storage.buckets where id = 'staff-feedback' and public = false);" | grep -q t
echo "context files sql passed"
