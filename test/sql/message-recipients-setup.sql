-- Scratch schema for the picker comparison. Fake ids only. Not applied to TEST.
create schema if not exists private;
create schema if not exists extensions;

create table if not exists public.profiles (
  id uuid primary key,
  first_name text,
  last_name text,
  email text,
  role text,
  status text,
  is_admin boolean default false,
  is_demo boolean default true
);
create table if not exists public.deals (
  id uuid primary key,
  is_demo boolean default true,
  processor_id uuid,
  preprocessor_user_id uuid,
  tc_user_id uuid,
  sales_person_id uuid,
  state text,
  county text,
  scheduled_at timestamp,
  scheduled_location text,
  scheduled_office_id text,
  scheduled_note text,
  scheduled_by uuid,
  scheduled_by_role text,
  scheduled_confirmed_at timestamptz,
  closing_date date
);
create table if not exists public.contacts (
  id uuid primary key,
  profile_id uuid,
  first_name text,
  last_name text,
  email text
);
create table if not exists public.deal_participants (
  id uuid primary key,
  deal_id uuid,
  contact_id uuid,
  role text
);
create table if not exists public.deal_sales_people (
  deal_id uuid,
  sales_id uuid
);
create table if not exists public.closing_proposals (
  id uuid primary key,
  deal_id uuid,
  proposed_at timestamp,
  location text,
  office_id text,
  side text,
  status text
);

create or replace function private.effective_uid() returns uuid language sql stable as $$
  select nullif(current_setting('cla.uid', true), '')::uuid
$$;

create or replace function private.me_role() returns text language sql stable security definer set search_path to pg_catalog, public as $$
  select role from public.profiles where id = private.effective_uid() and status = 'active'
$$;

create or replace function private.is_admin() returns boolean language sql stable security definer set search_path to pg_catalog, public as $$
  select coalesce((select is_admin from public.profiles where id = private.effective_uid() and status = 'active'), false)
$$;

create or replace function private.is_staffish() returns boolean language sql stable security definer set search_path to pg_catalog, public as $$
  select private.is_admin() or coalesce(private.me_role() in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin'), false)
$$;

create or replace function private.can_access_deal(d uuid) returns boolean language sql stable as $$ select true $$;

create or replace function private.side_of(r text) returns text language sql immutable as $$
  select case r when 'Buyer Agent' then 'buyer' when 'Client-Buyer' then 'buyer' when 'Listing Agent' then 'seller' when 'Client-Seller' then 'seller' end
$$;

create or replace function private.file_roles_of(pid uuid, d uuid) returns text[] language sql stable security definer set search_path to pg_catalog, public as $$
  select case when pr.role is null then '{}'::text[] when pr.role <> 'Outside user' then array[pr.role]
    else coalesce((select array_agg(x.role order by array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], x.role))
                   from (select distinct p.role from public.deal_participants p join public.contacts c on c.id = p.contact_id
                         where p.deal_id = d and c.profile_id = pid and p.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller')) x), array['Outside user']) end
  from (select (select role from public.profiles where id = pid) as role) pr
$$;

create or replace function private.person_side(pid uuid, d uuid) returns text language sql stable security definer set search_path to pg_catalog, public as $$
  select case when (select role from public.profiles where id = pid) is distinct from 'Outside user' then 'staff'
    else (select case when count(distinct s) = 1 then max(s) end from (select private.side_of(r) s from unnest(private.file_roles_of(pid, d)) r) x where s is not null) end
$$;

create or replace function private.person_label(pid uuid) returns text language sql stable as $$
  select coalesce((select trim(first_name || ' ' || last_name) || ' (' || role || ')' from public.profiles where id = pid), 'Unknown')
$$;

create or replace function private.person_label(pid uuid, d uuid, cap text) returns text language sql stable security definer set search_path to pg_catalog, public as $$
  with r as (select private.file_roles_of(pid, d) rs), a as (select case when cap is not null and cap = any (rs) then cap else rs[1] end as cap, rs from r)
  select coalesce((select trim(p.first_name || ' ' || p.last_name) || ' (' ||
      case when cardinality(a.rs) > 1 then 'as ' || a.cap || '; also ' || array_to_string(array_remove(a.rs, a.cap), ', ') || ' on this file' else coalesce(a.cap, 'unknown role') end || ')'
    from public.profiles p, a where p.id = pid), 'Unknown')
$$;

create or replace function private.person_label(pid uuid, d uuid) returns text language sql stable as $$
  select private.person_label(pid, d, null)
$$;

create or replace function private.person_pure_buyer(pid uuid, d uuid) returns boolean language sql stable as $$
  select pid is not null and d is not null and coalesce(private.person_side(pid, d) <> 'staff', false)
     and 'Client-Buyer' = any (private.file_roles_of(pid, d)) and not (private.file_roles_of(pid, d) && array['Buyer Agent', 'Listing Agent'])
$$;

create or replace function private.person_pure_seller(pid uuid, d uuid) returns boolean language sql stable as $$
  select pid is not null and d is not null and coalesce(private.person_side(pid, d) <> 'staff', false)
     and 'Client-Seller' = any (private.file_roles_of(pid, d)) and not ('Client-Buyer' = any (private.file_roles_of(pid, d)))
     and not (private.file_roles_of(pid, d) && array['Buyer Agent', 'Listing Agent'])
$$;

create or replace function private.is_pure_buyer(d uuid) returns boolean language sql stable as $$
  select private.effective_uid() is not null and not private.is_staffish() and private.person_pure_buyer(private.effective_uid(), d)
$$;

create or replace function private.is_pure_seller(d uuid) returns boolean language sql stable as $$
  select private.effective_uid() is not null and not private.is_staffish() and private.person_pure_seller(private.effective_uid(), d)
$$;

create or replace function private.file_role_of(pid uuid, d uuid) returns text language sql stable security definer set search_path to pg_catalog, public as $$
  select case when pr.role is distinct from 'Outside user' then pr.role
    else coalesce((select p.role from public.deal_participants p join public.contacts c on c.id = p.contact_id
                   where p.deal_id = d and c.profile_id = pid and p.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller')
                   order by array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], p.role) limit 1), 'Outside user') end
  from (select (select role from public.profiles where id = pid) as role) pr
