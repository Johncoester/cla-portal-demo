-- Role matrix for the real set_deal_source function. Runs only on the disposable database.
-- Fails the session by raising. Does not touch a hosted project.

insert into public.profiles (id, first_name, last_name, role, status, is_demo) values
  ('11111111-1111-1111-1111-111111111111', 'Paula', 'Processor', 'Processor', 'active', false),
  ('11111111-1111-1111-1111-111111111112', 'Pat', 'Preprocessor', 'Preprocessor', 'active', false),
  ('22222222-2222-2222-2222-222222222222', 'Ben', 'Buyer', 'Outside user', 'active', false),
  ('33333333-3333-3333-3333-333333333333', 'Sam', 'Sales', 'Sales Person', 'active', false),
  ('44444444-4444-4444-4444-444444444444', 'Terry', 'Coordinator', 'Transaction Coordinator', 'active', false),
  ('55555555-5555-5555-5555-555555555555', 'Dana', 'Demo', 'Processor', 'active', true),
  ('66666666-6666-6666-6666-666666666666', 'Gary', 'Gone', 'Outside user', 'removed', false);

insert into public.deals (id, file_number, is_demo) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'MD-LIVE-1', false),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'MD-DEMO-1', true);

insert into public.contacts (id, first_name, last_name, profile_id, is_demo) values
  ('c1111111-1111-1111-1111-111111111111', 'Ben', 'Buyer', '22222222-2222-2222-2222-222222222222', false),
  ('c1111111-1111-1111-1111-111111111112', 'Wendy', 'Willow', null, false),
  ('c1111111-1111-1111-1111-111111111113', 'Sally', 'Seller', null, false),
  ('c1111111-1111-1111-1111-111111111114', 'Bianca', 'Agent', null, false),
  ('c1111111-1111-1111-1111-111111111115', 'Larry', 'Lister', null, false),
  ('c1111111-1111-1111-1111-111111111116', 'Linda', 'Lender', null, false),
  ('c1111111-1111-1111-1111-111111111117', 'Gary', 'Gone', '66666666-6666-6666-6666-666666666666', false),
  ('c1111111-1111-1111-1111-111111111118', 'Paula', 'Processor', '11111111-1111-1111-1111-111111111111', false),
  ('c2222222-2222-2222-2222-222222222222', 'Dana', 'DemoBuyer', null, true);

insert into public.deal_participants (deal_id, contact_id, role) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'c1111111-1111-1111-1111-111111111111', 'Client-Buyer'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'c1111111-1111-1111-1111-111111111112', 'Client-Buyer'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'c1111111-1111-1111-1111-111111111113', 'Client-Seller'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'c1111111-1111-1111-1111-111111111114', 'Buyer Agent'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'c1111111-1111-1111-1111-111111111115', 'Listing Agent'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'c1111111-1111-1111-1111-111111111116', 'Lender'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'c1111111-1111-1111-1111-111111111117', 'Client-Buyer'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'c1111111-1111-1111-1111-111111111118', 'Processor'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'c2222222-2222-2222-2222-222222222222', 'Client-Buyer');

insert into public.crm_picklist_options (list_key, value, label, retired, position) values
  ('leadSource', 'Existing Client or Agent', 'Existing Client or Agent', false, 1),
  ('leadSource', 'Google Ads', 'Google Ads', false, 2);

