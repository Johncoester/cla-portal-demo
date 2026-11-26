-- CRM-FEED-1 checks. Disposable local Postgres only.
\set ON_ERROR_STOP 1
create or replace function pg_temp.ok(c boolean, m text) returns void language plpgsql as $$
begin if c is not true then raise exception 'FAIL %', m; end if; raise notice 'ok %', m; end $$;
create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', p::text, false); end $$;

-- ===== portal orders, made by a normal (authenticated) user =====
select pg_temp.as_user('00000000-0000-4000-8000-000000000001');
set role authenticated;
insert into public.contacts (id, first_name, last_name, email) values
  ('10000000-0000-4000-8000-000000000001', 'Ann', 'Test', 'ann@example.test'),
  ('10000000-0000-4000-8000-000000000002', 'Bob', 'Sample', 'bob@example.test'),
  ('10000000-0000-4000-8000-000000000003', 'Dee', 'Twice', 'dee@example.test');
insert into public.deals (id, file_number, street, city, state) values
  ('20000000-0000-4000-8000-000000000001', 'FL-26-1000', '12 Oak Street', 'Miami', 'FL'),
  ('20000000-0000-4000-8000-000000000002', 'FL-26-1001', '45 North Elm Avenue', 'Tampa', 'FL'),
  ('20000000-0000-4000-8000-000000000003', 'FL-26-1002', '7 Twin Court', 'Orlando', 'FL'),
  ('20000000-0000-4000-8000-000000000004', 'FL-26-1003', '7 Twin Ct.', 'Orlando', 'FL');
insert into public.deal_participants (deal_id, contact_id, role) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Client-Buyer'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'Client-Seller'),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'Client-Buyer'),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000003', 'Client-Buyer');
reset role;
select pg_temp.ok((select count(*) from public.crm_imported_deals) = 0, 'orders alone create no imported rows (an order is already the CRM deal)');

-- ===== keys =====
select pg_temp.ok(private.crm_addr_key('45 N. Elm  Ave', ' tampa ', 'fl') = private.crm_addr_key('45 North Elm Avenue', 'Tampa', 'FL'), 'address key: case, spaces, dots, suffix and direction');
select pg_temp.ok(private.crm_file_key(' fl-26-1000 ') = 'FL-26-1000', 'file key: trim and upper case');
select pg_temp.ok(private.crm_addr_key('', 'Miami', 'FL') = '', 'blank street gives no address key');

-- ===== reverse: import matches existing orders =====
select pg_temp.as_user('00000000-0000-4000-8000-000000000001');
set role authenticated;
create temp table rows1 as select '[
  {"zohoId": "Z1", "name": "Oak deal", "fileNumber": " fl-26-1000 ", "street": "somewhere else", "city": "X", "state": "FL", "clientName": "Nobody"},
  {"zohoId": "Z2", "street": "45 N. Elm Ave", "city": "tampa", "state": "fl", "clientName": "Bob  Sample", "amount": "$350,000", "closingDate": "12/15/2026", "stage": "Closed Won"},
  {"zohoId": "Z3", "street": "1 Nowhere Lane", "city": "Miami", "state": "FL", "clientName": "Ann Test"},
  {"zohoId": "Z4", "street": "7 Twin Court", "city": "Orlando", "state": "FL", "clientEmail": "DEE@example.test"},
  {"zohoId": "Z5", "street": "", "fileNumber": "", "clientName": "Bad Row"}
]'::jsonb as r;
-- preview saves nothing
create temp table p1 as select public.crm_import_deals(false, 'zoho.csv', (select r from rows1)) as x;
select pg_temp.ok((select count(*) from public.crm_imported_deals_list() l, jsonb_array_elements(l) e) = 0, 'preview saves nothing');
select pg_temp.ok((select (x->'counts'->>'linked')::int from p1) = 2, 'preview reports 2 links');
create temp table c1 as select public.crm_import_deals(true, 'zoho.csv', (select r from rows1)) as x;
reset role;
select pg_temp.ok((select deal_id from public.crm_imported_deals where zoho_id = 'Z1') = '20000000-0000-4000-8000-000000000001', 'file-number match links Z1 to FL-26-1000 even with a different address');
select pg_temp.ok((select deal_id from public.crm_imported_deals where zoho_id = 'Z2') = '20000000-0000-4000-8000-000000000002', 'address + client match links Z2');
select pg_temp.ok((select amount = 350000 and closing_date = date '2026-12-15' from public.crm_imported_deals where zoho_id = 'Z2'), 'amount and date parsed');
select pg_temp.ok((select deal_id is null and match_status = 'unmatched' from public.crm_imported_deals where zoho_id = 'Z3'), 'no match: Z3 imported unlinked');
select pg_temp.ok((select deal_id is null and match_status = 'ambiguous' from public.crm_imported_deals where zoho_id = 'Z4'), 'ambiguous: two orders match Z4, nothing linked, row flagged');
select pg_temp.ok((select count(*) from public.crm_imported_deals where zoho_id = 'Z5') = 0, 'row with no file number and no street is an error, not saved');
select pg_temp.ok((select x->'counts' from c1) = '{"total": 5, "created": 4, "linked": 2, "ambiguous": 1, "duplicates": 0, "errors": 1}'::jsonb, 'import counts');

