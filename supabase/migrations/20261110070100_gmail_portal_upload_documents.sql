-- MF-004 follow-up: a file added from the computer while composing a portal email is already a
-- document (CLA staff only). This stamps it with the same key Gmail sync uses for that sent
-- message, so the sync does not insert a second copy. Documents picked from the file are only
-- referenced. They are not inserted again.
-- Runs after 20261110070000_gmail_attachment_documents.sql. Not applied by this change.
-- Rollback: supabase/rollbacks/20261110070100_gmail_portal_upload_documents.sql
begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public, extensions;

do $$
declare src text;
begin
  if to_regprocedure('public.gmail_svc_record(jsonb)') is null then
    raise exception 'drift: public.gmail_svc_record(jsonb) is missing'; end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'documents' and column_name = 'email_attachment_key'
  ) then raise exception 'drift: documents.email_attachment_key is missing (apply 20261110070000 first)'; end if;
  select prosrc into src from pg_proc where oid = 'public.gmail_svc_record(jsonb)'::regprocedure;
  if position('keyed_documents' in src) > 0 then raise exception 'drift: portal upload keys are already recorded'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.documents'::regclass) then
    raise exception 'drift: documents RLS is off'; end if;
end $$;

create or replace function public.gmail_svc_record(p jsonb) returns uuid
language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
declare v_id uuid; v_existing uuid; v_deal uuid := (p->>'deal_id')::uuid; v_box uuid := nullif(p->>'mailbox_profile_id', '')::uuid; v_email text := lower(p->>'mailbox_email');
  v_dir text := p->>'direction'; v_docs uuid[] := '{}'; d jsonb; v_file text; v_subject text := left(coalesce(p->>'subject', ''), 500);
  v_key text; v_doc uuid; v_linked uuid[];
begin
  if v_dir not in ('out', 'in') then raise exception 'bad direction' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.deals x where x.id = v_deal) then raise exception 'unknown file' using errcode = 'P0001'; end if;
  select e.id into v_existing from public.deal_emails e where e.mailbox_email = v_email and e.gmail_message_id = p->>'gmail_message_id';
  if v_existing is not null then
    select e.attachment_document_ids into v_linked from public.deal_emails e where e.id = v_existing;
  end if;
  v_linked := coalesce(v_linked, '{}');
  -- Inbound replies and mail sent from Gmail. A file already linked on this same message is not saved again.
  if coalesce(p->>'source', '') is distinct from 'portal' and v_box is not null then
    for d in select * from jsonb_array_elements(coalesce(p->'documents', '[]'::jsonb)) loop
      v_key := left(coalesce(nullif(d->>'key', ''), nullif(p->>'gmail_message_id', '') || ':' || coalesce(d->>'name', 'attachment')), 200);
      if v_key is null or v_key = '' or nullif(d->>'name', '') is null or nullif(d->>'path', '') is null then continue; end if;
      if v_existing is not null and exists (
        select 1 from public.documents already
        where already.deal_id = v_deal and already.id = any (v_linked) and already.name = left(d->>'name', 300)
      ) then continue; end if;
      insert into public.documents (id, deal_id, name, description, mime_type, size_bytes, storage_path, visibility, uploaded_by, doc_type, email_attachment_key)
        values ((d->>'id')::uuid, v_deal, left(d->>'name', 300), left('Email attachment: ' || v_subject, 500),
                coalesce(nullif(d->>'mime', ''), 'application/octet-stream'), greatest(coalesce((d->>'size')::bigint, 0), 0),
                d->>'path', 'staff', v_box, '', v_key)
        on conflict (deal_id, email_attachment_key) where email_attachment_key is not null do nothing;
      select doc.id into v_doc from public.documents doc where doc.deal_id = v_deal and doc.email_attachment_key = v_key;
      if v_doc is not null and not v_docs @> array[v_doc] then v_docs := v_docs || v_doc; end if;
    end loop;
  end if;
  -- Computer uploads were saved by the portal before send (staff only). Stamp the sync key. Do not insert another row.
  if v_box is not null then
    for d in select * from jsonb_array_elements(coalesce(p->'keyed_documents', '[]'::jsonb)) loop
      v_key := left(nullif(d->>'key', ''), 200);
      if v_key is null or v_key = '' or nullif(d->>'id', '') is null then continue; end if;
      begin
        v_doc := (d->>'id')::uuid;
      exception when invalid_text_representation then
        continue;
      end;
      update public.documents doc
        set email_attachment_key = v_key
        where doc.id = v_doc
          and doc.deal_id = v_deal
          and doc.visibility = 'staff'
          and doc.uploaded_by = v_box
          and (doc.email_attachment_key is null or doc.email_attachment_key = v_key)
          and not exists (
            select 1 from public.documents other
            where other.deal_id = v_deal and other.email_attachment_key = v_key and other.id <> doc.id);
    end loop;
  end if;
  if v_existing is not null then
    if cardinality(v_docs) > 0 then
      update public.deal_emails e
        set attachment_document_ids = (
          select coalesce(array_agg(distinct x), '{}') from unnest(e.attachment_document_ids || v_docs) as x)
        where e.id = v_existing;
    end if;
    return v_existing;
  end if;
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

do $$
declare src text;
begin
  select prosrc into src from pg_proc where oid = 'public.gmail_svc_record(jsonb)'::regprocedure;
  if src is null or position('keyed_documents' in src) = 0 or position('''staff''' in src) = 0 then
    raise exception 'readback: portal upload keys were not added'; end if;
  if position('is distinct from ''portal''' in src) = 0 then
    raise exception 'readback: picked documents would be inserted on a portal send'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.documents'::regclass) then
    raise exception 'readback: documents RLS is off'; end if;
end $$;

commit;
