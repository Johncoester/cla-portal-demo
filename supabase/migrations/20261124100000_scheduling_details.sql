-- MF-056 / FF-085 (Matt Landsberg, email "Scheduling Feature", Nov 16 2026, 9:20 AM ET).
-- Scheduling details for the buyer side and the seller side, plus the processor's settlement agent.
-- A link for the buyer or seller is queued in the outbox from testportal@clatitle.com. Nothing is sent.
-- This does not replace MF-011. deals.closer_name stays. The buyer's date is not written to deals.closing_date.
-- Rollback: supabase/rollbacks/20261124100000_scheduling_details.sql
begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public, extensions;

do $$
begin
  if to_regprocedure('private.agent_task_defs()') is null then
    raise exception 'drift: private.agent_task_defs is missing'; end if;
  if not exists (select 1 from private.agent_task_defs() where code = 'agent_home_warranty') then
    raise exception 'drift: the home warranty agent task is missing'; end if;
  if exists (select 1 from private.agent_task_defs() where code = 'agent_schedule_settlement') then
    raise exception 'drift: the scheduling agent task is already defined'; end if;
  if to_regprocedure('private.agent_validate(text, jsonb)') is null
     or to_regprocedure('private.make_agent_tasks(uuid)') is null
     or to_regprocedure('private.rpc_submit_agent_task(uuid, jsonb)') is null then
    raise exception 'drift: an agent task function is missing'; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deals' and column_name = 'sched_buyer_date') then
    raise exception 'drift: scheduling columns already exist'; end if;
  if to_regclass('public.scheduling_links') is not null then
    raise exception 'drift: scheduling_links already exists'; end if;
end $$;

alter table public.deals
  add column sched_buyer_ask boolean not null default false,
  add column sched_buyer_date date,
  add column sched_buyer_time text not null default '',
  add column sched_buyer_place text not null default '',
  add column sched_buyer_office_id text not null default '',
  add column sched_buyer_office_name text not null default '',
  add column sched_buyer_street text not null default '',
  add column sched_buyer_city text not null default '',
  add column sched_buyer_state text not null default '',
  add column sched_buyer_zip text not null default '',
  add column sched_buyer_notes text not null default '',
  add column sched_buyer_ron boolean not null default false,
  add column sched_buyer_by text not null default '',
  add column sched_seller_ask boolean not null default false,
  add column sched_seller_date date,
  add column sched_seller_time text not null default '',
  add column sched_seller_place text not null default '',
  add column sched_seller_office_id text not null default '',
  add column sched_seller_office_name text not null default '',
  add column sched_seller_street text not null default '',
  add column sched_seller_city text not null default '',
  add column sched_seller_state text not null default '',
  add column sched_seller_zip text not null default '',
  add column sched_seller_notes text not null default '',
  add column sched_seller_ron boolean not null default false,
  add column sched_seller_by text not null default '',
  add column settlement_agent_name text not null default '',
  add column settlement_agent_profile_id uuid,
  add column settlement_agent_confirmed boolean not null default false,
  add column scheduling_processor_notes text not null default '';

alter table public.deals add constraint deals_sched_buyer_time check (sched_buyer_time = '' or sched_buyer_time ~ '^(09|1[0-7]):(00|30)$' or sched_buyer_time = '18:00');
alter table public.deals add constraint deals_sched_seller_time check (sched_seller_time = '' or sched_seller_time ~ '^(09|1[0-7]):(00|30)$' or sched_seller_time = '18:00');
alter table public.deals add constraint deals_sched_buyer_place check (sched_buyer_place in ('', 'office', 'other'));
alter table public.deals add constraint deals_sched_seller_place check (sched_seller_place in ('', 'office', 'other', 'ron'));
alter table public.deals add constraint deals_sched_notes_len check (char_length(sched_buyer_notes) <= 1000 and char_length(sched_seller_notes) <= 1000 and char_length(scheduling_processor_notes) <= 2000 and char_length(settlement_agent_name) <= 120);