-- ===== idempotent re-run =====
select pg_temp.as_user('00000000-0000-4000-8000-000000000001');
set role authenticated;
create temp table c2 as select public.crm_import_deals(true, 'zoho.csv', (select r from rows1)) as x;
reset role;
select pg_temp.ok((select count(*) from public.crm_imported_deals) = 4, 're-run adds no rows');
select pg_temp.ok((select (x->'counts'->>'duplicates')::int = 4 and (x->'counts'->>'created')::int = 0 from c2), 're-run reports 4 duplicates');
-- the same row twice in one file is one row
select pg_temp.as_user('00000000-0000-4000-8000-000000000001');
set role authenticated;
create temp table c3 as select public.crm_import_deals(true, 'z2.csv', '[{"fileNumber": "FL-26-5555", "street": "3 Future Way", "city": "Miami", "state": "FL"}, {"fileNumber": "fl-26-5555"}]'::jsonb) as x;
reset role;
select pg_temp.ok((select (x->'counts'->>'duplicates')::int = 1 and (x->'counts'->>'created')::int = 1 from c3), 'same file number twice in one file: second is a duplicate');

-- ===== forward: a new order links to a waiting imported deal =====
select pg_temp.as_user('00000000-0000-4000-8000-000000000001');
set role authenticated;
insert into public.deals (id, file_number, street, city, state) values ('20000000-0000-4000-8000-000000000005', 'FL-26-5555', '99 Other St', 'Miami', 'FL');
reset role;
select pg_temp.ok((select deal_id from public.crm_imported_deals where file_key = 'FL-26-5555') = '20000000-0000-4000-8000-000000000005', 'forward file-number match on order insert');
-- address + client: the row waits until the client party is added
select pg_temp.as_user('00000000-0000-4000-8000-000000000001');
set role authenticated;
select public.crm_import_deals(true, 'z3.csv', '[{"zohoId": "Z9", "street": "9 Pine Rd", "city": "Naples", "state": "FL", "clientName": "Cara Demo"}]'::jsonb);
insert into public.contacts (id, first_name, last_name, email) values ('10000000-0000-4000-8000-000000000009', 'Cara', 'Demo', 'cara@example.test');
insert into public.deals (id, street, city, state) values ('20000000-0000-4000-8000-000000000009', '9 Pine Road', 'Naples', 'FL');
reset role;
select pg_temp.ok((select deal_id is null from public.crm_imported_deals where zoho_id = 'Z9'), 'address alone (no client yet) does not link');
set role authenticated;
insert into public.deal_participants (deal_id, contact_id, role) values ('20000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000009', 'Client-Buyer');
reset role;
select pg_temp.ok((select deal_id from public.crm_imported_deals where zoho_id = 'Z9') = '20000000-0000-4000-8000-000000000009', 'forward address + client match when the client is added');
-- forward ambiguous: two waiting rows (different, unused file numbers) share the address and client
set role authenticated;
select public.crm_import_deals(true, 'z4.csv', '[{"zohoId": "ZA", "fileNumber": "Q-1", "street": "5 Bay Dr", "city": "Naples", "state": "FL", "clientName": "Eve Pair"},
                                                  {"zohoId": "ZB", "fileNumber": "Q-2", "street": "5 Bay Drive", "city": "Naples", "state": "FL", "clientName": "Eve Pair"}]'::jsonb);
insert into public.contacts (id, first_name, last_name, email) values ('10000000-0000-4000-8000-00000000000e', 'Eve', 'Pair', 'eve@example.test');
insert into public.deals (id, street, city, state) values ('20000000-0000-4000-8000-00000000000e', '5 Bay Drive', 'Naples', 'FL');
insert into public.deal_participants (deal_id, contact_id, role) values ('20000000-0000-4000-8000-00000000000e', '10000000-0000-4000-8000-00000000000e', 'Client-Buyer');
reset role;
select pg_temp.ok((select count(*) from public.crm_imported_deals where zoho_id in ('ZA', 'ZB') and deal_id is null and match_status = 'ambiguous') = 2, 'forward ambiguous: neither row linked, both flagged');
select pg_temp.ok(exists (select 1 from public.deals where id = '20000000-0000-4000-8000-00000000000e'), 'forward ambiguous: the order is still saved');

