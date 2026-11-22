-- FF-066 #6 (Janine's video, Nov 12 "CLA Portal Test - Processor and Seller Screens"; Francis confirm-back Nov 12 6:14 PM ET):
-- the seller proceeds acknowledgment moves from Personal information into "How you want your proceeds", with the $5,000 wire note
-- and a required checkbox (Francis's wording). Two new template versions, published the same way as 20261112020000:
--   personal_info v7   = v6 without proceeds_statement / proceeds_ack
--   seller_proceeds v2 = v1 + proceeds_wire_note (info) + proceeds_statement (info) + proceeds_ack (required checkbox), before "notes"
-- Only untouched to-do copies with no answers move to the new versions. A copy with saved answers keeps its version and its answers,
-- so no answer is lost. No policy, grant or function changes.
begin;
set local lock_timeout = '3s';

do $tpl$
declare pi_active integer; sp_active integer; personal jsonb; proceeds jsonb;
begin
  select t.version into pi_active from public.task_templates t where t.code = 'personal_info' and t.active order by t.version desc limit 1;
  select t.version into sp_active from public.task_templates t where t.code = 'seller_proceeds' and t.active order by t.version desc limit 1;
  if pi_active = 7 and sp_active = 2 then
    null;   -- already published
  elsif pi_active is distinct from 6 or sp_active is distinct from 1
     or exists (select 1 from public.task_templates t where (t.code = 'personal_info' and t.version = 7) or (t.code = 'seller_proceeds' and t.version = 2)) then
    raise exception 'drift: personal_info / seller_proceeds are not the expected active versions';
  else
    select jsonb_agg(elem order by ord) into personal
    from public.task_templates t cross join lateral jsonb_array_elements(t.fields) with ordinality as e(elem, ord)
    where t.code = 'personal_info' and t.version = 6 and elem->>'k' not in ('proceeds_statement', 'proceeds_ack');

    select jsonb_agg(elem order by ord) into proceeds
    from public.task_templates t cross join lateral jsonb_array_elements(t.fields) with ordinality as e(elem, ord)
    where t.code = 'seller_proceeds' and t.version = 1 and elem->>'k' <> 'notes';
    proceeds := proceeds || $new$[
      {"k":"proceeds_wire_note","label":"Wire transfers","type":"info","req":false,"text":"Proceeds of $5,000.00 or more must be sent by wire transfer."},
      {"k":"proceeds_statement","label":"Seller proceeds acknowledgment","type":"info","req":false,"text":"I understand that all seller proceeds must be disbursed to the seller(s) of record. If the seller is an entity or trust, the proceeds must be disbursed directly to that entity or trust."},
      {"k":"proceeds_ack","label":"I acknowledge and understand the above statement.","type":"checkbox","req":true}
    ]$new$::jsonb
      || coalesce((select jsonb_agg(elem order by ord) from public.task_templates t cross join lateral jsonb_array_elements(t.fields) with ordinality as e(elem, ord)
                   where t.code = 'seller_proceeds' and t.version = 1 and elem->>'k' = 'notes'), '[]'::jsonb);

    update public.task_templates set active = false where code = 'personal_info' and active;
    insert into public.task_templates (code, version, title, description, roles, due_days, due_anchor, fields, active, published_at, agent_roles, client_only, lane, audiences)
    select t.code, 7, t.title, 'Buyer and seller personal details. Sellers also answer property and utility questions. Spouse details are a section on this form.',
      t.roles, t.due_days, t.due_anchor, personal, true, now(), t.agent_roles, t.client_only, t.lane, t.audiences
    from public.task_templates t where t.code = 'personal_info' and t.version = 6;

    update public.task_templates set active = false where code = 'seller_proceeds' and active;
    insert into public.task_templates (code, version, title, description, roles, due_days, due_anchor, fields, active, published_at, agent_roles, client_only, lane, audiences)
    select t.code, 2, t.title, 'How you want to receive the money from your sale, and the seller proceeds acknowledgment. Bank details are seen only by you and the CLA processor (others see the last 4 digits).',
      t.roles, t.due_days, t.due_anchor, proceeds, true, now(), t.agent_roles, t.client_only, t.lane, t.audiences
    from public.task_templates t where t.code = 'seller_proceeds' and t.version = 1;
  end if;

  update public.tasks task
  set template_id = nxt.id, template_version = nxt.version, title = nxt.title, description = nxt.description
  from public.task_templates nxt
  where nxt.active and nxt.code = task.template_code
    and task.template_code in ('personal_info', 'seller_proceeds')
    and task.kind = 'form' and task.status = 'todo' and task.saved_at is null
    and coalesce(task.form_data, '{}'::jsonb) = '{}'::jsonb
    and task.template_version < nxt.version;
end
$tpl$;

do $readback$
declare pf jsonb; sf jsonb;
begin
  select fields into pf from public.task_templates where code = 'personal_info' and active;
  select fields into sf from public.task_templates where code = 'seller_proceeds' and active;
  if exists (select 1 from jsonb_array_elements(pf) f where f->>'k' in ('proceeds_statement', 'proceeds_ack')) then raise exception 'readback: personal_info still asks for the acknowledgment'; end if;
  if not exists (select 1 from jsonb_array_elements(pf) f where f->>'k' = 'water_meter') then raise exception 'readback: personal_info lost its seller questions'; end if;
  if not exists (select 1 from jsonb_array_elements(sf) f where f->>'k' = 'proceeds_ack' and f->>'req' = 'true') then raise exception 'readback: proceeds acknowledgment missing'; end if;
  if (sf->-1)->>'k' <> 'notes' or not exists (select 1 from jsonb_array_elements(sf) f where f->>'k' = 'proceeds_wire_note') then raise exception 'readback: proceeds task order'; end if;
end
$readback$;

commit;
