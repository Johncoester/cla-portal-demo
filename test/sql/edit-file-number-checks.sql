-- FF-050: a direct change of file_number is kept, refused when taken or blank, and written to the activity log.
do $$
declare d1 uuid; d2 uuid; n int;
begin
  insert into public.deals (state, file_number) values ('MD', 'MD-26-88001') returning id into d1;
  insert into public.deals (state, file_number) values ('FL', 'FL-26-88002') returning id into d2;

  update public.deals set file_number = 'INT-1001' where id = d1;
  if (select file_number from public.deals where id = d1) <> 'INT-1001' then raise exception 'rename not saved'; end if;
  if not exists (select 1 from public.activity_log where deal_id = d1 and action = 'deal.file_number' and detail = 'File number changed from MD-26-88001 to INT-1001') then
    raise exception 'rename not logged'; end if;

  begin
    update public.deals set file_number = 'INT-1001' where id = d2;
    raise exception 'duplicate was allowed';
  exception when others then
    if sqlerrm <> 'That file number is already on another file. Enter a different number.' then raise exception 'duplicate said %', sqlerrm; end if;
  end;
  if (select file_number from public.deals where id = d2) <> 'FL-26-88002' then raise exception 'failed rename changed the number'; end if;

  begin
    update public.deals set file_number = '   ' where id = d2;
    raise exception 'blank was allowed';
  exception when others then
    if sqlerrm <> 'Enter a file number.' then raise exception 'blank said %', sqlerrm; end if;
  end;

  update public.deals set file_number = '  REF 42  ' where id = d2;
  if (select file_number from public.deals where id = d2) <> 'REF 42' then raise exception 'spaces not tidied'; end if;

  select count(*) into n from public.activity_log where deal_id = d1 and action = 'deal.file_number';
  update public.deals set file_number = 'INT-1001' where id = d1;
  if (select count(*) from public.activity_log where deal_id = d1 and action = 'deal.file_number') <> n then raise exception 'same number logged again'; end if;

  insert into public.deals (state) values ('VA');
  if (select file_number from public.deals where state = 'VA' order by file_number desc limit 1) not like 'VA-%' then raise exception 'new file was not auto-numbered'; end if;
end $$;
select 'edit file number checks passed' as result;
