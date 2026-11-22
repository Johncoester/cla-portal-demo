-- Rollback for 20261128010000_task_flow_non_referring_agents.sql. NOT APPLIED by this file.
-- Puts the email step functions back as 20261127010000_task_flow_email_step.sql left them. Saved flows with an email step to the
-- non-referring agents are taken out of their flows' steps first (the old check would refuse them), and those flows are turned Off.
begin;
set local lock_timeout = '3s';

update public.task_flows set active = false, updated_at = now()
  where steps @> '[{"sendTo": "non_referring_agents"}]' and active;
update public.task_flows set steps = coalesce((select jsonb_agg(x) from jsonb_array_elements(steps) x where x ->> 'sendTo' is distinct from 'non_referring_agents'), '[]'::jsonb)
  where steps @> '[{"sendTo": "non_referring_agents"}]';

create or replace function private.task_flow_email_role(p text) returns text
language sql immutable set search_path to pg_catalog as $$
  select case p when 'Client-Buyer' then 'buyer' when 'Client-Seller' then 'seller' when 'Buyer Agent' then 'buyer''s agent' when 'Listing Agent' then 'listing agent'
    when 'Transaction Coordinator' then 'transaction coordinator' when 'Lender' then 'lender' else lower(p) end $$;

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

drop function if exists private.task_flow_is_recipient(uuid, text, uuid, text);
revoke all on function private.task_flow_email_role(text), private.task_flow_clean_email(jsonb, int),
  private.task_flow_send_email(public.task_flow_runs, public.task_flows, jsonb) from public, anon, authenticated;

commit;
