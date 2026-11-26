#!/bin/bash
# CRM-FEED-1. Disposable local Postgres only. Does not connect to TEST or production.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="cla_crm_feed_$$"
PSQL=(sudo -u postgres psql -v ON_ERROR_STOP=1 -X -q)
cleanup() { sudo -u postgres psql -d postgres -c "drop database if exists \"$DB\";" >/dev/null 2>&1 || true; }
trap cleanup EXIT
"${PSQL[@]}" -d postgres -c "create database \"$DB\";"
"${PSQL[@]}" -d "$DB" -f "$ROOT/test/sql/crm-feed/harness.sql" >/tmp/crm-feed-harness.out
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/20261131100000_crm_portal_deal_feed.sql" >/tmp/crm-feed-migrate.out
if "${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/20261131100000_crm_portal_deal_feed.sql" >/tmp/crm-feed-migrate2.out 2>&1; then
  echo "FAIL second apply did not stop on the drift guard" >&2; exit 1; fi
grep -q "drift: public.crm_imported_deals already exists" /tmp/crm-feed-migrate2.out || { echo "FAIL second apply: wrong error" >&2; cat /tmp/crm-feed-migrate2.out >&2; exit 1; }
"${PSQL[@]}" -d "$DB" -f "$ROOT/test/sql/crm-feed/checks.sql" 2>&1 | tee /tmp/crm-feed-checks.out | grep -E "ok |FAIL|ERROR|CHECKS-DONE" || true
grep -q "CHECKS-DONE" /tmp/crm-feed-checks.out || { echo "FAIL checks did not finish" >&2; exit 1; }
if grep -q "FAIL\|ERROR" /tmp/crm-feed-checks.out; then exit 1; fi
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/rollbacks/20261131100000_crm_portal_deal_feed.sql" >/tmp/crm-feed-rollback.out
left="$("${PSQL[@]}" -d "$DB" -tAc "select (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.proname in ('crm_file_key','crm_addr_key','crm_name_key','crm_imported_deal_link','trg_crm_imported_deal_on_deal','trg_crm_imported_deal_on_party','crm_import_deals','crm_imported_deals_list')) + (select count(*) from pg_trigger where tgname like 'zz_crm_imported_deal%') + (case when to_regclass('public.crm_imported_deals') is null then 0 else 1 end) + (case when to_regclass('public.deals_crm_addr_key_idx') is null then 0 else 1 end)")"
[ "$left" = "0" ] || { echo "FAIL rollback left $left objects" >&2; exit 1; }
kept="$("${PSQL[@]}" -d "$DB" -tAc "select count(*) from public.deals")"
[ "$kept" -ge 7 ] || { echo "FAIL rollback touched orders ($kept)" >&2; exit 1; }
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/20261131100000_crm_portal_deal_feed.sql" >/tmp/crm-feed-migrate3.out
echo "crm feed sql passed"
