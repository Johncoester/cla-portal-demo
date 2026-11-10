/* One-time test-inbox consent. No network. The fake client secret and refresh token are not credentials. */
import { readFileSync } from 'node:fs';
import { authUrl, SCOPES } from '../supabase/functions/_shared/gmail-core.mjs';
import { b64url } from '../supabase/functions/_shared/gmail-core.mjs';
import { handleE2eGmail, e2eAuthUrl, E2E_REDIRECT_URI, E2E_GMAIL_SCOPES, missingE2eScopes } from '../supabase/functions/_shared/e2e-gmail.mjs';
import { loadGmailVault } from '../tests/e2e-roles/helpers/inbox.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const SECRET = 'client-secret-do-not-leak';
const REFRESH = 'refresh-token-do-not-leak-1234567890';
const CLIENT = '123456789012-abc.apps.googleusercontent.com';
const ADMIN = '149e612a-6e14-4ee1-9890-0f29d6f89156';

const staff = new URL(authUrl({ clientId: 'cid', state: 'st', challenge: 'ch' }));
ok(staff.searchParams.get('hd') === 'clatitle.com' && !/gmail\.modify/.test(staff.searchParams.get('scope')) && staff.searchParams.get('scope') === SCOPES.join(' '), 'staff consent stays an internal @clatitle.com app without trash');
const e2e = new URL(e2eAuthUrl({ clientId: CLIENT, state: 'st', challenge: 'ch' }));
ok(!e2e.searchParams.has('hd') && e2e.searchParams.get('login_hint') === 'clatestportal@gmail.com' && e2e.searchParams.get('redirect_uri') === E2E_REDIRECT_URI, 'test-inbox consent has no workspace domain and uses its own redirect');
ok(E2E_GMAIL_SCOPES.every((s) => e2e.searchParams.get('scope').includes(s)) && missingE2eScopes(e2e.searchParams.get('scope')).length === 0, 'test-inbox consent asks for read, send, and trash');

function deps(over = {}) {
  const logs = [];
  const calls = [];
  const db = { status: over.status || { clientSaved: false, connected: false, closed: false, status: 'open' }, taken: true };
  const base = {
    projectRef: 'aqcervntopidtcazcmlv',
    headers: {},
    logs,
    calls,
    log: (line) => logs.push(line),
    getUser: async () => ({ id: ADMIN }),
    fetch: async (url, init = {}) => {
      calls.push({ url, body: String(init.body || ''), auth: (init.headers && init.headers.Authorization) || '' });
      if (url.includes('oauth2.googleapis.com/token')) {
        return { ok: true, status: 200, json: async () => ({ access_token: 'ya29.access', refresh_token: REFRESH, scope: E2E_GMAIL_SCOPES.join(' ') + ' openid email', id_token: 'h.' + b64url(JSON.stringify({ email: over.email || 'clatestportal@gmail.com', email_verified: true })) + '.s' }) };
      }
      if (url.includes('/revoke')) return { ok: true, status: 200, json: async () => ({}) };
      if (url.endsWith('/profile')) return { ok: over.profileOk !== false, status: 200, json: async () => ({ emailAddress: over.profileEmail || 'clatestportal@gmail.com' }) };
      return { ok: false, status: 404, json: async () => ({}) };
    },
    svc: async (fn, args) => {
      calls.push({ fn, args });
      if (fn === 'e2e_gmail_svc_status') return db.status;
      if (fn === 'e2e_gmail_svc_save_client') { if (over.rejectAdmin) throw new Error('Only an Admin or Super admin can open this setup.'); db.status = { clientSaved: true, connected: false, closed: false, status: 'open' }; return null; }
      if (fn === 'e2e_gmail_svc_begin') { if (db.status.closed) throw new Error('This setup is already finished.'); return null; }
      if (fn === 'e2e_gmail_svc_peek') return db.status.closed ? [] : [{ client_id: CLIENT, code_verifier: 'v'.repeat(50) }];
      if (fn === 'e2e_gmail_svc_take') return db.taken ? [{ client_id: CLIENT, client_secret: SECRET, code_verifier: 'v'.repeat(50) }] : [];
      if (fn === 'e2e_gmail_svc_finish') { db.status = { clientSaved: true, connected: true, closed: true, status: 'closed' }; db.taken = false; return null; }
      if (fn === 'e2e_gmail_svc_abort') { db.taken = false; return null; }
      return null;
    },
  };
  return Object.assign(base, over.deps || {});
}
const quiet = (d) => d.logs.join('\n') + d.calls.filter((c) => c.fn).map((c) => c.fn).join('\n');

