#!/bin/sh
# MF-060b (CRM Bot review of PR 413, Nov 23 2026): clearing the settlement date keeps the disbursement date, and a reset of a
# hand-set date is written to the activity log. Disposable database only: stand-in deals / activity_log tables and log_activity,
# then 20261129040000 + 20261129050000, the checks, the rollback and a re-apply. Does not connect to the hosted TEST project.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
DB=cla_disb_keep_$$
q() { sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -d "$DB" "$@"; }
val() { sudo -u postgres psql -X -q -tA -v ON_ERROR_STOP=1 -d "$DB" -c "$1"; }
cleanup() { sudo -u postgres psql -X -q -d postgres -c "drop database if exists $DB;" >/dev/null 2>&1 || true; }
trap cleanup EXIT
fail=0
ok() { if [ "$1" = "$2" ]; then echo "ok $3"; else echo "FAIL $3 (got '$1', want '$2')"; fail=1; fi; }
sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $DB;" -c "create database $DB;"
q <<'SQL'
create schema private;
create table public.deals (id uuid primary key, transaction_type text, closing_date date, disbursement_date date, notes text);
create table public.activity_log (id bigserial primary key, deal_id uuid, actor_id uuid, action text, entity text, entity_id uuid, detail text);
create function private.log_activity(p_deal uuid, p_action text, p_entity text, p_id uuid, p_detail text) returns void
  language sql security definer set search_path = pg_catalog, public as
  $$ insert into public.activity_log (deal_id, actor_id, action, entity, entity_id, detail) values (p_deal, null, p_action, p_entity, p_id, left(p_detail, 300)) $$;
insert into public.deals values
  ('00000000-0000-0000-0000-000000000001', 'Purchase', '2026-12-01', '2026-12-03', ''),   -- hand-set
  ('00000000-0000-0000-0000-000000000002', 'Purchase', '2026-12-01', null, ''),           -- automatic
  ('00000000-0000-0000-0000-000000000003', 'Purchase', '2026-12-01', '2026-12-03', ''),   -- hand-set, settlement cleared
  ('00000000-0000-0000-0000-000000000004', 'Refinance', '2026-12-01', '2026-12-08', ''),  -- refinance, hand-set
  ('00000000-0000-0000-0000-000000000005', 'Purchase', '2026-12-01', '2026-12-03', ''),   -- both changed in one save
  ('00000000-0000-0000-0000-000000000006', 'Purchase', null, '2026-12-03', '');           -- no settlement date yet
SQL
q -f "$ROOT/supabase/migrations/20261129040000_disbursement_follows_settlement.sql"
q -f "$ROOT/supabase/migrations/20261129050000_disbursement_keep_on_clear.sql"
d() { echo "00000000-0000-0000-0000-00000000000$1"; }
disb() { val "select coalesce(disbursement_date::text, 'auto') from public.deals where id = '$(d "$1")'"; }
logs() { val "select count(*) from public.activity_log where deal_id = '$(d "$1")' and action = 'disbursement.date'"; }
val "update public.deals set closing_date = '2026-12-04' where id = '$(d 1)'" >/dev/null
ok "$(disb 1)" "auto" "purchase, hand-set: a new settlement date still resets it to follow the closing date"
ok "$(logs 1)" "1" "the reset of a hand-set date writes one activity log entry"
ok "$(val "select detail from public.activity_log where deal_id = '$(d 1)'")" "Disbursement date 2026-12-03 reset to follow the closing date (2026-12-04)" "the entry says which date was reset and to what"
val "update public.deals set closing_date = '2026-12-05' where id = '$(d 2)'" >/dev/null
ok "$(disb 2)" "auto" "purchase, automatic: stays automatic"
ok "$(logs 2)" "0" "an automatic date that stays automatic logs nothing"
val "update public.deals set closing_date = null where id = '$(d 3)'" >/dev/null
ok "$(disb 3)" "2026-12-03" "purchase: clearing the settlement date keeps the hand-set disbursement date"
ok "$(logs 3)" "0" "clearing the settlement date logs no reset"
val "update public.deals set closing_date = '2026-12-09' where id = '$(d 3)'" >/dev/null
ok "$(disb 3)" "auto" "purchase: setting a settlement date again after clearing it resets the hand-set date"
val "update public.deals set closing_date = '2026-12-04' where id = '$(d 4)'" >/dev/null
ok "$(disb 4)" "2026-12-08" "refinance: not touched"
ok "$(logs 4)" "0" "refinance: nothing logged"
val "update public.deals set closing_date = '2026-12-09', disbursement_date = '2026-12-10' where id = '$(d 5)'" >/dev/null
ok "$(disb 5)" "2026-12-10" "purchase: changing both dates in one save keeps the disbursement date given"
ok "$(logs 5)" "0" "a date the user typed is not logged as a reset"
val "update public.deals set closing_date = '2026-12-12' where id = '$(d 6)'" >/dev/null
ok "$(disb 6)" "auto" "purchase: a first settlement date resets an earlier hand-set date"
ok "$(val "select prosecdef::text from pg_proc where proname = 'deal_disbursement_follows_closing'")" "false" "the trigger function is not SECURITY DEFINER"
ok "$(val "select count(*) from pg_proc p, unnest(p.proconfig) c where p.proname = 'deal_disbursement_follows_closing' and c like 'search_path=%'")" "1" "the trigger function pins search_path"
if q -f "$ROOT/supabase/migrations/20261129050000_disbursement_keep_on_clear.sql" >/dev/null 2>&1; then ok "applied" "refused" "a second apply is refused by the drift check"; else ok "refused" "refused" "a second apply is refused by the drift check"; fi
q -f "$ROOT/supabase/rollbacks/20261129050000_disbursement_keep_on_clear.sql"
ok "$(val "select (prosrc like '%closing_date is not null%')::text from pg_proc where proname = 'deal_disbursement_follows_closing'")" "false" "rollback puts back the MF-060 body"
val "update public.deals set closing_date = '2026-12-14', disbursement_date = '2026-12-15' where id = '$(d 3)'" >/dev/null
val "update public.deals set closing_date = null where id = '$(d 3)'" >/dev/null
ok "$(disb 3)" "auto" "after rollback: old MF-060 behaviour (clearing the settlement date clears it)"
ok "$(val "select count(*) from pg_trigger where tgname = 'deals_disbursement_follows'")" "1" "rollback keeps the MF-060 trigger"
q -f "$ROOT/supabase/migrations/20261129050000_disbursement_keep_on_clear.sql"
ok "$(val "select (prosrc like '%closing_date is not null%')::text from pg_proc where proname = 'deal_disbursement_follows_closing'")" "true" "the migration applies again after rollback"
[ "$fail" = 0 ] && echo "disbursement keep on clear SQL passed" || { echo "disbursement keep on clear SQL FAILED"; exit 1; }
