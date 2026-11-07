-- Unrelated functions and schema privileges must match the pre-migration snapshot.
do $$
declare bad text;
begin
  select string_agg(f.sig, ', ' order by f.sig) into bad
  from public.fb_helper_freeze f
  left join pg_proc p on p.oid::regprocedure::text = f.sig
  where p.oid is null
     or pg_get_functiondef(p.oid) is distinct from f.def
     or coalesce(p.proacl::text, '<default>') is distinct from f.acl;
  if bad is not null then
    raise exception 'FAIL unrelated function definition or ACL changed: %', bad;
  end if;
  select string_agg(s.nspname, ', ' order by s.nspname) into bad
  from public.fb_schema_freeze s
  join pg_namespace n on n.nspname = s.nspname
  where coalesce(n.nspacl::text, '<default>') is distinct from s.acl;
  if bad is not null then
    raise exception 'FAIL unrelated schema ACL changed: %', bad;
  end if;
end $$;
