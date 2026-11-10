#!/usr/bin/env bash
# Throwaway local Postgres. Does not connect to TEST.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGDATA="$(mktemp -d /tmp/cla-aud-pg.XXXXXX)"
PORT=54332
BIN="/usr/lib/postgresql/16/bin"
cleanup() { "$BIN/pg_ctl" -D "$PGDATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$PGDATA"; }
trap cleanup EXIT
"$BIN/initdb" -D "$PGDATA" --auth=trust --username="$(whoami)" >/tmp/cla-aud-init.log
"$BIN/pg_ctl" -D "$PGDATA" -l /tmp/cla-aud-pg.log -o "-p $PORT -k /tmp" -w start >/dev/null
PSQL=("$BIN/psql" -h /tmp -p "$PORT" -d postgres -v ON_ERROR_STOP=1)
"${PSQL[@]}" -c 'create extension if not exists pgcrypto;' >/dev/null
# The captured function body must match TEST before the migration will run.
python3 - << 'PY'
import base64, hashlib, pathlib
b64 = """
CiAgc2VsZWN0IGV4aXN0cyAoc2VsZWN0IDEgZnJvbSBwdWJsaWMudGFza3MgdCB3aGVyZSB0Lmlk
ID0gcF90YXNrIGFuZCB0LmF1ZGllbmNlcyBpcyBub3QgbnVsbCBhbmQgKAogICAgKCdDbGllbnQt
QnV5ZXInID0gYW55IChwcml2YXRlLmRlYWxfcm9sZXModC5kZWFsX2lkKSkgYW5kICdidXllcicg
PSBhbnkgKHQuYXVkaWVuY2VzKSBhbmQgdC5vd25lcl9wcm9maWxlX2lkID0gKHNlbGVjdCBwcml2
YXRlLmVmZmVjdGl2ZV91aWQoKSkgYW5kIG5vdCAodC5hdWRpZW5jZXMgPSBhcnJheVsnaW50ZXJu
YWwnXTo6dGV4dFtdKSkKICAgIG9yICgnQ2xpZW50LVNlbGxlcicgPSBhbnkgKHByaXZhdGUuZGVh
bF9yb2xlcyh0LmRlYWxfaWQpKSBhbmQgJ3NlbGxlcicgPSBhbnkgKHQuYXVkaWVuY2VzKSBhbmQg
dC5vd25lcl9wcm9maWxlX2lkID0gKHNlbGVjdCBwcml2YXRlLmVmZmVjdGl2ZV91aWQoKSkgYW5k
IG5vdCAodC5hdWRpZW5jZXMgPSBhcnJheVsnaW50ZXJuYWwnXTo6dGV4dFtdKSkKICAgIG9yICgn
QnV5ZXIgQWdlbnQnID0gYW55IChwcml2YXRlLmRlYWxfcm9sZXModC5kZWFsX2lkKSkgYW5kICdi
dXllcl9hZ2VudCcgPSBhbnkgKHQuYXVkaWVuY2VzKSkKICAgIG9yICgnTGlzdGluZyBBZ2VudCcg
PSBhbnkgKHByaXZhdGUuZGVhbF9yb2xlcyh0LmRlYWxfaWQpKSBhbmQgJ2xpc3RpbmdfYWdlbnQn
ID0gYW55ICh0LmF1ZGllbmNlcykpKSkg
"""
raw = base64.b64decode(''.join(b64.split()))
assert hashlib.md5(raw).hexdigest()=='613b579bcdaf51b4b4bcb9e465d7adb3'
PY
"${PSQL[@]}" -f "$ROOT/test/sql/task-audience-read-fixture.sql" >/tmp/cla-aud-fixture.log
# Reproduce the hosted failure: RETURNING audiences is denied.
if "${PSQL[@]}" -c "set role authenticated; insert into public.tasks (title, audiences) values ('Packet', array['buyer']) returning audiences;" >/tmp/cla-aud-deny.log 2>&1; then
  echo "returning audiences was allowed before the grant" >&2
  exit 1
fi
grep -q 'permission denied' /tmp/cla-aud-deny.log
echo "returning audiences is denied before the grant"

