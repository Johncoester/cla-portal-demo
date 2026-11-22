-- Task Builder TB-7, Nov 20 2026 (John): "Send an email" steps and the "File closed" trigger. Spec: docs/specs/task-builder.md "TB-7".
-- Needs 20261121010000_task_flow_engine.sql, 20261122010000_task_flow_try_and_scope.sql and 20261126010000_task_flow_client_requests.sql.
-- * New step "Send an email": who it goes to (buyer, seller, buyer's agent, listing agent, TC, lender) and either a saved file email
--   template (Admin > Email Templates: public.email_templates, shared and active) or a subject and message written on the step. Both use
--   the file template merge fields ({{buyer_first_name}}, {{property_address}} ...), filled in from the file when the email goes.
--   Example (John): File closed, wait 2 days, "Hi {{buyer_first_name}}, thank you so much for closing on {{property_address}}."
-- * New trigger "File closed": the file's status becomes Closed. A File closed flow keeps running on its closed file (other flows stop
--   when a file is no longer open). Turning one on asks nothing: it runs on files closed from now on.
-- * Emails are queued in public.outbox (kind 'task_flow_email'), from the file's processor, to everyone on the file with that role who
--   has an email address, portal account or not (outbox_recipient_check now allows this kind with an email and a name). They go out once
--   the portal's mail switch is on. Flows start Off, so nothing is queued until an Admin turns the flow on.
-- * Try on one file sends the email ONLY to the admin trying it ("[Test]" subject; it says who the real email goes to). task_flow_runs.trial_to.
-- Mirrors js/data/flow-email.js and js/data/mock-part-task-builder.js.
-- Not applied on TEST by this change. Rollback: supabase/rollbacks/20261127010000_task_flow_email_step.sql
begin;
set local lock_timeout = '3s';

do $$
begin
  if to_regclass('public.task_flow_requests') is null then raise exception 'drift: apply 20261126010000_task_flow_client_requests.sql first'; end if;
  if to_regclass('public.email_templates') is null then raise exception 'drift: email_templates is missing'; end if;
  if pg_get_constraintdef((select oid from pg_constraint where conname = 'outbox_recipient_check' and conrelid = 'public.outbox'::regclass)) is distinct from
     'CHECK (((to_profile_id IS NOT NULL) OR (title_package AND (char_length(to_email) > 3) AND (char_length(to_name) > 0)) OR ((post_closing_type IS NOT NULL) AND (char_length(to_email) > 3)) OR ((kind = ''scheduling''::text) AND (char_length(to_email) > 3) AND (char_length(to_name) > 0))))'
    then raise exception 'drift: outbox_recipient_check is not the one this file expects'; end if;
end $$;

alter table public.task_flows drop constraint if exists task_flows_trigger_check;
alter table public.task_flows add constraint task_flows_trigger_check check (trigger in ('order_opened', 'contract_received', 'emd_received', 'emd_not_received',
  'commitment_received', 'closing_date_set', 'days_before_closing', 'file_closed'));
alter table public.task_flow_runs add column if not exists trial_to uuid;   -- who tried it: a test run's email goes only to them

-- flow emails may go to a party with no portal account (a thank-you after closing), like scheduling links: an email and a name are needed
alter table public.outbox drop constraint outbox_recipient_check;
alter table public.outbox add constraint outbox_recipient_check check ((to_profile_id is not null)
  or (title_package and char_length(to_email) > 3 and char_length(to_name) > 0)
  or (post_closing_type is not null and char_length(to_email) > 3)
  or (kind = 'scheduling' and char_length(to_email) > 3 and char_length(to_name) > 0)
  or (kind = 'task_flow_email' and char_length(to_email) > 3 and char_length(to_name) > 0));

create or replace function private.task_flow_email_role(p text) returns text
language sql immutable set search_path to pg_catalog as $$
  select case p when 'Client-Buyer' then 'buyer' when 'Client-Seller' then 'seller' when 'Buyer Agent' then 'buyer''s agent' when 'Listing Agent' then 'listing agent'
    when 'Transaction Coordinator' then 'transaction coordinator' when 'Lender' then 'lender' else lower(p) end $$;

-- the file template merge fields (js/data/file-email-templates.js FILE_TEMPLATE_FIELDS)
create or replace function private.task_flow_merge_keys() returns text[]
language sql immutable set search_path to pg_catalog as $$
  select array['recipient_first_name', 'recipient_names', 'file_number', 'property_address', 'buyer_names', 'buyer_first_name', 'seller_names', 'seller_first_name',
    'closing_date', 'contract_price', 'loan_amount', 'lender', 'buyer_agent', 'buyer_agent_first_name', 'listing_agent', 'listing_agent_first_name',
    'processor_name', 'processor_email', 'processor_line', 'sender_name', 'today'] $$;

