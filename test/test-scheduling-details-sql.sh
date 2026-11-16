#!/bin/sh
# MF-056 scheduling details. Disposable database only. Does not connect to TEST and does not use its data.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
DB=cla_sched_$$
psql_super() { sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -d "$DB" "$@"; }
cleanup() { sudo -u postgres psql -X -q -d postgres -c "drop database if exists $DB;" >/dev/null 2>&1 || true; }
trap cleanup EXIT
sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $DB;" -c "create database $DB;"
psql_super <<'SQL'
set check_function_bodies = off;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema if not exists private;
create schema if not exists extensions;
create table public.profiles (id uuid primary key, role text, status text default 'active', first_name text, last_name text, email text);
create table public.deals (id uuid primary key, file_number text, street text, city text, state text, zip text, status text default 'Open', closing_date date, processor_id uuid, closer_name text not null default '');
create table public.contacts (id uuid primary key, profile_id uuid, email text, first_name text, last_name text);
create table public.deal_participants (id uuid primary key, deal_id uuid, contact_id uuid, role text);
create table public.tasks (id uuid primary key default gen_random_uuid(), deal_id uuid, title text, description text default '', assigned_role text, status text default 'todo', due_date date, created_by uuid, kind text, participant_id uuid, owner_profile_id uuid, template_code text, template_version int, form_data jsonb default '{}'::jsonb, saved_at timestamptz, saved_by uuid, completed_at timestamptz, completed_by uuid);
create table public.outbox (id uuid primary key default gen_random_uuid(), channel text, status text, sent_at timestamptz, to_profile_id uuid, to_email text, to_name text default '', subject text, body text, deal_id uuid, created_by uuid, kind text default '', from_email text, from_name text, sender_type text, title_package boolean not null default false);
create table public.notifications (id uuid primary key default gen_random_uuid(), profile_id uuid, kind text, deal_id uuid, title text, link text);
create function private.effective_uid() returns uuid language sql stable as $$ select nullif(current_setting('cla.uid', true), '')::uuid $$;
create function private.person_name(pid uuid) returns text language sql stable as $$ select coalesce((select trim(first_name || ' ' || last_name) from public.profiles where id = pid), 'Unknown') $$;
create function private.notify(p_ids uuid[], p_kind text, p_deal uuid, p_title text, p_link text) returns void language sql as $$
  insert into public.notifications (profile_id, kind, deal_id, title, link) select x, p_kind, p_deal, p_title, p_link from unnest(p_ids) x $$;
create function private.task_enabled(p_code text) returns boolean language sql as $$ select true $$;
create function private.is_admin() returns boolean language sql as $$ select false $$;
create function private.is_staffish() returns boolean language sql as $$ select true $$;
create function private.can_run_deal(p_deal uuid) returns boolean language sql as $$ select true $$;
create function private.agent_person_ok(p jsonb, need_email boolean, need_phone boolean) returns boolean language sql as $$ select true $$;
create function private.can_access_deal(d uuid) returns boolean language sql as $$ select true $$;
create function private.task_visible(owner uuid, role text, deal uuid) returns boolean language sql as $$ select true $$;
create function private.log_activity(p_deal uuid, p_action text, p_entity text, p_id uuid, p_detail text) returns void language sql as $$ select $$;
create table public.agent_task_revisions (task_id uuid, n int, answers jsonb, by_profile uuid);
create function private.agent_task_defs() returns table(code text, title text, about text, due_days integer) language sql as $$
  values ('agent_home_warranty', 'Confirm Home Warranty Information', 'about', 5) $$;
