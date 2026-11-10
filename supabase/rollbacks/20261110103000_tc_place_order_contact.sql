-- Rollback for 20261110103000_tc_place_order_contact.sql.
-- Drops the TC contact trigger, restores coordinator_choices without the demo filter,
-- and deletes only the contacts recorded in private.migration_20261110103000_tc_contacts,
-- and only when no file uses them. contacts.custom is not read or written.
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

do $$
begin
  if to_regclass('private.migration_20261110103000_tc_contacts') is null then
    return;
  end if;
  delete from public.contacts c
   using private.migration_20261110103000_tc_contacts m
   where c.id = m.contact_id
     and not exists (select 1 from public.deal_participants dp where dp.contact_id = c.id);
  delete from private.migration_20261110103000_tc_contacts m
   where not exists (select 1 from public.contacts c where c.id = m.contact_id);
  if not exists (select 1 from private.migration_20261110103000_tc_contacts) then
    drop table private.migration_20261110103000_tc_contacts;
  end if;
end $$;

commit;
