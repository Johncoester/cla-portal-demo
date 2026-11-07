-- Staff portal feedback (CLA Portal Live Test only).
-- Project: aqcervntopidtcazcmlv. Do not run on production. This file is not applied by the commit.
--
-- What it stores: a staff report, its thread, screenshot metadata, and an outbox row.
-- Buyers, sellers, agents, and employees are refused. A report is visible to its reporter and to
-- an active Admin or Super admin in the same demo world. Status changes only in
-- staff_feedback_set_status. Message text cannot change status, send mail, or publish code.
--
-- Webhook (not called from the browser, and not enabled here):
--   event cla.feedback.created, version 1, event_id, feedback_id, conversation_id.
--   No report text, attachments, PII, callback, project id, or SQL in that body.
--   HTTP 200 means a bot routine run started. It does not mean read, acknowledged, or replied.
--   https://cursor.com/help/grok-bot/routines.md
--   URL and Bearer key are backend secrets, unset until a parent copies them from the routine panel.
--
-- Deployment (manual, TEST SQL editor, after review):
--   1. Confirm the sha256 file next to this migration.
--   2. Run this file on aqcervntopidtcazcmlv only.
--   3. Do not deploy supabase/functions/staff-feedback-dispatch.
--   4. Do not set STAFF_FEEDBACK_BRIDGE_URL, STAFF_FEEDBACK_BRIDGE_TOKEN, or
--      STAFF_FEEDBACK_DISPATCH_ENABLED until John confirms. Never put them in the repo or the browser.
--   5. Bot reads go through staff_feedback_bot_get / bot_ack / bot_draft_reply (service_role only).
--
-- Rollback: 20261107180000_staff_feedback_chat_rollback.sql

create table public.staff_feedback_reports (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null unique,
  reporter_id uuid not null,
  reporter_role text not null,
  reporter_name text not null,
  is_demo boolean not null default false,
  title text not null,
  body text not null,
  status text not null default 'open',
  delivery_state text not null default 'saved',
  delivery_reason text not null default 'bridge_unconfigured',
  page_path text,
  order_deal_id uuid,
  order_file_number text,
  idempotency_key uuid not null,
  created_event_id uuid not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_feedback_status_chk check (status in ('open', 'needs_info', 'in_review', 'draft_pending', 'in_progress', 'fixed', 'wont_fix', 'reopened')),
  constraint staff_feedback_delivery_chk check (delivery_state in ('saved', 'pending_dispatch', 'run_accepted', 'bot_acknowledged', 'replied', 'simulated')),
  constraint staff_feedback_title_len check (char_length(title) between 1 and 140),
  constraint staff_feedback_body_len check (char_length(body) between 1 and 4000),
  constraint staff_feedback_page_len check (page_path is null or char_length(page_path) <= 200),
  constraint staff_feedback_file_len check (order_file_number is null or char_length(order_file_number) <= 40)
);
create unique index staff_feedback_reports_idem_idx on public.staff_feedback_reports (reporter_id, idempotency_key);
create index staff_feedback_reports_reporter_idx on public.staff_feedback_reports (reporter_id, is_demo, created_at desc);
create index staff_feedback_reports_demo_idx on public.staff_feedback_reports (is_demo, created_at desc);

create table public.staff_feedback_messages (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.staff_feedback_reports (id),
  author_id uuid,
  author_kind text not null,
  author_name text not null,
  body text not null,
  visibility text not null default 'published',
  simulation boolean not null default false,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  published_by uuid,
  constraint staff_feedback_author_kind_chk check (author_kind in ('reporter', 'support', 'bot', 'simulation')),
  constraint staff_feedback_visibility_chk check (visibility in ('published', 'draft_pending')),
  constraint staff_feedback_message_len check (char_length(body) between 1 and 4000)
);
create unique index staff_feedback_messages_idem_idx on public.staff_feedback_messages (report_id, idempotency_key);
create index staff_feedback_messages_report_idx on public.staff_feedback_messages (report_id, created_at);

create table public.staff_feedback_attachments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.staff_feedback_reports (id),
  idempotency_key uuid not null,
  file_name text not null,
  mime_type text not null,
  size_bytes integer not null,
  storage_path text not null unique,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  constraint staff_feedback_attachment_size_chk check (size_bytes > 0 and size_bytes <= 5000000),
  constraint staff_feedback_attachment_mime_chk check (mime_type in ('image/png', 'image/jpeg', 'image/webp', 'image/gif'))
);
create unique index staff_feedback_attachments_idem_idx on public.staff_feedback_attachments (report_id, idempotency_key);
create index staff_feedback_attachments_report_idx on public.staff_feedback_attachments (report_id);

