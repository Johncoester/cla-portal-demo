select set_config('request.jwt.claim.sub', '149e612a-6e14-4ee1-9890-0f29d6f89156', false);
select set_config('request.jwt.claim.role', 'authenticated', false);
insert into public.profiles (id, first_name, last_name, role, status, is_admin, is_demo) values
  ('149e612a-6e14-4ee1-9890-0f29d6f89156', 'John', 'Coester', 'Super admin', 'active', true, false);

do $$
declare created jsonb; ev uuid; claim uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'; other uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'; first jsonb; second jsonb; done jsonb;
begin
  created := public.staff_feedback_create('Claim check', 'Synthetic body. Do not deploy.', false, '', false, '', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  if created->>'delivery_state' <> 'pending_dispatch' then raise exception 'FAIL create was not pending'; end if;
  select id into ev from public.staff_feedback_outbox where feedback_id = (created->>'id')::uuid and event_name = 'cla.feedback.created';
  if (select dispatch_allowed from public.staff_feedback_outbox where id = ev) then raise exception 'FAIL new row is auto-enabled'; end if;
  perform set_config('request.jwt.claim.role', 'service_role', true);
  first := public.staff_feedback_claim_dispatch(ev, claim);
  second := public.staff_feedback_claim_dispatch(ev, other);
  if (first->>'claimed')::boolean is not true or (second->>'claimed')::boolean then raise exception 'FAIL two claims both won'; end if;
  done := public.staff_feedback_finish_dispatch(ev, other, 'run_accepted', 200);
  if (done->>'ok')::boolean then raise exception 'FAIL a different claim recorded acceptance'; end if;
  done := public.staff_feedback_finish_dispatch(ev, claim, 'run_accepted', 200);
  if (done->>'ok')::boolean is not true or done->>'delivery_state' <> 'run_accepted' then raise exception 'FAIL acceptance was not recorded'; end if;
  if (select delivery_state from public.staff_feedback_reports where id = (created->>'id')::uuid) <> 'run_accepted' then raise exception 'FAIL report did not follow the event'; end if;
end $$;

set role authenticated;
do $$
begin
  begin
    perform public.staff_feedback_claim_dispatch('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
    raise exception 'FAIL portal role claimed dispatch';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
