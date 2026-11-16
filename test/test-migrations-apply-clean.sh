#!/bin/bash
# Fresh scratch database only. Does not connect to hosted TEST or production.
# Applies the idempotent precondition, then every forward file in supabase/migrations
# in filename order. The three rollback files that sit in that folder undo a forward
# file, so they are not part of the load. The first error stops the check and prints
# the file name and the database message. The tables and columns that remain are
# compared with the list saved from TEST.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="cla_migrate_clean_$$"
PRE="$ROOT/supabase/baseline/test_precondition.sql"
LIST="$ROOT/supabase/baseline/test_columns.txt"

# A table the precondition creates must not also be created by a migration.
# Create table if not exists in the migration would then do nothing, and the
# fat copy in the precondition would hide the columns the migration adds.
overlap="$(python3 - "$PRE" "$ROOT/supabase/migrations" <<'PY'
import re, sys, pathlib
pre_path, mig_dir = sys.argv[1:]
pat = re.compile(
    r"\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(?:only\s+)?"
    r"((?:\"?[A-Za-z_][\w$]*\"?\.)?\"?[A-Za-z_][\w$]*\"?)",
    re.I,
)
def tables(text):
    text = re.sub(r"/\*.*?\*/", " ", text, flags=re.S)
    text = re.sub(r"--.*?$", " ", text, flags=re.M)
    found = set()
    for match in pat.finditer(text):
        name = match.group(1).replace('"', "").lower()
        if "." not in name:
            name = "public." + name
        found.add(name)
    return found
pre = tables(pathlib.Path(pre_path).read_text())
hit = []
for path in sorted(pathlib.Path(mig_dir).glob("*.sql")):
    if "rollback" in path.name:
        continue
    for name in sorted(tables(path.read_text()) & pre):
        hit.append(name + "  " + path.name)
print("\n".join(hit))
PY
)"
if [ -n "$overlap" ]; then
  echo "FAIL a precondition table is also created by a migration:" >&2
  echo "$overlap" >&2
  exit 1
fi
echo "no precondition table is also created by a migration"
PSQL=(sudo -u postgres psql -v ON_ERROR_STOP=1 -X -q)
cleanup() { sudo -u postgres psql -d postgres -c "drop database if exists \"$DB\";" >/dev/null 2>&1 || true; }
trap cleanup EXIT

"${PSQL[@]}" -d postgres -c "drop database if exists \"$DB\";"
"${PSQL[@]}" -d postgres -c "create database \"$DB\";"
"${PSQL[@]}" -d "$DB" -c "create schema if not exists extensions; create extension if not exists pgcrypto with schema extensions;"
"${PSQL[@]}" -d "$DB" -f "$PRE"

# pg_net and pg_cron are not part of stock Postgres. The Gmail schedule file
# creates both extensions, then calls net.http_post and cron.schedule. This
# scratch database gets those two calls as ordinary SQL (no HTTP, no scheduler).
# The folder for the control file is taken from the Postgres that is actually
# running, because pg_config can point at a different version. On the GitHub
# runner that Postgres is 16. A real install is left in place.
"${PSQL[@]}" -d "$DB" <<'SQL'
create schema if not exists net;
create or replace function net.http_post(
  url text,
  body jsonb default '{}'::jsonb,
  params jsonb default '{}'::jsonb,
  headers jsonb default '{}'::jsonb,
  timeout_milliseconds integer default 1000
) returns bigint
language sql
as $$ select 0::bigint $$;

create schema if not exists cron;
create table if not exists cron.job (
  jobid bigint generated always as identity primary key,
  schedule text not null,
  command text not null,
  jobname text
);
create or replace function cron.schedule(job_name text, schedule text, command text) returns bigint
language sql
as $$
  insert into cron.job (schedule, command, jobname)
  values (schedule, command, job_name)
  returning jobid
$$;
create or replace function cron.unschedule(job_id bigint) returns boolean
language plpgsql
as $$
begin
  delete from cron.job where jobid = job_id;
  return found;
end $$;
SQL
# The SSN file refuses unless Vault has buyer_ssn_key. The real key stays out of git.
# This scratch value is not a secret and is never written to TEST.
"${PSQL[@]}" -d "$DB" -c "select vault.create_secret('scratch-buyer-ssn-key-not-a-real-secret', 'buyer_ssn_key', 'Scratch stand-in. Not a real key.');" >/dev/null

