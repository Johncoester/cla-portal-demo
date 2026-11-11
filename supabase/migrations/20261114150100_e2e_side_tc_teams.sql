-- E2E fixture only. A Transaction Coordinator assists one side. The coordinator
-- already on MD-26-99001 assists the buyer agent, so the buyer sees that
-- coordinator and the seller sees none. It does not change who a buyer or
-- seller can message. Not applied by this commit.
begin;
set local lock_timeout = '3s';

do $e2e$
declare
  buyer_agent uuid;
  coordinator uuid;
  buyer_team uuid := 'e2e00000-0000-4000-8000-0000000000b1';
begin
  select p.id into buyer_agent from public.profiles p where lower(p.email) = 'clatestportal+e2e-buyer-agent@gmail.com' and p.status = 'active';
  select p.id into coordinator from public.profiles p where lower(p.email) = 'clatestportal+e2e-coordinator@gmail.com' and p.status = 'active';
  if buyer_agent is null or coordinator is null then
    raise exception 'refusing: the E2E buyer agent or coordinator profile is missing';
  end if;
  if not exists (
    select 1 from public.deal_participants dp
    join public.contacts c on c.id = dp.contact_id
    join public.deals d on d.id = dp.deal_id
    where d.notes = 'E2E-ROLE-FILE' and d.file_number = 'MD-26-99001'
      and dp.role = 'Transaction Coordinator' and c.profile_id = coordinator
  ) then
    raise exception 'refusing: the E2E coordinator is not a Transaction Coordinator on MD-26-99001';
  end if;
  if exists (
    select 1 from public.team_members co
    join public.team_members ag on ag.team_id = co.team_id and ag.member_role = 'agent'
    join public.profiles listing on listing.id = ag.profile_id
    where co.profile_id = coordinator and co.member_role = 'coordinator'
      and lower(listing.email) = 'clatestportal+e2e-listing-agent@gmail.com'
  ) then
    raise exception 'refusing: the E2E coordinator already assists the listing agent';
  end if;
  insert into public.teams (id, name, created_by)
  values (buyer_team, 'E2E Buyer Side', coordinator)
  on conflict (id) do nothing;
  insert into public.team_members (team_id, profile_id, member_role, added_by)
  values
    (buyer_team, buyer_agent, 'agent', coordinator),
    (buyer_team, coordinator, 'coordinator', coordinator)
  on conflict (team_id, profile_id) do update set member_role = excluded.member_role;
end
$e2e$;

do $readback$
declare
  buyer_team uuid := 'e2e00000-0000-4000-8000-0000000000b1';
begin
  if (select count(*) from public.team_members m where m.team_id = buyer_team and m.member_role = 'agent') <> 1
     or (select count(*) from public.team_members m where m.team_id = buyer_team and m.member_role = 'coordinator') <> 1 then
    raise exception 'readback: the E2E buyer team needs the buyer agent and the coordinator';
  end if;
  if exists (
    select 1 from public.team_members co
    join public.team_members ag on ag.team_id = co.team_id and ag.member_role = 'agent'
    join public.profiles listing on listing.id = ag.profile_id
    where co.member_role = 'coordinator'
      and lower(listing.email) = 'clatestportal+e2e-listing-agent@gmail.com'
      and co.profile_id = (select id from public.profiles where lower(email) = 'clatestportal+e2e-coordinator@gmail.com')
  ) then
    raise exception 'readback: the E2E coordinator must not assist the listing agent';
  end if;
end
$readback$;
commit;
