-- AF-8 (John, Nov 14 2026; assigned to Claude): the old agent task "Commission information" (template code 'commissions') went around
-- Agent fees. An agent's commission_amount was saved only in tasks.form_data, so Accounting > Contract figures, the CD and the ALTA
-- statement (which read deal_agent_fees) showed "Not entered yet". Seen on MD-26-97260 ($28,500, paid by Seller) and VA-26-97304
-- ($20,000). 20261119030000_agent_fee_one_source.sql moved the order's old commission fields but did not read this task.
--   1. Backfill: for each commissions task with a commission_amount, the newest one per file side becomes that side's Agent fees
--      commission, only where the side has no commission yet. % and $ are worked out from the sales price (private.agent_fee_sync).
--      paid_by Seller -> seller, Buyer -> buyer, anything else -> the side's default payer. source = 'agent', updated_by = whoever saved
--      the task. A submitted task (status done) also counts as the agent confirming it, like an agent saving in the Agent fees box;
--      an unfinished draft does not. Every move, and every figure that can't be moved (no sales price, above the price, refinance), is in
--      the Agent fees change history with the reason. The ledger trigger (AF-5) posts the moved commission to Accounting.
--   2. The task stops asking for an amount: a new version of the commissions template drops "Commission ($)" and "Paid by" and adds a
--      note pointing to the Agent fees box. Brokerage, License ID and Notes stay. Open copies (to do, in progress, blocked) move to it and
--      keep their answers; finished copies keep the version they were answered on.
--   3. A guard refuses a new commission_amount on a commissions task (an old page still open) with the plain Agent fees message.
-- Rollback: supabase/rollbacks/20261123010000_commission_task_agent_fees.sql (removes the guard and the new version; moved fees stay).
begin;
set local lock_timeout = '3s';

do $$
begin
  if to_regclass('public.deal_agent_fees') is null or to_regprocedure('private.agent_fee_sync(numeric,text,numeric,numeric)') is null
     or to_regprocedure('private.agent_fee_default_payer(text)') is null then
    raise exception 'drift: apply the Agent fees migrations (20261117100000 to 20261118040000) first';
  end if;
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'tasks'
        and column_name in ('deal_id', 'template_code', 'template_id', 'template_version', 'assigned_role', 'status', 'kind', 'form_data', 'saved_at', 'title', 'description')) <> 11 then
    raise exception 'drift: tasks is missing a column this file reads';
  end if;
  if not exists (select 1 from public.task_templates where code = 'commissions') then
    raise exception 'drift: there is no commissions task template';
  end if;
end $$;

-- 1. backfill Agent fees from saved commissions tasks
do $$
declare
  r record; v_amt numeric; v_payer text; v_sync record; v_old jsonb; v_who uuid; v_when timestamptz; v_done boolean; v_reason text;
begin
  for r in
    select distinct on (t.deal_id, s.side) t.id, t.deal_id, s.side, t.status, t.form_data, to_jsonb(t) as j, d.purchase_price, d.transaction_type
      from public.tasks t
      cross join lateral (select case t.assigned_role when 'Buyer Agent' then 'buyer' when 'Listing Agent' then 'listing' end as side) s
      join public.deals d on d.id = t.deal_id
     where t.template_code = 'commissions' and s.side is not null and t.status <> 'cancelled'
       and nullif(btrim(coalesce(t.form_data ->> 'commission_amount', '')), '') is not null
     order by t.deal_id, s.side, (t.status = 'done') desc,
              coalesce((to_jsonb(t) ->> 'completed_at')::timestamptz, t.saved_at, (to_jsonb(t) ->> 'created_at')::timestamptz) desc nulls last
  loop
    v_done := r.status = 'done';
    v_who := coalesce(nullif(r.j ->> 'completed_by', ''), nullif(r.j ->> 'saved_by', ''), nullif(r.j ->> 'owner_profile_id', ''))::uuid;
    v_when := coalesce((r.j ->> 'completed_at')::timestamptz, (r.j ->> 'saved_at')::timestamptz, now());
    v_payer := case lower(btrim(coalesce(r.form_data ->> 'paid_by', ''))) when 'seller' then 'seller' when 'buyer' then 'buyer'
                    else private.agent_fee_default_payer(r.side) end;
    v_old := jsonb_strip_nulls(jsonb_build_object('kind', 'commission', 'from', 'Commission information task', 'task', r.id,
               'amountTyped', r.form_data ->> 'commission_amount', 'paidBy', r.form_data ->> 'paid_by'));
    if exists (select 1 from public.deal_agent_fee_log l where l.deal_id = r.deal_id and l.old_value ->> 'task' = r.id::text) then
      continue;   -- already noted by an earlier run of this file
    end if;
    if exists (select 1 from public.deal_agent_fees x where x.deal_id = r.deal_id and x.side = r.side and x.kind = 'commission') then
      continue;   -- Agent fees already has this side's commission, which wins; the task answer stays on the task
    end if;
    if r.transaction_type = 'Refinance' then
      insert into public.deal_agent_fee_log (deal_id, side, kind, slot, old_value, new_value, reason, source, changed_by)
        values (r.deal_id, r.side, 'commission', 0, v_old, null, 'Commission information task not moved: a refinance has no agent fees.', 'system', null);
      continue;
    end if;
    begin
      v_amt := replace(replace(btrim(r.form_data ->> 'commission_amount'), ',', ''), '$', '')::numeric;
      select * into v_sync from private.agent_fee_sync(r.purchase_price, 'amount', null, v_amt);
      v_reason := case when v_done then 'From the agent''s Commission information task (submitted ' || to_char(v_when at time zone 'America/New_York', 'Mon FMDD, YYYY') || ')'
                       else 'From the agent''s unfinished Commission information task (not confirmed)' end;
      insert into public.deal_agent_fees (deal_id, side, kind, slot, basis, pct, amount, payer, source, confirmed_by, confirmed_role, confirmed_at, updated_by, updated_at)
        values (r.deal_id, r.side, 'commission', 0, 'amount', v_sync.pct, v_sync.amount, v_payer, 'agent',
                case when v_done then v_who end, case when v_done then 'agent' end, case when v_done then v_when end, v_who, now());
      insert into public.deal_agent_fee_log (deal_id, side, kind, slot, old_value, new_value, reason, source, changed_by)
        values (r.deal_id, r.side, 'commission', 0, null,
                jsonb_build_object('side', r.side, 'kind', 'commission', 'slot', 0, 'basis', 'amount', 'percent', v_sync.pct, 'amount', v_sync.amount, 'payer', v_payer),
                v_reason, 'agent', v_who);
    exception when others then
      insert into public.deal_agent_fee_log (deal_id, side, kind, slot, old_value, new_value, reason, source, changed_by)
        values (r.deal_id, r.side, 'commission', 0, v_old, null,
                'Commission information task not moved: ' || case when sqlstate = 'P0001' then sqlerrm else 'the amount is not a dollar figure.' end || ' Enter it in Agent fees.', 'system', null);
    end;
  end loop;
