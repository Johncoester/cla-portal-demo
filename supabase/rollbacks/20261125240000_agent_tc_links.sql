-- Undo TC-2. Drops the agent / transaction coordinator links.
-- Contacts are kept. Refuses while a link is still saved, so a person is not dropped silently.
begin;
set local lock_timeout = '3s';

do $$
declare n int;
begin
  if to_regclass('public.agent_tc_links') is null then
    raise exception 'drift: agent_tc_links is already gone';
  end if;
  select count(*) into n from public.agent_tc_links;
  if n <> 0 then
    raise exception 'Remove the transaction coordinator links before undoing this change. % link(s) are still saved.', n;
  end if;
end $$;

drop function if exists public.unlink_agent_tc(uuid, uuid);
drop function if exists public.link_agent_tc(uuid, uuid, text, text, text, text, text);
drop function if exists public.agent_tcs(uuid);
drop function if exists private.rpc_unlink_agent_tc(uuid, uuid);
drop function if exists private.rpc_link_agent_tc(uuid, uuid, text, text, text, text, text);
drop function if exists private.rpc_agent_tcs(uuid);
drop function if exists private.agent_tc_can_edit(uuid);
drop function if exists private.agent_tc_is_agent(uuid);

drop table public.agent_tc_links;

do $$
begin
  if to_regclass('public.agent_tc_links') is not null then
    raise exception 'readback: agent_tc_links is still present';
  end if;
  if to_regclass('public.contacts') is null then
    raise exception 'readback: contacts was dropped';
  end if;
end $$;

commit;

notify pgrst, 'reload schema';
