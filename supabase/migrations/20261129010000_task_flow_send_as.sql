-- Task Builder, Nov 22 2026 (John, by voice): an email step can be sent as a named staff member, with that person's signature.
-- John: "Is there a way to add your signature line?... What about my signature?... let's do that" (send as him, with his signature).
-- * step.from: a staff profile id; blank = the file's processor (as before). The outbox row then carries sender_type 'other',
--   sender_profile_id, from_email and from_name, which the outbox_sender trigger leaves as they are. A person no longer active (or with no
--   email) falls back to the processor, with a note in the run's history. {{sender_name}} fills in with that person.
-- * step.signature: adds the sender's signature under the message: their portal signature (mail_accounts.signature_html, Profile > Gmail),
--   else their CRM signature (crm_user_signatures), else name / CLA Title & Escrow / email · phone.
-- * Emails still wait in the outbox like every portal email; they go out once the portal's mail switch is on.
-- Needs 20261128010000_task_flow_non_referring_agents.sql (applied on TEST Nov 21). Replaces two functions; adds one helper.
-- Not applied on TEST by this change. Rollback: supabase/rollbacks/20261129010000_task_flow_send_as.sql
begin;
set local lock_timeout = '3s';

do $$
begin
  if to_regprocedure('private.task_flow_is_recipient(uuid, text, uuid, text)') is null then
    raise exception 'drift: apply 20261128010000_task_flow_non_referring_agents.sql first'; end if;
end $$;

create or replace function private.task_flow_clean_sender(s jsonb, i int) returns jsonb
language plpgsql immutable set search_path to pg_catalog as $$
declare v_from text := btrim(coalesce(s ->> 'from', '')); out jsonb := '{}';
begin
  if v_from <> '' then
    if v_from !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Step %: choose who the email is from.', i using errcode = 'P0001'; end if;
    out := out || jsonb_build_object('from', v_from);
  end if;
  if coalesce(s ->> 'signature', '') in ('true', 'on') then out := out || jsonb_build_object('signature', true); end if;
  return out;
end $$;

create or replace function private.task_flow_clean_email(s jsonb, i int) returns jsonb
language plpgsql immutable set search_path to pg_catalog as $$
declare v_subject text; v_body text; v_tpl text; bad text;
begin
  if coalesce(s ->> 'sendTo', '') not in ('Client-Buyer', 'Client-Seller', 'Buyer Agent', 'Listing Agent', 'non_referring_agents', 'Transaction Coordinator', 'Lender') then
    raise exception 'Step %: choose who the email goes to.', i using errcode = 'P0001'; end if;
  v_tpl := btrim(coalesce(s ->> 'templateId', ''));
  if v_tpl <> '' then
    if v_tpl !~ '^[A-Za-z0-9-]{1,64}$' then raise exception 'Step %: choose a saved template, or write the email.', i using errcode = 'P0001'; end if;
    return jsonb_build_object('type', 'send_email', 'sendTo', s ->> 'sendTo', 'templateId', v_tpl, 'templateName', left(btrim(coalesce(s ->> 'templateName', '')), 120)) || private.task_flow_clean_sender(s, i);
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
  return jsonb_build_object('type', 'send_email', 'sendTo', s ->> 'sendTo', 'subject', v_subject, 'body', v_body) || private.task_flow_clean_sender(s, i);
end $$;

create or replace function private.task_flow_send_email(r public.task_flow_runs, f public.task_flows, s jsonb) returns jsonb
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
declare v_subject text; v_body text; t public.email_templates; p record; n_people int := 0; n_mail int := 0; notes jsonb := '[]'; v jsonb;
  me public.profiles; v_list text; v_first text;
  v_from public.profiles; v_signer public.profiles; v_sig text := ''; v_signer_name text := ''; v_type text := 'processor';
