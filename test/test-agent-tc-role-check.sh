#!/bin/sh
# E2E-ORDER-1. The people-role list must accept Buyer Agent TC and Listing Agent TC.
# Disposable database only. Does not connect to TEST and does not use its data.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
DB=cla_agent_tc_role_$$
psql_super() { sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -d "$DB" "$@"; }
cleanup() { sudo -u postgres psql -X -q -d postgres -c "drop database if exists $DB;" >/dev/null 2>&1 || true; }
trap cleanup EXIT
sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $DB;" -c "create database $DB;"
psql_super <<'SQL'
create table public.deal_participants (
  id uuid primary key default gen_random_uuid(),
  role text not null
);
alter table public.deal_participants add constraint deal_participants_role_check
  check (role = any (array[
    'Processor'::text, 'Preprocessor'::text, 'Sales Person'::text, 'Sales Team'::text,
    'Transaction Coordinator'::text, 'Buyer Agent'::text, 'Listing Agent'::text,
    'Client-Buyer'::text, 'Client-Seller'::text, 'Lender'::text, 'HOA'::text,
    'Other'::text, 'Abstractor'::text, 'Underwriter'::text
  ]));
insert into public.deal_participants (role) values ('Processor');
SQL

# The old list refuses the coordinator, which is what TEST did.
if psql_super -c "insert into public.deal_participants (role) values ('Buyer Agent TC');" >/tmp/cla-agent-tc-before.out 2>/tmp/cla-agent-tc-before.err; then
  echo "FAIL the old list accepted Buyer Agent TC" >&2
  exit 1
fi
grep -q 'deal_participants_role_check' /tmp/cla-agent-tc-before.err

psql_super -f "$ROOT/supabase/migrations/20261124170000_agent_tc_role_check.sql"
psql_super -c "insert into public.deal_participants (role) values ('Buyer Agent TC'), ('Listing Agent TC');"
if psql_super -c "insert into public.deal_participants (role) values ('Not a role');" >/tmp/cla-agent-tc-bad.out 2>/tmp/cla-agent-tc-bad.err; then
  echo "FAIL an unknown role was accepted" >&2
  exit 1
fi
grep -q 'deal_participants_role_check' /tmp/cla-agent-tc-bad.err
psql_super -tAc "select count(*) from public.deal_participants where role = 'Processor';" | grep -qx 1

if psql_super -f "$ROOT/supabase/rollbacks/20261124170000_agent_tc_role_check.sql" >/tmp/cla-agent-tc-undo.out 2>/tmp/cla-agent-tc-undo.err; then
  echo "FAIL undo ran while a coordinator was still on a file" >&2
  exit 1
fi
grep -q 'transaction coordinator' /tmp/cla-agent-tc-undo.err
psql_super -c "delete from public.deal_participants where role in ('Buyer Agent TC', 'Listing Agent TC');"
psql_super -f "$ROOT/supabase/rollbacks/20261124170000_agent_tc_role_check.sql"
if psql_super -c "insert into public.deal_participants (role) values ('Listing Agent TC');" >/tmp/cla-agent-tc-after.out 2>/tmp/cla-agent-tc-after.err; then
  echo "FAIL undo still accepted Listing Agent TC" >&2
  exit 1
fi
grep -q 'deal_participants_role_check' /tmp/cla-agent-tc-after.err

psql_super -f "$ROOT/supabase/migrations/20261124170000_agent_tc_role_check.sql"
psql_super -c "insert into public.deal_participants (role) values ('Buyer Agent TC');"
if psql_super -f "$ROOT/supabase/migrations/20261124170000_agent_tc_role_check.sql" >/tmp/cla-agent-tc-twice.out 2>/tmp/cla-agent-tc-twice.err; then
  echo "FAIL the file applied a second time" >&2
  exit 1
fi
grep -q 'already allows the agent coordinators' /tmp/cla-agent-tc-twice.err

# A database that never had the check, the way a fresh scratch database starts.
psql_super -c "alter table public.deal_participants drop constraint deal_participants_role_check;"
psql_super -f "$ROOT/supabase/migrations/20261124170000_agent_tc_role_check.sql"
psql_super -c "insert into public.deal_participants (role) values ('Listing Agent TC');"
echo "agent coordinator role check passed"
