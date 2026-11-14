-- Rollback for 20261119150000_file_any_staff_roles.sql.
-- Restores the previous Processor, salesperson, TC and party-role guards, and drops ensure_staff_contact.
begin;
set local lock_timeout = '3s';

drop function if exists public.ensure_staff_contact(uuid);
drop function if exists private.rpc_ensure_staff_contact(uuid);

create or replace function private.deal_processor_guard() returns trigger
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
begin
  if new.processor_id is null then return new; end if;
  if tg_op = 'INSERT' or new.processor_id is distinct from old.processor_id then
    if not exists (select 1 from public.profiles p where p.id = new.processor_id and p.status = 'active'
       and p.role in ('Processor', 'Preprocessor', 'Admin', 'Super admin')
       and p.is_demo is not distinct from coalesce(new.is_demo, false)) then
      raise exception 'The Processor on an order must be an active Processor, Preprocessor, Admin or Super admin.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

create or replace function private.deal_sales_guard() returns trigger
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
declare s public.profiles;
begin
  select * into s from public.profiles where id = new.sales_id;
  if s.id is null then raise exception 'Salesperson not found.' using errcode = 'P0001'; end if;
  if coalesce(current_setting('cla.sales_backfill', true), '') = 'on' then return new; end if;
  if s.role not in ('Sales Person', 'Sales Team') then raise exception 'Only a Sales Person or Sales Team user can be a salesperson on an order.' using errcode = 'P0001'; end if;
  if s.status <> 'active' then raise exception 'Only an active salesperson can be added to an order.' using errcode = 'P0001'; end if;
  return new;
end $$;

create or replace function private.deal_tc_guard() returns trigger
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
begin
  if tg_op = 'INSERT' and new.tc_user_id is null and new.created_by is not null and exists (
       select 1 from public.profiles p where p.id = new.created_by and p.role = 'Transaction Coordinator' and p.status = 'active'
         and p.is_demo is not distinct from coalesce(new.is_demo, false)) then
    new.tc_user_id := new.created_by;
  end if;
  if new.tc_user_id is null then return new; end if;
  if tg_op = 'INSERT' or new.tc_user_id is distinct from old.tc_user_id then
    if not exists (select 1 from public.profiles p where p.id = new.tc_user_id and p.status = 'active' and p.role = 'Transaction Coordinator'
         and p.is_demo is not distinct from coalesce(new.is_demo, false)) then
      raise exception 'The Transaction Coordinator on an order must be an active Transaction Coordinator.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

create or replace function private.participant_tc_guard() returns trigger
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
begin
  if new.role = 'Transaction Coordinator' and not exists (
       select 1 from public.contacts c join public.profiles p on p.id = c.profile_id
       where c.id = new.contact_id and p.role = 'Transaction Coordinator' and p.status = 'active') then
    raise exception 'Only an active user with the Transaction Coordinator role can be the Transaction Coordinator on an order.' using errcode = 'P0001'; end if;
  return new; end $$;

create or replace function private.participant_role_guard() returns trigger
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
declare acct text; have text[];
begin
  select p.role into acct from public.contacts c join public.profiles p on p.id = c.profile_id where c.id = new.contact_id and p.status <> 'removed';
  if acct = 'Outside user' then
    if new.role in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator') then
      raise exception 'An outside user cannot be added as CLA staff. Pick Buyer Agent, Listing Agent, Client-Buyer or Client-Seller.' using errcode = 'P0001'; end if;
    if new.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller') then
      select coalesce(array_agg(x.role), '{}') into have from public.deal_participants x where x.deal_id = new.deal_id and x.contact_id = new.contact_id
        and x.id is distinct from new.id and x.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller');
      if cardinality(have) > 0 and not (cardinality(have) = 1 and private.self_rep_pair(have[1], new.role)) then
        raise exception 'This person already has a role on this order. Only an agent buying or selling for themselves can hold two roles (Client-Buyer + Buyer Agent, or Client-Seller + Listing Agent).' using errcode = 'P0001'; end if;
    end if;
  elsif acct is not null and new.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller') then
    raise exception 'This is a CLA staff login, so it keeps its staff role on every order. Agents and clients need an outside-user login.' using errcode = 'P0001';
  end if;
  return new; end $$;

