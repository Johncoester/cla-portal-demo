-- Task Builder, Nov 21 2026 (John, by voice): a "Send an email" step can go to the agents who didn't refer the file.
-- John: "if a non-referring agent is on a deal, I want to be able to introduce myself as the owner of the company... that should automatically
-- be sent." The file's Source of business (deal_business_sources.source, the referral field) says who sent the order, e.g.
-- 'buyer_agent:<contact id>'. Non-referring agents = the buyer's and listing agents on the file except that one. A source that names an
-- agent side but no person: that whole side is the referrer. Any other source (buyer, lender, a lead source, or none): every agent.
-- Same rule as emailRecipients / isNonReferringAgent in js/data/flow-email.js.
-- Needs 20261127010000_task_flow_email_step.sql (applied on TEST Nov 21). Replaces three of its functions; nothing else changes.
-- Not applied on TEST by this change. Rollback: supabase/rollbacks/20261128010000_task_flow_non_referring_agents.sql
begin;
set local lock_timeout = '3s';

do $$
begin
  if to_regprocedure('private.task_flow_send_email(public.task_flow_runs, public.task_flows, jsonb)') is null then
    raise exception 'drift: apply 20261127010000_task_flow_email_step.sql first'; end if;
  if to_regclass('public.deal_business_sources') is null then raise exception 'drift: deal_business_sources is missing'; end if;
end $$;

create or replace function private.task_flow_is_recipient(p_deal uuid, p_role text, p_contact uuid, p_send_to text) returns boolean
language plpgsql stable security definer set search_path to pg_catalog, public, extensions as $$
declare v_src text; v_code text; v_who text;
begin
  if p_send_to is distinct from 'non_referring_agents' then return p_role = p_send_to; end if;
  if p_role not in ('Buyer Agent', 'Listing Agent') then return false; end if;
  select btrim(coalesce(source, '')) into v_src from public.deal_business_sources where deal_id = p_deal;
  v_code := split_part(coalesce(v_src, ''), ':', 1);
  v_who := case when position(':' in coalesce(v_src, '')) > 0 then split_part(v_src, ':', 2) else '' end;
  if v_code not in ('buyer_agent', 'listing_agent') then return true; end if;
  if v_who <> '' then return coalesce(p_contact::text, '') <> v_who; end if;
  return p_role <> case v_code when 'buyer_agent' then 'Buyer Agent' else 'Listing Agent' end;
end $$;

create or replace function private.task_flow_email_role(p text) returns text
language sql immutable set search_path to pg_catalog as $$
  select case p when 'Client-Buyer' then 'buyer' when 'Client-Seller' then 'seller' when 'Buyer Agent' then 'buyer''s agent' when 'Listing Agent' then 'listing agent'
    when 'Transaction Coordinator' then 'transaction coordinator' when 'Lender' then 'lender' when 'non_referring_agents' then 'non-referring agent' else lower(p) end $$;

create or replace function private.task_flow_clean_email(s jsonb, i int) returns jsonb
language plpgsql immutable set search_path to pg_catalog as $$
declare v_subject text; v_body text; v_tpl text; bad text;
begin
  if coalesce(s ->> 'sendTo', '') not in ('Client-Buyer', 'Client-Seller', 'Buyer Agent', 'Listing Agent', 'non_referring_agents', 'Transaction Coordinator', 'Lender') then
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
    from public.deal_participants dp join public.contacts c on c.id = dp.contact_id where dp.deal_id = r.deal_id and private.task_flow_is_recipient(r.deal_id, dp.role, dp.contact_id, s ->> 'sendTo');
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
      where dp.deal_id = r.deal_id and private.task_flow_is_recipient(r.deal_id, dp.role, dp.contact_id, s ->> 'sendTo') and btrim(coalesce(c.email, '')) <> '' loop
    v := private.task_flow_merge_values(r.deal_id, p.email);
    insert into public.outbox (kind, to_profile_id, to_email, to_name, subject, body, deal_id, created_by, sender_type, template_key)
      values ('task_flow_email', p.profile_id, p.email, p.nm, btrim(regexp_replace(private.task_flow_render(v_subject, v), '\s+', ' ', 'g')),
        private.task_flow_render(v_body, v), r.deal_id, null, 'processor', 'task_flow_email');
    n_mail := n_mail + 1;
  end loop;
  if n_mail < n_people then notes := notes || jsonb_build_array((n_people - n_mail) || ' ' || private.task_flow_email_role(s ->> 'sendTo') || ' on this file has no email address and was skipped.'); end if;
  return jsonb_build_object('notes', notes);
end $$;

revoke all on function private.task_flow_is_recipient(uuid, text, uuid, text), private.task_flow_email_role(text), private.task_flow_clean_email(jsonb, int),
  private.task_flow_send_email(public.task_flow_runs, public.task_flows, jsonb) from public, anon, authenticated;

commit;
