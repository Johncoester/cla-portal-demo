-- The copy trigger already exists in the real schema. This throwaway database creates it after the replacement function.
create trigger participant_copies after insert on public.deal_participants
  for each row execute function private.trg_participant_copies();

select public.set_template_due_anchor('survey_anchor', 'closing', -2);
do $$ begin
  if (select due_anchor from public.task_templates where code = 'survey_anchor') <> 'closing' then raise exception 'anchor was not saved'; end if;
  if (select due_days from public.task_templates where code = 'survey_anchor') <> -2 then raise exception 'due days were not saved'; end if;
end $$;

insert into public.deal_participants (id, deal_id, contact_id, role) values
  ('88888888-8888-8888-8888-888888888888', '44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 'Client-Buyer'),
  ('99999999-9999-9999-9999-999999999999', '55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222', 'Client-Buyer'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 'Client-Seller');

do $$ begin
  if (select due_date from public.tasks where participant_id = '88888888-8888-8888-8888-888888888888' and template_code = 'survey_anchor') <> date '2026-12-13' then
    raise exception 'buyer copy should be two days before closing';
  end if;
  if (select due_date from public.tasks where participant_id = '99999999-9999-9999-9999-999999999999' and template_code = 'survey_anchor') is not null then
    raise exception 'a missing closing date must leave the due date blank';
  end if;
  if exists (select 1 from public.tasks where participant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and template_code = 'survey_anchor') then
    raise exception 'a buyer audience must not create a seller copy';
  end if;
  if not exists (select 1 from public.tasks where participant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and template_code = 'seller_only') then
    raise exception 'the seller audience should still create the seller copy';
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

update public.profiles set role = 'Processor' where id = '11111111-1111-1111-1111-111111111111';
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
  if not (select due_overridden from public.tasks where template_code = 'survey_anchor' and participant_id = '88888888-8888-8888-8888-888888888888') then
    raise exception 'the override flag was not set';
  end if;
end $$;

update public.profiles set role = 'Client-Buyer' where id = '11111111-1111-1111-1111-111111111111';
do $$ begin
  begin
    perform public.set_task_due_override((select id from public.tasks where template_code = 'survey_anchor' limit 1), date '2026-01-01');
    raise exception 'a client changed a due date';
  exception when others then
    if sqlerrm not like '%processor or transaction coordinator%' then raise; end if;
  end;
end $$;
