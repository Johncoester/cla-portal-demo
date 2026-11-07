#!/bin/bash
# Disposable local Postgres only. Does not connect to the TEST project.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="${CLA_FEEDBACK_TEST_DB:-cla_staff_feedback_test}"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "drop database if exists \"$DB\";"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "create database \"$DB\";"
if grep -n 'select private.lock_function_search_paths' "$ROOT/supabase/migrations/20261107180000_staff_feedback_chat.sql"; then
  echo "migration still calls the global search-path helper"
  exit 1
fi
if grep -Ei 'delete[[:space:]]+from[[:space:]]+storage\.(buckets|objects)' "$ROOT/supabase/migrations/20261107180000_staff_feedback_chat_rollback.sql"; then
  echo "rollback deletes storage bucket or object metadata"
  exit 1
fi
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/test/sql/staff-feedback-harness.sql" >/tmp/staff-feedback-harness.out
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/supabase/migrations/20261107180000_staff_feedback_chat.sql" >/tmp/staff-feedback-migrate.out
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/test/sql/staff-feedback-freeze-check.sql" >/tmp/staff-feedback-freeze-install.out
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/test/sql/staff-feedback-checks.sql" >/tmp/staff-feedback-checks.out
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -c "select (select count(*) from public.staff_feedback_attachments) >= 1 and (select count(*) from storage.objects where bucket_id = 'staff-feedback') >= 1;" | grep -q t
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/supabase/migrations/20261107180000_staff_feedback_chat_rollback.sql" >/tmp/staff-feedback-rollback.out
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/test/sql/staff-feedback-freeze-check.sql" >/tmp/staff-feedback-freeze-rollback.out
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -c "select to_regclass('public.staff_feedback_reports') is null and to_regprocedure('private.staff_feedback_create(text,text,boolean,text,boolean,text,uuid)') is null and to_regprocedure('public.staff_feedback_create(text,text,boolean,text,boolean,text,uuid)') is null and exists (select 1 from storage.buckets where id = 'staff-feedback' and public = false) and (select count(*) from storage.objects where bucket_id = 'staff-feedback') >= 1 and not exists (select 1 from pg_policy pol join pg_class c on c.oid = pol.polrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'storage' and pol.polname like 'staff_feedback_%');" | grep -q t
echo "staff feedback sql passed"