end $$;

-- 2. a new version of the template without the amount; open copies move to it
do $tpl$
declare cur public.task_templates; f jsonb; note jsonb :=
  '{"k":"agent_fees_note","label":"Your commission","type":"info","req":false,"text":"Your commission, admin fee and any other fees are entered in the Agent fees box on the file overview. That is the one place CLA Title keeps them, so they match Accounting, the Closing Disclosure and the ALTA statement."}'::jsonb;
begin
  select * into cur from public.task_templates where code = 'commissions' and active order by version desc limit 1;
  if cur.id is null then
    select * into cur from public.task_templates where code = 'commissions' order by version desc limit 1;
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(cur.fields, '[]'::jsonb)) x where x ->> 'k' = 'agent_fees_note') then
    null;   -- already published
  else
    select jsonb_agg(x order by ord, sub) into f from (
      select e.ord, 0 as sub, e.elem as x from jsonb_array_elements(coalesce(cur.fields, '[]'::jsonb)) with ordinality as e(elem, ord)
       where e.elem ->> 'k' not in ('commission_amount', 'paid_by')
      union all
      select coalesce((select e.ord from jsonb_array_elements(coalesce(cur.fields, '[]'::jsonb)) with ordinality as e(elem, ord) where e.elem ->> 'k' = 'commission_amount'), 0), 1, note
    ) q;
    update public.task_templates set active = false where code = 'commissions' and active;
    insert into public.task_templates (code, version, title, description, roles, due_days, due_anchor, fields, active, published_at, agent_roles, client_only, lane, audiences)
    select cur.code, (select max(version) + 1 from public.task_templates where code = 'commissions'), cur.title,
           'Confirm your brokerage and license. Your commission and fees are entered in the Agent fees box on the file overview.',
           cur.roles, cur.due_days, cur.due_anchor, coalesce(f, jsonb_build_array(note)), true, now(), cur.agent_roles, cur.client_only, cur.lane, cur.audiences;
  end if;

  update public.tasks task
     set template_id = nxt.id, template_version = nxt.version, title = nxt.title, description = nxt.description
    from public.task_templates nxt
   where nxt.active and nxt.code = 'commissions' and task.template_code = 'commissions'
     and task.status in ('todo', 'in_progress', 'blocked') and task.template_version < nxt.version;
end
$tpl$;

-- 3. nothing saves a commission amount on this task again
create or replace function private.commission_task_guard() returns trigger
language plpgsql set search_path to pg_catalog, public as $$
begin
  if new.template_code = 'commissions'
     and nullif(btrim(coalesce(new.form_data ->> 'commission_amount', '')), '') is not null
     and (tg_op = 'INSERT' or (new.form_data ->> 'commission_amount') is distinct from (old.form_data ->> 'commission_amount')) then
    raise exception 'Commissions are now kept in the Agent fees box on the file overview. Reload the page and enter it there. Nothing was saved.'
      using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists tasks_commission_task_guard on public.tasks;
create trigger tasks_commission_task_guard before insert or update of form_data on public.tasks
  for each row execute function private.commission_task_guard();

do $readback$
declare pf jsonb;
begin
  select fields into pf from public.task_templates where code = 'commissions' and active;
  if pf is null then raise exception 'readback: no active commissions template'; end if;
  if exists (select 1 from jsonb_array_elements(pf) x where x ->> 'k' in ('commission_amount', 'paid_by')) then raise exception 'readback: the amount is still asked'; end if;
  if not exists (select 1 from jsonb_array_elements(pf) x where x ->> 'k' = 'agent_fees_note' and x ->> 'type' = 'info') then raise exception 'readback: the Agent fees note is missing'; end if;
end
$readback$;

commit;
