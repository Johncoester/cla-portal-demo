-- Profiles and contacts for the CLA Portal Live Test role suite.
-- NOT APPLIED. John applies this by hand on TEST (aqcervntopidtcazcmlv) after the nine
-- auth logins already exist. This file never inserts into auth.users and never reads a password.
--
-- The logins were created by tests/e2e-roles/seed-accounts.mjs without portal_role, so
-- on_auth_user_sync did not create profiles. This migration looks each one up by
-- lower(email) and writes the profile plus that login's own contact. A future seed
-- sends portal_role so the trigger creates the profile; this file still repairs a
-- login that exists without one.
--
-- Also inserts the loginless invitee contact (clatestportal+e2e-invitee@gmail.com).
-- The file itself is the next migration, 20261110140100_e2e_role_file_seed.sql.
-- Rollback: supabase/rollbacks/20261110140000_e2e_role_profiles.sql
--   (deletes only E2E-tagged profiles and contacts; never auth users).

begin;
set local lock_timeout = '3s';

do $e2e$
declare
  rec record;
  uid uuid;
  addr text;
  existing uuid;
  base text := 'clatestportal@gmail.com';
begin
  if split_part(base, '@', 1) <> 'clatestportal' or split_part(base, '@', 2) <> 'gmail.com' then
    raise exception 'refusing: mail alias base must be clatestportal@gmail.com';
  end if;
  if to_regclass('auth.users') is null or to_regclass('public.profiles') is null or to_regclass('public.contacts') is null then
    raise exception 'drift: auth.users, public.profiles, and public.contacts must already exist';
  end if;
  if exists (
    select 1 from (values
      ('profiles','id'), ('profiles','email'), ('profiles','first_name'), ('profiles','last_name'),
      ('profiles','phone'), ('profiles','role'), ('profiles','status'), ('profiles','is_admin'), ('profiles','is_demo'),
      ('contacts','profile_id'), ('contacts','first_name'), ('contacts','last_name'),
      ('contacts','email'), ('contacts','phone'), ('contacts','company'), ('contacts','contact_type')
    ) as need(tbl, col)
    where not exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = need.tbl and c.column_name = need.col
    )
  ) then
    raise exception 'drift: profiles or contacts is missing a column this seed writes';
  end if;

  for rec in
    select * from (values
      ('super-admin'::text,    'Super admin'::text,              true,  'E2E Super'::text, 'Admin'::text,       null::text),
      ('processor',            'Processor',                      false, 'E2E',       'Processor',     null),
      ('sales-person',         'Sales Person',                   false, 'E2E',       'Salesperson',   null),
      ('sales-team',           'Sales Team',                     false, 'E2E',       'Salesteam',     null),
      ('coordinator',          'Transaction Coordinator',        false, 'E2E',       'Coordinator',   null),
      ('buyer-agent',          'Outside user',                   false, 'E2E',       'Buyeragent',    'realtor'),
      ('listing-agent',        'Outside user',                   false, 'E2E',       'Listingagent',  'realtor'),
      ('buyer',                'Outside user',                   false, 'E2E',       'Buyer',         'buyer_seller'),
      ('seller',               'Outside user',                   false, 'E2E',       'Seller',        'buyer_seller')
    ) as v(tag, portal_role, is_admin, first_name, last_name, contact_type)
  loop
    addr := 'clatestportal+e2e-' || rec.tag || '@gmail.com';
    if addr !~ '^clatestportal\+e2e-[a-z-]+@gmail\.com$' then
      raise exception 'refusing: % is outside the e2e alias pattern', addr;
    end if;

    select u.id into uid from auth.users u where lower(u.email) = addr;
    if uid is null then
      raise exception 'refusing: auth login % is missing. Create it with the seed script first. This migration does not insert auth users.', addr;
    end if;

    select p.id into existing from public.profiles p where lower(p.email) = addr;
    if existing is not null and existing is distinct from uid then
      raise exception 'drift: profile % belongs to % but auth.users id is %', addr, existing, uid;
    end if;

    insert into public.profiles (id, email, first_name, last_name, phone, role, status, is_admin, is_demo)
    values (uid, addr, rec.first_name, rec.last_name, '301-555-0148', rec.portal_role, 'active', rec.is_admin, false)
    on conflict (id) do update set
      email = excluded.email,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      phone = excluded.phone,
      role = excluded.role,
      status = excluded.status,
      is_admin = excluded.is_admin,
      is_demo = false;

    if exists (select 1 from public.contacts c where lower(c.email) = addr) then
      update public.contacts c
         set profile_id = uid,
             first_name = rec.first_name,
             last_name = rec.last_name,
             phone = '301-555-0148',
             company = 'E2E Role Seed',
             contact_type = rec.contact_type
       where lower(c.email) = addr;
    else
      insert into public.contacts (profile_id, first_name, last_name, email, phone, company, contact_type)
      values (uid, rec.first_name, rec.last_name, addr, '301-555-0148', 'E2E Role Seed', rec.contact_type);
    end if;
  end loop;

  addr := 'clatestportal+e2e-invitee@gmail.com';
  if addr !~ '^clatestportal\+e2e-[a-z-]+@gmail\.com$' then
    raise exception 'refusing: invitee address is outside the e2e alias pattern';
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = addr) then
    raise exception 'drift: invitee % must stay loginless', addr;
  end if;
  if exists (select 1 from public.contacts c where lower(c.email) = addr) then
    update public.contacts c
       set profile_id = null,
           first_name = 'E2E',
           last_name = 'Invitee',
           phone = '301-555-0149',
           company = 'E2E Role Seed',
           contact_type = 'realtor'
     where lower(c.email) = addr;
  else
    insert into public.contacts (profile_id, first_name, last_name, email, phone, company, contact_type)
    values (null, 'E2E', 'Invitee', addr, '301-555-0149', 'E2E Role Seed', 'realtor');
  end if;

  if (select count(*) from public.profiles p where lower(p.email) ~ '^clatestportal\+e2e-[a-z-]+@gmail\.com$') <> 9 then
    raise exception 'drift: expected 9 e2e profiles';
  end if;
  if exists (
    select 1 from public.profiles p
    where lower(p.email) ~ '^clatestportal\+e2e-[a-z-]+@gmail\.com$'
      and (p.status is distinct from 'active' or p.is_demo is distinct from false)
  ) then
    raise exception 'drift: an e2e profile is not active or is marked demo';
  end if;
  if (select count(*) from public.profiles p
      where lower(p.email) ~ '^clatestportal\+e2e-[a-z-]+@gmail\.com$' and p.is_admin) <> 1
     or not exists (
       select 1 from public.profiles p
       where lower(p.email) = 'clatestportal+e2e-super-admin@gmail.com' and p.is_admin and p.role = 'Super admin'
     ) then
    raise exception 'drift: is_admin must be true only for the e2e super admin';
  end if;
  if exists (
    select 1 from public.profiles p
    where lower(p.email) ~ '^clatestportal\+e2e-[a-z-]+@gmail\.com$'
      and p.role = 'Super admin'
      and lower(p.email) <> 'clatestportal+e2e-super-admin@gmail.com'
  ) then
    raise exception 'drift: only the super-admin login may have role Super admin';
  end if;
  if (select count(*) from public.contacts c
      where c.company = 'E2E Role Seed' and lower(c.email) ~ '^clatestportal\+e2e-[a-z-]+@gmail\.com$') <> 10 then
    raise exception 'drift: expected 10 e2e contacts (9 logins plus the loginless invitee)';
  end if;
  if exists (
    select 1 from public.contacts c
    where lower(c.email) = 'clatestportal+e2e-invitee@gmail.com' and c.profile_id is not null
  ) then
    raise exception 'drift: invitee contact must have no profile';
  end if;
  if exists (
    select 1
    from public.contacts c
    join public.profiles p on p.id = c.profile_id
    where c.company = 'E2E Role Seed'
      and lower(c.email) ~ '^clatestportal\+e2e-[a-z-]+@gmail\.com$'
      and lower(c.email) <> 'clatestportal+e2e-invitee@gmail.com'
      and lower(p.email) is distinct from lower(c.email)
  ) then
    raise exception 'drift: an e2e contact is linked to a different login';
  end if;
end
$e2e$;

commit;
