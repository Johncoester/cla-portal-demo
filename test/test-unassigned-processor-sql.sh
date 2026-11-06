#!/bin/bash
# Throwaway Postgres only. Does not apply the migration to a hosted project.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PATH="/usr/lib/postgresql/17/bin:$PATH"
PGDATA="$(mktemp -d /tmp/unassigned-proc-pg.XXXXXX)"
PORT=54333
cleanup() { pg_ctl -D "$PGDATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$PGDATA"; }
trap cleanup EXIT
initdb -D "$PGDATA" --auth=trust --username=postgres >/tmp/unassigned-proc-init.log
pg_ctl -D "$PGDATA" -o "-p $PORT -k /tmp -c listen_addresses=" -l /tmp/unassigned-proc-pg.log start >/dev/null
for i in 1 2 3 4 5 6 7 8 9 10; do pg_isready -h /tmp -p "$PORT" >/dev/null 2>&1 && break; sleep 0.2; done
createdb -h /tmp -p "$PORT" -U postgres unassigned_proc
PSQL=(psql -h /tmp -p "$PORT" -U postgres -d unassigned_proc -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" <<'SQL'
create schema private;
create table public.profiles (id uuid primary key, role text, status text, is_demo boolean);
create table public.deals (id int primary key, processor_id uuid, is_demo boolean);
insert into public.profiles values
  ('11111111-1111-4111-8111-111111111111', 'Processor', 'active', false),
  ('22222222-2222-4222-8222-222222222222', 'Processor', 'active', true),
  ('33333333-3333-4333-8333-333333333333', 'Sales Person', 'active', false);
create function private.lock_function_search_paths() returns void language sql as 'select 1';
SQL
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20261106191000_unassigned_processor.sql" >/tmp/unassigned-proc-migration.out
"${PSQL[@]}" <<'SQL'
create trigger deal_processor before insert or update on public.deals
  for each row execute function private.deal_processor_guard();
insert into public.deals values (1, null, false);
insert into public.deals values (2, '11111111-1111-4111-8111-111111111111', false);
insert into public.deals values (3, '22222222-2222-4222-8222-222222222222', true);
do $$ begin
  begin insert into public.deals values (4, '33333333-3333-4333-8333-333333333333', false); raise exception 'sales should fail';
  exception when others then if sqlerrm not like '%Processor, Preprocessor, Admin or Super admin%' then raise; end if; end;
  begin insert into public.deals values (5, '22222222-2222-4222-8222-222222222222', false); raise exception 'demo on real should fail';
  exception when others then if sqlerrm not like '%Processor, Preprocessor, Admin or Super admin%' then raise; end if; end;
  update public.deals set processor_id = '11111111-1111-4111-8111-111111111111' where id = 1;
  if (select processor_id from public.deals where id = 1) is null then raise exception 'late assign failed'; end if;
  update public.deals set processor_id = null where id = 1;
  if (select processor_id from public.deals where id = 1) is not null then raise exception 'clear failed'; end if;
end $$;
select 'unassigned-processor-sql-ok';
SQL
echo unassigned-processor-sql-ok
