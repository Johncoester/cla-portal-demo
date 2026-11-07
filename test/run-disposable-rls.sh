#!/bin/bash
# Local disposable Postgres only. Does not use a hosted project or a secret.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="${TMPDIR:-/tmp}/cla-disposable-pg"
PORT="${CLA_PG_PORT:-55432}"
BIN="/usr/lib/postgresql/17/bin"
rm -rf "$DATA"
"$BIN/initdb" -D "$DATA" --username=postgres --auth=trust --no-instructions >/tmp/cla-disposable-init.log
"$BIN/pg_ctl" -D "$DATA" -o "-p $PORT -k $DATA" -l "$DATA/server.log" -w start
export PGHOST="$DATA" PGPORT="$PORT" PGUSER=postgres
psql -d postgres -c "create database cla_disposable;"
run() { psql -d cla_disposable -v ON_ERROR_STOP=1 -f "$1"; }
run "$ROOT/test/disposable-portal-baseline.sql"
for f in "$ROOT"/supabase/migrations/20261106041000_invite_accept_service.sql \
         "$ROOT"/supabase/migrations/20261106160000_place_order_nov6.sql \
         "$ROOT"/supabase/migrations/20261106170000_task_setup_admin_only.sql \
         "$ROOT"/supabase/migrations/20261106171000_hr_admin_add_employee.sql \
         "$ROOT"/supabase/migrations/20261106191000_unassigned_processor.sql; do
  echo "PRIOR $(basename "$f")"
  run "$f"
done
run "$ROOT/test/disposable-seed.sql"
psql -d cla_disposable -v ON_ERROR_STOP=1 -c "set role authenticated; select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false); insert into public.documents (deal_id, name, visibility, uploaded_by) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'before-policy.pdf', 'staff', '44444444-4444-4444-4444-444444444444');" && echo "UNEXPECTED agent insert before policy" && exit 1 || echo "agent insert refused before the new policy"
psql -d cla_disposable -c "reset role;" >/dev/null || true
run "$ROOT/supabase/migrations/20261107023000_task_owner_backfill.sql"
run "$ROOT/test/disposable-owner-checks.sql"
run "$ROOT/supabase/migrations/20261107023000_task_owner_backfill.sql"
run "$ROOT/test/disposable-owner-checks.sql"
run "$ROOT/supabase/migrations/20261107024500_agent_document_insert.sql"
run "$ROOT/test/disposable-rls-cases.sql"
run "$ROOT/test/disposable-message-visibility.sql"
echo "---- results ----"
psql -d cla_disposable -c "select name, ok, detail from public.rls_results order by ok, name;"
FAILS=$(psql -d cla_disposable -tA -c "select count(*) from public.rls_results where not ok;")
"$BIN/pg_ctl" -D "$DATA" -m fast -w stop
if [ "$FAILS" != "0" ]; then echo "$FAILS failed"; exit 1; fi
echo "disposable postgres checks passed"
