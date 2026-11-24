#!/bin/sh
# FF-109. The people-role list must accept Licensed Settlement Agent.
# Disposable database only. Does not connect to TEST and does not use its data.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
DB=cla_ff109_lsa_$$
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
  check (role in (
    'Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator',
    'Buyer Agent', 'Listing Agent', 'Buyer Agent TC', 'Listing Agent TC',
    'Client-Buyer', 'Client-Seller', 'Lender', 'HOA', 'Other', 'Abstractor', 'Underwriter'
  ));
insert into public.deal_participants (role) values ('Processor'), ('Preprocessor');
SQL

# The current TEST list refuses Licensed Settlement Agent.
if psql_super -c "insert into public.deal_participants (role) values ('Licensed Settlement Agent');" >/tmp/cla-ff109-before.out 2>/tmp/cla-ff109-before.err; then
  echo "FAIL the old list accepted Licensed Settlement Agent" >&2
  exit 1
fi
grep -q 'deal_participants_role_check' /tmp/cla-ff109-before.err

psql_super -f "$ROOT/supabase/migrations/20261130240000_ff109_licensed_settlement_agent.sql"
psql_super -c "insert into public.deal_participants (role) values ('Licensed Settlement Agent');"
psql_super -c "insert into public.deal_participants (role) values ('Buyer Agent TC'), ('Listing Agent TC'), ('Sales Person');"
if psql_super -c "insert into public.deal_participants (role) values ('Not a role');" >/tmp/cla-ff109-bad.out 2>/tmp/cla-ff109-bad.err; then
  echo "FAIL an unknown role was accepted" >&2
  exit 1
fi
grep -q 'deal_participants_role_check' /tmp/cla-ff109-bad.err
psql_super -tAc "select count(*) from public.deal_participants where role = 'Processor';" | grep -qx 1

# Re-apply is idempotent.
psql_super -f "$ROOT/supabase/migrations/20261130240000_ff109_licensed_settlement_agent.sql"
psql_super -c "insert into public.deal_participants (role) values ('Licensed Settlement Agent');"

if psql_super -f "$ROOT/supabase/rollbacks/20261130240000_ff109_licensed_settlement_agent.sql" >/tmp/cla-ff109-undo.out 2>/tmp/cla-ff109-undo.err; then
  echo "FAIL undo ran while a Licensed Settlement Agent was still on a file" >&2
  exit 1
fi
grep -q 'Licensed Settlement Agent' /tmp/cla-ff109-undo.err
psql_super -c "delete from public.deal_participants where role = 'Licensed Settlement Agent';"
psql_super -f "$ROOT/supabase/rollbacks/20261130240000_ff109_licensed_settlement_agent.sql"
if psql_super -c "insert into public.deal_participants (role) values ('Licensed Settlement Agent');" >/tmp/cla-ff109-after.out 2>/tmp/cla-ff109-after.err; then
  echo "FAIL undo still accepted Licensed Settlement Agent" >&2
  exit 1
fi
grep -q 'deal_participants_role_check' /tmp/cla-ff109-after.err

# Rollback is idempotent once the old list is back.
psql_super -f "$ROOT/supabase/rollbacks/20261130240000_ff109_licensed_settlement_agent.sql"

psql_super -f "$ROOT/supabase/migrations/20261130240000_ff109_licensed_settlement_agent.sql"
psql_super -c "insert into public.deal_participants (role) values ('Licensed Settlement Agent');"

# A database that never had the check, the way a fresh scratch database starts.
psql_super -c "delete from public.deal_participants where role = 'Licensed Settlement Agent';"
psql_super -c "alter table public.deal_participants drop constraint deal_participants_role_check;"
psql_super -f "$ROOT/supabase/migrations/20261130240000_ff109_licensed_settlement_agent.sql"
psql_super -c "insert into public.deal_participants (role) values ('Licensed Settlement Agent');"
echo "ff-109 licensed settlement agent role check passed"
