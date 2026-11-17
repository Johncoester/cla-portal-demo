#!/bin/sh
# MF-058 settlement agent/notary. Disposable database only. Does not connect to TEST.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
DB=cla_sched_agent_$$
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
create table public.outbox (id uuid primary key default gen_random_uuid(), channel text, status text, sent_at timestamptz, to_profile_id uuid, to_email text, to_name text default '', subject text, body text, deal_id uuid, created_by uuid, kind text default '', from_email text, from_name text, sender_type text, title_package boolean not null default false, post_closing_type text);
alter table public.outbox add constraint outbox_recipient_check check (
  ((to_profile_id IS NOT NULL) OR (title_package AND (char_length(to_email) > 3) AND (char_length(to_name) > 0)) OR ((post_closing_type IS NOT NULL) AND (char_length(to_email) > 3))));
insert into public.outbox (channel, status, to_email, to_name, subject, body, kind, post_closing_type)
values ('email', 'queued', 'closer@example.test', '', 'Post closing', 'Copies for the buyer', '', 'buyer_copies');
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
  ('22222222-2222-2222-2222-222222222222', 'Processor', 'active', 'Pat', 'Processor', 'pat.processor@example.test'),
  ('33333333-3333-3333-3333-333333333333', 'Outside user', 'active', 'Larry', 'Listing', 'larry.listing@example.test');
insert into public.deals (id, file_number, street, city, state, zip, status, closing_date, processor_id, closer_name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'MD-26-1', '10 Oak Lane', 'Rockville', 'MD', '20850', 'Open', null, '22222222-2222-2222-2222-222222222222', 'Kept Closer');
insert into public.contacts (id, profile_id, email, first_name, last_name) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'bianca.agent@example.test', 'Bianca', 'Agent'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', null, 'ben.buyer@example.test', 'Ben', 'Buyer'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', null, 'sally.seller@example.test', 'Sally', 'Seller'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '33333333-3333-3333-3333-333333333333', 'larry.listing@example.test', 'Larry', 'Listing');
insert into public.deal_participants (id, deal_id, contact_id, role) values
  ('f1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Buyer Agent'),
  ('f2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Client-Buyer'),
  ('f3333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'Client-Seller'),
  ('f4444444-4444-4444-4444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Listing Agent');
SQL
psql_super -f "$ROOT/supabase/migrations/20261124150000_scheduling_details.sql"
psql_super -f "$ROOT/supabase/migrations/20261124210000_scheduling_agent_notary.sql"
psql_super <<'SQL'
\set ON_ERROR_STOP on
select set_config('cla.uid', '22222222-2222-2222-2222-222222222222', false);
do $$
declare pack jsonb; def text;
begin
  perform public.save_side_settlement_agent('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'buyer', 'Pat Notary', null, '3015550100', 'pat.notary@example.test', true);
  if (select settlement_agent_phone from public.deals where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') <> '301-555-0100' then
    raise exception 'the buyer phone was not stored'; end if;
  if (select settlement_agent_confirmed from public.deals where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') is not true then
    raise exception 'the buyer confirmed flag was not stored'; end if;
  if (select closing_date from public.deals where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') is not null then
    raise exception 'the file closing date changed'; end if;
  if (select closer_name from public.deals where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') <> 'Kept Closer' then
    raise exception 'the closer changed'; end if;
  begin
    perform public.save_side_settlement_agent('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'seller', ' ', null, '', '', true);
    raise exception 'a blank name was confirmed';
  exception when others then
    if sqlerrm not like '%before confirming%' then raise; end if;
  end;
  begin
    perform public.save_side_settlement_agent('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'seller', 'Sam Notary', null, '12', '', false);
    raise exception 'a short phone was stored';
  exception when others then
    if sqlerrm not like '%10-digit%' then raise; end if;
  end;
  begin
    update public.deals set settlement_agent_phone = '202-555-0199' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    raise exception 'a direct phone edit was allowed';
  exception when others then
    if sqlerrm not like '%Scheduling Details%' then raise; end if;
  end;
  if (select settlement_agent_phone from public.deals where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') <> '301-555-0100' then
    raise exception 'the refused phone edit changed the stored phone'; end if;
  pack := public.queue_scheduling_reminder('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'buyer');
  if (select count(*) from public.outbox where subject like 'Reminder: settlement for %' and to_email in ('ben.buyer@example.test', 'bianca.agent@example.test')) <> 2 then
    raise exception 'the buyer reminder did not email the buyer and the buyer agent'; end if;
  if exists (select 1 from public.outbox where subject like 'Reminder: settlement for %' and to_email in ('sally.seller@example.test', 'larry.listing@example.test')) then
    raise exception 'the buyer reminder included a seller'; end if;
  if exists (select 1 from public.outbox where subject like 'Reminder: settlement for %' and (channel <> 'email' or status <> 'queued' or sent_at is not null)) then
    raise exception 'a reminder was not a queued email'; end if;
  perform public.queue_scheduling_reminder('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'seller');
  if (select count(*) from public.outbox where subject like 'Reminder: settlement for %' and to_email in ('sally.seller@example.test', 'larry.listing@example.test')) <> 2 then
    raise exception 'the seller reminder did not email the seller and the listing agent'; end if;
  select pg_get_constraintdef(oid) into def from pg_constraint where conname = 'outbox_recipient_check';
  if def not like '%post_closing_type%' or def not like '%scheduling%' then
    raise exception 'the outbox check lost a condition'; end if;
end $$;
SQL
psql_super -f "$ROOT/supabase/rollbacks/20261124210000_scheduling_agent_notary.sql"
psql_super <<'SQL'
\set ON_ERROR_STOP on
do $$
declare def text;
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deals' and column_name = 'settlement_agent_phone') then
    raise exception 'rollback left the phone column'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deals' and column_name = 'settlement_agent_name') then
    raise exception 'rollback removed the original settlement agent name'; end if;
  if exists (select 1 from public.outbox where subject like 'Reminder: settlement for %') then
    raise exception 'rollback left a reminder row'; end if;
  select pg_get_constraintdef(oid) into def from pg_constraint where conname = 'outbox_recipient_check';
  if def not like '%post_closing_type%' or def not like '%scheduling%' then
    raise exception 'rollback changed the outbox check'; end if;
end $$;
SQL
echo "scheduling agent sql passed"
