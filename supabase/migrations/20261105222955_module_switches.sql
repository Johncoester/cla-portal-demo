-- Source: TEST schema_migrations (project aqcervntopidtcazcmlv).
-- Version 20261105222955, name module_switches.
-- Exported November 15, 2026 (America/New_York).
-- =====================================================================
-- Migration 35 (John, Nov 3): MODULE SWITCHES. One "Live" switch per module, changed only by an active Admin / Super admin, every change logged.
--   Live = true  : the module is live for everyone their role allows (all the existing role rules / RLS still apply on top).
--   Live = false : BETA: the app hides the module from everyone but Admins / Super admins (who see a "Beta, in testing" badge).
-- Modules: crm, crm-deals, calls, accounting, tasks, task-grid, library (public/js/data/modules.js). All start Live (= the behaviour before).
-- Core order pages are always on and have no row. The config flags (features.crm / features.accounting) and the database switches in
-- private.features (migrations 22 / 34) still decide whether a module exists at all; this table never turns either of them on.
--  * public.module_settings: one row per module. Every signed-in user may READ it (the nav needs it). Nobody writes it directly
--    (no insert / update / delete grant); public.set_module_live() is the only way, and it refuses anyone but an active Admin / Super admin.
--  * public.module_settings_log: who, when, old -> new for every change. Admins read it. Never changed or deleted (trigger), even by the owner.
--  * No hard deletes: rows in either table cannot be deleted (trigger), module names cannot change.
--  * public.module_access(p_module) -> 'live' | 'beta' (Admin testing) | 'off' for the signed-in user; for RLS / RPCs that want to honour it.
-- Re-runnable. FAKE DATA ONLY in every environment this has been run in. (Next free numbers: feature/accounting-calculator-fees uses 36 / test 117.)
-- =====================================================================
create table if not exists public.module_settings (
  module text primary key check (module in ('crm', 'crm-deals', 'calls', 'accounting', 'tasks', 'task-grid', 'library')),
  live boolean not null default true,
  updated_at timestamptz, updated_by uuid references public.profiles (id));
insert into public.module_settings (module, live) values ('crm', true), ('crm-deals', true), ('calls', true), ('accounting', true), ('tasks', true), ('task-grid', true), ('library', true)
  on conflict (module) do nothing;

create table if not exists public.module_settings_log (
  id bigserial primary key, module text not null references public.module_settings (module),
  old_live boolean not null, new_live boolean not null, changed_by uuid references public.profiles (id), changed_by_name text not null default '',
  changed_at timestamptz not null default now());
create index if not exists module_settings_log_at_idx on public.module_settings_log (changed_at desc);

-- no hard deletes, module names never change; the log is append-only
create or replace function private.module_settings_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Module switches are never deleted. Turn Live off instead (beta).' using errcode = 'P0001'; end if;
  if new.module <> old.module then raise exception 'A module name never changes.' using errcode = 'P0001'; end if;
  return new;
end $$;
drop trigger if exists module_settings_guard on public.module_settings;
create trigger module_settings_guard before update or delete on public.module_settings for each row execute function private.module_settings_guard();
create or replace function private.module_log_only() returns trigger language plpgsql as $$
begin raise exception 'The module change log is never changed or deleted.' using errcode = 'P0001'; end $$;
drop trigger if exists module_settings_log_no_change on public.module_settings_log;
create trigger module_settings_log_no_change before update or delete on public.module_settings_log for each row execute function private.module_log_only();

-- RLS: everyone signed in reads the switches; only Admins read the log; nobody writes either directly
alter table public.module_settings enable row level security;
alter table public.module_settings_log enable row level security;
revoke all on public.module_settings from public, anon, authenticated;
revoke all on public.module_settings_log from public, anon, authenticated;
grant select on public.module_settings to authenticated;
grant select on public.module_settings_log to authenticated;
drop policy if exists module_settings_read on public.module_settings;
create policy module_settings_read on public.module_settings for select to authenticated using (auth.uid() is not null);
drop policy if exists module_settings_log_read on public.module_settings_log;
create policy module_settings_log_read on public.module_settings_log for select to authenticated using (private.is_admin());

-- the ONLY way to flip a switch: active Admin / Super admin (private.is_admin() = is_admin and status active); logged; same value = no-op
create or replace function public.set_module_live(p_module text, p_live boolean) returns public.module_settings language plpgsql security definer set search_path = public as $$
declare r public.module_settings; v_name text;
begin
  if auth.uid() is null or not private.is_admin() then raise exception 'Only an Admin or Super admin can change modules.' using errcode = '42501'; end if;
  if p_live is null then raise exception 'Live must be on or off.' using errcode = '22023'; end if;
  select * into r from public.module_settings where module = p_module for update;
  if not found then raise exception 'Unknown module.' using errcode = '22023'; end if;
  if r.live = p_live then return r; end if;
  select btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into v_name from public.profiles where id = auth.uid();
  update public.module_settings set live = p_live, updated_at = now(), updated_by = auth.uid() where module = p_module returning * into r;
  insert into public.module_settings_log (module, old_live, new_live, changed_by, changed_by_name) values (p_module, not p_live, p_live, auth.uid(), coalesce(v_name, ''));
  return r;
end $$;
revoke all on function public.set_module_live(text, boolean) from public, anon;
grant execute on function public.set_module_live(text, boolean) to authenticated;

create or replace function public.module_access(p_module text) returns text language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then 'off'
    when coalesce((select live from public.module_settings where module = p_module), true)
      and coalesce((select live from public.module_settings where module = case when p_module in ('crm-deals', 'calls') then 'crm' else p_module end), true) then 'live'
    when private.is_admin() then 'beta' else 'off' end $$;
revoke all on function public.module_access(text) from public, anon;
grant execute on function public.module_access(text) to authenticated;
