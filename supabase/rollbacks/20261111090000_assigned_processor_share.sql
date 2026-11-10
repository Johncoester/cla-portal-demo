-- Restores the share list from before FF-018. The all-processors fallback returns,
-- and message_recipients no longer includes email.
begin;
set local lock_timeout = '3s';

create or replace function private.deal_cla_staff(d uuid) returns setof uuid
language sql stable security definer
set search_path to 'pg_catalog', 'public', 'extensions' as $function$
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
      from public.profiles p
      where p.status = 'active' and p.role = 'Processor'
        and p.is_demo is not distinct from (select z.is_demo from public.deals z where z.id = d)
        and not exists (select 1 from public.deals z where z.id = d and z.processor_id is not null)
  ) x
  where x.pid is not null
$function$;
revoke all on function private.deal_cla_staff(uuid) from public, anon, authenticated;

drop function if exists public.message_recipients(uuid);
drop function if exists private.rpc_message_recipients(uuid);

create function private.rpc_message_recipients(p_deal uuid)
returns table(id uuid, first_name text, last_name text, role text, side text)
language sql stable security definer
set search_path to 'pg_catalog', 'public', 'extensions' as $function$
  select distinct p.id, p.first_name, p.last_name, private.person_label(p.id, p_deal), private.person_side(p.id, p_deal)
  from public.profiles p where private.can_access_deal(p_deal) and p.status = 'active' and p.id <> private.effective_uid()
    and (p.id in (select c.profile_id from public.deal_participants dp join public.contacts c on c.id = dp.contact_id where dp.deal_id = p_deal and private.participant_visible(p_deal, dp.role))
         or p.id in (select private.deal_cla_staff(p_deal)))
    and private.can_message(p.id, p_deal) $function$;

create function public.message_recipients(p_deal uuid)
returns table(id uuid, first_name text, last_name text, role text, side text)
language plpgsql stable
set search_path to 'pg_catalog', 'public', 'extensions' as $function$
begin
  return query select * from private.rpc_message_recipients(p_deal);
end
$function$;

revoke all on function private.rpc_message_recipients(uuid) from public, anon;
grant execute on function private.rpc_message_recipients(uuid) to authenticated;
revoke all on function public.message_recipients(uuid) from public, anon;
grant execute on function public.message_recipients(uuid) to authenticated, service_role;

do $readback$
begin
  if (select md5(p.prosrc) from pg_proc p where p.oid = 'private.deal_cla_staff(uuid)'::regprocedure)
       is distinct from '76a5797ab96e7c056eade8d6a896c6af' then
    raise exception 'rollback check: private.deal_cla_staff not restored';
  end if;
  if (select md5(p.prosrc) from pg_proc p where p.oid = 'private.rpc_message_recipients(uuid)'::regprocedure)
       is distinct from 'f0a491283502a9fa8c075557fa2ca601' then
    raise exception 'rollback check: private.rpc_message_recipients not restored';
  end if;
end
$readback$;
commit;
