#!/bin/sh
# MF-060 (Matt, Nov 22 2026): on a purchase, a settlement date change moves the disbursement date with it; refinances are untouched.
# Disposable database only: a stand-in deals table, then 20261129040000_disbursement_follows_settlement.sql, the checks, and the rollback.
# Does not connect to the hosted TEST project and does not use its data.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
DB=cla_disb_follow_$$
q() { sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -d "$DB" "$@"; }
val() { sudo -u postgres psql -X -q -tA -v ON_ERROR_STOP=1 -d "$DB" -c "$1"; }
cleanup() { sudo -u postgres psql -X -q -d postgres -c "drop database if exists $DB;" >/dev/null 2>&1 || true; }
trap cleanup EXIT
fail=0
ok() { if [ "$1" = "$2" ]; then echo "ok $3"; else echo "FAIL $3 (got '$1', want '$2')"; fail=1; fi; }
sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $DB;" -c "create database $DB;"
q <<'SQL'
create schema private;
create table public.deals (id int primary key, transaction_type text, closing_date date, disbursement_date date, notes text);
insert into public.deals values
  (1, 'Purchase', '2026-12-01', null, ''),           -- automatic
  (2, 'Purchase', '2026-12-01', '2026-12-03', ''),   -- hand-set
  (3, 'Refinance', '2026-12-01', '2026-12-08', ''),  -- refinance, hand-set
  (4, 'Refinance', '2026-12-01', null, ''),          -- refinance, automatic
  (5, 'Purchase', '2026-12-01', '2026-12-03', ''),
  (6, 'Purchase', '2026-12-01', '2026-12-03', ''),
  (7, null, '2026-12-01', '2026-12-03', '');
SQL
q -f "$ROOT/supabase/migrations/20261129040000_disbursement_follows_settlement.sql"
val "update public.deals set closing_date = '2026-12-04' where id = 1" >/dev/null
ok "$(val "select coalesce(disbursement_date::text, 'auto') from public.deals where id = 1")" "auto" "purchase, automatic: still automatic (shows the new closing date)"
val "update public.deals set closing_date = '2026-12-04' where id = 2" >/dev/null
ok "$(val "select coalesce(disbursement_date::text, 'auto') from public.deals where id = 2")" "auto" "purchase, hand-set: a settlement change clears the hand-set date so it follows the closing date"
val "update public.deals set disbursement_date = '2026-12-07' where id = 2" >/dev/null
ok "$(val "select disbursement_date from public.deals where id = 2")" "2026-12-07" "purchase: the disbursement date can still be set by hand afterward"
val "update public.deals set notes = 'x' where id = 2" >/dev/null
ok "$(val "select disbursement_date from public.deals where id = 2")" "2026-12-07" "purchase: another save leaves a hand-set date alone"
val "update public.deals set closing_date = '2026-12-01', disbursement_date = '2026-12-03' where id = 5" >/dev/null
ok "$(val "select disbursement_date from public.deals where id = 5")" "2026-12-03" "purchase: same closing date re-saved (Basic Info form) keeps the hand-set date"
val "update public.deals set closing_date = '2026-12-09', disbursement_date = '2026-12-10' where id = 6" >/dev/null
ok "$(val "select disbursement_date from public.deals where id = 6")" "2026-12-10" "purchase: changing both dates in one save keeps the disbursement date given"
val "update public.deals set closing_date = '2026-12-04' where id = 3" >/dev/null
ok "$(val "select disbursement_date from public.deals where id = 3")" "2026-12-08" "refinance, hand-set: not touched"
val "update public.deals set closing_date = '2026-12-04' where id = 4" >/dev/null
ok "$(val "select coalesce(disbursement_date::text, 'auto') from public.deals where id = 4")" "auto" "refinance, automatic: stays automatic"
val "update public.deals set closing_date = '2026-12-04' where id = 7" >/dev/null
ok "$(val "select coalesce(disbursement_date::text, 'auto') from public.deals where id = 7")" "auto" "no transaction type (treated as purchase): follows"
val "update public.deals set closing_date = null where id = 6" >/dev/null
ok "$(val "select coalesce(disbursement_date::text, 'auto') from public.deals where id = 6")" "auto" "purchase: clearing the settlement date clears a hand-set disbursement date"
q -f "$ROOT/supabase/rollbacks/20261129040000_disbursement_follows_settlement.sql"
ok "$(val "select count(*) from pg_trigger where tgname = 'deals_disbursement_follows'")" "0" "rollback removes the trigger"
ok "$(val "select count(*) from pg_proc where proname = 'deal_disbursement_follows_closing'")" "0" "rollback removes the function"
val "update public.deals set closing_date = '2026-12-11' where id = 5" >/dev/null
ok "$(val "select disbursement_date from public.deals where id = 5")" "2026-12-03" "after rollback: old behaviour (hand-set date stays)"
q -f "$ROOT/supabase/migrations/20261129040000_disbursement_follows_settlement.sql"
ok "$(val "select count(*) from pg_trigger where tgname = 'deals_disbursement_follows'")" "1" "migration applies again after rollback"
[ "$fail" = 0 ] && echo "disbursement follows settlement SQL passed" || { echo "disbursement follows settlement SQL FAILED"; exit 1; }
