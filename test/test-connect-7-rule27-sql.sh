#!/usr/bin/env bash
# CONNECT-7 rule 27: Lender is not a global side; demo staff cannot list parties on a real file.
# Throwaway local Postgres. Does not connect to TEST. Fake rows only.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="${PG_BIN:-$( command -v pg_ctl >/dev/null 2>&1 && dirname "$(command -v pg_ctl)" || { [ -x /usr/lib/postgresql/17/bin/pg_ctl ] && echo /usr/lib/postgresql/17/bin; } || echo /usr/lib/postgresql/16/bin )}"
PGDATA="$(mktemp -d /tmp/cla-connect7-r27.XXXXXX)"; PORT=54347
cleanup() { "$BIN/pg_ctl" -D "$PGDATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$PGDATA"; }
trap cleanup EXIT
"$BIN/initdb" -D "$PGDATA" --auth=trust --username=postgres >/dev/null
"$BIN/pg_ctl" -D "$PGDATA" -l "$PGDATA/log" -o "-p $PORT -k /tmp -c listen_addresses=" -w start >/dev/null
P=("$BIN/psql" -h /tmp -p "$PORT" -U postgres -d postgres -X -q -v ON_ERROR_STOP=1)
Q() { "${P[@]}" -tA -c "$1"; }
fail=0
check() { if [ "$1" = "$2" ]; then echo "ok $3"; else echo "FAIL $3 (got '$1', want '$2')"; fail=1; fi; }

ADMIN=00000000-0000-0000-0000-0000000000a1
DEMO=00000000-0000-0000-0000-0000000000a2
PROC=00000000-0000-0000-0000-0000000000f1
BUYER=00000000-0000-0000-0000-0000000000b1
BAGENT=00000000-0000-0000-0000-0000000000b2
BTC=00000000-0000-0000-0000-0000000000b3
SELLER=00000000-0000-0000-0000-0000000000e1
LAGENT=00000000-0000-0000-0000-0000000000e2
LENDER=00000000-0000-0000-0000-0000000000ee
REAL=00000000-0000-0000-0000-0000000000d1
DEMODEAL=00000000-0000-0000-0000-0000000000d2

"${P[@]}" <<SQL
create role anon nologin;
create role authenticated nologin;
create schema auth;
create schema private;
create schema extensions;

create function auth.uid() returns uuid language sql stable as \$\$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
\$\$;

create function private.effective_uid() returns uuid
language sql stable security definer
set search_path to pg_catalog, public, extensions as \$\$
  select auth.uid()
\$\$;

create function private.lock_function_search_paths() returns void
language sql as \$\$ select \$\$;

create table public.profiles (
  id uuid primary key,
  role text not null,
  email text,
  status text not null default 'active',
  is_demo boolean not null default false,
  is_admin boolean not null default false,
  first_name text,
  last_name text
);
create table public.deals (
  id uuid primary key,
  is_demo boolean not null default false,
  processor_id uuid,
  preprocessor_user_id uuid,
  tc_user_id uuid,
  sales_person_id uuid
);
create table public.contacts (
  id uuid primary key,
  profile_id uuid,
  email text,
  first_name text,
  last_name text
);
create table public.deal_participants (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null,
  contact_id uuid not null,
  role text not null
);
create table public.agent_tc_links (
  id uuid primary key default gen_random_uuid(),
  tc_contact_id uuid not null,
  agent_contact_id uuid not null
);
create table public.deal_sales_people (deal_id uuid not null, sales_id uuid not null);
create table public.team_members (team_id uuid not null, profile_id uuid not null, member_role text not null);
create table public.threads (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null,
  subject text,
  created_by uuid,
  staff_coordinated boolean not null default false
);
create table public.thread_participants (
  thread_id uuid not null,
  profile_id uuid not null,
  last_read_at timestamptz
);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null,
  author_id uuid,
  body text
);

create function private.is_admin() returns boolean
language sql stable security definer
set search_path to pg_catalog, public, extensions as \$\$
  select coalesce((select is_admin from public.profiles where id = private.effective_uid() and status = 'active'), false)
\$\$;

create function private.me_role() returns text
language sql stable security definer
set search_path to pg_catalog, public, extensions as \$\$
  select role from public.profiles where id = private.effective_uid() and status = 'active'
\$\$;