-- check one email step (same words as cleanEmailStep)
create or replace function private.task_flow_clean_email(s jsonb, i int) returns jsonb
language plpgsql immutable set search_path to pg_catalog as $$
declare v_subject text; v_body text; v_tpl text; bad text;
begin
  if coalesce(s ->> 'sendTo', '') not in ('Client-Buyer', 'Client-Seller', 'Buyer Agent', 'Listing Agent', 'Transaction Coordinator', 'Lender') then
    raise exception 'Step %: choose who the email goes to.', i using errcode = 'P0001'; end if;
  v_tpl := btrim(coalesce(s ->> 'templateId', ''));
  if v_tpl <> '' then
    if v_tpl !~ '^[A-Za-z0-9-]{1,64}$' then raise exception 'Step %: choose a saved template, or write the email.', i using errcode = 'P0001'; end if;
    return jsonb_build_object('type', 'send_email', 'sendTo', s ->> 'sendTo', 'templateId', v_tpl, 'templateName', left(btrim(coalesce(s ->> 'templateName', '')), 120));
  end if;
  v_subject := btrim(regexp_replace(coalesce(s ->> 'subject', ''), '\s+', ' ', 'g'));
  v_body := btrim(replace(coalesce(s ->> 'body', ''), E'\r\n', E'\n'));
  if length(v_subject) < 3 then raise exception 'Step %: give the email a subject (at least 3 characters), or choose a saved template.', i using errcode = 'P0001'; end if;
  if length(v_subject) > 200 then raise exception 'Step %: the subject is too long. Use 200 characters or fewer.', i using errcode = 'P0001'; end if;
  if length(v_body) < 3 then raise exception 'Step %: write the message (at least 3 characters).', i using errcode = 'P0001'; end if;
  if length(v_body) > 5000 then raise exception 'Step %: the message is too long. Use 5000 characters or fewer.', i using errcode = 'P0001'; end if;
  select k into bad from (select lower(m[1]) k from regexp_matches(v_subject || ' ' || v_body, '\{\{\s*([a-zA-Z0-9_]+)\s*\}\}', 'g') m) x
    where not (k = any (private.task_flow_merge_keys())) limit 1;
  if bad is not null then raise exception 'Step %: {{%}} is not a merge field. Use one from the list, for example {{buyer_first_name}} or {{property_address}}.', i, bad using errcode = 'P0001'; end if;
  return jsonb_build_object('type', 'send_email', 'sendTo', s ->> 'sendTo', 'subject', v_subject, 'body', v_body);
end $$;