create table public.scheduling_links (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id),
  side text not null check (side in ('buyer', 'seller')),
  token_hash text not null,
  token_plain text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  used_at timestamptz
);
create index scheduling_links_hash_idx on public.scheduling_links (token_hash);
alter table public.scheduling_links enable row level security;
revoke all on public.scheduling_links from public, anon, authenticated;

-- Direct edits of these columns are refused. The save functions set cla.schedule_rpc.
create function private.deals_schedule_guard() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if current_setting('cla.schedule_rpc', true) = 'on' then return new; end if;
  if new.sched_buyer_ask is distinct from old.sched_buyer_ask
     or new.sched_buyer_date is distinct from old.sched_buyer_date
     or new.sched_buyer_time is distinct from old.sched_buyer_time
     or new.sched_buyer_place is distinct from old.sched_buyer_place
     or new.sched_buyer_office_id is distinct from old.sched_buyer_office_id
     or new.sched_buyer_office_name is distinct from old.sched_buyer_office_name
     or new.sched_buyer_street is distinct from old.sched_buyer_street
     or new.sched_buyer_city is distinct from old.sched_buyer_city
     or new.sched_buyer_state is distinct from old.sched_buyer_state
     or new.sched_buyer_zip is distinct from old.sched_buyer_zip
     or new.sched_buyer_notes is distinct from old.sched_buyer_notes
     or new.sched_buyer_ron is distinct from old.sched_buyer_ron
     or new.sched_buyer_by is distinct from old.sched_buyer_by
     or new.sched_seller_ask is distinct from old.sched_seller_ask
     or new.sched_seller_date is distinct from old.sched_seller_date
     or new.sched_seller_time is distinct from old.sched_seller_time
     or new.sched_seller_place is distinct from old.sched_seller_place
     or new.sched_seller_office_id is distinct from old.sched_seller_office_id
     or new.sched_seller_office_name is distinct from old.sched_seller_office_name
     or new.sched_seller_street is distinct from old.sched_seller_street
     or new.sched_seller_city is distinct from old.sched_seller_city
     or new.sched_seller_state is distinct from old.sched_seller_state
     or new.sched_seller_zip is distinct from old.sched_seller_zip
     or new.sched_seller_notes is distinct from old.sched_seller_notes
     or new.sched_seller_ron is distinct from old.sched_seller_ron
     or new.sched_seller_by is distinct from old.sched_seller_by
     or new.settlement_agent_name is distinct from old.settlement_agent_name
     or new.settlement_agent_profile_id is distinct from old.settlement_agent_profile_id
     or new.settlement_agent_confirmed is distinct from old.settlement_agent_confirmed
     or new.scheduling_processor_notes is distinct from old.scheduling_processor_notes then
    raise exception 'Save scheduling from the Scheduling Details page.' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger deals_schedule_guard before update on public.deals
  for each row execute function private.deals_schedule_guard();

create function private.schedule_check(a jsonb) returns jsonb
language plpgsql immutable set search_path = pg_catalog, public as $$
declare
  side text := case when coalesce(a->>'side', '') = 'seller' then 'seller' when coalesce(a->>'side', '') = 'buyer' then 'buyer' else '' end;
  ask boolean := coalesce(a->>'askParty', '') in ('true', 'yes', 'Yes', 'on');
  dt text := left(btrim(coalesce(a->>'date', '')), 10);
  tm text := left(btrim(coalesce(a->>'time', '')), 5);
  place text := left(btrim(coalesce(a->>'placeKind', '')), 20);
  ron boolean := side = 'seller' and (place = 'ron' or coalesce(a->>'preferRon', '') in ('true', 'yes', 'Yes', 'on'));
  office text := left(btrim(coalesce(a->>'officeId', '')), 80);
  street text := left(regexp_replace(btrim(coalesce(a->>'street', '')), '\s+', ' ', 'g'), 120);
  city text := left(regexp_replace(btrim(coalesce(a->>'city', '')), '\s+', ' ', 'g'), 80);
  st text := upper(left(btrim(coalesce(a->>'state', '')), 2));
  zip text := left(btrim(coalesce(a->>'zip', '')), 10);
  notes text := left(regexp_replace(btrim(coalesce(a->>'notes', '')), '\s+', ' ', 'g'), 1000);
  ok_time boolean;
