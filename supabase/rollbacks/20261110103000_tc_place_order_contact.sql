-- Rollback for 20261110103000_tc_place_order_contact.sql.
-- Drops the TC contact trigger, restores coordinator_choices without the demo filter,
-- and deletes only the contacts this migration inserted, and only when no file uses them.
begin;
set local lock_timeout = '3s';

drop trigger if exists profiles_tc_contact on public.profiles;
drop function if exists private.profile_ensure_tc_contact();

create or replace function private.rpc_coordinator_choices()
returns table(profile_id uuid, contact_id uuid, first_name text, last_name text, email text, phone text, company text)
language plpgsql stable security definer set search_path = pg_catalog, public, extensions as $$
begin
  if not private.is_processor() then raise exception 'Only a Processor or Admin can do this.' using errcode = 'P0001'; end if;
  return query select p.id, c.id, p.first_name, p.last_name, p.email, p.phone, c.company from public.profiles p join public.contacts c on c.profile_id = p.id
    where p.role = 'Transaction Coordinator' and p.status = 'active' order by p.first_name, p.last_name; end $$;

delete from public.contacts c
 where c.custom = '{"source":"20261110103000_tc_contact"}'::jsonb
   and not exists (select 1 from public.deal_participants dp where dp.contact_id = c.id);

commit;
