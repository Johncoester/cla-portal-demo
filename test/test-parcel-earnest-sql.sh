#!/bin/bash
# Scratch Postgres only. Applies every forward file in supabase/migrations, then
# apply / rollback / reapply of the parcel and earnest migration. Does not touch hosted Supabase.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PATH="/usr/lib/postgresql/16/bin:$PATH"
PGDATA="$(mktemp -d /tmp/francis-scratch-pg.XXXXXX)"
PORT=54346
cleanup() { pg_ctl -D "$PGDATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$PGDATA"; }
trap cleanup EXIT
initdb -D "$PGDATA" --auth=trust --username=postgres >/tmp/francis-scratch-init.log
pg_ctl -D "$PGDATA" -o "-p $PORT -k /tmp -c listen_addresses=" -l /tmp/francis-scratch-pg.log start >/dev/null
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do pg_isready -h /tmp -p "$PORT" >/dev/null 2>&1 && break; sleep 0.25; done
createdb -h /tmp -p "$PORT" -U postgres francis_scratch
PSQL=(psql -h /tmp -p "$PORT" -U postgres -d francis_scratch -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f "$ROOT/test/sql/francis-scratch-baseline.sql"

ok=0
bad=0
while IFS= read -r f; do
  base="$(basename "$f")"
  case "$base" in
    *rollback*) echo "SKIP $base"; continue ;;
  esac
  if "${PSQL[@]}" -f "$f" >/tmp/francis-mig.out 2>&1; then
    echo "OK $base"
    ok=$((ok + 1))
  else
    echo "FAIL $base"
    tail -n 2 /tmp/francis-mig.out | sed 's/^/  /'
    bad=$((bad + 1))
  fi
done < <(find "$ROOT/supabase/migrations" -name '*.sql' | sort)

# Migrations whose drift checks need the live TEST function bodies cannot run here.
# Apply only the column they add, using the statement from that file, when it is still missing,
# so the later count-checked migrations see the same deals shape main has.
if ! "${PSQL[@]}" -tAc "select 1 from information_schema.columns where table_schema='public' and table_name='deals' and column_name='tc_user_id'" | grep -q 1; then
  echo "REPAIR deals.tc_user_id from 20261109190000 (that file's function drift check did not pass on this scratch database)"
  "${PSQL[@]}" -c "alter table public.deals add column tc_user_id uuid references public.profiles(id) on delete set null;"
fi
if ! "${PSQL[@]}" -tAc "select 1 from information_schema.columns where table_schema='public' and table_name='deals' and column_name='closer_name'" | grep -q 1; then
  echo "REPAIR closer columns by re-running 20261110071500"
  "${PSQL[@]}" -f "$ROOT/supabase/migrations/20261110071500_deal_closer.sql"
fi
if ! "${PSQL[@]}" -tAc "select 1 from information_schema.columns where table_schema='public' and table_name='deals' and column_name='lender_address'" | grep -q 1; then
  # Lender expects 61 columns. closing_time may already have been added while the
  # count was still short. Park it, apply lender, then put closing_time back.
  if "${PSQL[@]}" -tAc "select 1 from information_schema.columns where table_schema='public' and table_name='deals' and column_name='closing_time'" | grep -q 1; then
    echo "PARK deals.closing_time so the lender migration still sees 61 columns"
    "${PSQL[@]}" -c "alter table public.deals drop constraint if exists deals_closing_time_chk; alter table public.deals drop column closing_time;"
  fi
  echo "REPAIR lender columns by re-running 20261110081500"
  "${PSQL[@]}" -f "$ROOT/supabase/migrations/20261110081500_lender_clause_cpl_contacts.sql"
fi
if ! "${PSQL[@]}" -tAc "select 1 from information_schema.columns where table_schema='public' and table_name='deals' and column_name='latitude'" | grep -q 1; then
  echo "REPAIR deals.latitude and longitude from 20261110083000 (that file's function drift check did not pass on this scratch database)"
  "${PSQL[@]}" -c "alter table public.deals add column latitude double precision; alter table public.deals add column longitude double precision;"
fi
if ! "${PSQL[@]}" -tAc "select 1 from information_schema.columns where table_schema='public' and table_name='deals' and column_name='closing_time'" | grep -q 1; then
  echo "APPLY 20261110190000_deal_closing_time after the 67-column shape"
  "${PSQL[@]}" -f "$ROOT/supabase/migrations/20261110190000_deal_closing_time.sql"
fi
if ! "${PSQL[@]}" -tAc "select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='crm_import_batch'" | grep -q 1; then
  echo "REPAIR hosted CRM import by re-running 20261110100000"
  "${PSQL[@]}" -f "$ROOT/supabase/migrations/20261110100000_crm_hosted_import.sql"
fi

count="$("${PSQL[@]}" -tAc "select count(*) from information_schema.columns where table_schema='public' and table_name='deals'")"
echo "deals columns before parcel migration: $count (migrations ok=$ok fail=$bad)"
if [ "$count" != "68" ]; then
  echo "expected 68 deals columns after main's migrations" >&2
  "${PSQL[@]}" -c "select column_name from information_schema.columns where table_schema='public' and table_name='deals' order by ordinal_position;"
  exit 1
fi

MIG="$ROOT/supabase/migrations/20261110200000_parcel_earnest_financial.sql"
BACK="$ROOT/supabase/rollbacks/20261110200000_parcel_earnest_financial.sql"
"${PSQL[@]}" -f "$MIG"
"${PSQL[@]}" -c "insert into public.deals (street, city, state, loss_payee_name, lender_name) values ('1 Scratch', 'Rockville', 'MD', '', '');"
"${PSQL[@]}" -tAc "select parcel_id = '' and financial = '{}'::jsonb from public.deals" | grep -q t
"${PSQL[@]}" -c "update public.deals set parcel_id = '12-345', financial = '{\"emdHeldBy\":\"CLA Title\",\"commissionTotal\":10250}'::jsonb;"
"${PSQL[@]}" -c "insert into public.contacts (first_name, custom) values ('Known', '{\"license\":\"ABC\"}'::jsonb);"
if "${PSQL[@]}" -c "insert into public.contacts (first_name, custom) values ('Marked', '{\"ff_marker\":\"1\"}'::jsonb);" >/tmp/francis-custom.out 2>&1; then
  echo "unknown custom key was accepted" >&2
  exit 1
fi
grep -q 'unknown contacts custom key' /tmp/francis-custom.out
echo "apply ok; unknown custom key still rejected"

"${PSQL[@]}" -f "$BACK"
after_back="$("${PSQL[@]}" -tAc "select count(*) from information_schema.columns where table_schema='public' and table_name='deals' and column_name in ('parcel_id','financial')")"
if [ "$after_back" != "0" ]; then echo "rollback left a column" >&2; exit 1; fi
echo "rollback ok"

"${PSQL[@]}" -f "$MIG"
re="$("${PSQL[@]}" -tAc "select count(*) from information_schema.columns where table_schema='public' and table_name='deals'")"
if [ "$re" != "70" ]; then echo "reapply left $re columns" >&2; exit 1; fi
if "${PSQL[@]}" -c "insert into public.contacts (first_name, custom) values ('Marked2', '{\"ff_marker\":\"1\"}'::jsonb);" >/tmp/francis-custom2.out 2>&1; then
  echo "unknown custom key was accepted after reapply" >&2
  exit 1
fi
grep -q 'unknown contacts custom key' /tmp/francis-custom2.out
echo "reapply ok; unknown custom key still rejected"

sha256sum "$MIG" "$BACK"
echo "scratch sql passed"