begin
  ok_time := tm ~ '^(09|1[0-7]):(00|30)$' or tm = '18:00';
  if side = '' then raise exception 'Pick the buyer side or the seller side.' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(a->>'notes', ''))) > 1000 then
    raise exception 'Notes can be up to 1,000 characters. Shorten the note and save again.' using errcode = 'P0001'; end if;
  if place = 'ron' and side <> 'seller' then raise exception 'Remote online notarization is only for the seller side.' using errcode = 'P0001'; end if;
  if ron then place := 'ron'; elsif place not in ('office', 'other') then place := ''; end if;
  if dt <> '' and dt !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Enter the settlement date as YYYY-MM-DD.' using errcode = 'P0001'; end if;
  if tm <> '' and not ok_time then raise exception 'Choose a time between 9:00 AM and 6:00 PM.' using errcode = 'P0001'; end if;
  if not ask then
    if dt = '' then raise exception 'Enter the settlement date. The contract has no closing date, so type one.' using errcode = 'P0001'; end if;
    if not ok_time then raise exception 'Choose a time between 9:00 AM and 6:00 PM.' using errcode = 'P0001'; end if;
    if place = '' then raise exception 'Choose a CLA office or a different location.' using errcode = 'P0001'; end if;
    if place = 'office' and office = '' then raise exception 'Choose the CLA office.' using errcode = 'P0001'; end if;
    if place = 'other' and (street = '' or city = '' or st !~ '^[A-Z]{2}$' or zip !~ '^\d{5}(-\d{4})?$') then
      raise exception 'Enter the street, city, state, and ZIP for the other location.' using errcode = 'P0001'; end if;
  end if;
  if place <> 'office' then office := ''; end if;
  if place <> 'other' then street := ''; city := ''; st := ''; zip := ''; end if;
  return jsonb_build_object(
    'side', side, 'askParty', ask, 'date', dt, 'time', case when ok_time then tm else '' end,
    'placeKind', place, 'officeId', office, 'street', street, 'city', city, 'state', st, 'zip', zip,
    'notes', notes, 'preferRon', place = 'ron');
end $$;