create table public.staff_feedback_outbox (
  id uuid primary key,
  report_id uuid not null references public.staff_feedback_reports (id),
  feedback_id uuid not null,
  conversation_id uuid not null,
  message_id uuid,
  event_name text not null,
  delivery_state text not null,
  dispatch_allowed boolean not null default false,
  reason text not null,
  attempt_count integer not null default 0,
  http_status integer,
  reviewed_at timestamptz,
  reviewed_by uuid,
  accepted_at timestamptz,
  acknowledged_at timestamptz,
  replied_at timestamptz,
  draft_message_id uuid,
  created_at timestamptz not null default now(),
  constraint staff_feedback_outbox_state_chk check (delivery_state in ('saved', 'pending_dispatch', 'run_accepted', 'bot_acknowledged', 'replied', 'simulated')),
  constraint staff_feedback_outbox_event_chk check (event_name in ('cla.feedback.created', 'cla.feedback.staff_reply'))
);
create unique index staff_feedback_outbox_created_idx on public.staff_feedback_outbox (report_id) where event_name = 'cla.feedback.created';
create index staff_feedback_outbox_pending_idx on public.staff_feedback_outbox (created_at) where delivery_state = 'pending_dispatch' and dispatch_allowed;
create index staff_feedback_outbox_report_idx on public.staff_feedback_outbox (report_id);

alter table public.staff_feedback_reports enable row level security;
alter table public.staff_feedback_reports force row level security;
alter table public.staff_feedback_messages enable row level security;
alter table public.staff_feedback_messages force row level security;
alter table public.staff_feedback_attachments enable row level security;
alter table public.staff_feedback_attachments force row level security;
alter table public.staff_feedback_outbox enable row level security;
alter table public.staff_feedback_outbox force row level security;

revoke all on public.staff_feedback_reports, public.staff_feedback_messages, public.staff_feedback_attachments, public.staff_feedback_outbox from public, anon, authenticated;
grant select on public.staff_feedback_reports, public.staff_feedback_messages, public.staff_feedback_attachments, public.staff_feedback_outbox to authenticated;

create or replace function private.staff_feedback_notice(p_state text, p_reason text) returns text
language sql immutable set search_path = public as $$
  select case p_state
    when 'saved' then 'Saved in the portal. Not sent to the assistant.'
    when 'pending_dispatch' then 'Saved in the portal. Pending dispatch. Not delivered.' || case p_reason
      when 'bridge_unconfigured' then ' The webhook URL and Bearer key are not configured.'
      when 'transport_error' then ' The last send failed. It was not marked delivered.'
      when 'transport_rejected' then ' The webhook did not accept it. It was not marked delivered.'
      else '' end
    when 'run_accepted' then 'The webhook returned 200. A run was started. The assistant has not read this, and this is not a reply.'
    when 'bot_acknowledged' then 'The assistant has read this report. No reply has been published.'
    when 'replied' then 'A draft reply is waiting for support review. It is not published, and this report is not marked fixed.'
    when 'simulated' then 'Test simulation. This is not the assistant and was not delivered.'
    else 'Saved in the portal. Not delivered.'
  end $$;
revoke all on function private.staff_feedback_notice(text, text) from public, anon, authenticated;

create or replace function private.staff_feedback_require(p_support boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r record;
begin
  select p.id, p.role, coalesce(p.is_admin, false) as is_admin, coalesce(p.is_demo, false) as is_demo,
         btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) as name, p.status
    into r from public.profiles p where p.id = auth.uid();
  if r.id is null then raise exception 'Please sign in.' using errcode = 'P0001'; end if;
  if r.is_demo is distinct from private.viewer_is_demo() then raise exception 'Leave demo view before sending portal feedback.' using errcode = 'P0001'; end if;
  if r.status is distinct from 'active' then raise exception 'This account cannot send portal feedback.' using errcode = 'P0001'; end if;
  if r.role not in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin') then
    raise exception 'Portal feedback is for CLA staff. Buyers, sellers, and agents use the file inbox.' using errcode = 'P0001'; end if;
  if p_support and not r.is_admin then raise exception 'Only an Admin or Super admin can change portal feedback.' using errcode = 'P0001'; end if;
  return jsonb_build_object('id', r.id, 'role', r.role, 'is_admin', r.is_admin, 'is_demo', r.is_demo, 'name', nullif(r.name, ''));