create function private.is_staffish() returns boolean
language sql stable security definer
set search_path to pg_catalog, public, extensions as \$\$
  select private.is_admin() or coalesce(private.me_role() in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin'), false)
\$\$;

create function private.is_view_only() returns boolean
language sql stable security definer
set search_path to pg_catalog, public, extensions as \$\$
  select coalesce(private.me_role() in ('Sales Person', 'Sales Team'), false) and not private.is_admin()
\$\$;

create function private.viewer_is_demo() returns boolean
language sql stable security definer
set search_path to pg_catalog, public, extensions as \$\$
  select coalesce((select p.is_demo from public.profiles p where p.id = private.effective_uid() and p.status = 'active'), false)
\$\$;

create function private.side_of(r text) returns text
language sql immutable
set search_path to pg_catalog, public, extensions as \$\$
  select case r
    when 'Buyer Agent' then 'buyer'
    when 'Client-Buyer' then 'buyer'
    when 'Buyer Agent TC' then 'buyer'
    when 'Listing Agent' then 'seller'
    when 'Client-Seller' then 'seller'
    when 'Listing Agent TC' then 'seller'
  end
\$\$;

create function private.linked_agent_roles(pid uuid, d uuid) returns text[]
language sql stable security definer
set search_path to pg_catalog, public, extensions as \$\$
  select coalesce((
    select array_agg(s.role order by s.role)
    from (
      select p.role
      from public.agent_tc_links l
      join public.contacts tc on tc.id = l.tc_contact_id and tc.profile_id = pid
      join public.deal_participants p on p.deal_id = d and p.contact_id = l.agent_contact_id
      where p.role in ('Buyer Agent', 'Listing Agent')
      union
      select a.role
      from public.deal_participants x
      join public.contacts tc on tc.id = x.contact_id and tc.profile_id = pid
      join public.deal_participants a
        on a.deal_id = x.deal_id
       and a.role = case x.role when 'Buyer Agent TC' then 'Buyer Agent' else 'Listing Agent' end
      where x.deal_id = d and x.role in ('Buyer Agent TC', 'Listing Agent TC')
    ) s
    where exists (
      select 1 from public.profiles pr
      where pr.id = pid and pr.role = 'Outside user' and pr.status = 'active'
    )
  ), '{}'::text[])
\$\$;

create function private.outside_roles(pid uuid, d uuid) returns text[]
language sql stable security definer
set search_path to pg_catalog, public, extensions as \$\$
  select coalesce((
    select array_agg(x.role order by array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], x.role))
    from (
      select distinct p.role
      from public.deal_participants p
      join public.contacts c on c.id = p.contact_id
      where p.deal_id = d and c.profile_id = pid
        and p.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller')
      union
      select unnest(private.linked_agent_roles(pid, d))
    ) x
  ), '{}'::text[])
\$\$;

create function private.file_roles_of(pid uuid, d uuid) returns text[]
language sql stable security definer
set search_path to pg_catalog, public, extensions as \$\$
  select case
    when pr.role is null then '{}'::text[]
    when pr.role <> 'Outside user' then
      coalesce((
        select array_agg(q.r order by q.ord)
        from (
          select pr.role as r, 0 as ord
          union all
          select x.role, 1
          from unnest(private.outside_roles(pid, d)) x(role)
        ) q
      ), array[pr.role])
    else case when cardinality(private.outside_roles(pid, d)) = 0
      then array['Outside user']::text[]
      else private.outside_roles(pid, d) end
  end
  from (select (select role from public.profiles where id = pid) as role) pr
\$\$;

create function private.file_role_of(pid uuid, d uuid) returns text
language sql stable security definer
set search_path to pg_catalog, public, extensions as \$\$
  select case when pr.role is distinct from 'Outside user' then pr.role
    else coalesce((private.outside_roles(pid, d))[1], 'Outside user') end
  from (select (select role from public.profiles where id = pid) as role) pr
\$\$;

create function private.person_side(pid uuid, d uuid) returns text
language sql stable security definer
set search_path to pg_catalog, public, extensions as \$\$
  select case when (select role from public.profiles where id = pid) is distinct from 'Outside user' then 'staff'
    else (select case when count(distinct s) = 1 then max(s) end from (select private.side_of(r) s from unnest(private.file_roles_of(pid, d)) r) x where s is not null) end
\$\$;

create function private.my_side(d uuid) returns text
language sql stable security definer
set search_path to pg_catalog, public, extensions as \$\$
  select case when private.is_staffish() then 'staff' else private.person_side(private.effective_uid(), d) end
