-- Disposable database round trip. Printed rows are SQL results, not the portal UI.
\pset pager off
select set_config('request.jwt.claim.sub', '149e612a-6e14-4ee1-9890-0f29d6f89156', false);
select set_config('request.jwt.claim.role', 'authenticated', false);
insert into public.profiles (id, first_name, last_name, role, status, is_admin, is_demo) values
  ('149e612a-6e14-4ee1-9890-0f29d6f89156', 'John', 'Pilot', 'Super admin', 'active', true, false),
  ('d02722a1-582b-42c0-b3d1-28d25adb758d', 'Matt', 'Pilot', 'Super admin', 'active', true, false);
create temp table rt (k text primary key, v text);

\echo '--- DB execute grants (anon and authenticated must be false; postgres true) ---'
select u.rolname,
       has_function_privilege(u.rolname, 'public.staff_feedback_record_assistant_reply(uuid,text,uuid)', 'execute') as write_reply,
       has_function_privilege(u.rolname, 'public.staff_feedback_receiver_read(uuid,uuid,uuid)', 'execute') as read_turn
  from pg_roles u
 where u.rolname in ('anon', 'authenticated', 'postgres', 'service_role')
 order by u.rolname;

\echo '--- DB forced row security ---'
select n.nspname, c.relname, c.relrowsecurity as rls, c.relforcerowsecurity as forced
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where (n.nspname = 'public' and c.relname like 'staff_feedback_%')
    or (n.nspname = 'private' and c.relname = 'staff_feedback_reply_slot')
 order by 1, 2;

