-- Source: TEST schema_migrations (project aqcervntopidtcazcmlv).
-- Version 20261105223152, name payoffs_module.
-- Exported November 15, 2026 (America/New_York).
-- =====================================================================
-- Migration 70 (John, Nov 5, live40): "I don't see a place to turn off the payoff mod in the admin section." A Live / Beta switch for the order
-- Payoffs / HOA tab ('payoffs'), like accounting: while it is not Live, regular users get no Payoffs / HOA data (private.payoff_staff / _editor
-- refuse), Admins and Super admins still can (beta). Agents and clients never (unchanged: payoff_staff is CLA staff only).
-- Title is NOT under this switch (it keeps private.features 'title' and the browser-side 'title' switch). Re-runnable. Number 70 keeps clear of feature/tc-portal (66+).
-- =====================================================================
alter table public.module_settings drop constraint if exists module_settings_module_check;
alter table public.module_settings add constraint module_settings_module_check check (module in ('crm', 'crm-deals', 'calls', 'accounting', 'tasks', 'task-grid', 'library', 'hr', 'payoffs', 'post-closing', 'e-recording', 'title', 'funding', 'wires', 'policy'));
insert into public.module_settings (module, live) values ('payoffs', true) on conflict (module) do nothing;

create or replace function private.payoff_staff() returns boolean language sql stable security definer set search_path = public as $$
  select private.acct_on() and coalesce(private.is_admin() or (private.me_role() in ('Processor', 'Sales Person', 'Sales Team', 'Transaction Coordinator')
    and public.module_access('payoffs') = 'live'), false) $$;
create or replace function private.payoff_staff_editor() returns boolean language sql stable security definer set search_path = public as $$
  select private.acct_on() and coalesce(private.is_admin() or (private.me_role() = 'Processor' and public.module_access('payoffs') = 'live'), false) $$;
