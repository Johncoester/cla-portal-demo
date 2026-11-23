-- RPT-3b (John, Nov 22 2026): a schedule on a saved CRM report.
-- John's rules: "Scheduling stays with admins." A schedule can send to anybody (any email
-- address). The full list of recipients always shows on the scheduled report.
--
-- This file only STORES a schedule (how often, what time in Eastern Time, who gets it).
-- It sends nothing and adds no scheduled job; building and queueing the email is RPT-3c.
--
-- Adds ONE new table, public.crm_report_schedules (one schedule per report), with row
-- level security, and one guard trigger function. It changes no existing table, function
-- or policy.
--
-- Who can do what:
--   - set up or change a schedule: an active Admin or Super admin only (private.is_admin()),
--     and only while the CRM is switched on (private.crm_on());
--   - see a schedule and its recipients: anyone who can see the report
--     (private.crm_report_visible), so the list is never hidden from the report's readers;
--   - nobody deletes a schedule: it is switched off (active = false);
--   - signed-out callers get nothing (no grant to anon).
-- The trigger lower-cases and de-duplicates the addresses, refuses anything that is not
-- an email address, keeps the report fixed, and lets only the system job (no signed-in
-- person) set last_sent_at.
--
-- Not applied by this commit. Apply on TEST after the pull request merges.
-- Rollback: supabase/rollbacks/20261130023000_crm_report_schedules.sql
begin;
set local lock_timeout = '3s';

do $$
begin
  if to_regclass('public.crm_reports') is null or to_regclass('public.profiles') is null
     or to_regprocedure('private.crm_report_visible(uuid)') is null or to_regprocedure('private.is_admin()') is null
     or to_regprocedure('private.crm_on()') is null or to_regprocedure('private.effective_uid()') is null then
    raise exception 'drift: the CRM report table or its helpers are missing';
  end if;
  if to_regclass('public.crm_report_schedules') is not null then
    raise exception 'drift: public.crm_report_schedules already exists';
  end if;
end $$;

create table public.crm_report_schedules (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null unique references public.crm_reports (id),
  frequency text not null check (frequency in ('daily', 'weekdays', 'weekly', 'monthly')),
  weekday smallint check (weekday between 0 and 6),          -- 0 = Sunday; weekly only
  month_day smallint check (month_day between 1 and 28),     -- monthly only
  send_time time not null,                                   -- Eastern Time
  recipients text[] not null check (cardinality(recipients) between 1 and 25),
  active boolean not null default true,
  created_by uuid references public.profiles (id), created_at timestamptz not null default now(),
  modified_by uuid references public.profiles (id), modified_at timestamptz not null default now(),
  last_sent_at timestamptz,
  constraint crm_report_schedules_weekly_day check ((frequency = 'weekly') = (weekday is not null)),
  constraint crm_report_schedules_monthly_day check ((frequency = 'monthly') = (month_day is not null)));

create function private.crm_report_schedule_guard()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
declare v text; e text; clean text[] := '{}'; me uuid := private.effective_uid();
begin
  if tg_op = 'DELETE' then raise exception 'A report schedule is never deleted; switch it off instead.' using errcode = 'P0001'; end if;
  foreach v in array coalesce(new.recipients, '{}') loop
    e := lower(btrim(coalesce(v, '')));
    if e = '' then continue; end if;
    if char_length(e) > 254 or e !~ '^[^[:space:]@<>(),;:"]+@[^[:space:]@<>(),;:"]+\.[a-z]{2,}$' then
      raise exception 'This is not an email address: %', left(e, 80) using errcode = '22023';
    end if;
    if not (e = any (clean)) then clean := clean || e; end if;
  end loop;
  new.recipients := clean;
  new.modified_by := coalesce(me, new.modified_by); new.modified_at := now();
  if tg_op = 'INSERT' then
    new.created_by := coalesce(me, new.created_by); new.created_at := now();
    if me is not null then new.last_sent_at := null; end if;
    if exists (select 1 from public.crm_reports r where r.id = new.report_id and r.retired_at is not null) then
      raise exception 'A retired report cannot be scheduled; restore it first.' using errcode = 'P0001';
    end if;
  else
    if new.report_id is distinct from old.report_id then raise exception 'A schedule stays with its report.' using errcode = 'P0001'; end if;
    if new.created_by is distinct from old.created_by then new.created_by := old.created_by; end if;
    if me is not null then new.last_sent_at := old.last_sent_at; end if;   -- only the system job records a send
  end if;
  return new;
end $function$;
revoke all on function private.crm_report_schedule_guard() from public, anon, authenticated;

create trigger crm_report_schedules_guard before insert or update or delete on public.crm_report_schedules
  for each row execute function private.crm_report_schedule_guard();

alter table public.crm_report_schedules enable row level security;
revoke all on public.crm_report_schedules from public, anon, authenticated;
grant select, insert, update on public.crm_report_schedules to authenticated;

create policy crm_report_schedules_select on public.crm_report_schedules for select to authenticated
  using (private.crm_report_visible(report_id));
create policy crm_report_schedules_insert on public.crm_report_schedules for insert to authenticated
  with check (private.crm_on() and private.is_admin() and private.crm_report_visible(report_id));
create policy crm_report_schedules_update on public.crm_report_schedules for update to authenticated
  using (private.crm_on() and private.is_admin() and private.crm_report_visible(report_id))
  with check (private.crm_on() and private.is_admin() and private.crm_report_visible(report_id));

do $readback$
declare n int;
begin
  if not (select relrowsecurity from pg_class where oid = 'public.crm_report_schedules'::regclass) then
    raise exception 'readback: row level security is off on crm_report_schedules';
  end if;
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'crm_report_schedules';
  if n <> 3 then raise exception 'readback: expected 3 policies on crm_report_schedules, found %', n; end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'crm_report_schedules' and cmd in ('INSERT', 'UPDATE')
             and position('is_admin()' in coalesce(with_check, '')) = 0) then
    raise exception 'readback: a write policy on crm_report_schedules is not Admin-only';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'crm_report_schedules' and cmd = 'DELETE') then
    raise exception 'readback: crm_report_schedules has a delete policy';
  end if;
  if has_table_privilege('anon', 'public.crm_report_schedules', 'select') or has_table_privilege('authenticated', 'public.crm_report_schedules', 'delete') then
    raise exception 'readback: anon can read, or authenticated can delete, crm_report_schedules';
  end if;
end
$readback$;
commit;