create function private.agent_validate(p_code text, a jsonb) returns void language plpgsql as $$ begin end $$;
create function private.make_agent_tasks(p_part uuid) returns integer language sql as $$ select 0 $$;
create function private.rpc_submit_agent_task(p_task uuid, p_answers jsonb) returns integer language sql as $$ select 1 $$;
insert into public.profiles (id, role, status, first_name, last_name, email) values
  ('11111111-1111-1111-1111-111111111111', 'Outside user', 'active', 'Bianca', 'Agent', 'bianca.agent@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'Processor', 'active', 'Pat', 'Processor', 'pat.processor@example.test');
insert into public.deals (id, file_number, street, city, state, zip, status, closing_date, processor_id, closer_name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'MD-26-1', '10 Oak Lane', 'Rockville', 'MD', '20850', 'Open', null, '22222222-2222-2222-2222-222222222222', 'Kept Closer');
insert into public.contacts (id, profile_id, email, first_name, last_name) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'bianca.agent@example.test', 'Bianca', 'Agent'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', null, 'ben.buyer@example.test', 'Ben', 'Buyer');
insert into public.deal_participants (id, deal_id, contact_id, role) values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Buyer Agent'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Client-Buyer');
SQL
psql_super -f "$ROOT/supabase/migrations/20261124100000_scheduling_details.sql"
psql_super <<'SQL'
\set ON_ERROR_STOP on
select set_config('cla.uid', '11111111-1111-1111-1111-111111111111', false);
do $$
begin
  if (select count(*) from public.tasks where template_code = 'agent_schedule_settlement' and title = 'Schedule the Settlement for 10 Oak Lane, Rockville, MD 20850') <> 1 then
    raise exception 'the open file did not get the scheduling task'; end if;
  begin
    perform private.save_side_schedule('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '{"side":"buyer","askParty":false,"date":"","time":"10:00","placeKind":"office","officeId":"off-1"}'::jsonb, 'agent');
    raise exception 'a blank date was saved';
  exception when others then
    if sqlerrm not like '%settlement date%' then raise; end if;
  end;
  perform private.save_side_schedule('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '{"side":"buyer","askParty":false,"date":"2026-12-20","time":"10:00","placeKind":"office","officeId":"off-1","notes":"Buyer is traveling"}'::jsonb, 'agent');
  if (select closing_date from public.deals where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') is not null then
    raise exception 'the file closing date changed'; end if;
  if (select closer_name from public.deals where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') <> 'Kept Closer' then
    raise exception 'the closer from MF-011 changed'; end if;
  if (select sched_buyer_date from public.deals where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') <> date '2026-12-20' then
    raise exception 'the buyer settlement date was not saved'; end if;
  begin
    perform private.save_side_schedule('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '{"side":"buyer","askParty":false,"date":"2026-12-20","time":"18:30","placeKind":"office","officeId":"off-1"}'::jsonb, 'agent');
    raise exception '6:30 PM was accepted';
  exception when others then
    if sqlerrm not like '%9:00 AM%' then raise; end if;
  end;
  begin
    perform private.save_side_schedule('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '{"side":"buyer","askParty":false,"date":"2026-12-20","time":"10:00","placeKind":"ron"}'::jsonb, 'agent');
    raise exception 'buyer remote notarization was accepted';
  exception when others then
    if sqlerrm not like '%seller side%' then raise; end if;
  end;
  perform private.save_side_schedule('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '{"side":"seller","askParty":false,"date":"2026-12-21","time":"18:00","placeKind":"ron"}'::jsonb, 'agent');
  if (select sched_seller_place from public.deals where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') <> 'ron' then
    raise exception 'seller remote notarization was not saved'; end if;
  if (select closing_date from public.deals where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') is not null then
    raise exception 'the file closing date changed after the seller save'; end if;
  perform private.save_side_schedule('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '{"side":"buyer","askParty":true}'::jsonb, 'agent');
  if (select count(*) from public.outbox where from_email = 'testportal@clatitle.com' and status = 'queued' and sent_at is null and to_email = 'ben.buyer@example.test' and body like '%#/schedule-party/%') <> 1 then
    raise exception 'the buyer link was not queued from testportal@clatitle.com'; end if;
  perform public.save_settlement_agent('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Pat Notary', null, true);
  if (select settlement_agent_name from public.deals where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') <> 'Pat Notary'
     or (select settlement_agent_confirmed from public.deals where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') is not true then
    raise exception 'the free-text settlement agent was not confirmed'; end if;
  begin
    perform public.save_settlement_agent('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '', null, true);
    raise exception 'a blank confirmed agent was saved';
  exception when others then
    if sqlerrm not like '%before confirming%' then raise; end if;
  end;
end $$;
SQL
psql_super -f "$ROOT/supabase/rollbacks/20261124100000_scheduling_details.sql"
psql_super -c "select 1 from information_schema.columns where table_name = 'deals' and column_name = 'sched_buyer_date';" | grep -q '(0 rows)'
echo 'scheduling details sql passed'
