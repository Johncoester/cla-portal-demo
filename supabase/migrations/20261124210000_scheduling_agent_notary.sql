-- MF-058 (Matt Landsberg, Gemini notes "Processor User-Scheduling Details Nov 17 Feedback", confirmed Nov 17 2026, 10:30 AM ET).
-- Phone, email and a confirmed flag for the settlement agent/notary, one set on the buyer side and one on the seller side.
-- Existing column names stay. The buyer side keeps settlement_agent_name, settlement_agent_profile_id and settlement_agent_confirmed.
-- A reminder is queued in the outbox and emailed through the portal's Gmail send. This file does not write deals.closing_date.
-- The outbox recipient check is left as TEST has it, including the post-closing and scheduling conditions.
-- Rollback: supabase/rollbacks/20261124210000_scheduling_agent_notary.sql
begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public, extensions;

do $$
begin
  if to_regprocedure('private.deals_schedule_guard()') is null then
    raise exception 'drift: the scheduling guard is missing'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deals' and column_name = 'settlement_agent_name') then
    raise exception 'drift: settlement_agent_name is missing'; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deals' and column_name = 'settlement_agent_phone') then
    raise exception 'drift: settlement agent phone is already on the file'; end if;
  if to_regprocedure('public.save_side_settlement_agent(uuid,text,text,uuid,text,text,boolean)') is not null then
    raise exception 'drift: save_side_settlement_agent already exists'; end if;
end $$;

alter table public.deals
  add column settlement_agent_phone text not null default '',
  add column settlement_agent_email text not null default '',
  add column seller_settlement_agent_name text not null default '',
  add column seller_settlement_agent_profile_id uuid,
  add column seller_settlement_agent_phone text not null default '',
  add column seller_settlement_agent_email text not null default '',
  add column seller_settlement_agent_confirmed boolean not null default false;

