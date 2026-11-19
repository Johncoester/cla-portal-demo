-- Rollback for TC-SELF-BLOCK (20261125340000_tc_self_block.sql).
-- Drops the insert guards only. Does not change or delete contacts, file people, or links.

begin;
set local lock_timeout = '3s';

drop trigger if exists participants_tc_not_self on public.deal_participants;
drop function if exists private.participant_tc_not_self();

do $tc_self_link_rollback$
begin
  if to_regclass('public.agent_tc_links') is not null then
    drop trigger if exists agent_tc_link_not_self on public.agent_tc_links;
  end if;
end
$tc_self_link_rollback$;

drop function if exists private.agent_tc_link_not_self();

do $tc_self_rollback_readback$
begin
  if to_regprocedure('private.participant_tc_not_self()') is not null
     or exists (select 1 from pg_trigger where tgname = 'participants_tc_not_self') then
    raise exception 'readback: the file coordinator self check is still installed';
  end if;
  if to_regprocedure('private.agent_tc_link_not_self()') is not null
     or exists (select 1 from pg_trigger where tgname = 'agent_tc_link_not_self') then
    raise exception 'readback: the coordinator link self check is still installed';
  end if;
end
$tc_self_rollback_readback$;

commit;

notify pgrst, 'reload schema';
