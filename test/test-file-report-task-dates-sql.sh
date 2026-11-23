#!/bin/sh
# RPT-2 (John, Nov 23 2026): a demo Processor must get no real-file tasks from crm_deal_report_tasks().
# Disposable database only: a small stand-in schema, the leaky DEFINER body, this security file,
# the checks, and the rollback. Does not connect to the hosted TEST project and does not use its data.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
DB=cla_rpt2tasks_$$
q() { sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -d "$DB" "$@"; }
val() { sudo -u postgres psql -X -q -tA -v ON_ERROR_STOP=1 -d "$DB" -c "$1"; }
cleanup() { sudo -u postgres psql -X -q -d postgres -c "drop database if exists $DB;" >/dev/null 2>&1 || true; }
trap cleanup EXIT
fail=0
ok() { if [ "$1" = "$2" ]; then echo "ok $3"; else echo "FAIL $3 (got '$1', want '$2')"; fail=1; fi; }
err() { out=$(sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -c "$1" 2>&1 || true)
  case "$out" in *"$2"*) echo "ok $3";; *) echo "FAIL $3: $out"; fail=1;; esac; }
as() { who=$1; shift; val "set test.uid = '$who'; $1"; }

sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $DB;" -c "create database $DB;"
q <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
end $$;
create schema private;

create table public.profiles (
  id uuid primary key,
  first_name text default '',
  last_name text default '',
  role text,
  is_admin boolean not null default false,
  is_demo boolean not null default false,
  status text not null default 'active'
);
create table public.deals (
  id uuid primary key,
  file_number text,
  processor_id uuid,
  preprocessor_user_id uuid,
  is_demo boolean not null default false
);
create table public.deal_sales_people (
  deal_id uuid not null references public.deals(id),
  sales_id uuid not null,
  primary key (deal_id, sales_id)
);
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references public.deals(id),
  title text,
  due_date date,
  completed_at timestamptz,
  status text not null default 'todo',
  template_code text,
  owner_profile_id uuid,
  audiences text[]
);

create function private.effective_uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;
create function private.me_role() returns text language sql stable as $$
  select p.role from public.profiles p where p.id = private.effective_uid()
$$;
create function private.is_admin() returns boolean language sql stable as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = private.effective_uid()), false)
$$;
create function private.viewer_is_demo() returns boolean language sql stable as $$
  select coalesce((select p.is_demo from public.profiles p where p.id = private.effective_uid()), false)
$$;
create function private.crm_user() returns boolean language sql stable as $$
  select coalesce(private.me_role() in ('Admin', 'Processor', 'Preprocessor', 'Sales Person', 'Sales Team'), false)
$$;
create function private.crm_deal_scope_all() returns boolean language sql stable as $$
  select private.is_admin() or coalesce(private.me_role() in ('Processor', 'Sales Team', 'Preprocessor'), false)
$$;
create function private.can_access_deal(d uuid) returns boolean language sql stable as $$
  select private.me_role() is not null and (
    private.is_admin() or private.me_role() in ('Processor', 'Sales Team', 'Transaction Coordinator')
    or (private.me_role() = 'Preprocessor' and exists (select 1 from public.deals x where x.id = d and x.preprocessor_user_id = private.effective_uid()))
    or (private.me_role() in ('Sales Person', 'Sales Team') and exists (select 1 from public.deal_sales_people s where s.deal_id = d and s.sales_id = private.effective_uid()))
  )
$$;
create function private.crm_deal_visible(d uuid) returns boolean language sql stable as $$
  select private.crm_user() and private.can_access_deal(d) and (private.crm_deal_scope_all()
    or (coalesce(private.me_role() = 'Sales Person', false) and exists (select 1 from public.deal_sales_people s where s.deal_id = d and s.sales_id = private.effective_uid())))