end $$;
revoke all on function private.staff_feedback_require(boolean) from public, anon, authenticated;

create or replace function private.staff_feedback_visible(p_report uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff_feedback_reports r
    join public.profiles p on p.id = auth.uid()
    where r.id = p_report
      and r.is_demo is not distinct from private.viewer_is_demo()
      and p.status = 'active'
      and p.role in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin')
      and (r.reporter_id = auth.uid() or coalesce(p.is_admin, false))
  ) $$;
revoke all on function private.staff_feedback_visible(uuid) from public, anon;
grant execute on function private.staff_feedback_visible(uuid) to authenticated;

create or replace function private.staff_feedback_payload(p_report uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare who jsonb; r public.staff_feedback_reports; support boolean;
begin
  who := private.staff_feedback_require(false);
  if not private.staff_feedback_visible(p_report) then raise exception 'Report not found.' using errcode = 'P0001'; end if;
  select * into r from public.staff_feedback_reports where id = p_report;
  support := (who->>'is_admin')::boolean and r.is_demo is not distinct from (who->>'is_demo')::boolean;
  return jsonb_build_object(
    'id', r.id, 'conversation_id', r.conversation_id, 'title', r.title, 'body', r.body, 'status', r.status,
    'delivery_state', r.delivery_state, 'delivery_reason', r.delivery_reason,
    'notice', private.staff_feedback_notice(r.delivery_state, r.delivery_reason),
    'page_path', r.page_path, 'order_deal_id', r.order_deal_id, 'order_file_number', r.order_file_number,
    'reporter_id', r.reporter_id, 'reporter_role', r.reporter_role, 'reporter_name', r.reporter_name,
    'is_demo', r.is_demo, 'created_at', r.created_at, 'updated_at', r.updated_at,
    'mine', r.reporter_id = (who->>'id')::uuid, 'can_support', support,
    'portal_saved', true, 'sent', false,
    'run_accepted', r.delivery_state in ('run_accepted', 'bot_acknowledged', 'replied'),
    'bot_read', r.delivery_state in ('bot_acknowledged', 'replied'),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'report_id', m.report_id, 'author_kind', m.author_kind, 'author_name', m.author_name, 'body', m.body, 'visibility', m.visibility, 'simulation', m.simulation, 'created_at', m.created_at) order by m.created_at) from public.staff_feedback_messages m where m.report_id = r.id and m.visibility = 'published'), '[]'::jsonb),
    'drafts', case when support then coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'body', m.body, 'author_name', m.author_name, 'visibility', m.visibility, 'created_at', m.created_at) order by m.created_at) from public.staff_feedback_messages m where m.report_id = r.id and m.visibility = 'draft_pending'), '[]'::jsonb) else '[]'::jsonb end,
    'attachments', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'file_name', a.file_name, 'mime_type', a.mime_type, 'size_bytes', a.size_bytes, 'created_at', a.created_at) order by a.created_at) from public.staff_feedback_attachments a where a.report_id = r.id), '[]'::jsonb)
  );
end $$;
revoke all on function private.staff_feedback_payload(uuid) from public, anon, authenticated;

create or replace function private.staff_feedback_clean(p_text text, p_max int, p_label text) returns text
language plpgsql immutable set search_path = public as $$
declare s text := btrim(coalesce(p_text, ''));
begin
  if s = '' then raise exception 'Enter %.', p_label using errcode = 'P0001'; end if;
  if char_length(s) > p_max then raise exception '% is too long.', p_label using errcode = 'P0001'; end if;
  if s ~ 'sb_secret|service_role|eyJ[A-Za-z0-9_-]{10,}' then raise exception 'Remove keys or session tokens before saving.' using errcode = 'P0001'; end if;
  return s;
end $$;
revoke all on function private.staff_feedback_clean(text, int, text) from public, anon, authenticated;

