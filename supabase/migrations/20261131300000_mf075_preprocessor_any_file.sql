-- MF-075 (Matt, confirmed Nov 26 2026, Gmail 1a217f4600469b95): any active Processor or
-- Preprocessor can open and work on any file, assigned or not. Answer A: yes, a Preprocessor
-- can place an order without naming themselves as the file's Preprocessor.
--
-- Before: a Preprocessor could only open, run or read documents on files where
-- deals.preprocessor_user_id was their own id, and could only insert a deal that named
-- themselves as the Preprocessor.
-- After: the Preprocessor branch of each gate checks the demo scope instead of the assignment:
--   deals.is_demo is not distinct from the viewer's is_demo
-- so a demo Preprocessor still only reaches demo files and a real Preprocessor only real files.
--
-- Changed (the Preprocessor branch only, by an exact text replace on the live body, so
-- everything else in each function stays byte-for-byte as it is on the database):
--   private.can_access_deal(uuid)        1 replace
--   private.can_run_deal(uuid)           1 replace
--   private.reader_can_deal(...)         1 replace
--   private.document_readable(uuid)      2 replaces (order and folder branches)
--   private.readable_document_ids(...)   2 replaces (order and folder branches)
--   policy deals_insert                  drops "(not is_preprocessor() or preprocessor_user_id = me)"
-- Not changed: every non-staff branch (Sales Person, participants, linked agents, clients),
-- the restrictive demo_scope policies, deals_select (it already ORs can_access_deal),
-- deal_preprocessor_guard (a named Preprocessor must still be an active Preprocessor),
-- and role-based limits that never depended on assignment (contacts insert/update,
-- order notes insert/update, wire account reads).
-- Rollback: supabase/rollbacks/20261131300000_mf075_preprocessor_any_file.sql
begin;
set local lock_timeout = '3s';

do $mf075$
declare
  r record;
  def text;
  hits int;
begin
  for r in
    select * from (values
      ('private.can_access_deal(uuid)',
       'x.preprocessor_user_id = private.effective_uid()',
       'x.is_demo is not distinct from private.viewer_is_demo()', 1),
      ('private.can_run_deal(uuid)',
       'x.preprocessor_user_id = private.effective_uid()',
       'x.is_demo is not distinct from private.viewer_is_demo()', 1),
      ('private.reader_can_deal(uuid,uuid,text,boolean,uuid,boolean)',
       'x.preprocessor_user_id = p_uid',
       'x.is_demo is not distinct from coalesce((select pr.is_demo from public.profiles pr where pr.id = p_uid), false)', 1),
      ('private.document_readable(uuid)',
       'x.preprocessor_user_id = g.uid',
       'x.is_demo is not distinct from coalesce((select pr.is_demo from public.profiles pr where pr.id = g.uid), false)', 2),
      ('private.readable_document_ids()',
       'x.preprocessor_user_id = g.uid',
       'x.is_demo is not distinct from coalesce((select pr.is_demo from public.profiles pr where pr.id = g.uid), false)', 2)
    ) v(fn, pat, rep, want)
  loop
    def := pg_get_functiondef(r.fn::regprocedure);
    hits := (length(def) - length(replace(def, r.pat, ''))) / length(r.pat);
    if hits <> r.want then
      raise exception 'MF-075: % has % copies of "%" (expected %); stop and re-read the live body', r.fn, hits, r.pat, r.want;
    end if;
    execute replace(def, r.pat, r.rep);
  end loop;
end
$mf075$;

drop policy if exists deals_insert on public.deals;
create policy deals_insert on public.deals for insert to authenticated
  with check (private.is_processor() and created_by = private.effective_uid());

-- self-checks
do $chk$
declare f text;
begin
  foreach f in array array['private.can_access_deal', 'private.can_run_deal', 'private.reader_can_deal',
                           'private.document_readable', 'private.readable_document_ids'] loop
    if exists (select 1 from pg_proc p where p.oid = f::regproc and pg_get_functiondef(p.oid) ~ 'preprocessor_user_id\s*=\s*(private\.effective_uid\(\)|p_uid|g\.uid)') then
      raise exception 'self-check: % still limits a Preprocessor to assigned files', f;
    end if;
    if not exists (select 1 from pg_proc p where p.oid = f::regproc and pg_get_functiondef(p.oid) ~ 'is_demo is not distinct from') then
      raise exception 'self-check: % lost the demo gate on the Preprocessor branch', f;
    end if;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'deals' and policyname = 'deals_insert'
             and with_check ~ 'preprocessor_user_id') then
    raise exception 'self-check: deals_insert still requires a Preprocessor to name themselves';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'deals' and policyname = 'demo_scope'
                 and permissive = 'RESTRICTIVE') then
    raise exception 'self-check: deals demo_scope must stay restrictive';
  end if;
end
$chk$;

select private.lock_function_search_paths();

commit;

notify pgrst, 'reload schema';