$$;
-- Stand-in for RPT-1-SEC's helper (the hosted one is already applied on TEST).
create function private.crm_visible_deal_ids()
returns setof uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with who as (
    select
      private.crm_user() as crm_user,
      private.crm_deal_scope_all() as scope_all,
      private.me_role() as role,
      private.effective_uid() as uid,
      private.viewer_is_demo() as is_demo
  )
  select d.id
  from public.deals d
  cross join who w
  where w.crm_user
    and d.is_demo = w.is_demo
    and private.can_access_deal(d.id)
    and (w.scope_all or (coalesce(w.role = 'Sales Person', false)
      and exists (select 1 from public.deal_sales_people s where s.deal_id = d.id and s.sales_id = w.uid)))
$$;

grant execute on function private.effective_uid(), private.me_role(), private.is_admin(), private.viewer_is_demo(),
  private.crm_user(), private.crm_deal_scope_all(), private.can_access_deal(uuid), private.crm_deal_visible(uuid),
  private.crm_visible_deal_ids() to authenticated;

-- real processor  11111111-1111-4111-8111-111111111111
-- demo processor  22222222-2222-4222-8222-222222222222
-- sales person    33333333-3333-4333-8333-333333333333
-- agent (no CRM)  44444444-4444-4444-8444-444444444444
-- real deal       55555555-5555-4555-8555-555555555555
-- demo deal       66666666-6666-4666-8666-666666666666
insert into public.profiles (id, first_name, last_name, role, is_demo) values
  ('11111111-1111-4111-8111-111111111111', 'Pat', 'Processor', 'Processor', false),
  ('22222222-2222-4222-8222-222222222222', 'Dee', 'Demo', 'Processor', true),
  ('33333333-3333-4333-8333-333333333333', 'Sam', 'Sales', 'Sales Person', false),
  ('44444444-4444-4444-8444-444444444444', 'Ava', 'Agent', 'Buyer Agent', false);

insert into public.deals (id, file_number, processor_id, is_demo) values
  ('55555555-5555-4555-8555-555555555555', 'MD-26-REAL', '11111111-1111-4111-8111-111111111111', false),
  ('66666666-6666-4666-8666-666666666666', 'MD-26-DEMO', '22222222-2222-4222-8222-222222222222', true);

insert into public.deal_sales_people (deal_id, sales_id) values
  ('55555555-5555-4555-8555-555555555555', '33333333-3333-4333-8333-333333333333');

insert into public.tasks (deal_id, title, due_date, completed_at, status) values
  ('55555555-5555-4555-8555-555555555555', 'Confirm EMD Receipt', '2026-06-05', '2026-06-04 15:00+00', 'done'),
  ('55555555-5555-4555-8555-555555555555', 'Cancelled on real', '2026-06-01', null, 'cancelled'),
  ('66666666-6666-4666-8666-666666666666', 'Title - CLEAR TO CLOSE', '2026-07-05', null, 'todo');
SQL

# The hole the original RPT-2 body had: SECURITY DEFINER + crm_deal_visible, no demo check.
q <<'SQL'
create function public.crm_deal_report_tasks()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not private.crm_user() then raise exception 'The CRM is for CLA staff only.' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('dealId', t.deal_id, 'title', t.title, 'dueDate', t.due_date, 'completedAt', t.completed_at, 'status', t.status))
    from public.tasks t
    where t.status <> 'cancelled' and btrim(coalesce(t.title, '')) <> ''
      and t.deal_id in (select g.id from public.deals g where private.crm_deal_visible(g.id))), '[]'::jsonb);
end $$;
grant execute on function public.crm_deal_report_tasks() to authenticated;
SQL

