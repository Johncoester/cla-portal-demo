-- Undo for supabase/scripts/mf-065-test-preprocessors.sql. TEST ONLY. Removes only the three fake rows, and refuses if a file uses one.
begin;
set local lock_timeout = '3s';
do $undo$
begin
  if exists (select 1 from public.deals where preprocessor_user_id in (select id from public.profiles where email like 'mf065.test.preprocessor%@example.test')) then
    raise exception 'undo refused: a file uses one of the fake Preprocessors. Change that file first.'; end if;
  delete from public.profiles where email like 'mf065.test.preprocessor%@example.test' and role = 'Preprocessor';
end
$undo$;
commit;
