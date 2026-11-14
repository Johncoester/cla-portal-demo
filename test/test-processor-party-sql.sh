#!/bin/bash
# PROC-1. Throwaway Postgres only. Does not apply the migration to a hosted project.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PATH="/usr/lib/postgresql/17/bin:/usr/lib/postgresql/16/bin:$PATH"
PGDATA="$(mktemp -d /tmp/proc-party-pg.XXXXXX)"
PORT=54341
cleanup() { pg_ctl -D "$PGDATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$PGDATA"; }
trap cleanup EXIT
initdb -D "$PGDATA" --auth=trust --username=postgres >/tmp/proc-party-init.log
pg_ctl -D "$PGDATA" -o "-p $PORT -k /tmp -c listen_addresses=" -l /tmp/proc-party-pg.log start >/dev/null
for i in 1 2 3 4 5 6 7 8 9 10; do pg_isready -h /tmp -p "$PORT" >/dev/null 2>&1 && break; sleep 0.2; done
createdb -h /tmp -p "$PORT" -U postgres proc_party
PSQL=(psql -h /tmp -p "$PORT" -U postgres -d proc_party -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" <<'SQL'
create schema private;
create role anon;
create role authenticated;
create function private.lock_function_search_paths() returns void language sql as 'select 1';
create table public.profiles (
  id uuid primary key,
  role text,
  status text,
  is_demo boolean,
  first_name text,
  last_name text,
  email text,
  phone text
);
create table public.deals (
  id uuid primary key,
  processor_id uuid references public.profiles (id),
  is_demo boolean,
  notes text,
  street text,
  file_number text
);
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id),
  first_name text,
  last_name text,
  email text,
  phone text,
  company text,
  is_demo boolean
);
create table public.deal_participants (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id),
  contact_id uuid not null references public.contacts (id),
  role text not null
);
insert into public.profiles values
  ('11111111-1111-4111-8111-111111111111', 'Super admin', 'active', false, 'King', 'Admin', 'king.admin@example.test', '301-555-0109'),
  ('22222222-2222-4222-8222-222222222222', 'Sales Person', 'active', false, 'Sam', 'Sales', 'sam.sales@example.test', '301-555-0102'),
  ('33333333-3333-4333-8333-333333333333', 'Outside user', 'active', false, 'Ben', 'Buyer', 'ben.buyer@example.test', '301-555-0107'),
  ('44444444-4444-4444-8444-444444444444', 'Processor', 'active', true, 'Demo', 'Proc', 'demo.proc@example.test', '301-555-0199'),
  ('55555555-5555-4555-8555-555555555555', 'Processor', 'active', false, 'Pat', 'Real', 'pat.real@clatitle.com', '301-555-0188');
insert into public.contacts values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'King', 'Admin', 'king.admin@example.test', '301-555-0109', 'CLA', false),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'Sam', 'Sales', 'sam.sales@example.test', '301-555-0102', 'CLA', false),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', null, 'Cora', 'Seller', 'cora.seller@example.test', '301-555-0133', '', false),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '33333333-3333-4333-8333-333333333333', 'Ben', 'Buyer', 'ben.buyer@example.test', '301-555-0107', '', false),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '55555555-5555-4555-8555-555555555555', 'Pat', 'Real', 'pat.real@clatitle.com', '301-555-0188', 'CLA', false);
insert into public.deals values
  ('d1000000-0000-4000-8000-000000000001', null, false, 'Fake file.', '1 Sample Lane', 'DEMO-1'),
  ('d1000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', false, 'Fake file.', '2 Sample Lane', 'DEMO-2'),
  ('d1000000-0000-4000-8000-000000000003', null, false, '', '10 Real Street', 'MD-26-97260'),
  ('d1000000-0000-4000-8000-000000000007', null, true, 'Fake file.', '7 Demo Lane', 'DEMO-7');
