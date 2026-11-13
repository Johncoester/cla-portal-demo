-- ANYROLE-1 (John, call + chat 3:07 PM ET Nov 13). At the file level, any active staff login
-- (Super admin, Admin, Processor, Preprocessor, Sales Person, Sales Team, Transaction Coordinator)
-- can be the Processor, a salesperson, the Transaction Coordinator, or a party (buyer, seller,
-- agent, lender, and so on). Account roles at the admin level are unchanged.
-- A staff login added as a buyer or seller gets a contact linked to their login so they can
-- open that file. Demo and real logins stay in their own world.
-- The CRM Owner check is not changed.
-- Not applied by this commit.
begin;
set local lock_timeout = '3s';

create or replace function private.deal_processor_guard() returns trigger
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
begin
  if new.processor_id is null then return new; end if;
  if tg_op = 'INSERT' or new.processor_id is distinct from old.processor_id then
    if not exists (select 1 from public.profiles p where p.id = new.processor_id and p.status = 'active'
       and p.role in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin')
       and p.is_demo is not distinct from coalesce(new.is_demo, false)) then
      raise exception 'The Processor on an order must be an active staff login.' using errcode = 'P0001';
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
  if s.role not in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin')
     or s.status <> 'active' then
    raise exception 'Only an active staff login can be a salesperson on an order.' using errcode = 'P0001';
  end if;
  if s.is_demo is distinct from coalesce((select d.is_demo from public.deals d where d.id = new.deal_id), false) then
    raise exception 'A real order cannot use a demo login, and a demo order cannot use a real login.' using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace function private.deal_tc_guard() returns trigger
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
begin
  if tg_op = 'INSERT' and new.tc_user_id is null and new.created_by is not null and exists (
       select 1 from public.profiles p where p.id = new.created_by
         and p.role in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin')
         and p.status = 'active'
         and p.is_demo is not distinct from coalesce(new.is_demo, false)
         and p.role = 'Transaction Coordinator') then
    new.tc_user_id := new.created_by;
  end if;
  if new.tc_user_id is null then return new; end if;
  if tg_op = 'INSERT' or new.tc_user_id is distinct from old.tc_user_id then
    if not exists (select 1 from public.profiles p where p.id = new.tc_user_id and p.status = 'active'
         and p.role in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin')
         and p.is_demo is not distinct from coalesce(new.is_demo, false)) then
      raise exception 'The Transaction Coordinator on an order must be an active staff login.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

create or replace function private.participant_tc_guard() returns trigger
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
begin
  if new.role = 'Transaction Coordinator' and not exists (
       select 1 from public.contacts c join public.profiles p on p.id = c.profile_id
       where c.id = new.contact_id
         and p.role in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin')
         and p.status = 'active') then
    raise exception 'Only an active staff login can be the Transaction Coordinator on an order.' using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace function private.participant_role_guard() returns trigger
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
declare acct text; have text[];
begin
  select p.role into acct from public.contacts c join public.profiles p on p.id = c.profile_id where c.id = new.contact_id and p.status <> 'removed';
  if acct = 'Outside user' then
    if new.role in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin') then
      raise exception 'An outside user cannot be added as CLA staff. Pick Buyer Agent, Listing Agent, Client-Buyer or Client-Seller.' using errcode = 'P0001';
    end if;
  end if;
  if new.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller') then
    select coalesce(array_agg(x.role), '{}') into have from public.deal_participants x
      where x.deal_id = new.deal_id and x.contact_id = new.contact_id
        and x.id is distinct from new.id and x.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller');
    if cardinality(have) > 0 and not (cardinality(have) = 1 and private.self_rep_pair(have[1], new.role)) then
      raise exception 'This person already has a role on this order. Only an agent buying or selling for themselves can hold two roles (Client-Buyer + Buyer Agent, or Client-Seller + Listing Agent).' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

create or replace function private.rpc_coordinator_choices()
returns table(profile_id uuid, contact_id uuid, first_name text, last_name text, email text, phone text, company text)
language plpgsql stable security definer
set search_path to pg_catalog, public, extensions as $$
begin
  if not private.is_processor() then
    raise exception 'Only a Processor or Admin can do this.' using errcode = 'P0001';
  end if;
  return query
  select p.id, c.id, p.first_name, p.last_name, p.email, p.phone, coalesce(c.company, '')
    from public.profiles p
    left join public.contacts c on c.profile_id = p.id
   where p.role in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin')
     and p.status = 'active'
     and p.is_demo is not distinct from private.viewer_is_demo()
     and (c.id is null or c.is_demo is not distinct from p.is_demo)
   order by p.first_name, p.last_name;
end $$;

