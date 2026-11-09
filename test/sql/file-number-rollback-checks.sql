do $$ declare fnum text;
begin
  if to_regprocedure('private.deal_file_number()') is not null then raise exception 'trigger function still present'; end if;
  insert into public.deals (state) values ('FL') returning file_number into fnum;
  if fnum not like 'MD-26-%' then raise exception 'rollback default not restored: %', fnum; end if;
end $$;
select 'file number rollback checks passed' as result;
