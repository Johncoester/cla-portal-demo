-- TEST-only fake CRM rows for templates, mass update, date filters, and overdue tasks.
-- Project: aqcervntopidtcazcmlv (CLA Portal Live Test). Do not run on production.
-- Not a migration. This file lives in supabase/review/ with the other hand-applied
-- TEST scripts. supabase/migrations is what a migration push applies, and this repo
-- has no config seed path, so this script does not run unless a person pastes it
-- into the TEST SQL editor. Do not run it from the app. Nothing here is applied
-- by the commit that adds the file.
--
-- Rows: crm_leads 10, crm_accounts 5, crm_opportunities 5, crm_activities 10.
-- Marker: TEST-SEED-CRM
--   leads: title and notes
--   accounts: website and notes
--   opportunities: name and notes
--   activities: subject and body
-- Title, website, and opportunity name are not mass-update fields, so a Notes
-- mass update does not remove the only copy of the marker.
-- Names are fake (TEST Lead Avery Example). Emails are @example.com.
-- Phones are 555-01xx. Addresses are Example streets in MD, VA, DC, and FL.
-- Owners stay null unless that column is NOT NULL. Then one existing active
-- Sales Person or Sales Team profile is used. No profile is inserted.
-- Dates are Eastern calendar days so Created / Modified filters
-- and overdue task colors have rows in the last 7 days, the last 30 days, and older.
-- last_activity_at is not written and is not required. TEST has no such column
-- on crm_leads, crm_accounts, or crm_opportunities.
-- Idempotent: a second run inserts nothing when the marker counts are already 10/5/5/10.
-- One transaction. lock_timeout 3s, same guard style as the hoist and representation migrations.
-- Rollback: supabase/review/20261109_crm_test_seed_rollback.sql

begin;
set local lock_timeout = '3s';

do $seed$
declare
  today date := (timezone('America/New_York', now()))::date;
  missing text;
  extra text;
  chk text;
  lits text[];
  rel regclass;
  col text;
  val text;
  v_owner uuid;
  v_actor uuid;
  lookup text;
  n int;
  insert_cols text;
  select_cols text;
  have_demo boolean;
  lead_owner_required boolean;
  account_owner_required boolean;
  opp_owner_required boolean;
  activity_owner_required boolean;
  actor_required boolean;
begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.crm_leads') is null
     or to_regclass('public.crm_accounts') is null
     or to_regclass('public.crm_opportunities') is null
     or to_regclass('public.crm_activities') is null then
    raise exception 'refusing: CRM tables or public.profiles are missing. This is not the CLA Portal Live Test schema.';
  end if;

  -- The two staff ids named in the TEST-only staff feedback migration.
  if not exists (
    select 1 from public.profiles
    where id in (
      '149e612a-6e14-4ee1-9890-0f29d6f89156'::uuid,
      'd02722a1-582b-42c0-b3d1-28d25adb758d'::uuid
    )
  ) then
    raise exception 'refusing: this database does not have the CLA Portal Live Test staff profiles (project aqcervntopidtcazcmlv).';
  end if;

  if (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'crm_leads' and column_name = 'id')
     is distinct from 'uuid' then
    raise exception 'refusing: public.crm_leads.id is not uuid.';
  end if;

  select string_agg(need.col, ', ' order by need.col) into missing
  from unnest(array[
    'id', 'first_name', 'last_name', 'company', 'email', 'phone', 'source', 'status', 'notes',
    'role_in_company', 'title', 'contact_type', 'crm_street', 'crm_city', 'crm_state', 'crm_zip', 'crm_county',
    'account_id', 'created_at', 'modified_at'
  ]) as need(col)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'crm_leads' and c.column_name = need.col
  );
  if missing is not null then
    raise exception 'refusing: crm_leads is missing % (portal columns from supabase-crm.js).', missing;
  end if;

  select string_agg(need.col, ', ' order by need.col) into missing
  from unnest(array[
    'id', 'name', 'kind', 'phone', 'website', 'city', 'state', 'notes', 'created_at', 'modified_at'
  ]) as need(col)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'crm_accounts' and c.column_name = need.col
  );
  if missing is not null then
    raise exception 'refusing: crm_accounts is missing % (portal columns from supabase-crm.js).', missing;
  end if;

  select string_agg(need.col, ', ' order by need.col) into missing
  from unnest(array[
    'id', 'name', 'stage', 'notes', 'account_id', 'est_volume', 'expected_close', 'created_at', 'modified_at'
  ]) as need(col)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'crm_opportunities' and c.column_name = need.col
  );
  if missing is not null then
    raise exception 'refusing: crm_opportunities is missing % (portal columns from supabase-crm.js).', missing;
  end if;

  select string_agg(need.col, ', ' order by need.col) into missing
  from unnest(array[
    'id', 'entity', 'entity_id', 'kind', 'subject', 'body', 'status', 'due_date', 'occurred_on', 'priority', 'created_at'
  ]) as need(col)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'crm_activities' and c.column_name = need.col
  );
  if missing is not null then
    raise exception 'refusing: crm_activities is missing % (portal columns from supabase-crm.js).', missing;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'crm_opportunities'
      and column_name = 'contact_id' and is_nullable = 'NO' and column_default is null
      and is_generated = 'NEVER' and is_identity = 'NO'
  ) then
    raise exception 'refusing: crm_opportunities.contact_id is required. This seed links opportunities to companies and does not invent contacts.';
  end if;

  for rel, col, val in
    select * from (values
      ('public.crm_leads'::regclass, 'status', 'Prospecting'),
      ('public.crm_leads'::regclass, 'status', 'Not Interested'),
      ('public.crm_leads'::regclass, 'source', 'Personal Network'),
      ('public.crm_leads'::regclass, 'source', 'Warm Call'),
      ('public.crm_leads'::regclass, 'source', 'Search Engine'),
      ('public.crm_leads'::regclass, 'source', 'Business Group'),
      ('public.crm_leads'::regclass, 'source', 'Existing Client or Agent'),
      ('public.crm_leads'::regclass, 'source', 'Call in/Walk in'),
      ('public.crm_leads'::regclass, 'source', 'Direct Mail'),
      ('public.crm_leads'::regclass, 'source', 'Social Media'),
      ('public.crm_leads'::regclass, 'source', 'Email Campaign'),
      ('public.crm_leads'::regclass, 'source', 'Door Knocking'),
      ('public.crm_leads'::regclass, 'role_in_company', 'Realtor'),
      ('public.crm_leads'::regclass, 'role_in_company', 'Loan Officer'),
      ('public.crm_leads'::regclass, 'role_in_company', 'Transaction Coordinator'),
      ('public.crm_leads'::regclass, 'role_in_company', 'Mortgage Broker'),
      ('public.crm_leads'::regclass, 'role_in_company', 'Team Lead'),
      ('public.crm_leads'::regclass, 'role_in_company', 'Real Estate Broker'),
      ('public.crm_leads'::regclass, 'contact_type', 'realtor'),
      ('public.crm_leads'::regclass, 'contact_type', 'lender'),
      ('public.crm_leads'::regclass, 'crm_state', 'MD'),
      ('public.crm_leads'::regclass, 'crm_state', 'VA'),
      ('public.crm_leads'::regclass, 'crm_state', 'DC'),
      ('public.crm_leads'::regclass, 'crm_state', 'FL'),
      ('public.crm_accounts'::regclass, 'kind', 'brokerage'),
      ('public.crm_accounts'::regclass, 'kind', 'lender'),
      ('public.crm_accounts'::regclass, 'kind', 'other'),
      ('public.crm_accounts'::regclass, 'state', 'MD'),
      ('public.crm_accounts'::regclass, 'state', 'VA'),
      ('public.crm_accounts'::regclass, 'state', 'DC'),
      ('public.crm_accounts'::regclass, 'state', 'FL'),
      ('public.crm_opportunities'::regclass, 'stage', 'New'),
      ('public.crm_opportunities'::regclass, 'stage', 'Meeting set'),
      ('public.crm_opportunities'::regclass, 'stage', 'Proposal'),
      ('public.crm_opportunities'::regclass, 'stage', 'Won'),
      ('public.crm_opportunities'::regclass, 'stage', 'Lost'),
      ('public.crm_activities'::regclass, 'kind', 'task'),
      ('public.crm_activities'::regclass, 'kind', 'note'),
      ('public.crm_activities'::regclass, 'kind', 'email'),
      ('public.crm_activities'::regclass, 'status', 'Not Started'),
      ('public.crm_activities'::regclass, 'status', 'In Progress'),
      ('public.crm_activities'::regclass, 'status', 'Waiting for input'),
      ('public.crm_activities'::regclass, 'status', 'done'),
      ('public.crm_activities'::regclass, 'priority', 'Highest'),
      ('public.crm_activities'::regclass, 'priority', 'High'),
      ('public.crm_activities'::regclass, 'priority', 'Normal'),
      ('public.crm_activities'::regclass, 'priority', 'Low'),
      ('public.crm_activities'::regclass, 'entity', 'lead'),
      ('public.crm_activities'::regclass, 'entity', 'account'),
      ('public.crm_activities'::regclass, 'entity', 'opportunity')
    ) as v(rel, col, val)
  loop
    for chk in
      select pg_get_constraintdef(c.oid)
      from pg_constraint c
      where c.conrelid = rel and c.contype = 'c'
        and pg_get_constraintdef(c.oid) ~* ('\m' || col || '\M')
    loop
      select coalesce(array_agg(distinct m[1]), array[]::text[]) into lits
      from regexp_matches(chk, '''([^'']+)''', 'g') as m;
      if coalesce(cardinality(lits), 0) >= 2 and not (val = any (lits)) then
        raise exception 'refusing: % % check does not allow % (%).', rel::text, col, val, chk;
      end if;
    end loop;
  end loop;

  select
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'crm_leads' and column_name = 'owner_id' and is_nullable = 'NO' and column_default is null and is_generated = 'NEVER'),
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'crm_accounts' and column_name = 'owner_id' and is_nullable = 'NO' and column_default is null and is_generated = 'NEVER'),
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'crm_opportunities' and column_name = 'owner_id' and is_nullable = 'NO' and column_default is null and is_generated = 'NEVER'),
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'crm_activities' and column_name = 'owner_id' and is_nullable = 'NO' and column_default is null and is_generated = 'NEVER')
  into lead_owner_required, account_owner_required, opp_owner_required, activity_owner_required;

  actor_required := exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name in ('crm_leads', 'crm_accounts', 'crm_opportunities', 'crm_activities')
      and column_name in ('created_by', 'modified_by')
      and is_nullable = 'NO' and column_default is null and is_generated = 'NEVER' and is_identity = 'NO'
  );

  have_demo := exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_demo'
  );

  if lead_owner_required or account_owner_required or opp_owner_required or activity_owner_required then
    lookup := 'select p.id from public.profiles p where p.status = ''active'' and p.role in (''Sales Person'', ''Sales Team'')';
    if have_demo then lookup := lookup || ' and coalesce(p.is_demo, false) = false'; end if;
    lookup := lookup || ' order by p.id limit 1';
    execute lookup into v_owner;
    if v_owner is null then
      raise exception 'refusing: an owner is required and no active Sales Person or Sales Team profile exists.';
    end if;
  end if;

  if actor_required then
    lookup := 'select p.id from public.profiles p where p.status = ''active'' and p.role in (''Sales Person'', ''Sales Team'', ''Processor'', ''Preprocessor'', ''Admin'', ''Super admin'', ''Transaction Coordinator'')';
    if have_demo then lookup := lookup || ' and coalesce(p.is_demo, false) = false'; end if;
    lookup := lookup || ' order by p.id limit 1';
    execute lookup into v_actor;
    if v_actor is null then
      raise exception 'refusing: created_by or modified_by is required and no active staff profile exists.';
    end if;
  end if;

  if not (
    ((select count(*) from public.crm_leads where position('TEST-SEED-CRM' in coalesce(title, '') || ' ' || coalesce(notes, '')) > 0) = 0
      and (select count(*) from public.crm_accounts where position('TEST-SEED-CRM' in coalesce(website, '') || ' ' || coalesce(notes, '')) > 0) = 0
      and (select count(*) from public.crm_opportunities where position('TEST-SEED-CRM' in coalesce(name, '') || ' ' || coalesce(notes, '')) > 0) = 0
      and (select count(*) from public.crm_activities where position('TEST-SEED-CRM' in coalesce(subject, '') || ' ' || coalesce(body, '')) > 0) = 0)
    or
    ((select count(*) from public.crm_leads where position('TEST-SEED-CRM' in coalesce(title, '') || ' ' || coalesce(notes, '')) > 0) = 10
      and (select count(*) from public.crm_accounts where position('TEST-SEED-CRM' in coalesce(website, '') || ' ' || coalesce(notes, '')) > 0) = 5
      and (select count(*) from public.crm_opportunities where position('TEST-SEED-CRM' in coalesce(name, '') || ' ' || coalesce(notes, '')) > 0) = 5
      and (select count(*) from public.crm_activities where position('TEST-SEED-CRM' in coalesce(subject, '') || ' ' || coalesce(body, '')) > 0) = 10)
  ) then
    raise exception 'refusing: TEST-SEED-CRM counts are not empty or the full seed (10 leads, 5 companies, 5 opportunities, 10 activities). Roll the seed back before retrying.';
  end if;

  if exists (select 1 from public.crm_leads where id = 'c3e0c3e0-0001-4000-8000-000000000001'::uuid and position('TEST-SEED-CRM' in coalesce(title, '') || ' ' || coalesce(notes, '')) = 0)
     or exists (select 1 from public.crm_accounts where id = 'c3e0c3e0-0002-4000-8000-000000000001'::uuid and position('TEST-SEED-CRM' in coalesce(website, '') || ' ' || coalesce(notes, '')) = 0)
     or exists (select 1 from public.crm_opportunities where id = 'c3e0c3e0-0003-4000-8000-000000000001'::uuid and position('TEST-SEED-CRM' in coalesce(name, '') || ' ' || coalesce(notes, '')) = 0)
     or exists (select 1 from public.crm_activities where id = 'c3e0c3e0-0004-4000-8000-000000000001'::uuid and position('TEST-SEED-CRM' in coalesce(subject, '') || ' ' || coalesce(body, '')) = 0) then
    raise exception 'refusing: a seed id is already used by a row without TEST-SEED-CRM.';
  end if;

  if (select count(*) from public.crm_leads where position('TEST-SEED-CRM' in coalesce(title, '') || ' ' || coalesce(notes, '')) > 0) = 10 then
    null;
  else
    create temp table _crm_seed_accounts (
      id uuid, name text, kind text, phone text, website text, city text, state text, notes text,
      owner_id uuid, created_by uuid, modified_by uuid, created_off int, modified_off int, activity_off int
    ) on commit drop;
    insert into _crm_seed_accounts values
      ('c3e0c3e0-0002-4000-8000-000000000001', 'TEST Company Harbor Example', 'brokerage', '301-555-0111', 'https://example.com/TEST-SEED-CRM/harbor', 'Rockville', 'MD', 'TEST-SEED-CRM fake QA company.', null, null, null, 2, 1, 0),
      ('c3e0c3e0-0002-4000-8000-000000000002', 'TEST Company Potomac Example', 'lender', '703-555-0112', 'https://example.com/TEST-SEED-CRM/potomac', 'Arlington', 'VA', 'TEST-SEED-CRM fake QA company.', null, null, null, 12, 11, 8),
      ('c3e0c3e0-0002-4000-8000-000000000003', 'TEST Company Capitol Example', 'brokerage', '202-555-0113', 'https://example.com/TEST-SEED-CRM/capitol', 'Washington', 'DC', 'TEST-SEED-CRM fake QA company.', null, null, null, 22, 19, 15),
      ('c3e0c3e0-0002-4000-8000-000000000004', 'TEST Company Gulf Example', 'lender', '813-555-0114', 'https://example.com/TEST-SEED-CRM/gulf', 'Tampa', 'FL', 'TEST-SEED-CRM fake QA company.', null, null, null, 50, 40, 36),
      ('c3e0c3e0-0002-4000-8000-000000000005', 'TEST Company Chesapeake Example', 'other', '410-555-0115', 'https://example.com/TEST-SEED-CRM/chesapeake', 'Annapolis', 'MD', 'TEST-SEED-CRM fake QA company.', null, null, null, 100, 80, null);

    create temp table _crm_seed_leads (
      id uuid, first_name text, last_name text, company text, email text, phone text, source text, status text, notes text,
      role_in_company text, title text, contact_type text, crm_street text, crm_city text, crm_state text, crm_zip text, crm_county text,
      account_id uuid, owner_id uuid, created_by uuid, modified_by uuid, created_off int, modified_off int, activity_off int
    ) on commit drop;
    insert into _crm_seed_leads values
      ('c3e0c3e0-0001-4000-8000-000000000001', 'TEST Lead Avery', 'Example', 'TEST Company Harbor Example', 'avery.example@example.com', '301-555-0101', 'Personal Network', 'Prospecting', 'TEST-SEED-CRM fake QA lead.', 'Realtor', 'TEST-SEED-CRM', 'realtor', '101 Example Ave', 'Rockville', 'MD', '20850', 'Montgomery', 'c3e0c3e0-0002-4000-8000-000000000001', null, null, null, 1, 0, 0),
      ('c3e0c3e0-0001-4000-8000-000000000002', 'TEST Lead Blake', 'Example', 'TEST Company Potomac Example', 'blake.example@example.com', '703-555-0102', 'Warm Call', 'Prospecting', 'TEST-SEED-CRM fake QA lead.', 'Loan Officer', 'TEST-SEED-CRM', 'lender', '202 Example St', 'Arlington', 'VA', '22201', 'Arlington', 'c3e0c3e0-0002-4000-8000-000000000002', null, null, null, 3, 2, 1),
      ('c3e0c3e0-0001-4000-8000-000000000003', 'TEST Lead Casey', 'Example', 'TEST Company Capitol Example', 'casey.example@example.com', '202-555-0103', 'Search Engine', 'Not Interested', 'TEST-SEED-CRM fake QA lead.', 'Realtor', 'TEST-SEED-CRM', 'realtor', '303 Example Pl', 'Washington', 'DC', '20001', 'District of Columbia', 'c3e0c3e0-0002-4000-8000-000000000003', null, null, null, 6, 5, 4),
      ('c3e0c3e0-0001-4000-8000-000000000004', 'TEST Lead Drew', 'Example', 'TEST Company Gulf Example', 'drew.example@example.com', '813-555-0104', 'Business Group', 'Prospecting', 'TEST-SEED-CRM fake QA lead.', 'Realtor', 'TEST-SEED-CRM', 'realtor', '404 Example Blvd', 'Tampa', 'FL', '33602', 'Hillsborough', 'c3e0c3e0-0002-4000-8000-000000000004', null, null, null, 10, 9, 8),
      ('c3e0c3e0-0001-4000-8000-000000000005', 'TEST Lead Ellis', 'Example', 'TEST Company Chesapeake Example', 'ellis.example@example.com', '301-555-0105', 'Existing Client or Agent', 'Prospecting', 'TEST-SEED-CRM fake QA lead.', 'Transaction Coordinator', 'TEST-SEED-CRM', 'realtor', '505 Example Rd', 'Bethesda', 'MD', '20814', 'Montgomery', 'c3e0c3e0-0002-4000-8000-000000000005', null, null, null, 20, 16, 14),
      ('c3e0c3e0-0001-4000-8000-000000000006', 'TEST Lead Finley', 'Example', 'TEST Typed Firm Finley Example', 'finley.example@example.com', '703-555-0106', 'Call in/Walk in', 'Not Interested', 'TEST-SEED-CRM fake QA lead.', 'Mortgage Broker', 'TEST-SEED-CRM', 'lender', '606 Example Ln', 'Alexandria', 'VA', '22301', 'Alexandria', null, null, null, null, 28, 21, 18),
      ('c3e0c3e0-0001-4000-8000-000000000007', 'TEST Lead Gray', 'Example', 'TEST Typed Firm Gray Example', 'gray.example@example.com', '202-555-0107', 'Direct Mail', 'Prospecting', 'TEST-SEED-CRM fake QA lead.', 'Team Lead', 'TEST-SEED-CRM', 'realtor', '707 Example Ct', 'Washington', 'DC', '20002', 'District of Columbia', null, null, null, null, 45, 40, 35),
      ('c3e0c3e0-0001-4000-8000-000000000008', 'TEST Lead Harper', 'Example', 'TEST Typed Firm Harper Example', 'harper.example@example.com', '813-555-0108', 'Social Media', 'Prospecting', 'TEST-SEED-CRM fake QA lead.', 'Realtor', 'TEST-SEED-CRM', 'realtor', '808 Example Way', 'Miami', 'FL', '33101', 'Miami-Dade', null, null, null, null, 90, 2, null),
      ('c3e0c3e0-0001-4000-8000-000000000009', 'TEST Lead Indy', 'Example', 'TEST Typed Firm Indy Example', 'indy.example@example.com', '410-555-0109', 'Email Campaign', 'Not Interested', 'TEST-SEED-CRM fake QA lead.', 'Real Estate Broker', 'TEST-SEED-CRM', 'realtor', '909 Example Dr', 'Annapolis', 'MD', '21401', 'Anne Arundel', null, null, null, null, 120, 100, null),
      ('c3e0c3e0-0001-4000-8000-00000000000a', 'TEST Lead Jules', 'Example', 'TEST Typed Firm Jules Example', 'jules.example@example.com', '703-555-0110', 'Door Knocking', 'Prospecting', 'TEST-SEED-CRM fake QA lead.', 'Realtor', 'TEST-SEED-CRM', 'realtor', '111 Example Ter', 'Fairfax', 'VA', '22030', 'Fairfax', null, null, null, null, 0, 0, 0);

    create temp table _crm_seed_opps (
      id uuid, name text, stage text, notes text, account_id uuid, est_volume numeric, expected_close date,
      owner_id uuid, created_by uuid, modified_by uuid, created_off int, modified_off int, activity_off int
    ) on commit drop;
    insert into _crm_seed_opps values
      ('c3e0c3e0-0003-4000-8000-000000000001', 'TEST Opportunity Harbor Example TEST-SEED-CRM', 'New', 'TEST-SEED-CRM fake QA opportunity.', 'c3e0c3e0-0002-4000-8000-000000000001', 2400000, today + 30, null, null, null, 2, 1, 1),
      ('c3e0c3e0-0003-4000-8000-000000000002', 'TEST Opportunity Potomac Example TEST-SEED-CRM', 'Meeting set', 'TEST-SEED-CRM fake QA opportunity.', 'c3e0c3e0-0002-4000-8000-000000000002', 900000, today + 45, null, null, null, 11, 9, 8),
      ('c3e0c3e0-0003-4000-8000-000000000003', 'TEST Opportunity Capitol Example TEST-SEED-CRM', 'Proposal', 'TEST-SEED-CRM fake QA opportunity.', 'c3e0c3e0-0002-4000-8000-000000000003', 1500000, today + 60, null, null, null, 21, 18, 15),
      ('c3e0c3e0-0003-4000-8000-000000000004', 'TEST Opportunity Gulf Example TEST-SEED-CRM', 'Won', 'TEST-SEED-CRM fake QA opportunity.', 'c3e0c3e0-0002-4000-8000-000000000004', 600000, today - 10, null, null, null, 48, 30, 36),
      ('c3e0c3e0-0003-4000-8000-000000000005', 'TEST Opportunity Chesapeake Example TEST-SEED-CRM', 'Lost', 'TEST-SEED-CRM fake QA opportunity.', 'c3e0c3e0-0002-4000-8000-000000000005', 400000, today - 40, null, null, null, 95, 60, null);

    create temp table _crm_seed_activities (
      id uuid, entity text, entity_id uuid, kind text, subject text, body text, status text, priority text,
      due_date date, occurred_on date, owner_id uuid, created_by uuid, modified_by uuid, created_off int
    ) on commit drop;
    insert into _crm_seed_activities values
      ('c3e0c3e0-0004-4000-8000-000000000001', 'lead', 'c3e0c3e0-0001-4000-8000-000000000001', 'task', 'TEST-SEED-CRM task due yesterday', 'TEST-SEED-CRM fake QA activity. Nothing was sent.', 'Not Started', 'High', today - 1, null, null, null, null, 0),
      ('c3e0c3e0-0004-4000-8000-000000000002', 'lead', 'c3e0c3e0-0001-4000-8000-000000000002', 'task', 'TEST-SEED-CRM task due ten days ago', 'TEST-SEED-CRM fake QA activity. Nothing was sent.', 'In Progress', 'Highest', today - 10, null, null, null, null, 1),
      ('c3e0c3e0-0004-4000-8000-000000000003', 'account', 'c3e0c3e0-0002-4000-8000-000000000001', 'task', 'TEST-SEED-CRM task due today', 'TEST-SEED-CRM fake QA activity. Nothing was sent.', 'Not Started', 'Normal', today, null, null, null, null, 0),
      ('c3e0c3e0-0004-4000-8000-000000000004', 'opportunity', 'c3e0c3e0-0003-4000-8000-000000000002', 'task', 'TEST-SEED-CRM task due in five days', 'TEST-SEED-CRM fake QA activity. Nothing was sent.', 'Not Started', 'Low', today + 5, null, null, null, null, 8),
      ('c3e0c3e0-0004-4000-8000-000000000005', 'lead', 'c3e0c3e0-0001-4000-8000-000000000003', 'task', 'TEST-SEED-CRM task due three days ago', 'TEST-SEED-CRM fake QA activity. Nothing was sent.', 'Waiting for input', 'High', today - 3, null, null, null, null, 4),
      ('c3e0c3e0-0004-4000-8000-000000000006', 'lead', 'c3e0c3e0-0001-4000-8000-000000000004', 'note', 'TEST-SEED-CRM note eight days ago', 'TEST-SEED-CRM fake QA activity. Nothing was sent.', 'done', null, null, today - 8, null, null, null, 8),
      ('c3e0c3e0-0004-4000-8000-000000000007', 'lead', 'c3e0c3e0-0001-4000-8000-000000000005', 'email', 'TEST-SEED-CRM email logged fourteen days ago', 'TEST-SEED-CRM fake QA activity. Nothing was sent.', 'done', null, null, today - 14, null, null, null, 14),
      ('c3e0c3e0-0004-4000-8000-000000000008', 'lead', 'c3e0c3e0-0001-4000-8000-000000000006', 'note', 'TEST-SEED-CRM note eighteen days ago', 'TEST-SEED-CRM fake QA activity. Nothing was sent.', 'done', null, null, today - 18, null, null, null, 18),
      ('c3e0c3e0-0004-4000-8000-000000000009', 'lead', 'c3e0c3e0-0001-4000-8000-000000000007', 'note', 'TEST-SEED-CRM note thirty-five days ago', 'TEST-SEED-CRM fake QA activity. Nothing was sent.', 'done', null, null, today - 35, null, null, null, 35),
      ('c3e0c3e0-0004-4000-8000-00000000000a', 'lead', 'c3e0c3e0-0001-4000-8000-00000000000a', 'note', 'TEST-SEED-CRM note from today', 'TEST-SEED-CRM fake QA activity. Nothing was sent.', 'done', null, null, today, null, null, null, 0);

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'crm_leads' and column_name = 'account_id' and is_nullable = 'NO'
    ) then
      update _crm_seed_leads set account_id = 'c3e0c3e0-0002-4000-8000-000000000001' where account_id is null;
    end if;
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'crm_activities' and column_name = 'due_date' and is_nullable = 'NO'
    ) then
      update _crm_seed_activities set due_date = coalesce(due_date, occurred_on, today) where due_date is null;
    end if;
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'crm_activities' and column_name = 'occurred_on' and is_nullable = 'NO'
    ) then
      update _crm_seed_activities set occurred_on = coalesce(occurred_on, due_date, today) where occurred_on is null;
    end if;
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'crm_activities' and column_name = 'priority' and is_nullable = 'NO'
    ) then
      update _crm_seed_activities set priority = 'Normal' where priority is null;
    end if;

    if lead_owner_required then update _crm_seed_leads set owner_id = v_owner; end if;
    if account_owner_required then update _crm_seed_accounts set owner_id = v_owner; end if;
    if opp_owner_required then update _crm_seed_opps set owner_id = v_owner; end if;
    if activity_owner_required then update _crm_seed_activities set owner_id = v_owner; end if;
    if actor_required then
      update _crm_seed_leads set created_by = v_actor, modified_by = v_actor;
      update _crm_seed_accounts set created_by = v_actor, modified_by = v_actor;
      update _crm_seed_opps set created_by = v_actor, modified_by = v_actor;
      update _crm_seed_activities set created_by = v_actor, modified_by = v_actor;
    end if;

    select string_agg(c.column_name, ', ' order by c.column_name) into extra
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'crm_accounts'
      and c.is_nullable = 'NO' and c.column_default is null and coalesce(c.is_generated, 'NEVER') = 'NEVER' and coalesce(c.is_identity, 'NO') = 'NO'
      and c.column_name not in ('id', 'name', 'kind', 'phone', 'website', 'city', 'state', 'notes', 'created_at', 'modified_at', 'owner_id', 'created_by', 'modified_by');
    if extra is not null then
      raise exception 'refusing: crm_accounts has required columns this seed does not fill: %', extra;
    end if;
    select string_agg(c.column_name, ', ' order by c.column_name) into extra
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'crm_leads'
      and c.is_nullable = 'NO' and c.column_default is null and coalesce(c.is_generated, 'NEVER') = 'NEVER' and coalesce(c.is_identity, 'NO') = 'NO'
      and c.column_name not in (
        'id', 'first_name', 'last_name', 'company', 'email', 'phone', 'source', 'status', 'notes',
        'role_in_company', 'title', 'contact_type', 'crm_street', 'crm_city', 'crm_state', 'crm_zip', 'crm_county',
        'account_id', 'created_at', 'modified_at', 'owner_id', 'created_by', 'modified_by'
      );
    if extra is not null then
      raise exception 'refusing: crm_leads has required columns this seed does not fill: %', extra;
    end if;
    select string_agg(c.column_name, ', ' order by c.column_name) into extra
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'crm_opportunities'
      and c.is_nullable = 'NO' and c.column_default is null and coalesce(c.is_generated, 'NEVER') = 'NEVER' and coalesce(c.is_identity, 'NO') = 'NO'
      and c.column_name not in ('id', 'name', 'stage', 'notes', 'account_id', 'est_volume', 'expected_close', 'created_at', 'modified_at', 'owner_id', 'created_by', 'modified_by');
    if extra is not null then
      raise exception 'refusing: crm_opportunities has required columns this seed does not fill: %', extra;
    end if;
    select string_agg(c.column_name, ', ' order by c.column_name) into extra
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'crm_activities'
      and c.is_nullable = 'NO' and c.column_default is null and coalesce(c.is_generated, 'NEVER') = 'NEVER' and coalesce(c.is_identity, 'NO') = 'NO'
      and c.column_name not in ('id', 'entity', 'entity_id', 'kind', 'subject', 'body', 'status', 'priority', 'due_date', 'occurred_on', 'created_at', 'modified_at', 'owner_id', 'created_by', 'modified_by');
    if extra is not null then
      raise exception 'refusing: crm_activities has required columns this seed does not fill: %', extra;
    end if;

    -- User triggers are paused only so historical created/modified
    -- timestamps are stored. Foreign keys stay on. Triggers are turned back on
    -- before the readback, and a rollback restores them if this script stops.
    alter table public.crm_accounts disable trigger user;
    alter table public.crm_leads disable trigger user;
    alter table public.crm_opportunities disable trigger user;
    alter table public.crm_activities disable trigger user;

    select string_agg(quote_ident(col), ', ' order by col), string_agg('src.' || quote_ident(col), ', ' order by col)
      into insert_cols, select_cols
    from unnest(array['id', 'name', 'kind', 'phone', 'website', 'city', 'state', 'notes', 'owner_id', 'created_by', 'modified_by', 'created_at', 'modified_at']) as col
    where exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'crm_accounts' and c.column_name = col and c.is_generated = 'NEVER'
    );
    execute 'insert into public.crm_accounts (' || insert_cols || ') select ' || select_cols || ' from ('
      || 'select id, name, kind, phone, website, city, state, notes, owner_id, created_by, modified_by, '
      || 'timezone(''America/New_York'', ($1::date - created_off) + time ''15:00'') as created_at, '
      || 'timezone(''America/New_York'', ($1::date - modified_off) + time ''15:00'') as modified_at '
      || 'from _crm_seed_accounts) src'
      using today;

    select string_agg(quote_ident(col), ', ' order by col), string_agg('src.' || quote_ident(col), ', ' order by col)
      into insert_cols, select_cols
    from unnest(array[
      'id', 'first_name', 'last_name', 'company', 'email', 'phone', 'source', 'status', 'notes',
      'role_in_company', 'title', 'contact_type', 'crm_street', 'crm_city', 'crm_state', 'crm_zip', 'crm_county',
      'account_id', 'owner_id', 'created_by', 'modified_by', 'created_at', 'modified_at'
    ]) as col
    where exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'crm_leads' and c.column_name = col and c.is_generated = 'NEVER'
    );
    execute 'insert into public.crm_leads (' || insert_cols || ') select ' || select_cols || ' from ('
      || 'select id, first_name, last_name, company, email, phone, source, status, notes, role_in_company, title, contact_type, '
      || 'crm_street, crm_city, crm_state, crm_zip, crm_county, account_id, owner_id, created_by, modified_by, '
      || 'timezone(''America/New_York'', ($1::date - created_off) + time ''15:00'') as created_at, '
      || 'timezone(''America/New_York'', ($1::date - modified_off) + time ''15:00'') as modified_at '
      || 'from _crm_seed_leads) src'
      using today;

    select string_agg(quote_ident(col), ', ' order by col), string_agg('src.' || quote_ident(col), ', ' order by col)
      into insert_cols, select_cols
    from unnest(array['id', 'name', 'stage', 'notes', 'account_id', 'est_volume', 'expected_close', 'owner_id', 'created_by', 'modified_by', 'created_at', 'modified_at']) as col
    where exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'crm_opportunities' and c.column_name = col and c.is_generated = 'NEVER'
    );
    execute 'insert into public.crm_opportunities (' || insert_cols || ') select ' || select_cols || ' from ('
      || 'select id, name, stage, notes, account_id, est_volume, expected_close, owner_id, created_by, modified_by, '
      || 'timezone(''America/New_York'', ($1::date - created_off) + time ''15:00'') as created_at, '
      || 'timezone(''America/New_York'', ($1::date - modified_off) + time ''15:00'') as modified_at '
      || 'from _crm_seed_opps) src'
      using today;

    select string_agg(quote_ident(col), ', ' order by col), string_agg('src.' || quote_ident(col), ', ' order by col)
      into insert_cols, select_cols
    from unnest(array['id', 'entity', 'entity_id', 'kind', 'subject', 'body', 'status', 'priority', 'due_date', 'occurred_on', 'owner_id', 'created_by', 'modified_by', 'created_at', 'modified_at']) as col
    where exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'crm_activities' and c.column_name = col and c.is_generated = 'NEVER'
    );
    execute 'insert into public.crm_activities (' || insert_cols || ') select ' || select_cols || ' from ('
      || 'select id, entity, entity_id, kind, subject, body, status, priority, due_date, occurred_on, owner_id, created_by, modified_by, '
      || 'timezone(''America/New_York'', ($1::date - created_off) + time ''15:00'') as created_at, '
      || 'timezone(''America/New_York'', ($1::date - created_off) + time ''15:00'') as modified_at '
      || 'from _crm_seed_activities) src'
      using today;

    alter table public.crm_activities enable trigger user;
    alter table public.crm_opportunities enable trigger user;
    alter table public.crm_leads enable trigger user;
    alter table public.crm_accounts enable trigger user;
  end if;

  if (select count(*) from public.crm_leads where position('TEST-SEED-CRM' in coalesce(title, '')) > 0 and email ~ '@example\.com$' and phone like '%555-01%') <> 10 then
    raise exception 'readback: expected 10 TEST-SEED-CRM leads with example.com emails and 555-01 phones.';
  end if;
  if (select count(*) from public.crm_accounts where position('TEST-SEED-CRM' in coalesce(website, '')) > 0 and phone like '%555-01%') <> 5 then
    raise exception 'readback: expected 5 TEST-SEED-CRM companies.';
  end if;
  if (select count(*) from public.crm_opportunities o
      join public.crm_accounts a on a.id = o.account_id
      where position('TEST-SEED-CRM' in o.name) > 0 and position('TEST-SEED-CRM' in coalesce(a.website, '')) > 0) <> 5 then
    raise exception 'readback: expected 5 TEST-SEED-CRM opportunities linked to seed companies.';
  end if;
  if (select count(*) from public.crm_activities where position('TEST-SEED-CRM' in coalesce(body, '')) > 0) <> 10 then
    raise exception 'readback: expected 10 TEST-SEED-CRM activities.';
  end if;
  if (select count(*) from public.crm_leads where position('TEST-SEED-CRM' in coalesce(title, '')) > 0 and (created_at at time zone 'America/New_York')::date between today - 7 and today) < 3
     or (select count(*) from public.crm_leads where position('TEST-SEED-CRM' in coalesce(title, '')) > 0 and (created_at at time zone 'America/New_York')::date between today - 30 and today - 8) < 2
     or (select count(*) from public.crm_leads where position('TEST-SEED-CRM' in coalesce(title, '')) > 0 and (created_at at time zone 'America/New_York')::date < today - 30) < 2
     or (select count(*) from public.crm_leads where position('TEST-SEED-CRM' in coalesce(title, '')) > 0 and (modified_at at time zone 'America/New_York')::date between today - 7 and today) < 2 then
    raise exception 'readback: lead created and modified dates are not spread across 7 days, 30 days, and older.';
  end if;
  if (select count(*) from public.crm_activities where position('TEST-SEED-CRM' in coalesce(body, '')) > 0 and kind = 'task' and status not in ('Completed', 'done') and due_date < today) < 2
     or (select count(*) from public.crm_activities where position('TEST-SEED-CRM' in coalesce(body, '')) > 0 and kind = 'task' and status not in ('Completed', 'done') and due_date = today) < 1
     or (select count(*) from public.crm_activities where position('TEST-SEED-CRM' in coalesce(body, '')) > 0 and kind = 'task' and status not in ('Completed', 'done') and due_date > today) < 1 then
    raise exception 'readback: open tasks are missing a past, today, or future due date.';
  end if;
end
$seed$;

commit;
