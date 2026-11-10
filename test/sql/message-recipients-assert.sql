-- Fake file. Buyer, seller, both agents, a lender and an attorney who have email and no portal login.
insert into public.profiles (id, first_name, last_name, email, role, status) values
  ('00000000-0000-4000-8000-000000000001', 'Pat', 'Processor', 'pat.processor@example.test', 'Processor', 'active'),
  ('00000000-0000-4000-8000-000000000002', 'Bea', 'Buyer', 'bea.buyer@example.test', 'Outside user', 'active'),
  ('00000000-0000-4000-8000-000000000003', 'Sam', 'Seller', 'sam.seller@example.test', 'Outside user', 'active'),
  ('00000000-0000-4000-8000-000000000004', 'Ann', 'Agent', 'ann.agent@example.test', 'Outside user', 'active'),
  ('00000000-0000-4000-8000-000000000005', 'Lee', 'Listing', 'lee.listing@example.test', 'Outside user', 'active');
insert into public.deals (id, processor_id, is_demo) values
  ('00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000001', true);
insert into public.contacts (id, profile_id, first_name, last_name, email) values
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001', 'Pat', 'Processor', 'pat.processor@example.test'),
  ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000002', 'Bea', 'Buyer', 'bea.buyer@example.test'),
  ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000003', 'Sam', 'Seller', 'sam.seller@example.test'),
  ('00000000-0000-4000-8000-000000000014', '00000000-0000-4000-8000-000000000004', 'Ann', 'Agent', 'ann.agent@example.test'),
  ('00000000-0000-4000-8000-000000000015', '00000000-0000-4000-8000-000000000005', 'Lee', 'Listing', 'lee.listing@example.test'),
  ('00000000-0000-4000-8000-000000000016', null, 'Lana', 'Lender', 'lana.lender@example.test'),
  ('00000000-0000-4000-8000-000000000017', null, 'Ada', 'Attorney', 'ada.attorney@example.test'),
  ('00000000-0000-4000-8000-000000000018', null, 'Blank', 'Processor', '');
insert into public.deal_participants (id, deal_id, contact_id, role) values
  ('00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000011', 'Processor'),
  ('00000000-0000-4000-8000-000000000022', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000012', 'Client-Buyer'),
  ('00000000-0000-4000-8000-000000000023', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000013', 'Client-Seller'),
  ('00000000-0000-4000-8000-000000000024', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000014', 'Buyer Agent'),
  ('00000000-0000-4000-8000-000000000025', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000015', 'Listing Agent'),
  ('00000000-0000-4000-8000-000000000026', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000016', 'Lender'),
  ('00000000-0000-4000-8000-000000000027', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000017', 'Attorney'),
  ('00000000-0000-4000-8000-000000000028', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000018', 'Processor');

do $check$
declare
  who text;
  uid uuid;
  leaked int;
  differ int;
begin
  foreach who in array array['buyer', 'seller', 'buyer agent', 'listing agent'] loop
    uid := case who
      when 'buyer' then '00000000-0000-4000-8000-000000000002'
      when 'seller' then '00000000-0000-4000-8000-000000000003'
      when 'buyer agent' then '00000000-0000-4000-8000-000000000004'
      else '00000000-0000-4000-8000-000000000005' end;
    perform set_config('cla.uid', uid::text, true);
    select count(*) into leaked from private.rpc_message_recipients('00000000-0000-4000-8000-000000000010')
      where email in ('lana.lender@example.test', 'ada.attorney@example.test');
    if leaked <> 0 then raise exception '% saw a lender or attorney email', who; end if;
    select count(*) into differ from (
      (select id, first_name, last_name, email, role, side from private.rpc_message_recipients('00000000-0000-4000-8000-000000000010')
       except
       select id, first_name, last_name, email, role, side from private.rpc_message_recipients_before('00000000-0000-4000-8000-000000000010'))
      union all
      (select id, first_name, last_name, email, role, side from private.rpc_message_recipients_before('00000000-0000-4000-8000-000000000010')
       except
       select id, first_name, last_name, email, role, side from private.rpc_message_recipients('00000000-0000-4000-8000-000000000010'))
    ) d;
    if differ <> 0 then raise exception '% list does not match the previous picker', who; end if;
    raise notice '% matches the previous picker and does not see the lender or attorney', who;
  end loop;

  perform set_config('cla.uid', '00000000-0000-4000-8000-000000000001', true);
  if not exists (select 1 from private.rpc_message_recipients('00000000-0000-4000-8000-000000000010') where email = 'lana.lender@example.test')
     or not exists (select 1 from private.rpc_message_recipients('00000000-0000-4000-8000-000000000010') where email = 'ada.attorney@example.test')
     or not exists (select 1 from private.rpc_message_recipients('00000000-0000-4000-8000-000000000010') where email = 'bea.buyer@example.test')
     or not exists (select 1 from private.rpc_message_recipients('00000000-0000-4000-8000-000000000010') where email = 'sam.seller@example.test')
     or not exists (select 1 from private.rpc_message_recipients('00000000-0000-4000-8000-000000000010') where email = 'ann.agent@example.test') then
    raise exception 'staff cannot see the buyer, seller, agent, lender, and attorney';
  end if;
  if exists (select 1 from private.rpc_message_recipients('00000000-0000-4000-8000-000000000010') where first_name = 'Blank' or btrim(coalesce(email, '')) = '') then
    raise exception 'staff were offered a contact with no email';
  end if;
  raise notice 'staff see the file contacts that have an email';
end
$check$;
