-- MF-065 (Matt Landsberg, Nov 25 2026): fake Preprocessor logins so the Preprocessor dropdown has people to pick on TEST.
-- TEST ONLY (aqcervntopidtcazcmlv). This is a script, not a migration: it lives in supabase/scripts so migration tooling never
-- runs it and production never gets it. Applied by hand once on TEST after PR merge.
-- Matt: "Any random name can be assigned for testing." The names and emails below are clearly fake (@example.test),
-- have no auth login and no password, and cannot sign in. They exist only to be picked in the dropdown.
-- Real staff get the role from an Admin under Users (or from the HR designation), and then show up in the same dropdown.
-- Does not change a function, a policy, a grant, or a guard. Ellen Ahern stays a Transaction Coordinator.
-- Undo: supabase/scripts/mf-065-test-preprocessors-undo.sql (removes only these three rows, and only if no file uses them).

begin;
set local lock_timeout = '3s';

insert into public.profiles (id, email, first_name, last_name, phone, role, status, is_admin, is_demo)
select v.id, v.email, v.first_name, v.last_name, v.phone, 'Preprocessor', 'active', false, false
from (values
  ('00000000-0000-4000-8e65-000000000001'::uuid, 'mf065.test.preprocessor1@example.test', 'Test', 'Preprocessor One', '301-555-0161'),
  ('00000000-0000-4000-8e65-000000000002'::uuid, 'mf065.test.preprocessor2@example.test', 'Test', 'Preprocessor Two', '301-555-0162'),
  ('00000000-0000-4000-8e65-000000000003'::uuid, 'mf065.test.preprocessor3@example.test', 'Test', 'Preprocessor Three', '301-555-0163')
) as v(id, email, first_name, last_name, phone)
where v.email like '%@example.test'
on conflict (email) do nothing;

do $readback$
declare n int;
begin
  select count(*) into n from public.profiles
  where email like 'mf065.test.preprocessor%@example.test' and role = 'Preprocessor' and status = 'active' and not is_demo;
  if n <> 3 then raise exception 'readback: expected 3 fake Preprocessors, found %', n; end if;
  if exists (select 1 from public.profiles where first_name = 'Ellen' and last_name = 'Ahern' and role <> 'Transaction Coordinator') then
    raise exception 'readback: Ellen Ahern role must not change'; end if;
end
$readback$;
commit;
