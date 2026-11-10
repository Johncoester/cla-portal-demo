-- One Order Entry file for the CLA Portal Live Test role suite.
-- NOT APPLIED. Apply 20261110140000_e2e_role_profiles.sql first.
-- This file never inserts into auth.users and never reads a password.
-- Marker: deals.notes = 'E2E-ROLE-FILE', street '100 E2E Test File'.
-- Rollback: supabase/rollbacks/20261110140100_e2e_role_file_seed.sql
--   (deletes only that file and its participants and sales links; never auth users or profiles).

begin;
set local lock_timeout = '3s';

do $e2e$
declare
  rec record;
  uid uuid;
  cid uuid;
  did uuid;
  addr text;
  sales_a uuid;
  sales_b uuid;
  proc uuid;
  n_part int;
  n_sales int;
begin
  if to_regclass('public.deals') is null
     or to_regclass('public.deal_participants') is null
     or to_regclass('public.deal_sales_people') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.contacts') is null then
    raise exception 'drift: deals, deal_participants, deal_sales_people, profiles, or contacts is missing';
  end if;
  if exists (
    select 1 from (values
      ('deals','street'), ('deals','city'), ('deals','state'), ('deals','zip'), ('deals','county'),
      ('deals','transaction_type'), ('deals','status'), ('deals','stage'), ('deals','open_date'),
      ('deals','purchase_price'), ('deals','notes'), ('deals','processor_id'), ('deals','created_by'),
      ('deals','file_number'), ('deals','is_demo'),
      ('deal_participants','deal_id'), ('deal_participants','contact_id'), ('deal_participants','role'),
      ('deal_sales_people','deal_id'), ('deal_sales_people','sales_id')
    ) as need(tbl, col)
    where not exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = need.tbl and c.column_name = need.col
    )
  ) then
    raise exception 'drift: a deal column this seed writes is missing';
  end if;

  for rec in
    select * from (values
      ('super-admin'::text), ('processor'), ('sales-person'), ('sales-team'), ('coordinator'),
      ('buyer-agent'), ('listing-agent'), ('buyer'), ('seller')
    ) as v(tag)
  loop
    addr := 'clatestportal+e2e-' || rec.tag || '@gmail.com';
    if addr !~ '^clatestportal\+e2e-[a-z-]+@gmail\.com$' then
      raise exception 'refusing: % is outside the e2e alias pattern', addr;
    end if;
    select p.id into uid from public.profiles p where lower(p.email) = addr and p.status = 'active' and p.is_demo = false;
    if uid is null then
      raise exception 'refusing: profile % is missing. Apply 20261110140000_e2e_role_profiles.sql first.', addr;
    end if;
  end loop;

  select p.id into proc from public.profiles p where lower(p.email) = 'clatestportal+e2e-processor@gmail.com';
  select p.id into sales_a from public.profiles p where lower(p.email) = 'clatestportal+e2e-sales-person@gmail.com';
  select p.id into sales_b from public.profiles p where lower(p.email) = 'clatestportal+e2e-sales-team@gmail.com';

  select d.id into did from public.deals d where d.notes = 'E2E-ROLE-FILE';
  if did is null then
    if exists (select 1 from public.deals d where d.file_number = 'MD-26-99001') then
      raise exception 'drift: file number MD-26-99001 is already used by a non-e2e file';
    end if;
    insert into public.deals (
      street, city, state, zip, county, transaction_type, status, stage, open_date,
      purchase_price, notes, processor_id, created_by, file_number, is_demo
    ) values (
      '100 E2E Test File', 'Annapolis', 'MD', '21401', 'Anne Arundel', 'Purchase', 'Open', 0,
      (timezone('America/New_York', now()))::date,
      100000, 'E2E-ROLE-FILE', proc, proc, 'MD-26-99001', false
    )
    returning id into did;
  else
    if exists (select 1 from public.deals d where d.id = did and d.street is distinct from '100 E2E Test File') then
      raise exception 'drift: E2E-ROLE-FILE deal % does not have street 100 E2E Test File', did;
    end if;
    if (select count(*) from public.deals d where d.notes = 'E2E-ROLE-FILE') <> 1 then
      raise exception 'drift: more than one E2E-ROLE-FILE deal';
    end if;
  end if;

  for rec in
    select * from (values
      ('clatestportal+e2e-processor@gmail.com'::text,     'Processor'::text),
      ('clatestportal+e2e-coordinator@gmail.com',         'Transaction Coordinator'),
      ('clatestportal+e2e-buyer-agent@gmail.com',         'Buyer Agent'),
      ('clatestportal+e2e-listing-agent@gmail.com',       'Listing Agent'),
      ('clatestportal+e2e-buyer@gmail.com',               'Client-Buyer'),
      ('clatestportal+e2e-seller@gmail.com',              'Client-Seller'),
      ('clatestportal+e2e-invitee@gmail.com',             'Buyer Agent')
    ) as v(email, file_role)
  loop
    if rec.email !~ '^clatestportal\+e2e-[a-z-]+@gmail\.com$' then
      raise exception 'refusing: % is outside the e2e alias pattern', rec.email;
    end if;
    select c.id into cid
    from public.contacts c
    where lower(c.email) = rec.email and c.company = 'E2E Role Seed';
    if cid is null then
      raise exception 'refusing: e2e contact % is missing. Apply the profiles migration first.', rec.email;
    end if;
    if not exists (
      select 1 from public.deal_participants p
      where p.deal_id = did and p.contact_id = cid and p.role = rec.file_role
    ) then
      insert into public.deal_participants (deal_id, contact_id, role)
      values (did, cid, rec.file_role);
    end if;
  end loop;

  if not exists (select 1 from public.deal_sales_people s where s.deal_id = did and s.sales_id = sales_a) then
    insert into public.deal_sales_people (deal_id, sales_id) values (did, sales_a);
  end if;
  if not exists (select 1 from public.deal_sales_people s where s.deal_id = did and s.sales_id = sales_b) then
    insert into public.deal_sales_people (deal_id, sales_id) values (did, sales_b);
  end if;

  select count(*) into n_part from public.deal_participants p where p.deal_id = did;
  select count(*) into n_sales from public.deal_sales_people s where s.deal_id = did;
  if n_part <> 7 or n_sales <> 2 then
    raise exception 'drift: E2E file has % participants and % sales links (expected 7 and 2)', n_part, n_sales;
  end if;
  if exists (select 1 from public.deals d where d.id = did and (d.is_demo is distinct from false or d.processor_id is distinct from proc)) then
    raise exception 'drift: E2E file processor or demo flag does not match the processor login';
  end if;
end
$e2e$;

commit;
