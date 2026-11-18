-- FF-101b (Francis, Nov 18 2026 11 AM meeting notes; John confirmed Nov 18 2:13 PM ET):
-- On the agent's Commission information task (template code 'commissions'):
--   1. Broker fee ($) and a read-only Total commission = Agent fees commission for that side + broker fee.
--      Agent fees commission already includes any additional amount (base × % + additional). Commission $ is
--      still not typed on this task (AF-8); an old page that sends commission_amount is still refused.
--   2. Payout method: 'At settlement', 'FedEx overnight' (street, city, state, ZIP), or 'Wire'
--      (bank name, account name, routing, account). Account numbers stay masked for non-owners/non-processors
--      through the existing masked_keys / get_task_form path (field mask: true), same as seller proceeds.
-- Field keys (payout_method, mail_*, bank_*, account) are stable so a future agent-profile default can prefill
-- them. That profile default is NOT built here (waiting on Matt's answer to John's 11:19 AM email).
-- Open copies (todo / in_progress / blocked) move to the new version and keep answers; finished copies stay.
-- Do NOT apply this file from this commit. Rollback: supabase/rollbacks/20261125290000_commission_broker_payout.sql
begin;
set local lock_timeout = '3s';

do $$
begin
  if to_regclass('public.deal_agent_fees') is null then
    raise exception 'drift: apply the Agent fees migrations first';
  end if;
  if not exists (select 1 from public.task_templates where code = 'commissions') then
    raise exception 'drift: there is no commissions task template';
  end if;
  if to_regprocedure('private.commission_task_guard()') is null then
    raise exception 'drift: apply 20261123010000_commission_task_agent_fees.sql first';
  end if;
end $$;

-- 1. New commissions template version with broker fee, total, and payout method
do $tpl$
declare
  cur public.task_templates;
  f jsonb;
  note jsonb := jsonb_build_object(
    'k', 'agent_fees_note', 'label', 'Your commission', 'type', 'info', 'req', false,
    'text', 'Your commission amount is kept in the Agent fees box on the file overview (percent and dollars stay in step there, including any additional amount). Enter a broker fee here if you have one. Total commission is your commission plus the broker fee. How you want to be paid can later be saved on your agent profile as a default; that profile default is not built yet.'
  );
  fedex jsonb := '["payout_method","FedEx overnight"]'::jsonb;
  wire jsonb := '["payout_method","Wire"]'::jsonb;
  payout_opts jsonb := '["At settlement","FedEx overnight","Wire"]'::jsonb;
begin
  select * into cur from public.task_templates where code = 'commissions' and active order by version desc limit 1;
  if cur.id is null then
    select * into cur from public.task_templates where code = 'commissions' order by version desc limit 1;
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(cur.fields, '[]'::jsonb)) x where x ->> 'k' = 'broker_fee') then
    null;   -- already published
  else
    select jsonb_agg(x order by ord) into f from (
      select 10 as ord, jsonb_build_object('k', 'brokerage', 'label', 'Brokerage', 'type', 'text', 'req', true) as x
      union all select 20, jsonb_build_object('k', 'license_id', 'label', 'License ID', 'type', 'text', 'req', true)
      union all select 30, note
      union all select 40, jsonb_build_object('k', 'commission_shown', 'label', 'Commission ($)', 'type', 'money', 'req', false, 'readonly', true)
      union all select 50, jsonb_build_object('k', 'broker_fee', 'label', 'Broker fee ($)', 'type', 'money', 'req', false)
      union all select 60, jsonb_build_object('k', 'total_commission', 'label', 'Total commission ($)', 'type', 'money', 'req', false, 'readonly', true)
      union all select 70, jsonb_build_object('k', 'payout_method', 'label', 'How should we send your commission?', 'type', 'select', 'req', true, 'opts', payout_opts)
      union all select 80, jsonb_build_object('k', 'mail_street', 'label', 'Mail the check to: street address', 'type', 'text', 'req', true, 'when', fedex)
      union all select 90, jsonb_build_object('k', 'mail_unit', 'label', 'Apt / unit', 'type', 'text', 'req', false, 'when', fedex)
      union all select 100, jsonb_build_object('k', 'mail_city', 'label', 'City', 'type', 'text', 'req', true, 'when', fedex)
      union all select 110, jsonb_build_object('k', 'mail_state', 'label', 'State', 'type', 'state', 'req', true, 'when', fedex)
      union all select 120, jsonb_build_object('k', 'mail_zip', 'label', 'ZIP', 'type', 'zip', 'req', true, 'when', fedex)
      union all select 130, jsonb_build_object('k', 'bank_name', 'label', 'Bank name', 'type', 'text', 'req', true, 'when', wire)
      union all select 140, jsonb_build_object('k', 'account_name', 'label', 'Name on the account', 'type', 'text', 'req', true, 'when', wire)
      union all select 150, jsonb_build_object('k', 'routing', 'label', 'Routing number (9 digits)', 'type', 'routing', 'req', true, 'when', wire)
      union all select 160, jsonb_build_object('k', 'account', 'label', 'Account number', 'type', 'account', 'req', true, 'mask', true, 'when', wire)
      union all select 170, jsonb_build_object('k', 'notes', 'label', 'Notes', 'type', 'textarea', 'req', false)
    ) q;

    update public.task_templates set active = false where code = 'commissions' and active;
    insert into public.task_templates (code, version, title, description, roles, due_days, due_anchor, fields, active, published_at, agent_roles, client_only, lane, audiences)
    select cur.code, (select max(version) + 1 from public.task_templates where code = 'commissions'), cur.title,
           'Confirm your brokerage, license, broker fee and how you want your commission paid. Your commission amount stays in the Agent fees box.',
           cur.roles, cur.due_days, cur.due_anchor, f, true, now(), cur.agent_roles, cur.client_only, cur.lane, cur.audiences;
  end if;

  update public.tasks task
     set template_id = nxt.id, template_version = nxt.version, title = nxt.title, description = nxt.description
    from public.task_templates nxt
   where nxt.active and nxt.code = 'commissions' and task.template_code = 'commissions'
     and task.status in ('todo', 'in_progress', 'blocked') and task.template_version < nxt.version;
