#!/usr/bin/env bash
# Throwaway local Postgres. Applies main's migrations, then the captured task-copy
# preimage, then the due-anchor migration, its rollback, and the migration again.
# Does not connect to TEST or production.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGDATA="$(mktemp -d /tmp/cla-due-pg.XXXXXX)"
PORT=54331
BIN="/usr/lib/postgresql/16/bin"
if [[ ! -x "$BIN/initdb" ]]; then echo "postgres 16 client not found"; exit 1; fi
cleanup() { "$BIN/pg_ctl" -D "$PGDATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$PGDATA"; }
trap cleanup EXIT
"$BIN/initdb" -D "$PGDATA" --auth=trust --username="$(whoami)" >/tmp/cla-due-init.log
"$BIN/pg_ctl" -D "$PGDATA" -l /tmp/cla-due-pg.log -o "-p $PORT -k /tmp" -w start >/dev/null
PSQL=("$BIN/psql" -h /tmp -p "$PORT" -d postgres -v ON_ERROR_STOP=1)
"${PSQL[@]}" -c 'create extension if not exists pgcrypto;' >/tmp/cla-due-ext.log
"${PSQL[@]}" -f "$ROOT/test/sql/francis-scratch-baseline.sql" >/tmp/cla-due-baseline.log

ok=0
bad=0
while IFS= read -r f; do
  base="$(basename "$f")"
  case "$base" in
    *rollback*) continue ;;
  esac
  if "${PSQL[@]}" -f "$f" >/tmp/cla-due-mig.out 2>&1; then
    ok=$((ok + 1))
  else
    bad=$((bad + 1))
  fi
done < <(find "$ROOT/supabase/migrations" -name '*.sql' ! -name '20261111030000_task_due_anchors.sql' | sort)
echo "main migrations ok=$ok fail=$bad (failing files are drift checks that need the hosted catalog)"

"${PSQL[@]}" -f "$ROOT/test/sql/due-anchors-preimage.sql" >/tmp/cla-due-preimage.log
src="$("${PSQL[@]}" -tAc "select md5(prosrc) from pg_proc where oid = to_regprocedure('private.trg_participant_copies()')")"
up="$("${PSQL[@]}" -tAc "select md5(prosrc) from pg_proc where oid = 'private.rpc_upsert_task_template(text,text,text,text[],integer,text,text[],boolean)'::regprocedure")"
if [[ "$src" != "e17e50e7a9ec309216866157a3d65db8" || "$up" != "d221f4fc7ef2ee2fae3f9fce10391784" ]]; then
  echo "preimage md5 trigger=$src upsert=$up" >&2
  exit 1
fi

MIG="$ROOT/supabase/migrations/20261111030000_task_due_anchors.sql"
BACK="$ROOT/supabase/rollbacks/20261111030000_task_due_anchors.sql"
"${PSQL[@]}" -f "$MIG" >/tmp/cla-due-apply.log
"${PSQL[@]}" -f "$ROOT/test/sql/due-anchors-assert.sql"
echo "due anchor checks passed"

# The old check cannot hold a negative day. Put the test rows back before rolling back.
"${PSQL[@]}" -c "update public.task_templates set due_days = 7 where due_days < 1 or due_days > 90;"
"${PSQL[@]}" -f "$BACK" >/tmp/cla-due-rollback.log
restored="$("${PSQL[@]}" -tAc "select md5(prosrc) from pg_proc where oid = to_regprocedure('private.trg_participant_copies()')")"
gone="$("${PSQL[@]}" -tAc "select count(*) from information_schema.columns where table_schema='public' and table_name in ('tasks','task_templates') and column_name in ('due_anchor','due_overridden')")"
if [[ "$restored" != "e17e50e7a9ec309216866157a3d65db8" || "$gone" != "0" ]]; then
  echo "rollback left trigger=$restored columns=$gone" >&2
  exit 1
fi
echo "rollback restored the captured function"

"${PSQL[@]}" -f "$MIG" >/tmp/cla-due-reapply.log
again="$("${PSQL[@]}" -tAc "select count(*) from information_schema.columns where table_schema='public' and column_name in ('due_anchor','due_overridden')")"
if [[ "$again" != "2" ]]; then echo "reapply left $again columns" >&2; exit 1; fi
echo "reapply ok"
sha256sum "$MIG" "$BACK"
echo "due anchors sql passed"
