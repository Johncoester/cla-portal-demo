-- TEST bodies captured Nov 21 2026 for the TC-ASSIGN-1 local test (agent_tc_link_not_self, participant_tc_not_self, place_agent_tcs before the change).
CREATE OR REPLACE FUNCTION private.agent_tc_link_not_self()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
    begin
      if new.agent_contact_id = new.tc_contact_id then
        raise exception 'This agent cannot be their own transaction coordinator.' using errcode = 'P0001';
      end if;
      if exists (
        select 1
        from public.contacts agent
        join public.contacts tc on tc.id = new.tc_contact_id
        where agent.id = new.agent_contact_id
          and btrim(coalesce(agent.email, '')) <> ''
          and lower(btrim(agent.email)) = lower(btrim(coalesce(tc.email, '')))
      ) then
        raise exception 'This agent cannot be their own transaction coordinator.' using errcode = 'P0001';
      end if;
      return new;
    end
    $function$;

CREATE OR REPLACE FUNCTION private.participant_tc_not_self()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  agent_role text;
  side_label text;
begin
  if new.role = 'Buyer Agent TC' then
    agent_role := 'Buyer Agent';
    side_label := 'Buyer Agent';
  elsif new.role = 'Listing Agent TC' then
    agent_role := 'Listing Agent';
    side_label := 'Listing Agent';
  else
    return new;
  end if;
  if exists (
    select 1
    from public.deal_participants agent
    join public.contacts ac on ac.id = agent.contact_id
    join public.contacts tc on tc.id = new.contact_id
    where agent.deal_id = new.deal_id
      and agent.role = agent_role
      and agent.id is distinct from new.id
      and (
        agent.contact_id = new.contact_id
        or (
          btrim(coalesce(ac.email, '')) <> ''
          and lower(btrim(ac.email)) = lower(btrim(coalesce(tc.email, '')))
        )
      )
  ) then
    raise exception 'This person is already the % on this order. A transaction coordinator must be a different person.', side_label
      using errcode = 'P0001';
  end if;
  return new;
end
$function$;

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

create or replace function private.place_agent_tcs_row() returns trigger language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
begin perform private.place_agent_tcs(new.contact_id, new.deal_id); return new; end $$;
create or replace function private.place_agent_tcs_link() returns trigger language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
begin perform private.place_agent_tcs(new.agent_contact_id, null); return new; end $$;
create trigger agent_tc_place_on_agent after insert on public.deal_participants for each row when (new.role in ('Buyer Agent', 'Listing Agent')) execute function private.place_agent_tcs_row();
create trigger participants_tc_not_self before insert on public.deal_participants for each row execute function private.participant_tc_not_self();
create trigger agent_tc_link_not_self before insert on public.agent_tc_links for each row execute function private.agent_tc_link_not_self();
create trigger agent_tc_place_on_link after insert on public.agent_tc_links for each row execute function private.place_agent_tcs_link();
