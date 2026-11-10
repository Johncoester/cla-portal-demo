-- Checks the due-anchor migration on the throwaway database. Not hosted TEST.
insert into public.profiles (id, role, is_admin, status, first_name, last_name)
values ('11111111-1111-1111-1111-111111111111', 'Admin', true, 'active', 'Ada', 'Admin')
on conflict (id) do update set role = 'Admin', is_admin = true, status = 'active';

insert into public.profiles (id, role, is_admin, status, first_name, last_name) values
  ('33333333-3333-3333-3333-333333333333', 'Client-Buyer', false, 'active', 'Ben', 'Buyer'),
  ('34343434-3434-3434-3434-343434343434', 'Client-Seller', false, 'active', 'Sue', 'Seller')
on conflict (id) do nothing;

insert into public.contacts (id, profile_id, first_name, last_name) values
  ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', 'Ben', 'Buyer'),
  ('23232323-2323-2323-2323-232323232323', '34343434-3434-3434-3434-343434343434', 'Sue', 'Seller')
on conflict (id) do nothing;

insert into public.deals (id, open_date, contract_date, closing_date, street, city, state) values
  ('44444444-4444-4444-4444-444444444444', '2026-11-01', '2026-11-10', '2026-12-15', '1 Anchor', 'Rockville', 'MD'),
  ('55555555-5555-5555-5555-555555555555', '2026-11-01', '2026-11-10', null, '2 Anchor', 'Rockville', 'MD'),
  ('56565656-5656-5656-5656-565656565656', '2026-11-01', null, '2026-12-15', '3 Anchor', 'Rockville', 'MD')
on conflict (id) do nothing;

insert into public.task_templates (id, code, version, title, roles, due_days, due_anchor, active, lane, audiences) values
  ('66666666-6666-6666-6666-666666666666', 'survey_anchor', 1, 'Survey', array['Client-Buyer'], 7, 'closing', true, 'portal', array['buyer']),
  ('77777777-7777-7777-7777-777777777777', 'seller_only', 1, 'Seller', array['Client-Seller'], 7, 'opened', true, 'portal', array['seller']),
  ('67676767-6767-6767-6767-676767676767', 'contract_anchor', 1, 'Contract', array['Client-Buyer'], 5, 'contract', true, 'portal', array['buyer']),
  ('68686868-6868-6868-6868-686868686868', 'opened_anchor', 1, 'Opened', array['Client-Buyer'], 4, 'opened', true, 'portal', array['buyer']);

-- A copy that already exists is not rewritten when the template changes.
insert into public.tasks (id, deal_id, title, description, assigned_role, status, due_date, kind, participant_id, template_code)
values ('99999999-9999-9999-9999-999999999991', '44444444-4444-4444-4444-444444444444', 'Kept', '', 'Client-Buyer', 'todo', '2026-01-15', 'simple', null, null);

update public.task_templates set due_days = -2 where code = 'survey_anchor';

insert into public.deal_participants (id, deal_id, contact_id, role) values
  ('88888888-8888-8888-8888-888888888888', '44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 'Client-Buyer'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', '23232323-2323-2323-2323-232323232323', 'Client-Seller'),
  ('99999999-9999-9999-9999-999999999999', '55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222', 'Client-Buyer'),
  ('abababab-abab-abab-abab-abababababab', '56565656-5656-5656-5656-565656565656', '22222222-2222-2222-2222-222222222222', 'Client-Buyer');

