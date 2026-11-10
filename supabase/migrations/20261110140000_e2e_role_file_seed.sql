-- E2E role seed for CLA Portal Live Test (project aqcervntopidtcazcmlv). NOT APPLIED.
-- Do not run this from CI, from the app, or on any project other than TEST.
-- No CRM tables are touched. No passwords are stored in this file.
--
-- In the SAME SQL editor session, before the script:
--   select set_config('e2e.mail_to', 'clatestportal@gmail.com', true);
--   select set_config('e2e.super_admin_password', '<from E2E_SUPER_ADMIN_PASSWORD>', true);
--   select set_config('e2e.processor_password', '<from E2E_PROCESSOR_PASSWORD>', true);
--   select set_config('e2e.sales_person_password', '<from E2E_SALES_PERSON_PASSWORD>', true);
--   select set_config('e2e.sales_team_password', '<from E2E_SALES_TEAM_PASSWORD>', true);
--   select set_config('e2e.coordinator_password', '<from E2E_TRANSACTION_COORDINATOR_PASSWORD>', true);
--   select set_config('e2e.buyer_agent_password', '<from E2E_BUYER_AGENT_PASSWORD>', true);
--   select set_config('e2e.listing_agent_password', '<from E2E_LISTING_AGENT_PASSWORD>', true);
--   select set_config('e2e.buyer_password', '<from E2E_CLIENT_BUYER_PASSWORD>', true);
--   select set_config('e2e.seller_password', '<from E2E_CLIENT_SELLER_PASSWORD>', true);
-- mail_to must be clatestportal@gmail.com or an @clatitle.com address so plus-aliases
-- are addresses the Live Test send path already allows. A password setting is read
-- only when that role's login does not exist yet. It is not printed and not written
-- to a portal table.
-- Safer path: node tests/e2e-roles/seed-accounts.mjs creates the auth users from the
-- same env vars (service role, never prints passwords). Then run this file; it links
-- the file and raises if a profile is missing.
-- Rollback: supabase/rollbacks/20261110140000_e2e_role_file_seed.sql

begin;
set local lock_timeout = '3s';

do $e2e$
declare
  base text := lower(btrim(coalesce(current_setting('e2e.mail_to', true), '')));
  localpart text; domain text; at int;
  rec record;
  addr text; tag text; pw text;
  uid uuid; cid uuid; did uuid;
  proc uuid; sales_a uuid; sales_b uuid; coord uuid;
  n int;