insert into public.contacts (id, profile_id, first_name, last_name, email, phone, company, is_demo)
values ('a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7', '44444444-4444-4444-8444-444444444444', 'Demo', 'Proc', 'demo.proc@example.test', '', 'CLA', true);
insert into public.deal_participants (id, deal_id, contact_id, role)
values ('a1000000-0000-4000-8000-00000000000c', 'd1000000-0000-4000-8000-000000000007', 'a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7', 'Processor');
insert into public.deal_participants values
  ('a1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Processor'),
  ('a1000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000003', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'Processor');
SQL
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20261122180000_processor_party_sync.sql" >/tmp/proc-party-migration.out
"${PSQL[@]}" <<'SQL'
do $$ begin
  if (select processor_id from public.deals where id = 'd1000000-0000-4000-8000-000000000001')
     is distinct from '11111111-1111-4111-8111-111111111111' then
    raise exception 'fake file with a Processor contact was not copied onto the file';
  end if;
  if not exists (select 1 from public.deal_participants where deal_id = 'd1000000-0000-4000-8000-000000000002' and role = 'Processor' and contact_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') then
    raise exception 'fake file with a processor field did not gain a Contacts row';
  end if;
  if (select processor_id from public.deals where id = 'd1000000-0000-4000-8000-000000000003') is not null then
    raise exception 'a file that is not a fake pattern was changed';
  end if;
  if private.processor_backfill_fake('d1000000-0000-4000-8000-000000000003') then
    raise exception 'MD-26-97260 with a clatitle.com contact must not count as the fake copy';
  end if;
  if not private.processor_backfill_fake('d1000000-0000-4000-8000-000000000001') then
    raise exception 'a file marked Fake file must count as the fake copy';
  end if;
  if (select processor_id from public.deals where id = 'd1000000-0000-4000-8000-000000000007')
     is distinct from '44444444-4444-4444-8444-444444444444' then
    raise exception 'a demo file was not copied onto its demo Processor';
  end if;
end $$;

insert into public.deals (id, processor_id, is_demo, notes, street, file_number)
values ('d1000000-0000-4000-8000-000000000004', null, false, '', '4 Live Lane', 'MD-26-90004');

insert into public.deal_participants (id, deal_id, contact_id, role)
values ('a1000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000004', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Processor');
do $$ begin
  if (select processor_id from public.deals where id = 'd1000000-0000-4000-8000-000000000004')
     is distinct from '22222222-2222-4222-8222-222222222222' then
    raise exception 'adding a Sales Person on Contacts did not set the file Processor';
  end if;
end $$;

insert into public.deal_participants (id, deal_id, contact_id, role)
values ('a1000000-0000-4000-8000-000000000005', 'd1000000-0000-4000-8000-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Processor');
do $$ begin
  if (select processor_id from public.deals where id = 'd1000000-0000-4000-8000-000000000004')
     is distinct from '11111111-1111-4111-8111-111111111111' then
    raise exception 'replacing the Processor did not update the file';
  end if;
  if (select count(*) from public.deal_participants where deal_id = 'd1000000-0000-4000-8000-000000000004' and role = 'Processor') <> 1 then
    raise exception 'Contacts kept more than one Processor';
  end if;
end $$;

delete from public.deal_participants where id = 'a1000000-0000-4000-8000-000000000005';
do $$ begin
  if (select processor_id from public.deals where id = 'd1000000-0000-4000-8000-000000000004') is not null then
    raise exception 'removing the Processor from Contacts did not clear the file';
  end if;
end $$;

update public.deals set processor_id = '11111111-1111-4111-8111-111111111111' where id = 'd1000000-0000-4000-8000-000000000004';
do $$ begin
  if not exists (
    select 1 from public.deal_participants dp join public.contacts c on c.id = dp.contact_id
     where dp.deal_id = 'd1000000-0000-4000-8000-000000000004' and dp.role = 'Processor' and c.profile_id = '11111111-1111-4111-8111-111111111111'
  ) then raise exception 'setting the Processor did not add the Contacts row'; end if;
end $$;

insert into public.profiles values
  ('66666666-6666-4666-8666-666666666666', 'Admin', 'active', false, 'Ada', 'Admin', 'ada.admin@example.test', '301-555-0110');
update public.deals set processor_id = '66666666-6666-4666-8666-666666666666' where id = 'd1000000-0000-4000-8000-000000000004';
do $$ begin
  if not exists (
    select 1 from public.deal_participants dp join public.contacts c on c.id = dp.contact_id
     where dp.deal_id = 'd1000000-0000-4000-8000-000000000004' and dp.role = 'Processor' and c.profile_id = '66666666-6666-4666-8666-666666666666'
  ) then raise exception 'a staff login with no contact did not get a Contacts row'; end if;
end $$;

do $$ begin
  begin
    insert into public.deal_participants (id, deal_id, contact_id, role)
    values ('a1000000-0000-4000-8000-000000000006', 'd1000000-0000-4000-8000-000000000004', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Processor');
    raise exception 'a person with no login was accepted';
  exception when others then
    if sqlerrm not like '%no portal login%' then raise; end if;
  end;
  begin
    insert into public.deal_participants (id, deal_id, contact_id, role)
    values ('a1000000-0000-4000-8000-000000000007', 'd1000000-0000-4000-8000-000000000004', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Processor');
    raise exception 'an outside user was accepted';
  exception when others then
    if sqlerrm not like '%outside user%' then raise; end if;
  end;
end $$;

insert into public.deals (id, processor_id, is_demo, notes, street, file_number)
values ('d1000000-0000-4000-8000-000000000005', null, false, '', '5 Demo Mismatch', 'MD-26-90005');
insert into public.contacts (id, profile_id, first_name, last_name, email, phone, company, is_demo)
values ('ffffffff-ffff-4fff-8fff-ffffffffffff', '44444444-4444-4444-8444-444444444444', 'Demo', 'Proc', 'demo.proc@example.test', '', 'CLA', true);
do $$ begin
  begin
    insert into public.deal_participants (id, deal_id, contact_id, role)
    values ('a1000000-0000-4000-8000-000000000009', 'd1000000-0000-4000-8000-000000000005', 'ffffffff-ffff-4fff-8fff-ffffffffffff', 'Processor');
    raise exception 'a demo login was accepted on a real file';
  exception when others then
    if sqlerrm not like '%demo login%' then raise; end if;
  end;
end $$;

insert into public.deal_participants (id, deal_id, contact_id, role)
values ('a1000000-0000-4000-8000-00000000000a', 'd1000000-0000-4000-8000-000000000004', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Client-Seller');
do $$ begin
  if (select processor_id from public.deals where id = 'd1000000-0000-4000-8000-000000000004')
     is distinct from '66666666-6666-4666-8666-666666666666' then
    raise exception 'adding a seller changed the Processor';
  end if;
end $$;
select 'processor-party-sql-ok';
SQL
"${PSQL[@]}" -f "$ROOT/supabase/rollbacks/20261122180000_processor_party_sync.sql" >/tmp/proc-party-rollback.out
"${PSQL[@]}" <<'SQL'
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'participants_processor_sync') then
    raise exception 'rollback left the Contacts trigger';
  end if;
  if to_regprocedure('private.apply_processor_party(uuid)') is not null then
    raise exception 'rollback left the sync function';
  end if;
  if (select processor_id from public.deals where id = 'd1000000-0000-4000-8000-000000000001') is null then
    raise exception 'rollback cleared a processor the copy had already set';
  end if;
end $$;
insert into public.deals (id, processor_id, is_demo, notes, street, file_number)
values ('d1000000-0000-4000-8000-000000000006', null, false, '', '6 After Rollback', 'MD-26-90006');
insert into public.deal_participants (id, deal_id, contact_id, role)
values ('a1000000-0000-4000-8000-00000000000b', 'd1000000-0000-4000-8000-000000000006', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Processor');
do $$ begin
  if (select processor_id from public.deals where id = 'd1000000-0000-4000-8000-000000000006') is not null then
    raise exception 'after rollback, Contacts still updates the file Processor';
  end if;
end $$;
select 'processor-party-sql-rollback-ok';
SQL
echo processor-party-sql-ok