\$\$;

create function private.can_access_deal(d uuid) returns boolean
language sql stable security definer
set search_path to pg_catalog, public, extensions as \$\$
  select private.me_role() is not null and (
    private.is_admin() or private.me_role() in ('Processor', 'Sales Team', 'Transaction Coordinator')
    or exists (
      select 1 from public.deal_participants p
      join public.contacts c on c.id = p.contact_id
      where p.deal_id = d and c.profile_id = private.effective_uid()
    )
    or cardinality(private.linked_agent_roles(private.effective_uid(), d)) > 0)
\$\$;

create function private.deal_cla_staff(d uuid) returns setof uuid
language sql stable security definer
set search_path to pg_catalog, public, extensions as \$\$
  select pid from (
    select processor_id as pid from public.deals where id = d
    union select preprocessor_user_id from public.deals where id = d
    union select tc_user_id from public.deals where id = d
    union select sales_person_id from public.deals where id = d
    union select s.sales_id from public.deal_sales_people s where s.deal_id = d
  ) x where pid is not null
\$\$;

create function private.deal_role(d uuid) returns text
language sql stable security definer
set search_path to pg_catalog, public, extensions as \$\$
  select case when private.me_role() is null then null when private.me_role() <> 'Outside user' then private.me_role() else private.file_role_of(private.effective_uid(), d) end
\$\$;

create function private.doc_visible(visibility text, uploader uuid, d uuid) returns boolean
language sql stable security definer
set search_path to pg_catalog, public, extensions as \$\$
  select uploader = private.effective_uid() or private.is_staffish()
         or visibility = 'all' or (visibility in ('buyer', 'seller') and visibility = private.side_of(private.deal_role(d)))
\$\$;

create function private.visibility_allowed(d uuid, vis text) returns boolean
language sql stable security definer
set search_path to pg_catalog, public, extensions as \$\$
  select vis in ('all', 'buyer', 'seller', 'staff') and (
    private.is_staffish()
    or (vis = 'all' and private.deal_role(d) not in ('Client-Buyer', 'Client-Seller'))
    or (vis in ('buyer', 'seller') and vis = private.side_of(private.deal_role(d))))
\$\$;

insert into public.profiles (id, role, email, status, is_demo, is_admin, first_name, last_name) values
  ('$ADMIN', 'Admin', 'real.admin@example.test', 'active', false, true, 'Real', 'Admin'),
  ('$DEMO', 'Admin', 'demo.admin@example.test', 'active', true, true, 'Demo', 'Admin'),
  ('$PROC', 'Processor', 'proc@example.test', 'active', false, false, 'Pat', 'Processor'),
  ('$BUYER', 'Outside user', 'buyer@example.test', 'active', false, false, 'Ben', 'Buyer'),
  ('$BAGENT', 'Outside user', 'bagent@example.test', 'active', false, false, 'Bea', 'Agent'),
  ('$BTC', 'Outside user', 'btc@example.test', 'active', false, false, 'Riley', 'BuyerTc'),
  ('$SELLER', 'Outside user', 'seller@example.test', 'active', false, false, 'Sam', 'Seller'),
  ('$LAGENT', 'Outside user', 'lagent@example.test', 'active', false, false, 'Lee', 'Listing'),
  ('$LENDER', 'Outside user', 'lender@example.test', 'active', false, false, 'Lane', 'Loan');

insert into public.deals (id, is_demo, processor_id) values
  ('$REAL', false, '$PROC'),
  ('$DEMODEAL', true, '$PROC');

insert into public.contacts (id, profile_id, email, first_name, last_name) values
  ('10000000-0000-0000-0000-0000000000c1', '$BUYER', 'buyer@example.test', 'Ben', 'Buyer'),
  ('10000000-0000-0000-0000-0000000000c2', '$BAGENT', 'bagent@example.test', 'Bea', 'Agent'),
  ('10000000-0000-0000-0000-0000000000c3', '$BTC', 'btc@example.test', 'Riley', 'BuyerTc'),
  ('10000000-0000-0000-0000-0000000000c4', '$SELLER', 'seller@example.test', 'Sam', 'Seller'),
  ('10000000-0000-0000-0000-0000000000c5', '$LAGENT', 'lagent@example.test', 'Lee', 'Listing'),
  ('10000000-0000-0000-0000-0000000000c6', '$LENDER', 'lender@example.test', 'Lane', 'Loan'),
  ('10000000-0000-0000-0000-0000000000c7', null, 'mailed.seller@example.test', 'Mailed', 'Seller'),
  ('10000000-0000-0000-0000-0000000000c8', '$PROC', 'proc@example.test', 'Pat', 'Processor');