do $$
declare created jsonb; ev uuid; early jsonb; written jsonb; replay jsonb; turn jsonb; follow_ev uuid; claim uuid := 'abababab-abab-4aba-8aba-abababababab';
begin
  created := public.staff_feedback_create('Portal conversation', 'test test', false, '', false, '', '12121212-1212-4121-8121-121212121212');
  select id into ev from public.staff_feedback_outbox where feedback_id = (created->>'id')::uuid and event_name = 'cla.feedback.created';
  insert into pg_temp.rt(k, v) values ('report', created->>'id'), ('event', ev::text), ('conversation', created->>'conversation_id');
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
  early := public.staff_feedback_record_assistant_reply(ev, 'I see the test message.', '13131313-1313-4131-8131-131313131313');
  if early->>'state' <> 'prepared' or (early->>'completed')::boolean then
    raise exception 'FAIL early reply was treated as delivered'; end if;
  perform set_config('request.jwt.claim.role', 'service_role', true);
  if (public.staff_feedback_claim_dispatch(ev, claim)->>'claimed')::boolean is not true then raise exception 'FAIL claim'; end if;
  if (public.staff_feedback_finish_dispatch(ev, claim, 'run_accepted', 200)->>'delivery_state') <> 'run_accepted' then raise exception 'FAIL finish'; end if;
  perform set_config('request.jwt.claim.role', '', true);
  written := public.staff_feedback_record_assistant_reply(ev, 'I see the test message.', '13131313-1313-4131-8131-131313131313');
  replay := public.staff_feedback_record_assistant_reply(ev, 'I see the test message.', '13131313-1313-4131-8131-131313131313');
  if written->>'state' <> 'written' or (written->>'completed')::boolean is not true or replay->>'message_id' <> written->>'message_id' then
    raise exception 'FAIL same body replay'; end if;
  if (public.staff_feedback_record_assistant_reply(ev, 'A different answer.', '13131313-1313-4131-8131-131313131313')->>'conflict')::boolean is not true then
    raise exception 'FAIL different body was accepted'; end if;
  perform set_config('request.jwt.claim.sub', '149e612a-6e14-4ee1-9890-0f29d6f89156', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  turn := public.staff_feedback_add_turn((created->>'id')::uuid, 'Please check the next row too.', '14141414-1414-4141-8141-141414141414');
  follow_ev := (turn->>'turn_event_id')::uuid;
  insert into pg_temp.rt(k, v) values ('follow', follow_ev::text);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  if (public.staff_feedback_claim_dispatch(follow_ev, claim)->>'claimed')::boolean is not true then raise exception 'FAIL follow-up claim'; end if;
  if (public.staff_feedback_finish_dispatch(follow_ev, claim, 'run_accepted', 200)->>'ok')::boolean is not true then raise exception 'FAIL follow-up finish'; end if;
  perform set_config('request.jwt.claim.role', '', true);
  perform public.staff_feedback_record_assistant_reply(follow_ev, 'The next row is unchanged.', '15151515-1515-4151-8151-151515151515');
end $$;

select set_config('request.jwt.claim.sub', '', false);
select set_config('request.jwt.claim.role', '', false);
\echo '--- DB result: connector session (uid must be empty; role is the local harness default) ---'
select current_user, auth.uid() as uid, auth.role() as role;

\echo '--- DB result: first event read (current turn is the first user message; context empty) ---'
select public.staff_feedback_receiver_read(v.event::uuid, v.report::uuid, v.conversation::uuid)
  from (select max(v) filter (where k = 'event') as event, max(v) filter (where k = 'report') as report, max(v) filter (where k = 'conversation') as conversation from pg_temp.rt) v;

\echo '--- DB result: follow-up read (current turn is that message; context is earlier published turns only) ---'
select public.staff_feedback_receiver_read(v.follow::uuid, v.report::uuid, v.conversation::uuid)
  from (select max(v) filter (where k = 'follow') as follow, max(v) filter (where k = 'report') as report, max(v) filter (where k = 'conversation') as conversation from pg_temp.rt) v;

do $$
declare seen jsonb;
begin
  select public.staff_feedback_receiver_read(v.follow::uuid, v.report::uuid, v.conversation::uuid) into seen
    from (select max(v) filter (where k = 'follow') as follow, max(v) filter (where k = 'report') as report, max(v) filter (where k = 'conversation') as conversation from pg_temp.rt) v;
  if seen#>>'{current,body}' <> 'Please check the next row too.' then raise exception 'FAIL follow-up current turn is not that message'; end if;
  if seen->'context' @> '[{"body":"Please check the next row too."}]'::jsonb then raise exception 'FAIL follow-up context repeated the current turn'; end if;
  if not (seen->'context' @> '[{"body":"test test"}]'::jsonb and seen->'context' @> '[{"body":"I see the test message."}]'::jsonb) then
    raise exception 'FAIL follow-up context lost an earlier published turn'; end if;
  if seen ? 'order_file_number' or seen ? 'storage_path' then raise exception 'FAIL receiver read included order or file bytes'; end if;
end $$;

\echo '--- DB result: portal reload sees the saved replies, not the prepared-only state ---'
select set_config('request.jwt.claim.sub', '149e612a-6e14-4ee1-9890-0f29d6f89156', false);
select set_config('request.jwt.claim.role', 'authenticated', false);
select m.turn_ord, m.author_kind, m.simulation, m.body
  from public.staff_feedback_messages m
  join pg_temp.rt t on t.k = 'report' and m.report_id = t.v::uuid
 order by m.turn_ord;

\echo '--- DB result: wrong conversation id is not a read ---'
do $$
declare bad jsonb;
begin
  begin
    select public.staff_feedback_receiver_read(v.event::uuid, v.report::uuid, 'ffffffff-ffff-4fff-8fff-ffffffffffff') into bad
      from (select max(v) filter (where k = 'event') as event, max(v) filter (where k = 'report') as report from pg_temp.rt) v;
    raise exception 'FAIL cross-conversation read returned data';
  exception when sqlstate 'P0001' then
    raise notice 'cross-conversation read rejected';
  end;
end $$;

\echo '--- DB result: signed-in user id cannot use the connector write ---'
select set_config('request.jwt.claim.sub', '149e612a-6e14-4ee1-9890-0f29d6f89156', false);
do $$
begin
  begin
    perform public.staff_feedback_record_assistant_reply(
      (select v::uuid from pg_temp.rt where k = 'event'), 'Forged as John.', '16161616-1616-4161-8161-161616161616');
    raise exception 'FAIL a user id wrote a reply';
  exception when sqlstate 'P0001' then
    raise notice 'user-id write rejected';
  end;
end $$;
