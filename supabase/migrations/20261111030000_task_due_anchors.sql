-- Due dates for new task copies count from the file opened date, the contract date, or the closing date.
-- A missing anchor date leaves that copy with no due date. A due date changed on one copy is kept.
-- Existing task rows are not updated.
-- Captured on TEST before this file: private.trg_participant_copies md5 e17e50e7a9ec309216866157a3d65db8
-- and private.rpc_upsert_task_template md5 d221f4fc7ef2ee2fae3f9fce10391784.
-- The replacement trigger keeps that function's audience filter, notify, and not-exists guard,
-- and adds due_overridden plus the anchor date. Not applied on TEST by this commit.
-- Rollback: supabase/rollbacks/20261111030000_task_due_anchors.sql
begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

do $guard$
declare def text;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'task_templates' and column_name = 'due_anchor'
  ) or exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks' and column_name = 'due_overridden'
  ) then
    raise exception 'drift: due_anchor or due_overridden already exists';
  end if;
  if to_regprocedure('private.trg_participant_copies()') is null
     or (select md5(prosrc) from pg_proc where oid = to_regprocedure('private.trg_participant_copies()'))
        is distinct from 'e17e50e7a9ec309216866157a3d65db8' then
    raise exception 'drift: private.trg_participant_copies() changed or missing';
  end if;
  if to_regprocedure('private.rpc_upsert_task_template(text,text,text,text[],integer,text,text[],boolean)') is null
     or (select md5(prosrc) from pg_proc where oid = to_regprocedure('private.rpc_upsert_task_template(text,text,text,text[],integer,text,text[],boolean)'))
        is distinct from 'd221f4fc7ef2ee2fae3f9fce10391784' then
    raise exception 'drift: private.rpc_upsert_task_template changed or missing';
  end if;
  if to_regprocedure('private.is_manager()') is null then
    raise exception 'drift: private.is_manager() is missing';
  end if;
  if to_regprocedure('private.is_admin()') is null or to_regprocedure('private.can_access_deal(uuid)') is null then
    raise exception 'drift: private.is_admin or private.can_access_deal is missing';
  end if;
  select pg_get_constraintdef(oid) into def from pg_constraint where conname = 'task_templates_due_days_check';
  if def is null or def !~ 'due_days >= 1' or def !~ 'due_days <= 90' or def ~ '-90' then
    raise exception 'drift: task_templates_due_days_check is not 1 to 90';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'participants_copies' and not tgisinternal) then
    raise exception 'drift: participants_copies trigger is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'deals' and column_name = 'contract_date' and data_type = 'date'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'deals' and column_name = 'open_date' and data_type = 'date'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'deals' and column_name = 'closing_date' and data_type = 'date'
  ) then
    raise exception 'drift: deals is missing open_date, contract_date, or closing_date';
  end if;
  if (
    select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks'
      and column_name in ('deal_id','title','description','assigned_role','status','due_date','created_by','kind','participant_id','owner_profile_id','template_id','template_code','template_version','lane','audiences')
  ) <> 15 then
    raise exception 'drift: tasks is missing a column the current copy trigger writes';
  end if;
end
$guard$;

alter table public.task_templates add column due_anchor text not null default 'opened';
alter table public.task_templates add constraint task_templates_due_anchor_check check (due_anchor in ('opened', 'contract', 'closing'));
alter table public.task_templates drop constraint task_templates_due_days_check;
alter table public.task_templates add constraint task_templates_due_days_check check (due_days <> 0 and due_days between -90 and 90);
alter table public.tasks add column due_overridden boolean not null default false;

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
  if p_due_days is null or p_due_days = 0 or p_due_days < -90 or p_due_days > 90 then raise exception 'Due days must be from -90 to 90, not zero.' using errcode = '22023'; end if;
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


create or replace function public.set_template_due_anchor(p_code text, p_anchor text, p_due_days integer) returns void
language plpgsql security definer
set search_path to 'pg_catalog', 'public', 'extensions' as $function$
declare n int;
begin
  if not private.is_admin() then raise exception 'Only an Admin or Super admin can change a task template.' using errcode = '42501'; end if;
  if p_anchor not in ('opened', 'contract', 'closing') then raise exception 'Due dates count from opened, contract, or closing.' using errcode = '22023'; end if;
  if p_due_days is null or p_due_days = 0 or p_due_days < -90 or p_due_days > 90 then raise exception 'Due days must be from -90 to 90, not zero.' using errcode = '22023'; end if;
  update public.task_templates set due_anchor = p_anchor, due_days = p_due_days
  where code = p_code and active and retired_at is null;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Task template not found.' using errcode = 'P0002'; end if;