const saved = deps();
const saveRes = await handleE2eGmail(new Request('https://aqcervntopidtcazcmlv.supabase.co/functions/v1/e2e-gmail-oauth', { method: 'POST', body: JSON.stringify({ action: 'save', clientId: CLIENT, clientSecret: SECRET }) }), saved);
const saveBody = await saveRes.text();
ok(saveRes.status === 200 && saveBody === '{"ok":true}' && !saveBody.includes(SECRET) && !quiet(saved).includes(SECRET), 'save stores the client and the response does not echo it');

const denied = deps({ rejectAdmin: true });
const denyRes = await handleE2eGmail(new Request('https://aqcervntopidtcazcmlv.supabase.co/functions/v1/e2e-gmail-oauth', { method: 'POST', body: JSON.stringify({ action: 'save', clientId: CLIENT, clientSecret: SECRET }) }), denied);
ok((await denyRes.text()).includes('Only an Admin') && !quiet(denied).includes(SECRET), 'a non-admin is refused and the secret is not logged');

const linked = deps({ status: { clientSaved: true, connected: false, closed: false, status: 'open' } });
const linkRes = await handleE2eGmail(new Request('https://aqcervntopidtcazcmlv.supabase.co/functions/v1/e2e-gmail-oauth', { method: 'POST', body: JSON.stringify({ action: 'link' }) }), linked);
const link = JSON.parse(await linkRes.text());
ok(link.url.startsWith(`${E2E_REDIRECT_URI}?start=`) && !link.url.includes(SECRET), 'the consent link is the one-time redirect and carries no client secret');

const start = deps({ status: { clientSaved: true, connected: false, closed: false, status: 'open' } });
const startRes = await handleE2eGmail(new Request(`${E2E_REDIRECT_URI}?start=abc`), start);
const loc = startRes.headers.get('Location') || '';
ok(startRes.status === 302 && loc.startsWith('https://accounts.google.com/') && loc.includes('gmail.modify') && !loc.includes('hd=') && !loc.includes(SECRET), 'the redirect sends Francis to Google without the client secret');

const done = deps();
const doneRes = await handleE2eGmail(new Request(`${E2E_REDIRECT_URI}?code=authcode&state=abc`), done);
const doneText = await doneRes.text();
ok(doneText.includes('test inbox is connected') && !doneText.includes(REFRESH) && !doneText.includes(SECRET) && !quiet(done).includes(REFRESH) && done.calls.some((c) => c.fn === 'e2e_gmail_svc_finish' && c.args.p_refresh === REFRESH), 'a matching consent stores the refresh token and the page does not show it');

const wrong = deps({ email: 'other@gmail.com' });
const wrongRes = await handleE2eGmail(new Request(`${E2E_REDIRECT_URI}?code=authcode&state=abc`), wrong);
ok((await wrongRes.text()).includes('not clatestportal@gmail.com') && wrong.calls.some((c) => c.fn === 'e2e_gmail_svc_abort') && !wrong.calls.some((c) => c.fn === 'e2e_gmail_svc_finish') && !quiet(wrong).includes(REFRESH), 'a different Google account is revoked and not stored');

