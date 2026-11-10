#!/bin/bash
# Local scratch timings for public.company_lookup. NEVER point this at hosted
# TEST (aqcervntopidtcazcmlv) or any Supabase URL. It runs initdb in /tmp.
set -euo pipefail

if [[ "${DATABASE_URL:-}${SUPABASE_URL:-}${PGHOST:-}" == *supabase* || "${DATABASE_URL:-}${SUPABASE_URL:-}" == *aqcervntopidtcazcmlv* ]]; then
  echo "refusing: a hosted database variable is set" >&2
  exit 1
fi
for arg in "$@"; do
  if [[ "$arg" == *supabase.co* || "$arg" == *aqcervntopidtcazcmlv* ]]; then
    echo "refusing: hosted target" >&2
    exit 1
  fi
done

if [[ "$(id -u)" -eq 0 ]]; then
  echo "refusing: initdb will not run as root inside unshare. Run this as a normal user." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
DATA="${TMPDIR:-/tmp}/cla-company-pg"
PORT="${PORT:-5433}"
SOCK="${TMPDIR:-/tmp}"
LOG="$DATA.log"

if [[ -d "$DATA" ]]; then
  "$PGBIN/pg_ctl" -D "$DATA" -m fast stop >/dev/null 2>&1 || true
  rm -rf "$DATA"
fi
rm -f "$LOG"

"$PGBIN/initdb" -D "$DATA" --username="$(whoami)" --auth=trust --no-sync >/dev/null
"$PGBIN/pg_ctl" -D "$DATA" -l "$LOG" -o "-p $PORT -k $SOCK -c listen_addresses=" start >/dev/null
trap '"$PGBIN/pg_ctl" -D "$DATA" -m fast stop >/dev/null 2>&1 || true' EXIT

PSQL=("$PGBIN/psql" -h "$SOCK" -p "$PORT" -d postgres -v ON_ERROR_STOP=1 -X)

"${PSQL[@]}" <<'SQL'
create schema if not exists private;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
end $$;

-- Local stand-ins. is_processor and is_preprocessor match test/sql/agent-docs/catalog-functions.sql.
-- crm_user, crm_editor, and crm_all are NOT copied from a migration body: the hosted
-- crm_user() body is not in this repo. crm_editor and crm_all below match the Nov 9
-- bodies in supabase/rollbacks/20261110010000_role_module_access.sql (before role_can).
-- The current hosted bodies also consult role_module_access. That table is not loaded here.
-- role + uid together, so a Sales Person's visible set is the rows they own.
create table private.timing_who (role text not null, uid uuid not null);
insert into private.timing_who values ('Processor', '00000000-0000-4000-8000-0000000000a4');

create function private.me_role() returns text language sql stable as $$ select role from private.timing_who limit 1 $$;
create function private.is_admin() returns boolean language sql stable as $$
  select coalesce(private.me_role() in ('Admin', 'Super admin'), false) $$;
create function private.is_processor() returns boolean language sql stable security definer set search_path to 'pg_catalog', 'public' as $$
  select coalesce(private.me_role() in ('Processor', 'Preprocessor'), false) or private.is_admin() $$;
create function private.is_preprocessor() returns boolean language sql stable security definer set search_path to 'pg_catalog', 'public' as $$
  select coalesce(private.me_role() = 'Preprocessor', false) $$;