insert into public.deal_participants (deal_id, contact_id, role) values
  ('$REAL', '10000000-0000-0000-0000-0000000000c1', 'Client-Buyer'),
  ('$REAL', '10000000-0000-0000-0000-0000000000c2', 'Buyer Agent'),
  ('$REAL', '10000000-0000-0000-0000-0000000000c3', 'Buyer Agent TC'),
  ('$REAL', '10000000-0000-0000-0000-0000000000c4', 'Client-Seller'),
  ('$REAL', '10000000-0000-0000-0000-0000000000c5', 'Listing Agent'),
  ('$REAL', '10000000-0000-0000-0000-0000000000c6', 'Lender'),
  ('$REAL', '10000000-0000-0000-0000-0000000000c7', 'Client-Seller'),
  ('$REAL', '10000000-0000-0000-0000-0000000000c8', 'Processor'),
  ('$DEMODEAL', '10000000-0000-0000-0000-0000000000c1', 'Client-Buyer');

insert into public.agent_tc_links (tc_contact_id, agent_contact_id) values
  ('10000000-0000-0000-0000-0000000000c3', '10000000-0000-0000-0000-0000000000c2');
SQL

"${P[@]}" -f "$ROOT/supabase/migrations/20261131280000_connect_7_tc_recipients.sql"

# Unchanged TEST helper: used by the messages policy. can_message NULL must not block a reply.
"${P[@]}" <<'POST'
create function private.thread_postable(t uuid) returns boolean
language sql stable security definer
set search_path to pg_catalog, public, extensions as $$
  select private.is_staffish()
      or exists (select 1 from public.threads x where x.id = t and x.staff_coordinated
                 and exists (select 1 from public.thread_participants tp where tp.thread_id = t and tp.profile_id = private.effective_uid()))
      or not exists (select 1 from public.thread_participants tp join public.threads x on x.id = tp.thread_id
                     where tp.thread_id = t and tp.profile_id <> private.effective_uid() and not private.can_message(tp.profile_id, x.deal_id))
$$;
POST

as_user() {
  local uid="$1"; shift
  "${P[@]}" -tA -c "select set_config('request.jwt.claim.sub', '$uid', false) is not null" -c "$*" | tail -n +2
}


check "$(Q "select private.side_of('Lender') is null and private.side_of('Buyer Agent TC') = 'buyer'")" "t" "side_of still has no Lender mapping and still maps a buyer-side coordinator"

check "$(as_user "$LENDER" "select private.person_side('$LENDER'::uuid, '$REAL'::uuid)")" "" "a lender's person_side is unchanged (null, not buyer)"
check "$(as_user "$LENDER" "select private.my_side('$REAL'::uuid)")" "" "a lender's my_side is unchanged (null, not buyer)"
check "$(as_user "$LENDER" "select private.deal_role('$REAL'::uuid)")" "Outside user" "deal_role still does not return Lender"
check "$(as_user "$LENDER" "select private.side_of(private.deal_role('$REAL'::uuid))")" "" "docs/settlement still use a null side for a lender"
check "$(as_user "$LENDER" "select coalesce(private.doc_visible('buyer', '$PROC'::uuid, '$REAL'::uuid), false)")" "f" "a lender does not see a buyer-side document"
check "$(as_user "$BUYER" "select coalesce(private.doc_visible('buyer', '$PROC'::uuid, '$REAL'::uuid), false)")" "t" "the buyer still sees a buyer-side document"
check "$(as_user "$LENDER" "select coalesce(private.visibility_allowed('$REAL'::uuid, 'buyer'), false)")" "f" "settlement / visibility_allowed does not treat a lender as the buyer side"
check "$(as_user "$BUYER" "select coalesce(private.visibility_allowed('$REAL'::uuid, 'buyer'), false)")" "t" "the buyer is still allowed buyer-side visibility"

check "$(as_user "$LENDER" "select coalesce(private.can_message('$BUYER'::uuid, '$REAL'::uuid), false)")" "f" "a lender cannot message the buyer"
check "$(as_user "$BTC" "select coalesce(private.can_message('$LENDER'::uuid, '$REAL'::uuid), false)")" "t" "a buyer-side coordinator can message the lender"
check "$(as_user "$BTC" "select coalesce(private.can_message('$SELLER'::uuid, '$REAL'::uuid), false)")" "f" "a buyer-side coordinator still cannot message the seller"

