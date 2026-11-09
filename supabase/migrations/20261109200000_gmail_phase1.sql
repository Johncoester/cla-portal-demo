-- John, Nov 9: Gmail phase 1 on CLA Portal Live Test (TEST project only).
-- Staff connect their OWN @clatitle.com Gmail (per-user Google OAuth, Internal app; scopes gmail.send + gmail.readonly) and send / receive
-- email inside a file. This migration only ADDS objects; no existing function or policy is changed.
--   public.mail_accounts        one row per connected portal login: mailbox address, status, portal signature. Owner-only read. NO tokens.
--   private.mail_account_secrets the Vault secret id of the Google refresh token + the Gmail sync cursor (history id). No grants.
--   private.gmail_oauth_states  short-lived OAuth state (sha-256 of the state, PKCE verifier). No grants.
--   private.mail_threads        Gmail thread -> file links. Sync only ever stores messages in a linked thread.
--   public.deal_emails          email on a file (sent from the portal, replies, and in-thread mail sent from Gmail).
--                               Read: staff who can open the file (the deals policy decides, through the EXISTS below).
-- Refresh tokens live only in Supabase Vault (vault.secrets, encrypted at rest). Only the gmail_* edge functions (service role) call the
-- gmail_svc_* functions; the browser never sees a token.
-- Speed: policies use one-time (initplan) checks plus a plain EXISTS on deals; no per-row private.* helper call.
-- Rollback: supabase/rollbacks/20261109200000_gmail_phase1.sql
begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public, extensions;
do $$
begin
  if to_regclass('public.mail_accounts') is not null or to_regclass('public.deal_emails') is not null
     or to_regclass('private.mail_account_secrets') is not null or to_regclass('private.gmail_oauth_states') is not null
     or to_regclass('private.mail_threads') is not null then
    raise exception 'drift: a Gmail table already exists'; end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'private') and p.proname like 'gmail\_%') then
    raise exception 'drift: a gmail_* function already exists'; end if;
  if not exists (select 1 from pg_extension where extname = 'supabase_vault') then raise exception 'drift: supabase_vault is not installed'; end if;
  if exists (select 1 from vault.secrets where name like 'gmail\_%') then raise exception 'drift: a gmail_* vault secret already exists'; end if;
  if (select md5(prosrc) from pg_proc where oid = to_regprocedure('private.is_staffish()')) is distinct from '35a5e24872638d0fd21ad178f90e72e6' then
    raise exception 'drift: private.is_staffish changed or missing'; end if;
end $$;

-- 1. who may connect Gmail (John, Nov 9). Used inside functions only, never in a policy.
create function private.gmail_roles() returns text[] language sql immutable set search_path = pg_catalog as $$
  select array['Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin']::text[] $$;
revoke all on function private.gmail_roles() from public, anon, authenticated;

-- 2. tables
create table public.mail_accounts (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  email text not null unique check (email = lower(email) and email ~ '^[^@[:space:]]+@clatitle\.com$'),
  status text not null default 'connected' check (status in ('connected', 'needs_reconnect')),
  scopes text not null default '',
  signature_html text not null default '' check (char_length(signature_html) <= 20000),
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_sync_at timestamptz,
  last_error text);
alter table public.mail_accounts enable row level security;
revoke all on public.mail_accounts from public, anon, authenticated;
grant select on public.mail_accounts to authenticated;
grant all on public.mail_accounts to service_role;
create policy mail_accounts_owner_select on public.mail_accounts for select to authenticated using (profile_id = (select auth.uid()));

create table private.mail_account_secrets (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  vault_secret_id uuid not null,
  history_id text);
revoke all on private.mail_account_secrets from public, anon, authenticated;

create table private.gmail_oauth_states (
  state_hash text primary key check (state_hash ~ '^[0-9a-f]{64}$'),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  code_verifier text not null check (char_length(code_verifier) between 43 and 128),
  created_at timestamptz not null default now());
revoke all on private.gmail_oauth_states from public, anon, authenticated;

