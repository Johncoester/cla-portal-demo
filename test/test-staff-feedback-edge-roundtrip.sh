#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="${CLA_EDGE_TEST_DB:-cla_portal_edge_roundtrip}"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "drop database if exists \"$DB\";"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "create database \"$DB\";"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/test/sql/staff-feedback-harness.sql" >/tmp/edge-harness.out
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/supabase/migrations/20261107180000_staff_feedback_chat.sql" >/tmp/edge-base.out
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/supabase/migrations/20261107233000_staff_feedback_dispatch_claim.sql" >/tmp/edge-claim.out
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/supabase/migrations/20261108004208_staff_feedback_portal_conversation.sql" >/tmp/edge-migrate.out
CLA_EDGE_TEST_DB="$DB" node "$ROOT/test/test-feedback-edge-sql-roundtrip.js"
