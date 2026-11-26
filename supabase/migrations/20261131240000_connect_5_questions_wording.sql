-- CONNECT-5 (John Coester, Nov 25 2026, 7:49 PM ET, t2081u; Connect Live Test Checklist rows 2.1 and 2.2, Francis):
-- Update Yes/No question wording on Personal information (buyer and seller) and the Seller Proceeds instructions.
-- personal_info v10 = v9 with new labels only. seller_proceeds v3 = v2 with a new method label and acknowledgment text.
-- Keys, types, roles, required flags, states, options and field counts are unchanged.
-- Does not change citizenship (stays a typed line) or forwarding_address roles (seller-only, MF-074).
-- Same publish rule as 20261131080000: only untouched to-do copies with no answers move.
-- Copies with saved answers keep their version and answers. Does not change who can read or write, and adds no functions.
-- Rollback: supabase/rollbacks/20261131240000_connect_5_questions_wording.sql
begin;
set local lock_timeout = '3s';

do $tpl$
declare
  pi_active integer;
  sp_active integer;
  pf jsonb;
  sf jsonb;
  labels jsonb := '{
    "attending_closing":"Attending the closing?",
    "leaving_town":"Leaving town before closing?",
    "divorce":"Currently getting divorced?",
    "primary_residence":"Property will be primary residence?",
    "survey":"Wants survey?",
    "md_first_time":"First-time home buyer in MD?",
    "ground_rent":"Subject to ground rent?",
    "front_foot":"Subject to front foot benefit?",
    "homestead":"Property is homestead?",
    "tenants_after":"Property has tenants at/after closing?"
  }'::jsonb;
  method_label text := 'Proceeds Instructions: Overnight Check or Wire?';
  statement_text text := 'Any seller proceeds are required to be disbursed to the SELLER OF RECORD. If the seller is an Entity/Trust, the proceeds will be disbursed to the Entity/Trust only.';
begin
  select t.version into pi_active from public.task_templates t where t.code = 'personal_info' and t.active order by t.version desc limit 1;
  if pi_active = 10 then
    null;
  elsif pi_active is distinct from 9 or exists (select 1 from public.task_templates t where t.code = 'personal_info' and t.version = 10) then
    raise exception 'drift: personal_info v9 is not the active version';
  else
    select jsonb_agg(
      case when labels ? (e.elem->>'k')
        then e.elem || jsonb_build_object('label', labels ->> (e.elem->>'k'))
        else e.elem end
      order by e.ord
    ) into pf
    from public.task_templates t
    cross join lateral jsonb_array_elements(t.fields) with ordinality as e(elem, ord)
    where t.code = 'personal_info' and t.version = 9;

    update public.task_templates set active = false where code = 'personal_info' and active;
    insert into public.task_templates (code, version, title, description, roles, due_days, due_anchor, fields, active, published_at, agent_roles, client_only, lane, audiences)
    select t.code, 10, t.title, t.description, t.roles, t.due_days, t.due_anchor, pf, true, now(), t.agent_roles, t.client_only, t.lane, t.audiences
    from public.task_templates t where t.code = 'personal_info' and t.version = 9;
  end if;

  select t.version into sp_active from public.task_templates t where t.code = 'seller_proceeds' and t.active order by t.version desc limit 1;
  if sp_active = 3 then
    null;
  elsif sp_active is distinct from 2 or exists (select 1 from public.task_templates t where t.code = 'seller_proceeds' and t.version = 3) then
    raise exception 'drift: seller_proceeds v2 is not the active version';
  else
    select jsonb_agg(
      case
        when e.elem->>'k' = 'method' then e.elem || jsonb_build_object('label', method_label)
        when e.elem->>'k' = 'proceeds_statement' then e.elem || jsonb_build_object('text', statement_text)
        else e.elem end
      order by e.ord
    ) into sf
    from public.task_templates t
    cross join lateral jsonb_array_elements(t.fields) with ordinality as e(elem, ord)
    where t.code = 'seller_proceeds' and t.version = 2;

    update public.task_templates set active = false where code = 'seller_proceeds' and active;
    insert into public.task_templates (code, version, title, description, roles, due_days, due_anchor, fields, active, published_at, agent_roles, client_only, lane, audiences)
    select t.code, 3, t.title, t.description, t.roles, t.due_days, t.due_anchor, sf, true, now(), t.agent_roles, t.client_only, t.lane, t.audiences
    from public.task_templates t where t.code = 'seller_proceeds' and t.version = 2;
  end if;

  update public.tasks task
  set template_id = nxt.id, template_version = nxt.version, title = nxt.title, description = nxt.description
  from public.task_templates nxt
  where nxt.active and nxt.code in ('personal_info', 'seller_proceeds') and task.template_code = nxt.code
    and task.kind = 'form' and task.status = 'todo' and task.saved_at is null
    and coalesce(task.form_data, '{}'::jsonb) = '{}'::jsonb
    and task.template_version < nxt.version;
