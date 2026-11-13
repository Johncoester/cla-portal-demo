-- AF-3 Agent fees: notices when an agent or TC changes or confirms fees (John, Nov 12 2026 decisions 4 and 7;
-- spec docs/specs/agent-fees-flow.md). After save_agent_fees by an agent or TC:
--   * the file's processor, pre-processor and TC get an in-portal notice (bell), and an email is QUEUED for each of them in
--     public.outbox (status 'queued'; nothing sends portal notices from the outbox on TEST, so no email goes out);
--   * when a TC confirms or changes the fees, the agent on that side is told the same way (decision 7).
-- The notice says who, the file, and each change (old -> new). Nobody is told about their own change.
-- save_agent_fees is the AF-1 function with one added call at the end (private.agent_fee_notify).
begin;
set local lock_timeout = '3s';

-- one fee value in words: "3% / $9,000.00 (paid by Seller)", "$395.00 (paid by Buyer)", "Referral fee $500.00 to ABC Referrals"
create or replace function private.agent_fee_text(v jsonb) returns text
language sql immutable set search_path to pg_catalog as $$
  select case when v is null then 'none'
    when v ->> 'kind' = 'commission' then trim(to_char((v ->> 'percent')::numeric, 'FM999990.9999'), '.') || '% / ' || to_char((v ->> 'amount')::numeric, 'FM$999,999,990.00')
    when v ->> 'kind' = 'other' then coalesce(v ->> 'description', 'Other fee') || ' ' || to_char((v ->> 'amount')::numeric, 'FM$999,999,990.00') || ' to ' || coalesce(v ->> 'paidTo', '')
    else to_char((v ->> 'amount')::numeric, 'FM$999,999,990.00') end
  || case when v ->> 'payer' is not null then ' (paid by ' || initcap(v ->> 'payer') || ')' else '' end $$;

create or replace function private.agent_fee_label(p_kind text, p_slot int) returns text
language sql immutable set search_path to pg_catalog as $$
  select case p_kind when 'commission' then 'Commission' when 'admin' then 'Admin fee' else 'Other fee ' || p_slot end $$;

-- Notices for the changes this call just logged (same person, same transaction).
create or replace function private.agent_fee_notify(p_deal uuid, p_side text, p_actor text, p_reason text) returns void
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
declare
  v_uid uuid := private.effective_uid(); v_lines text[]; v_changed int; v_file text; v_name text; v_side text; v_title text; v_body text;
  v_ids uuid[]; v_agents uuid[];
begin
  if p_actor not in ('agent', 'tc') then return; end if;
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
  v_name := private.person_name(v_uid) || case when p_actor = 'tc' then ' (TC)' else '' end;
  v_side := case p_side when 'buyer' then 'buyer''s agent' else 'listing agent' end;
  v_title := v_name || case when v_changed = 0 then ' confirmed the ' || v_side || ' fees on ' else ' changed the ' || v_side || ' fees on ' end || coalesce(v_file, 'a file')
    || case when v_changed > 0 then ': ' || v_lines[1] || case when array_length(v_lines, 1) > 1 then ' (+' || (array_length(v_lines, 1) - 1) || ' more)' else '' end else '' end;
  perform private.notify(v_ids, 'agent_fee', p_deal, v_title, '#/deals/' || p_deal);
  v_body := v_name || case when v_changed = 0 then ' confirmed ' else ' changed ' end || 'the ' || v_side || ' fees on file ' || coalesce(v_file, '') || E'.\n\n'
    || array_to_string(v_lines, E'\n') || case when p_reason is not null then E'\n\nReason: ' || p_reason else '' end
    || E'\n\nOpen the file in the CLA Title portal to see the fees and their history.\n\nTEST PORTAL: queued only; never sent.';
  insert into public.outbox (channel, status, sent_at, to_profile_id, to_email, to_name, subject, body, deal_id, created_by, kind, sender_type)
  select 'email', 'queued', null, p.id, p.email, private.person_name(p.id), left('Agent fees ' || case when v_changed = 0 then 'confirmed' else 'changed' end || ' on ' || coalesce(v_file, 'a file'), 500),
         left(v_body, 4000), p_deal, v_uid, 'agent_fee', 'portal'
  from public.profiles p
  where p.id = any (v_ids) and p.id is distinct from v_uid and p.status = 'active' and coalesce(p.email, '') like '%@%';
end $$;

