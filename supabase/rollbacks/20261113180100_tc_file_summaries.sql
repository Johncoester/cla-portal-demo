-- Removes only public.rpc_tc_file_summaries(uuid[]). Tables stay.
begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

drop function if exists public.rpc_tc_file_summaries(uuid[]);

do $$
begin
  if to_regprocedure('public.rpc_tc_file_summaries(uuid[])') is not null then
    raise exception 'rollback left public.rpc_tc_file_summaries(uuid[])';
  end if;
end $$;

commit;
