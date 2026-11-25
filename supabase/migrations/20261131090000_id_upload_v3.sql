-- MF-070 (Matt Landsberg, Portal Feedback Nov 25 2026 2:47 PM ET, confirmed 3:02/3:03 and 4:35 PM ET,
-- Gmail 1a214404e5bc56be / 1a2144e1f7c52248 / 1a214a29c1dc75c5):
-- Buyer (and seller) ID upload requires front and back. A passport needs one image only.
-- id_upload v3 = v2 without id_document, with id_front and id_back for every client, and the back
-- field active only when ID type is Driver's license, State ID or Military ID.
-- Same publish rule as personal_info: only untouched to-do copies with no answers move to v3.
-- Also extends private.validate_form so a `when` value can be a list, matching fieldActive in JS.
-- That is the same completeness guard used on save. Rollback: supabase/rollbacks/20261131090000_id_upload_v3.sql
begin;
set local lock_timeout = '3s';

do $fn$
begin
  if position('jsonb_typeof(f->''when''->1)' in (select p.prosrc from pg_proc p where p.oid = 'private.validate_form(jsonb,jsonb,boolean,uuid)'::regprocedure)) > 0 then
    null;   -- already extended
  elsif md5((select p.prosrc from pg_proc p where p.oid = 'private.validate_form(jsonb,jsonb,boolean,uuid)'::regprocedure)) <> 'f529aa122dd3f1f9893c786b848f2756' then
    raise exception 'drift: private.validate_form is not the version this migration expects';
  else
    execute $create$