MIG="$ROOT/supabase/migrations/20261111050000_task_audience_read.sql"
BACK="$ROOT/supabase/rollbacks/20261111050000_task_audience_read.sql"
# The fixture function text must be the captured body. Replace it from the decoded bytes so the md5 matches.
python3 - << PY
from pathlib import Path
import base64
b64 = """
CiAgc2VsZWN0IGV4aXN0cyAoc2VsZWN0IDEgZnJvbSBwdWJsaWMudGFza3MgdCB3aGVyZSB0Lmlk
ID0gcF90YXNrIGFuZCB0LmF1ZGllbmNlcyBpcyBub3QgbnVsbCBhbmQgKAogICAgKCdDbGllbnQt
QnV5ZXInID0gYW55IChwcml2YXRlLmRlYWxfcm9sZXModC5kZWFsX2lkKSkgYW5kICdidXllcicg
PSBhbnkgKHQuYXVkaWVuY2VzKSBhbmQgdC5vd25lcl9wcm9maWxlX2lkID0gKHNlbGVjdCBwcml2
YXRlLmVmZmVjdGl2ZV91aWQoKSkgYW5kIG5vdCAodC5hdWRpZW5jZXMgPSBhcnJheVsnaW50ZXJu
YWwnXTo6dGV4dFtdKSkKICAgIG9yICgnQ2xpZW50LVNlbGxlcicgPSBhbnkgKHByaXZhdGUuZGVh
bF9yb2xlcyh0LmRlYWxfaWQpKSBhbmQgJ3NlbGxlcicgPSBhbnkgKHQuYXVkaWVuY2VzKSBhbmQg
dC5vd25lcl9wcm9maWxlX2lkID0gKHNlbGVjdCBwcml2YXRlLmVmZmVjdGl2ZV91aWQoKSkgYW5k
IG5vdCAodC5hdWRpZW5jZXMgPSBhcnJheVsnaW50ZXJuYWwnXTo6dGV4dFtdKSkKICAgIG9yICgn
QnV5ZXIgQWdlbnQnID0gYW55IChwcml2YXRlLmRlYWxfcm9sZXModC5kZWFsX2lkKSkgYW5kICdi
dXllcl9hZ2VudCcgPSBhbnkgKHQuYXVkaWVuY2VzKSkKICAgIG9yICgnTGlzdGluZyBBZ2VudCcg
PSBhbnkgKHByaXZhdGUuZGVhbF9yb2xlcyh0LmRlYWxfaWQpKSBhbmQgJ2xpc3RpbmdfYWdlbnQn
ID0gYW55ICh0LmF1ZGllbmNlcykpKSkg
"""
body = base64.b64decode(''.join(b64.split()))
sql = b"create or replace function private.task_outside_audience(p_task uuid) returns boolean language sql stable security definer set search_path to 'pg_catalog', 'public', 'extensions' as \$function\$" + body + b"\$function\$;\n"
Path('/tmp/cla-aud-fn.sql').write_bytes(sql)
PY
"${PSQL[@]}" -f /tmp/cla-aud-fn.sql >/dev/null
src="$("${PSQL[@]}" -tAc "select md5(prosrc) from pg_proc where oid = to_regprocedure('private.task_outside_audience(uuid)')")"
if [[ "$src" != "613b579bcdaf51b4b4bcb9e465d7adb3" ]]; then echo "fixture md5 $src" >&2; exit 1; fi

"${PSQL[@]}" -f "$MIG" >/tmp/cla-aud-apply.log
"${PSQL[@]}" -c "set role authenticated; insert into public.tasks (title, assigned_role, audiences, owner_profile_id) values ('Packet', 'Client-Buyer', array['buyer'], null) returning audiences;" | grep -q buyer
one="$("${PSQL[@]}" -tAc "select id from public.tasks where title = 'Packet'")"
seen="$("${PSQL[@]}" -tAc "select private.task_outside_audience('$one')")"
if [[ "$seen" != "t" ]]; then echo "buyer cannot see the unowned copy" >&2; exit 1; fi
"${PSQL[@]}" -c "insert into public.tasks (title, assigned_role, audiences) values ('Seller packet', 'Client-Seller', array['seller']);" >/dev/null
seller="$("${PSQL[@]}" -tAc "select id from public.tasks where title = 'Seller packet'")"
hidden="$("${PSQL[@]}" -tAc "select private.task_outside_audience('$seller')")"
if [[ "$hidden" != "f" ]]; then echo "a buyer was shown the seller audience" >&2; exit 1; fi
echo "grant and one-off audience passed"

"${PSQL[@]}" -f "$BACK" >/tmp/cla-aud-back.log
restored="$("${PSQL[@]}" -tAc "select md5(prosrc) from pg_proc where oid = to_regprocedure('private.task_outside_audience(uuid)')")"
sel="$("${PSQL[@]}" -tAc "select has_column_privilege('authenticated', 'public.tasks', 'audiences', 'SELECT')")"
if [[ "$restored" != "613b579bcdaf51b4b4bcb9e465d7adb3" || "$sel" != "f" ]]; then
  echo "rollback left function=$restored select=$sel" >&2
  exit 1
fi
echo "rollback restored the captured function"
"${PSQL[@]}" -f "$MIG" >/tmp/cla-aud-re.log
echo "reapply ok"
sha256sum "$MIG" "$BACK"
echo "task audience read sql passed"
