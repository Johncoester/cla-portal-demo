-- OUTBOX-SEND-1 (John Coester, Nov 24 2026, 11:06 AM ET, t2041u): automatic portal emails never send.
-- public.outbox had only ever held 'queued' rows: round2_schema (20261105222725) added
-- outbox_status_check (status = 'queued') and outbox_sent_at_check (sent_at is null) so the TEST portal could
-- never send. This file adds the pieces a sender needs. It sends nothing by itself.
--
--  1. Status: queued -> sending -> sent | failed, or queued -> skipped | blocked. The two "never send" checks are
--     replaced by one list of statuses and "sent_at is set exactly when status is sent". New columns record why
--     (status_reason), how many tries (attempts), when a sender took the row (claimed_at), the next try
--     (next_attempt_at), when it was finished (processed_at) and the email service's id (provider_message_id).
--  2. The switch: private.outbox_send_settings, one row, mode 'test' (default), 'live' or 'off'. It lives in the
--     private schema with no grant to anon or authenticated, so no portal screen, staff member or browser can read
--     or change it. Only the database owner (Supabase dashboard SQL editor) can, with
--     select private.set_outbox_send_mode('live', 'SEND REAL EMAIL');
--     Test mode sends only when every address (to, cc, bcc) matches test_address_regex (clatestportal+...@gmail.com).
--     Anything else is marked skipped with the reason, and never sent later.
--  3. The backlog: every row queued before this file runs is marked skipped, 'pre-sender backlog, not sent'.
--     not_before is set to the moment this file runs and the claim function never takes an older row, so the old
--     rows can not be picked up even if a sender ran first (it could not: the claim function is created here).
--  4. public.outbox_claim_batch / public.outbox_mark_result / public.outbox_svc_check_token: called by the
--     outbox-send edge function with the server key only (execute revoked from public, anon, authenticated).
--     The claim takes rows with FOR UPDATE SKIP LOCKED under a lock on the settings row, so two runs never take the
--     same row. Before sending it re-checks: send_blocked (held by a portal rule) -> blocked; the TC-only rule
--     (a TC-only agent as to/cc/bcc, except the TC-ONLY-3 kinds that go to the agent and the TC) -> blocked;
--     Test mode -> skipped. A row left 'sending' for 10 minutes is marked failed, never retried, because it may
--     already have gone out. A failed try is retried up to max_attempts (5) with a growing wait.
--  5. pg_cron 'outbox-send-every-minute' calls the edge function only when the Vault secret 'outbox_send_token'
--     exists, the mode is not off, and there is something to do. Until John creates that secret it calls nothing.
-- No existing function, RLS policy or grant is changed. TEST only (refuses where Vault has no gmail_sync_token).
-- Rollback: supabase/rollbacks/20261131000000_outbox_sender.sql
begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public, extensions;

do $chk$ begin
  if to_regclass('public.outbox') is null or to_regclass('public.email_sender_settings') is null then
    raise exception 'drift: public.outbox or public.email_sender_settings is missing'; end if;
  if to_regprocedure('private.resolve_recipients(uuid,uuid,text)') is null then
    raise exception 'drift: apply the TC-only files (private.resolve_recipients) first'; end if;
  if not exists (select 1 from vault.secrets where name = 'gmail_sync_token') then
    raise exception 'refusing: the outbox sender is for CLA Portal Live Test only'; end if;
  if to_regclass('private.outbox_send_settings') is not null then
    raise exception 'drift: private.outbox_send_settings already exists (this file was applied before)'; end if;
end $chk$;

-- nobody queues a row while the backlog is marked
lock table public.outbox in share row exclusive mode;

alter table public.outbox
  add column status_reason text not null default '',
  add column attempts integer not null default 0,
  add column claimed_at timestamptz,
  add column next_attempt_at timestamptz,
  add column processed_at timestamptz,
  add column provider_message_id text;

alter table public.outbox drop constraint if exists outbox_status_check;
alter table public.outbox drop constraint if exists outbox_sent_at_check;

-- 3. the backlog (before the new checks, so it is one pass)
update public.outbox set status = 'skipped', status_reason = 'pre-sender backlog, not sent', processed_at = now()
 where status = 'queued' and created_at <= now();

alter table public.outbox add constraint outbox_status_check
  check (status in ('queued', 'sending', 'sent', 'failed', 'skipped', 'blocked'));
alter table public.outbox add constraint outbox_sent_at_check check ((status = 'sent') = (sent_at is not null));
alter table public.outbox add constraint outbox_attempts_check check (attempts between 0 and 50);
create index outbox_send_queue on public.outbox (created_at, id) where status in ('queued', 'sending');

-- 2. the switch
create table private.outbox_send_settings (
  id boolean primary key default true check (id),
  mode text not null default 'test' check (mode in ('off', 'test', 'live')),
  test_address_regex text not null default '^clatestportal\+[a-z0-9._-]+@gmail\.com$',
  not_before timestamptz not null default now(),
  batch_size integer not null default 20 check (batch_size between 1 and 100),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  updated_at timestamptz not null default now(),
  updated_by text not null default current_user
);
insert into private.outbox_send_settings (id, not_before) values (true, now());
revoke all on table private.outbox_send_settings from public, anon, authenticated;
alter table private.outbox_send_settings enable row level security;   -- no policy: only the owner reads it

