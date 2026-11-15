do $$
begin
  if to_regprocedure('private.deal_file_number_edit()') is not null then raise exception 'edit function still there'; end if;
  if exists (select 1 from pg_trigger where tgrelid = 'public.deals'::regclass and tgname = 'deals_file_number_edit') then raise exception 'edit trigger still there'; end if;
  if to_regprocedure('private.deal_file_number()') is null then raise exception 'automatic numbering was removed'; end if;
end $$;
select 'edit file number rollback checks passed' as result;
