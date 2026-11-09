-- Rollback of 20261110033000_doc_type_free_text.sql.
-- Restores the listed-type check. Fails if a free-text label would no longer fit.
-- Does not change visibility, share flags, policies, or grants.
begin;
set local lock_timeout = '3s';
do $$
declare def text; n int;
begin
  select pg_get_constraintdef(oid) into def from pg_constraint where conname = 'documents_doc_type_check';
  if def is distinct from 'CHECK ((char_length(doc_type) <= 80))' then
    raise exception 'drift: documents_doc_type_check is %', def; end if;
  select count(*) into n from public.documents
    where doc_type <> '' and not (doc_type = any (private.doc_types('staff')));
  if n <> 0 then raise exception 'drift: % document types are not in the listed set', n; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.documents'::regclass) then
    raise exception 'drift: documents RLS is off'; end if;
end $$;

alter table public.documents drop constraint documents_doc_type_check;
alter table public.documents add constraint documents_doc_type_check
  check (doc_type = '' or doc_type = any (private.doc_types('staff')));

do $$
declare def text;
begin
  select pg_get_constraintdef(oid) into def from pg_constraint where conname = 'documents_doc_type_check' and convalidated;
  if def is distinct from 'CHECK (((doc_type = ''''::text) OR (doc_type = ANY (private.doc_types(''staff''::text)))))' then
    raise exception 'readback: documents_doc_type_check is %', def; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.documents'::regclass) then
    raise exception 'readback: documents RLS is off'; end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'documents') <> 5 then
    raise exception 'readback: documents policy count changed'; end if;
end $$;
commit;
