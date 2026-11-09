-- Rollback for 20261109211000_gmail_signature_readonly.sql: the gmail_my_context from 20261109210000 (md5 19fb2a59b40194e3abe323fef5949df4).
create or replace function public.gmail_my_context() returns jsonb
language sql stable security definer set search_path = pg_catalog, public, extensions as $$
  select jsonb_build_object(
    'uid', auth.uid(),
    'viewAs', private.effective_uid() is distinct from auth.uid(),
    'role', p.role, 'status', p.status, 'email', p.email, 'firstName', coalesce(p.first_name, ''), 'lastName', coalesce(p.last_name, ''),
    'allowed', p.status = 'active' and p.role = any (private.gmail_roles()),
    'mailbox', a.email, 'mailboxStatus', a.status, 'signatureHtml', coalesce(a.signature_html, ''), 'lastSyncAt', a.last_sync_at,
    'signatureSource', coalesce(a.signature_source, ''), 'signatureSyncedAt', a.signature_synced_at,
    'signatureScope', coalesce(a.scopes, '') ~ 'gmail\.settings\.basic')
  from public.profiles p left join public.mail_accounts a on a.profile_id = p.id
  where p.id = auth.uid() $$;
