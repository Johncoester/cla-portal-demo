#!/bin/bash
# Throwaway Postgres only. Does not apply the migration to a hosted project.
# A person who cannot read the note cannot read its file. The lookup is the
# note's primary key, under that table's own row security.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -x /usr/lib/postgresql/17/bin/initdb ]]; then PATH="/usr/lib/postgresql/17/bin:$PATH"
elif [[ -x /usr/lib/postgresql/16/bin/initdb ]]; then PATH="/usr/lib/postgresql/16/bin:$PATH"
fi
PGDATA="$(mktemp -d /tmp/crm-note-file-pg.XXXXXX)"
PORT=54341
cleanup() { pg_ctl -D "$PGDATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$PGDATA"; }
trap cleanup EXIT
initdb -D "$PGDATA" --auth=trust --username=postgres >/tmp/crm-note-file-init.log
pg_ctl -D "$PGDATA" -o "-p $PORT -k /tmp -c listen_addresses=" -l /tmp/crm-note-file-pg.log start >/dev/null
for i in 1 2 3 4 5 6 7 8 9 10; do pg_isready -h /tmp -p "$PORT" >/dev/null 2>&1 && break; sleep 0.2; done
createdb -h /tmp -p "$PORT" -U postgres crm_note_file
PSQL=(psql -h /tmp -p "$PORT" -U postgres -d crm_note_file -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" <<'SQL'
create schema auth;
create schema private;
create schema storage;
create role anon nologin nosuperuser;
create role authenticated nologin nosuperuser;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function private.crm_editor() returns boolean language sql stable as $$
  select current_setting('cla.editor', true) = 'on' $$;
create function private.is_admin() returns boolean language sql stable as $$
  select current_setting('cla.admin', true) = 'on' $$;
create function private.crm_row_guard() returns trigger language plpgsql as $$ begin return new; end $$;
create table public.profiles (id uuid primary key, is_admin boolean, status text, role text);
create table public.crm_activities (
  id uuid primary key,
  entity text not null,
  entity_id uuid not null,
  kind text not null,
  system boolean not null default false,
  created_by uuid,
  reader_id uuid not null
);
create table public.crm_attachments (
  id uuid primary key,
  entity text not null,
  entity_id uuid not null,
  name text not null,
  mime_type text not null default 'application/octet-stream',
  size bigint not null default 0,
  storage_path text not null default '',
  uploaded_by uuid,
  created_at timestamptz not null default now()
);
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
create function storage.allow_any_operation(text[]) returns boolean language sql stable as $$ select true $$;
-- Stand-in for the real note policy: the caller sees a note only when they are its reader.
alter table public.crm_activities enable row level security;
alter table public.crm_activities force row level security;
create policy crm_acts_select on public.crm_activities for select to authenticated
  using (reader_id = (select auth.uid()));
grant usage on schema public, storage, auth, private to authenticated;
grant select on public.crm_activities to authenticated;
grant select, insert on storage.objects to authenticated;
grant execute on function auth.uid() to authenticated;
grant execute on function private.crm_editor() to authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function storage.allow_any_operation(text[]) to authenticated;
SQL
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20261125200000_crm_note_files.sql" >/tmp/crm-note-file-migration.out
"${PSQL[@]}" <<'SQL'
alter table storage.objects enable row level security;
alter table storage.objects force row level security;
insert into public.crm_activities (id, entity, entity_id, kind, system, created_by, reader_id) values
  ('22222222-2222-4222-8222-222222222222', 'lead', '11111111-1111-4111-8111-111111111111', 'note', false,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('77777777-7777-4777-8777-777777777777', 'lead', '11111111-1111-4111-8111-111111111111', 'note', false,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
insert into storage.objects (bucket_id, name) values
  ('crm', 'notes/lead/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333/contract.pdf'),
  ('crm', 'notes/not-a-note');
set role authenticated;
do $$
declare n int;
begin
  perform set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
  perform set_config('cla.editor', 'off', true);
  perform set_config('cla.admin', 'off', true);
  select count(*) into n from public.crm_activities;
  if n <> 1 then raise exception 'the author should see the note, saw %', n; end if;
  select count(*) into n from storage.objects;
  if n <> 1 then raise exception 'the author should see the file and not the bad path, saw %', n; end if;
  perform set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
  perform set_config('cla.editor', 'off', true);
  perform set_config('cla.admin', 'off', true);
  select count(*) into n from public.crm_activities;
  if n <> 0 then raise exception 'a stranger should not see the note, saw %', n; end if;
  select count(*) into n from storage.objects;
  if n <> 0 then raise exception 'a stranger who cannot read the note should not see its file, saw %', n; end if;
  perform set_config('cla.editor', 'on', true);
  begin
    insert into storage.objects (bucket_id, name) values
      ('crm', 'notes/lead/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/44444444-4444-4444-8444-444444444444/other.pdf');
    raise exception 'a stranger should not be able to add a file';
  exception when others then
    if sqlerrm not like '%row-level security%' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
  perform set_config('cla.editor', 'on', true);
  insert into storage.objects (bucket_id, name) values
    ('crm', 'notes/lead/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/55555555-5555-4555-8555-555555555555/second.pdf');
  perform set_config('cla.admin', 'on', true);
  perform set_config('request.jwt.claim.sub', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', true);
  begin
    insert into storage.objects (bucket_id, name) values
      ('crm', 'notes/lead/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/66666666-6666-4666-8666-666666666666/admin.pdf');
    raise exception 'an admin who cannot read the note should not add a file';
  exception when others then
    if sqlerrm not like '%row-level security%' then raise; end if;
  end;
  insert into storage.objects (bucket_id, name) values
    ('crm', 'notes/lead/11111111-1111-4111-8111-111111111111/77777777-7777-4777-8777-777777777777/88888888-8888-4888-8888-888888888888/admin-seen.pdf');
end $$;
reset role;
set enable_seqscan = off;
SQL
# The explain above is checked with a query that prints the plan.
PLAN="$("${PSQL[@]}" -tA -c "explain select 1 from public.crm_activities n where n.id = '22222222-2222-4222-8222-222222222222'::uuid")"
printf '%s\n' "$PLAN" | grep -q 'crm_activities_pkey' || { echo "note lookup did not use the primary key: $PLAN"; exit 1; }
# Files are still in the bucket, so the rollback must stop and leave the column in place.
set +e
"${PSQL[@]}" -f "$ROOT/supabase/rollbacks/20261125200000_crm_note_files.sql" >/tmp/crm-note-file-rollback-blocked.out 2>/tmp/crm-note-file-rollback-blocked.err
BLOCKED=$?
set -e
if [[ "$BLOCKED" -eq 0 ]]; then echo 'rollback should stop while note files are stored'; exit 1; fi
grep -q 'still has files' /tmp/crm-note-file-rollback-blocked.err
STILL="$("${PSQL[@]}" -tA -c "select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'crm_attachments' and column_name = 'note_id'")"
[[ "$STILL" == "1" ]] || { echo "a blocked rollback removed note_id"; exit 1; }
"${PSQL[@]}" -c "delete from storage.objects where bucket_id = 'crm'"
"${PSQL[@]}" -f "$ROOT/supabase/rollbacks/20261125200000_crm_note_files.sql" >/tmp/crm-note-file-rollback.out
GONE="$("${PSQL[@]}" -tA -c "select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'crm_attachments' and column_name = 'note_id'")"
[[ "$GONE" == "0" ]] || { echo "note_id survived the rollback"; exit 1; }
FUN="$("${PSQL[@]}" -tA -c "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = 'crm_note_file_guard'")"
[[ "$FUN" == "0" ]] || { echo "the guard survived the rollback"; exit 1; }
POL="$("${PSQL[@]}" -tA -c "select count(*) from pg_policy where polname in ('crm_note_object_read', 'crm_note_object_insert')")"
[[ "$POL" == "0" ]] || { echo "a storage policy survived the rollback"; exit 1; }
BUCKET="$("${PSQL[@]}" -tA -c "select count(*) from storage.buckets where id = 'crm'")"
[[ "$BUCKET" == "0" ]] || { echo "the bucket this migration created survived the rollback"; exit 1; }
echo crm-note-file-read-ok