-- a saved template's HTML as plain text (same rules as htmlToText)
create or replace function private.task_flow_html_text(h text) returns text
language sql immutable set search_path to pg_catalog as $$
  select btrim(regexp_replace(regexp_replace(
    replace(replace(replace(replace(replace(replace(
      regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(h, ''), '<\s*br\s*/?>', E'\n', 'gi'), '</(p|div|li|h[1-6])\s*>', E'\n\n', 'gi'), '<li[^>]*>', '- ', 'gi'), '<[^>]+>', '', 'g'),
      '&nbsp;', ' '), '&lt;', '<'), '&gt;', '>'), '&quot;', '"'), '&#39;', ''''), '&amp;', '&'),
    E'[ \t]+\n', E'\n', 'g'), E'\n{3,}', E'\n\n', 'g'), E' \n') $$;

-- names joined like the file templates: "A and B", "A, B, and C"
create or replace function private.task_flow_join_names(p text[]) returns text
language sql immutable set search_path to pg_catalog as $$
  select case when coalesce(cardinality(p), 0) = 0 then '' when cardinality(p) <= 2 then array_to_string(p, ' and ')
    else array_to_string(p[1:cardinality(p) - 1], ', ') || ', and ' || p[cardinality(p)] end $$;

-- the merge values for one email on one file (as mergeValues, for people; an entity buyer or seller shows the person's name)
create or replace function private.task_flow_merge_values(p_deal uuid, p_to_email text) returns jsonb
language plpgsql stable security definer set search_path to pg_catalog, public, extensions as $$
declare d public.deals; pr public.profiles; who record; ppl jsonb;
begin
  select * into d from public.deals where id = p_deal;
  select * into pr from public.profiles where id = d.processor_id;
  select coalesce(jsonb_agg(jsonb_build_object('role', dp.role,
      'first', split_part(btrim(coalesce(nullif(btrim(c.first_name), ''), c.last_name, '')), ' ', 1),
      'full', btrim(concat_ws(' ', nullif(btrim(c.first_name), ''), nullif(btrim(c.last_name), ''))),
      'email', lower(btrim(coalesce(c.email, '')))) order by dp.id), '[]')
    into ppl from public.deal_participants dp join public.contacts c on c.id = dp.contact_id where dp.deal_id = p_deal;
  select x ->> 'first' as first, x ->> 'full' as full_name into who from jsonb_array_elements(ppl) x
    where x ->> 'email' = lower(btrim(coalesce(p_to_email, ''))) and x ->> 'first' <> '' limit 1;
  return jsonb_build_object(
    'recipient_first_name', coalesce(who.first, ''), 'recipient_names', coalesce(who.full_name, ''),
    'file_number', coalesce(d.file_number, ''),
    'property_address', concat_ws(', ', nullif(btrim(d.street), ''), nullif(btrim(concat_ws(' ', nullif(btrim(d.city), ''), nullif(btrim(d.state), ''), nullif(btrim(d.zip), ''))), '')),
    'buyer_names', private.task_flow_join_names(array(select x ->> 'full' from jsonb_array_elements(ppl) x where x ->> 'role' = 'Client-Buyer' and x ->> 'full' <> '')),
    'buyer_first_name', coalesce((select x ->> 'first' from jsonb_array_elements(ppl) x where x ->> 'role' = 'Client-Buyer' and x ->> 'first' <> '' limit 1), ''),
    'seller_names', private.task_flow_join_names(array(select x ->> 'full' from jsonb_array_elements(ppl) x where x ->> 'role' = 'Client-Seller' and x ->> 'full' <> '')),
    'seller_first_name', coalesce((select x ->> 'first' from jsonb_array_elements(ppl) x where x ->> 'role' = 'Client-Seller' and x ->> 'first' <> '' limit 1), ''),
    'closing_date', coalesce(to_char(d.closing_date, 'MM/DD/YYYY'), ''),
    'contract_price', coalesce('$' || rtrim(rtrim(to_char(d.purchase_price, 'FM999,999,999,990.00'), '0'), '.'), ''),
    'loan_amount', coalesce('$' || rtrim(rtrim(to_char(d.loan_amount, 'FM999,999,999,990.00'), '0'), '.'), ''),
    'lender', coalesce(d.lender_name, ''),
    'buyer_agent', private.task_flow_join_names(array(select x ->> 'full' from jsonb_array_elements(ppl) x where x ->> 'role' = 'Buyer Agent' and x ->> 'full' <> '')),
    'buyer_agent_first_name', coalesce((select x ->> 'first' from jsonb_array_elements(ppl) x where x ->> 'role' = 'Buyer Agent' and x ->> 'first' <> '' limit 1), ''),
    'listing_agent', private.task_flow_join_names(array(select x ->> 'full' from jsonb_array_elements(ppl) x where x ->> 'role' = 'Listing Agent' and x ->> 'full' <> '')),
    'listing_agent_first_name', coalesce((select x ->> 'first' from jsonb_array_elements(ppl) x where x ->> 'role' = 'Listing Agent' and x ->> 'first' <> '' limit 1), ''),
    'processor_name', coalesce(btrim(concat_ws(' ', pr.first_name, pr.last_name)), ''),
    'processor_email', coalesce(pr.email, ''),
    'processor_line', case when pr.id is null then '' when coalesce(pr.email, '') = '' then btrim(concat_ws(' ', pr.first_name, pr.last_name))
      else btrim(concat_ws(' ', pr.first_name, pr.last_name)) || ' (' || pr.email || ')' end,
    'sender_name', coalesce(nullif(btrim(concat_ws(' ', pr.first_name, pr.last_name)), ''), 'CLA Title & Escrow'),
    'today', to_char((now() at time zone 'America/New_York')::date, 'MM/DD/YYYY'));
end $$;

-- fill in {{fields}}; an unknown or blank field becomes empty, then "Hello ," becomes "Hello there," and "()" goes (as polishMerged)
create or replace function private.task_flow_render(p_src text, p_vals jsonb) returns text
language plpgsql immutable set search_path to pg_catalog as $$
declare out text := coalesce(p_src, ''); m text[];
begin
  for m in select regexp_matches(coalesce(p_src, ''), '\{\{\s*([a-zA-Z0-9_]+)\s*\}\}', 'g') loop
    out := regexp_replace(out, '\{\{\s*' || m[1] || '\s*\}\}', replace(coalesce(p_vals ->> lower(m[1]), ''), '\', '\\'), 'g');
  end loop;
  out := regexp_replace(out, '\m(Hi|Hello)\s+,', '\1 there,', 'gi');
  out := regexp_replace(out, '\s*\(\s*\)', '', 'g');
  return regexp_replace(out, ' {2,}', ' ', 'g');
end $$;

-- queue one step's emails: everyone on the file with that role who has an email. A test run: one copy, only to the admin trying it.
create or replace function private.task_flow_send_email(r public.task_flow_runs, f public.task_flows, s jsonb) returns jsonb
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
declare v_subject text; v_body text; t public.email_templates; p record; n_people int := 0; n_mail int := 0; notes jsonb := '[]'; v jsonb;
  me public.profiles; v_list text; v_first text;
begin
  if s ? 'templateId' then
    select * into t from public.email_templates where id::text = s ->> 'templateId' and active and scope = 'shared';
    if not found then return jsonb_build_object('notes', jsonb_build_array('The "' || coalesce(nullif(s ->> 'templateName', ''), 'saved') || '" template was not found or is turned off, so no email was sent.')); end if;
    v_subject := t.subject; v_body := private.task_flow_html_text(t.body_html);
  else
    v_subject := s ->> 'subject'; v_body := s ->> 'body';
  end if;
  select count(*), string_agg(btrim(concat_ws(' ', c.first_name, c.last_name)) || ' <' || lower(btrim(c.email)) || '>', ', ') filter (where btrim(coalesce(c.email, '')) <> ''),
      min(lower(btrim(c.email))) filter (where btrim(coalesce(c.email, '')) <> '')
    into n_people, v_list, v_first
    from public.deal_participants dp join public.contacts c on c.id = dp.contact_id where dp.deal_id = r.deal_id and dp.role = s ->> 'sendTo';
  if n_people = 0 then return jsonb_build_object('notes', jsonb_build_array('No ' || private.task_flow_email_role(s ->> 'sendTo') || ' on this file, so the email was not sent.')); end if;
  if v_list is null then return jsonb_build_object('notes', jsonb_build_array('The ' || private.task_flow_email_role(s ->> 'sendTo') || ' on this file has no email address, so the email was not sent.')); end if;
  if r.trial then
    select * into me from public.profiles where id = r.trial_to;
    if me.id is null or coalesce(me.email, '') = '' then return jsonb_build_object('notes', '[]'::jsonb); end if;
    v := private.task_flow_merge_values(r.deal_id, v_first);
    insert into public.outbox (kind, to_profile_id, to_email, to_name, subject, body, deal_id, created_by, sender_type, template_key)
      values ('task_flow_email', me.id, me.email, coalesce(nullif(btrim(concat_ws(' ', me.first_name, me.last_name)), ''), me.email),
        '[Test] ' || btrim(regexp_replace(private.task_flow_render(v_subject, v), '\s+', ' ', 'g')),
        'This is a test copy from Task Builder "Try on one file". On a real run this email goes to: ' || v_list || E'.\n\n----------\n\n' || private.task_flow_render(v_body, v),
        r.deal_id, me.id, 'processor', 'task_flow_email');
    return jsonb_build_object('notes', jsonb_build_array('Test copy queued for you (' || me.email || ').'));
  end if;
  for p in select c.profile_id, lower(btrim(c.email)) as email, coalesce(nullif(btrim(concat_ws(' ', c.first_name, c.last_name)), ''), lower(btrim(c.email))) as nm
      from public.deal_participants dp join public.contacts c on c.id = dp.contact_id
      where dp.deal_id = r.deal_id and dp.role = s ->> 'sendTo' and btrim(coalesce(c.email, '')) <> '' loop
    v := private.task_flow_merge_values(r.deal_id, p.email);
    insert into public.outbox (kind, to_profile_id, to_email, to_name, subject, body, deal_id, created_by, sender_type, template_key)
      values ('task_flow_email', p.profile_id, p.email, p.nm, btrim(regexp_replace(private.task_flow_render(v_subject, v), '\s+', ' ', 'g')),
        private.task_flow_render(v_body, v), r.deal_id, null, 'processor', 'task_flow_email');
    n_mail := n_mail + 1;
  end loop;
  if n_mail < n_people then notes := notes || jsonb_build_array((n_people - n_mail) || ' ' || private.task_flow_email_role(s ->> 'sendTo') || ' on this file has no email address and was skipped.'); end if;
  return jsonb_build_object('notes', notes);
end $$;

-- ---------- replaced: trigger text, saving, steps, starting, the engine, the file events, Try on one file ----------
create or replace function private.task_flow_trigger_text(p_trigger text, p_days int) returns text
language sql immutable set search_path to pg_catalog as $$
  select case p_trigger
    when 'order_opened' then 'Order opened'
    when 'contract_received' then 'Contract received'
    when 'emd_received' then 'EMD received'
    when 'emd_not_received' then 'EMD not received, ' || p_days || case when p_days = 1 then ' day' else ' days' end || ' after the order was opened'
    when 'commitment_received' then 'Title commitment received'
    when 'closing_date_set' then 'Closing date set or changed'
    when 'file_closed' then 'File closed'
    when 'days_before_closing' then 'Days before closing, ' || p_days || case when p_days = 1 then ' day' else ' days' end || ' before the closing date'
    else 'Unknown trigger' end $$;

create or replace function public.save_task_flow(p_id uuid, p_name text, p_description text, p_trigger text, p_trigger_days int)
returns uuid
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
declare
  v_uid uuid := private.effective_uid();
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_desc text := btrim(coalesce(p_description, ''));
  v_days int := case when p_trigger in ('emd_not_received', 'days_before_closing') then p_trigger_days else null end;
  v_old public.task_flows; v_id uuid; v_changes text[] := '{}';
begin
  if not private.is_admin() then raise exception 'Only an Admin or Super admin can use Task Builder.' using errcode = '42501'; end if;
  if v_name = '' then raise exception 'Give the flow a name, for example "EMD reminder".' using errcode = 'P0001'; end if;
  if length(v_name) < 3 then raise exception 'The name is too short. Use at least 3 characters.' using errcode = 'P0001'; end if;
  if length(v_name) > 80 then raise exception 'The name is too long. Use 80 characters or fewer.' using errcode = 'P0001'; end if;
  if length(v_desc) > 500 then raise exception 'The description is too long. Use 500 characters or fewer.' using errcode = 'P0001'; end if;
  if p_trigger is null or p_trigger not in ('order_opened', 'contract_received', 'emd_received', 'emd_not_received', 'commitment_received', 'closing_date_set', 'days_before_closing', 'file_closed') then
    raise exception 'Choose what starts the flow.' using errcode = 'P0001'; end if;
  if p_trigger in ('emd_not_received', 'days_before_closing') and (v_days is null or v_days < 1 or v_days > 60) then
    raise exception 'Days must be a whole number from 1 to 60.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.task_flows f where f.id is distinct from p_id and lower(regexp_replace(btrim(f.name), '\s+', ' ', 'g')) = lower(v_name)) then
    raise exception 'Another flow already has that name. Use a different name.' using errcode = 'P0001'; end if;

  if p_id is null then
    insert into public.task_flows (name, description, trigger, trigger_days, active, created_by, updated_by)
      values (v_name, v_desc, p_trigger, v_days, false, v_uid, v_uid) returning id into v_id;
    insert into public.task_flow_log (flow_id, flow_name, action, detail, by_id)
      values (v_id, v_name, 'created', 'Starts: ' || private.task_flow_trigger_text(p_trigger, v_days) || '. Off.', v_uid);
    return v_id;
  end if;

  select * into v_old from public.task_flows where id = p_id for update;
  if not found then raise exception 'That flow was not found. Refresh the page and try again.' using errcode = 'P0001'; end if;
  if v_old.name <> v_name then v_changes := v_changes || ('name was "' || v_old.name || '"'); end if;
  if v_old.trigger <> p_trigger or v_old.trigger_days is distinct from v_days then
    v_changes := v_changes || ('starts: was ' || private.task_flow_trigger_text(v_old.trigger, v_old.trigger_days) || ', now ' || private.task_flow_trigger_text(p_trigger, v_days)); end if;
  if v_old.description <> v_desc then v_changes := v_changes || 'description changed'::text; end if;
  if cardinality(v_changes) = 0 then return p_id; end if;
  update public.task_flows set name = v_name, description = v_desc, trigger = p_trigger, trigger_days = v_days, updated_by = v_uid, updated_at = now() where id = p_id;
  insert into public.task_flow_log (flow_id, flow_name, action, detail, by_id) values (p_id, v_name, 'changed', array_to_string(v_changes, '; '), v_uid);
  return p_id;
end $$;

create or replace function private.task_flow_clean_steps(p jsonb) returns jsonb
language plpgsql immutable set search_path to pg_catalog as $$
declare s jsonb; i int := 0; out jsonb := '[]'; t text; title text; n int;
begin
  if p is null or jsonb_typeof(p) <> 'array' then return '[]'; end if;
  if jsonb_array_length(p) > 20 then raise exception 'A flow can have up to 20 steps.' using errcode = 'P0001'; end if;
  for s in select value from jsonb_array_elements(p) loop
    i := i + 1; t := s ->> 'type';
    if t in ('create_task', 'call_task') then
      title := regexp_replace(btrim(coalesce(s ->> 'title', '')), '\s+', ' ', 'g');
      if length(title) < 3 then raise exception 'Step %: give the task a name (at least 3 characters).', i using errcode = 'P0001'; end if;
      if length(title) > 120 then raise exception 'Step %: the task name is too long. Use 120 characters or fewer.', i using errcode = 'P0001'; end if;
      if coalesce(s ->> 'assignTo', '') not in ('Processor', 'Preprocessor', 'Sales Person', 'Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller', 'Transaction Coordinator', 'Lender') then
        raise exception 'Step %: choose who the task is for.', i using errcode = 'P0001'; end if;
      n := case when coalesce(s ->> 'dueDays', '') ~ '^[0-9]{1,2}$' then (s ->> 'dueDays')::int end;
      if n is null or n > 60 then raise exception 'Step %: due in must be a whole number of days from 0 to 60.', i using errcode = 'P0001'; end if;
      out := out || jsonb_build_array(jsonb_build_object('type', t, 'title', title, 'assignTo', s ->> 'assignTo', 'dueDays', n));
    elsif t = 'client_request' then
      out := out || jsonb_build_array(private.task_flow_clean_request(s, i));
    elsif t = 'send_email' then
      out := out || jsonb_build_array(private.task_flow_clean_email(s, i));
    elsif t = 'wait' then
      n := case when coalesce(s ->> 'days', '') ~ '^[0-9]{1,2}$' then (s ->> 'days')::int end;
      if n is null or n < 1 or n > 60 then raise exception 'Step %: wait must be a whole number of days from 1 to 60.', i using errcode = 'P0001'; end if;
      out := out || jsonb_build_array(jsonb_build_object('type', t, 'days', n));
    elsif t = 'stop_if_emd_received' then
      out := out || jsonb_build_array(jsonb_build_object('type', t));
    else
      raise exception 'Step %: choose what the step does.', i using errcode = 'P0001';
    end if;
  end loop;
  return out;
end $$;

create or replace function private.task_flow_can_run(p_trigger text, p_steps jsonb) returns text
language sql immutable set search_path to pg_catalog as $$
  select case
    when p_trigger not in ('order_opened', 'emd_received', 'emd_not_received', 'closing_date_set', 'days_before_closing', 'file_closed')
      then 'Flows that start on "Contract received" or "Title commitment received" can be saved but cannot be turned on yet. Those two triggers come in a later step.'
    when not exists (select 1 from jsonb_array_elements(coalesce(p_steps, '[]')) s where s ->> 'type' in ('create_task', 'call_task', 'client_request', 'send_email'))
      then 'Add at least one step that creates a task, requests a form or sends an email before turning the flow on.'
    else '' end $$;

create or replace function private.task_flow_start(p_deal uuid, p_event text) returns int
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
declare n int;
begin
  insert into public.task_flow_runs (flow_id, deal_id)
  select f.id, p_deal from public.task_flows f join public.deals d on d.id = p_deal
  where f.active and f.trigger = p_event and private.task_flow_can_run(f.trigger, f.steps) = '' and (coalesce(d.status, 'Open') = 'Open' or (p_event = 'file_closed' and d.status = 'Closed'))
    and (f.scope = 'all' or f.activated_at is null or d.created_at >= f.activated_at or f.trigger = 'file_closed')
    and (not exists (select 1 from public.task_flow_runs r where r.flow_id = f.id and r.deal_id = p_deal and not r.trial)
      or (f.trigger = 'closing_date_set' and not exists (select 1 from public.task_flow_runs r where r.flow_id = f.id and r.deal_id = p_deal and r.status = 'waiting' and not r.trial)))
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function private.task_flow_advance(p_run uuid) returns int
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
declare
  r public.task_flow_runs; f public.task_flows; d record; s jsonb; made int := 0; n int; owners uuid[]; guard int := 0;
  v_title text; v_req jsonb;
begin
  select * into r from public.task_flow_runs where id = p_run for update skip locked;
  if not found or r.status <> 'waiting' or r.next_at > now() then return 0; end if;
  select * into f from public.task_flows where id = r.flow_id;
  if not found or (not f.active and not r.trial) then return 0; end if;   -- a test run runs whether the flow is On or Off
  select * into d from public.deals where id = r.deal_id;
  if not found or not (coalesce(d.status, 'Open') = 'Open' or (f.trigger = 'file_closed' and d.status = 'Closed')) then
    update public.task_flow_runs set status = 'stopped', finished_at = now(), log = log || jsonb_build_object('at', now(), 'text', 'Stopped: the file is no longer open.') where id = p_run;
    return 0;
  end if;
  if not r.checked then
    r.checked := true;
    if not private.task_flow_matches(f.conditions, r.deal_id) then
      update public.task_flow_runs set checked = true, status = 'skipped', finished_at = now(),
        log = log || jsonb_build_object('at', now(), 'text', 'Skipped: this file does not match the flow''s conditions.') where id = p_run;
      return 0;
    end if;
  end if;
  loop
    guard := guard + 1;
    if guard > 21 or r.step_index >= jsonb_array_length(f.steps) then
      r.status := 'done'; r.finished_at := now(); r.log := r.log || jsonb_build_object('at', now(), 'text', 'Finished.'); exit;
    end if;
    s := f.steps -> r.step_index;
    r.step_index := r.step_index + 1;
    if s ->> 'type' in ('create_task', 'call_task') then
      v_title := s ->> 'title';
      -- everyone on the file with that role; for the processor, pre-processor and TC, the person set on the order when the party list has none
      with holders as (
        select p.id as pid, c.profile_id as prof from public.deal_participants p left join public.contacts c on c.id = p.contact_id
        where p.deal_id = r.deal_id and p.role = s ->> 'assignTo'),
      who as (
        select pid, prof from holders
        union all
        select null::uuid, case s ->> 'assignTo' when 'Processor' then d.processor_id when 'Preprocessor' then d.preprocessor_user_id when 'Transaction Coordinator' then d.tc_user_id end
        where not exists (select 1 from holders)
          and case s ->> 'assignTo' when 'Processor' then d.processor_id when 'Preprocessor' then d.preprocessor_user_id when 'Transaction Coordinator' then d.tc_user_id end is not null),
      ins as (
        insert into public.tasks (deal_id, title, description, assigned_role, status, due_date, due_overridden, created_by, kind, participant_id, owner_profile_id, flow_run_id)
        select r.deal_id, v_title,
          case when r.trial then 'Test run. ' else '' end || case when s ->> 'type' = 'call_task' then 'Phone call. ' else '' end || 'Added by the "' || f.name || '" flow (Task Builder).',
          s ->> 'assignTo', 'todo', current_date + (s ->> 'dueDays')::int, false, null, 'simple', who.pid, who.prof, r.id
        from who
        returning owner_profile_id)
      select count(*), array_agg(owner_profile_id) filter (where owner_profile_id is not null) into n, owners from ins;
      made := made + n;
      if n = 0 then
        r.log := r.log || jsonb_build_object('at', now(), 'text', 'No ' || (s ->> 'assignTo') || ' on this file, so "' || v_title || '" was not created.');
      else
        r.log := r.log || jsonb_build_object('at', now(), 'text', 'Step ' || r.step_index || ': ' || case when s ->> 'type' = 'call_task' then 'phone call task' else 'task' end || ' "' || v_title || '" for ' || n || ' ' || (s ->> 'assignTo'));
        if owners is not null then
          begin perform private.notify(owners, 'task', r.deal_id, 'New task: ' || v_title, '#/deals/' || r.deal_id || '/tasks');
          exception when others then null; end;
        end if;
      end if;
    elsif s ->> 'type' = 'client_request' then
      v_req := private.task_flow_make_requests(r, f, s);
      made := made + (v_req ->> 'made')::int;
      r.log := r.log || private.task_flow_request_log(r, s)
        || coalesce((select jsonb_agg(jsonb_build_object('at', now(), 'text', x)) from jsonb_array_elements_text(v_req -> 'notes') x), '[]');
    elsif s ->> 'type' = 'send_email' then
      v_req := private.task_flow_send_email(r, f, s);
      r.log := r.log || jsonb_build_array(jsonb_build_object('at', now(), 'text', 'Step ' || r.step_index || ': Email the ' || private.task_flow_email_role(s ->> 'sendTo') || ': '
          || case when s ? 'templateId' then 'the "' || coalesce(nullif(s ->> 'templateName', ''), 'saved') || '" template' else '"' || (s ->> 'subject') || '"' end
          || case when r.trial then ' (test run: sent only to you)' else '' end))
        || coalesce((select jsonb_agg(jsonb_build_object('at', now(), 'text', x)) from jsonb_array_elements_text(v_req -> 'notes') x), '[]');
    elsif s ->> 'type' = 'wait' and r.trial then
      r.log := r.log || jsonb_build_object('at', now(), 'text', 'Step ' || r.step_index || ': wait ' || (s ->> 'days') || case when (s ->> 'days')::int = 1 then ' day' else ' days' end || ' (skipped in a test run)');
    elsif s ->> 'type' = 'wait' then
      r.next_at := now() + make_interval(days => (s ->> 'days')::int);
      r.log := r.log || jsonb_build_object('at', now(), 'text', 'Step ' || r.step_index || ': waiting ' || (s ->> 'days') || case when (s ->> 'days')::int = 1 then ' day' else ' days' end);
      exit;
    elsif s ->> 'type' = 'stop_if_emd_received' then
      if coalesce(d.emd_received, false) then
        r.status := 'stopped'; r.finished_at := now(); r.log := r.log || jsonb_build_object('at', now(), 'text', 'Step ' || r.step_index || ': stopped, the EMD has been received.'); exit;
      end if;
      r.log := r.log || jsonb_build_object('at', now(), 'text', 'Step ' || r.step_index || ': EMD not received yet, going on');
    end if;
  end loop;
  update public.task_flow_runs set step_index = r.step_index, next_at = r.next_at, status = r.status, checked = r.checked, log = r.log, finished_at = r.finished_at where id = p_run;
  -- new requests go out straight away: one email per person and file (a test run emails nobody)
  if not r.trial and exists (select 1 from public.task_flow_requests q where q.run_id = p_run and q.sent = 0) then
    perform private.task_flow_send_digests(r.deal_id);
  end if;
  return made;
end $$;

create or replace function private.trg_task_flow_deal_events() returns trigger
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
begin
  begin
    if tg_op = 'INSERT' then perform private.task_flow_start(new.id, 'order_opened');
    else
      if coalesce(new.emd_received, false) and not coalesce(old.emd_received, false) then perform private.task_flow_start(new.id, 'emd_received'); end if;
      if new.closing_date is not null and new.closing_date is distinct from old.closing_date then perform private.task_flow_start(new.id, 'closing_date_set'); end if;
      if new.status = 'Closed' and old.status is distinct from 'Closed' then perform private.task_flow_start(new.id, 'file_closed'); end if;
    end if;
  exception when others then
    begin insert into public.task_flow_errors (deal_id, message) values (new.id, sqlerrm); exception when others then null; end;
  end;
  return null;
end $$;

create or replace function public.try_task_flow_on_file(p_flow uuid, p_deal uuid) returns jsonb
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
declare f public.task_flows; d record; v_run uuid; n int; r public.task_flow_runs;
begin
  if not private.is_admin() then raise exception 'Only an Admin or Super admin can use Task Builder.' using errcode = '42501'; end if;
  select * into f from public.task_flows where id = p_flow;
  if not found then raise exception 'That flow was not found. Refresh the page and try again.' using errcode = 'P0001'; end if;
  if not exists (select 1 from jsonb_array_elements(f.steps) s where s ->> 'type' in ('create_task', 'call_task', 'client_request', 'send_email')) then
    raise exception 'Add at least one step that creates a task, requests a form or sends an email before turning the flow on.' using errcode = 'P0001'; end if;
  select * into d from public.deals where id = p_deal;
  if not found then raise exception 'Choose a file to try the flow on.' using errcode = 'P0001'; end if;
  if f.trigger = 'file_closed' and coalesce(d.status, 'Open') not in ('Open', 'Closed') then raise exception 'That file is cancelled or on hold. Choose an open or closed file.' using errcode = 'P0001'; end if;
  if f.trigger <> 'file_closed' and coalesce(d.status, 'Open') <> 'Open' then raise exception 'That file is not open. Choose an open file.' using errcode = 'P0001'; end if;
  insert into public.task_flow_runs (flow_id, deal_id, trial, trial_to) values (p_flow, p_deal, true, private.effective_uid()) returning id into v_run;
  n := private.task_flow_advance(v_run);
  select * into r from public.task_flow_runs where id = v_run;
  return jsonb_build_object('run_id', v_run, 'status', r.status, 'tasks', n, 'log', r.log, 'file_number', d.file_number);
end $$;

drop trigger if exists zz_task_flow_events on public.deals;
create trigger zz_task_flow_events after insert or update of emd_received, closing_date, status on public.deals
  for each row execute function private.trg_task_flow_deal_events();

revoke all on function private.task_flow_email_role(text), private.task_flow_merge_keys(), private.task_flow_clean_email(jsonb, int), private.task_flow_html_text(text),
  private.task_flow_join_names(text[]), private.task_flow_merge_values(uuid, text), private.task_flow_render(text, jsonb),
  private.task_flow_send_email(public.task_flow_runs, public.task_flows, jsonb) from public, anon, authenticated;

commit;
