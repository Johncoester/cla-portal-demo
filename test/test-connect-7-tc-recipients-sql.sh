#!/bin/bash
# CONNECT-7: the migration text keeps the staff / this-file / pure-client rules and adds TC side + Lender.
# Read-only file checks. Does not connect to TEST.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIG="$ROOT/supabase/migrations/20261131280000_connect_7_tc_recipients.sql"
RB="$ROOT/supabase/rollbacks/20261131280000_connect_7_tc_recipients.sql"
fail=0
ok() { if grep -q -F "$2" "$1"; then echo "ok $3"; else echo "FAIL $3"; fail=1; fi; }
missing() { if grep -q -F "$2" "$1"; then echo "FAIL $3"; fail=1; else echo "ok $3"; fi; }

ok "$MIG" "private.outside_roles" "migration uses outside_roles so a linked coordinator gets their agent's side"
ok "$MIG" "my_sides" "migration lists every side the coordinator holds (including both, when they assist both agents)"
ok "$MIG" "when 'Lender' then 'buyer'" "Lender is buyer-side"
ok "$MIG" "Buyer Agent TC" "the viewer also reads the Buyer Agent TC file role"
ok "$MIG" "dp.deal_id = p_deal   -- FF-072 #24" "the mailed list is still this file only"
ok "$MIG" "v.pure_buyer" "pure-client rules stay"
ok "$MIG" "STABLE SECURITY DEFINER" "the functions stay SECURITY DEFINER"
ok "$MIG" "SET search_path TO 'pg_catalog', 'public', 'extensions'" "search_path stays fixed"
ok "$MIG" "select private.lock_function_search_paths();" "search paths are locked again"
ok "$MIG" "notify pgrst, 'reload schema'" "PostgREST is told to reload"
ok "$RB" "CREATE OR REPLACE FUNCTION private.rpc_message_recipients" "rollback restores the recipients function"
missing "$RB" "when 'Lender' then 'buyer'" "rollback does not keep the Lender side"
missing "$RB" "private.outside_roles" "rollback does not keep the outside_roles lookup"

# The hosted Start conversation page must not add its own staff-only filter.
if grep -q "listMessageRecipients" "$ROOT/js/pages/dealmsgs.js"; then
  echo "ok Start conversation still calls listMessageRecipients"
else
  echo "FAIL Start conversation must call listMessageRecipients"
  fail=1
fi

if [ "$fail" -ne 0 ]; then echo "FAIL $fail"; exit 1; fi
echo "connect-7 sql checks passed"