end
$tpl$;

-- 2. Guard: still refuse a new commission_amount; rewrite commission_shown + total_commission from Agent fees + broker fee
create or replace function private.commission_task_guard() returns trigger
language plpgsql set search_path to pg_catalog, public as $$
declare
  v_side text;
  v_comm numeric := 0;
  v_broker numeric := 0;
  v_raw text;
begin
  if new.template_code = 'commissions'
     and nullif(btrim(coalesce(new.form_data ->> 'commission_amount', '')), '') is not null
     and (tg_op = 'INSERT' or (new.form_data ->> 'commission_amount') is distinct from (old.form_data ->> 'commission_amount')) then
    raise exception 'Commissions are now kept in the Agent fees box on the file overview. Reload the page and enter it there. Nothing was saved.'
      using errcode = 'P0001';
  end if;

  if new.template_code = 'commissions'
     and exists (
       select 1 from public.task_templates tp
       cross join lateral jsonb_array_elements(coalesce(tp.fields, '[]'::jsonb)) x
       where tp.id = new.template_id and x ->> 'k' = 'broker_fee'
     ) then
    v_side := case new.assigned_role when 'Buyer Agent' then 'buyer' when 'Listing Agent' then 'listing' else null end;
    if v_side is not null then
      select coalesce(f.amount, 0) into v_comm
        from public.deal_agent_fees f
       where f.deal_id = new.deal_id and f.side = v_side and f.kind = 'commission'
       limit 1;
      v_comm := coalesce(v_comm, 0);
    end if;
    v_raw := replace(replace(btrim(coalesce(new.form_data ->> 'broker_fee', '')), ',', ''), '$', '');
    if v_raw <> '' then
      begin
        v_broker := v_raw::numeric;
        if v_broker < 0 then
          raise exception 'Broker fee ($) must be a positive amount.' using errcode = 'P0001';
        end if;
      exception when invalid_text_representation then
        raise exception 'Broker fee ($) must be a positive amount.' using errcode = 'P0001';
      end;
    end if;
    new.form_data := coalesce(new.form_data, '{}'::jsonb)
      || jsonb_build_object(
           'commission_shown', round(v_comm, 2)::text,
           'total_commission', round(v_comm + v_broker, 2)::text
         );
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
  if exists (select 1 from jsonb_array_elements(pf) x where x ->> 'k' in ('commission_amount', 'paid_by')) then
    raise exception 'readback: the amount is still asked';
  end if;
  if not exists (select 1 from jsonb_array_elements(pf) x where x ->> 'k' = 'broker_fee' and x ->> 'type' = 'money') then
    raise exception 'readback: broker_fee missing';
  end if;
  if not exists (select 1 from jsonb_array_elements(pf) x where x ->> 'k' = 'total_commission' and coalesce((x ->> 'readonly')::boolean, false)) then
    raise exception 'readback: total_commission missing or not read-only';
  end if;
  if not exists (select 1 from jsonb_array_elements(pf) x where x ->> 'k' = 'payout_method' and x -> 'opts' ? 'FedEx overnight' and x -> 'opts' ? 'Wire' and x -> 'opts' ? 'At settlement') then
    raise exception 'readback: payout_method options wrong';
  end if;
  if not exists (select 1 from jsonb_array_elements(pf) x where x ->> 'k' = 'account' and coalesce((x ->> 'mask')::boolean, false)) then
    raise exception 'readback: account must be masked';
  end if;
end
$readback$;

commit;