create function private.crm_user() returns boolean language sql stable as $$
  select coalesce(private.me_role() in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Admin', 'Super admin'), false) $$;
create function private.crm_editor() returns boolean language sql stable as $$
  select private.crm_user() and (private.is_admin() or coalesce(private.me_role() in ('Sales Person', 'Sales Team'), false)) $$;
create function private.crm_all() returns boolean language sql stable as $$
  select private.crm_user() and (private.is_admin() or coalesce(private.me_role() in ('Processor', 'Preprocessor'), false)) $$;
create function private.effective_uid() returns uuid language sql stable as $$
  select uid from private.timing_who limit 1 $$;

-- Mirrors js/data/crm.js companyKey for ASCII names. Accent folding is not in this stub.
-- The hosted function body is not in the repo; the migration calls that function and does not replace it.
create function private.crm_company_key(p_name text) returns text
language plpgsql immutable as $$
declare
  s text := lower(coalesce(p_name, ''));
  t text;
begin
  s := regexp_replace(s, '&', ' and ', 'g');
  s := btrim(regexp_replace(s, '[^a-z0-9]+', ' ', 'g'));
  s := regexp_replace(s, '(^| )l l (c|p)(?= |$)', '\1ll\2', 'g');
  s := regexp_replace(s, '^the\s+', '');
  for i in 1..3 loop
    exit when s !~ '\s+(inc|incorporated|llc|l l c|llp|ltd|limited|co|corp|corporation|company|pllc|pc|lp)$';
    s := btrim(regexp_replace(s, '\s+(inc|incorporated|llc|l l c|llp|ltd|limited|co|corp|corporation|company|pllc|pc|lp)$', ''));
  end loop;
  select string_agg(w, ' ' order by ord) into t
  from unnest(regexp_split_to_array(s, ' ')) with ordinality as u(w, ord)
  where w <> '' and w not in ('inc', 'incorporated', 'llc', 'llp', 'ltd', 'corp', 'corporation', 'pllc');
  return coalesce(nullif(t, ''), s, '');
end $$;

create table public.profiles (
  id uuid primary key,
  role text not null,
  status text not null default 'active'
);
create table public.crm_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'other',
  phone text not null default '',
  website text not null default '',
  city text not null default '',
  state text not null,
  notes text not null default '',
  owner_id uuid,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  constraint crm_accounts_name_uq unique (name)
);
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  company text,
  account_id uuid references public.crm_accounts(id),
  crm_state text
);
create index contacts_account_idx on public.contacts (account_id);
SQL

"${PSQL[@]}" -f "$ROOT/supabase/migrations/20261112080000_company_lookup.sql"

"${PSQL[@]}" <<'SQL'
insert into public.crm_accounts (name, kind, state, city, phone)
select 'Fake Brokerage ' || g || ' LLC',
       case when g % 5 = 0 then 'lender' else 'brokerage' end,
       (array['MD','VA','DC','FL'])[1 + (g % 4)],
       'City ' || (g % 200),
       '301-555-' || lpad((g % 10000)::text, 4, '0')
from generate_series(1, 110000) as g;

insert into public.crm_accounts (name, kind, state, city, phone) values
  ('Harbor Realty, LLC', 'brokerage', 'MD', 'Rockville', '301-555-0170'),
  ('Old Town Brokers', 'brokerage', 'MD', 'Frederick', ''),
  ('Ambiguous Holdings LLC', 'other', 'MD', 'Baltimore', ''),
  ('Ambiguous Holdings Inc', 'other', 'VA', 'Arlington', '');
update public.crm_accounts set archived_at = now() where name = 'Old Town Brokers';

insert into public.contacts (company, account_id, crm_state)
select a.name, a.id, a.state
from public.crm_accounts a
where a.archived_at is null and a.name like 'Fake Brokerage %'
order by a.name
limit 20000;

insert into public.contacts (company, crm_state) values
  ('Harbor Realty, LLC', 'MD'),
  ('Ambiguous Holdings LLC', 'MD'),
  ('No State Realty', '');
insert into public.contacts (company, crm_state)
select 'Unmatched Co ' || g, case when g % 2 = 0 then '' else 'MD' end
from generate_series(1, 1000) as g;

-- One company with 500 linked contacts, so the rename trigger has real work.
insert into public.contacts (company, account_id, crm_state)
select a.name, a.id, 'MD'
from public.crm_accounts a
cross join generate_series(1, 500) as g
where a.name = 'Fake Brokerage 1 LLC';

-- Callers. Sam (a1) owns a thin slice. Pat (a3) owns almost everything else.
insert into public.profiles (id, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'Sales Person'),
  ('00000000-0000-4000-8000-0000000000a2', 'Sales Team'),
  ('00000000-0000-4000-8000-0000000000a3', 'Sales Person'),
  ('00000000-0000-4000-8000-0000000000a4', 'Processor');
update public.crm_accounts set owner_id = '00000000-0000-4000-8000-0000000000a3' where archived_at is null;
with ranked as (
  select id, row_number() over (order by private.crm_company_key(name) using ~<~) as n
  from public.crm_accounts
  where archived_at is null and private.crm_company_key(name) like 'fake brokerage 5%'
)
update public.crm_accounts a set owner_id = '00000000-0000-4000-8000-0000000000a1'
from ranked r where a.id = r.id and r.n % 200 = 0;
update public.crm_accounts set owner_id = '00000000-0000-4000-8000-0000000000a3' where name = 'Fake Brokerage 50000 LLC';
insert into public.crm_accounts (name, kind, state, owner_id) values
  ('Sam Owned Realty LLC', 'brokerage', 'MD', '00000000-0000-4000-8000-0000000000a1');