# The Gmail file still runs CREATE EXTENSION, which needs a control file beside
# the running server. The functions are the SQL above. This file only lets that
# create succeed and does not build them again.
major="$("${PSQL[@]}" -d "$DB" -tAc "select current_setting('server_version_num')::int / 10000")"
share="/usr/share/postgresql/${major}/extension"
write_standin() {
  local ext="$1" schema="$2"
  if [ -f "$share/$ext.control" ] && ! grep -q 'stand-in' "$share/$ext.control"; then
    return 0
  fi
  sudo tee "$share/$ext.control" >/dev/null <<EOF
comment = 'Scratch stand-in so the Gmail schedule file can create the extension'
default_version = '0.0.1'
relocatable = false
schema = ${schema}
EOF
  sudo tee "$share/$ext--0.0.1.sql" >/dev/null <<'EOF'
-- The check already created net.http_post and cron.schedule as ordinary SQL.
select 1;
EOF
}
write_standin pg_net extensions
write_standin pg_cron pg_catalog

# Earlier-version checks whose pre-change function text is not on TEST, not in
# the repo, and not in TEST's migration history. Each line is one skip, written
# by hand: file, function, exact md5. Nothing else is skipped. The migration
# files on disk are not changed. An empty stand-in lets the check see a
# function; the file then replaces or drops it. A stand-in still present at the
# end means no migration replaced it, and this check fails.
SKIP_LIST="$(mktemp)"
cat > "$SKIP_LIST" <<'EOF'
20261110083000_closing_nearest_office.sql private.rpc_scheduling_respond 7ee11b702f7e960e308fe74a4e95ede8
20261110083000_closing_nearest_office.sql private.rpc_create_settlement_request bb0d287b7086ed5d04f793cd147ffdcc
20261110083000_closing_nearest_office.sql private.rpc_save_office 73a635e78fd090bf50ac539fa6615a7e
20261112060400_citizenship_and_agent_phone.sql private.rpc_my_agents b1254fcc094054056bc1f805b8772bb2
EOF

apply_listed_skips() {
  local base="$1" src="$2"
  local hits
  hits="$(awk -v b="$base" '$1 == b { print }' "$SKIP_LIST")"
  if [ -z "$hits" ]; then
    echo "$src"
    return 0
  fi
  case "$base" in
    20261110083000_closing_nearest_office.sql)
      "${PSQL[@]}" -d "$DB" >/dev/null <<'SQL'
create or replace function private.rpc_scheduling_respond(p_token text, p_picks integer[], p_name text, p_note text default '')
returns void language plpgsql as $fn$ begin /* scratch-empty-stand-in */ return; end $fn$;
create or replace function public.scheduling_respond(p_token text, p_picks integer[], p_name text, p_note text default '')
returns void language plpgsql as $fn$ begin /* scratch-empty-stand-in */ return; end $fn$;
create or replace function private.rpc_create_settlement_request(p_deal uuid, p_slots timestamp without time zone[], p_location text default '', p_note text default '')
returns table(settlement_id uuid, buyer_token text, seller_token text) language sql as $fn$ select null::uuid, null::text, null::text where false /* scratch-empty-stand-in */ $fn$;
create or replace function public.create_settlement_request(p_deal uuid, p_slots timestamp without time zone[], p_location text default '', p_note text default '')
returns table(settlement_id uuid, buyer_token text, seller_token text) language sql as $fn$ select null::uuid, null::text, null::text where false /* scratch-empty-stand-in */ $fn$;
create or replace function private.rpc_save_office(p_id text, p_name text, p_address_line1 text, p_address_line2 text, p_city text, p_state text, p_zip text, p_main_phone text default '', p_email text default null, p_is_main boolean default false, p_counties text[] default '{}')
returns text language sql as $fn$ select null::text where false /* scratch-empty-stand-in */ $fn$;
create or replace function public.save_office(p_id text, p_name text, p_address_line1 text, p_address_line2 text, p_city text, p_state text, p_zip text, p_main_phone text default '', p_email text default null, p_is_main boolean default false, p_counties text[] default '{}')
returns text language sql as $fn$ select null::text where false /* scratch-empty-stand-in */ $fn$;
SQL
      ;;
    20261112060400_citizenship_and_agent_phone.sql)
      "${PSQL[@]}" -d "$DB" >/dev/null <<'SQL'