create or replace function private.file_roles_of(pid uuid, d uuid)
returns text[]
language sql stable security definer
set search_path to pg_catalog, public, extensions as $$
  select case
    when pr.role is null then '{}'::text[]
    when pr.role <> 'Outside user' then
      coalesce((
        select array_agg(q.r order by q.ord, array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], q.r))
        from (
          select pr.role as r, 0 as ord
          union all
          select x.role, 1
          from (
            select distinct p.role
            from public.deal_participants p
            join public.contacts c on c.id = p.contact_id
            where p.deal_id = d and c.profile_id = pid
              and p.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller')
          ) x
        ) q
      ), array[pr.role])
    else coalesce((
      select array_agg(x.role order by array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], x.role))
      from (
        select distinct p.role
        from public.deal_participants p
        join public.contacts c on c.id = p.contact_id
        where p.deal_id = d and c.profile_id = pid
          and p.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller')
      ) x
    ), array['Outside user'])
  end
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
  party as (
    select v.id as deal_id, p.role
    from visible v
    cross join g
    join public.deal_participants p on p.deal_id = v.id
    join public.contacts c on c.id = p.contact_id and c.profile_id = g.uid
    where p.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller')
  ),
  roles as (
    select v.id as deal_id,
      case
        when g.role is null then '{}'::text[]
        when g.role <> 'Outside user' then
          coalesce((
            select array_agg(q.r order by q.ord, array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], q.r))
            from (
              select g.role as r, 0 as ord
              union all
              select p.role, 1 from party p where p.deal_id = v.id
            ) q
          ), array[g.role]::text[])
        else coalesce((
          select array_agg(p.role order by array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], p.role))
          from party p where p.deal_id = v.id
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
           when g.role is distinct from 'Outside user' then g.role
           else coalesce(r.roles[1], 'Outside user')
         end,
         coalesce((
           select cardinality(array_agg(distinct p.role)) = 2 and (
             (array_agg(distinct p.role) @> array['Client-Buyer', 'Buyer Agent']::text[])
             or (array_agg(distinct p.role) @> array['Client-Seller', 'Listing Agent']::text[])
           )
           from party p where p.deal_id = r.deal_id
         ), false)
  from roles r
  cross join g
  where g.active
$$;

create or replace function private.rpc_ensure_staff_contact(p_profile uuid)
returns uuid
language plpgsql security definer
set search_path to pg_catalog, public, extensions as $$
declare p public.profiles; cid uuid; me uuid := private.effective_uid();
begin
  if me is null or not private.is_processor() then
    raise exception 'Only a Processor or Admin can do this.' using errcode = 'P0001';
  end if;
  if p_profile is null then
    raise exception 'Pick a person first.' using errcode = 'P0001';
  end if;
  select * into p from public.profiles where id = p_profile and status = 'active'
    and role in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin');
  if p.id is null then
    raise exception 'That person is not an active staff login.' using errcode = 'P0001';
  end if;
  if p.is_demo is distinct from private.viewer_is_demo() then
    raise exception 'A real order cannot use a demo login, and a demo order cannot use a real login.' using errcode = 'P0001';
  end if;
  select c.id into cid from public.contacts c where c.profile_id = p.id order by c.created_at, c.id limit 1;
  if cid is not null then return cid; end if;
  if btrim(coalesce(p.email, '')) <> '' then
    select c.id into cid from public.contacts c
      where c.profile_id is null and btrim(coalesce(c.email, '')) <> '' and lower(c.email) = lower(btrim(p.email))
      order by c.created_at, c.id limit 1;
    if cid is not null then
      update public.contacts
         set profile_id = p.id,
             first_name = coalesce(nullif(btrim(first_name), ''), p.first_name),
             last_name = coalesce(nullif(btrim(last_name), ''), p.last_name),
             is_demo = p.is_demo
       where id = cid;
      return cid;
    end if;
  end if;
  insert into public.contacts (profile_id, first_name, last_name, email, phone, company, is_demo)
  values (p.id, coalesce(p.first_name, ''), coalesce(p.last_name, ''), coalesce(p.email, ''),
          coalesce(p.phone, ''), '', coalesce(p.is_demo, false))
  returning id into cid;
  return cid;
end $$;

create or replace function public.ensure_staff_contact(p_profile uuid)
returns uuid
language plpgsql
set search_path to pg_catalog, public, extensions as $$
begin
  return private.rpc_ensure_staff_contact(p_profile);
end $$;

revoke all on function public.ensure_staff_contact(uuid) from public, anon;
grant execute on function public.ensure_staff_contact(uuid) to authenticated;

select private.lock_function_search_paths();

commit;

notify pgrst, 'reload schema';
