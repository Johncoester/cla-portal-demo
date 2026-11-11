/* Vault-or-env decision for the inbox spec. Fake fetch only. No token is printed. */
import { gmailCredentials, invitePathFromText } from '../tests/e2e-roles/helpers/inbox.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const empty = await gmailCredentials({});
ok(!empty.ok && !empty.required && empty.message.includes('E2E_GMAIL_CLIENT_ID') && empty.message.includes('E2E_GMAIL_REFRESH_TOKEN'), 'empty env names the missing variables');
ok(!/ya29|refresh_token=|client_secret=/.test(empty.message), 'the miss does not contain a token');

const required = await gmailCredentials({ E2E_REQUIRE_EMAIL: '1' });
ok(!required.ok && required.required, 'the workflow flag turns a miss into a failure');

const ready = await gmailCredentials({
  E2E_GMAIL_CLIENT_ID: 'already-id',
  E2E_GMAIL_CLIENT_SECRET: 'already-secret',
  E2E_GMAIL_REFRESH_TOKEN: 'already-refresh',
});
ok(ready.ok && ready.message === '', 'values already in the environment skip the vault');

const vaultEnv = {
  SUPABASE_URL: 'https://aqcervntopidtcazcmlv.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-not-a-gmail-token',
};
let auth = '';
const loaded = await gmailCredentials(vaultEnv, async (url, init) => {
  auth = (init.headers && init.headers.Authorization) || '';
  ok(String(url).includes('/rpc/e2e_gmail_credentials'), 'the vault read is the credentials function');
  return { ok: true, json: async () => ({ client_id: 'vault-id', client_secret: 'vault-secret', refresh_token: 'vault-refresh' }) };
});
ok(loaded.ok && vaultEnv.E2E_GMAIL_REFRESH_TOKEN === 'vault-refresh' && auth.includes('service-role-not-a-gmail-token'), 'a vault row fills the three names');
ok(!loaded.message.includes('vault-refresh') && !loaded.message.includes('vault-secret'), 'the result does not repeat the vault values');

const note = 'clatestportal+e2e-used-invite@gmail.com\n#/agent-invite/' + 'ab'.repeat(32);
ok(invitePathFromText(note, 'clatestportal+e2e-used-invite@gmail.com') === '#/agent-invite/' + 'ab'.repeat(32), 'the remembered note keeps the invite path');
ok(invitePathFromText(note, 'someone-else@gmail.com') === '', 'a note for another address is ignored');

console.log(fail ? fail + ' failed' : 'gmail credentials passed');
if (fail) process.exit(1);
