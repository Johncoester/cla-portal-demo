#!/usr/bin/env bash
# Apply the two E2E migrations twice and roll them back on a local database
# that already has the nine auth logins and no profiles. Does not touch TEST.
set -euo pipefail
root=$(cd "$(dirname "$0")/../../.." && pwd)
db=${E2E_LOCAL_DB:-e2e_seed_proof}
psql=(psql -v ON_ERROR_STOP=1 -X -q)

if ! command -v psql >/dev/null; then
  echo "psql is not installed" >&2
  exit 1
fi

dropdb --if-exists "$db"
createdb "$db"

"${psql[@]}" -d "$db" -f "$root/tests/e2e-roles/sql/local-schema.sql"
"${psql[@]}" -d "$db" <<'SQL'
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111001', 'clatestportal+e2e-super-admin@gmail.com'),
  ('11111111-1111-4111-8111-111111111002', 'clatestportal+e2e-processor@gmail.com'),
  ('11111111-1111-4111-8111-111111111003', 'clatestportal+e2e-sales-person@gmail.com'),
  ('11111111-1111-4111-8111-111111111004', 'clatestportal+e2e-sales-team@gmail.com'),
  ('11111111-1111-4111-8111-111111111005', 'clatestportal+e2e-coordinator@gmail.com'),
  ('11111111-1111-4111-8111-111111111006', 'clatestportal+e2e-buyer-agent@gmail.com'),
  ('11111111-1111-4111-8111-111111111007', 'clatestportal+e2e-listing-agent@gmail.com'),
  ('11111111-1111-4111-8111-111111111008', 'clatestportal+e2e-buyer@gmail.com'),
  ('11111111-1111-4111-8111-111111111009', 'clatestportal+e2e-seller@gmail.com'),
  ('11111111-1111-4111-8111-111111111099', 'kept@example.test');
insert into public.profiles (id, email, first_name, last_name, role)
values ('11111111-1111-4111-8111-111111111099', 'kept@example.test', 'Kept', 'Person', 'Processor');
insert into public.deals (street, city, state, open_date, notes, file_number)
values ('1 Kept Street', 'Annapolis', 'MD', current_date, 'kept', 'MD-26-00001');
SQL

"${psql[@]}" -d "$db" -c "delete from auth.users where email = 'clatestportal+e2e-seller@gmail.com'"
missing=$(mktemp)
if "${psql[@]}" -d "$db" -f "$root/supabase/migrations/20261110140000_e2e_role_profiles.sql" >"$missing" 2>&1; then
  echo "profiles migration succeeded while a login was missing" >&2
  exit 1
fi
grep -q 'auth login clatestportal+e2e-seller@gmail.com is missing' "$missing"
rm -f "$missing"
echo "missing login raised"

"${psql[@]}" -d "$db" -c "insert into auth.users (id, email) values ('11111111-1111-4111-8111-111111111009', 'clatestportal+e2e-seller@gmail.com')"

"${psql[@]}" -d "$db" -f "$root/supabase/migrations/20261110140000_e2e_role_profiles.sql"
"${psql[@]}" -d "$db" -c "create table proof_counts as select 'profiles' as what, count(*)::int as n from public.profiles where email like 'clatestportal+e2e-%@gmail.com' union all select 'contacts', count(*)::int from public.contacts where company = 'E2E Role Seed'"
"${psql[@]}" -d "$db" -f "$root/supabase/migrations/20261110140000_e2e_role_profiles.sql"
"${psql[@]}" -d "$db" <<'SQL'
do $$
begin
  if (select n from proof_counts where what = 'profiles') <> 9 then raise exception 'first profiles pass did not write 9 profiles'; end if;
  if (select n from proof_counts where what = 'contacts') <> 10 then raise exception 'first profiles pass did not write 10 contacts'; end if;
  if (select count(*) from public.profiles where email like 'clatestportal+e2e-%@gmail.com') <> 9 then raise exception 'second profiles pass changed the profile count'; end if;
  if (select count(*) from public.contacts where company = 'E2E Role Seed') <> 10 then raise exception 'second profiles pass changed the contact count'; end if;
  if (select count(*) from public.profiles where is_admin) <> 1 then raise exception 'is_admin drifted'; end if;
  if exists (select 1 from public.profiles where email like 'clatestportal+e2e-%@gmail.com' and is_demo) then raise exception 'is_demo drifted'; end if;
  if exists (select 1 from public.profiles p join auth.users u on lower(u.email) = lower(p.email) where p.id <> u.id) then raise exception 'profile id does not match auth.users'; end if;
end $$;
SQL
echo "profiles migration applied twice"

