-- CONNECT-6 (John, Nov 25 2026, Connect live test checklist row 9.3):
-- Gmail already sent from a file (and replies in the same Gmail thread, already stored on
-- public.deal_emails by gmail-send / gmail-sync) must also be readable for the file's Messages /
-- Inbox tab. Table RLS on deal_emails stays staff-only, so a buyer cannot SELECT the table
-- (and never sees bcc_emails of other people). This function is the one Messages read path.
--   Staff (is_staffish) who can open the file: every email on the file, including bcc.
--   Everyone else who can open the file: emails where their profile email is on From, To, Cc,
--   or Bcc; the returned bcc list is always empty.
-- Does not change private.validate_form, deals RLS, or gmail_svc_* send/sync functions.
-- Rollback: supabase/rollbacks/20261131270000_connect_6_gmail_messages.sql
begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public, extensions;

do $$
begin
  if to_regclass('public.deal_emails') is null then
    raise exception 'drift: public.deal_emails is missing';
  end if;
  if to_regprocedure('private.can_access_deal(uuid)') is null then
    raise exception 'drift: private.can_access_deal(uuid) is missing';
  end if;
  if to_regprocedure('private.is_staffish()') is null then
    raise exception 'drift: private.is_staffish() is missing';
  end if;
  if to_regprocedure('private.effective_uid()') is null then
    raise exception 'drift: private.effective_uid() is missing';
  end if;
  if to_regprocedure('public.list_deal_emails(uuid)') is not null then
    raise exception 'drift: public.list_deal_emails(uuid) already exists';
  end if;
end $$;

create function public.list_deal_emails(p_deal uuid)
returns table (
  id uuid,
  deal_id uuid,
  mailbox_profile_id uuid,
  mailbox_email text,
  direction text,
  gmail_message_id text,
  gmail_thread_id text,
  rfc_message_id text,
  from_email text,
  from_name text,
  to_emails text[],
  cc_emails text[],
  bcc_emails text[],
  subject text,
  body_html text,
  snippet text,
  sent_at timestamptz,
  attachment_document_ids uuid[],
  attachment_names text[],
  template_key text,
  sent_by uuid,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
  select e.id, e.deal_id, e.mailbox_profile_id, e.mailbox_email, e.direction,
         e.gmail_message_id, e.gmail_thread_id, e.rfc_message_id,
         e.from_email, e.from_name, e.to_emails, e.cc_emails,
         case when private.is_staffish() then e.bcc_emails else '{}'::text[] end,
         e.subject, e.body_html, e.snippet, e.sent_at,
         e.attachment_document_ids, e.attachment_names, e.template_key, e.sent_by, e.created_at
  from public.deal_emails e
  where e.deal_id = p_deal
    and private.can_access_deal(p_deal)
    and (
      private.is_staffish()
      or exists (
        select 1
        from public.profiles p
        where p.id = private.effective_uid()
          and coalesce(nullif(lower(trim(p.email)), ''), '') <> ''
          and (
            lower(trim(coalesce(e.from_email, ''))) = lower(trim(p.email))
            or lower(trim(p.email)) in (select lower(trim(x)) from unnest(coalesce(e.to_emails, '{}'::text[])) as x)
            or lower(trim(p.email)) in (select lower(trim(x)) from unnest(coalesce(e.cc_emails, '{}'::text[])) as x)
            or lower(trim(p.email)) in (select lower(trim(x)) from unnest(coalesce(e.bcc_emails, '{}'::text[])) as x)
          )
      )
    )
  order by e.sent_at desc
  limit 300;
$$;

comment on function public.list_deal_emails(uuid) is
  'CONNECT-6: Messages / Inbox list of Gmail on a file. Staff see every email on a file they can open. Parties see only mail they are on, with bcc stripped.';

revoke all on function public.list_deal_emails(uuid) from public, anon;
grant execute on function public.list_deal_emails(uuid) to authenticated;

commit;