end $function$;

create or replace function public.set_task_due_override(p_task uuid, p_due date) returns date
language plpgsql security definer
set search_path to 'pg_catalog', 'public', 'extensions' as $function$
declare v_deal uuid;
begin
  select deal_id into v_deal from public.tasks where id = p_task;
  if v_deal is null or not private.can_access_deal(v_deal) then raise exception 'Task not found.' using errcode = 'P0002'; end if;
  if not private.is_manager() then raise exception 'Only the processor or transaction coordinator can change a due date.' using errcode = '42501'; end if;
  update public.tasks set due_date = p_due, due_overridden = true where id = p_task;
  return p_due;
end $function$;

create or replace function private.trg_participant_copies() returns trigger
language plpgsql security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
declare owner uuid; n int;
begin
  select profile_id into owner from public.contacts where id = new.contact_id;
  insert into public.tasks (deal_id, title, description, assigned_role, status, due_date, due_overridden, created_by, kind, participant_id, owner_profile_id, template_id, template_code, template_version, lane, audiences)
  select new.deal_id, t.title, t.description, new.role, 'todo', (case coalesce(t.due_anchor, 'opened') when 'closing' then d.closing_date when 'contract' then d.contract_date else d.open_date end) + t.due_days, false, private.effective_uid(), 'form', new.id, owner, t.id, t.code, t.version, t.lane, t.audiences
  from public.task_templates t join public.deals d on d.id = new.deal_id where t.active and t.retired_at is null and new.role = any (t.roles) and private.task_enabled(t.code)
    and (t.audiences is null or (not (t.audiences = array['internal']::text[]) and (
      (new.role = 'Client-Buyer' and 'buyer' = any (t.audiences)) or (new.role = 'Client-Seller' and 'seller' = any (t.audiences))
      or (new.role = 'Buyer Agent' and 'buyer_agent' = any (t.audiences)) or (new.role = 'Listing Agent' and 'listing_agent' = any (t.audiences))
      or (new.role in ('Sales Person', 'Sales Team') and 'sales_team' = any (t.audiences))
      or (new.role = 'Transaction Coordinator' and 'transaction_coordinator' = any (t.audiences)))))
    and not exists (select 1 from public.tasks x where x.participant_id = new.id and x.template_code = t.code and x.status <> 'cancelled');
  get diagnostics n = row_count;
  if n > 0 and owner is not null then perform private.notify(array[owner], 'task', new.deal_id, n || ' new task(s) on your order', '#/deals/' || new.deal_id || '/tasks'); end if;
  return new; end $function$;

revoke all on function private.trg_participant_copies() from public, anon, authenticated;
revoke all on function public.set_template_due_anchor(text, text, integer) from public, anon;
grant execute on function public.set_template_due_anchor(text, text, integer) to authenticated;
revoke all on function public.set_task_due_override(uuid, date) from public, anon;
grant execute on function public.set_task_due_override(uuid, date) to authenticated;

do $readback$
begin
  if (select position('due_overridden' in prosrc) from pg_proc where oid = to_regprocedure('private.trg_participant_copies()')) = 0
     or (select position('due_anchor' in prosrc) from pg_proc where oid = to_regprocedure('private.trg_participant_copies()')) = 0
     or (select position('current_date + t.due_days' in prosrc) from pg_proc where oid = to_regprocedure('private.trg_participant_copies()')) > 0
     or (select position('new task(s) on your order' in prosrc) from pg_proc where oid = to_regprocedure('private.trg_participant_copies()')) = 0
     or (select position('buyer_agent' in prosrc) from pg_proc where oid = to_regprocedure('private.trg_participant_copies()')) = 0 then
    raise exception 'readback: the copy trigger is not the anchor superset of the current function';
  end if;
  if (select position('not zero' in prosrc) from pg_proc where oid = to_regprocedure('private.rpc_upsert_task_template(text,text,text,text[],integer,text,text[],boolean)')) = 0 then
    raise exception 'readback: task template save still refuses a negative due day';
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'task_templates_due_anchor_check'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks' and column_name = 'due_overridden' and column_default = 'false'
  ) then
    raise exception 'readback: due anchor column or override flag is missing';
  end if;
end
$readback$;
commit;