"${psql[@]}" -d "$db" -f "$root/supabase/migrations/20261110140100_e2e_role_file_seed.sql"
"${psql[@]}" -d "$db" -c "create table proof_file as select (select count(*) from public.deals where notes = 'E2E-ROLE-FILE') as deals, (select count(*) from public.deal_participants) as parts, (select count(*) from public.deal_sales_people) as sales"
"${psql[@]}" -d "$db" -f "$root/supabase/migrations/20261110140100_e2e_role_file_seed.sql"
"${psql[@]}" -d "$db" <<'SQL'
do $$
declare d int; p int; s int;
begin
  select deals, parts, sales into d, p, s from proof_file;
  if d <> 1 or p <> 7 or s <> 2 then raise exception 'first file pass counts % % %', d, p, s; end if;
  if (select count(*) from public.deals where notes = 'E2E-ROLE-FILE') <> 1 then raise exception 'second file pass added a deal'; end if;
  if (select count(*) from public.deal_participants) <> 7 then raise exception 'second file pass added a participant'; end if;
  if (select count(*) from public.deal_sales_people) <> 2 then raise exception 'second file pass added a sales link'; end if;
  if not exists (select 1 from public.deals where notes = 'kept') then raise exception 'kept deal disappeared'; end if;
end $$;
SQL
echo "file migration applied twice"

"${psql[@]}" -d "$db" -f "$root/supabase/rollbacks/20261110140100_e2e_role_file_seed.sql"
"${psql[@]}" -d "$db" -f "$root/supabase/rollbacks/20261110140100_e2e_role_file_seed.sql"
"${psql[@]}" -d "$db" <<'SQL'
do $$
begin
  if exists (select 1 from public.deals where notes = 'E2E-ROLE-FILE') then raise exception 'file rollback left the deal'; end if;
  if (select count(*) from public.profiles where email like 'clatestportal+e2e-%@gmail.com') <> 9 then raise exception 'file rollback changed profiles'; end if;
  if (select count(*) from auth.users where email like 'clatestportal+e2e-%@gmail.com') <> 9 then raise exception 'file rollback changed auth users'; end if;
end $$;
SQL
echo "file rollback twice"

"${psql[@]}" -d "$db" -f "$root/supabase/rollbacks/20261110140000_e2e_role_profiles.sql"
"${psql[@]}" -d "$db" -f "$root/supabase/rollbacks/20261110140000_e2e_role_profiles.sql"
"${psql[@]}" -d "$db" <<'SQL'
do $$
begin
  if exists (select 1 from public.profiles where email like 'clatestportal+e2e-%@gmail.com') then raise exception 'profile rollback left a profile'; end if;
  if exists (select 1 from public.contacts where company = 'E2E Role Seed') then raise exception 'profile rollback left a contact'; end if;
  if (select count(*) from auth.users where email like 'clatestportal+e2e-%@gmail.com') <> 9 then raise exception 'profile rollback changed auth users'; end if;
  if not exists (select 1 from public.profiles where email = 'kept@example.test') then raise exception 'profile rollback deleted the kept profile'; end if;
  if not exists (select 1 from public.deals where notes = 'kept') then raise exception 'rollback deleted the kept deal'; end if;
  if (select count(*) from auth.users) <> 10 then raise exception 'auth.users count changed'; end if;
end $$;
SQL
echo "profile rollback twice; auth users remain"

# The same auth rows still accept a fresh apply after the rollback.
"${psql[@]}" -d "$db" -f "$root/supabase/migrations/20261110140000_e2e_role_profiles.sql"
"${psql[@]}" -d "$db" -f "$root/supabase/migrations/20261110140100_e2e_role_file_seed.sql"
"${psql[@]}" -d "$db" -f "$root/supabase/rollbacks/20261110140100_e2e_role_file_seed.sql"
"${psql[@]}" -d "$db" -f "$root/supabase/rollbacks/20261110140000_e2e_role_profiles.sql"
"${psql[@]}" -d "$db" -c "do \$\$ begin if (select count(*) from auth.users where email like 'clatestportal+e2e-%@gmail.com') <> 9 then raise exception 'reapply changed auth users'; end if; if exists (select 1 from public.profiles where email like 'clatestportal+e2e-%@gmail.com') then raise exception 'reapply rollback left a profile'; end if; end \$\$;"
echo "reapplied both migrations after rollback; auth users remain"

# A brand-new login that carries portal_role gets a profile from the trigger.
"${psql[@]}" -d "$db" <<'SQL'
insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
values (
  '11111111-1111-4111-8111-111111111010',
  'clatestportal+e2e-future@gmail.com',
  '{"first_name":"E2E","last_name":"Future","portal_role":"Processor"}',
  '{"portal_role":"Processor"}'
);
do $$
begin
  if not exists (
    select 1 from public.profiles
    where email = 'clatestportal+e2e-future@gmail.com' and role = 'Processor' and is_admin = false and is_demo = false
  ) then
    raise exception 'portal_role did not create a profile through on_auth_user_sync';
  end if;
end $$;
SQL
echo "fresh login with portal_role created a profile"

echo "local proof ok"
