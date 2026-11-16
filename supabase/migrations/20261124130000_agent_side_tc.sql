-- FF-088 (Francis Santos, Nov 16 2026, 3:10 PM ET, file MD-26-97386).
-- The buyer's transaction coordinator and the listing transaction coordinator are outside
-- contacts (the agents' coordinators). They are not the CLA staff Transaction Coordinator.
-- The staff rule still applies only when the role is Transaction Coordinator.
-- Not applied by this commit. Rollback: supabase/rollbacks/20261124130000_agent_side_tc.sql
begin;
set local lock_timeout = '3s';

create or replace function private.participant_tc_guard() returns trigger
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
begin
  -- Agent-side coordinators are outside contacts. Do not run the staff check on them.
  if new.role in ('Buyer Agent TC', 'Listing Agent TC') then
    return new;
  end if;
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
  select r in ('Client-Seller', 'Buyer Agent', 'Listing Agent', 'Transaction Coordinator', 'Buyer Agent TC', 'Listing Agent TC')
$$;

create or replace function private.side_of(r text) returns text
language sql immutable set search_path to pg_catalog, public, extensions as $$
  select case r
    when 'Buyer Agent' then 'buyer'
    when 'Client-Buyer' then 'buyer'
    when 'Buyer Agent TC' then 'buyer'
    when 'Listing Agent' then 'seller'
    when 'Client-Seller' then 'seller'
    when 'Listing Agent TC' then 'seller'
  end
$$;

do $chk$
declare def text;
begin
  if not private.refi_blocked_role('Buyer Agent TC')
     or not private.refi_blocked_role('Listing Agent TC')
     or not private.refi_blocked_role('Transaction Coordinator')
     or not private.refi_blocked_role('Buyer Agent')
     or not private.refi_blocked_role('Listing Agent')
     or not private.refi_blocked_role('Client-Seller') then
    raise exception 'self-check: a refinance must still block sellers, agents, and coordinators';
  end if;
  if private.refi_blocked_role('Processor') or private.refi_blocked_role('Client-Buyer') or private.refi_blocked_role('Lender') then
    raise exception 'self-check: a refinance still allows the borrower, the Processor, and the Lender';
  end if;
  if private.side_of('Buyer Agent TC') is distinct from 'buyer'
     or private.side_of('Listing Agent TC') is distinct from 'seller'
     or private.side_of('Buyer Agent') is distinct from 'buyer'
     or private.side_of('Listing Agent') is distinct from 'seller' then
    raise exception 'self-check: agent coordinator side';
  end if;
  if private.side_of('Transaction Coordinator') is not null then
    raise exception 'self-check: the CLA Transaction Coordinator is not a buyer or seller side';
  end if;
  def := pg_get_functiondef('private.participant_tc_guard()'::regprocedure);
  if position('Only an active staff login can be the Transaction Coordinator on an order.' in def) = 0 then
    raise exception 'self-check: the staff Transaction Coordinator rule is missing';
  end if;
  if position('Buyer Agent TC' in def) = 0 or position('Listing Agent TC' in def) = 0 then
    raise exception 'self-check: the agent coordinator must stay separate from the staff rule';
  end if;
end $chk$;

select private.lock_function_search_paths();

commit;

notify pgrst, 'reload schema';
