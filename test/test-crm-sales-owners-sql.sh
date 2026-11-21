#!/bin/bash
# F35 row 415. Disposable local Postgres only. Does not connect to TEST or production.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="cla_crm_sales_owners_$$"
PSQL=(sudo -u postgres psql -v ON_ERROR_STOP=1 -X -q)
cleanup() { sudo -u postgres psql -d postgres -c "drop database if exists \"$DB\";" >/dev/null 2>&1 || true; }
trap cleanup EXIT
"${PSQL[@]}" -d postgres -c "drop database if exists \"$DB\";"
"${PSQL[@]}" -d postgres -c "create database \"$DB\";"
"${PSQL[@]}" -d "$DB" -c "create extension if not exists pgcrypto;"
"${PSQL[@]}" -d "$DB" -f "$ROOT/test/sql/crm-owner-flag-harness.sql" >/tmp/crm-sales-owners-harness.out
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/20261124140000_crm_owner_flag.sql" >/tmp/crm-sales-owners-flag.out
# The shape a from-scratch database still has: the screen function lists people itself,
# and the deal filter uses the tick. TEST's screen function calls the private list instead.
"${PSQL[@]}" -d "$DB" <<'SQL'
create or replace function public.crm_owners()
returns table(id uuid, name text, role text)
language plpgsql stable security definer
set search_path = pg_catalog, public, extensions
as $fn$
begin
  perform private.crm_need();
  return query select p.id, btrim(p.first_name || ' ' || p.last_name), p.role
    from public.profiles p where p.status = 'active' and p.role in ('Sales Person', 'Sales Team') order by 2;
end
$fn$;
create or replace function public.crm_deal_filters()
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, extensions
as $fn$
begin
  return jsonb_build_object('owners', coalesce((select jsonb_agg(p.id::text)
    from public.profiles p where p.status = 'active' and p.can_own_crm), '[]'::jsonb));
end
$fn$;
SQL
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/20261127020000_crm_sales_person_owners.sql" >/tmp/crm-sales-owners-migrate.out
"${PSQL[@]}" -d "$DB" -f "$ROOT/test/sql/crm-sales-owners-checks.sql" >/tmp/crm-sales-owners-checks.out
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/rollbacks/20261127020000_crm_sales_person_owners.sql" >/tmp/crm-sales-owners-rollback.out
"${PSQL[@]}" -d "$DB" <<'SQL'
do $chk$
begin
  if exists (select 1 from private.rpc_crm_owners() where role = 'Sales Person' and id = '22222222-2222-4222-8222-222222222222') then
    raise exception 'FAIL rollback left the unticked salesperson in the private list';
  end if;
  if not exists (select 1 from private.rpc_crm_owners() where id = '11111111-1111-4111-8111-111111111111') then
    raise exception 'FAIL rollback dropped the ticked admin';
  end if;
  if exists (select 1 from public.crm_owners() where id = '22222222-2222-4222-8222-222222222222') then
    raise exception 'FAIL rollback left the unticked salesperson in the screen list';
  end if;
  if position('p.role = ''Sales Person''' in pg_get_functiondef('public.crm_deal_filters()'::regprocedure)) > 0 then
    raise exception 'FAIL rollback left the salesperson rule on the deal owner filter';
  end if;
  begin
    perform private.crm_owner_check('22222222-2222-4222-8222-222222222222', null, true);
    raise exception 'FAIL rollback still accepted an unticked salesperson';
  exception
    when sqlstate 'P0001' then
      if position('can own CRM records' in sqlerrm) = 0 then
        raise exception 'FAIL rollback message was %', sqlerrm;
      end if;
  end;
end
$chk$;
SQL
echo "crm sales owners sql passed"
