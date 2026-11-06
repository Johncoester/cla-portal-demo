#!/bin/bash
# Throwaway Postgres only. Does not apply the migration to a hosted project.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PATH="/usr/lib/postgresql/17/bin:$PATH"
PGDATA="$(mktemp -d /tmp/client-invite-pg.XXXXXX)"
PORT=54332
cleanup() { pg_ctl -D "$PGDATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$PGDATA"; }
trap cleanup EXIT
initdb -D "$PGDATA" --auth=trust --username=postgres >/tmp/client-invite-init.log
pg_ctl -D "$PGDATA" -o "-p $PORT -k /tmp -c listen_addresses=" -l /tmp/client-invite-pg.log start >/dev/null
for i in 1 2 3 4 5 6 7 8 9 10; do pg_isready -h /tmp -p "$PORT" >/dev/null 2>&1 && break; sleep 0.2; done
createdb -h /tmp -p "$PORT" -U postgres client_invite_test
PSQL=(psql -h /tmp -p "$PORT" -U postgres -d client_invite_test -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f "$ROOT/test/fixtures/client-invite-fixture.sql" >/tmp/client-invite-fixture.out
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20261106190000_client_portal_invites.sql" >/tmp/client-invite-migration.out
"${PSQL[@]}" -f "$ROOT/test/fixtures/client-invite-assert.sql" | tee /tmp/client-invite-assert.out | grep -q 'ready-for-race'
RACE_USER="77777777-7777-4777-8777-777777777779"
race() { "${PSQL[@]}" -c "select private.as_service(); begin; select public.service_accept_invite('client', (select token from private.test_tokens where id = 90), '${RACE_USER}'::uuid, '{}'::jsonb); select pg_sleep(1.2); commit;"; }
race >/tmp/client-invite-race-a.out 2>/tmp/client-invite-race-a.err &
sleep 0.3
set +e
race >/tmp/client-invite-race-b.out 2>/tmp/client-invite-race-b.err
SECOND=$?
set -e
wait || true
if [[ "$SECOND" -eq 0 ]]; then echo 'second accept should have failed'; exit 1; fi
grep -q 'not valid' /tmp/client-invite-race-b.err
"${PSQL[@]}" -c "do \$\$ begin if (select count(*) from public.profiles where email = 'race@example.test') <> 1 then raise exception 'race profile count'; end if; if (select profile_id from public.contacts where email = 'race@example.test') is distinct from '${RACE_USER}'::uuid then raise exception 'race link'; end if; if (select role from public.profiles where id = '${RACE_USER}'::uuid) <> 'Outside user' or (select is_admin from public.profiles where id = '${RACE_USER}'::uuid) then raise exception 'race privilege'; end if; end \$\$; select 'client-invite-sql-ok';" | grep -q 'client-invite-sql-ok'
echo client-invite-sql-ok
