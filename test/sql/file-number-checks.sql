-- Runs after the migration. Each block raises on failure.
do $$
declare d1 uuid; d2 uuid; d3 uuid; d4 uuid; fnum text; yy text := to_char(now() at time zone 'America/New_York', 'YY');
begin
  insert into public.deals (state) values ('FL') returning id, file_number into d1, fnum;
  if fnum <> 'FL-' || yy || '-97220' then raise exception 'FL insert got %', fnum; end if;
  insert into public.deals (state) values ('va') returning id, file_number into d2, fnum;
  if fnum <> 'VA-' || yy || '-97221' then raise exception 'VA insert got %', fnum; end if;
  insert into public.deals (state) values ('DC') returning file_number into fnum;
  if fnum <> 'DC-' || yy || '-97222' then raise exception 'DC insert got %', fnum; end if;
  insert into public.deals (state) values ('') returning file_number into fnum;
  if fnum <> 'MD-' || yy || '-97223' then raise exception 'blank state fallback got %', fnum; end if;
  insert into public.deals (state, file_number) values ('MD', 'DEMO-100') returning id, file_number into d4, fnum;
  if fnum <> 'DEMO-100' then raise exception 'explicit number not kept: %', fnum; end if;

  -- state change while new (internal-only email): prefix follows, number kept, logged
  insert into public.deal_emails (deal_id, direction, to_emails) values (d1, 'out', array['jcoester@clatitle.com']);
  update public.deals set state = 'MD' where id = d1;
  select file_number into fnum from public.deals where id = d1;
  if fnum <> 'MD-' || yy || '-97220' then raise exception 'new-file retag got %', fnum; end if;
  if not exists (select 1 from public.activity_log where deal_id = d1 and action = 'deal.file_number') then raise exception 'retag not logged'; end if;
  -- same state again: no change, no extra log
  update public.deals set state = 'MD' where id = d1;
  if (select count(*) from public.activity_log where deal_id = d1) <> 1 then raise exception 'no-op state update logged'; end if;

  -- outside email sent: number kept
  insert into public.deal_emails (deal_id, direction, to_emails, cc_emails) values (d1, 'out', array['jcoester@clatitle.com'], array['buyer@gmail.com']);
  update public.deals set state = 'FL' where id = d1;
  select file_number into fnum from public.deals where id = d1;
  if fnum <> 'MD-' || yy || '-97220' then raise exception 'outside-sent file was renumbered: %', fnum; end if;
  if (select state from public.deals where id = d1) <> 'FL' then raise exception 'state edit itself was blocked'; end if;

  -- an inbound email does not count as sent; a sent outbox message to an outside address does
  insert into public.deal_emails (deal_id, direction, to_emails) values (d2, 'in', array['buyer@gmail.com']);
  insert into public.outbox (deal_id, status, to_email) values (d2, 'queued', 'buyer@gmail.com');
  update public.deals set state = 'FL' where id = d2;
  select file_number into fnum from public.deals where id = d2;
  if fnum <> 'FL-' || yy || '-97221' then raise exception 'inbound/queued should not block: %', fnum; end if;
  insert into public.outbox (deal_id, status, sent_at, to_email) values (d2, 'sent', now(), 'agent@example.test');
  update public.deals set state = 'VA' where id = d2;
  select file_number into fnum from public.deals where id = d2;
  if fnum <> 'FL-' || yy || '-97221' then raise exception 'outside outbox send should keep number: %', fnum; end if;

  -- closed files keep their number
  insert into public.deals (state, status) values ('MD', 'Closed') returning id into d3;
  update public.deals set state = 'VA' where id = d3;
  if (select file_number from public.deals where id = d3) not like 'MD-%' then raise exception 'closed file renumbered'; end if;

  -- non-generated numbers are never retagged
  update public.deals set state = 'VA' where id = d4;
  if (select file_number from public.deals where id = d4) <> 'DEMO-100' then raise exception 'DEMO-100 retagged'; end if;

  -- collision with a manual number: keep the old one
  insert into public.deals (state, file_number) values ('DC', 'DC-' || yy || '-99999');
  insert into public.deals (state, file_number) values ('MD', 'MD-' || yy || '-99999') returning id into d3;
  update public.deals set state = 'DC' where id = d3;
  if (select file_number from public.deals where id = d3) <> 'MD-' || yy || '-99999' then raise exception 'collision not avoided'; end if;

  -- explicit file_number change in the same update wins
  insert into public.deals (state) values ('MD') returning id into d3;
  update public.deals set state = 'VA', file_number = 'MANUAL-1' where id = d3;
  if (select file_number from public.deals where id = d3) <> 'MANUAL-1' then raise exception 'explicit rename overridden'; end if;

  if (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'deals' and column_name = 'file_number') is not null then
    raise exception 'MD-26 default still present'; end if;
end $$;
select 'file number checks passed' as result;