-- ===== idempotent forward: re-running the link changes nothing =====
create temp table snap as select id, deal_id, match_status from public.crm_imported_deals;
select private.crm_imported_deal_link(id) from public.deals;
select pg_temp.ok(not exists (select 1 from public.crm_imported_deals z join snap s using (id) where z.deal_id is distinct from s.deal_id or z.match_status <> s.match_status), 'relinking every order is a no-op');
select pg_temp.ok((select count(*) from public.crm_imported_deals where deal_id is not null) = (select count(distinct deal_id) from public.crm_imported_deals where deal_id is not null), 'one imported deal per order at most');

-- ===== demo scope =====
select pg_temp.as_user('00000000-0000-4000-8000-000000000003');
set role authenticated;
create temp table cd as select public.crm_import_deals(true, 'demo.csv', '[{"fileNumber": "FL-26-1001"}]'::jsonb) as x;
select pg_temp.ok((select jsonb_array_length(public.crm_imported_deals_list())) = 1, 'demo admin sees only demo imported rows');
reset role;
select pg_temp.ok((select deal_id is null and is_demo from public.crm_imported_deals where file_key = 'FL-26-1001'), 'demo import never links to a non-demo order');

-- ===== access =====
select pg_temp.as_user('00000000-0000-4000-8000-000000000002');
set role authenticated;
do $$ begin perform public.crm_import_deals(false, 'x', '[]'::jsonb); raise exception 'FAIL Sales Person could import'; exception when insufficient_privilege then raise notice 'ok Sales Person cannot import'; end $$;
do $$ begin perform count(*) from public.crm_imported_deals; raise exception 'FAIL table readable'; exception when insufficient_privilege then raise notice 'ok table not readable directly'; end $$;
select pg_temp.ok((select jsonb_array_length(public.crm_imported_deals_list())) = 0, 'Sales Person with no orders sees no imported rows');
reset role;
insert into public.deal_sales_people values ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002');
set role authenticated;
select pg_temp.ok((select jsonb_array_length(public.crm_imported_deals_list())) = 1, 'Sales Person sees the row linked to their order only');
reset role;
select pg_temp.ok(not has_function_privilege('anon', 'public.crm_import_deals(boolean,text,jsonb,uuid)', 'execute'), 'anon cannot import');
select pg_temp.ok(not has_function_privilege('anon', 'public.crm_imported_deals_list()', 'execute'), 'anon cannot list');
select pg_temp.ok(not has_function_privilege('authenticated', 'private.crm_imported_deal_link(uuid)', 'execute'), 'link helper not callable');
select pg_temp.ok(not has_table_privilege('authenticated', 'public.crm_imported_deals', 'select'), 'no table grant');

-- ===== a CRM failure never blocks an order =====
begin;
create or replace function private.crm_imported_deal_link(p_deal uuid) returns text language plpgsql security definer as $$ begin raise exception 'boom'; end $$;
select pg_temp.as_user('00000000-0000-4000-8000-000000000001');
set local role authenticated;
insert into public.deals (id, file_number, street, city, state) values ('20000000-0000-4000-8000-0000000000ff', 'FL-26-7777', '1 Safe St', 'Miami', 'FL');
insert into public.deal_participants (deal_id, contact_id, role) values ('20000000-0000-4000-8000-0000000000ff', '10000000-0000-4000-8000-000000000001', 'Client-Buyer');
reset role;
select pg_temp.ok(exists (select 1 from public.deals where id = '20000000-0000-4000-8000-0000000000ff'), 'order and party saved even when the CRM link raises');
rollback;

-- ===== deleting a linked order is not blocked =====
begin;
delete from public.deals where id = '20000000-0000-4000-8000-000000000001';
select pg_temp.ok((select deal_id is null from public.crm_imported_deals where zoho_id = 'Z1'), 'deleting an order unlinks its imported deal');
rollback;

-- ===== index use =====
set enable_seqscan = off;
do $$ declare t text := ''; l text; begin
  for l in execute 'explain select id from public.deals g where private.crm_addr_key(g.street, g.city, g.state) = ''x|y|FL''' loop t := t || l || ' '; end loop;
  if t not like '%deals_crm_addr_key_idx%' then raise exception 'FAIL address lookup does not use the index: %', t; end if; raise notice 'ok address lookup uses deals_crm_addr_key_idx';
  t := '';
  for l in execute 'explain select id from public.crm_imported_deals z where z.deal_id is null and z.file_key = ''FL-1''' loop t := t || l || ' '; end loop;
  if t like '%Seq Scan%' then raise exception 'FAIL file lookup scans the table: %', t; end if; raise notice 'ok open file lookup is an index scan';
end $$;
reset enable_seqscan;
\echo CHECKS-DONE
