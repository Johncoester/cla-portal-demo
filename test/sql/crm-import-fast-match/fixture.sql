-- Scratch schema for the CRM note-match speed check. Local Postgres only.
-- Never point this at hosted TEST or production.

create schema if not exists private;
create schema if not exists extensions;
create schema if not exists auth;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
end $$;

create function auth.uid() returns uuid language sql stable as $$ select '00000000-0000-4000-8000-0000000000aa'::uuid $$;
create function private.is_admin() returns boolean language sql stable as $$ select true $$;
create function private.effective_uid() returns uuid language sql stable as $$ select '00000000-0000-4000-8000-0000000000aa'::uuid $$;
create function private.us_state_ok(p_state text) returns boolean language sql immutable as $$ select p_state = 'MD' $$;
create function private.crm_name(p_id uuid) returns text language sql stable as $$ select null::text $$;
create function private.crm_in_pool(p_id uuid) returns boolean language sql stable as $$ select true $$;

create table public.crm_leads (
  id uuid primary key default gen_random_uuid(),
  first_name text not null default '',
  last_name text not null default '',
  company text not null default '',
  email text not null default '',
  phone text not null default '',
  mobile text not null default '',
  source text not null default '',
  status text not null default 'Prospecting',
  owner_id uuid,
  notes text not null default '',
  converted_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  role_in_company text not null default '',
  title text not null default '',
  license_no text not null default '',
  crm_street text not null default '',
  crm_city text not null default '',
  crm_state text not null default '',
  crm_zip text not null default '',
  crm_county text not null default '',
  links jsonb not null default '{}'::jsonb,
  account_id uuid
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  first_name text not null default '',
  last_name text not null default '',
  email text not null default '',
  phone text not null default '',
  profile_id uuid,
  crm_owner_id uuid,
  crm_lead_id uuid,
  crm_archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  entity text not null,
  entity_id uuid not null,
  kind text not null,
  subject text not null,
  body text not null default '',
  status text not null default 'done'
);

create table public.crm_imports (
  id uuid primary key default gen_random_uuid(),
  module text not null,
  kind text not null,
  file_name text not null default '',
  total integer not null default 0,
  created integer not null default 0,
  duplicates integer not null default 0,
  errors integer not null default 0,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  defaults jsonb not null default '[]'::jsonb
);

create table public.crm_import_rows (
  import_id uuid not null,
  line integer not null,
  status text not null,
  message text not null default '',
  record_id uuid,
  record_name text not null default ''
);

create table public.crm_dup_rules (
  key text primary key,
  enabled boolean not null default true
);

create table public.crm_picklist_options (
  list_key text not null,
  value text not null,
  label text not null,
  retired boolean not null default false
);

create table public.profiles (
  id uuid primary key,
  email text not null default '',
  first_name text not null default '',
  last_name text not null default '',
  status text not null default 'active',
  can_own_crm boolean not null default false
);

create table public.scratch_log (
  label text primary key,
  ms numeric,
  detail jsonb,
  body jsonb,
  plan text
);

create table public.scratch_note_case (
  line int primary key,
  email text not null default '',
  full_name text not null default '',
  note text not null default 'A note',
  expect_status text not null,
  expect_id uuid,
  expect_message text not null default ''
);

insert into public.crm_leads (first_name, last_name, email, phone, status, role_in_company, crm_state, notes, created_at)
select 'Scale', 'Lead ' || g,
       'scale-' || g || '@scale.example.test',
       (9000000000 + g)::text,
       'Prospecting', 'Realtor', 'MD', 'TEST-SEED-SCALE',
       timestamp '2016-01-01' + (g || ' seconds')::interval
from generate_series(1, 110000) g;

-- Same email as an open lead, one older and one newer, both archived.
-- The open row must win even though it is not the earliest or the latest.
insert into public.crm_leads (first_name, last_name, email, phone, notes, archived_at, created_at)
select 'Scale', 'Older ' || g, 'scale-' || g || '@scale.example.test', '', 'TEST-SEED-ARCHIVED',
       timestamp '2011-01-01', timestamp '2010-01-01' + (g || ' seconds')::interval
from generate_series(1, 30) g;

insert into public.crm_leads (first_name, last_name, email, phone, notes, archived_at, created_at)
select 'Scale', 'Newer ' || g, 'scale-' || g || '@scale.example.test', '', 'TEST-SEED-ARCHIVED',
       timestamp '2024-06-01', timestamp '2024-01-01' + (g || ' seconds')::interval