create table private.mail_threads (
  mailbox_email text not null,
  gmail_thread_id text not null,
  deal_id uuid not null references public.deals(id) on delete cascade,
  mailbox_profile_id uuid references public.profiles(id) on delete set null,
  linked_at timestamptz not null default now(),
  primary key (mailbox_email, gmail_thread_id));
revoke all on private.mail_threads from public, anon, authenticated;

create table public.deal_emails (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  mailbox_profile_id uuid references public.profiles(id) on delete set null,
  mailbox_email text not null,
  direction text not null check (direction in ('out', 'in')),
  gmail_message_id text not null,
  gmail_thread_id text not null,
  rfc_message_id text,
  from_email text not null default '',
  from_name text not null default '',
  to_emails text[] not null default '{}',
  cc_emails text[] not null default '{}',
  bcc_emails text[] not null default '{}',
  subject text not null default '',
  body_html text not null default '',
  snippet text not null default '',
  sent_at timestamptz not null default now(),
  attachment_document_ids uuid[] not null default '{}',
  attachment_names text[] not null default '{}',
  template_key text,
  sent_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (mailbox_email, gmail_message_id));
create index deal_emails_deal_idx on public.deal_emails (deal_id, sent_at desc);
alter table public.deal_emails enable row level security;
revoke all on public.deal_emails from public, anon, authenticated;
grant select on public.deal_emails to authenticated;
grant all on public.deal_emails to service_role;
-- staff (one-time check) who can open the file (the deals select policy, incl. demo scope, decides through this EXISTS)
create policy deal_emails_staff_select on public.deal_emails for select to authenticated using (
  (select private.is_staffish()) and exists (select 1 from public.deals d where d.id = deal_emails.deal_id));

