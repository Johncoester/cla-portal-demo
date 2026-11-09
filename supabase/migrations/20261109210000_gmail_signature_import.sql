-- Gmail signature import (John, Nov 9 2:06 PM: "take what's in - the person's Gmail signature they use now"). CLA Portal Live Test only.
-- The edge functions read the default send-as signature with gmail.settings.basic (read-only use) and store it here; a typed override wins
-- until "Refresh from Gmail". Rollback: supabase/rollbacks/20261109210000_gmail_signature_import.sql
do $guard$ begin
  if to_regclass('public.mail_accounts') is null then raise exception 'Gmail phase 1 is not on this database'; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'mail_accounts' and column_name in ('signature_source', 'signature_synced_at'))
    then raise exception 'signature import already applied'; end if;
  if to_regprocedure('public.gmail_svc_set_gmail_signature(uuid,text,boolean)') is not null then raise exception 'gmail_svc_set_gmail_signature already exists'; end if;
  if md5(pg_get_functiondef('public.gmail_my_context()'::regprocedure)) <> 'e1dd32bf8db1894f03e498dced0298d2' then raise exception 'gmail_my_context drifted'; end if;
  if md5(pg_get_functiondef('public.gmail_set_signature(text)'::regprocedure)) <> 'da337777df7866587d760b4e36e849ed' then raise exception 'gmail_set_signature drifted'; end if;
end $guard$;

-- '' = none / seeded from the CRM signature, 'gmail' = imported from Gmail, 'custom' = typed in the portal (an import never overwrites it unless Refresh from Gmail)
alter table public.mail_accounts
  add column signature_source text not null default '' check (signature_source in ('', 'gmail', 'custom')),
  add column signature_synced_at timestamptz;

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

create or replace function public.gmail_set_signature(p_html text) returns boolean
language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
begin
  if auth.uid() is null then raise exception 'Please sign in.' using errcode = '42501'; end if;
  if private.effective_uid() is distinct from auth.uid() then raise exception 'View as is read-only. Go back to your account to make changes.' using errcode = '42501'; end if;
  if char_length(coalesce(p_html, '')) > 20000 then raise exception 'The signature is too long.' using errcode = 'P0001'; end if;
  update public.mail_accounts set signature_html = coalesce(p_html, ''), signature_source = case when btrim(coalesce(p_html, '')) = '' then '' else 'custom' end, updated_at = now()
   where profile_id = auth.uid();
  if not found then raise exception 'Connect Gmail first.' using errcode = 'P0001'; end if;
  return true;
end $$;

-- service role only: store the Gmail signature. p_force (Refresh from Gmail) replaces a typed override and an empty Gmail signature;
-- otherwise (on connect) only a non-empty Gmail signature replaces a non-custom one. Returns true when applied.
create function public.gmail_svc_set_gmail_signature(p_profile uuid, p_html text, p_force boolean) returns boolean
language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
declare v_html text := left(coalesce(p_html, ''), 20000);
begin
  update public.mail_accounts set signature_html = v_html, signature_source = 'gmail', signature_synced_at = now(), updated_at = now()
   where profile_id = p_profile and (coalesce(p_force, false) or (signature_source <> 'custom' and btrim(v_html) <> ''));
  if found then return true; end if;
  update public.mail_accounts set signature_synced_at = now() where profile_id = p_profile;
  return false;
end $$;
revoke all on function public.gmail_svc_set_gmail_signature(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.gmail_svc_set_gmail_signature(uuid, text, boolean) to service_role;