begin
  -- who it is from (John, Nov 22): a named staff member, else the file's processor; and their signature when the step asks for it
  if coalesce(s ->> 'from', '') ~ '^[0-9a-f-]{36}$' then
    select * into v_from from public.profiles where id = (s ->> 'from')::uuid and coalesce(status, 'active') = 'active' and btrim(coalesce(email, '')) <> '';
    if v_from.id is null then notes := notes || jsonb_build_array('The person this email is from is no longer an active staff member with an email, so it goes from the file''s processor.'); end if;
  end if;
  if v_from.id is not null then v_signer := v_from; v_type := 'other';
  else select pr.* into v_signer from public.deals d join public.profiles pr on pr.id = d.processor_id where d.id = r.deal_id; end if;
  v_signer_name := btrim(concat_ws(' ', v_signer.first_name, v_signer.last_name));
  if coalesce(s ->> 'signature', '') = 'true' and v_signer.id is not null then
    v_sig := coalesce(nullif(private.task_flow_html_text((select signature_html from public.mail_accounts where profile_id = v_signer.id)), ''),
      nullif(private.task_flow_html_text((select html from public.crm_user_signatures where user_id = v_signer.id)), ''),
      concat_ws(E'\n', nullif(v_signer_name, ''), 'CLA Title & Escrow', nullif(concat_ws(' · ', nullif(btrim(coalesce(v_signer.email, '')), ''), nullif(btrim(coalesce(v_signer.phone, '')), '')), '')));
  end if;
  if s ? 'templateId' then
    select * into t from public.email_templates where id::text = s ->> 'templateId' and active and scope = 'shared';
    if not found then return jsonb_build_object('notes', notes || jsonb_build_array('The "' || coalesce(nullif(s ->> 'templateName', ''), 'saved') || '" template was not found or is turned off, so no email was sent.')); end if;
    v_subject := t.subject; v_body := private.task_flow_html_text(t.body_html);
  else
    v_subject := s ->> 'subject'; v_body := s ->> 'body';
  end if;
  select count(*), string_agg(btrim(concat_ws(' ', c.first_name, c.last_name)) || ' <' || lower(btrim(c.email)) || '>', ', ') filter (where btrim(coalesce(c.email, '')) <> ''),
      min(lower(btrim(c.email))) filter (where btrim(coalesce(c.email, '')) <> '')
    into n_people, v_list, v_first
    from public.deal_participants dp join public.contacts c on c.id = dp.contact_id where dp.deal_id = r.deal_id and private.task_flow_is_recipient(r.deal_id, dp.role, dp.contact_id, s ->> 'sendTo');
  if n_people = 0 then return jsonb_build_object('notes', notes || jsonb_build_array('No ' || private.task_flow_email_role(s ->> 'sendTo') || ' on this file, so the email was not sent.')); end if;
  if v_list is null then return jsonb_build_object('notes', notes || jsonb_build_array('The ' || private.task_flow_email_role(s ->> 'sendTo') || ' on this file has no email address, so the email was not sent.')); end if;
  if r.trial then
    select * into me from public.profiles where id = r.trial_to;
    if me.id is null or coalesce(me.email, '') = '' then return jsonb_build_object('notes', '[]'::jsonb); end if;
    v := private.task_flow_merge_values(r.deal_id, v_first);
    if v_from.id is not null then v := v || jsonb_build_object('sender_name', v_signer_name); end if;
    insert into public.outbox (kind, to_profile_id, to_email, to_name, subject, body, deal_id, created_by, sender_type, template_key, sender_profile_id, from_email, from_name)
      values ('task_flow_email', me.id, me.email, coalesce(nullif(btrim(concat_ws(' ', me.first_name, me.last_name)), ''), me.email),
        '[Test] ' || btrim(regexp_replace(private.task_flow_render(v_subject, v), '\s+', ' ', 'g')),
        'This is a test copy from Task Builder "Try on one file". On a real run this email goes to: ' || v_list || E'.\n\n----------\n\n'
          || rtrim(private.task_flow_render(v_body, v)) || case when v_sig <> '' then E'\n\n' || v_sig else '' end,
        r.deal_id, me.id, v_type, 'task_flow_email', v_from.id, coalesce(lower(btrim(v_from.email)), ''), coalesce(case when v_from.id is not null then v_signer_name end, ''));
    return jsonb_build_object('notes', notes || jsonb_build_array('Test copy queued for you (' || me.email || ')' || case when v_from.id is not null then ', from ' || v_signer_name else '' end || '.'));
  end if;
  for p in select c.profile_id, lower(btrim(c.email)) as email, coalesce(nullif(btrim(concat_ws(' ', c.first_name, c.last_name)), ''), lower(btrim(c.email))) as nm
      from public.deal_participants dp join public.contacts c on c.id = dp.contact_id
      where dp.deal_id = r.deal_id and private.task_flow_is_recipient(r.deal_id, dp.role, dp.contact_id, s ->> 'sendTo') and btrim(coalesce(c.email, '')) <> '' loop
    v := private.task_flow_merge_values(r.deal_id, p.email);
    if v_from.id is not null then v := v || jsonb_build_object('sender_name', v_signer_name); end if;
    insert into public.outbox (kind, to_profile_id, to_email, to_name, subject, body, deal_id, created_by, sender_type, template_key, sender_profile_id, from_email, from_name)
      values ('task_flow_email', p.profile_id, p.email, p.nm, btrim(regexp_replace(private.task_flow_render(v_subject, v), '\s+', ' ', 'g')),
        rtrim(private.task_flow_render(v_body, v)) || case when v_sig <> '' then E'\n\n' || v_sig else '' end, r.deal_id, null, v_type, 'task_flow_email',
        v_from.id, coalesce(lower(btrim(v_from.email)), ''), coalesce(case when v_from.id is not null then v_signer_name end, ''));
    n_mail := n_mail + 1;
  end loop;
  if n_mail < n_people then notes := notes || jsonb_build_array((n_people - n_mail) || ' ' || private.task_flow_email_role(s ->> 'sendTo') || ' on this file has no email address and was skipped.'); end if;
  return jsonb_build_object('notes', notes);
end $$;

revoke all on function private.task_flow_clean_sender(jsonb, int), private.task_flow_clean_email(jsonb, int),
  private.task_flow_send_email(public.task_flow_runs, public.task_flows, jsonb) from public, anon, authenticated;

commit;
