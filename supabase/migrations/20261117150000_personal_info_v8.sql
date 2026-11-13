-- FF-068 #8/#11/#12 (Janine's video, Nov 12 "CLA Portal Test - Processor and Seller Screens"; Francis confirm-back Nov 12 6:14 PM ET):
-- personal_info v8 = v7 plus
--   * entity_tax_id "EIN/Tax ID", required when "Add entity" is ticked (after the state the entity was formed in)
--   * primary_residence gets roleLabels {"Client-Seller": "Is the property your primary residence?"} (buyers keep their wording)
--   * water_meter_where "Where is the water meter?" removed (water_meter stays)
-- Same publish rule as 20261117140000: only untouched to-do copies with no answers move to v8. Copies with saved answers keep their
-- version and answers. #9 (SSN shown with dashes, masked after save) is front end only. No policy, grant or function changes.
begin;
set local lock_timeout = '3s';

do $tpl$
declare pi_active integer; f jsonb;
begin
  select t.version into pi_active from public.task_templates t where t.code = 'personal_info' and t.active order by t.version desc limit 1;
  if pi_active = 8 then
    null;   -- already published
  elsif pi_active is distinct from 7 or exists (select 1 from public.task_templates t where t.code = 'personal_info' and t.version = 8) then
    raise exception 'drift: personal_info v7 is not the active version';
  else
    select jsonb_agg(x order by ord, sub) into f from (
      select e.ord, 0 as sub,
             case when e.elem->>'k' = 'primary_residence' then e.elem || '{"roleLabels":{"Client-Seller":"Is the property your primary residence?"}}'::jsonb else e.elem end as x
      from public.task_templates t cross join lateral jsonb_array_elements(t.fields) with ordinality as e(elem, ord)
      where t.code = 'personal_info' and t.version = 7 and e.elem->>'k' <> 'water_meter_where'
      union all
      select e.ord, 1, '{"k":"entity_tax_id","label":"EIN/Tax ID","type":"text","req":true,"when":["is_entity",true]}'::jsonb
      from public.task_templates t cross join lateral jsonb_array_elements(t.fields) with ordinality as e(elem, ord)
      where t.code = 'personal_info' and t.version = 7 and e.elem->>'k' = 'entity_state'
    ) q;

    update public.task_templates set active = false where code = 'personal_info' and active;
    insert into public.task_templates (code, version, title, description, roles, due_days, due_anchor, fields, active, published_at, agent_roles, client_only, lane, audiences)
    select t.code, 8, t.title, t.description, t.roles, t.due_days, t.due_anchor, f, true, now(), t.agent_roles, t.client_only, t.lane, t.audiences
    from public.task_templates t where t.code = 'personal_info' and t.version = 7;
  end if;

  update public.tasks task
  set template_id = nxt.id, template_version = nxt.version, title = nxt.title, description = nxt.description
  from public.task_templates nxt
  where nxt.active and nxt.code = 'personal_info' and task.template_code = 'personal_info'
    and task.kind = 'form' and task.status = 'todo' and task.saved_at is null
    and coalesce(task.form_data, '{}'::jsonb) = '{}'::jsonb
    and task.template_version < nxt.version;
end
$tpl$;

do $readback$
declare pf jsonb;
begin
  select fields into pf from public.task_templates where code = 'personal_info' and active;
  if exists (select 1 from jsonb_array_elements(pf) x where x->>'k' = 'water_meter_where') then raise exception 'readback: water_meter_where still asked'; end if;
  if not exists (select 1 from jsonb_array_elements(pf) x where x->>'k' = 'entity_tax_id' and x->>'req' = 'true' and x->'when' = '["is_entity", true]'::jsonb) then raise exception 'readback: EIN missing'; end if;
  if not exists (select 1 from jsonb_array_elements(pf) x where x->>'k' = 'primary_residence' and x->'roleLabels'->>'Client-Seller' = 'Is the property your primary residence?') then raise exception 'readback: seller wording'; end if;
  if (select count(*) from jsonb_array_elements(pf)) <> 51 then raise exception 'readback: expected 51 questions'; end if;
end
$readback$;

commit;
