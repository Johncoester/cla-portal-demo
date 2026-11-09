-- Rollback for 20261109210000_gmail_signature_import.sql: exact before-definitions (TEST, Nov 9 2026), new function and columns dropped.
do $guard$ begin
  if to_regprocedure('public.gmail_svc_set_gmail_signature(uuid,text,boolean)') is null then raise exception 'signature import is not applied'; end if;
end $guard$;
drop function public.gmail_svc_set_gmail_signature(uuid, text, boolean);
CREATE OR REPLACE FUNCTION public.gmail_my_context()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select jsonb_build_object(
    'uid', auth.uid(),
    'viewAs', private.effective_uid() is distinct from auth.uid(),
    'role', p.role, 'status', p.status, 'email', p.email, 'firstName', coalesce(p.first_name, ''), 'lastName', coalesce(p.last_name, ''),
    'allowed', p.status = 'active' and p.role = any (private.gmail_roles()),
    'mailbox', a.email, 'mailboxStatus', a.status, 'signatureHtml', coalesce(a.signature_html, ''), 'lastSyncAt', a.last_sync_at)
  from public.profiles p left join public.mail_accounts a on a.profile_id = p.id
  where p.id = auth.uid() $function$;

CREATE OR REPLACE FUNCTION public.gmail_set_signature(p_html text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
begin
  if auth.uid() is null then raise exception 'Please sign in.' using errcode = '42501'; end if;
  if private.effective_uid() is distinct from auth.uid() then raise exception 'View as is read-only. Go back to your account to make changes.' using errcode = '42501'; end if;
  if char_length(coalesce(p_html, '')) > 20000 then raise exception 'The signature is too long.' using errcode = 'P0001'; end if;
  update public.mail_accounts set signature_html = coalesce(p_html, ''), updated_at = now() where profile_id = auth.uid();
  if not found then raise exception 'Connect Gmail first.' using errcode = 'P0001'; end if;
  return true;
end $function$;

alter table public.mail_accounts drop column signature_synced_at, drop column signature_source;