ids_of() { as_user "$1" "select coalesce(string_agg(id::text, ',' order by id::text), '') from private.rpc_message_recipients('$2'::uuid)"; }

BTC_LIST="$(ids_of "$BTC" "$REAL")"
[[ "$BTC_LIST" == *"$BUYER"* && "$BTC_LIST" == *"$BAGENT"* && "$BTC_LIST" == *"$LENDER"* && "$BTC_LIST" == *"$PROC"* ]] && echo "ok a buyer-side coordinator's list includes the buyer, buyer agent, lender, and processor" || { echo "FAIL buyer-side list ($BTC_LIST)"; fail=1; }
[[ "$BTC_LIST" != *"$SELLER"* && "$BTC_LIST" != *"$LAGENT"* ]] && echo "ok a buyer-side coordinator's list excludes the seller side" || { echo "FAIL buyer-side list leaked the seller side ($BTC_LIST)"; fail=1; }

LENDER_LIST="$(ids_of "$LENDER" "$REAL")"
[[ "$LENDER_LIST" == *"$PROC"* && "$LENDER_LIST" != *"$BUYER"* && "$LENDER_LIST" != *"$BAGENT"* && "$LENDER_LIST" != *"$SELLER"* ]] && echo "ok a lender still only sees CLA staff, not the buyer side" || { echo "FAIL lender list ($LENDER_LIST)"; fail=1; }

check "$(as_user "$DEMO" "select private.can_access_deal('$REAL'::uuid)")" "t" "can_access_deal still lets a demo admin reach a real deal (the leak the gate must stop)"
check "$(as_user "$DEMO" "select count(*)::text from private.rpc_message_recipients('$REAL'::uuid)")" "0" "a demo staff login gets no parties on a real deal, including mailed contacts"
check "$(as_user "$ADMIN" "select count(*) > 0 from private.rpc_message_recipients('$REAL'::uuid)")" "t" "a real admin still sees the parties on a real deal"

# create_thread: buyer-side TC + lender is allowed; lender + buyer is not
TID="$(as_user "$BTC" "select private.rpc_create_thread('$REAL'::uuid, 'Buyer-side note', array['$LENDER'::uuid], 'Please confirm.')")"
check "$(echo "$TID" | grep -c -E '^[0-9a-f-]{36}$')" "1" "a buyer-side coordinator can start a conversation with the lender"
check "$(as_user "$LENDER" "select private.thread_postable('$TID'::uuid)")" "t" "a lender can reply in a conversation a buyer-side coordinator started with them"

EXISTING=00000000-0000-0000-0000-0000000000aa
"${P[@]}" <<SQL
insert into public.threads (id, deal_id, subject, created_by, staff_coordinated)
  values ('$EXISTING', '$REAL', 'Existing staff thread', '$PROC', false);
insert into public.thread_participants (thread_id, profile_id) values
  ('$EXISTING', '$PROC'), ('$EXISTING', '$LENDER'), ('$EXISTING', '$BUYER');
SQL
check "$(as_user "$LENDER" "select private.thread_postable('$EXISTING'::uuid)")" "t" "an existing sideless member can still post in a thread they already belong to"

check "$(as_user "$LENDER" "select private.can_message('$BUYER'::uuid, '$REAL'::uuid) is null")" "t" "can_message stays null (not false) when a sideless lender would message the buyer, so thread_postable is unchanged"
check "$(as_user "$LENDER" "select private.can_message('$BUYER'::uuid, '$REAL'::uuid) is not true")" "t" "can_message is not true, so create_thread still refuses"

tid_err="$(
  "${P[@]}" -tA -c "select set_config('request.jwt.claim.sub', '$LENDER', false) is not null" -c "select private.rpc_create_thread('$REAL'::uuid, 'To the buyer', array['$BUYER'::uuid], 'Hello');" 2>&1 || true
)"
if echo "$tid_err" | grep -q -i "own side\|Not allowed\|42501"; then
  echo "ok a lender cannot start a conversation with the buyer"
else
  echo "FAIL a lender was able to start a conversation with the buyer [$tid_err]"
  fail=1
fi

[ "$fail" = 0 ] && echo "connect-7 rule 27 sql passed" || { echo "FAIL $fail"; exit 1; }