-- Legacy rows survived the function replacement.
do $$ begin
  if (select source from public.deal_business_sources where deal_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1') <> 'homeowner' then
    raise exception 'homeowner row was rewritten'; end if;
  if (select source from public.deal_business_sources where deal_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2') <> 'Existing Client or Agent' then
    raise exception 'marketing row was rewritten'; end if;
end $$;

create or replace function public.referral_as(p_user uuid, p_deal uuid, p_source text) returns text
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  return public.set_deal_source(p_deal, p_source);
end $$;
revoke all on function public.referral_as(uuid, uuid, text) from public, anon, authenticated;

-- Processor names the second buyer. One row. The first buyer is not stored.
select public.referral_as('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'buyer:c1111111-1111-1111-1111-111111111112');
do $$ begin
  if (select count(*) from public.deal_business_sources where deal_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1') <> 1 then
    raise exception 'more than one source row'; end if;
  if (select source from public.deal_business_sources where deal_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1') <> 'buyer:c1111111-1111-1111-1111-111111111112' then
    raise exception 'second buyer was not stored'; end if;
  if private.business_source_label('buyer:c1111111-1111-1111-1111-111111111112') <> 'Buyer — Wendy Willow' then
    raise exception 'label was %', private.business_source_label('buyer:c1111111-1111-1111-1111-111111111112'); end if;
end $$;

-- Reassign to the seller. Still one row.
select public.referral_as('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'seller:c1111111-1111-1111-1111-111111111113');
do $$ begin
  if (select source from public.deal_business_sources where deal_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1') <> 'seller:c1111111-1111-1111-1111-111111111113' then
    raise exception 'reassign did not replace the single source'; end if;
end $$;

-- Clear.
select public.referral_as('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', '');
do $$ begin
  if (select source from public.deal_business_sources where deal_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1') <> '' then
    raise exception 'clear did not stick'; end if;
end $$;

-- Same person in the wrong role, a processor contact, and a person not on the file.
do $$ begin
  begin
    perform public.referral_as('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'buyer:c1111111-1111-1111-1111-111111111114');
    raise exception 'agent was accepted as the buyer';
  exception when sqlstate '23514' then null; end;
  begin
    perform public.referral_as('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'buyer:c1111111-1111-1111-1111-111111111118');
    raise exception 'processor contact was accepted as the buyer';
  exception when sqlstate '23514' then null; end;
  begin
    perform public.referral_as('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'lender:c2222222-2222-2222-2222-222222222222');
    raise exception 'demo contact was accepted on a real order';
  exception when sqlstate '23514' then null; end;
  begin
    perform public.referral_as('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'buyer:c1111111-1111-1111-1111-111111111117');
    raise exception 'removed login was accepted';
  exception when sqlstate '23514' then null; end;
  if (select source from public.deal_business_sources where deal_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1') <> '' then
    raise exception 'a refused write changed the stored source'; end if;
end $$;

-- Eligible roles save. Homeowner drops a forged id. Marketing stays literal.
select public.referral_as('11111111-1111-1111-1111-111111111112', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'buyer_agent:c1111111-1111-1111-1111-111111111114');
select public.referral_as('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'listing_agent:c1111111-1111-1111-1111-111111111115');
select public.referral_as('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'lender:c1111111-1111-1111-1111-111111111116');
select public.referral_as('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'homeowner:c1111111-1111-1111-1111-111111111113');
do $$ begin
  if (select source from public.deal_business_sources where deal_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1') <> 'homeowner' then
    raise exception 'homeowner id was kept or mapped'; end if;
end $$;
select public.referral_as('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'Google Ads');
do $$ begin
  if (select source from public.deal_business_sources where deal_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1') <> 'Google Ads' then
    raise exception 'marketing value was not stored as itself'; end if;
end $$;

-- Removing the person does not clear or rewrite the stored choice.
select public.referral_as('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'buyer:c1111111-1111-1111-1111-111111111111');
delete from public.deal_participants where deal_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1' and contact_id = 'c1111111-1111-1111-1111-111111111111' and role = 'Client-Buyer';
select public.referral_as('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'buyer:c1111111-1111-1111-1111-111111111111');
do $$ begin
  if (select source from public.deal_business_sources where deal_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1') <> 'buyer:c1111111-1111-1111-1111-111111111111' then
    raise exception 'removing the person changed the stored source'; end if;
end $$;
do $$ begin
  begin
    perform public.referral_as('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'buyer:c1111111-1111-1111-1111-111111111119');
    raise exception 'unknown contact was accepted after removal';
  exception when sqlstate '23514' then null; end;
end $$;

-- Other world, and roles that must not write.
do $$ begin
  begin
    perform public.referral_as('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'buyer:c2222222-2222-2222-2222-222222222222');
    raise exception 'real processor wrote a demo order';
  exception when sqlstate 'P0002' then null; end;
  begin
    perform public.referral_as('55555555-5555-5555-5555-555555555555', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'buyer:c1111111-1111-1111-1111-111111111112');
    raise exception 'demo processor wrote a real order';
  exception when sqlstate 'P0002' then null; end;
  begin
    perform public.referral_as('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'buyer:c1111111-1111-1111-1111-111111111112');
    raise exception 'buyer wrote the source';
  exception when sqlstate '42501' then null; end;
  begin
    perform public.referral_as('33333333-3333-3333-3333-333333333333', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', '');
    raise exception 'sales wrote the source';
  exception when sqlstate '42501' then null; end;
  begin
    perform public.referral_as('44444444-4444-4444-4444-444444444444', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', '');
    raise exception 'transaction coordinator wrote the source';
  exception when sqlstate '42501' then null; end;
end $$;

-- anon cannot execute. authenticated cannot write the table directly.
do $$ begin
  begin
    execute 'set role anon';
    perform public.set_deal_source('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', '');
    raise exception 'anon executed set_deal_source';
  exception when insufficient_privilege then null;
  end;
  reset role;
  begin
    execute 'set role authenticated';
    insert into public.deal_business_sources (deal_id, source) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'forged');
    raise exception 'authenticated inserted the source table';
  exception when insufficient_privilege then null;
  end;
  reset role;
end $$;

do $$ begin
  if exists (
    select 1 from pg_policy pol
    where pol.polrelid = 'public.deal_business_sources'::regclass and pol.polcmd in ('a', 'w', '*')) then
    raise exception 'a write policy exists on deal_business_sources'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.deal_business_sources'::regclass) then
    raise exception 'RLS is off'; end if;
  if has_function_privilege('anon', 'public.set_deal_source(uuid, text)', 'execute') then
    raise exception 'anon can execute set_deal_source'; end if;
  if not has_function_privilege('authenticated', 'public.set_deal_source(uuid, text)', 'execute') then
    raise exception 'authenticated cannot execute the staff RPC'; end if;
end $$;

do $$ begin
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  if (public.crm_deal_filters()->'sources')::text not like '%"buyer"%' or (public.crm_deal_filters()->'sources')::text not like '%"seller"%' or (public.crm_deal_filters()->'sources')::text not like '%"homeowner"%' then
    raise exception 'CRM filters dropped a referral choice'; end if;
end $$;
do $$ begin
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  begin
    perform public.crm_deal_filters();
    raise exception 'buyer read CRM filters';
  exception when sqlstate '42501' then null; end;
end $$;

-- Untouched legacy rows are still the original text.
do $$ begin
  if (select source from public.deal_business_sources where deal_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1') <> 'homeowner' then
    raise exception 'homeowner row changed during the tests'; end if;
  if (select source from public.deal_business_sources where deal_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2') <> 'Existing Client or Agent' then
    raise exception 'marketing row changed during the tests'; end if;
end $$;