create function private.save_side_schedule(p_deal uuid, p_answers jsonb, p_by text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
declare
  clean jsonb := private.schedule_check(p_answers);
  side text := clean->>'side';
  ask boolean := (clean->>'askParty')::boolean and p_by = 'agent';
  place text := clean->>'placeKind';
  office text := clean->>'officeId';
  office_name text := '';
  tok text; path text; n int := 0;
  who record; agent uuid := private.effective_uid();
  mail text; subj text; body text;
begin
  if p_by not in ('agent', 'party') then raise exception 'Pick who is scheduling.' using errcode = 'P0001'; end if;
  if place = 'office' and office <> '' and to_regclass('public.offices') is not null then
    execute 'select name from public.offices where id = $1 and active' into office_name using office;
    if office_name is null then raise exception 'Choose an active CLA office.' using errcode = 'P0001'; end if;
  end if;
  perform set_config('cla.schedule_rpc', 'on', true);
  if side = 'buyer' then
    update public.deals set sched_buyer_ask = ask, sched_buyer_date = nullif(clean->>'date', '')::date,
      sched_buyer_time = clean->>'time', sched_buyer_place = place, sched_buyer_office_id = office, sched_buyer_office_name = coalesce(office_name, ''),
      sched_buyer_street = clean->>'street', sched_buyer_city = clean->>'city', sched_buyer_state = clean->>'state', sched_buyer_zip = clean->>'zip',
      sched_buyer_notes = clean->>'notes', sched_buyer_ron = false, sched_buyer_by = p_by
      where id = p_deal;
  else
    update public.deals set sched_seller_ask = ask, sched_seller_date = nullif(clean->>'date', '')::date,
      sched_seller_time = clean->>'time', sched_seller_place = place, sched_seller_office_id = office, sched_seller_office_name = coalesce(office_name, ''),
      sched_seller_street = clean->>'street', sched_seller_city = clean->>'city', sched_seller_state = clean->>'state', sched_seller_zip = clean->>'zip',
      sched_seller_notes = clean->>'notes', sched_seller_ron = (place = 'ron'), sched_seller_by = p_by
      where id = p_deal;
  end if;
  perform set_config('cla.schedule_rpc', 'off', true);
  if ask then
    if not exists (select 1 from public.deal_participants p join public.contacts c on c.id = p.contact_id
      where p.deal_id = p_deal and p.role = case when side = 'seller' then 'Client-Seller' else 'Client-Buyer' end and btrim(coalesce(c.email, '')) <> '') then
      raise exception '%', case when side = 'seller' then 'Add the seller email on Contacts before asking the seller to schedule.'
        else 'Add the buyer email on Contacts before asking the buyer to schedule.' end using errcode = 'P0001'; end if;
    tok := md5(gen_random_uuid()::text || clock_timestamp()::text);
    path := '#/schedule-party/' || tok;
    insert into public.scheduling_links (deal_id, side, token_hash, token_plain, created_by)
    values (p_deal, side, md5(tok), tok, agent);
    for who in
      select c.email, btrim(c.first_name || ' ' || c.last_name) as full_name, c.profile_id, c.first_name
      from public.deal_participants p join public.contacts c on c.id = p.contact_id
      where p.deal_id = p_deal and p.role = case when side = 'seller' then 'Client-Seller' else 'Client-Buyer' end and btrim(coalesce(c.email, '')) <> ''
    loop
      subj := 'Schedule the settlement for ' || (select btrim(concat_ws(', ', nullif(btrim(street), ''), nullif(btrim(city), ''))) from public.deals where id = p_deal);
      body := 'Hi ' || coalesce(nullif(btrim(who.first_name), ''), side) || E',\n\nPlease choose a settlement date, time and place.\n\nOpen this link: ' || path || E'\n\nTEST PORTAL: queued only; never sent.';
      insert into public.outbox (channel, status, sent_at, to_profile_id, to_email, to_name, subject, body, deal_id, created_by, kind, from_email, from_name, sender_type)
      values ('email', 'queued', null, who.profile_id, who.email, coalesce(who.full_name, ''), left(subj, 500), left(body, 4000), p_deal, agent, 'scheduling', 'testportal@clatitle.com', 'CLA Title Portal', 'portal');
      n := n + 1;
    end loop;
    select email into mail from public.profiles where id = agent;
    if mail is not null then
      insert into public.outbox (channel, status, sent_at, to_profile_id, to_email, to_name, subject, body, deal_id, created_by, kind, from_email, from_name, sender_type)
      values ('email', 'queued', null, agent, mail, coalesce(private.person_name(agent), ''), 'You asked the ' || side || ' to schedule',
        'A scheduling link was queued. Nothing was emailed.' || E'\n\nTEST PORTAL: queued only; never sent.',
        p_deal, agent, 'scheduling', 'testportal@clatitle.com', 'CLA Title Portal', 'portal');
    end if;
    clean := clean || jsonb_build_object('partyLink', path);
  elsif p_by = 'party' then
    perform private.notify(array(select x from unnest(array[
      (select created_by from public.scheduling_links where deal_id = p_deal and side = side order by created_at desc limit 1),
      (select processor_id from public.deals where id = p_deal)]) x where x is not null),
      'settlement', p_deal, 'The ' || side || ' scheduled the settlement', '#/deals/' || p_deal || '/closing');
  end if;
  return clean;
end $$;

revoke all on function private.save_side_schedule(uuid, jsonb, text) from public, anon, authenticated;

create or replace function private.agent_task_defs()
returns table(code text, title text, about text, due_days integer)
language sql immutable set search_path = pg_catalog, public, extensions as $$
  values ('agent_client_contacts', 'Confirm Client Contact Information', 'Tell us which of the clients on this order you represent and confirm how to reach them (and their spouse, if married). Add anyone we are missing.', 3),
         ('agent_transaction_info', 'Confirm Your Transaction Information', 'Check the closing date and price we have, give your commission split, any fees or credits for the settlement statement, the earnest money, and the people on your team.', 3),
         ('agent_home_warranty', 'Confirm Home Warranty Information', 'Let us know whether you or someone else will be purchasing a home warranty for this property.', 5),
         ('agent_schedule_settlement', 'Schedule the Settlement for [property address]', 'Choose the settlement date, a CLA office or another location, and a time between 9:00 AM and 6:00 PM. You can ask the buyer or the seller to schedule instead. The seller can ask for remote online notarization. A link is queued in the outbox. Nothing is emailed from this build.', 3)
$$;

create or replace function private.agent_validate(p_code text, a jsonb) returns void
language plpgsql immutable set search_path = pg_catalog, public, extensions as $$
declare c jsonb; begin
  if p_code = 'agent_client_contacts' then
    for c in select * from jsonb_array_elements(coalesce(a->'clients', '[]')) loop
      if coalesce(c->>'represent', '') not in ('Yes', 'No') then raise exception 'Do you represent each client? Choose Yes or No.' using errcode = 'P0001'; end if;
      if c->>'represent' = 'Yes' then
        if not private.agent_person_ok(c, true, true) then raise exception 'Client first name, last name, email and 10-digit phone are required.' using errcode = 'P0001'; end if;
        if coalesce(c->>'maritalStatus', '') not in ('Single', 'Married', 'Divorced', 'Widowed') then raise exception 'Choose a marital status.' using errcode = 'P0001'; end if;
        if c->>'maritalStatus' = 'Married' and not private.agent_person_ok(coalesce(c->'spouse', '{}'), false, false) then raise exception 'Spouse first and last name are required.' using errcode = 'P0001'; end if;
      end if; end loop;
    for c in select * from jsonb_array_elements(coalesce(a->'added', '[]')) loop
      if not private.agent_person_ok(c, true, false) then raise exception 'An added client needs a first name, last name and email.' using errcode = 'P0001'; end if; end loop;
  elsif p_code = 'agent_transaction_info' then
    if coalesce(a->>'closingDate', '') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Estimated closing date is required.' using errcode = 'P0001'; end if;
    perform (a->>'closingDate')::date;
    if coalesce(a->>'purchasePrice', '') !~ '^\d+(\.\d+)?$' then raise exception 'Purchase price is required.' using errcode = 'P0001'; end if;
    if coalesce(a->>'emdAmount', '') !~ '^\d+(\.\d+)?$' then raise exception 'Earnest deposit amount is required (0 if none).' using errcode = 'P0001'; end if;
    if coalesce(a->>'holdingEmd', '') not in ('Yes', 'No') then raise exception 'Are you holding earnest money given to you by the buyer?' using errcode = 'P0001'; end if;
    if jsonb_array_length(coalesce(a->'commissions', '[]')) = 0 then raise exception 'Add your commission (percent or amount).' using errcode = 'P0001'; end if;
    for c in select * from jsonb_array_elements(coalesce(a->'fees', '[]')) loop
      if coalesce(trim(c->>'name'), '') = '' or coalesce(c->>'type', '') not in ('Fee', 'Credit') or coalesce(c->>'paidBy', '') not in ('Buyer', 'Seller') or coalesce(c->>'amount', '') !~ '^\d+(\.\d+)?$' then
        raise exception 'Each fee or credit needs a name, Fee / Credit, an amount and who pays it.' using errcode = 'P0001'; end if; end loop;
    for c in select * from jsonb_array_elements(coalesce(a->'team', '[]')) loop
      if not private.agent_person_ok(c, true, false) then raise exception 'Each team member needs a first name, last name and email.' using errcode = 'P0001'; end if; end loop;
  elsif p_code = 'agent_home_warranty' then
    if coalesce(a->>'willPurchase', '') not in ('Yes', 'No') then raise exception 'Will you or someone else be purchasing a home warranty? Choose Yes or No.' using errcode = 'P0001'; end if;
    if a->>'willPurchase' = 'Yes' and coalesce(a->>'purchaser', '') not in ('Me', 'Someone else') then raise exception 'Who is purchasing it?' using errcode = 'P0001'; end if;
  elsif p_code = 'agent_schedule_settlement' then
    perform private.schedule_check(a);
  else raise exception 'Unknown agent task' using errcode = 'P0001'; end if;
end $$;

create or replace function private.make_agent_tasks(p_part uuid) returns integer
language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
declare p public.deal_participants; owner uuid; n int; addr text;
begin
  select * into p from public.deal_participants where id = p_part;
  if not found or p.role not in ('Buyer Agent', 'Listing Agent') then return 0; end if;
  if not exists (select 1 from public.deals where id = p.deal_id and status = 'Open') then return 0; end if;
  select profile_id into owner from public.contacts where id = p.contact_id; if owner is null then return 0; end if;
  select btrim(concat_ws(', ', nullif(btrim(street), ''), nullif(btrim(city), ''), nullif(btrim(concat_ws(' ', nullif(btrim(state), ''), nullif(btrim(zip), ''))), '')))
    into addr from public.deals where id = p.deal_id;
  insert into public.tasks (deal_id, title, description, assigned_role, status, due_date, created_by, kind, participant_id, owner_profile_id, template_code, template_version)
  select p.deal_id,
    case when a.code = 'agent_schedule_settlement' and addr <> '' then 'Schedule the Settlement for ' || addr else a.title end,
    a.about, p.role, 'todo', current_date + a.due_days, private.effective_uid(), 'agent', p.id, owner, a.code, 1
  from private.agent_task_defs() a
  where private.task_enabled(a.code) and not exists (select 1 from public.tasks x where x.participant_id = p.id and x.template_code = a.code and x.status <> 'cancelled');
  get diagnostics n = row_count; return n; end $$;

create or replace function private.rpc_submit_agent_task(p_task uuid, p_answers jsonb) returns integer
language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
declare t public.tasks; n int; saved jsonb;
begin
  select * into t from public.tasks where id = p_task and kind = 'agent';
  if not found or not private.can_access_deal(t.deal_id) or not private.task_visible(t.owner_profile_id, t.assigned_role, t.deal_id) then raise exception 'Task not found' using errcode = 'P0001'; end if;
  if t.owner_profile_id is distinct from private.effective_uid() then raise exception 'Only the agent this task is for can submit it.' using errcode = 'P0001'; end if;
  if t.status = 'cancelled' then raise exception 'This task was cancelled.' using errcode = 'P0001'; end if;
  if t.template_code = 'agent_schedule_settlement' then
    p_answers := coalesce(p_answers, '{}'::jsonb) || jsonb_build_object('side', case when t.assigned_role = 'Listing Agent' then 'seller' else 'buyer' end);
  end if;
  perform private.agent_validate(t.template_code, p_answers);
  if t.template_code = 'agent_schedule_settlement' then
    saved := private.save_side_schedule(t.deal_id, p_answers, 'agent');
    p_answers := saved;
  end if;
  select coalesce(max(r.n), 0) + 1 into n from public.agent_task_revisions r where r.task_id = p_task;
  insert into public.agent_task_revisions (task_id, n, answers, by_profile) values (p_task, n, p_answers, private.effective_uid());
  perform set_config('cla.form_rpc', 'on', true);
  update public.tasks set form_data = p_answers, saved_at = now(), saved_by = private.effective_uid(), status = 'done', completed_at = now(), completed_by = private.effective_uid() where id = p_task;
  perform set_config('cla.form_rpc', '', true);
  perform private.log_activity(t.deal_id, case when n = 1 then 'task.submitted' else 'task.revised' end, 'task', t.id, t.title || case when n = 1 then ': submitted' else ': revision ' || (n - 1) || ' submitted' end);
  perform private.notify(array[(select processor_id from public.deals where id = t.deal_id)], 'task', t.deal_id, private.person_name(private.effective_uid()) || case when n = 1 then ' completed "' else ' revised "' end || t.title || '"', '#/deals/' || t.deal_id || '/tasks/' || t.id);
  return n; end $$;

-- Open files that already have an agent get the new task. Closed files are left alone.
do $$
declare r uuid;
begin
  for r in
    select p.id from public.deal_participants p
    join public.deals d on d.id = p.deal_id
    where d.status = 'Open' and p.role in ('Buyer Agent', 'Listing Agent')
  loop
    perform private.make_agent_tasks(r);
  end loop;
end $$;

create function public.get_party_schedule(p_token text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
declare link public.scheduling_links; d public.deals; offices jsonb := '[]'::jsonb; hint text := '';
begin
  select * into link from public.scheduling_links where token_hash = md5(coalesce(p_token, '')) order by created_at desc limit 1;
  if not found or link.expires_at < now() then raise exception 'This scheduling link is not valid. Ask your agent to send a new one.' using errcode = 'P0001'; end if;
  select * into d from public.deals where id = link.deal_id;
  if to_regclass('public.offices') is not null then
    select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'address', btrim(concat_ws(', ', o.address_line1, nullif(o.city, '')))) order by o.sort_order), '[]'::jsonb)
      into offices from public.offices o where o.active;
  end if;
  return jsonb_build_object(
    'side', link.side, 'fileNumber', d.file_number, 'street', d.street, 'city', d.city, 'state', d.state, 'zip', d.zip,
    'closingDate', d.closing_date, 'defaultOfficeId', case when link.side = 'seller' then nullif(d.sched_seller_office_id, '') else nullif(d.sched_buyer_office_id, '') end,
    'officeHint', hint, 'offices', offices,
    'answers', case when link.side = 'seller' then jsonb_build_object('date', d.sched_seller_date, 'time', d.sched_seller_time, 'placeKind', nullif(d.sched_seller_place, ''), 'officeId', d.sched_seller_office_id, 'street', d.sched_seller_street, 'city', d.sched_seller_city, 'state', d.sched_seller_state, 'zip', d.sched_seller_zip, 'notes', d.sched_seller_notes, 'preferRon', d.sched_seller_ron)
      else jsonb_build_object('date', d.sched_buyer_date, 'time', d.sched_buyer_time, 'placeKind', nullif(d.sched_buyer_place, ''), 'officeId', d.sched_buyer_office_id, 'street', d.sched_buyer_street, 'city', d.sched_buyer_city, 'state', d.sched_buyer_state, 'zip', d.sched_buyer_zip, 'notes', d.sched_buyer_notes) end);