from generate_series(1, 30) g;

insert into public.crm_leads (id, first_name, last_name, email, notes, archived_at, created_at) values
  ('a1111111-1111-4111-8111-111111111111', 'Open', 'Winner', 'open-beats-older@tie.example.test', 'TEST-TIE', null, timestamp '2024-05-01'),
  ('a2222222-2222-4222-8222-222222222222', 'Old', 'Archived', 'open-beats-older@tie.example.test', 'TEST-TIE', timestamp '2012-01-01', timestamp '2008-01-01'),
  ('a3333333-3333-4333-8333-333333333333', 'New', 'Archived', 'open-beats-older@tie.example.test', 'TEST-TIE', timestamp '2025-01-01', timestamp '2025-01-01'),
  ('b1111111-1111-4111-8111-111111111111', 'Early', 'Archived', 'earliest-archived@tie.example.test', 'TEST-TIE', timestamp '2014-01-01', timestamp '2011-06-01'),
  ('b2222222-2222-4222-8222-222222222222', 'Late', 'Archived', 'earliest-archived@tie.example.test', 'TEST-TIE', timestamp '2019-01-01', timestamp '2022-01-01'),
  ('b3333333-3333-4333-8333-333333333333', 'Late', 'Again', 'earliest-archived@tie.example.test', 'TEST-TIE', timestamp '2019-01-01', timestamp '2030-01-01'),
  ('c1111111-1111-4111-8111-111111111111', 'Open', 'Later', 'open-null-created@tie.example.test', 'TEST-TIE', null, timestamp '2030-01-01'),
  ('c2222222-2222-4222-8222-222222222222', 'Old', 'Archived', 'open-null-created@tie.example.test', 'TEST-TIE', timestamp '2001-01-01', timestamp '2000-01-01'),
  ('d1111111-1111-4111-8111-111111111111', 'Mixed', 'Case', 'CaSe@tie.example.test', 'TEST-TIE', null, timestamp '2018-01-01'),
  ('e1111111-1111-4111-8111-111111111111', 'Space', 'Only', ' spaced@tie.example.test', 'TEST-TIE', null, timestamp '2018-02-01'),
  ('f1111111-1111-4111-8111-111111111111', 'Pat', 'Dup', 'pat1@tie.example.test', 'TEST-TIE', null, timestamp '2018-03-01'),
  ('f2222222-2222-4222-8222-222222222222', 'Pat', 'Dup', 'pat2@tie.example.test', 'TEST-TIE', null, timestamp '2018-04-01'),
  ('f3333333-3333-4333-8333-333333333333', 'Solo', 'Person', 'solo@tie.example.test', 'TEST-TIE', null, timestamp '2018-05-01'),
  ('f4444444-4444-4444-8444-444444444444', 'Gone', 'Person', 'gone@tie.example.test', 'TEST-TIE', timestamp '2020-01-01', timestamp '2017-01-01');

insert into public.contacts (id, first_name, last_name, email, crm_archived_at, created_at) values
  ('c1111111-aaaa-4111-8111-111111111111', 'Open', 'Client', 'open-beats-older@client.example.test', null, timestamp '2024-01-01'),
  ('c2222222-aaaa-4222-8222-222222222222', 'Old', 'Client', 'open-beats-older@client.example.test', timestamp '2019-01-01', timestamp '2009-01-01'),
  ('c3333333-aaaa-4333-8333-333333333333', 'Early', 'Client', 'earliest-arch@client.example.test', timestamp '2018-01-01', timestamp '2011-01-01'),
  ('c4444444-aaaa-4444-8444-444444444444', 'Late', 'Client', 'earliest-arch@client.example.test', timestamp '2018-01-01', timestamp '2022-01-01'),
  ('c5555555-aaaa-4555-8555-555555555555', 'Early', 'Client', 'null-created@client.example.test', timestamp '2018-01-01', timestamp '2010-01-01'),
  ('c6666666-aaaa-4666-8666-666666666666', 'Later', 'Client', 'null-created@client.example.test', timestamp '2018-01-01', timestamp '2015-01-01'),
  ('c7777777-aaaa-4777-8777-777777777777', 'Pat', 'Dup', 'pat1@client.example.test', null, timestamp '2018-01-01'),
  ('c8888888-aaaa-4888-8888-888888888888', 'Pat', 'Dup', 'pat2@client.example.test', null, timestamp '2019-01-01'),
  ('c9999999-aaaa-4999-8999-999999999999', 'Solo', 'Client', 'solo@client.example.test', null, timestamp '2018-01-01'),
  ('caaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Gone', 'Client', 'gone@client.example.test', timestamp '2020-01-01', timestamp '2017-01-01');