create or replace function public.staff_feedback_create(p_title text, p_body text, p_include_page boolean, p_page text, p_include_order boolean, p_file_number text, p_idempotency uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare who jsonb; existing uuid; title text; body text; page text; deal uuid; file_no text; n int; rid uuid; cid uuid; eid uuid; mid uuid;
begin
  who := private.staff_feedback_require(false);
  if p_idempotency is null then raise exception 'Save could not be retried safely. Reload this page.' using errcode = 'P0001'; end if;
  select id into existing from public.staff_feedback_reports where reporter_id = (who->>'id')::uuid and idempotency_key = p_idempotency;
  if existing is not null then return private.staff_feedback_payload(existing); end if;
  title := private.staff_feedback_clean(p_title, 140, 'a short title');
  body := private.staff_feedback_clean(p_body, 4000, 'what happened');
  if coalesce(p_include_page, false) then
    page := left(btrim(coalesce(p_page, '')), 200);
    if page !~ '^#/[A-Za-z0-9_./-]+$' or page ~* 'token|bearer|secret|password|apikey|api_key|eyJ' then
      raise exception 'The page note must be a portal path such as #/orders, with no query or secrets.' using errcode = 'P0001'; end if;
  end if;
  if coalesce(p_include_order, false) then
    file_no := btrim(coalesce(p_file_number, ''));
    if file_no = '' or file_no !~ '^[A-Za-z0-9-]+$' or char_length(file_no) > 40 then
      raise exception 'Enter the file number to include, or leave the order box unchecked.' using errcode = 'P0001'; end if;
    select count(*) into n from public.deals d where d.file_number = file_no and coalesce(d.is_demo, false) is not distinct from private.viewer_is_demo() and private.can_access_deal(d.id);
    if n <> 1 then raise exception 'That order is not on your account, so it was not attached.' using errcode = 'P0001'; end if;
    select d.id, d.file_number into deal, file_no from public.deals d where d.file_number = file_no and coalesce(d.is_demo, false) is not distinct from private.viewer_is_demo() and private.can_access_deal(d.id);
  end if;
  rid := gen_random_uuid(); cid := gen_random_uuid(); eid := gen_random_uuid(); mid := gen_random_uuid();
  insert into public.staff_feedback_reports (id, conversation_id, reporter_id, reporter_role, reporter_name, is_demo, title, body, status, delivery_state, delivery_reason, page_path, order_deal_id, order_file_number, idempotency_key, created_event_id)
    values (rid, cid, (who->>'id')::uuid, who->>'role', coalesce(who->>'name', 'CLA staff'), (who->>'is_demo')::boolean, title, body, 'open', 'pending_dispatch', 'bridge_unconfigured', page, deal, file_no, p_idempotency, eid);
  insert into public.staff_feedback_messages (id, report_id, author_id, author_kind, author_name, body, visibility, idempotency_key)
    values (mid, rid, (who->>'id')::uuid, 'reporter', coalesce(who->>'name', 'CLA staff'), body, 'published', p_idempotency);
  insert into public.staff_feedback_outbox (id, report_id, feedback_id, conversation_id, event_name, delivery_state, dispatch_allowed, reason)
    values (eid, rid, rid, cid, 'cla.feedback.created', 'pending_dispatch', true, 'bridge_unconfigured');
  return private.staff_feedback_payload(rid);
end $$;

create or replace function public.staff_feedback_reply(p_report uuid, p_body text, p_idempotency uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare who jsonb; r public.staff_feedback_reports; body text; mid uuid; eid uuid; kind text;
begin
  who := private.staff_feedback_require(false);
  if p_idempotency is null or not private.staff_feedback_visible(p_report) then raise exception 'Report not found.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.staff_feedback_messages m where m.report_id = p_report and m.idempotency_key = p_idempotency) then return private.staff_feedback_payload(p_report); end if;
  select * into r from public.staff_feedback_reports where id = p_report;
  body := private.staff_feedback_clean(p_body, 4000, 'a reply');
  kind := case when (who->>'is_admin')::boolean and (who->>'id')::uuid <> r.reporter_id then 'support' else 'reporter' end;
  mid := gen_random_uuid(); eid := gen_random_uuid();
  insert into public.staff_feedback_messages (id, report_id, author_id, author_kind, author_name, body, visibility, idempotency_key)
    values (mid, r.id, (who->>'id')::uuid, kind, coalesce(who->>'name', 'CLA staff'), body, 'published', p_idempotency);
  insert into public.staff_feedback_outbox (id, report_id, feedback_id, conversation_id, message_id, event_name, delivery_state, dispatch_allowed, reason)
    values (eid, r.id, r.id, r.conversation_id, mid, 'cla.feedback.staff_reply', 'saved', false, 'staff_reply_held');
  update public.staff_feedback_reports set updated_at = now() where id = r.id;
  return private.staff_feedback_payload(r.id);
end $$;

create or replace function public.staff_feedback_set_status(p_report uuid, p_status text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare who jsonb;
begin
  who := private.staff_feedback_require(true);
  if not private.staff_feedback_visible(p_report) then raise exception 'Report not found.' using errcode = 'P0001'; end if;
  if p_status not in ('open', 'needs_info', 'in_review', 'draft_pending', 'in_progress', 'fixed', 'wont_fix', 'reopened') then
    raise exception 'Choose a status from the list.' using errcode = 'P0001'; end if;
  update public.staff_feedback_reports set status = p_status, updated_at = now() where id = p_report;
  return private.staff_feedback_payload(p_report);
end $$;

create or replace function public.staff_feedback_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare who jsonb;
begin
  who := private.staff_feedback_require(false);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'conversation_id', r.conversation_id, 'title', r.title, 'status', r.status,
      'delivery_state', r.delivery_state, 'delivery_reason', r.delivery_reason,
      'notice', private.staff_feedback_notice(r.delivery_state, r.delivery_reason),
      'reporter_name', r.reporter_name, 'mine', r.reporter_id = (who->>'id')::uuid,
      'can_support', (who->>'is_admin')::boolean, 'created_at', r.created_at,
      'portal_saved', true, 'sent', false,
      'run_accepted', r.delivery_state in ('run_accepted', 'bot_acknowledged', 'replied'),
      'bot_read', r.delivery_state in ('bot_acknowledged', 'replied')) order by r.created_at desc)
    from public.staff_feedback_reports r where private.staff_feedback_visible(r.id)
  ), '[]'::jsonb);
