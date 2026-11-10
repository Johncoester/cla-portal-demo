-- Place Order Team & Notes: the TC dropdown reads public.coordinator_choices(), which
-- inner-joins contacts. HR accept creates a Transaction Coordinator profile and does
-- not create a contact, so the two real TEST coordinators never appear.
-- This migration:
--   1. Backfills one contact for each active Transaction Coordinator who has none
--      (same demo flag as the profile). Marked in contacts.custom so rollback can find them.
--   2. After insert, or when role/status becomes an active TC, creates that contact.
--   3. coordinator_choices stays on the caller's demo side (the function is security definer
--      and was returning demo and real coordinators together).
-- Not applied by this commit. Rollback: supabase/rollbacks/20261110103000_tc_place_order_contact.sql
begin;
set local lock_timeout = '3s';
do $$
begin
  if to_regprocedure('private.rpc_coordinator_choices()') is null then
    raise exception 'drift: private.rpc_coordinator_choices() missing';
  end if;
  if (select md5(prosrc) from pg_proc where oid = to_regprocedure('private.rpc_coordinator_choices()'))
       is distinct from '037e34abe73fbdc96afc95de921966ed' then
    raise exception 'drift: private.rpc_coordinator_choices() changed';
  end if;
  if to_regprocedure('private.profile_ensure_tc_contact()') is not null then
    raise exception 'drift: private.profile_ensure_tc_contact() already exists';
  end if;
  if exists (select 1 from pg_trigger where tgname = 'profiles_tc_contact' and tgrelid = 'public.profiles'::regclass) then
    raise exception 'drift: profiles_tc_contact already exists';
  end if;
end $$;

insert into public.contacts (profile_id, first_name, last_name, email, phone, company, is_demo, custom)
select p.id,
       coalesce(p.first_name, ''),
       coalesce(p.last_name, ''),
       coalesce(p.email, ''),
       coalesce(p.phone, ''),
       '',
       coalesce(p.is_demo, false),
       '{"source":"20261110103000_tc_contact"}'::jsonb
  from public.profiles p
 where p.role = 'Transaction Coordinator'
   and p.status = 'active'
   and not exists (select 1 from public.contacts c where c.profile_id = p.id)
   and not exists (
     select 1 from public.contacts c
      where c.email <> '' and p.email <> '' and lower(c.email) = lower(p.email)
   );

create function private.profile_ensure_tc_contact() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
begin
  if new.role = 'Transaction Coordinator' and new.status = 'active'
     and not exists (select 1 from public.contacts c where c.profile_id = new.id)
     and not exists (
       select 1 from public.contacts c
        where c.email <> '' and coalesce(new.email, '') <> '' and lower(c.email) = lower(new.email)
     ) then
    insert into public.contacts (profile_id, first_name, last_name, email, phone, company, is_demo, custom)
    values (new.id, coalesce(new.first_name, ''), coalesce(new.last_name, ''), coalesce(new.email, ''),
            coalesce(new.phone, ''), '', coalesce(new.is_demo, false),
            '{"source":"20261110103000_tc_contact"}'::jsonb);
  end if;
  return new;
exception when unique_violation then
  return new;
end $$;
revoke all on function private.profile_ensure_tc_contact() from public, anon, authenticated;

create trigger profiles_tc_contact
  after insert or update of role, status on public.profiles
  for each row execute function private.profile_ensure_tc_contact();

create or replace function private.rpc_coordinator_choices()
returns table(profile_id uuid, contact_id uuid, first_name text, last_name text, email text, phone text, company text)
language plpgsql stable security definer set search_path = pg_catalog, public, extensions as $$
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

do $$
begin
  if exists (
    select 1 from public.profiles p
     where p.role = 'Transaction Coordinator' and p.status = 'active'
       and not exists (select 1 from public.contacts c where c.profile_id = p.id)
       and not exists (
         select 1 from public.contacts c
          where c.email <> '' and p.email <> '' and lower(c.email) = lower(p.email)
       )
  ) then
    raise exception 'self-check: an active Transaction Coordinator still has no contact';
  end if;
end $$;
commit;
