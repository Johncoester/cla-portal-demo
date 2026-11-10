-- Exact rollback of 20261110070000_gmail_attachment_documents.sql.
-- Restores gmail_svc_record to the phase-1 body, then drops the attachment key.
-- Documents already saved from email stay. They cannot be deleted.
begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public, extensions;

do $$
begin
  if to_regprocedure('public.gmail_svc_record(jsonb)') is null then
    raise exception 'drift: public.gmail_svc_record(jsonb) is missing'; end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'documents' and column_name = 'email_attachment_key'
  ) then raise exception 'drift: documents.email_attachment_key is not present'; end if;
end $$;

create or replace function public.gmail_svc_record(p jsonb) returns uuid
language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
declare v_id uuid; v_deal uuid := (p->>'deal_id')::uuid; v_box uuid := nullif(p->>'mailbox_profile_id', '')::uuid; v_email text := lower(p->>'mailbox_email');
  v_dir text := p->>'direction'; v_docs uuid[] := '{}'; d jsonb; v_file text; v_subject text := left(coalesce(p->>'subject', ''), 500);
begin
  if v_dir not in ('out', 'in') then raise exception 'bad direction' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.deals x where x.id = v_deal) then raise exception 'unknown file' using errcode = 'P0001'; end if;
  if exists (select 1 from public.deal_emails e where e.mailbox_email = v_email and e.gmail_message_id = p->>'gmail_message_id') then return null; end if;
  for d in select * from jsonb_array_elements(coalesce(p->'documents', '[]'::jsonb)) loop
    insert into public.documents (id, deal_id, name, description, mime_type, size_bytes, storage_path, visibility, uploaded_by, doc_type)
      values ((d->>'id')::uuid, v_deal, d->>'name', left('Email attachment: ' || v_subject, 500), coalesce(d->>'mime', 'application/octet-stream'),
              coalesce((d->>'size')::bigint, 0), d->>'path', 'staff', v_box, '');
    v_docs := v_docs || (d->>'id')::uuid;
  end loop;
  insert into public.deal_emails (deal_id, mailbox_profile_id, mailbox_email, direction, gmail_message_id, gmail_thread_id, rfc_message_id, from_email, from_name,
      to_emails, cc_emails, bcc_emails, subject, body_html, snippet, sent_at, attachment_document_ids, attachment_names, template_key, sent_by)
    values (v_deal, v_box, v_email, v_dir, p->>'gmail_message_id', p->>'gmail_thread_id', nullif(p->>'rfc_message_id', ''), coalesce(p->>'from_email', ''), left(coalesce(p->>'from_name', ''), 200),
      coalesce(array(select jsonb_array_elements_text(p->'to_emails')), '{}'), coalesce(array(select jsonb_array_elements_text(p->'cc_emails')), '{}'),
      coalesce(array(select jsonb_array_elements_text(p->'bcc_emails')), '{}'), v_subject, left(coalesce(p->>'body_html', ''), 400000), left(coalesce(p->>'snippet', ''), 300),
      coalesce((p->>'sent_at')::timestamptz, now()),
      coalesce(array(select jsonb_array_elements_text(p->'attachment_document_ids'))::uuid[], '{}') || v_docs,
      coalesce(array(select jsonb_array_elements_text(p->'attachment_names')), '{}'), nullif(p->>'template_key', ''), nullif(p->>'sent_by', '')::uuid)
    returning id into v_id;
  insert into private.mail_threads (mailbox_email, gmail_thread_id, deal_id, mailbox_profile_id)
    values (v_email, p->>'gmail_thread_id', v_deal, v_box) on conflict do nothing;
  select coalesce(nullif(x.file_number, ''), 'a file') into v_file from public.deals x where x.id = v_deal;
  insert into public.activity_log (deal_id, actor_id, action, entity, entity_id, detail)
    values (v_deal, coalesce(nullif(p->>'sent_by', '')::uuid, v_box), case when p->>'source' = 'portal' then 'mail.sent' when v_dir = 'out' then 'mail.sent_in_gmail' else 'mail.received' end, 'email', v_id,
      left(case when v_dir = 'in' then 'Email received from ' || coalesce(p->>'from_email', '') else 'Email sent from ' || v_email || ' to ' || array_to_string(coalesce(array(select jsonb_array_elements_text(p->'to_emails')), '{}'), ', ') end
        || ': ' || v_subject, 300));
  if v_dir = 'in' and v_box is not null then
    insert into public.notifications (profile_id, kind, deal_id, title, link)
      select v_box, 'email', v_deal, left('Email reply on ' || v_file || ': ' || v_subject, 200), '#/deals/' || v_deal::text || '/email'
      from public.profiles pr where pr.id = v_box and pr.status = 'active';
  end if;
  return v_id;
end $$;

drop index public.documents_email_attachment_key_uq;
alter table public.documents drop column email_attachment_key;

do $$
declare src text;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'documents' and column_name = 'email_attachment_key'
  ) then raise exception 'readback: email_attachment_key still present'; end if;
  select prosrc into src from pg_proc where oid = 'public.gmail_svc_record(jsonb)'::regprocedure;
  if src is null or position('email_attachment_key' in src) > 0 then
    raise exception 'readback: gmail_svc_record still mentions the attachment key'; end if;
  if position('''staff''' in src) = 0 then raise exception 'readback: staff visibility missing from the restored function'; end if;
end $$;

commit;