create function private.set_outbox_send_mode(p_mode text, p_confirm text default '')
returns text language plpgsql security invoker set search_path = pg_catalog, public, extensions as $$
begin
  if p_mode not in ('off', 'test', 'live') then raise exception 'mode must be off, test or live'; end if;
  if p_mode = 'live' and coalesce(p_confirm, '') <> 'SEND REAL EMAIL' then
    raise exception 'Live mode sends real email to real people. To turn it on run: select private.set_outbox_send_mode(''live'', ''SEND REAL EMAIL'');';
  end if;
  update private.outbox_send_settings set mode = p_mode, updated_at = now(), updated_by = current_user where id;
  return 'Portal email mode is now ' || p_mode;
end $$;
revoke all on function private.set_outbox_send_mode(text, text) from public, anon, authenticated, service_role;

-- an address list a TC-only rule would move or hold (null when every address is fine)
create function private.outbox_tc_only_problem(r public.outbox) returns text
language plpgsql stable security definer set search_path = pg_catalog, public, extensions as $$
declare a text; x record;
begin
  if r.deal_id is null then return null; end if;
  -- TC-ONLY-3: fee change and title commitment notices go to the agent AND their TC, so the agent's own copy is fine
  if not (coalesce(r.kind, '') = 'agent_fee' or coalesce(r.title_recipient_role, '') in ('buyer_agent_commitment', 'listing_agent')) then
    select * into x from private.resolve_recipients(r.deal_id, r.to_profile_id, r.to_email) limit 1;
    if found and x.action <> 'keep' then
      return 'TC-only rule: ' || coalesce(nullif(x.agent_name, ''), r.to_email) || ' gets portal email through their TC, so this email was not sent to them.';
    end if;
  end if;
  foreach a in array coalesce(r.cc_emails, '{}') || coalesce(r.bcc_emails, '{}') loop
    select * into x from private.resolve_recipients(r.deal_id, null, a) limit 1;
    if found and x.action <> 'keep' then
      return 'TC-only rule: the copy to ' || a || ' should go to their TC, so this email was not sent.';
    end if;
  end loop;
  return null;
end $$;
revoke all on function private.outbox_tc_only_problem(public.outbox) from public, anon, authenticated;