insert into public.scratch_note_case (line, email, full_name, note, expect_status, expect_id, expect_message)
select g, 'scale-' || g || '@scale.example.test', '', 'Hello ' || g, 'ok', null, ''
from generate_series(1, 470) g;

insert into public.scratch_note_case (line, email, full_name, note, expect_status, expect_id, expect_message) values
  (471, 'open-beats-older@tie.example.test', '', 'Open wins', 'ok', 'a1111111-1111-4111-8111-111111111111', ''),
  (472, 'earliest-archived@tie.example.test', '', 'Early archived', 'ok', 'b1111111-1111-4111-8111-111111111111', ''),
  (473, 'open-null-created@tie.example.test', '', 'Open null created', 'ok', 'c1111111-1111-4111-8111-111111111111', ''),
  (474, '  CaSe@tie.example.test  ', '', 'Trimmed case', 'ok', 'd1111111-1111-4111-8111-111111111111', ''),
  (475, 'spaced@tie.example.test', 'Space Only', 'Name not the spaced stored email', 'ok', 'e1111111-1111-4111-8111-111111111111', ''),
  (476, 'pat1@tie.example.test', 'Pat Dup', 'Email wins over an ambiguous name', 'ok', 'f1111111-1111-4111-8111-111111111111', ''),
  (477, 'missing-pat@tie.example.test', 'Pat Dup', 'Ambiguous with a bad email', 'error', null, '2 leads are named "pat dup"; add the email to pick one.'),
  (478, '', 'Pat Dup', 'Ambiguous name only', 'error', null, '2 leads are named "pat dup"; add the email to pick one.'),
  (479, '', 'Solo Person', 'Name only', 'ok', 'f3333333-3333-4333-8333-333333333333', ''),
  (480, '', '  Solo   Person  ', 'Name with extra spaces', 'ok', 'f3333333-3333-4333-8333-333333333333', ''),
  (481, '', 'Gone Person', 'Archived name', 'ok', 'f4444444-4444-4444-8444-444444444444', ''),
  (482, 'nobody@tie.example.test', 'Nobody Here', 'Neither', 'error', null, 'No lead has the email nobody@tie.example.test or is named "nobody here".'),
  (483, 'nobody2@tie.example.test', '', 'Email only miss', 'error', null, 'No lead has the email nobody2@tie.example.test.'),
  (484, '', '', 'Blank', 'error', null, 'Give the email or the name of the lead for this note.'),
  (485, 'solo@tie.example.test', '', '', 'error', null, 'Note is required.');

do $long$
declare
  raw text := '  ' || repeat('c', 150) || '@long.example.test' || repeat('Z', 80);
  stored text;
begin
  stored := lower(left(btrim(raw), 200));
  insert into public.crm_leads (id, first_name, last_name, email, notes, created_at)
  values ('ab111111-1111-4111-8111-111111111111', 'Long', 'Email', stored, 'TEST-TIE', timestamp '2018-06-01');
  insert into public.scratch_note_case (line, email, full_name, note, expect_status, expect_id, expect_message)
  values (486, raw, '', 'Truncated email', 'ok', 'ab111111-1111-4111-8111-111111111111', '');
end
$long$;

insert into public.scratch_note_case (line, email, full_name, note, expect_status, expect_id, expect_message)
select 486 + g, 'scale-' || (470 + g) || '@scale.example.test', '', 'Hello extra ' || g, 'ok', null, ''
from generate_series(1, 14) g;

update public.scratch_note_case c
set expect_id = l.id
from public.crm_leads l
where c.expect_status = 'ok'
  and c.expect_id is null
  and c.email <> ''
  and l.archived_at is null
  and lower(l.email) = lower(left(btrim(c.email), 200));

create table public.scratch_payload (
  name text primary key,
  rows jsonb
);

insert into public.scratch_payload (name, rows)
select 'notes', jsonb_agg(
  jsonb_build_object(
    'line', line,
    'values', jsonb_strip_nulls(jsonb_build_object(
      'email', nullif(email, ''),
      'fullName', nullif(full_name, ''),
      'note', note,
      'noteTitle', 'Title ' || line
    ))
  ) order by line)