create or replace function public.save_agent_fees(p_deal uuid, p_side text, p_fees jsonb, p_reason text default null)
returns setof jsonb
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
declare
  v_actor text; v_uid uuid := private.effective_uid(); v_price numeric; v_type text; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_want jsonb := '[]'::jsonb; v_item jsonb; v_other jsonb; v_old public.deal_agent_fees; v_new jsonb; v_oldj jsonb;
  v_sync record; v_payer text; v_amount numeric; v_desc text; v_paid text; v_i int := 0; v_confirm boolean;
  v_changed int := 0; v_need_reason boolean := false; v_fresh boolean;
begin
  if p_side is null or p_side not in ('listing', 'buyer') then raise exception 'Pick the listing agent or buyer''s agent side.' using errcode = 'P0001'; end if;
  v_actor := private.agent_fee_actor(p_deal, p_side);
  if v_actor is null or v_actor = 'reader' then raise exception 'You can''t change agent fees on this file.' using errcode = '42501'; end if;
  select purchase_price, transaction_type into v_price, v_type from public.deals where id = p_deal;
  if v_type = 'Refinance' then raise exception 'A refinance has no agent fees.' using errcode = 'P0001'; end if;
  if p_fees is null or jsonb_typeof(p_fees) <> 'object' then raise exception 'Nothing to save.' using errcode = 'P0001'; end if;
  if v_reason is not null and length(v_reason) > 500 then raise exception 'Keep the reason under 500 characters.' using errcode = 'P0001'; end if;
  v_confirm := v_actor in ('agent', 'tc');

  -- what the side should hold after the save, checked
  if jsonb_typeof(p_fees -> 'commission') = 'object' then
    v_item := p_fees -> 'commission';
    select * into v_sync from private.agent_fee_sync(v_price, v_item ->> 'basis',
      private.agent_fee_num(v_item ->> 'percent', 'Commission %'), private.agent_fee_num(v_item ->> 'amount', 'Commission $'));
    v_want := v_want || jsonb_build_array(jsonb_build_object('kind', 'commission', 'slot', 0, 'basis', v_item ->> 'basis',
      'percent', v_sync.pct, 'amount', v_sync.amount, 'payer', coalesce(nullif(v_item ->> 'payer', ''), private.agent_fee_default_payer(p_side))));
  end if;
  if jsonb_typeof(p_fees -> 'admin') = 'object' then
    v_item := p_fees -> 'admin';
    v_amount := private.agent_fee_num(v_item ->> 'amount', 'Admin fee');
    if v_amount is null or v_amount < 0 or v_amount > 1000000 then raise exception 'Admin fee must be a dollar amount of 0 or more.' using errcode = 'P0001'; end if;
    v_payer := coalesce(nullif(v_item ->> 'payer', ''), private.agent_fee_default_payer(p_side));
    v_want := v_want || jsonb_build_array(jsonb_build_object('kind', 'admin', 'slot', 0, 'amount', round(v_amount, 2), 'payer', v_payer));
  end if;
  if p_fees ? 'other' and jsonb_typeof(p_fees -> 'other') = 'array' then
    if jsonb_array_length(p_fees -> 'other') > 5 then raise exception 'Up to 5 other fees per agent.' using errcode = 'P0001'; end if;
    for v_other in select * from jsonb_array_elements(p_fees -> 'other') loop
      v_i := v_i + 1;
      v_desc := nullif(btrim(coalesce(v_other ->> 'description', '')), '');
      v_paid := nullif(btrim(coalesce(v_other ->> 'paidTo', '')), '');
      v_amount := private.agent_fee_num(v_other ->> 'amount', 'Other fee ' || v_i || ' amount');
      if v_desc is null then raise exception 'Other fee %: enter a description.', v_i using errcode = 'P0001'; end if;
      if v_paid is null then raise exception 'Other fee %: enter who it is paid to.', v_i using errcode = 'P0001'; end if;
      if length(v_desc) > 120 or length(v_paid) > 120 then raise exception 'Other fee %: keep the description and paid to under 120 characters.', v_i using errcode = 'P0001'; end if;
      if v_amount is null or v_amount < 0 or v_amount > 1000000 then raise exception 'Other fee %: the amount must be a dollar amount of 0 or more.', v_i using errcode = 'P0001'; end if;
      v_want := v_want || jsonb_build_array(jsonb_build_object('kind', 'other', 'slot', v_i, 'amount', round(v_amount, 2), 'description', v_desc,
        'paidTo', v_paid, 'payer', coalesce(nullif(v_other ->> 'payer', ''), private.agent_fee_default_payer(p_side))));
    end loop;
  end if;
  for v_item in select * from jsonb_array_elements(v_want) loop
    if (v_item ->> 'payer') not in ('buyer', 'seller') then raise exception 'Paid by must be Buyer or Seller.' using errcode = 'P0001'; end if;
  end loop;

  -- staff changing (or removing) something an agent or TC confirmed needs a reason
  if v_actor = 'staff' then
    select exists (
      select 1 from public.deal_agent_fees f
      where f.deal_id = p_deal and f.side = p_side and f.confirmed_at is not null
        and private.agent_fee_json(f) - 'side' is distinct from (
          select w from jsonb_array_elements(v_want) w
          where w ->> 'kind' = f.kind and (w ->> 'slot')::int = f.slot)
    ) into v_need_reason;
    if v_need_reason and (v_reason is null or length(v_reason) < 3) then
      raise exception 'The agent confirmed these fees. Enter a reason for the change.' using errcode = 'P0001';
    end if;
  end if;

  -- remove fees left out
  for v_old in select * from public.deal_agent_fees f where f.deal_id = p_deal and f.side = p_side
      and not exists (select 1 from jsonb_array_elements(v_want) w where w ->> 'kind' = f.kind and (w ->> 'slot')::int = f.slot) loop
    delete from public.deal_agent_fees where id = v_old.id;
    insert into public.deal_agent_fee_log (deal_id, side, kind, slot, old_value, new_value, reason, source, changed_by)
      values (p_deal, p_side, v_old.kind, v_old.slot, private.agent_fee_json(v_old), null, v_reason, v_actor, v_uid);
    v_changed := v_changed + 1;
  end loop;

  -- add or change the rest
  for v_item in select * from jsonb_array_elements(v_want) loop
    select * into v_old from public.deal_agent_fees f where f.deal_id = p_deal and f.side = p_side and f.kind = v_item ->> 'kind' and f.slot = (v_item ->> 'slot')::int;
    v_oldj := private.agent_fee_json(v_old);
    v_new := v_item || jsonb_build_object('side', p_side);
    -- an agent or TC saving confirms the fee, unless they already confirmed exactly this value
    v_fresh := v_confirm and (v_old.confirmed_at is null or v_old.source is distinct from v_actor or v_old.confirmed_by is distinct from v_uid);
    if v_oldj is not null and v_oldj = jsonb_strip_nulls(v_new) and not v_fresh then
      continue; -- unchanged, and nothing new to confirm
    end if;
    insert into public.deal_agent_fees as f (deal_id, side, kind, slot, basis, pct, amount, payer, description, paid_to, source,
        confirmed_by, confirmed_role, confirmed_at, updated_by, updated_at)
      values (p_deal, p_side, v_item ->> 'kind', (v_item ->> 'slot')::int, v_item ->> 'basis', (v_item ->> 'percent')::numeric,
        (v_item ->> 'amount')::numeric, v_item ->> 'payer', v_item ->> 'description', v_item ->> 'paidTo', v_actor,
        case when v_confirm then v_uid end, case when v_confirm then v_actor end, case when v_confirm then now() end, v_uid, now())
      on conflict (deal_id, side, kind, slot) do update set
        basis = excluded.basis, pct = excluded.pct, amount = excluded.amount, payer = excluded.payer, description = excluded.description,
        paid_to = excluded.paid_to, source = excluded.source, updated_by = excluded.updated_by, updated_at = excluded.updated_at,
        -- a staff change keeps the record of who confirmed (so later staff changes still need a reason); an agent or TC save re-confirms
        confirmed_by = case when v_confirm then excluded.confirmed_by else f.confirmed_by end,
        confirmed_role = case when v_confirm then excluded.confirmed_role else f.confirmed_role end,
        confirmed_at = case when v_confirm then excluded.confirmed_at else f.confirmed_at end;
    -- every change is logged; a confirmation of an unchanged value is logged too (reason "Confirmed")
    insert into public.deal_agent_fee_log (deal_id, side, kind, slot, old_value, new_value, reason, source, changed_by)
      values (p_deal, p_side, v_item ->> 'kind', (v_item ->> 'slot')::int, v_oldj, jsonb_strip_nulls(v_new),
              case when v_oldj is not distinct from jsonb_strip_nulls(v_new) then coalesce(v_reason, 'Confirmed') else v_reason end, v_actor, v_uid);
    v_changed := v_changed + 1;
  end loop;

  -- AF-3: tell the file's CLA team (and, for a TC, the agent) what changed; AF-4 adds the agent notice for staff changes
  if v_changed > 0 then perform private.agent_fee_notify(p_deal, p_side, v_actor, v_reason); end if;

  return query select to_jsonb(x) from public.agent_fees(p_deal) x where x.side = p_side;
end $$;


revoke all on function private.agent_fee_text(jsonb), private.agent_fee_label(text, int), private.agent_fee_notify(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.save_agent_fees(uuid, text, jsonb, text) from public, anon;
grant execute on function public.save_agent_fees(uuid, text, jsonb, text) to authenticated;

commit;
