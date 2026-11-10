#!/usr/bin/env bash
# Throwaway local Postgres. Does not connect to TEST. Fake rows only.
# effective_uid's transaction cache (20261111170000) must not outlive a view-as start or stop in the same transaction.
# Uses the effective_uid body from 20261111170000 itself, then 20261111180000 and its rollback.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="${PG_BIN:-$( command -v pg_ctl >/dev/null 2>&1 && dirname "$(command -v pg_ctl)" || echo /usr/lib/postgresql/16/bin )}"
PGDATA="$(mktemp -d /tmp/cla-uid-reset.XXXXXX)"; PORT=54337
cleanup() { "$BIN/pg_ctl" -D "$PGDATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$PGDATA"; }
trap cleanup EXIT
"$BIN/initdb" -D "$PGDATA" --auth=trust --username=postgres >/dev/null
"$BIN/pg_ctl" -D "$PGDATA" -l "$PGDATA/log" -o "-p $PORT -k /tmp -c listen_addresses=" -w start >/dev/null
P=("$BIN/psql" -h /tmp -p "$PORT" -U postgres -d postgres -X -q -v ON_ERROR_STOP=1)
Q() { "${P[@]}" -tA -c "$1"; }
fail=0; check() { if [ "$1" = "$2" ]; then echo "ok $3"; else echo "FAIL $3 (got '$1', want '$2')"; fail=1; fi; }

A=00000000-0000-0000-0000-0000000000a1   # Super admin who views as B
B=00000000-0000-0000-0000-0000000000b2
"${P[@]}" <<SQL
create role anon nologin; create role authenticated nologin;
create schema auth; create schema private; create schema extensions;
create function auth.uid() returns uuid language sql stable as \$\$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid \$\$;
create table public.profiles (id uuid primary key, role text, is_admin boolean, status text);
create table private.view_as_sessions (id serial primary key, actor_id uuid, target_id uuid, stopped_at timestamptz, expires_at timestamptz);
insert into public.profiles values ('$A', 'Super admin', true, 'active'), ('$B', 'Outside user', false, 'active');
create function private.board_owner_names(p_deals uuid[]) returns table (deal_id uuid, participant_id uuid, owner_name text)
  language sql stable security definer as \$\$ select null::uuid, null::uuid, null::text where false \$\$;
revoke all on function private.board_owner_names(uuid[]) from public;   -- as 20261111170000 does
grant execute on function private.board_owner_names(uuid[]) to anon, authenticated;   -- a default grant that would leave anon in
SQL
# the cached effective_uid exactly as 20261111170000 ships it
sed -n '/^create or replace function private.effective_uid()/,/^\$uid\$;/p' "$ROOT/supabase/migrations/20261111170000_board_owner_names.sql" | "${P[@]}"

# one transaction: read, start view-as, read again, a second person in the same transaction, stop view-as, read again
scenario() { Q "begin;
  select set_config('request.jwt.claim.sub', '$A', true);
  create temp table seen (step int, uid uuid) on commit drop;
  insert into seen select 1, private.effective_uid();
  insert into private.view_as_sessions (actor_id, target_id, expires_at) values ('$A', '$B', now() + interval '1 hour');
  insert into seen select 2, private.effective_uid();
  select set_config('request.jwt.claim.sub', '$B', true);
  insert into seen select 3, private.effective_uid();
  select set_config('request.jwt.claim.sub', '$A', true);
  update private.view_as_sessions set stopped_at = now();
  insert into seen select 4, private.effective_uid();
  select string_agg(right(uid::text, 2), ',' order by step) from seen;
  rollback;" | tail -1; }

check "$(scenario)" "a1,a1,b2,a1" "before the fix the cache keeps the actor after view-as starts (step 2 should be b2)"
"${P[@]}" -f "$ROOT/supabase/migrations/20261111180000_effective_uid_cache_reset.sql"
check "$(scenario)" "a1,b2,b2,a1" "after the fix: actor, then the viewed-as person, another person's own id, then the actor again after stop"
check "$(Q "begin; select set_config('request.jwt.claim.sub', '$A', true); select private.effective_uid(); select private.effective_uid(); select current_setting('cla.effective_uid_for', true); rollback;" | tail -1)" "$A" "the cache is still used between view-as changes"
check "$(Q "select has_function_privilege('anon', 'private.board_owner_names(uuid[])', 'execute')")" "f" "anon cannot run board_owner_names"
check "$(Q "select has_function_privilege('authenticated', 'private.board_owner_names(uuid[])', 'execute')")" "t" "authenticated still can"
if "${P[@]}" -f "$ROOT/supabase/migrations/20261111180000_effective_uid_cache_reset.sql" >/dev/null 2>&1; then echo "FAIL a second apply did not refuse"; fail=1; else echo "ok a second apply refuses"; fi
"${P[@]}" -f "$ROOT/supabase/rollbacks/20261111180000_effective_uid_cache_reset.sql"
check "$(scenario)" "a1,a1,b2,a1" "rollback restores the earlier behaviour"
if "${P[@]}" -f "$ROOT/supabase/rollbacks/20261111180000_effective_uid_cache_reset.sql" >/dev/null 2>&1; then echo "FAIL a second rollback did not refuse"; fail=1; else echo "ok a second rollback refuses"; fi
Q "create or replace function private.effective_uid() returns uuid language sql stable security definer as \$\$ select auth.uid() \$\$;"
if "${P[@]}" -f "$ROOT/supabase/migrations/20261111180000_effective_uid_cache_reset.sql" >/dev/null 2>&1; then echo "FAIL applied without the 20261111170000 cache"; fail=1; else echo "ok refuses before 20261111170000"; fi
[ "$fail" = 0 ] && echo "effective uid reset sql passed" || exit 1
