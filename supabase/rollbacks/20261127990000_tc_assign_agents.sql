-- Rollback for 20261127990000_tc_assign_agents.sql (TC-ASSIGN-1). Puts back the TEST body of private.place_agent_tcs captured
-- Nov 21 2026 and removes the file trigger and the new functions. Links and coordinator file rows the change added are data and stay;
-- remove a link from the agent's or the coordinator's record if it should go.
begin;
set local lock_timeout = '3s';
drop trigger if exists participants_tc_link on public.deal_participants;
drop function if exists private.link_tcs_from_file();
drop function if exists public.tc_agents(uuid);
drop function if exists private.rpc_tc_agents(uuid);
CREATE OR REPLACE FUNCTION private.place_agent_tcs(p_agent uuid, p_deal uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  insert into public.deal_participants (deal_id, contact_id, role)
  select p.deal_id, l.tc_contact_id,
         case p.role when 'Listing Agent' then 'Listing Agent TC' else 'Buyer Agent TC' end
  from public.deal_participants p
  join public.deals d on d.id = p.deal_id
  join public.agent_tc_links l on l.agent_contact_id = p.contact_id
  where p.contact_id = p_agent
    and p.role in ('Buyer Agent', 'Listing Agent')
    and (p_deal is null or p.deal_id = p_deal)
    and (p_deal is not null or d.status = 'Open')
    and d.transaction_type is distinct from 'Refinance'
    and l.tc_contact_id is distinct from p.contact_id
    and not exists (
      select 1 from public.deal_participants x
      where x.deal_id = p.deal_id
        and x.contact_id = l.tc_contact_id
        and x.role = case p.role when 'Listing Agent' then 'Listing Agent TC' else 'Buyer Agent TC' end
    );
end $function$;
drop function if exists private.same_person(uuid, uuid);
drop function if exists private.tc_is_staff(uuid);
commit;