begin
  if to_regclass('public.profiles') is null or to_regclass('public.deals') is null
     or to_regclass('public.contacts') is null or to_regclass('public.deal_participants') is null then
    raise exception 'refusing: portal tables are missing. This is not the CLA Portal schema.';
  end if;
  if not exists (
    select 1 from public.profiles
    where id in ('149e612a-6e14-4ee1-9890-0f29d6f89156'::uuid, 'd02722a1-582b-42c0-b3d1-28d25adb758d'::uuid)
  ) then
    raise exception 'refusing: this database does not have the CLA Portal Live Test staff profiles (project aqcervntopidtcazcmlv).';
  end if;
  if base = '' or position('@' in base) = 0 then
    raise exception 'refusing: set e2e.mail_to in this session (the dedicated test inbox).';
  end if;
  at := position('@' in base);
  localpart := substring(base from 1 for at - 1);
  domain := substring(base from at + 1);
  if localpart = '' or domain = '' or position('+' in localpart) > 0 then
    raise exception 'refusing: e2e.mail_to must be a base address with no plus-tag.';
  end if;
  if base <> 'clatestportal@gmail.com' and domain <> 'clatitle.com' then
    raise exception 'refusing: e2e.mail_to must be clatestportal@gmail.com or an @clatitle.com address so Live Test will accept the aliases.';
  end if;

  for rec in
    select * from (values
      ('super-admin', 'e2e.super_admin_password', 'Super admin', true, 'E2E Super', 'Admin', null::text, null::text),
      ('processor', 'e2e.processor_password', 'Processor', false, 'E2E', 'Processor', 'Processor', null),
      ('sales-person', 'e2e.sales_person_password', 'Sales Person', false, 'E2E', 'Salesperson', null, null),
      ('sales-team', 'e2e.sales_team_password', 'Sales Team', false, 'E2E', 'Salesteam', null, null),
      ('coordinator', 'e2e.coordinator_password', 'Transaction Coordinator', false, 'E2E', 'Coordinator', 'Transaction Coordinator', null),
      ('buyer-agent', 'e2e.buyer_agent_password', 'Outside user', false, 'E2E', 'Buyeragent', 'Buyer Agent', 'realtor'),
      ('listing-agent', 'e2e.listing_agent_password', 'Outside user', false, 'E2E', 'Listingagent', 'Listing Agent', 'realtor'),
      ('buyer', 'e2e.buyer_password', 'Outside user', false, 'E2E', 'Buyer', 'Client-Buyer', 'buyer_seller'),
      ('seller', 'e2e.seller_password', 'Outside user', false, 'E2E', 'Seller', 'Client-Seller', 'buyer_seller'),
      ('invitee', null, 'Outside user', false, 'E2E', 'Invite', null, 'realtor')
    ) as t(tag, pw_setting, role_name, is_admin, first_name, last_name, file_role, contact_type)
  loop
    tag := rec.tag;
    addr := localpart || '+e2e-' || tag || '@' || domain;
    select p.id into uid from public.profiles p where lower(p.email) = addr limit 1;
    if uid is null and rec.tag <> 'invitee' then
      pw := current_setting(rec.pw_setting, true);
      if pw is null or length(pw) < 8 then
        raise exception 'refusing: % has no profile yet. Set % in this session (8+ characters) or create the login with tests/e2e-roles/seed-accounts.mjs. The password is not stored in this file.', addr, rec.pw_setting;
      end if;
      if to_regclass('auth.users') is null
         or not exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'encrypted_password') then
        raise exception 'refusing: auth.users is not available here. Create % with the seed script, then rerun this file.', addr;
      end if;
      uid := gen_random_uuid();
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token)
      values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', addr,
        extensions.crypt(pw, extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('first_name', rec.first_name, 'last_name', rec.last_name),
        now(), now(), '', '');
      if to_regclass('auth.identities') is not null then
        insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
        values (gen_random_uuid(), uid, jsonb_build_object('sub', uid::text, 'email', addr), 'email', uid::text, now(), now(), now());
      end if;
    end if;
    if uid is not null then
      insert into public.profiles (id, email, first_name, last_name, phone, role)
      select uid, addr, rec.first_name, rec.last_name, '301-555-0148', rec.role_name
      where not exists (select 1 from public.profiles p where p.id = uid);
      update public.profiles
        set email = addr, first_name = rec.first_name, last_name = rec.last_name, role = rec.role_name, status = 'active'
      where id = uid;
      if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_admin') then
        update public.profiles set is_admin = rec.is_admin where id = uid;
      end if;
      if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_demo') then
        update public.profiles set is_demo = false where id = uid;
      end if;
    end if;

    if rec.tag = 'invitee' then
      if not exists (select 1 from public.contacts c where lower(c.email) = addr) then
        insert into public.contacts (first_name, last_name, email, phone, company, contact_type)
        values (rec.first_name, rec.last_name, addr, '301-555-0149', 'E2E Role Seed', rec.contact_type);
      end if;
    elsif uid is not null then
      if not exists (select 1 from public.contacts c where c.profile_id = uid or lower(c.email) = addr) then
        insert into public.contacts (profile_id, first_name, last_name, email, phone, company, contact_type)
        values (uid, rec.first_name, rec.last_name, addr, '301-555-0148', 'E2E Role Seed', rec.contact_type);
      else
        update public.contacts
          set profile_id = coalesce(profile_id, uid), first_name = rec.first_name, last_name = rec.last_name,
              email = addr, company = 'E2E Role Seed', contact_type = rec.contact_type
        where profile_id = uid or lower(email) = addr;
      end if;
    end if;
  end loop;

  select id into proc from public.profiles where lower(email) = localpart || '+e2e-processor@' || domain;
  select id into sales_a from public.profiles where lower(email) = localpart || '+e2e-sales-person@' || domain;
  select id into sales_b from public.profiles where lower(email) = localpart || '+e2e-sales-team@' || domain;
  select id into coord from public.profiles where lower(email) = localpart || '+e2e-coordinator@' || domain;
  if proc is null or sales_a is null or sales_b is null or coord is null then
    raise exception 'refusing: a required E2E profile is missing after the login step.';
  end if;

  select d.id into did from public.deals d where d.notes = 'E2E-ROLE-FILE' limit 1;
  if did is null then
    insert into public.deals (street, city, state, zip, county, transaction_type, status, stage, open_date, purchase_price, notes, processor_id, created_by)
    values ('100 E2E Test File', 'Rockville', 'MD', '20850', 'Montgomery', 'Purchase', 'Open', 0, (timezone('America/New_York', now()))::date, 100000, 'E2E-ROLE-FILE', proc, proc)
    returning id into did;
  end if;

  for rec in
    select * from (values
      ('processor', 'Processor'),
      ('coordinator', 'Transaction Coordinator'),
      ('buyer-agent', 'Buyer Agent'),
      ('listing-agent', 'Listing Agent'),
      ('buyer', 'Client-Buyer'),
      ('seller', 'Client-Seller'),
      ('invitee', 'Buyer Agent')
    ) as t(tag, file_role)
  loop
    addr := localpart || '+e2e-' || rec.tag || '@' || domain;
    select c.id into cid from public.contacts c where lower(c.email) = addr limit 1;
    if cid is null then raise exception 'refusing: contact % is missing.', addr; end if;
    if not exists (select 1 from public.deal_participants p where p.deal_id = did and p.contact_id = cid and p.role = rec.file_role) then
      insert into public.deal_participants (deal_id, contact_id, role) values (did, cid, rec.file_role);
    end if;
  end loop;

  if to_regclass('public.deal_sales_people') is not null then
    if not exists (select 1 from public.deal_sales_people s where s.deal_id = did and s.sales_id = sales_a) then
      insert into public.deal_sales_people (deal_id, sales_id) values (did, sales_a);
    end if;
    if not exists (select 1 from public.deal_sales_people s where s.deal_id = did and s.sales_id = sales_b) then
      insert into public.deal_sales_people (deal_id, sales_id) values (did, sales_b);
    end if;
  end if;

  select count(*) into n from public.tasks t where t.deal_id = did;
  if n = 0 then
    raise notice 'E2E file % has no task copies. If the participant trigger did not copy templates, Fill In checks on TEST will fail until those copies exist.', did;
  end if;
end
$e2e$;

commit;