end $$;

create function public.submit_party_schedule(p_token text, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
declare link public.scheduling_links; saved jsonb;
begin
  select * into link from public.scheduling_links where token_hash = md5(coalesce(p_token, '')) order by created_at desc limit 1;
  if not found then raise exception 'This scheduling link is not valid. Ask your agent to send a new one.' using errcode = 'P0001'; end if;
  if link.expires_at < now() then raise exception 'This scheduling link has expired. Ask your agent to send a new one.' using errcode = 'P0001'; end if;
  saved := private.save_side_schedule(link.deal_id, coalesce(p_answers, '{}'::jsonb) || jsonb_build_object('side', link.side, 'askParty', false), 'party');
  update public.scheduling_links set used_at = now() where id = link.id;
  return jsonb_build_object('ok', true, 'side', link.side);
end $$;

create function public.scheduling_copy_links(p_deal uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
begin
  if private.effective_uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if not (private.is_admin() or private.is_staffish() or exists (
    select 1 from public.scheduling_links l where l.deal_id = p_deal and l.created_by = private.effective_uid())) then
    raise exception 'Those scheduling links are for CLA Title and the agent who asked.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('side', s.side, 'path', '#/schedule-party/' || s.token_plain, 'createdAt', s.created_at) order by s.side)
    from (
      select distinct on (side) side, token_plain, created_at from public.scheduling_links
      where deal_id = p_deal and (private.is_admin() or private.is_staffish() or created_by = private.effective_uid())
      order by side, created_at desc
    ) s), '[]'::jsonb);
