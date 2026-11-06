#!/usr/bin/env bash
# Apply the unapplied workflows migration to a throwaway local Postgres and check it.
# Does not connect to TEST or production.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGDATA="${TMPDIR:-/tmp}/cla-workflows-pg"
PORT=54329
BIN="/usr/lib/postgresql/17/bin"
if [[ ! -x "$BIN/initdb" ]]; then echo "postgres 17 client not found"; exit 1; fi
rm -rf "$PGDATA"
"$BIN/initdb" -D "$PGDATA" --auth=trust --username="$(whoami)" >/tmp/cla-workflows-init.log
"$BIN/pg_ctl" -D "$PGDATA" -l /tmp/cla-workflows-pg.log -o "-p $PORT -k /tmp" -w start
cleanup() { "$BIN/pg_ctl" -D "$PGDATA" -w stop >/dev/null 2>&1 || true; }
trap cleanup EXIT
PSQL=("$BIN/psql" -h /tmp -p "$PORT" -d postgres -v ON_ERROR_STOP=1)
"${PSQL[@]}" -f "$ROOT/test/workflows-fixture.sql" >/tmp/cla-workflows-fixture.log
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20261106180000_workflows.sql" >/tmp/cla-workflows-migrate.log
"${PSQL[@]}" -f "$ROOT/test/workflows-assert.sql"
echo "workflows sql passed"