analyze public.crm_accounts;
analyze public.contacts;
analyze public.profiles;
SQL

echo '===== KEY CHECK ====='
node --import "$ROOT/test/register-supabase-fake.mjs" --input-type=module -e "
import { companyKey } from '$ROOT/js/data/crm.js';
const samples = ['Harbor Realty, LLC', 'HARBOR  REALTY INC.', 'The Harbor Company', 'A & B Co', 'Harbor Realty LLC (fake)', 'L.L.C. Holdings', 'Fake Brokerage 50000 LLC'];
for (const s of samples) console.log(companyKey(s));
" > /tmp/cla-company-keys-js.txt
"${PSQL[@]}" -At <<'SQL' > /tmp/cla-company-keys-sql.txt
select private.crm_company_key(n) from unnest(array[
  'Harbor Realty, LLC', 'HARBOR  REALTY INC.', 'The Harbor Company', 'A & B Co',
  'Harbor Realty LLC (fake)', 'L.L.C. Holdings', 'Fake Brokerage 50000 LLC'
]) as n;
SQL
paste /tmp/cla-company-keys-js.txt /tmp/cla-company-keys-sql.txt
if ! diff -q /tmp/cla-company-keys-js.txt /tmp/cla-company-keys-sql.txt >/dev/null; then
  echo "company key stub does not match js/data/crm.js companyKey" >&2
  diff -u /tmp/cla-company-keys-js.txt /tmp/cla-company-keys-sql.txt || true
  exit 1
fi

echo '===== OWNER SLICE ====='
"${PSQL[@]}" -c "select count(*) filter (where owner_id = '00000000-0000-4000-8000-0000000000a1') as sam_wide, count(*) as wide_rows from public.crm_accounts where archived_at is null and private.crm_company_key(name) like 'fake brokerage 5%';"

# Privacy-on plan: the same SELECT company_lookup runs when v_owner_private is true.
explain_on() {
  local label="$1" role="$2" uid="$3" q="$4" lim="$5"
  echo "===== $label ====="
  "${PSQL[@]}" <<SQL
update private.timing_who set role = '${role}', uid = '${uid}';
explain (analyze, buffers)
select a.id, a.name, a.kind, a.city, a.state, a.phone
from public.crm_accounts a
where a.archived_at is null
  and private.crm_company_key(a.name) like private.crm_company_key('${q}') || '%'
  and (
    (select private.crm_all())
    or a.owner_id is not distinct from (select private.effective_uid())
    or (
      (select private.me_role()) = 'Sales Team'
      and (
        a.owner_id is null
        or exists (
          select 1 from public.profiles p
          where p.id = a.owner_id and p.role in ('Sales Person', 'Sales Team')
        )
      )
    )
  )
order by private.crm_company_key(a.name) using ~<~
limit ${lim};
SQL
  "${PSQL[@]}" <<SQL
\\timing on
update private.timing_who set role = '${role}', uid = '${uid}';
select count(*) as function_rows from public.company_lookup('${q}', ${lim});
SQL
}

SAM=00000000-0000-4000-8000-0000000000a1
TEAM=00000000-0000-4000-8000-0000000000a2
PROC=00000000-0000-4000-8000-0000000000a4
explain_on "SALES PERSON ONE MATCH (not theirs)" "Sales Person" "$SAM" "Fake Brokerage 50000" 25
explain_on "SALES PERSON ONE MATCH (theirs)" "Sales Person" "$SAM" "Sam Owned Realty" 25
explain_on "SALES PERSON WIDE PREFIX" "Sales Person" "$SAM" "Fake Brokerage 5" 25
explain_on "SALES TEAM ONE MATCH" "Sales Team" "$TEAM" "Fake Brokerage 50000" 25
explain_on "SALES TEAM WIDE PREFIX" "Sales Team" "$TEAM" "Fake Brokerage 5" 25
explain_on "CRM ALL ONE MATCH" "Processor" "$PROC" "Fake Brokerage 50000" 25
explain_on "CRM ALL WIDE PREFIX" "Processor" "$PROC" "Fake Brokerage 5" 25

