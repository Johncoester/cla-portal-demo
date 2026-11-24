-- RPT-3a (John, Nov 22 2026): "Processors should be able to build their own reports."
-- A Processor or Preprocessor is read-only in the CRM, so today they cannot save a
-- report at all. This lets anyone who has the CRM save, change and retire a report
-- in THEIR OWN folder (personal_owner = themselves). Nothing else opens up:
--   - shared folders stay with the roles that could already save there
--     (private.crm_editor(): Admin, Sales Person, Sales Team);
--   - a read-only role cannot move a report out of their own folder (update WITH CHECK);
--   - the existing guard trigger still refuses saving into another person's folder;
--   - who can SEE a report (crm_reports_select / private.crm_report_visible) is unchanged;
--   - what a report can read is unchanged: the report runs with the person's own access.
--
-- Changes: private.crm_report_editable(uuid) (same answer as before for the roles that
-- could already edit), and the crm_reports_insert and crm_reports_update policies.
-- The two policies keep whichever "who am I" function they use on TEST today
-- (auth.uid() or private.effective_uid()); this file reads it and reuses it.
--
-- Not applied by this commit. Apply on TEST after the pull request merges.
-- Rollback: supabase/rollbacks/20261130013000_crm_reports_own_folder.sql
begin;
set local lock_timeout = '3s';

do $$
declare ins text; upd text; fn text; me text;
begin
  if to_regclass('public.crm_reports') is null or to_regprocedure('private.crm_report_editable(uuid)') is null
     or to_regprocedure('private.crm_user()') is null or to_regprocedure('private.crm_editor()') is null
     or to_regprocedure('private.effective_uid()') is null or to_regprocedure('private.is_admin()') is null then
    raise exception 'drift: the CRM report table or its helpers are missing';
  end if;
  select with_check into ins from pg_policies where schemaname = 'public' and tablename = 'crm_reports' and policyname = 'crm_reports_insert';
  select with_check into upd from pg_policies where schemaname = 'public' and tablename = 'crm_reports' and policyname = 'crm_reports_update';
  if ins is null or position('crm_editor()' in ins) = 0 or position('created_by' in ins) = 0 or position('personal_owner' in ins) > 0 then
    raise exception 'drift: crm_reports_insert is not the rule this file replaces (%)', coalesce(ins, 'missing');
  end if;
  if upd is null or position('crm_editor()' in upd) = 0 or position('personal_owner' in upd) > 0 then
    raise exception 'drift: crm_reports_update is not the rule this file replaces (%)', coalesce(upd, 'missing');
  end if;
  select pg_get_functiondef('private.crm_report_editable(uuid)'::regprocedure) into fn;
  if position('crm_user()' in fn) > 0 then raise exception 'drift: private.crm_report_editable was already changed'; end if;

  me := case when position('effective_uid()' in ins) > 0 then 'private.effective_uid()' else 'auth.uid()' end;
  execute 'drop policy crm_reports_insert on public.crm_reports';
  execute format('create policy crm_reports_insert on public.crm_reports for insert to authenticated with check ((private.crm_editor() or (private.crm_user() and personal_owner = %s)) and created_by = %s)', me, me);
  execute 'drop policy crm_reports_update on public.crm_reports';
  execute format('create policy crm_reports_update on public.crm_reports for update to authenticated using (private.crm_report_editable(id)) with check (private.crm_editor() or (private.crm_user() and personal_owner = %s))', me);
end $$;

-- Same answer as before for an Admin, Sales Person or Sales Team. New: anyone with the
-- CRM may change a report that sits in their own folder.
create or replace function private.crm_report_editable(p_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
  select private.crm_user() and exists (select 1 from public.crm_reports r where r.id = p_id and (
    r.personal_owner = private.effective_uid()
    or (private.crm_editor() and (r.created_by = private.effective_uid() or (private.is_admin() and r.personal_owner is null))))) $function$;

do $readback$
declare ins text; upd text; fn text;
begin
  select with_check into ins from pg_policies where schemaname = 'public' and tablename = 'crm_reports' and policyname = 'crm_reports_insert';
  select with_check into upd from pg_policies where schemaname = 'public' and tablename = 'crm_reports' and policyname = 'crm_reports_update';
  if ins is null or position('personal_owner' in ins) = 0 or position('created_by' in ins) = 0 or position('crm_editor()' in ins) = 0 then
    raise exception 'readback: crm_reports_insert is not the own-folder rule';
  end if;
  if upd is null or position('personal_owner' in upd) = 0 or position('crm_editor()' in upd) = 0 then
    raise exception 'readback: crm_reports_update is not the own-folder rule';
  end if;
  select pg_get_functiondef('private.crm_report_editable(uuid)'::regprocedure) into fn;
  if position('crm_user()' in fn) = 0 or position('crm_editor()' in fn) = 0 or position('personal_owner = private.effective_uid()' in fn) = 0 then
    raise exception 'readback: private.crm_report_editable is not the own-folder rule';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.crm_reports'::regclass) then
    raise exception 'readback: row level security is off on crm_reports';
  end if;
end
$readback$;
commit;
