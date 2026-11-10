-- MF-005: a document type may be a listed value or a short free-text label (Miscellaneous/Other).
-- documents.doc_type stays text. Visibility values, share flags, policies, and grants are unchanged.
-- Rollback: supabase/rollbacks/20261110033000_doc_type_free_text.sql
begin;
set local lock_timeout = '3s';
do $$
declare def text; n int;
begin
  select pg_get_constraintdef(oid) into def from pg_constraint where conname = 'documents_doc_type_check';
  if def is distinct from 'CHECK (((doc_type = ''''::text) OR (doc_type = ANY (private.doc_types(''staff''::text)))))' then
    raise exception 'drift: documents_doc_type_check is %', def; end if;
  select count(*) into n from public.documents where char_length(doc_type) > 80;
  if n <> 0 then raise exception 'drift: % document types are longer than 80 characters', n; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.documents'::regclass) then
    raise exception 'drift: documents RLS is off'; end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'documents') <> 5 then
    raise exception 'drift: documents policy count changed'; end if;
end $$;

alter table public.documents drop constraint documents_doc_type_check;
alter table public.documents add constraint documents_doc_type_check check (char_length(doc_type) <= 80);

do $$
declare def text;
begin
  select pg_get_constraintdef(oid) into def from pg_constraint where conname = 'documents_doc_type_check' and convalidated;
  if def is distinct from 'CHECK ((char_length(doc_type) <= 80))' then
    raise exception 'readback: documents_doc_type_check is %', def; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.documents'::regclass) then
    raise exception 'readback: documents RLS is off'; end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'documents') <> 5 then
    raise exception 'readback: documents policy count changed'; end if;
end $$;
commit;
