-- Disposable local tables for MF-057. Not the TEST database.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

create schema if not exists private;
create schema if not exists extensions;

create or replace function private.office_today() returns date
language sql stable as $$ select date '2026-11-16' $$;

create table if not exists public.deals (
  id uuid primary key
);

create table if not exists public.tasks (
  id uuid primary key,
  deal_id uuid not null references public.deals(id),
  title text not null default '',
  assigned_role text not null default 'Processor',
  status text not null default 'todo',
  due_date date,
  participant_id uuid,
  owner_profile_id uuid,
  template_code text
);
