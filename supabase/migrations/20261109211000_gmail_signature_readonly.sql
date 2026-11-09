-- Signature import needs no extra Google permission: users.settings.sendAs.list accepts gmail.readonly (already granted on Connect).
-- signatureScope now reads true for any scope that can read send-as signatures. Rollback: supabase/rollbacks/20261109211000_gmail_signature_readonly.sql
do $guard$ begin
  if md5(pg_get_functiondef('public.gmail_my_context()'::regprocedure)) <> '19fb2a59b40194e3abe323fef5949df4' then raise exception 'gmail_my_context drifted'; end if;
end $guard$;

create or replace function public.gmail_my_context() returns jsonb
language sql stable security definer set search_path = pg_catalog, public, extensions as $$
  select jsonb_build_object(
    'uid', auth.uid(),
    'viewAs', private.effective_uid() is distinct from auth.uid(),
    'role', p.role, 'status', p.status, 'email', p.email, 'firstName', coalesce(p.first_name, ''), 'lastName', coalesce(p.last_name, ''),
    'allowed', p.status = 'active' and p.role = any (private.gmail_roles()),
    'mailbox', a.email, 'mailboxStatus', a.status, 'signatureHtml', coalesce(a.signature_html, ''), 'lastSyncAt', a.last_sync_at,
    'signatureSource', coalesce(a.signature_source, ''), 'signatureSyncedAt', a.signature_synced_at,
    'signatureScope', coalesce(a.scopes, '') ~ '(gmail\.readonly|gmail\.settings\.basic|gmail\.modify|mail\.google\.com/)')
  from public.profiles p left join public.mail_accounts a on a.profile_id = p.id
  where p.id = auth.uid() $$;
