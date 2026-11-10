-- Throwaway privileges matching TEST: authenticated may insert audiences and due_overridden, and may not select them.
create schema if not exists private;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid,
  title text not null default '',
  description text not null default '',
  assigned_role text not null default 'Processor',
  status text not null default 'todo',
  due_date date,
  kind text not null default 'simple',
  created_by uuid,
  owner_profile_id uuid,
  audiences text[],
  due_overridden boolean not null default false
);

revoke all on public.tasks from authenticated;
grant insert (id, deal_id, title, description, assigned_role, status, due_date, kind, created_by, owner_profile_id, audiences, due_overridden)
  on public.tasks to authenticated;
grant select (id, deal_id, title, description, assigned_role, status, due_date, kind, created_by, owner_profile_id)
  on public.tasks to authenticated;
grant update (title, description, assigned_role, status, due_date) on public.tasks to authenticated;

create or replace function private.effective_uid() returns uuid
language sql stable as $$ select '33333333-3333-3333-3333-333333333333'::uuid $$;
create or replace function private.deal_roles(p_deal uuid) returns text[]
language sql stable as $$ select array['Client-Buyer']::text[] $$;

create or replace function private.task_outside_audience(p_task uuid)
returns boolean language sql stable security definer
set search_path to 'pg_catalog', 'public', 'extensions' as $function$
  select exists (select 1 from public.tasks t where t.id = p_task and t.audiences is not null and (
    ('Client-Buyer' = any (private.deal_roles(t.deal_id)) and 'buyer' = any (t.audiences) and t.owner_profile_id = (select private.effective_uid()) and not (t.audiences = array['internal']::text[]))
    or ('Client-Seller' = any (private.deal_roles(t.deal_id)) and 'seller' = any (t.audiences) and t.owner_profile_id = (select private.effective_uid()) and not (t.audiences = array['internal']::text[]))
    or ('Buyer Agent' = any (private.deal_roles(t.deal_id)) and 'buyer_agent' = any (t.audiences))
    or ('Listing Agent' = any (private.deal_roles(t.deal_id)) and 'listing_agent' = any (t.audiences)))) $function$;
