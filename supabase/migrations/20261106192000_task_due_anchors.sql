-- Task due dates can count from the file's open date, contract date, or closing date.
-- A missing anchor date leaves the copy with no due date. A due date changed on one copy is kept.
-- Does not create or alter anything in schema auth. Not applied until John says so.

alter table public.task_templates add column if not exists due_anchor text not null default 'opened';
alter table public.task_templates drop constraint if exists task_templates_due_anchor_check;
alter table public.task_templates add constraint task_templates_due_anchor_check check (due_anchor in ('opened', 'contract', 'closing'));
alter table public.tasks add column if not exists due_overridden boolean not null default false;

create or replace function public.set_template_due_anchor(p_code text, p_anchor text, p_due_days integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not private.is_admin() then raise exception 'Only an Admin or Super admin can change a task template.' using errcode = 'P0001'; end if;
  if p_anchor not in ('opened', 'contract', 'closing') then raise exception 'Due dates count from opened, contract, or closing.' using errcode = 'P0001'; end if;
  if p_due_days is null or p_due_days = 0 or p_due_days < -90 or p_due_days > 90 then raise exception 'Due days must be from -90 to 90, not zero.' using errcode = 'P0001'; end if;
  update public.task_templates set due_anchor = p_anchor, due_days = p_due_days where code = p_code and active and retired_at is null;
end $$;
revoke all on function public.set_template_due_anchor(text, text, integer) from public, anon;
grant execute on function public.set_template_due_anchor(text, text, integer) to authenticated;

create or replace function public.set_task_due_override(p_task uuid, p_due date) returns date
language plpgsql security definer set search_path = public as $$
declare v_deal uuid; v_role text;
begin
  select deal_id into v_deal from public.tasks where id = p_task;
  if v_deal is null or not private.can_access_deal(v_deal) then raise exception 'Task not found.' using errcode = 'P0002'; end if;
  select role into v_role from public.profiles where id = private.effective_uid();
  if not (private.is_processor() or v_role = 'Transaction Coordinator') then raise exception 'Only the processor or transaction coordinator can change a due date.' using errcode = 'P0001'; end if;
  update public.tasks set due_date = p_due, due_overridden = true where id = p_task;
  return p_due;
end $$;
revoke all on function public.set_task_due_override(uuid, date) from public, anon;
grant execute on function public.set_task_due_override(uuid, date) to authenticated;

create or replace function private.trg_participant_copies() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
declare owner uuid; n int;
begin
  select profile_id into owner from public.contacts where id = new.contact_id;
  insert into public.tasks (deal_id, title, description, assigned_role, status, due_date, due_overridden, created_by, kind, participant_id, owner_profile_id, template_id, template_code, template_version, lane, audiences)
  select new.deal_id, t.title, t.description, new.role, 'todo',
    (case coalesce(t.due_anchor, 'opened') when 'closing' then d.closing_date when 'contract' then d.contract_date else d.open_date end) + coalesce(t.due_days, 7),
    false, private.effective_uid(), 'form', new.id, owner, t.id, t.code, t.version, t.lane, t.audiences
  from public.task_templates t
  join public.deals d on d.id = new.deal_id
  where t.active and t.retired_at is null and new.role = any (t.roles) and private.task_enabled(t.code)
    and (t.audiences is null or (not (t.audiences = array['internal']::text[]) and (
      (new.role = 'Client-Buyer' and 'buyer' = any (t.audiences)) or (new.role = 'Client-Seller' and 'seller' = any (t.audiences))
      or (new.role = 'Buyer Agent' and 'buyer_agent' = any (t.audiences)) or (new.role = 'Listing Agent' and 'listing_agent' = any (t.audiences))
      or (new.role in ('Sales Person', 'Sales Team') and 'sales_team' = any (t.audiences))
      or (new.role = 'Transaction Coordinator' and 'transaction_coordinator' = any (t.audiences)))))
    and not exists (select 1 from public.tasks x where x.participant_id = new.id and x.template_code = t.code and x.status <> 'cancelled');
  get diagnostics n = row_count;
  if n > 0 and owner is not null then perform private.notify(array[owner], 'task', new.deal_id, n || ' new task(s) on your order', '#/deals/' || new.deal_id || '/tasks'); end if;
  return new;
end $$;

select private.lock_function_search_paths();