$$;

create or replace function private.deal_role(d uuid) returns text language sql stable as $$
  select case when private.me_role() is null then null when private.me_role() <> 'Outside user' then private.me_role() else private.file_role_of(private.effective_uid(), d) end
$$;

create or replace function private.my_side(d uuid) returns text language sql stable as $$
  select case when private.is_staffish() then 'staff' else private.person_side(private.effective_uid(), d) end
$$;

create or replace function private.participant_visible(d uuid, prole text) returns boolean language sql stable security definer set search_path to pg_catalog, public as $$
  select private.can_access_deal(d) and not (private.deal_role(d) in ('Client-Buyer', 'Client-Seller') and prole like 'Client-%' and prole <> private.deal_role(d))
     and not (prole = 'Listing Agent' and private.is_pure_buyer(d))
     and not (prole = 'Buyer Agent' and private.is_pure_seller(d))
$$;

create or replace function private.can_message(pid uuid, d uuid) returns boolean language sql stable security definer set search_path to pg_catalog, public as $$
  select private.is_staffish() or private.person_side(pid, d) = 'staff' or (private.my_side(d) in ('buyer', 'seller') and private.person_side(pid, d) = private.my_side(d))
$$;

create or replace function private.deal_cla_staff(d uuid) returns setof uuid language sql stable security definer set search_path to pg_catalog, public as $$
  select x.pid from (
    select processor_id as pid from public.deals where id = d
    union select preprocessor_user_id from public.deals where id = d
    union select tc_user_id from public.deals where id = d
    union select sales_person_id from public.deals where id = d
    union select s.sales_id from public.deal_sales_people s where s.deal_id = d
    union select c.profile_id
      from public.deal_participants dp
      join public.contacts c on c.id = dp.contact_id
      where dp.deal_id = d
        and dp.role in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator')
    union
    select p.id
      from public.deal_participants dp
      join public.contacts c on c.id = dp.contact_id
      join public.profiles p on lower(p.email) = lower(btrim(c.email))
      where dp.deal_id = d
        and c.profile_id is null
        and btrim(coalesce(c.email, '')) <> ''
        and dp.role in ('Processor', 'Preprocessor')
        and p.status = 'active'
        and p.role in ('Processor', 'Preprocessor')
        and p.is_demo is not distinct from (select z.is_demo from public.deals z where z.id = d)
  ) x
  where x.pid is not null
$$;

create or replace function private.rpc_message_recipients_before(p_deal uuid)
returns table(id uuid, first_name text, last_name text, email text, role text, side text)
language sql stable security definer set search_path to pg_catalog, public as $$
  select distinct p.id, p.first_name, p.last_name, p.email, private.person_label(p.id, p_deal), private.person_side(p.id, p_deal)
  from public.profiles p where private.can_access_deal(p_deal) and p.status = 'active' and p.id <> private.effective_uid()
    and (p.id in (select c.profile_id from public.deal_participants dp join public.contacts c on c.id = dp.contact_id where dp.deal_id = p_deal and private.participant_visible(p_deal, dp.role))
         or p.id in (select private.deal_cla_staff(p_deal)))
    and private.can_message(p.id, p_deal)
$$;

create or replace function private.is_manager() returns boolean language sql stable as $$
  select coalesce(private.me_role() in ('Processor', 'Preprocessor', 'Transaction Coordinator'), false) or private.is_admin()
$$;
create or replace function private.closing_office_for(p_deal uuid, p_location text, p_office text) returns text language plpgsql as $$
begin
  if p_location is distinct from 'CLA Title office' then
    if nullif(btrim(coalesce(p_office, '')), '') is not null then raise exception 'Only a CLA Title office closing names an office.'; end if;
    return null;
  end if;
  return p_office;
end $$;
create or replace function private.closing_place(p_location text, p_office text) returns text language sql as $$ select p_location $$;
create or replace function private.log_activity(p_deal uuid, p_action text, p_entity text, p_id uuid, p_text text) returns void language sql as $$ select null::void $$;
create or replace function private.notify(p_ids uuid[], p_kind text, p_deal uuid, p_text text, p_url text) returns void language sql as $$ select null::void $$;