REAL=55555555-5555-4555-8555-555555555555
DEMO=66666666-6666-4666-8666-666666666666
ok "$(as 22222222-2222-4222-8222-222222222222 "select count(*)::text from jsonb_array_elements(public.crm_deal_report_tasks()) x where (x->>'dealId') = '$REAL';")" "1" "before the fix, a demo Processor can read a task on the real file (the hole)"
ok "$(as 22222222-2222-4222-8222-222222222222 "select x->>'title' from jsonb_array_elements(public.crm_deal_report_tasks()) x where (x->>'dealId') = '$REAL';")" "Confirm EMD Receipt" "before the fix, that row is the real file's task title"

q -c "drop function public.crm_deal_report_tasks();"
q -f "$ROOT/supabase/migrations/20261129020500_crm_deal_report_tasks.sql"

ok "$(val "select p.prosecdef::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'crm_deal_report_tasks';")" "false" "after the fix, crm_deal_report_tasks is SECURITY INVOKER"
ok "$(as 22222222-2222-4222-8222-222222222222 "select count(*)::text from jsonb_array_elements(public.crm_deal_report_tasks()) x where (x->>'dealId') = '$REAL';")" "0" "a demo Processor gets 0 tasks from real files"
ok "$(as 22222222-2222-4222-8222-222222222222 "select count(*)::text from jsonb_array_elements(public.crm_deal_report_tasks()) x where (x->>'dealId') = '$DEMO';")" "1" "a demo Processor still sees the demo file's task"
ok "$(as 11111111-1111-4111-8111-111111111111 "select count(*)::text from jsonb_array_elements(public.crm_deal_report_tasks()) x where (x->>'dealId') = '$REAL';")" "1" "a real Processor still sees the real file's task"
ok "$(as 11111111-1111-4111-8111-111111111111 "select x->>'title' from jsonb_array_elements(public.crm_deal_report_tasks()) x where (x->>'dealId') = '$REAL';")" "Confirm EMD Receipt" "a real Processor still gets the real task title"
ok "$(as 11111111-1111-4111-8111-111111111111 "select count(*)::text from jsonb_array_elements(public.crm_deal_report_tasks()) x where (x->>'dealId') = '$DEMO';")" "0" "a real Processor does not see the demo file's tasks"
ok "$(as 11111111-1111-4111-8111-111111111111 "select count(*)::text from jsonb_array_elements(public.crm_deal_report_tasks());")" "1" "cancelled tasks are left out"
ok "$(as 33333333-3333-4333-8333-333333333333 "select count(*)::text from jsonb_array_elements(public.crm_deal_report_tasks()) x where (x->>'dealId') = '$REAL';")" "1" "a Sales Person on the file sees its tasks"
ok "$(as 33333333-3333-4333-8333-333333333333 "select count(*)::text from jsonb_array_elements(public.crm_deal_report_tasks()) x where (x->>'dealId') = '$DEMO';")" "0" "a real Sales Person does not see the demo file's tasks"
err "set test.uid = '44444444-4444-4444-8444-444444444444'; select public.crm_deal_report_tasks();" "The CRM is for CLA staff only." "a buyer agent is refused"
ok "$(val "select has_function_privilege('anon', 'public.crm_deal_report_tasks()', 'execute')::text;")" "false" "anon cannot run the function"
ok "$(val "select has_table_privilege('authenticated', 'public.tasks', 'select')::text;")" "false" "the migration did not grant table-level SELECT on public.tasks"

q -f "$ROOT/supabase/rollbacks/20261129020500_crm_deal_report_tasks.sql"
ok "$(val "select to_regprocedure('public.crm_deal_report_tasks()') is null::text;")" "true" "rollback drops the function"

q -f "$ROOT/supabase/migrations/20261129020500_crm_deal_report_tasks.sql"
ok "$(as 22222222-2222-4222-8222-222222222222 "select count(*)::text from jsonb_array_elements(public.crm_deal_report_tasks()) x where (x->>'dealId') = '$REAL';")" "0" "re-applying the fix again leaves the demo Processor with 0 real-file tasks"

if [ "$fail" -ne 0 ]; then echo "$fail failed"; exit 1; fi
echo "file report task dates sql passed"