end $$;

create function public.save_settlement_agent(p_deal uuid, p_name text, p_profile uuid, p_confirmed boolean) returns void
language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
declare nm text := left(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'), 120); agent_role text; has_list boolean;
begin
  if not (private.is_admin() or private.can_run_deal(p_deal)) then
    raise exception 'Only the processor can save the settlement agent.' using errcode = '42501'; end if;
  select exists (select 1 from public.profiles p where p.status = 'active' and p.role ~* 'settlement agent|closer') into has_list;
  if p_profile is not null then
    select btrim(p.first_name || ' ' || p.last_name), p.role into nm, agent_role from public.profiles p where p.id = p_profile and p.status = 'active';
    if agent_role is null or agent_role !~* 'settlement agent|closer' then raise exception 'Choose a settlement agent from the list.' using errcode = 'P0001'; end if;
  elsif has_list and nm <> '' then
    raise exception 'Choose a settlement agent from the list.' using errcode = 'P0001';
  end if;
  if coalesce(p_confirmed, false) and nm = '' then raise exception 'Enter the settlement agent before confirming.' using errcode = 'P0001'; end if;
  perform set_config('cla.schedule_rpc', 'on', true);
  update public.deals set settlement_agent_name = nm, settlement_agent_profile_id = p_profile, settlement_agent_confirmed = coalesce(p_confirmed, false) and nm <> '' where id = p_deal;
  perform set_config('cla.schedule_rpc', 'off', true);
end $$;

create function public.save_scheduling_notes(p_deal uuid, p_notes text) returns void
language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
declare notes text := btrim(coalesce(p_notes, ''));
begin
  if not (private.is_admin() or private.can_run_deal(p_deal)) then
    raise exception 'Only the processor can save scheduling notes.' using errcode = '42501'; end if;
  if char_length(notes) > 2000 then raise exception 'Processor notes can be up to 2,000 characters. Shorten the note and save again.' using errcode = 'P0001'; end if;
  perform set_config('cla.schedule_rpc', 'on', true);
  update public.deals set scheduling_processor_notes = notes where id = p_deal;
  perform set_config('cla.schedule_rpc', 'off', true);
end $$;

alter table public.outbox drop constraint if exists outbox_recipient_check;
alter table public.outbox add constraint outbox_recipient_check check (
  to_profile_id is not null
  or (title_package and char_length(to_email) > 3 and char_length(to_name) > 0)
  or (kind = 'scheduling' and char_length(to_email) > 3 and char_length(to_name) > 0));

revoke all on function public.get_party_schedule(text) from public;
revoke all on function public.submit_party_schedule(text, jsonb) from public;
revoke all on function public.scheduling_copy_links(uuid) from public;
revoke all on function public.save_settlement_agent(uuid, text, uuid, boolean) from public;
revoke all on function public.save_scheduling_notes(uuid, text) from public;
grant execute on function public.get_party_schedule(text) to anon, authenticated;
grant execute on function public.submit_party_schedule(text, jsonb) to anon, authenticated;
grant execute on function public.scheduling_copy_links(uuid) to authenticated;
grant execute on function public.save_settlement_agent(uuid, text, uuid, boolean) to authenticated;
grant execute on function public.save_scheduling_notes(uuid, text) to authenticated;

do $$
begin
  begin
    perform private.schedule_check('{"side":"buyer","askParty":false,"date":"","time":"10:00","placeKind":"office","officeId":"off-1"}'::jsonb);
    raise exception 'readback: a blank date was accepted';
  exception when others then
    if sqlerrm not like '%settlement date%' then
      if sqlerrm like '%blank date was accepted%' then raise; end if;
      raise exception 'readback: expected a date message, got %', sqlerrm;
    end if;
  end;
  if position('closing_date' in (select prosrc from pg_proc where oid = 'private.save_side_schedule(uuid,jsonb,text)'::regprocedure)) > 0 then
    raise exception 'readback: scheduling must not change the file closing date'; end if;
  if not exists (select 1 from private.agent_task_defs() where code = 'agent_schedule_settlement') then
    raise exception 'readback: the scheduling task was not added'; end if;
end $$;

commit;
