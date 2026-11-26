-- Undo MF-075: a Preprocessor is limited again to files where deals.preprocessor_user_id is
-- their own id, and can only insert a deal that names themselves. Reverses the exact text
-- replaces made by 20261131300000_mf075_preprocessor_any_file.sql and restores deals_insert.
begin;
set local lock_timeout = '3s';

do $undo$
declare
  r record;
  def text;
  hits int;
begin
  for r in
    select * from (values
      ('private.can_access_deal(uuid)',
       'x.is_demo is not distinct from private.viewer_is_demo()',
       'x.preprocessor_user_id = private.effective_uid()', 1),
      ('private.can_run_deal(uuid)',
       'x.is_demo is not distinct from private.viewer_is_demo()',
       'x.preprocessor_user_id = private.effective_uid()', 1),
      ('private.reader_can_deal(uuid,uuid,text,boolean,uuid,boolean)',
       'x.is_demo is not distinct from coalesce((select pr.is_demo from public.profiles pr where pr.id = p_uid), false)',
       'x.preprocessor_user_id = p_uid', 1),
      ('private.document_readable(uuid)',
       'x.is_demo is not distinct from coalesce((select pr.is_demo from public.profiles pr where pr.id = g.uid), false)',
       'x.preprocessor_user_id = g.uid', 2),
      ('private.readable_document_ids()',
       'x.is_demo is not distinct from coalesce((select pr.is_demo from public.profiles pr where pr.id = g.uid), false)',
       'x.preprocessor_user_id = g.uid', 2)
    ) v(fn, pat, rep, want)
  loop
    def := pg_get_functiondef(r.fn::regprocedure);
    hits := (length(def) - length(replace(def, r.pat, ''))) / length(r.pat);
    if hits <> r.want then
      raise exception 'MF-075 undo: % has % copies of the MF-075 text (expected %)', r.fn, hits, r.want;
    end if;
    execute replace(def, r.pat, r.rep);
  end loop;
end
$undo$;

drop policy if exists deals_insert on public.deals;
create policy deals_insert on public.deals for insert to authenticated
  with check (private.is_processor() and created_by = private.effective_uid()
              and ((not private.is_preprocessor()) or preprocessor_user_id = private.effective_uid()));

select private.lock_function_search_paths();

commit;

notify pgrst, 'reload schema';
