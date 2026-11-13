-- AF-4 Agent fees: when CLA staff change fees an agent (or TC) confirmed, the agent on that side is told right away, in the portal
-- (bell) and by an email QUEUED in public.outbox (never sent on TEST): old value, new value, the reason and who changed it.
-- Notification only: the agent is not asked to re-approve (John, Nov 12 2026, decision 3). Staff changes to fees nobody confirmed
-- send nothing. Replaces private.agent_fee_notify from AF-3 (20261117120000_agent_fee_notify.sql); save_agent_fees is unchanged.
begin;
set local lock_timeout = '3s';

-- Notices for the changes this call just logged (same person, same transaction).
create or replace function private.agent_fee_notify(p_deal uuid, p_side text, p_actor text, p_reason text) returns void
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
declare
  v_uid uuid := private.effective_uid(); v_lines text[]; v_changed int; v_file text; v_name text; v_side text; v_title text; v_body text;
  v_ids uuid[]; v_agents uuid[];
begin
  if p_actor not in ('agent', 'tc', 'staff') then return; end if;
  select array_agg(private.agent_fee_label(l.kind, l.slot) || ': ' ||
           case when l.old_value is not distinct from l.new_value then 'confirmed ' || private.agent_fee_text(l.new_value)
                else private.agent_fee_text(l.old_value) || ' → ' || private.agent_fee_text(l.new_value) end order by l.id),
         count(*) filter (where l.old_value is distinct from l.new_value)
    into v_lines, v_changed
  from public.deal_agent_fee_log l
  where l.deal_id = p_deal and l.side = p_side and l.source = p_actor and l.changed_by is not distinct from v_uid and l.changed_at = now();
  if v_lines is null then return; end if;
  select file_number, array_remove(array[processor_id, preprocessor_user_id, tc_user_id], null) into v_file, v_ids from public.deals where id = p_deal;
  select coalesce(array_agg(distinct c.profile_id), '{}') into v_agents from public.deal_participants p join public.contacts c on c.id = p.contact_id
   where p.deal_id = p_deal and c.profile_id is not null and p.role = case p_side when 'buyer' then 'Buyer Agent' else 'Listing Agent' end;
  if p_actor = 'tc' then v_ids := v_ids || v_agents; end if;
  -- AF-4: a staff change to fees the agent (or TC) confirmed tells the agent only (old, new, reason, who). No re-approval.
  if p_actor = 'staff' then
    if v_changed = 0 or not (p_reason is not null or exists (select 1 from public.deal_agent_fees f where f.deal_id = p_deal and f.side = p_side and f.confirmed_at is not null)) then return; end if;
    v_ids := v_agents;
  end if;
  v_name := private.person_name(v_uid) || case when p_actor = 'tc' then ' (TC)' when p_actor = 'staff' then ' (CLA Title)' else '' end;
  v_side := case p_side when 'buyer' then 'buyer''s agent' else 'listing agent' end;
  v_title := v_name || case when v_changed = 0 then ' confirmed the ' || v_side || ' fees on ' else ' changed the ' || v_side || ' fees on ' end || coalesce(v_file, 'a file')
    || case when v_changed > 0 then ': ' || v_lines[1] || case when array_length(v_lines, 1) > 1 then ' (+' || (array_length(v_lines, 1) - 1) || ' more)' else '' end else '' end
    || case when p_actor = 'staff' and p_reason is not null then '. Reason: ' || p_reason else '' end;
  perform private.notify(v_ids, 'agent_fee', p_deal, v_title, '#/deals/' || p_deal);
  v_body := v_name || case when v_changed = 0 then ' confirmed ' else ' changed ' end || 'the ' || v_side || ' fees on file ' || coalesce(v_file, '') || E'.\n\n'
    || array_to_string(v_lines, E'\n') || case when p_reason is not null then E'\n\nReason: ' || p_reason else '' end
    || case when p_actor = 'staff' then E'\n\nYou don''t need to approve this change. If something is wrong, open the file in the portal and change your fees, or reply to your processor.' else '' end
    || E'\n\nOpen the file in the CLA Title portal to see the fees and their history.\n\nTEST PORTAL: queued only; never sent.';
  insert into public.outbox (channel, status, sent_at, to_profile_id, to_email, to_name, subject, body, deal_id, created_by, kind, sender_type)
  select 'email', 'queued', null, p.id, p.email, private.person_name(p.id), left('Agent fees ' || case when v_changed = 0 then 'confirmed' else 'changed' end || ' on ' || coalesce(v_file, 'a file'), 500),
         left(v_body, 4000), p_deal, v_uid, 'agent_fee', 'portal'
  from public.profiles p
  where p.id = any (v_ids) and p.id is distinct from v_uid and p.status = 'active' and coalesce(p.email, '') like '%@%';
end $$;

revoke all on function private.agent_fee_notify(uuid, text, text, text) from public, anon, authenticated;

commit;