echo '===== PRIVACY ASSERTIONS (true) ====='
"${PSQL[@]}" <<SQL
update private.timing_who set role = 'Sales Person', uid = '${SAM}';
do \$\$
declare n int;
begin
  if (select count(*) from public.company_lookup('Fake Brokerage 50000', 25)) <> 0 then
    raise exception 'sales person saw another owner';
  end if;
  if (select count(*) from public.company_lookup('Sam Owned Realty', 25)) <> 1 then
    raise exception 'sales person missed their own company';
  end if;
  update private.timing_who set role = 'Sales Team', uid = '${TEAM}';
  if (select count(*) from public.company_lookup('Fake Brokerage 50000', 25)) <> 1 then
    raise exception 'sales team missed a salesperson-owned company';
  end if;
  update private.timing_who set role = 'Processor', uid = '${PROC}';
  if (select count(*) from public.company_lookup('Fake Brokerage 50000', 25)) <> 1 then
    raise exception 'crm_all missed a company';
  end if;
end \$\$;
SQL

echo '===== PRIVACY OFF (scratch only; migration default stays true) ====='
"${PSQL[@]}" <<'SQL'
do $$
declare src text;
begin
  select pg_get_functiondef(oid) into src from pg_proc where oid = 'public.company_lookup(text, integer)'::regprocedure;
  if position('v_owner_private boolean := true' in src) = 0 then
    raise exception 'shipped company_lookup is not owner-private';
  end if;
  execute replace(src, 'v_owner_private boolean := true', 'v_owner_private boolean := false');
end $$;
SQL
"${PSQL[@]}" <<SQL
update private.timing_who set role = 'Sales Person', uid = '${SAM}';
explain (analyze, buffers)
select a.id, a.name, a.kind, a.city, a.state, a.phone
from public.crm_accounts a
where a.archived_at is null
  and private.crm_company_key(a.name) like private.crm_company_key('Fake Brokerage 5') || '%'
order by private.crm_company_key(a.name) using ~<~
limit 25;
\\timing on
select count(*) as function_rows from public.company_lookup('Fake Brokerage 50000', 25);
select count(*) as wide_rows from public.company_lookup('Fake Brokerage 5', 25);
do \$\$
begin
  if (select count(*) from public.company_lookup('Fake Brokerage 50000', 25)) <> 1 then
    raise exception 'privacy off should show the other owner';
  end if;
end \$\$;
SQL

echo '===== CONTAINS EXPLAIN ====='
"${PSQL[@]}" <<'SQL'
explain (analyze, buffers)
select a.id, a.name, a.kind, a.city, a.state, a.phone
from public.crm_accounts a
where a.archived_at is null
  and private.crm_company_key(a.name) like '%' || private.crm_company_key('brokerage 50000') || '%'
order by private.crm_company_key(a.name), a.name, a.id
limit 20;
SQL

echo '===== FUNCTION TIMING ====='
"${PSQL[@]}" <<'SQL'
\timing on
select count(*) from public.company_lookup('Fake Brokerage 50000', 20);
select count(*) from public.company_lookup('Fake Brokerage 5', 20);
select count(*) from public.company_lookup('brokerage 50000', 20);
select public.company_find_or_create('Fake Brokerage 50000 LLC', 'brokerage', 'MD');
select public.company_find_or_create('Brand New Realty', 'brokerage', 'VA');
select count(*) from public.contacts c
join public.crm_accounts a on a.id = c.account_id
where a.name = 'Fake Brokerage 1 LLC';
update public.crm_accounts set name = 'Fake Brokerage 1 LLC Renamed' where name = 'Fake Brokerage 1 LLC';
select count(*) from public.contacts where company = 'Fake Brokerage 1 LLC Renamed';
update public.crm_accounts set name = name where name = 'Fake Brokerage 1 LLC Renamed';
select count(*) from public.contacts where company = 'Fake Brokerage 1 LLC Renamed';
SQL

echo '===== PREVIEW ====='
before="$("${PSQL[@]}" -At -c "select (select count(*) from public.crm_accounts) || ' ' || (select count(*) from public.contacts)")"
"${PSQL[@]}" -f "$ROOT/supabase/scripts/company_lookup_backfill_preview.sql"
after="$("${PSQL[@]}" -At -c "select (select count(*) from public.crm_accounts) || ' ' || (select count(*) from public.contacts)")"
echo "rows before=$before after=$after"
if [[ "$before" != "$after" ]]; then
  echo "preview changed row counts" >&2
  exit 1
fi

echo '===== ROLLBACK ====='
"${PSQL[@]}" -f "$ROOT/supabase/rollbacks/20261112080000_company_lookup.sql"
"${PSQL[@]}" -c "select to_regprocedure('public.company_lookup(text, integer)') is null as lookup_gone, to_regclass('public.crm_accounts_company_key_active_idx') is null as index_gone;"
