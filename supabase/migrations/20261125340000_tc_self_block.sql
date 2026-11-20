-- TC-SELF-BLOCK. John Coester, Nov 19 2026, 10:18 AM ET.
-- A transaction coordinator added to a file cannot be the agent on that same side
-- (same contact, or the same non-blank email). A link cannot point an agent at themselves.
-- New inserts only. Existing rows are left as they are. Nothing is updated or deleted.
-- Not applied by this commit. Apply on TEST (aqcervntopidtcazcmlv). Do not touch production.
-- Rollback: supabase/rollbacks/20261125340000_tc_self_block.sql

begin;
set local lock_timeout = '3s';

do $tc_self_drift$
begin
  if to_regclass('public.deal_participants') is null or to_regclass('public.contacts') is null then
    raise exception 'drift: deal_participants or contacts is missing';
  end if;
  if to_regprocedure('private.participant_tc_not_self()') is not null
     or exists (select 1 from pg_trigger where tgname = 'participants_tc_not_self' and tgrelid = 'public.deal_participants'::regclass) then
    raise exception 'drift: the file coordinator self check is already installed';
  end if;
end
$tc_self_drift$;

create function private.participant_tc_not_self() returns trigger
language plpgsql
security definer
set search_path to pg_catalog, public, extensions
as $$
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
$$;

revoke all on function private.participant_tc_not_self() from public, anon, authenticated;

create trigger participants_tc_not_self
  before insert on public.deal_participants
  for each row
  execute function private.participant_tc_not_self();

-- The link table arrives with TC-2. When it is already here, a direct insert
-- gets the same plain refusal the link screen already shows. When it is not
-- here yet, this file still blocks the coordinator on the file.
do $tc_self_link$
begin
  if to_regclass('public.agent_tc_links') is null then
    return;
  end if;
  if to_regprocedure('private.agent_tc_link_not_self()') is not null
     or exists (select 1 from pg_trigger where tgname = 'agent_tc_link_not_self' and tgrelid = 'public.agent_tc_links'::regclass) then
    raise exception 'drift: the coordinator link self check is already installed';
  end if;
  execute $fn$
    create function private.agent_tc_link_not_self() returns trigger
    language plpgsql
    security definer
    set search_path to pg_catalog, public, extensions
    as $body$
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
    $body$
  $fn$;
  execute 'revoke all on function private.agent_tc_link_not_self() from public, anon, authenticated';
  execute 'create trigger agent_tc_link_not_self before insert on public.agent_tc_links for each row execute function private.agent_tc_link_not_self()';
end
$tc_self_link$;

do $tc_self_readback$
begin
  if to_regprocedure('private.participant_tc_not_self()') is null then
    raise exception 'readback: participant_tc_not_self is missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'participants_tc_not_self' and tgrelid = 'public.deal_participants'::regclass and tgtype & 2 = 2) then
    raise exception 'readback: participants_tc_not_self is not a before-insert trigger';
  end if;
  if position('transaction coordinator must be a different person' in pg_get_functiondef('private.participant_tc_not_self()'::regprocedure)) = 0 then
    raise exception 'readback: the file message is missing';
  end if;
  if to_regclass('public.agent_tc_links') is not null then
    if to_regprocedure('private.agent_tc_link_not_self()') is null
       or not exists (select 1 from pg_trigger where tgname = 'agent_tc_link_not_self' and tgrelid = 'public.agent_tc_links'::regclass) then
      raise exception 'readback: the link self check was not installed';
    end if;
  end if;
end
$tc_self_readback$;

commit;

notify pgrst, 'reload schema';
