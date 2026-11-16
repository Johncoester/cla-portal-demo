-- Rollback for 20261123120000_e2e_processor_gmail.sql. Restores the @clatitle.com-only connect check.
-- TEST only. Does not delete mail already connected.

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

create or replace function public.gmail_svc_connect(p_profile uuid, p_email text, p_refresh text, p_scopes text, p_history text) returns void
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

drop function if exists public.gmail_svc_login_email(uuid);

commit;
