#!/usr/bin/env bash
# Apply the test-inbox vault migration on local Postgres, roll it back, and apply it again.
# Does not print secret values and does not touch TEST.
set -euo pipefail
root=$(cd "$(dirname "$0")/../../.." && pwd)
db=${E2E_LOCAL_DB:-e2e_gmail_proof}
psql=(psql -v ON_ERROR_STOP=1 -X -q)
mig="$root/supabase/migrations/20261110180000_e2e_gmail_vault.sql"
rb="$root/supabase/rollbacks/20261110180000_e2e_gmail_vault.sql"

dropdb --if-exists "$db"
createdb "$db"
"${psql[@]}" -d "$db" -f "$root/tests/e2e-roles/sql/e2e-gmail-vault-stub.sql"
"${psql[@]}" -d "$db" -f "$mig"

if "${psql[@]}" -d "$db" -f "$mig" >/tmp/e2e-gmail-second.out 2>&1; then
  echo "second apply should have raised" >&2
  exit 1
fi
grep -q 'e2e gmail setup already exists' /tmp/e2e-gmail-second.out
rm -f /tmp/e2e-gmail-second.out
echo "second apply raised"

"${psql[@]}" -d "$db" <<'SQL'
do $$
declare
  admin uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  staff uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  cid text := '123456789012-abc.apps.googleusercontent.com';
  sec text := 'proof-client-secret-value';
  refresh text := 'proof-refresh-token-value-123456';
  got text;
  cred jsonb;
  state_hash text := repeat('ab', 32);
  verifier text := repeat('v', 50);
begin
  begin
    perform public.e2e_gmail_svc_save_client(staff, cid, sec);
    raise exception 'non-admin save was allowed';
  exception when insufficient_privilege then null;
  end;
  if private.e2e_gmail_vault_get('e2e_gmail_client_secret') is not null then
    raise exception 'a refused save stored a client';
  end if;
  perform public.e2e_gmail_svc_save_client(admin, cid, sec);
  if private.e2e_gmail_vault_get('e2e_gmail_client_id') is distinct from cid
     or private.e2e_gmail_vault_get('e2e_gmail_client_secret') is distinct from sec then
    raise exception 'admin save did not store the client';
  end if;
  perform public.e2e_gmail_svc_save_client(admin, cid, sec);
  perform public.e2e_gmail_svc_begin(admin, state_hash, verifier);
  select t.client_secret into got from public.e2e_gmail_svc_take(state_hash) t;
  if got is distinct from sec then raise exception 'take did not return the stored client'; end if;
  if exists (select 1 from public.e2e_gmail_svc_take(state_hash)) then raise exception 'take was not one-time'; end if;
  perform public.e2e_gmail_svc_finish(refresh, 'clatestportal@gmail.com',
    'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.modify');
  cred := public.e2e_gmail_credentials();
  if cred->>'client_id' is distinct from cid or cred->>'client_secret' is distinct from sec or cred->>'refresh_token' is distinct from refresh then
    raise exception 'credentials did not match what was stored';
  end if;
  begin
    perform public.e2e_gmail_svc_begin(admin, state_hash, verifier);
    raise exception 'begin worked after the redirect closed';
  exception when others then
    if sqlerrm not like '%already finished%' then raise; end if;
  end;
  perform public.e2e_gmail_svc_reopen(admin);
  if private.e2e_gmail_vault_get('e2e_gmail_refresh_token') is distinct from refresh then
    raise exception 'reopen removed the stored token';
  end if;
  cred := public.e2e_gmail_credentials();
  if cred->>'refresh_token' is distinct from refresh then raise exception 'credentials stopped after reopen'; end if;
  if has_function_privilege('authenticated', 'public.e2e_gmail_credentials()', 'execute')
     or has_function_privilege('anon', 'public.e2e_gmail_svc_take(text)', 'execute') then
    raise exception 'a public role can read the secrets';
  end if;
  if (select secret from vault.secrets where name = 'gmail_refresh_kept') is distinct from 'staff-refresh-kept' then
    raise exception 'the staff token changed';
  end if;
end $$;
SQL
echo "save, one-time exchange, and service-role read passed"

"${psql[@]}" -d "$db" -f "$rb"
"${psql[@]}" -d "$db" -f "$rb"
"${psql[@]}" -d "$db" <<'SQL'
do $$
begin
  if to_regclass('private.e2e_gmail_setup') is not null then raise exception 'rollback left the setup table'; end if;
  if exists (select 1 from vault.secrets where name like 'e2e_gmail_%') then raise exception 'rollback left an e2e vault secret'; end if;
  if (select secret from vault.secrets where name = 'gmail_refresh_kept') is distinct from 'staff-refresh-kept' then
    raise exception 'rollback deleted the staff token';
  end if;
end $$;
SQL
echo "rollback twice left the staff token"

"${psql[@]}" -d "$db" -f "$mig"
echo "reapplied after rollback"
echo "local gmail vault proof ok"