end $$;

create or replace function public.staff_feedback_get(p_report uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select private.staff_feedback_payload(p_report) $$;

create or replace function public.staff_feedback_add_attachment(p_report uuid, p_message uuid, p_name text, p_mime text, p_size integer, p_path text, p_idempotency uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare who jsonb; n int;
begin
  who := private.staff_feedback_require(false);
  if p_idempotency is null or not private.staff_feedback_visible(p_report) then raise exception 'Report not found.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.staff_feedback_attachments a where a.report_id = p_report and a.idempotency_key = p_idempotency) then return private.staff_feedback_payload(p_report); end if;
  select count(*) into n from public.staff_feedback_attachments where report_id = p_report;
  if n >= 4 then raise exception 'Four screenshots is the limit on one report.' using errcode = 'P0001'; end if;
  if p_mime not in ('image/png', 'image/jpeg', 'image/webp', 'image/gif') or p_size is null or p_size <= 0 or p_size > 5000000 then
    raise exception 'Screenshots must be PNG, JPEG, WEBP, or GIF and 5 MB or smaller.' using errcode = 'P0001'; end if;
  if p_path !~ '^reports/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpe?g|webp|gif)$' or split_part(p_path, '/', 2)::uuid <> p_report or p_path like '%..%' then
    raise exception 'The screenshot path is not valid.' using errcode = 'P0001'; end if;
  if (right(p_path, 4) = '.png' and p_mime <> 'image/png')
    or (right(p_path, 4) = '.gif' and p_mime <> 'image/gif')
    or (right(p_path, 5) = '.webp' and p_mime <> 'image/webp')
    or ((right(p_path, 4) = '.jpg' or right(p_path, 5) = '.jpeg') and p_mime <> 'image/jpeg') then
    raise exception 'Screenshots must be PNG, JPEG, WEBP, or GIF and 5 MB or smaller.' using errcode = 'P0001'; end if;
  insert into public.staff_feedback_attachments (report_id, idempotency_key, file_name, mime_type, size_bytes, storage_path, created_by)
    values (p_report, p_idempotency, left(regexp_replace(coalesce(p_name, 'screenshot'), '[^A-Za-z0-9._-]+', '_', 'g'), 120), p_mime, p_size, p_path, (who->>'id')::uuid);
  update public.staff_feedback_reports set updated_at = now() where id = p_report;
  return private.staff_feedback_payload(p_report);
end $$;

create or replace function public.staff_feedback_attachment_for_download(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a public.staff_feedback_attachments;
begin
  perform private.staff_feedback_require(false);
  select * into a from public.staff_feedback_attachments where id = p_id;
  if a.id is null or not private.staff_feedback_visible(a.report_id) then raise exception 'Screenshot not found.' using errcode = 'P0001'; end if;
  return jsonb_build_object('id', a.id, 'file_name', a.file_name, 'mime_type', a.mime_type, 'storage_path', a.storage_path);
end $$;

create or replace function public.staff_feedback_publish_draft(p_message uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m public.staff_feedback_messages; who jsonb; status_before text;
begin
  who := private.staff_feedback_require(true);
  select * into m from public.staff_feedback_messages where id = p_message and visibility = 'draft_pending';
  if m.id is null or not private.staff_feedback_visible(m.report_id) then raise exception 'Draft not found.' using errcode = 'P0001'; end if;
  select status into status_before from public.staff_feedback_reports where id = m.report_id;
  update public.staff_feedback_messages set visibility = 'published', published_at = now(), published_by = (who->>'id')::uuid where id = m.id;
  update public.staff_feedback_reports set status = status_before, updated_at = now() where id = m.report_id;
  return private.staff_feedback_payload(m.report_id);
end $$;

create or replace function public.staff_feedback_review_reply(p_event uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ev public.staff_feedback_outbox; who jsonb;
begin
  who := private.staff_feedback_require(true);
  select * into ev from public.staff_feedback_outbox where id = p_event and event_name = 'cla.feedback.staff_reply';
  if ev.id is null or not private.staff_feedback_visible(ev.report_id) then raise exception 'Reply not found.' using errcode = 'P0001'; end if;
  update public.staff_feedback_outbox set reviewed_at = now(), reviewed_by = (who->>'id')::uuid, delivery_state = 'saved', dispatch_allowed = false, reason = 'staff_reply_held' where id = ev.id;
  update public.staff_feedback_reports set updated_at = now() where id = ev.report_id;
  return private.staff_feedback_payload(ev.report_id);
end $$;

create or replace function private.staff_feedback_bot_only() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Portal users cannot acknowledge delivery.' using errcode = 'P0001'; end if;
end $$;
revoke all on function private.staff_feedback_bot_only() from public, anon, authenticated;

create or replace function public.staff_feedback_bot_get(p_feedback uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r public.staff_feedback_reports;
begin
  perform private.staff_feedback_bot_only();
  select * into r from public.staff_feedback_reports where id = p_feedback;
  if r.id is null then raise exception 'Report not found.' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'id', r.id, 'conversation_id', r.conversation_id, 'title', r.title, 'body', r.body, 'status', r.status,
    'page_path', r.page_path, 'order_deal_id', r.order_deal_id, 'order_file_number', r.order_file_number,
    'is_demo', r.is_demo, 'reporter_role', r.reporter_role, 'reporter_name', r.reporter_name,
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'author_kind', m.author_kind, 'author_name', m.author_name, 'body', m.body, 'visibility', m.visibility, 'simulation', m.simulation) order by m.created_at) from public.staff_feedback_messages m where m.report_id = r.id), '[]'::jsonb),
    'attachments', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'file_name', a.file_name, 'mime_type', a.mime_type, 'size_bytes', a.size_bytes, 'storage_path', a.storage_path)) from public.staff_feedback_attachments a where a.report_id = r.id), '[]'::jsonb)
  );