-- 3. called by the signed-in user (edge functions with the user's JWT, and the Profile page)
create function public.gmail_my_context() returns jsonb
language sql stable security definer set search_path = pg_catalog, public, extensions as $$
  select jsonb_build_object(
    'uid', auth.uid(),
    'viewAs', private.effective_uid() is distinct from auth.uid(),
    'role', p.role, 'status', p.status, 'email', p.email, 'firstName', coalesce(p.first_name, ''), 'lastName', coalesce(p.last_name, ''),
    'allowed', p.status = 'active' and p.role = any (private.gmail_roles()),
    'mailbox', a.email, 'mailboxStatus', a.status, 'signatureHtml', coalesce(a.signature_html, ''), 'lastSyncAt', a.last_sync_at)
  from public.profiles p left join public.mail_accounts a on a.profile_id = p.id
  where p.id = auth.uid() $$;
revoke all on function public.gmail_my_context() from public, anon;
grant execute on function public.gmail_my_context() to authenticated;

create function public.gmail_set_signature(p_html text) returns boolean
language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
begin
  if auth.uid() is null then raise exception 'Please sign in.' using errcode = '42501'; end if;
  if private.effective_uid() is distinct from auth.uid() then raise exception 'View as is read-only. Go back to your account to make changes.' using errcode = '42501'; end if;
  if char_length(coalesce(p_html, '')) > 20000 then raise exception 'The signature is too long.' using errcode = 'P0001'; end if;
  update public.mail_accounts set signature_html = coalesce(p_html, ''), updated_at = now() where profile_id = auth.uid();
  if not found then raise exception 'Connect Gmail first.' using errcode = 'P0001'; end if;
  return true;
end $$;
revoke all on function public.gmail_set_signature(text) from public, anon;
grant execute on function public.gmail_set_signature(text) to authenticated;

-- 4. service-role only (the gmail_* edge functions)
create function public.gmail_svc_begin_oauth(p_profile uuid, p_state_hash text, p_verifier text) returns void
language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
begin
  if not exists (select 1 from public.profiles p where p.id = p_profile and p.status = 'active' and p.role = any (private.gmail_roles())) then
    raise exception 'Gmail is not available for this login.' using errcode = '42501'; end if;
  delete from private.gmail_oauth_states where created_at < now() - interval '15 minutes' or profile_id = p_profile;
  insert into private.gmail_oauth_states (state_hash, profile_id, code_verifier) values (p_state_hash, p_profile, p_verifier);
end $$;

create function public.gmail_svc_take_oauth(p_state_hash text) returns table (profile_id uuid, code_verifier text)
language sql security definer set search_path = pg_catalog, public, extensions as $$
  with gone as (delete from private.gmail_oauth_states s where s.state_hash = p_state_hash returning s.profile_id, s.code_verifier, s.created_at)
  select g.profile_id, g.code_verifier from gone g where g.created_at > now() - interval '10 minutes' $$;

create function public.gmail_svc_connect(p_profile uuid, p_email text, p_refresh text, p_scopes text, p_history text) returns void
language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
declare v_email text := lower(btrim(coalesce(p_email, ''))); v_secret uuid; v_name text := 'gmail_refresh_' || p_profile::text; v_sig text;
begin
  if v_email !~ '^[^@[:space:]]+@clatitle\.com$' then raise exception 'Only an @clatitle.com Google account can be connected.' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_profile and p.status = 'active' and p.role = any (private.gmail_roles())) then
    raise exception 'Gmail is not available for this login.' using errcode = '42501'; end if;
  if exists (select 1 from public.mail_accounts a where a.email = v_email and a.profile_id <> p_profile) then
    raise exception 'That Gmail account is already connected to another portal login.' using errcode = 'P0001'; end if;
  if coalesce(p_refresh, '') = '' then raise exception 'Google did not return a long-lived token. Try Connect Gmail again.' using errcode = 'P0001'; end if;
  select s.id into v_secret from vault.secrets s where s.name = v_name;
  if v_secret is null then v_secret := vault.create_secret(p_refresh, v_name, 'Gmail refresh token (CLA portal TEST)');
  else perform vault.update_secret(v_secret, p_refresh); end if;
  insert into private.mail_account_secrets (profile_id, vault_secret_id, history_id) values (p_profile, v_secret, nullif(p_history, ''))
    on conflict (profile_id) do update set vault_secret_id = excluded.vault_secret_id, history_id = excluded.history_id;
  select c.html into v_sig from public.crm_user_signatures c where c.user_id = p_profile;
  insert into public.mail_accounts (profile_id, email, status, scopes, signature_html, connected_at, updated_at, last_error)
    values (p_profile, v_email, 'connected', coalesce(p_scopes, ''), left(coalesce(v_sig, ''), 20000), now(), now(), null)
    on conflict (profile_id) do update set email = excluded.email, status = 'connected', scopes = excluded.scopes, connected_at = now(), updated_at = now(), last_error = null,
      signature_html = case when public.mail_accounts.signature_html = '' then excluded.signature_html else public.mail_accounts.signature_html end;
  insert into public.activity_log (deal_id, actor_id, action, entity, entity_id, detail)
    values (null, p_profile, 'mail.connect', 'mail_account', p_profile, left('Connected Gmail ' || v_email, 300));
end $$;

create function public.gmail_svc_token(p_profile uuid) returns table (email text, refresh_token text, history_id text, status text)
language sql stable security definer set search_path = pg_catalog, public, extensions as $$
  select a.email, d.decrypted_secret, s.history_id, a.status
    from public.mail_accounts a join private.mail_account_secrets s on s.profile_id = a.profile_id
    join vault.decrypted_secrets d on d.id = s.vault_secret_id
   where a.profile_id = p_profile $$;

create function public.gmail_svc_disconnect(p_profile uuid, p_detail text) returns text
language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
declare v_email text;
begin
  select a.email into v_email from public.mail_accounts a where a.profile_id = p_profile;
  delete from vault.secrets s where s.name = 'gmail_refresh_' || p_profile::text
     or s.id = (select x.vault_secret_id from private.mail_account_secrets x where x.profile_id = p_profile);
  delete from private.mail_account_secrets where profile_id = p_profile;
  delete from private.gmail_oauth_states where profile_id = p_profile;
  delete from public.mail_accounts where profile_id = p_profile;
  if v_email is not null then
    insert into public.activity_log (deal_id, actor_id, action, entity, entity_id, detail)
      values (null, p_profile, 'mail.disconnect', 'mail_account', p_profile, left('Disconnected Gmail ' || v_email || coalesce(' (' || nullif(p_detail, '') || ')', ''), 300));
  end if;
  return v_email;
