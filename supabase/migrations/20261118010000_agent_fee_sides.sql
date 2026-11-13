-- AF-2 Agent fees: which agent sides the signed-in person may see on a file, and whether they may change them
-- (John, Nov 12 2026; spec docs/specs/agent-fees-flow.md). Uses the AF-1 rule private.agent_fee_actor (20261117100000_agent_fees.sql):
-- staff who run the file and the file's agents / TCs get 'edit' for their sides, other CLA staff on the file get 'read',
-- buyers, sellers and anyone else get no rows. A refinance has no agent sides.
begin;
set local lock_timeout = '3s';

create or replace function public.agent_fee_sides(p_deal uuid)
returns table (side text, access text)
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select s.side, case when a.actor = 'reader' then 'read' else 'edit' end
  from (values ('listing', 1), ('buyer', 2)) s(side, ord)
  cross join lateral (select private.agent_fee_actor(p_deal, s.side) as actor) a
  where a.actor is not null
    and exists (select 1 from public.deals d where d.id = p_deal and d.transaction_type is distinct from 'Refinance')
  order by s.ord $$;

comment on function public.agent_fee_sides(uuid) is 'AF-2: the agent sides (listing, buyer) the caller may see on a file, with read or edit.';
revoke all on function public.agent_fee_sides(uuid) from public, anon;
grant execute on function public.agent_fee_sides(uuid) to authenticated;

commit;