end $$;

create or replace function public.staff_feedback_mark_run_accepted(p_event uuid, p_http integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ev public.staff_feedback_outbox;
begin
  perform private.staff_feedback_bot_only();
  select * into ev from public.staff_feedback_outbox where id = p_event and event_name = 'cla.feedback.created';
  if ev.id is null then raise exception 'Event not found.' using errcode = 'P0001'; end if;
  if ev.delivery_state in ('run_accepted', 'bot_acknowledged', 'replied') then
    return jsonb_build_object('event_id', ev.id, 'delivery_state', ev.delivery_state, 'idempotent', true, 'sent', false, 'bot_read', ev.delivery_state in ('bot_acknowledged', 'replied'));
  end if;
  if p_http is distinct from 200 or ev.delivery_state <> 'pending_dispatch' or not ev.dispatch_allowed then
    update public.staff_feedback_outbox set attempt_count = attempt_count + 1, http_status = p_http, reason = case when p_http is null then 'transport_error' else 'transport_rejected' end where id = ev.id;
    return jsonb_build_object('event_id', ev.id, 'delivery_state', 'pending_dispatch', 'sent', false, 'bot_read', false, 'run_accepted', false);
  end if;
  update public.staff_feedback_outbox set delivery_state = 'run_accepted', reason = 'run_started', http_status = 200, accepted_at = coalesce(accepted_at, now()), attempt_count = attempt_count + 1 where id = ev.id;
  update public.staff_feedback_reports set delivery_state = 'run_accepted', delivery_reason = 'run_started', updated_at = now() where id = ev.report_id;
  return jsonb_build_object('event_id', ev.id, 'delivery_state', 'run_accepted', 'sent', false, 'bot_read', false, 'run_accepted', true);
end $$;

create or replace function public.staff_feedback_bot_ack(p_event uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ev public.staff_feedback_outbox;
begin
  perform private.staff_feedback_bot_only();
  select * into ev from public.staff_feedback_outbox where id = p_event;
  if ev.id is null then raise exception 'Event not found.' using errcode = 'P0001'; end if;
  if ev.delivery_state in ('bot_acknowledged', 'replied') then
    return jsonb_build_object('event_id', ev.id, 'delivery_state', ev.delivery_state, 'idempotent', true);
  end if;
  if ev.delivery_state <> 'run_accepted' then raise exception 'This event has not been accepted by the webhook yet.' using errcode = 'P0001'; end if;
  update public.staff_feedback_outbox set delivery_state = 'bot_acknowledged', reason = 'bot_read', acknowledged_at = now() where id = ev.id;
  update public.staff_feedback_reports set delivery_state = 'bot_acknowledged', delivery_reason = 'bot_read', updated_at = now() where created_event_id = ev.id;
  return jsonb_build_object('event_id', ev.id, 'delivery_state', 'bot_acknowledged', 'idempotent', false);
end $$;

create or replace function public.staff_feedback_bot_draft_reply(p_event uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ev public.staff_feedback_outbox; r public.staff_feedback_reports; mid uuid; text_body text;
begin
  perform private.staff_feedback_bot_only();
  select * into ev from public.staff_feedback_outbox where id = p_event;
  if ev.id is null then raise exception 'Event not found.' using errcode = 'P0001'; end if;
  select * into r from public.staff_feedback_reports where id = ev.report_id;
  if ev.delivery_state = 'replied' and ev.draft_message_id is not null then
    return jsonb_build_object('event_id', ev.id, 'message_id', ev.draft_message_id, 'delivery_state', 'replied', 'status', r.status, 'idempotent', true);
  end if;
  if ev.delivery_state <> 'bot_acknowledged' then raise exception 'Acknowledge the event before drafting a reply.' using errcode = 'P0001'; end if;
  text_body := private.staff_feedback_clean(p_body, 4000, 'a draft reply');
  mid := gen_random_uuid();
  insert into public.staff_feedback_messages (id, report_id, author_kind, author_name, body, visibility, idempotency_key)
    values (mid, r.id, 'bot', 'Assistant (draft)', text_body, 'draft_pending', mid);
  update public.staff_feedback_outbox set delivery_state = 'replied', reason = 'draft_pending', replied_at = now(), draft_message_id = mid where id = ev.id;
  update public.staff_feedback_reports set delivery_state = 'replied', delivery_reason = 'draft_pending', status = r.status, updated_at = now() where id = r.id;
  return jsonb_build_object('event_id', ev.id, 'message_id', mid, 'delivery_state', 'replied', 'status', r.status, 'idempotent', false);
end $$;

revoke all on function public.staff_feedback_create(text, text, boolean, text, boolean, text, uuid) from public, anon;
revoke all on function public.staff_feedback_reply(uuid, text, uuid) from public, anon;
revoke all on function public.staff_feedback_set_status(uuid, text) from public, anon;
revoke all on function public.staff_feedback_list() from public, anon;
revoke all on function public.staff_feedback_get(uuid) from public, anon;
revoke all on function public.staff_feedback_add_attachment(uuid, uuid, text, text, integer, text, uuid) from public, anon;
revoke all on function public.staff_feedback_attachment_for_download(uuid) from public, anon;
revoke all on function public.staff_feedback_publish_draft(uuid) from public, anon;
revoke all on function public.staff_feedback_review_reply(uuid) from public, anon;
grant execute on function public.staff_feedback_create(text, text, boolean, text, boolean, text, uuid) to authenticated;
grant execute on function public.staff_feedback_reply(uuid, text, uuid) to authenticated;
grant execute on function public.staff_feedback_set_status(uuid, text) to authenticated;
grant execute on function public.staff_feedback_list() to authenticated;
grant execute on function public.staff_feedback_get(uuid) to authenticated;
grant execute on function public.staff_feedback_add_attachment(uuid, uuid, text, text, integer, text, uuid) to authenticated;
grant execute on function public.staff_feedback_attachment_for_download(uuid) to authenticated;
grant execute on function public.staff_feedback_publish_draft(uuid) to authenticated;
grant execute on function public.staff_feedback_review_reply(uuid) to authenticated;

revoke all on function public.staff_feedback_bot_get(uuid) from public, anon, authenticated;
revoke all on function public.staff_feedback_mark_run_accepted(uuid, integer) from public, anon, authenticated;
revoke all on function public.staff_feedback_bot_ack(uuid) from public, anon, authenticated;
revoke all on function public.staff_feedback_bot_draft_reply(uuid, text) from public, anon, authenticated;
grant execute on function public.staff_feedback_bot_get(uuid) to service_role;
grant execute on function public.staff_feedback_mark_run_accepted(uuid, integer) to service_role;
grant execute on function public.staff_feedback_bot_ack(uuid) to service_role;
grant execute on function public.staff_feedback_bot_draft_reply(uuid, text) to service_role;

create policy staff_feedback_reports_select on public.staff_feedback_reports for select to authenticated
  using ((select private.staff_feedback_visible(id)));
create policy staff_feedback_messages_select on public.staff_feedback_messages for select to authenticated
  using ((select private.staff_feedback_visible(report_id)) and (visibility = 'published' or (select private.is_admin())));
create policy staff_feedback_attachments_select on public.staff_feedback_attachments for select to authenticated
  using ((select private.staff_feedback_visible(report_id)));
create policy staff_feedback_outbox_select on public.staff_feedback_outbox for select to authenticated
  using ((select private.staff_feedback_visible(report_id)));

create or replace function private.staff_feedback_can_upload_object(p_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare report_id uuid;
begin
  if p_name !~ '^reports/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpe?g|webp|gif)$' then return false; end if;
  report_id := split_part(p_name, '/', 2)::uuid;
  return private.staff_feedback_visible(report_id);
exception when others then return false;
end $$;
revoke all on function private.staff_feedback_can_upload_object(text) from public, anon;
grant execute on function private.staff_feedback_can_upload_object(text) to authenticated;

create or replace function private.staff_feedback_can_read_object(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff_feedback_attachments a
    where a.storage_path = p_name and private.staff_feedback_visible(a.report_id)
  ) $$;
revoke all on function private.staff_feedback_can_read_object(text) from public, anon;
grant execute on function private.staff_feedback_can_read_object(text) to authenticated;

do $storage$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    return;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values ('staff-feedback', 'staff-feedback', false, 5000000, array['image/png', 'image/jpeg', 'image/webp', 'image/gif']::text[])
      on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  else
    insert into storage.buckets (id, name, public) values ('staff-feedback', 'staff-feedback', false)
      on conflict (id) do update set public = false;
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'storage' and p.proname = 'allow_any_operation') then
    execute $pol$create policy staff_feedback_object_read on storage.objects for select to authenticated using (
      bucket_id = 'staff-feedback' and private.staff_feedback_can_read_object(name)
      and storage.allow_any_operation(array['object.get_authenticated', 'object.get_authenticated_info']))$pol$;
  else
    execute $pol$create policy staff_feedback_object_read on storage.objects for select to authenticated using (
      bucket_id = 'staff-feedback' and private.staff_feedback_can_read_object(name))$pol$;
  end if;
  execute $pol$create policy staff_feedback_object_insert on storage.objects for insert to authenticated with check (
    bucket_id = 'staff-feedback' and private.staff_feedback_can_upload_object(name))$pol$;
end $storage$;

select private.lock_function_search_paths();