const narrow = deps();
narrow.fetch = async (url, init = {}) => {
  if (url.includes('oauth2.googleapis.com/token')) return { ok: true, status: 200, json: async () => ({ access_token: 'ya29.access', refresh_token: REFRESH, scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send', id_token: 'h.' + b64url(JSON.stringify({ email: 'clatestportal@gmail.com', email_verified: true })) + '.s' }) };
  return { ok: true, status: 200, json: async () => ({}) };
};
const narrowRes = await handleE2eGmail(new Request(`${E2E_REDIRECT_URI}?code=authcode&state=abc`), narrow);
ok((await narrowRes.text()).includes('read, send, and trash') && narrow.calls.some((c) => c.fn === 'e2e_gmail_svc_abort') && !narrow.calls.some((c) => c.fn === 'e2e_gmail_svc_finish'), 'consent without trash is not stored');

const again = deps();
again.svc = async (fn) => { again.calls.push({ fn }); if (fn === 'e2e_gmail_svc_take') return []; return null; };
const againRes = await handleE2eGmail(new Request(`${E2E_REDIRECT_URI}?code=authcode&state=abc`), again);
ok((await againRes.text()).includes('expired') && !again.calls.some((c) => c.fn === 'e2e_gmail_svc_finish'), 'a second exchange finds the link already used');

const home = await handleE2eGmail(new Request(E2E_REDIRECT_URI), deps());
ok((await home.text()).includes('Profile Setting'), 'the bare function address points Francis back to Profile Setting');

const env = { SUPABASE_URL: 'https://aqcervntopidtcazcmlv.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-role-test' };
const loaded = await loadGmailVault(env, async () => ({ ok: true, status: 200, json: async () => ({ client_id: CLIENT, client_secret: SECRET, refresh_token: REFRESH }) }));
ok(loaded && env.E2E_GMAIL_REFRESH_TOKEN === REFRESH && env.E2E_GMAIL_CLIENT_SECRET === SECRET, 'the workflow can read the vault row into its own process');
let leaked = false;
try {
  await loadGmailVault({ SUPABASE_URL: 'https://aqcervntopidtcazcmlv.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-role-test' }, async () => ({ ok: false, status: 500, json: async () => ({ error: SECRET }) }));
} catch (e) { leaked = e.message.includes(SECRET); ok(/HTTP 500/.test(e.message), 'a vault failure names only the HTTP status'); }
ok(!leaked, 'a vault failure does not include the response body');
let called = false;
try {
  await loadGmailVault({ SUPABASE_URL: 'https://other.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'x' }, async () => { called = true; return { ok: false, status: 500, json: async () => ({}) }; });
} catch (e) { ok(/not CLA Portal Live Test/.test(e.message), 'vault load refuses any project except TEST'); }
ok(!called, 'a non-TEST project is not called');

const mig = readFileSync(new URL('../supabase/migrations/20261110180000_e2e_gmail_vault.sql', import.meta.url), 'utf8');
const rb = readFileSync(new URL('../supabase/rollbacks/20261110180000_e2e_gmail_vault.sql', import.meta.url), 'utf8');
const fn = readFileSync(new URL('../supabase/functions/_shared/e2e-gmail.mjs', import.meta.url), 'utf8');
ok(!/insert\s+into\s+auth\.users/i.test(mig) && mig.includes('grant execute on function public.%s to service_role') && mig.includes('revoke all on function public.%s from public, anon, authenticated'), 'SQL grants the credentials function to service_role only');
ok(!fn.includes('e2e_gmail_credentials') && !/console\./.test(fn), 'the redirect never reads the stored token back and does not log itself');
ok(rb.includes("name in ('e2e_gmail_client_id', 'e2e_gmail_client_secret', 'e2e_gmail_refresh_token')") && !/like\s+'gmail_refresh/.test(rb), 'rollback deletes only the three e2e vault names');

if (fail) { console.log(`${fail} failed`); process.exit(1); }
console.log('e2e gmail setup ok');
