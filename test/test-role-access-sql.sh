#!/bin/bash
# Disposable local Postgres only (PG17). Does not connect to the TEST project and does not use its keys.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="${CLA_ROLE_ACCESS_TEST_DB:-cla_role_access_test}"
SQL="$ROOT/supabase/migrations/20261110010000_role_module_access.sql"
BACK="$ROOT/supabase/rollbacks/20261110010000_role_module_access.sql"
P="${CLA_PSQL:-sudo -u postgres psql} -X -q -v ON_ERROR_STOP=1"   # CLA_PSQL="psql -h /tmp/sock -p 5432 -U postgres" for a throwaway cluster
$P -c "drop database if exists \"$DB\";"
$P -c "create database \"$DB\";"
$P -d "$DB" -f "$ROOT/test/sql/role-access-harness.sql" >/tmp/role-access-harness.out
$P -d "$DB" -v phase=before -f "$ROOT/test/sql/role-access-snapshot.sql" >/tmp/role-access-snap.out
$P -d "$DB" -v phase=before -f "$ROOT/test/sql/role-access-timing.sql" >/tmp/role-access-time.out
$P -d "$DB" -1 -f "$SQL" >/tmp/role-access-migrate.out
# a second apply must refuse (guard), leaving the first in place
if $P -d "$DB" -1 -f "$SQL" >/tmp/role-access-migrate2.out 2>&1; then echo "FAIL: second apply did not refuse"; exit 1; fi
$P -d "$DB" -v phase=after -f "$ROOT/test/sql/role-access-snapshot.sql" >>/tmp/role-access-snap.out
$P -d "$DB" -v phase=after -f "$ROOT/test/sql/role-access-timing.sql" >>/tmp/role-access-time.out
$P -d "$DB" -f "$ROOT/test/sql/role-access-checks.sql" >/tmp/role-access-checks.out
$P -d "$DB" -1 -f "$BACK" >/tmp/role-access-rollback.out
$P -d "$DB" -v phase=rolled -f "$ROOT/test/sql/role-access-snapshot.sql" >>/tmp/role-access-snap.out
$P -d "$DB" -f "$ROOT/test/sql/role-access-rollback-checks.sql" >/tmp/role-access-rollback-checks.out
# a drifted body must stop the migration before anything is created
$P -d "$DB" -c "create or replace function private.crm_all() returns boolean language sql stable security definer set search_path to 'pg_catalog', 'public', 'extensions' as \$\$ select true \$\$;"
if $P -d "$DB" -1 -f "$SQL" >/tmp/role-access-drift.out 2>&1; then echo "FAIL: drift guard did not stop the migration"; exit 1; fi
grep -q "changed since Nov 9" /tmp/role-access-drift.out
$P -d "$DB" -tA -c "select to_regclass('public.role_module_access') is null" | grep -q t
$P -d "$DB" -tA -F' ' -c "select what, string_agg(phase || '=' || ms || 'ms', ' ' order by phase desc) from public.ra_time group by what order by what"
echo "role access sql passed"
