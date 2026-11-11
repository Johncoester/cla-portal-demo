-- Removes only public.open_order_mail(jsonb). Tables and policies stay.
begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

drop function if exists public.open_order_mail(jsonb);

do $$
begin
  if to_regprocedure('public.open_order_mail(jsonb)') is not null then
    raise exception 'rollback left public.open_order_mail(jsonb)';
  end if;
end $$;

commit;