end
$tpl$;

do $readback$
declare
  pf jsonb; sf jsonb; roles jsonb; ctype text; n int;
begin
  if (select version from public.task_templates where code = 'personal_info' and active order by version desc limit 1) is distinct from 10 then
    raise exception 'readback: personal_info v10 is not active'; end if;
  if (select version from public.task_templates where code = 'seller_proceeds' and active order by version desc limit 1) is distinct from 3 then
    raise exception 'readback: seller_proceeds v3 is not active'; end if;
  select fields into pf from public.task_templates where code = 'personal_info' and active;
  select fields into sf from public.task_templates where code = 'seller_proceeds' and active;
  select x->'roles' into roles from jsonb_array_elements(pf) x where x->>'k' = 'forwarding_address';
  if roles is null then raise exception 'readback: forwarding_address missing'; end if;
  if roles <> '["Client-Seller"]'::jsonb then raise exception 'readback: forwarding_address should stay seller-only, got %', roles; end if;
  select x->>'type' into ctype from jsonb_array_elements(pf) x where x->>'k' = 'citizenship';
  if ctype is distinct from 'text' then raise exception 'readback: citizenship type should stay text, got %', ctype; end if;
  if (select count(*) from jsonb_array_elements(pf)) <> 51 then raise exception 'readback: expected 51 personal_info questions, got %', (select count(*) from jsonb_array_elements(pf)); end if;
  if not exists (select 1 from jsonb_array_elements(pf) x where x->>'k' = 'entity_tax_id') then raise exception 'readback: EIN missing'; end if;
  if (select x->>'label' from jsonb_array_elements(pf) x where x->>'k' = 'attending_closing') is distinct from 'Attending the closing?' then
    raise exception 'readback: attending_closing label'; end if;
  if (select x->>'label' from jsonb_array_elements(pf) x where x->>'k' = 'ground_rent') is distinct from 'Subject to ground rent?' then
    raise exception 'readback: ground_rent label'; end if;
  if (select x->>'label' from jsonb_array_elements(sf) x where x->>'k' = 'method') is distinct from 'Proceeds Instructions: Overnight Check or Wire?' then
    raise exception 'readback: proceeds method label'; end if;
  if (select x->>'text' from jsonb_array_elements(sf) x where x->>'k' = 'proceeds_statement') is distinct from
     'Any seller proceeds are required to be disbursed to the SELLER OF RECORD. If the seller is an Entity/Trust, the proceeds will be disbursed to the Entity/Trust only.' then
    raise exception 'readback: proceeds statement'; end if;
  select count(*) into n from jsonb_array_elements(sf);
  if n is distinct from (select count(*) from public.task_templates t, jsonb_array_elements(t.fields) where t.code = 'seller_proceeds' and t.version = 2) then
    raise exception 'readback: seller_proceeds field count changed'; end if;
end
$readback$;

commit;
