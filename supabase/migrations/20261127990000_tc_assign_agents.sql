-- TC-ASSIGN-1 (John, Nov 21 2026): assign an agent to a transaction coordinator at the admin level, on the coordinator's contact
-- record, or within a file. The assignment works both ways, and the coordinator then goes on ALL of that agent's files.
-- Rule 9 waived by John for the TC fixes, Nov 21 2026. Spec: docs/specs/tc-assign-agents.md
-- * private.place_agent_tcs: a new link now puts the coordinator on every file the agent is on (open, closed, on hold or cancelled),
--   not only open files. Refinances are still left out (no agents). A file where that side already has an agent with the coordinator's
--   own email is skipped instead of failing (participant_tc_not_self would refuse it).
-- * Within a file: adding a coordinator as Buyer Agent TC / Listing Agent TC links them to that side's agent(s) on the file, and adding an
--   agent links them to a coordinator already on that side. The link then puts the coordinator on all of that agent's files (the
--   existing agent_tc_place_on_link trigger). Only a person's own add does this: a coordinator placed by a link does not link onward
--   (pg_trigger_depth() = 1), so one shared file does not chain the coordinator to every co-agent.
-- * public.tc_agents(p_tc): the agents a coordinator works with, for the coordinator's contact record and User List > Edit user.
--   Adding and removing from that side uses the existing link_agent_tc / unlink_agent_tc (same permission: processor or admin, or the
--   agent on their own contact).
-- * One-time: coordinators already on a file next to that side's agent are linked to that agent, and every linked coordinator is put on
--   all of their agent's files. A CLA staff login is never linked. The same person (or the same email) as the agent is never linked.
-- No table or policy change. Rollback: supabase/rollbacks/20261127990000_tc_assign_agents.sql (links and file rows it added stay).
begin;
set local lock_timeout = '3s';

do $$
declare h text;
begin
  select encode(sha256(convert_to(pg_get_functiondef('private.place_agent_tcs(uuid,uuid)'::regprocedure), 'UTF8')), 'hex') into h;
  if h is distinct from '418720320dd5e303d59df0bde69d03f8586ae8ba92b867e5f34344ed4fd08aaa' then
    raise exception 'drift: private.place_agent_tcs is not the body this file expects';
  end if;
  if to_regprocedure('public.tc_agents(uuid)') is not null or to_regprocedure('private.link_tcs_from_file()') is not null then
    raise exception 'drift: TC-ASSIGN-1 functions already exist';
  end if;
  if to_regclass('public.agent_tc_links') is null then raise exception 'drift: agent_tc_links is missing'; end if;
end $$;

-- A CLA staff login (any active or disabled non-outside account) is never an agent's coordinator.
create or replace function private.tc_is_staff(p_contact uuid)
returns boolean
language sql
stable
security definer
set search_path to pg_catalog, public, extensions
as $$
  select exists (
    select 1 from public.contacts c join public.profiles p on p.id = c.profile_id
    where c.id = p_contact and p.status <> 'removed' and p.role <> 'Outside user'
  )
$$;