create or replace function private.validate_form(p_fields jsonb, p_data jsonb, p_complete boolean, p_deal uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare f jsonb; k text; typ text; v text; clean jsonb := '{}'; errs text[] := '{}'; active boolean;
begin
  for f in select * from jsonb_array_elements(p_fields) loop
    k := f->>'k'; typ := f->>'type';
    if typ = 'checkbox' then if coalesce(p_data->>k, '') in ('true', 'on') then clean := clean || jsonb_build_object(k, true); end if; continue; end if;
    if typ = 'info' then continue; end if;   -- text shown on the form, never an answer
    v := trim(coalesce(p_data->>k, ''));
    if v = '' then continue; end if;
    v := left(v, case when typ in ('textarea', 'mortgages') then 2000 else 300 end);   -- FF-067: mortgages (a JSON list with full loan numbers) may run past 300
    if typ = 'phone' and private.fmt_phone(v) is not null then v := private.fmt_phone(v); end if;
    if typ = 'state' then v := upper(v); end if;
    if typ in ('routing', 'account') then v := regexp_replace(v, '[\s-]', '', 'g'); end if;
    clean := clean || jsonb_build_object(k, v);
  end loop;
  for f in select * from jsonb_array_elements(p_fields) loop
    k := f->>'k'; typ := f->>'type';
    active := not (k <> 'none' and clean ? 'none') and (
      f->'when' is null
      or case
        when jsonb_typeof(f->'when'->1) = 'array'
          then coalesce((f->'when'->1) ? (clean->>(f->'when'->>0)), false)
        else coalesce(clean->>(f->'when'->>0) = f->'when'->>1, false)
      end
    );
    if typ = 'info' then continue; end if;
    if typ = 'checkbox' then
      if not active then clean := clean - k;
      elsif p_complete and coalesce((f->>'req')::boolean, false) and not (clean ? k) then errs := errs || ('Please tick: ' || (f->>'label') || '.'); end if;
      continue; end if;
    if not active then clean := clean - k; continue; end if;
    v := clean->>k;
    if v is null then if p_complete and coalesce((f->>'req')::boolean, false) then errs := errs || ((f->>'label') || ' is required.'); end if; continue; end if;
    if typ = 'select' and not (f->'opts' ? v) then errs := errs || ((f->>'label') || ': pick one of the options.');
    elsif typ = 'email' and v !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then errs := errs || ((f->>'label') || ' must be a valid email.');
    elsif typ = 'phone' and v !~ '^\d{3}-\d{3}-\d{4}$' then errs := errs || ((f->>'label') || ' must be a 10-digit phone number (xxx-xxx-xxxx).');
    elsif typ = 'date' and v !~ '^\d{4}-\d{2}-\d{2}$' then errs := errs || ((f->>'label') || ' must be a date.');
    elsif typ = 'money' and replace(replace(v, '$', ''), ',', '') !~ '^\d+(\.\d+)?$' then errs := errs || ((f->>'label') || ' must be a positive amount.');
    elsif typ = 'digits4' and v !~ '^\d{4}$' then errs := errs || ((f->>'label') || ' must be exactly 4 digits.');
    elsif typ = 'routing' and not private.routing_ok(v) then errs := errs || ((f->>'label') || ' must be a valid 9-digit routing number.');
    elsif typ = 'account' and v !~ '^\d{4,17}$' then errs := errs || ((f->>'label') || ' must be 4 to 17 digits.');
    elsif typ = 'state' and v !~ '^[A-Z]{2}$' then errs := errs || ((f->>'label') || ' must be a 2-letter code (e.g. MD).');
    elsif typ = 'zip' and v !~ '^\d{5}(-\d{4})?$' then errs := errs || ((f->>'label') || ' must be a 5-digit ZIP.');
    elsif typ = 'doc' and (v !~ '^[0-9a-f-]{36}$' or not exists (select 1 from public.documents d where d.id = v::uuid and d.deal_id = p_deal)) then errs := errs || ((f->>'label') || ': upload the file again.');
    end if;
  end loop;
  if cardinality(errs) > 0 then raise exception '%', array_to_string(errs, ' ') using errcode = 'P0001'; end if;
  return clean; end $function$;
$create$;
  end if;
end
$fn$;

do $tpl$
declare id_active integer; f jsonb;
begin
  select t.version into id_active from public.task_templates t where t.code = 'id_upload' and t.active order by t.version desc limit 1;
  if id_active = 3 then
    null;   -- already published
  elsif id_active is distinct from 2 or exists (select 1 from public.task_templates t where t.code = 'id_upload' and t.version = 3) then
    raise exception 'drift: id_upload v2 is not the active version';
  else
    select jsonb_agg(
      case
        when e.elem->>'k' = 'id_front' then (e.elem - 'roles')
        when e.elem->>'k' = 'id_back' then (e.elem - 'roles') || '{"when":["id_type",["Driver''s license","State ID","Military ID"]]}'::jsonb
        else e.elem
      end
      order by e.ord
    ) filter (where e.elem->>'k' is distinct from 'id_document')
    into f
    from public.task_templates t
    cross join lateral jsonb_array_elements(t.fields) with ordinality as e(elem, ord)
    where t.code = 'id_upload' and t.version = 2;

    update public.task_templates set active = false where code = 'id_upload' and active;
    insert into public.task_templates (code, version, title, description, roles, due_days, due_anchor, fields, active, published_at, agent_roles, client_only, lane, audiences)
    select t.code, 3,
      t.title,
      'A clear photo or scan of a government ID. A driver''s license, state ID or military ID needs the front and the back. A passport needs one image only.',
      t.roles, t.due_days, t.due_anchor, f, true, now(), t.agent_roles, t.client_only, t.lane, t.audiences
    from public.task_templates t where t.code = 'id_upload' and t.version = 2;
  end if;

  update public.tasks task
  set template_id = nxt.id, template_version = nxt.version, title = nxt.title, description = nxt.description
  from public.task_templates nxt
  where nxt.active and nxt.code = 'id_upload' and task.template_code = 'id_upload'
    and task.kind = 'form' and task.status = 'todo' and task.saved_at is null
    and coalesce(task.form_data, '{}'::jsonb) = '{}'::jsonb
    and task.template_version < nxt.version;
end
$tpl$;

do $readback$
declare pf jsonb; back jsonb; front_roles jsonb;
begin
  if position('jsonb_typeof(f->''when''->1)' in (select p.prosrc from pg_proc p where p.oid = 'private.validate_form(jsonb,jsonb,boolean,uuid)'::regprocedure)) = 0 then
    raise exception 'readback: validate_form does not treat a when-list as a list'; end if;
  if (select version from public.task_templates where code = 'id_upload' and active order by version desc limit 1) is distinct from 3 then
    raise exception 'readback: id_upload v3 is not active'; end if;
  select fields into pf from public.task_templates where code = 'id_upload' and active;
  if exists (select 1 from jsonb_array_elements(pf) x where x->>'k' = 'id_document') then
    raise exception 'readback: id_document should not be on v3'; end if;
  if not exists (select 1 from jsonb_array_elements(pf) x where x->>'k' = 'id_front' and coalesce(x->'roles', 'null'::jsonb) = 'null'::jsonb) then
    raise exception 'readback: id_front should be on every client copy'; end if;
  select x into back from jsonb_array_elements(pf) x where x->>'k' = 'id_back';
  if back is null then raise exception 'readback: id_back missing'; end if;
  if coalesce(back->'roles', 'null'::jsonb) <> 'null'::jsonb then raise exception 'readback: id_back should be on every client copy'; end if;
  if jsonb_typeof(back->'when'->1) is distinct from 'array' or not (back->'when'->1) ? 'Driver''s license' or (back->'when'->1) ? 'Passport' then
    raise exception 'readback: id_back should show for license, state ID and military ID, not passport, got %', back->'when'; end if;
  if (select count(*) from jsonb_array_elements(pf)) <> 4 then raise exception 'readback: expected 4 questions'; end if;
end
$readback$;

commit;