from public.scratch_note_case;

insert into public.scratch_payload (name, rows)
select 'clients', jsonb_build_array(
  jsonb_build_object('line', 1, 'values', jsonb_build_object('email', 'open-beats-older@client.example.test', 'note', 'n', 'noteTitle', 't')),
  jsonb_build_object('line', 2, 'values', jsonb_build_object('email', 'earliest-arch@client.example.test', 'note', 'n', 'noteTitle', 't')),
  jsonb_build_object('line', 3, 'values', jsonb_build_object('email', 'null-created@client.example.test', 'note', 'n', 'noteTitle', 't')),
  jsonb_build_object('line', 4, 'values', jsonb_build_object('email', 'pat1@client.example.test', 'fullName', 'Pat Dup', 'note', 'n', 'noteTitle', 't')),
  jsonb_build_object('line', 5, 'values', jsonb_build_object('email', 'missing@client.example.test', 'fullName', 'Pat Dup', 'note', 'n', 'noteTitle', 't')),
  jsonb_build_object('line', 6, 'values', jsonb_build_object('fullName', 'Solo Client', 'note', 'n', 'noteTitle', 't')),
  jsonb_build_object('line', 7, 'values', jsonb_build_object('fullName', 'Gone Client', 'note', 'n', 'noteTitle', 't')),
  jsonb_build_object('line', 8, 'values', jsonb_build_object('email', 'nobody@client.example.test', 'note', 'n', 'noteTitle', 't')),
  jsonb_build_object('line', 9, 'values', jsonb_build_object('note', 'n', 'noteTitle', 't'))
);

insert into public.scratch_payload (name, rows)
select 'people', jsonb_build_array(
  jsonb_build_object('line', 1, 'values', jsonb_build_object('firstName', 'New', 'lastName', 'Person', 'email', 'brand-new@people.example.test', 'phone', '9100000001', 'roleInCompany', 'Realtor', 'relationshipStatus', 'Prospecting', 'state', 'MD')),
  jsonb_build_object('line', 2, 'values', jsonb_build_object('firstName', 'Dup', 'lastName', 'Person', 'email', 'scale-1@scale.example.test', 'phone', '9100000002', 'roleInCompany', 'Realtor', 'relationshipStatus', 'Prospecting', 'state', 'MD')),
  jsonb_build_object('line', 3, 'values', jsonb_build_object('firstName', 'Bad', 'lastName', 'State', 'email', 'bad-state@people.example.test', 'roleInCompany', 'Realtor', 'relationshipStatus', 'Prospecting', 'state', 'XX')),
  jsonb_build_object('line', 4, 'values', jsonb_build_object('firstName', 'Bad', 'lastName', 'Email', 'email', 'not-an-email', 'roleInCompany', 'Realtor', 'relationshipStatus', 'Prospecting', 'state', 'MD')),
  jsonb_build_object('line', 5, 'values', jsonb_build_object('firstName', 'No', 'lastName', 'Role', 'email', 'no-role@people.example.test', 'relationshipStatus', 'Prospecting', 'state', 'MD'))
);

create unique index crm_leads_open_email_uq on public.crm_leads (lower(email))
  where email <> '' and converted_at is null and archived_at is null;
create index crm_leads_dup_phone_idx on public.crm_leads (regexp_replace(phone, '\D', '', 'g'))
  where converted_at is null and archived_at is null and char_length(regexp_replace(phone, '\D', '', 'g')) >= 7;
create index contacts_dup_phone_idx on public.contacts (regexp_replace(phone, '\D', '', 'g'))
  where crm_archived_at is null and char_length(regexp_replace(phone, '\D', '', 'g')) >= 7;

analyze public.crm_leads;
analyze public.contacts;

do $counts$
begin
  if (select count(*) from public.crm_leads where notes = 'TEST-SEED-SCALE') <> 110000 then
    raise exception 'expected 110000 scale leads';
  end if;
  if (select count(*) from public.scratch_note_case) <> 500 then
    raise exception 'note payload is % rows', (select count(*) from public.scratch_note_case);
  end if;
  if (select count(*) from public.scratch_note_case where expect_status = 'ok' and expect_id is null) <> 0 then
    raise exception 'an ok note row has no expected lead';
  end if;
  if (select jsonb_array_length(rows) from public.scratch_payload where name = 'notes') <> 500 then
    raise exception 'stored note payload is not 500 rows';
  end if;
end
$counts$;