create or replace function private.rpc_my_agents(p_deal uuid default null)
returns table(agent_contact uuid, side text, first_name text, last_name text, brokerage text, cell_phone text, email text, office_phone text, photo_path text, photo_shape text, deal_ids uuid[])
language sql stable security definer set search_path to pg_catalog, public, extensions
as $fn$ select null::uuid, null::text, null::text, null::text, null::text, null::text, null::text, null::text, null::text, null::text, null::uuid[] where false /* scratch-empty-stand-in */ $fn$;
SQL
      ;;
  esac
  local out
  out="$(mktemp)"
  SKIP_LIST="$SKIP_LIST" python3 - "$src" "$out" "$base" <<'PY'
import os, sys
src, dest, base = sys.argv[1:]
text = open(src).read()
listed = []
for line in open(os.environ["SKIP_LIST"]):
    file_name, fn, digest = line.split()
    if file_name == base:
        listed.append((fn, digest))
for fn, digest in listed:
    needle = "is distinct from '" + digest + "'"
    if text.count(needle) != 1:
        raise SystemExit(fn + " md5 " + digest + " appears " + str(text.count(needle)) + " times")
    text = text.replace(needle, needle + " and false", 1)
open(dest, "w").write(text)
PY
  chmod a+r "$out"
  echo "$out"
}

while IFS= read -r f; do
  base="$(basename "$f")"
  case "$base" in
    *rollback*) continue ;;
  esac
  apply="$f"
  apply="$(apply_listed_skips "$base" "$apply")"
  if [ "$base" = "20261112060200_buyer_task_holder.sql" ]; then
    # These three bodies are the rollback's captured text. party_ssn does not
    # exist until the previous file, so they cannot be created in the precondition.
    ROOT="$ROOT" python3 - <<'PY' > /tmp/cla-migrate-form-pre.sql
import os, re
from pathlib import Path
sql = Path(os.environ["ROOT"], "supabase/rollbacks/20261112060200_buyer_task_holder.sql").read_text()
names = ["private.rpc_get_task_form", "private.rpc_save_party_ssn", "private.rpc_read_party_ssn"]
for m in re.finditer(r"create or replace function ((?:private|public)\.\w+)", sql):
    if m.group(1) not in names:
        continue
    rest = sql[m.start():]
    mt = re.search(r"\bas\s+(\$[^$\n]*\$)", rest, re.I)
    tag = mt.group(1)
    end = rest.find(tag, mt.end()) + len(tag)
    if rest[end:end+1] == ";":
        end += 1
    print(rest[:end].rstrip())
    print()
PY
    chmod a+r /tmp/cla-migrate-form-pre.sql
    "${PSQL[@]}" -d "$DB" -f /tmp/cla-migrate-form-pre.sql >/dev/null
  fi
  if ! "${PSQL[@]}" -d "$DB" -f "$apply" >/tmp/cla-migrate-clean.out 2>/tmp/cla-migrate-clean.err; then
    echo "FAIL $base" >&2
    cat /tmp/cla-migrate-clean.err >&2
    exit 1
  fi
done < <(find "$ROOT/supabase/migrations" -name '*.sql' | sort)

left="$("${PSQL[@]}" -d "$DB" -tAc "select n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.prosrc like '%scratch-empty-stand-in%' order by 1")"
if [ -n "$left" ]; then
  echo "FAIL an empty stand-in was not replaced:" >&2
  echo "$left" >&2
  exit 1
fi

got="$(mktemp)"
"${PSQL[@]}" -d "$DB" -tAc "select n.nspname||'.'||c.relname||'.'||a.attname from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r' and a.attnum>0 and not a.attisdropped order by 1" > "$got"
if ! diff -u "$LIST" "$got"; then
  echo "FAIL column list does not match the saved TEST list" >&2
  exit 1
fi
echo "migrations apply clean; public and private columns match TEST"
