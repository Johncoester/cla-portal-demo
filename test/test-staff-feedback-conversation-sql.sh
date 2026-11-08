#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="${CLA_CONVERSATION_TEST_DB:-cla_portal_conversation_test}"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "drop database if exists \"$DB\";"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "create database \"$DB\";"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/test/sql/staff-feedback-harness.sql" >/tmp/conversation-harness.out
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/supabase/migrations/20261107180000_staff_feedback_chat.sql" >/tmp/conversation-base.out
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/supabase/migrations/20261107233000_staff_feedback_dispatch_claim.sql" >/tmp/conversation-claim.out
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/supabase/migrations/20261108004208_staff_feedback_portal_conversation.sql" >/tmp/conversation-migrate.out
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/test/sql/staff-feedback-conversation-checks.sql" >/tmp/conversation-checks.out
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/supabase/migrations/20261108004208_staff_feedback_portal_conversation_rollback.sql" >/tmp/conversation-rollback.out
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -c "select to_regprocedure('public.staff_feedback_record_assistant_reply(uuid,text,uuid)') is null and to_regprocedure('public.staff_feedback_add_turn(uuid,text,uuid)') is null and exists (select 1 from public.staff_feedback_reports);" | grep -q t
echo "portal conversation sql passed"
