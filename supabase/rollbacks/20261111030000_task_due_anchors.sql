-- Exact rollback of 20261111030000_task_due_anchors.sql.
-- Restores private.trg_participant_copies and private.rpc_upsert_task_template
-- to the bodies captured on TEST (md5 e17e50e7a9ec309216866157a3d65db8 and d221f4fc7ef2ee2fae3f9fce10391784).
-- Drops due_anchor and due_overridden. Due dates already stored on task copies stay.
-- Refuses if a template due_days is outside 1 to 90, because that value cannot return to the old check.
begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

do $guard$
begin
  if to_regprocedure('public.set_template_due_anchor(text,text,integer)') is null
     or to_regprocedure('public.set_task_due_override(uuid,date)') is null then
    raise exception 'drift: due-anchor functions are missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'task_templates' and column_name = 'due_anchor'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks' and column_name = 'due_overridden'
  ) then
    raise exception 'drift: due_anchor or due_overridden is missing';
  end if;
  if exists (select 1 from public.task_templates where due_days < 1 or due_days > 90) then
    raise exception 'rollback refused: a template due_days is outside 1 to 90';
  end if;
end
$guard$;

create or replace function private.rpc_upsert_task_template(p_code text, p_title text, p_description text, p_roles text[], p_due_days integer, p_lane text, p_audiences text[], p_client_only boolean default false)
returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
declare cur public.task_templates; ver int; aud text[]; lane text := p_lane; who text;
begin
  if (select private.effective_uid()) is null or not private.is_admin() then raise exception 'Only an Admin can manage task templates.' using errcode = '42501'; end if;
  if p_code !~ '^[a-z_]{2,40}$' then raise exception 'Task code must be 2 to 40 lowercase letters or underscores.' using errcode = '22023'; end if;
  if length(btrim(coalesce(p_title, ''))) < 2 then raise exception 'A task needs a title.' using errcode = '22023'; end if;
  if lane not in ('portal', 'production') then raise exception 'Classify the task as Title Portal or Title Production.' using errcode = '22023'; end if;
  aud := (select coalesce(array_agg(distinct x), '{}') from unnest(coalesce(p_audiences, '{}')) x);
  if exists (select 1 from unnest(aud) a where a not in ('buyer','seller','listing_agent','buyer_agent','sales_team','transaction_coordinator','internal')) then raise exception 'Unknown task audience.' using errcode = '22023'; end if;
  if lane = 'production' and cardinality(aud) = 0 then aud := array['internal']; end if;
  if cardinality(aud) = 0 then raise exception 'Pick who this task is for, or Internal only.' using errcode = '22023'; end if;
  if p_due_days is null or p_due_days < 1 or p_due_days > 90 then raise exception 'Due days must be from 1 to 90.' using errcode = '22023'; end if;
  select * into cur from public.task_templates where code = p_code order by version desc limit 1;
  ver := coalesce(cur.version, 0) + 1;
  update public.task_templates set active = false where code = p_code;
  insert into public.task_templates (code, version, title, description, roles, due_days, fields, active, published_by, lane, audiences, client_only)
  values (p_code, ver, btrim(p_title), coalesce(p_description, ''), coalesce(p_roles, '{}'), p_due_days, coalesce(cur.fields, '[]'::jsonb), true, private.effective_uid(), lane, aud, coalesce(p_client_only, false));
  insert into public.task_template_switches (code) values (p_code) on conflict (code) do nothing;
  select btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into who from public.profiles where id = private.effective_uid();
  insert into public.task_template_admin_log (code, action, detail, changed_by, changed_by_name) values (p_code, 'saved', lane || ' ' || array_to_string(aud, ','), private.effective_uid(), coalesce(who, ''));
  return jsonb_build_object('code', p_code, 'version', ver, 'lane', lane, 'audiences', aud, 'title', btrim(p_title));
end $function$;

create or replace function private.trg_participant_copies() returns trigger
language plpgsql security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
declare owner uuid; n int;
begin
  select profile_id into owner from public.contacts where id = new.contact_id;
  insert into public.tasks (deal_id, title, description, assigned_role, status, due_date, created_by, kind, participant_id, owner_profile_id, template_id, template_code, template_version, lane, audiences)
  select new.deal_id, t.title, t.description, new.role, 'todo', current_date + t.due_days, private.effective_uid(), 'form', new.id, owner, t.id, t.code, t.version, t.lane, t.audiences
  from public.task_templates t where t.active and t.retired_at is null and new.role = any (t.roles) and private.task_enabled(t.code)
    and (t.audiences is null or (not (t.audiences = array['internal']::text[]) and (
      (new.role = 'Client-Buyer' and 'buyer' = any (t.audiences)) or (new.role = 'Client-Seller' and 'seller' = any (t.audiences))
      or (new.role = 'Buyer Agent' and 'buyer_agent' = any (t.audiences)) or (new.role = 'Listing Agent' and 'listing_agent' = any (t.audiences))
      or (new.role in ('Sales Person', 'Sales Team') and 'sales_team' = any (t.audiences))
      or (new.role = 'Transaction Coordinator' and 'transaction_coordinator' = any (t.audiences)))))
    and not exists (select 1 from public.tasks x where x.participant_id = new.id and x.template_code = t.code and x.status <> 'cancelled');
  get diagnostics n = row_count;
  if n > 0 and owner is not null then perform private.notify(array[owner], 'task', new.deal_id, n || ' new task(s) on your order', '#/deals/' || new.deal_id || '/tasks'); end if;
  return new; end $function$;

drop function public.set_template_due_anchor(text, text, integer);
drop function public.set_task_due_override(uuid, date);
alter table public.task_templates drop constraint task_templates_due_anchor_check;
alter table public.task_templates drop column due_anchor;
alter table public.task_templates drop constraint task_templates_due_days_check;
alter table public.task_templates add constraint task_templates_due_days_check check (((due_days >= 1) and (due_days <= 90)));
alter table public.tasks drop column due_overridden;

do $readback$
begin
  if (select md5(prosrc) from pg_proc where oid = to_regprocedure('private.trg_participant_copies()'))
       is distinct from 'e17e50e7a9ec309216866157a3d65db8' then
    raise exception 'readback: participant copies trigger was not restored';
  end if;
  if (select md5(prosrc) from pg_proc where oid = to_regprocedure('private.rpc_upsert_task_template(text,text,text,text[],integer,text,text[],boolean)'))
       is distinct from 'd221f4fc7ef2ee2fae3f9fce10391784' then
    raise exception 'readback: task template save was not restored';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name in ('tasks', 'task_templates')
      and column_name in ('due_anchor', 'due_overridden')
  ) or to_regprocedure('public.set_task_due_override(uuid,date)') is not null then
    raise exception 'readback: a due-anchor object is still present';
  end if;
end
$readback$;
commit;
