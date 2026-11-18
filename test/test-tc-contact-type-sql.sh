#!/bin/bash
# TC-4. Throwaway database only. Does not apply the file to TEST or production.
# A realtor row stays a realtor. agent_tc is allowed only after the file. The rollback refuses while one is saved.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="cla_tc_type_$$"
SQL="$ROOT/supabase/migrations/20261125230000_tc_contact_type.sql"
BACK="$ROOT/supabase/rollbacks/20261125230000_tc_contact_type.sql"
PSQL=(sudo -u postgres psql -v ON_ERROR_STOP=1 -X -q)
cleanup() { sudo -u postgres psql -d postgres -c "drop database if exists \"$DB\";" >/dev/null 2>&1 || true; }
trap cleanup EXIT
"${PSQL[@]}" -d postgres -c "drop database if exists \"$DB\";"
"${PSQL[@]}" -d postgres -c "create database \"$DB\";"
"${PSQL[@]}" -d "$DB" <<'SQL'
create table public.contacts (
  id integer generated always as identity primary key,
  contact_type text
);
alter table public.contacts add constraint contacts_contact_type_check
  check (contact_type is null or contact_type in ('realtor', 'lender', 'buyer_seller'));
create table public.crm_leads (
  id integer generated always as identity primary key,
  contact_type text check (contact_type is null or contact_type in ('realtor', 'lender', 'buyer_seller'))
);
insert into public.contacts (contact_type) values ('realtor');
insert into public.crm_leads (contact_type) values ('lender');
SQL
"${PSQL[@]}" -d "$DB" -f "$SQL"
KEPT="$("${PSQL[@]}" -d "$DB" -tA -c "select contact_type from public.contacts order by id")"
LEAD="$("${PSQL[@]}" -d "$DB" -tA -c "select contact_type from public.crm_leads order by id")"
NEW="$("${PSQL[@]}" -d "$DB" -tA -c "select count(*) from public.contacts where contact_type = 'agent_tc'")"
if [ "$KEPT" != "realtor" ] || [ "$LEAD" != "lender" ] || [ "$NEW" != "0" ]; then
  echo "FAIL existing rows changed or a coordinator was written: contacts=$KEPT leads=$LEAD new=$NEW" >&2
  exit 1
fi
"${PSQL[@]}" -d "$DB" -c "insert into public.contacts (contact_type) values ('agent_tc'); insert into public.crm_leads (contact_type) values ('agent_tc');"
if "${PSQL[@]}" -d "$DB" -f "$BACK" >/tmp/tc-type-rollback-blocked.out 2>/tmp/tc-type-rollback-blocked.err; then
  echo "FAIL rollback ran while a transaction coordinator was saved" >&2
  exit 1
fi
if ! grep -q "cannot be undone yet" /tmp/tc-type-rollback-blocked.err; then
  echo "FAIL rollback did not say to change the contact type first" >&2
  cat /tmp/tc-type-rollback-blocked.err >&2
  exit 1
fi
"${PSQL[@]}" -d "$DB" -c "delete from public.contacts where contact_type = 'agent_tc'; delete from public.crm_leads where contact_type = 'agent_tc';"
"${PSQL[@]}" -d "$DB" -f "$BACK"
if "${PSQL[@]}" -d "$DB" -c "insert into public.contacts (contact_type) values ('agent_tc');" >/tmp/tc-type-after-rollback.out 2>/tmp/tc-type-after-rollback.err; then
  echo "FAIL agent_tc was still allowed after rollback" >&2
  exit 1
fi
STILL="$("${PSQL[@]}" -d "$DB" -tA -c "select contact_type from public.contacts order by id")"
if [ "$STILL" != "realtor" ]; then
  echo "FAIL the realtor row did not survive rollback: $STILL" >&2
  exit 1
fi
echo "tc contact type sql passed"