alter table public.deals add constraint deals_sched_agent_contact check (
  char_length(settlement_agent_phone) <= 20
  and char_length(settlement_agent_email) <= 200
  and char_length(seller_settlement_agent_name) <= 120
  and char_length(seller_settlement_agent_phone) <= 20
  and char_length(seller_settlement_agent_email) <= 200
  and (settlement_agent_phone = '' or settlement_agent_phone ~ '^[0-9]{3}-[0-9]{3}-[0-9]{4}$')
  and (seller_settlement_agent_phone = '' or seller_settlement_agent_phone ~ '^[0-9]{3}-[0-9]{3}-[0-9]{4}$')
  and (settlement_agent_email = '' or settlement_agent_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
  and (seller_settlement_agent_email = '' or seller_settlement_agent_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'));

-- Same guard TEST has now, plus the new columns. A direct edit of those columns is still refused.
create or replace function private.deals_schedule_guard() returns trigger
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
     or new.settlement_agent_phone is distinct from old.settlement_agent_phone
     or new.settlement_agent_email is distinct from old.settlement_agent_email
     or new.seller_settlement_agent_name is distinct from old.seller_settlement_agent_name
     or new.seller_settlement_agent_profile_id is distinct from old.seller_settlement_agent_profile_id
     or new.seller_settlement_agent_phone is distinct from old.seller_settlement_agent_phone
     or new.seller_settlement_agent_email is distinct from old.seller_settlement_agent_email
     or new.seller_settlement_agent_confirmed is distinct from old.seller_settlement_agent_confirmed
     or new.scheduling_processor_notes is distinct from old.scheduling_processor_notes then
    raise exception 'Save scheduling from the Scheduling Details page.' using errcode = '42501';
  end if;
  return new;
end $$;

create function public.save_side_settlement_agent(p_deal uuid, p_side text, p_name text, p_profile uuid, p_phone text, p_email text, p_confirmed boolean) returns void
language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
declare
  side text := case when p_side = 'seller' then 'seller' when p_side = 'buyer' then 'buyer' else '' end;
  nm text := left(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'), 120);
  prof uuid := p_profile;
  agent_role text;
  has_list boolean;
  digits text;
  phone text;
  email text := left(btrim(coalesce(p_email, '')), 200);
begin
  if side = '' then raise exception 'Pick the buyer side or the seller side.' using errcode = 'P0001'; end if;
  if not (private.is_admin() or private.can_run_deal(p_deal)) then
    raise exception 'Only the processor can save the settlement agent/notary.' using errcode = '42501'; end if;
  digits := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if length(digits) = 11 and left(digits, 1) = '1' then digits := substr(digits, 2); end if;
  if digits = '' then phone := '';
  elsif length(digits) = 10 then phone := substr(digits, 1, 3) || '-' || substr(digits, 4, 3) || '-' || substr(digits, 7, 4);
  else raise exception 'Enter a 10-digit phone number (xxx-xxx-xxxx), or clear the phone.' using errcode = 'P0001'; end if;
  if email <> '' and email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Enter a valid email, or clear the email.' using errcode = 'P0001'; end if;
  select exists (select 1 from public.profiles p where p.status = 'active' and p.role ~* 'settlement agent|closer') into has_list;
  if prof is not null then
    select btrim(p.first_name || ' ' || p.last_name), p.role into nm, agent_role from public.profiles p where p.id = prof and p.status = 'active';
    if agent_role is null or agent_role !~* 'settlement agent|closer' then raise exception 'Choose a settlement agent/notary from the list.' using errcode = 'P0001'; end if;
  elsif has_list and nm <> '' then
    raise exception 'Choose a settlement agent/notary from the list.' using errcode = 'P0001';
  else prof := null; end if;
  if coalesce(p_confirmed, false) and nm = '' then raise exception 'Enter the settlement agent/notary before confirming.' using errcode = 'P0001'; end if;
  perform set_config('cla.schedule_rpc', 'on', true);
  if side = 'buyer' then
    update public.deals set settlement_agent_name = nm, settlement_agent_profile_id = prof, settlement_agent_phone = phone,
      settlement_agent_email = email, settlement_agent_confirmed = coalesce(p_confirmed, false) and nm <> ''
      where id = p_deal;
  else
    update public.deals set seller_settlement_agent_name = nm, seller_settlement_agent_profile_id = prof, seller_settlement_agent_phone = phone,
      seller_settlement_agent_email = email, seller_settlement_agent_confirmed = coalesce(p_confirmed, false) and nm <> ''
      where id = p_deal;
  end if;
  perform set_config('cla.schedule_rpc', 'off', true);
end $$;

-- Who a reminder goes to. Buyer side: buyers and the buyer's agent. Seller side: sellers and the listing agent.
-- Emails are read from the file. None are written into this function.
create function private.scheduling_reminder_people(p_deal uuid, p_side text) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare
  side text := case when p_side = 'seller' then 'seller' when p_side = 'buyer' then 'buyer' else '' end;
  d public.deals;
  addr text;
  when_line text;
  order_bit text;
  rec jsonb := '[]'::jsonb;
  missing jsonb := '[]'::jsonb;
  seen text[] := '{}';
  r record;
  nm text;
  em text;
  label text;
  subj text;
  body text;
begin
  if side = '' then raise exception 'Pick the buyer side or the seller side.' using errcode = 'P0001'; end if;
  select * into d from public.deals where id = p_deal;
  if not found then raise exception 'That file was not found. Open it again from the order list.' using errcode = 'P0001'; end if;
  addr := btrim(concat_ws(', ',
    nullif(btrim(coalesce(d.street, '')), ''),
    nullif(btrim(coalesce(d.city, '')), ''),
    nullif(btrim(concat_ws(' ', nullif(btrim(coalesce(d.state, '')), ''), nullif(btrim(coalesce(d.zip, '')), ''))), '')));
  if coalesce(addr, '') = '' then addr := 'the property'; end if;
  order_bit := case when coalesce(d.file_number, '') <> '' then ' (Order # ' || d.file_number || ')' else '' end;
  if side = 'seller' and d.sched_seller_date is not null then when_line := 'The seller side currently shows ' || d.sched_seller_date::text || '.';
  elsif side = 'buyer' and d.sched_buyer_date is not null then when_line := 'The buyer side currently shows ' || d.sched_buyer_date::text || '.';
  else when_line := 'The ' || side || ' side does not have a settlement date yet.'; end if;
  for r in
    select c.email, c.first_name, c.last_name, c.profile_id, p.role
    from public.deal_participants p
    join public.contacts c on c.id = p.contact_id
    where p.deal_id = p_deal
      and p.role = any (case when side = 'seller' then array['Client-Seller', 'Listing Agent'] else array['Client-Buyer', 'Buyer Agent'] end)
    order by case when p.role like 'Client-%' then 0 else 1 end, c.last_name, c.first_name
  loop
    label := case r.role when 'Client-Buyer' then 'Buyer' when 'Buyer Agent' then 'Buyer''s agent' when 'Client-Seller' then 'Seller' when 'Listing Agent' then 'Listing agent' else 'Party' end;
    nm := btrim(concat_ws(' ', nullif(btrim(coalesce(r.first_name, '')), ''), nullif(btrim(coalesce(r.last_name, '')), '')));
    if nm = '' then nm := label; end if;
    em := btrim(coalesce(r.email, ''));
    if em = '' or em !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      missing := missing || jsonb_build_array(jsonb_build_object('name', nm, 'role', r.role, 'roleLabel', label,
        'reason', case when em = '' then 'No email on Contacts.' else 'That email on Contacts is not valid. Fix it, then send again.' end));
      continue;
    end if;
    if lower(em) = any (seen) then continue; end if;
    seen := seen || lower(em);
    subj := left('Reminder: settlement for ' || addr || order_bit, 500);
    body := left('Hi ' || coalesce(nullif(btrim(r.first_name), ''), 'there') || E',\n\nThis is a reminder about the ' || side || ' settlement for ' || addr || order_bit || E'.\n\n' || when_line || E'\n\nReply to this email if the plan needs to change.\n\nCLA Title & Escrow', 4000);
    rec := rec || jsonb_build_array(jsonb_build_object('name', nm, 'email', em, 'role', r.role, 'roleLabel', label, 'profileId', r.profile_id, 'subject', subj, 'body', body));
  end loop;
  return jsonb_build_object('side', side, 'recipients', rec, 'missing', missing);
end $$;

create function public.preview_scheduling_reminder(p_deal uuid, p_side text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
begin
  if private.effective_uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if not (private.is_admin() or private.can_run_deal(p_deal)) then
    raise exception 'Only the processor can see who this reminder would email.' using errcode = '42501'; end if;
  return private.scheduling_reminder_people(p_deal, p_side);
end $$;

create function public.queue_scheduling_reminder(p_deal uuid, p_side text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
declare pack jsonb; item record;
begin
  if private.effective_uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if not (private.is_admin() or private.can_run_deal(p_deal)) then
    raise exception 'Only the processor can send this reminder.' using errcode = '42501'; end if;
  pack := private.scheduling_reminder_people(p_deal, p_side);
  if jsonb_array_length(coalesce(pack->'recipients', '[]'::jsonb)) = 0 then
    raise exception '%', case when pack->>'side' = 'seller'
      then 'Add an email for a seller or the listing agent on Contacts before sending this reminder.'
      else 'Add an email for a buyer or the buyer''s agent on Contacts before sending this reminder.' end
      using errcode = 'P0001';
  end if;
  for item in select t.value from jsonb_array_elements(pack->'recipients') as t(value)
  loop
    insert into public.outbox (channel, status, sent_at, to_profile_id, to_email, to_name, subject, body, deal_id, created_by, kind, from_email, from_name, sender_type)
    values ('email', 'queued', null, nullif(item.value->>'profileId', '')::uuid, item.value->>'email', item.value->>'name', item.value->>'subject', item.value->>'body', p_deal, private.effective_uid(), 'scheduling', 'testportal@clatitle.com', 'CLA Title Portal', 'portal');
  end loop;
  return pack;
end $$;

revoke all on function public.save_side_settlement_agent(uuid, text, text, uuid, text, text, boolean) from public;
revoke all on function public.preview_scheduling_reminder(uuid, text) from public;
revoke all on function public.queue_scheduling_reminder(uuid, text) from public;
revoke all on function private.scheduling_reminder_people(uuid, text) from public, anon, authenticated;
grant execute on function public.save_side_settlement_agent(uuid, text, text, uuid, text, text, boolean) to authenticated;
grant execute on function public.preview_scheduling_reminder(uuid, text) to authenticated;
grant execute on function public.queue_scheduling_reminder(uuid, text) to authenticated;

do $$
declare def text;
begin
  select pg_get_constraintdef(oid) into def from pg_constraint where conname = 'outbox_recipient_check';
  if def is null or def not like '%post_closing_type%' or def not like '%scheduling%' then
    raise exception 'readback: outbox_recipient_check lost a condition'; end if;
  if position('closing_date' in (select prosrc from pg_proc where oid = 'public.save_side_settlement_agent(uuid,text,text,uuid,text,text,boolean)'::regprocedure)) > 0 then
    raise exception 'readback: the settlement agent save mentions the file closing date'; end if;
  if position('update public.deals' in (select prosrc from pg_proc where oid = 'public.queue_scheduling_reminder(uuid,text)'::regprocedure)) > 0 then
    raise exception 'readback: the reminder changes the file'; end if;
end $$;

commit;