-- 4. claim a batch for the edge function
create function public.outbox_claim_batch(p_limit integer default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
declare s private.outbox_send_settings; r public.outbox; v_rows jsonb := '[]'; v_status text; v_reason text; v_bad text; v_tc text;
  v_from text; v_from_name text; p public.email_sender_settings; n int;
begin
  select * into s from private.outbox_send_settings where id for update;   -- one claimer at a time
  if not found or s.mode = 'off' then return jsonb_build_object('mode', coalesce(s.mode, 'off'), 'rows', '[]'::jsonb); end if;
  update public.outbox set status = 'failed', processed_at = now(),
         status_reason = 'The sender stopped while sending this email, so it may or may not have gone out. It is not retried automatically.'
   where status = 'sending' and claimed_at < now() - interval '10 minutes';
  select * into p from public.email_sender_settings where sender_type = 'portal';
  n := least(greatest(coalesce(p_limit, s.batch_size), 1), s.batch_size);
  for r in select o.* from public.outbox o
            where o.status = 'queued' and o.created_at >= s.not_before and (o.next_attempt_at is null or o.next_attempt_at <= now())
            order by o.created_at, o.id limit n for update skip locked loop
    v_status := null; v_reason := null;
    if btrim(coalesce(r.send_blocked, '')) <> '' then
      v_status := 'blocked'; v_reason := left('Held by the portal: ' || btrim(r.send_blocked), 500);
    elsif r.channel <> 'email' or coalesce(btrim(r.to_email), '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      v_status := 'failed'; v_reason := 'The recipient email address is missing or not valid.';
    else
      v_tc := private.outbox_tc_only_problem(r);
      if v_tc is not null then v_status := 'blocked'; v_reason := left(v_tc, 500);
      elsif s.mode = 'test' then
        select string_agg(a, ', ') into v_bad from unnest(array[r.to_email] || coalesce(r.cc_emails, '{}') || coalesce(r.bcc_emails, '{}')) a
         where lower(btrim(a)) !~ s.test_address_regex;
        if v_bad is not null then
          v_status := 'skipped'; v_reason := left('Test mode: ' || v_bad || ' is not a clatestportal+ test address, so nothing was sent.', 500);
        end if;
      end if;
    end if;
    if v_status is not null then
      update public.outbox set status = v_status, status_reason = v_reason, processed_at = now(), claimed_at = null where id = r.id;
      continue;
    end if;
    -- From: the row's own clatitle.com sender (processor, HR or portal), else the portal address
    if lower(coalesce(r.from_email, '')) ~ '^[a-z0-9._%+-]+@clatitle\.com$' then v_from := lower(r.from_email); v_from_name := coalesce(nullif(btrim(r.from_name), ''), p.display_name);
    else v_from := p.email; v_from_name := p.display_name; end if;
    update public.outbox set status = 'sending', claimed_at = now(), attempts = attempts + 1 where id = r.id;
    v_rows := v_rows || jsonb_build_object('id', r.id, 'to', r.to_email, 'toName', r.to_name, 'cc', to_jsonb(coalesce(r.cc_emails, '{}')),
      'bcc', to_jsonb(coalesce(r.bcc_emails, '{}')), 'subject', r.subject, 'body', r.body, 'from', v_from, 'fromName', v_from_name,
      'attachmentIds', to_jsonb(array(select distinct x from unnest(coalesce(r.attachment_document_ids, '{}') || case when r.attachment_document_id is null then '{}'::uuid[] else array[r.attachment_document_id] end) x)),
      'createdAt', r.created_at, 'attempt', r.attempts + 1);
  end loop;
  return jsonb_build_object('mode', s.mode, 'testAddressRegex', s.test_address_regex, 'notBefore', s.not_before, 'rows', v_rows);
end $$;

-- record what the email service said. Only a row still 'sending' changes.
create function public.outbox_mark_result(p_id uuid, p_ok boolean, p_provider_id text default null, p_error text default null, p_retry boolean default false)
returns text language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
declare s private.outbox_send_settings; r public.outbox; v_err text := left(coalesce(nullif(btrim(p_error), ''), 'The email service did not say why.'), 450);
begin
  select * into s from private.outbox_send_settings where id;
  select * into r from public.outbox where id = p_id and status = 'sending' for update;
  if not found then return 'not sending'; end if;
  if p_ok then
    update public.outbox set status = 'sent', sent_at = now(), processed_at = now(), provider_message_id = left(p_provider_id, 200), status_reason = '', next_attempt_at = null where id = p_id;
    return 'sent';
  elsif p_retry and r.attempts < coalesce(s.max_attempts, 5) then
    update public.outbox set status = 'queued', claimed_at = null, next_attempt_at = now() + make_interval(mins => power(2, r.attempts)::int),
           status_reason = left('Try ' || r.attempts || ' failed: ' || v_err || ' Trying again later.', 500) where id = p_id;
    return 'retry';
  else
    update public.outbox set status = 'failed', processed_at = now(), claimed_at = null,
           status_reason = left(case when p_retry then 'Gave up after ' || r.attempts || ' tries: ' else '' end || v_err, 500) where id = p_id;
    return 'failed';
  end if;
end $$;

-- cron -> outbox-send: the shared token lives in Vault ('outbox_send_token', created by John); compared here
create function public.outbox_svc_check_token(p_token text) returns boolean
language sql stable security definer set search_path = pg_catalog, public, extensions as $$
  select coalesce((select extensions.digest(d.decrypted_secret, 'sha256') = extensions.digest(coalesce(p_token, ''), 'sha256')
                     from vault.decrypted_secrets d where d.name = 'outbox_send_token' and char_length(coalesce(p_token, '')) >= 32), false) $$;

do $g$
declare f text;
begin
  foreach f in array array['outbox_claim_batch(integer)', 'outbox_mark_result(uuid,boolean,text,text,boolean)', 'outbox_svc_check_token(text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $g$;

-- 5. every minute, only when there is a token, a mode and work
do $cron$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') and exists (select 1 from pg_extension where extname = 'pg_net') then
    if exists (select 1 from cron.job where jobname = 'outbox-send-every-minute') then perform cron.unschedule('outbox-send-every-minute'); end if;
    perform cron.schedule('outbox-send-every-minute', '* * * * *', $job$
  select net.http_post(
    url := 'https://aqcervntopidtcazcmlv.supabase.co/functions/v1/outbox-send',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-outbox-send-token', d.decrypted_secret),
    body := '{"mode":"cron"}'::jsonb,
    timeout_milliseconds := 55000)
  from vault.decrypted_secrets d
  where d.name = 'outbox_send_token' and char_length(d.decrypted_secret) >= 32
    and exists (select 1 from private.outbox_send_settings s where s.mode <> 'off')
    and exists (select 1 from public.outbox o, private.outbox_send_settings s
                 where o.status in ('queued', 'sending') and o.created_at >= s.not_before
                   and (o.status = 'sending' or o.next_attempt_at is null or o.next_attempt_at <= now()))
$job$);
  end if;
end $cron$;

-- self-check
do $self$ begin
  if exists (select 1 from public.outbox where status = 'queued' and created_at < (select not_before from private.outbox_send_settings)) then
    raise exception 'self-check: an old row is still queued'; end if;
  if (select mode from private.outbox_send_settings) <> 'test' then raise exception 'self-check: the mode is not test'; end if;
  if has_function_privilege('authenticated', 'public.outbox_claim_batch(integer)', 'execute') then raise exception 'self-check: authenticated can claim'; end if;
end $self$;

commit;

notify pgrst, 'reload schema';
