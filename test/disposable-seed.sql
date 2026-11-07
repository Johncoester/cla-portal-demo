-- Fake parties only. Loaded before the owner backfill.

insert into public.profiles (id, email, first_name, last_name, role, status, is_demo) values
  ('11111111-1111-1111-1111-111111111111', 'paula@example.test', 'Paula', 'Processor', 'Processor', 'active', false),
  ('22222222-2222-2222-2222-222222222222', 'sam@example.test', 'Sam', 'Sales', 'Sales Person', 'active', false),
  ('33333333-3333-3333-3333-333333333333', 'terry@example.test', 'Terry', 'Coordinator', 'Transaction Coordinator', 'active', false),
  ('44444444-4444-4444-4444-444444444444', 'larry@example.test', 'Larry', 'Listing', 'Outside user', 'active', false),
  ('55555555-5555-5555-5555-555555555555', 'bianca@example.test', 'Bianca', 'Buyer', 'Outside user', 'active', false),
  ('66666666-6666-6666-6666-666666666666', 'sally@example.test', 'Sally', 'Seller', 'Outside user', 'active', false),
  ('77777777-7777-7777-7777-777777777777', 'disabled@example.test', 'Dee', 'Disabled', 'Outside user', 'disabled', false),
  ('88888888-8888-8888-8888-888888888888', 'demo@example.test', 'Dana', 'Demo', 'Outside user', 'active', true);

insert into public.contacts (id, profile_id, first_name, last_name, email) values
  ('c1111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 'Larry', 'Listing', 'larry@example.test'),
  ('c2222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555555', 'Bianca', 'Buyer', 'bianca@example.test'),
  ('c3333333-3333-3333-3333-333333333333', '66666666-6666-6666-6666-666666666666', 'Sally', 'Seller', 'sally@example.test'),
  ('c4444444-4444-4444-4444-444444444444', '77777777-7777-7777-7777-777777777777', 'Dee', 'Disabled', 'disabled@example.test'),
  ('c5555555-5555-5555-5555-555555555555', '88888888-8888-8888-8888-888888888888', 'Dana', 'Demo', 'demo@example.test'),
  ('c6666666-6666-6666-6666-666666666666', null, 'Pat', 'NoLogin', 'pat@example.test');

insert into public.deals (id, file_number, street, city, state, zip, processor_id, is_demo) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'MD-1', '1 Oak', 'Rockville', 'MD', '20850', '11111111-1111-1111-1111-111111111111', false),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'MD-2', '2 Oak', 'Rockville', 'MD', '20850', '11111111-1111-1111-1111-111111111111', false),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'MD-D', '3 Oak', 'Rockville', 'MD', '20850', '11111111-1111-1111-1111-111111111111', true);

insert into public.deal_participants (id, deal_id, contact_id, role) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'c1111111-1111-1111-1111-111111111111', 'Listing Agent'),
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'c2222222-2222-2222-2222-222222222222', 'Buyer Agent'),
  ('a3333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'c3333333-3333-3333-3333-333333333333', 'Client-Seller'),
  ('a4444444-4444-4444-4444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'c1111111-1111-1111-1111-111111111111', 'Listing Agent'),
  ('a5555555-5555-5555-5555-555555555555', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'c4444444-4444-4444-4444-444444444444', 'Listing Agent'),
  ('a6666666-6666-6666-6666-666666666666', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'c5555555-5555-5555-5555-555555555555', 'Listing Agent'),
  ('a7777777-7777-7777-7777-777777777777', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'c6666666-6666-6666-6666-666666666666', 'Client-Seller');

insert into public.tasks (id, deal_id, participant_id, owner_profile_id, assigned_role, status, title) values
  ('b1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'a1111111-1111-1111-1111-111111111111', null, 'Listing Agent', 'todo', 'Commission information'),
  ('b2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'a3333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Client-Seller', 'todo', 'Seller proceeds'),
  ('b3333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'a4444444-4444-4444-4444-444444444444', null, 'Listing Agent', 'todo', 'Wrong file participant'),
  ('b4444444-4444-4444-4444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'a7777777-7777-7777-7777-777777777777', null, 'Client-Seller', 'todo', 'No login'),
  ('b5555555-5555-5555-5555-555555555555', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', null, null, 'Processor', 'todo', 'No participant');
