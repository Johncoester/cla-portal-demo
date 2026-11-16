-- Rollback CRM-OWNER-1. Restores role-based CRM owners (Sales Person and Sales Team).
-- Drops the tick. Anyone who had been turned on goes back to the old rule.
-- Run on TEST only if this file was applied there. Never run on production.

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

create or replace function private.crm_owner_check(p_new uuid, p_old uuid, p_insert boolean)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $fn$
begin
  if p_insert and p_new is null and private.effective_uid() is not null and not private.is_admin() and coalesce(private.me_role() in ('Sales Person', 'Sales Team'), false) then p_new := private.effective_uid(); end if;
  if p_new is not null and p_new is distinct from p_old and not exists (select 1 from public.profiles where id = p_new and status = 'active' and role in ('Sales Person', 'Sales Team')) then
    raise exception 'The owner must be an active Sales Person or Sales Team user.' using errcode = 'P0001'; end if;
  if private.effective_uid() is not null and p_new is distinct from p_old and p_new is distinct from private.effective_uid() and not private.is_admin() and coalesce(private.me_role() = 'Sales Person', false) then
    raise exception 'A Sales Person can only assign records to themselves.' using errcode = 'P0001'; end if;
  return p_new;
end
$fn$;

create or replace function private.rpc_crm_owners()
returns table(id uuid, name text, role text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $fn$
begin
  perform private.crm_need();
  return query select p.id, btrim(p.first_name || ' ' || p.last_name), p.role from public.profiles p where p.status = 'active' and p.role in ('Sales Person', 'Sales Team') order by 2;
end
$fn$;

create or replace function private.deal_sales_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $fn$
declare s public.profiles;
begin
  select * into s from public.profiles where id = new.sales_id;
  if s.id is null then raise exception 'Salesperson not found.' using errcode = 'P0001'; end if;
  if coalesce(current_setting('cla.sales_backfill', true), '') = 'on' then return new; end if;
  if s.role not in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin')
     or s.status <> 'active' then
    raise exception 'Only an active staff login can be a salesperson on an order.' using errcode = 'P0001';
  end if;
  if s.is_demo is distinct from coalesce((select d.is_demo from public.deals d where d.id = new.deal_id), false) then
    raise exception 'A real order cannot use a demo login, and a demo order cannot use a real login.' using errcode = 'P0001';
  end if;
  return new;
end
$fn$;

do $unpatch$
declare
  sig text;
  def text;
  nxt text;
  new_owners text := $n$p.status = 'active' and p.can_own_crm$n$;
  old_owners text := $o$p.role in ('Sales Person', 'Sales Team') and (p.status = 'active' or exists (select 1 from public.deal_sales_people s where s.sales_id = p.id))$o$;
begin
  foreach sig in array array['public.crm_deal_filters()', 'private.rpc_crm_deal_filters()']
  loop
    if to_regprocedure(sig) is null then
      continue;
    end if;
    def := pg_get_functiondef(sig::regprocedure);
    if position(new_owners in def) > 0 then
      execute replace(def, new_owners, old_owners);
    end if;
  end loop;

  if to_regprocedure('public.crm_import_batch(boolean, text, text, text, jsonb, jsonb, uuid, integer)') is not null then
    def := pg_get_functiondef('public.crm_import_batch(boolean, text, text, text, jsonb, jsonb, uuid, integer)'::regprocedure);
    if position('can own CRM records' in def) > 0 then
      nxt := replace(def, 'status = ''active'' and can_own_crm', 'status = ''active'' and role in (''Sales Person'', ''Sales Team'')');
      nxt := replace(nxt,
        'The default Owner must be an active user who can own CRM records.',
        'The default Owner must be an active Sales Person or Sales Team user.');
      nxt := replace(nxt,
        'Owner "%" matches more than one user who can own CRM records. Use the email.',
        'Owner "%" matches more than one salesperson. Use the email.');
      nxt := replace(nxt,
        'Owner "%" is not an active user who can own CRM records.',
        'Owner "%" is not an active Sales Person or Sales Team user.');
      execute nxt;
    end if;
  end if;
end
$unpatch$;

drop trigger if exists profiles_can_own_crm_guard on public.profiles;
drop function if exists private.profiles_can_own_crm_guard();
drop function if exists public.crm_owner_labels(uuid[]);
drop function if exists private.rpc_crm_owner_labels(uuid[]);

alter table public.profiles drop column if exists can_own_crm;

commit;
