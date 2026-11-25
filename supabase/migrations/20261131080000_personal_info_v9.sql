-- MF-074 (Matt Landsberg, Portal Feedback Nov 25 2026 2:47 PM ET, confirmed 3:02/3:03 PM ET, Gmail 1a214404e5bc56be / 1a2144e1f7c52248):
-- Remove Forwarding Address from Buyer Intake. Sellers keep theirs (personal_info and the separate forwarding_address task).
-- personal_info v9 = v8 with forwarding_address roles set to Client-Seller only.
-- Same publish rule as 20261117150000: only untouched to-do copies with no answers move to v9.
-- Copies with saved answers keep their version and answers. Does not change who can read or write, and adds no functions.
-- Rollback: supabase/rollbacks/20261131080000_personal_info_v9.sql
begin;
set local lock_timeout = '3s';

do $tpl$
declare pi_active integer; f jsonb;
begin
  select t.version into pi_active from public.task_templates t where t.code = 'personal_info' and t.active order by t.version desc limit 1;
  if pi_active = 9 then
    null;   -- already published
  elsif pi_active is distinct from 8 or exists (select 1 from public.task_templates t where t.code = 'personal_info' and t.version = 9) then
    raise exception 'drift: personal_info v8 is not the active version';
  else
    select jsonb_agg(
      case when e.elem->>'k' = 'forwarding_address'
        then (e.elem - 'roles') || '{"roles":["Client-Seller"]}'::jsonb
        else e.elem end
      order by e.ord
    ) into f
    from public.task_templates t
    cross join lateral jsonb_array_elements(t.fields) with ordinality as e(elem, ord)
    where t.code = 'personal_info' and t.version = 8;

    update public.task_templates set active = false where code = 'personal_info' and active;
    insert into public.task_templates (code, version, title, description, roles, due_days, due_anchor, fields, active, published_at, agent_roles, client_only, lane, audiences)
    select t.code, 9,
      t.title,
      'Buyer and seller personal details. Sellers also answer property and utility questions, including a forwarding address. Spouse information is a section on this form.',
      t.roles, t.due_days, t.due_anchor, f, true, now(), t.agent_roles, t.client_only, t.lane, t.audiences
    from public.task_templates t where t.code = 'personal_info' and t.version = 8;
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
declare pf jsonb; roles jsonb;
begin
  if (select version from public.task_templates where code = 'personal_info' and active order by version desc limit 1) is distinct from 9 then
    raise exception 'readback: personal_info v9 is not active'; end if;
  select fields into pf from public.task_templates where code = 'personal_info' and active;
  select x->'roles' into roles from jsonb_array_elements(pf) x where x->>'k' = 'forwarding_address';
  if roles is null then raise exception 'readback: forwarding_address missing'; end if;
  if roles <> '["Client-Seller"]'::jsonb then raise exception 'readback: forwarding_address should be seller-only, got %', roles; end if;
  if (select count(*) from jsonb_array_elements(pf)) <> 51 then raise exception 'readback: expected 51 questions'; end if;
  if not exists (select 1 from jsonb_array_elements(pf) x where x->>'k' = 'entity_tax_id') then raise exception 'readback: EIN missing'; end if;
end
$readback$;

commit;
