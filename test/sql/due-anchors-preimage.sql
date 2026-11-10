-- Scratch preimage of the TEST task-copy trigger and template save, captured 2026-11-10.
-- Installed after main's migrations, which do not create these objects.
-- Not a hosted migration.
create schema if not exists private;
create schema if not exists extensions;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

alter table public.deals add column if not exists contract_date date;
alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles add column if not exists status text not null default 'active';

create table if not exists public.task_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  version int not null,
  title text not null,
  description text not null default '',
  roles text[] not null,
  due_days int not null default 7,
  fields jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  published_by uuid,
  published_at timestamptz not null default now(),
  agent_roles text[] not null default '{}',
  client_only boolean not null default false,
  lane text,
  audiences text[],
  retired_at timestamptz,
  retired_by uuid,
  retire_reason text not null default ''
);
alter table public.task_templates drop constraint if exists task_templates_due_days_check;
alter table public.task_templates add constraint task_templates_due_days_check check (((due_days >= 1) and (due_days <= 90)));

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null,
  title text not null,
  description text not null default '',
  assigned_role text not null default 'Processor',
  status text not null default 'todo',
  due_date date,
  created_by uuid,
  created_at timestamptz not null default now(),
  kind text not null default 'simple',
  participant_id uuid,
  owner_profile_id uuid,
  template_id uuid,
  template_code text,
  template_version int,
  lane text,
  audiences text[]
);

create table if not exists public.task_template_switches (
  code text primary key,
  enabled boolean not null default true
);
create table if not exists public.task_template_admin_log (
  id uuid primary key default gen_random_uuid(),
  code text,
  action text,
  detail text,
  changed_by uuid,
  changed_by_name text
);

create or replace function private.effective_uid() returns uuid
language sql stable security definer set search_path to pg_catalog, public as $$ select '11111111-1111-1111-1111-111111111111'::uuid $$;
create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path to pg_catalog, public as $$
  select coalesce((select is_admin from public.profiles where id = private.effective_uid() and status = 'active'), false) $$;
create or replace function private.is_processor() returns boolean
language sql stable security definer set search_path to pg_catalog, public as $$
  select coalesce((select role in ('Processor', 'Preprocessor') from public.profiles where id = private.effective_uid() and status = 'active'), false) or private.is_admin() $$;
create or replace function private.is_manager() returns boolean
language sql stable security definer set search_path to pg_catalog, public as $$
  select coalesce((select role in ('Processor', 'Preprocessor', 'Transaction Coordinator') from public.profiles where id = private.effective_uid() and status = 'active'), false) or private.is_admin() $$;
create or replace function private.can_access_deal(d uuid) returns boolean
language sql stable security definer set search_path to pg_catalog, public as $$ select true $$;
create or replace function private.task_enabled(p_code text) returns boolean
language sql stable security definer set search_path to pg_catalog, public as $$ select true $$;
create or replace function private.notify(p_ids uuid[], p_kind text, p_deal uuid, p_title text, p_link text) returns void
language plpgsql security definer set search_path to pg_catalog, public as $$ begin return; end $$;
create or replace function private.rpc_upsert_task_template(p_code text, p_title text, p_description text, p_roles text[], p_due_days integer, p_lane text, p_audiences text[], p_client_only boolean default false)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'extensions'
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
language plpgsql security definer set search_path to 'pg_catalog', 'public', 'extensions'
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
drop trigger if exists participants_copies on public.deal_participants;
create trigger participants_copies after insert on public.deal_participants
for each row execute function private.trg_participant_copies();
