#!/bin/bash
# Disposable local Postgres only. Does not connect to the TEST project.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="${CLA_FEEDBACK_TEST_DB:-cla_staff_feedback_test}"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "drop database if exists \"$DB\";"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "create database \"$DB\";"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/test/sql/staff-feedback-harness.sql" >/tmp/staff-feedback-harness.out
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/supabase/migrations/20261107180000_staff_feedback_chat.sql" >/tmp/staff-feedback-migrate.out
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/test/sql/staff-feedback-checks.sql" >/tmp/staff-feedback-checks.out
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -Atc "select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname not like 'staff_feedback_%' order by 1" > /tmp/staff-feedback-private-keepers.txt
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/supabase/migrations/20261107180000_staff_feedback_chat_rollback.sql" >/tmp/staff-feedback-rollback.out
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -c "select to_regclass('public.staff_feedback_reports') is null and to_regprocedure('private.staff_feedback_create(text,text,boolean,text,boolean,text,uuid)') is null and to_regprocedure('public.staff_feedback_create(text,text,boolean,text,boolean,text,uuid)') is null;" | grep -q t
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -Atc "select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname not like 'staff_feedback_%' order by 1" > /tmp/staff-feedback-private-keepers-after.txt
diff -u /tmp/staff-feedback-private-keepers.txt /tmp/staff-feedback-private-keepers-after.txt
echo "staff feedback sql passed"
