-- Rollback FF-088. Restores the coordinator checks from before the agent-side roles.
-- The staff Transaction Coordinator rule is unchanged by the forward file; this puts the
-- earlier function text back, including the refinance list and side_of.
begin;
set local lock_timeout = '3s';

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

create or replace function private.refi_blocked_role(r text) returns boolean
language sql immutable set search_path to pg_catalog, public, extensions as $$
  select r in ('Client-Seller', 'Buyer Agent', 'Listing Agent', 'Transaction Coordinator')
$$;

create or replace function private.side_of(r text) returns text
language sql immutable set search_path to pg_catalog, public, extensions as $$
  select case r when 'Buyer Agent' then 'buyer' when 'Client-Buyer' then 'buyer' when 'Listing Agent' then 'seller' when 'Client-Seller' then 'seller' end
$$;

select private.lock_function_search_paths();

commit;

notify pgrst, 'reload schema';
