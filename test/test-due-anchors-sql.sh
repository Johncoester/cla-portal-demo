#!/usr/bin/env bash
# Apply the unapplied due-anchor migration to a throwaway local Postgres and check it.
# Does not connect to TEST or production.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGDATA="${TMPDIR:-/tmp}/cla-due-pg"
PORT=54331
BIN="/usr/lib/postgresql/17/bin"
if [[ ! -x "$BIN/initdb" ]]; then echo "postgres 17 client not found"; exit 1; fi
rm -rf "$PGDATA"
"$BIN/initdb" -D "$PGDATA" --auth=trust --username="$(whoami)" >/tmp/cla-due-init.log
"$BIN/pg_ctl" -D "$PGDATA" -l /tmp/cla-due-pg.log -o "-p $PORT -k /tmp" -w start
cleanup() { "$BIN/pg_ctl" -D "$PGDATA" -w stop >/dev/null 2>&1 || true; }
trap cleanup EXIT
PSQL=("$BIN/psql" -h /tmp -p "$PORT" -d postgres -v ON_ERROR_STOP=1)
"${PSQL[@]}" -c 'create extension if not exists pgcrypto;' >/tmp/cla-due-ext.log
"${PSQL[@]}" -f "$ROOT/test/due-anchors-fixture.sql" >/tmp/cla-due-fixture.log
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20261106192000_task_due_anchors.sql" >/tmp/cla-due-migrate.log
"${PSQL[@]}" -f "$ROOT/test/due-anchors-assert.sql"
echo "due anchors sql passed"