create or replace function private.rpc_coordinator_choices()
returns table(profile_id uuid, contact_id uuid, first_name text, last_name text, email text, phone text, company text)
language plpgsql stable security definer
set search_path to pg_catalog, public, extensions as $$
begin
  if not private.is_processor() then
    raise exception 'Only a Processor or Admin can do this.' using errcode = 'P0001';
  end if;
  return query
  select p.id, c.id, p.first_name, p.last_name, p.email, p.phone, c.company
    from public.profiles p
    join public.contacts c on c.profile_id = p.id
   where p.role = 'Transaction Coordinator'
     and p.status = 'active'
     and p.is_demo is not distinct from private.viewer_is_demo()
     and c.is_demo is not distinct from p.is_demo
   order by p.first_name, p.last_name;
end $$;

create or replace function private.file_roles_of(pid uuid, d uuid)
returns text[]
language sql stable security definer
set search_path to pg_catalog, public, extensions as $$
  select case when pr.role is null then '{}'::text[] when pr.role <> 'Outside user' then array[pr.role]
    else coalesce((select array_agg(x.role order by array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], x.role))
                   from (select distinct p.role from public.deal_participants p join public.contacts c on c.id = p.contact_id
                         where p.deal_id = d and c.profile_id = pid and p.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller')) x), array['Outside user']) end
  from (select (select role from public.profiles where id = pid) as role) pr
$$;

create or replace function private.rpc_my_file_roles_full()
returns table(deal_id uuid, role text, roles text[], label text, self_rep boolean)
language sql stable security definer
set search_path to pg_catalog, public, extensions
set jit to 'off' as $$
  with g as materialized (
    select * from private.reader_gate()
  ),
  visible as (
    select d.id
    from public.deals d
    cross join g
    where private.reader_can_deal(d.id, g.uid, g.role, g.is_admin, g.contact_id, g.active)
  ),
  roles as (
    select v.id as deal_id,
      case
        when g.role is null then '{}'::text[]
        when g.role <> 'Outside user' then array[g.role]::text[]
        else coalesce((
          select array_agg(x.role order by array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], x.role))
          from (
            select distinct p.role
            from public.deal_participants p
            join public.contacts c on c.id = p.contact_id
            where p.deal_id = v.id
              and c.profile_id = g.uid
              and p.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller')
          ) x
        ), array['Outside user']::text[])
      end as roles
    from visible v
    cross join g
  )
  select r.deal_id,
         case
           when g.role is null then null::text
           when g.role <> 'Outside user' then g.role
           else coalesce(r.roles[1], 'Outside user')
         end,
         case when g.role is null then '{}'::text[] else r.roles end,
         case
           when r.roles @> array['Client-Buyer', 'Buyer Agent']::text[] then 'Buyer + Buyer''s Agent'
           when r.roles @> array['Client-Seller', 'Listing Agent']::text[] then 'Seller + Listing Agent'
           else coalesce(r.roles[1], 'Outside user')
         end,
         coalesce(cardinality(r.roles) = 2 and (
           (r.roles[1] = 'Client-Buyer' and r.roles[2] = 'Buyer Agent')
           or (r.roles[1] = 'Buyer Agent' and r.roles[2] = 'Client-Buyer')
           or (r.roles[1] = 'Client-Seller' and r.roles[2] = 'Listing Agent')
           or (r.roles[1] = 'Listing Agent' and r.roles[2] = 'Client-Seller')
         ), false)
  from roles r
  cross join g
  where g.active
$$;

select private.lock_function_search_paths();
commit;
notify pgrst, 'reload schema';