do $$ begin
  if (select due_date from public.tasks where template_code = 'survey_anchor' and participant_id = '88888888-8888-8888-8888-888888888888')
       is distinct from date '2026-12-13' then
    raise exception 'closing minus two days was %', (select due_date from public.tasks where template_code = 'survey_anchor' and participant_id = '88888888-8888-8888-8888-888888888888');
  end if;
  if (select due_overridden from public.tasks where template_code = 'survey_anchor' and participant_id = '88888888-8888-8888-8888-888888888888') then
    raise exception 'a new copy must not start overridden';
  end if;
  if (select due_date from public.tasks where template_code = 'opened_anchor' and participant_id = '88888888-8888-8888-8888-888888888888')
       is distinct from date '2026-11-05' then
    raise exception 'opened plus four days was wrong';
  end if;
  if (select due_date from public.tasks where template_code = 'contract_anchor' and participant_id = '88888888-8888-8888-8888-888888888888')
       is distinct from date '2026-11-15' then
    raise exception 'contract plus five days was wrong';
  end if;
  if (select due_date from public.tasks where template_code = 'survey_anchor' and participant_id = '99999999-9999-9999-9999-999999999999') is not null then
    raise exception 'a missing closing date must leave the due date blank';
  end if;
  if (select due_date from public.tasks where template_code = 'contract_anchor' and participant_id = 'abababab-abab-abab-abab-abababababab') is not null then
    raise exception 'a missing contract date must leave the due date blank';
  end if;
  if exists (select 1 from public.tasks where participant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and template_code = 'survey_anchor') then
    raise exception 'a buyer audience must not create a seller copy';
  end if;
  if not exists (select 1 from public.tasks where participant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and template_code = 'seller_only') then
    raise exception 'the seller audience should still create the seller copy';
  end if;
  if (select due_date from public.tasks where id = '99999999-9999-9999-9999-999999999991') is distinct from date '2026-01-15' then
    raise exception 'an existing task copy was rewritten';
  end if;
end $$;

do $$ begin
  begin
    perform public.set_template_due_anchor('survey_anchor', 'opened', 0);
    raise exception 'zero days was accepted';
  exception when others then
    if sqlerrm not like '%not zero%' then raise; end if;
  end;
end $$;

update public.profiles set role = 'Processor', is_admin = false where id = '11111111-1111-1111-1111-111111111111';
do $$ begin
  begin
    perform public.set_template_due_anchor('survey_anchor', 'opened', 4);
    raise exception 'a processor changed a template';
  exception when others then
    if sqlerrm not like '%Only an Admin%' then raise; end if;
  end;
end $$;

select public.set_task_due_override((select id from public.tasks where template_code = 'survey_anchor' and participant_id = '88888888-8888-8888-8888-888888888888'), date '2026-12-01');
do $$ begin
  if (select due_date from public.tasks where template_code = 'survey_anchor' and participant_id = '88888888-8888-8888-8888-888888888888') is distinct from date '2026-12-01'
     or not (select due_overridden from public.tasks where template_code = 'survey_anchor' and participant_id = '88888888-8888-8888-8888-888888888888') then
    raise exception 'the override flag was not set';
  end if;
end $$;

update public.task_templates set due_days = 9, due_anchor = 'opened' where code = 'survey_anchor';
do $$ begin
  if (select due_date from public.tasks where template_code = 'survey_anchor' and participant_id = '88888888-8888-8888-8888-888888888888') is distinct from date '2026-12-01' then
    raise exception 'changing the template rewrote the overridden copy';
  end if;
end $$;

update public.profiles set role = 'Client-Buyer', is_admin = false where id = '11111111-1111-1111-1111-111111111111';
do $$ begin
  begin
    perform public.set_task_due_override((select id from public.tasks where template_code = 'survey_anchor' and participant_id = '88888888-8888-8888-8888-888888888888'), date '2026-01-01');
    raise exception 'a client changed a due date';
  exception when others then
    if sqlerrm not like '%processor or transaction coordinator%' then raise; end if;
  end;
end $$;

update public.profiles set role = 'Transaction Coordinator', is_admin = false where id = '11111111-1111-1111-1111-111111111111';
select public.set_task_due_override((select id from public.tasks where template_code = 'seller_only' limit 1), date '2026-11-20');
do $$ begin
  if not (select due_overridden from public.tasks where template_code = 'seller_only' limit 1) then
    raise exception 'a transaction coordinator could not override a due date';
  end if;
end $$;

update public.profiles set role = 'Admin', is_admin = true where id = '11111111-1111-1111-1111-111111111111';
select private.rpc_upsert_task_template('survey_anchor', 'Survey', '', array['Client-Buyer'], -3, 'portal', array['buyer'], false);
do $$ begin
  if (select due_days from public.task_templates where code = 'survey_anchor' and active) is distinct from -3 then
    raise exception 'saving a template did not keep a negative due day';
  end if;
end $$;