end $$;

create function public.gmail_svc_update_account(p_profile uuid, p_status text, p_error text, p_history text, p_synced boolean) returns void
language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
begin
  update public.mail_accounts set status = coalesce(p_status, status), last_error = left(p_error, 300), updated_at = now(),
    last_sync_at = case when p_synced then now() else last_sync_at end where profile_id = p_profile;
  if nullif(p_history, '') is not null then update private.mail_account_secrets set history_id = p_history where profile_id = p_profile; end if;
end $$;

create function public.gmail_svc_connected_accounts() returns table (profile_id uuid, email text)
language sql stable security definer set search_path = pg_catalog, public, extensions as $$
  select a.profile_id, a.email from public.mail_accounts a join public.profiles p on p.id = a.profile_id
   where a.status = 'connected' and p.status = 'active' and p.role = any (private.gmail_roles()) order by a.connected_at $$;

create function public.gmail_svc_linked_threads(p_email text) returns table (gmail_thread_id text, deal_id uuid, linked_at timestamptz)
language sql stable security definer set search_path = pg_catalog, public, extensions as $$
  select t.gmail_thread_id, t.deal_id, t.linked_at from private.mail_threads t where t.mailbox_email = lower(p_email) $$;

create function public.gmail_svc_known_messages(p_email text, p_ids text[]) returns setof text
language sql stable security definer set search_path = pg_catalog, public, extensions as $$
  select e.gmail_message_id from public.deal_emails e where e.mailbox_email = lower(p_email) and e.gmail_message_id = any (p_ids) $$;

create function public.gmail_svc_audit(p_profile uuid, p_deal uuid, p_action text, p_detail text) returns void
language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
begin
  if p_action not in ('mail.refused', 'mail.failed', 'mail.revoke_failed') then raise exception 'unknown mail audit action' using errcode = 'P0001'; end if;
  insert into public.activity_log (deal_id, actor_id, action, entity, entity_id, detail)
    values (p_deal, p_profile, p_action, 'mail_account', p_profile, left(coalesce(p_detail, ''), 300));
end $$;

-- record one email on a file (+ the thread link, saved attachments, audit, and an in-app notice for a reply). Duplicate Gmail id -> null.
create function public.gmail_svc_record(p jsonb) returns uuid
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

-- cron -> gmail-sync: the shared token lives in Vault (created by migration 20261109200100); compared here so the function never stores it
create function public.gmail_svc_check_sync_token(p_token text) returns boolean
language sql stable security definer set search_path = pg_catalog, public, extensions as $$
  select coalesce((select extensions.digest(d.decrypted_secret, 'sha256') = extensions.digest(coalesce(p_token, ''), 'sha256')
                     from vault.decrypted_secrets d where d.name = 'gmail_sync_token' and char_length(coalesce(p_token, '')) >= 32), false) $$;

do $$
declare f text;
begin
  foreach f in array array['gmail_svc_begin_oauth(uuid,text,text)', 'gmail_svc_take_oauth(text)', 'gmail_svc_connect(uuid,text,text,text,text)',
    'gmail_svc_token(uuid)', 'gmail_svc_disconnect(uuid,text)', 'gmail_svc_update_account(uuid,text,text,text,boolean)', 'gmail_svc_connected_accounts()',
    'gmail_svc_linked_threads(text)', 'gmail_svc_known_messages(text,text[])', 'gmail_svc_audit(uuid,uuid,text,text)', 'gmail_svc_record(jsonb)',
    'gmail_svc_check_sync_token(text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

commit;