-- The same person, or the same non-blank email.
create or replace function private.same_person(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path to pg_catalog, public, extensions
as $$
  select a = b or exists (
    select 1 from public.contacts x join public.contacts y on y.id = b
    where x.id = a and btrim(coalesce(x.email, '')) <> '' and lower(btrim(x.email)) = lower(btrim(coalesce(y.email, '')))
  )
$$;

create or replace function private.place_agent_tcs(p_agent uuid, p_deal uuid)
returns void
language plpgsql
security definer
set search_path to pg_catalog, public, extensions
as $$
begin
  -- TC-ASSIGN-1: every file the agent is on (p_deal null), not only open files.
  insert into public.deal_participants (deal_id, contact_id, role)
  select distinct p.deal_id, l.tc_contact_id,
         case p.role when 'Listing Agent' then 'Listing Agent TC' else 'Buyer Agent TC' end
  from public.deal_participants p
  join public.deals d on d.id = p.deal_id
  join public.agent_tc_links l on l.agent_contact_id = p.contact_id
  where p.contact_id = p_agent
    and p.role in ('Buyer Agent', 'Listing Agent')
    and (p_deal is null or p.deal_id = p_deal)
    and d.transaction_type is distinct from 'Refinance'
    and l.tc_contact_id is distinct from p.contact_id
    and not exists (
      select 1 from public.deal_participants x
      where x.deal_id = p.deal_id
        and x.contact_id = l.tc_contact_id
        and x.role = case p.role when 'Listing Agent' then 'Listing Agent TC' else 'Buyer Agent TC' end
    )
    and not exists (
      select 1 from public.deal_participants y
      where y.deal_id = p.deal_id and y.role = p.role and private.same_person(y.contact_id, l.tc_contact_id)
    );
end $$;

-- Within a file: a coordinator added next to that side's agent (or an agent added next to that side's coordinator) is linked.
create or replace function private.link_tcs_from_file()
returns trigger
language plpgsql
security definer
set search_path to pg_catalog, public, extensions
as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;   -- a coordinator placed by a link does not link onward
  if exists (select 1 from public.deals d where d.id = new.deal_id and d.transaction_type = 'Refinance') then return new; end if;
  if new.role in ('Buyer Agent TC', 'Listing Agent TC') then
    if private.tc_is_staff(new.contact_id) then return new; end if;
    insert into public.agent_tc_links (agent_contact_id, tc_contact_id, created_by)
    select distinct a.contact_id, new.contact_id, private.effective_uid()
    from public.deal_participants a
    where a.deal_id = new.deal_id
      and a.role = case new.role when 'Listing Agent TC' then 'Listing Agent' else 'Buyer Agent' end
      and not private.same_person(a.contact_id, new.contact_id)
    on conflict (agent_contact_id, tc_contact_id) do nothing;
  elsif new.role in ('Buyer Agent', 'Listing Agent') then
    insert into public.agent_tc_links (agent_contact_id, tc_contact_id, created_by)
    select distinct new.contact_id, t.contact_id, private.effective_uid()
    from public.deal_participants t
    where t.deal_id = new.deal_id
      and t.role = new.role || ' TC'
      and not private.same_person(new.contact_id, t.contact_id)
      and not private.tc_is_staff(t.contact_id)
    on conflict (agent_contact_id, tc_contact_id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists participants_tc_link on public.deal_participants;
create trigger participants_tc_link
  after insert on public.deal_participants
  for each row
  when (new.role in ('Buyer Agent', 'Listing Agent', 'Buyer Agent TC', 'Listing Agent TC'))
  execute function private.link_tcs_from_file();

-- The agents a coordinator works with (the other side of agent_tcs).
create or replace function private.rpc_tc_agents(p_tc uuid)
returns table (contact_id uuid, first_name text, last_name text, email text, phone text, company text, profile_id uuid, created_at timestamptz)
language plpgsql
stable
security definer
set search_path to pg_catalog, public, extensions
as $$
begin
  if private.effective_uid() is null then
    raise exception 'Please sign in.' using errcode = '42501';
  end if;
  if p_tc is null or not exists (select 1 from public.contacts c where c.id = p_tc) or not private.contact_visible(p_tc) then
    raise exception 'That person was not found. Pick someone from the list, or enter their name.' using errcode = 'P0002';
  end if;
  return query
  select c.id, c.first_name, c.last_name, c.email, c.phone, c.company, c.profile_id, l.created_at
  from public.agent_tc_links l
  join public.contacts c on c.id = l.agent_contact_id
  where l.tc_contact_id = p_tc
  order by c.first_name, c.last_name, c.id;
end $$;

create or replace function public.tc_agents(p_tc uuid)
returns table (contact_id uuid, first_name text, last_name text, email text, phone text, company text, profile_id uuid, created_at timestamptz)
language sql
security definer
set search_path to pg_catalog, public, extensions
as $$
  select * from private.rpc_tc_agents(p_tc)
$$;

revoke all on function private.tc_is_staff(uuid) from public, anon, authenticated;
revoke all on function private.same_person(uuid, uuid) from public, anon, authenticated;
revoke all on function private.link_tcs_from_file() from public, anon, authenticated;
revoke all on function private.rpc_tc_agents(uuid) from public, anon, authenticated;
revoke all on function public.tc_agents(uuid) from public, anon;
grant execute on function public.tc_agents(uuid) to authenticated;

-- One-time: coordinators already on a file next to that side's agent (the link trigger then places them on the agent's other files),
-- then every existing link onto all of the agent's files.
insert into public.agent_tc_links (agent_contact_id, tc_contact_id, created_by)
select distinct a.contact_id, t.contact_id, null::uuid
from public.deal_participants t
join public.deal_participants a on a.deal_id = t.deal_id and a.role = case t.role when 'Listing Agent TC' then 'Listing Agent' else 'Buyer Agent' end
join public.deals d on d.id = t.deal_id
where t.role in ('Buyer Agent TC', 'Listing Agent TC')
  and d.transaction_type is distinct from 'Refinance'
  and not private.same_person(a.contact_id, t.contact_id)
  and not private.tc_is_staff(t.contact_id)
on conflict (agent_contact_id, tc_contact_id) do nothing;

select private.place_agent_tcs(x.agent_contact_id, null) from (select distinct agent_contact_id from public.agent_tc_links) x;

commit;
