/* E2E-PROC-GMAIL. No network and no mail. Proves only one login may connect a non-clatitle account. */
import { readFileSync } from 'node:fs';
import { gmailAccountAllowed, E2E_PROCESSOR_LOGIN, E2E_PROCESSOR_GMAIL, b64url, SCOPES } from '../supabase/functions/_shared/gmail-core.mjs';
import { handleOauthStart, handleOauthCallback } from '../supabase/functions/_shared/gmail-handlers.mjs';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const PROC = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const REFRESH = 'refresh-token-do-not-leak';

ok(gmailAccountAllowed(E2E_PROCESSOR_LOGIN, E2E_PROCESSOR_GMAIL), 'the E2E processor may connect clatestportal@gmail.com');
ok(gmailAccountAllowed('  ' + E2E_PROCESSOR_LOGIN.toUpperCase() + ' ', 'CLATESTPORTAL@GMAIL.COM'), 'the same two addresses match with different case and spaces');
ok(gmailAccountAllowed(E2E_PROCESSOR_LOGIN, 'fsantos@clatitle.com') && gmailAccountAllowed('anyone@example.com', 'staff@clatitle.com'), 'an @clatitle.com account is still allowed for this login and for everyone else');

const refused = [
  ['fsantos@clatitle.com', E2E_PROCESSOR_GMAIL],
  ['clatestportal+e2e-buyer@gmail.com', E2E_PROCESSOR_GMAIL],
  ['', E2E_PROCESSOR_GMAIL],
  [null, E2E_PROCESSOR_GMAIL],
  [E2E_PROCESSOR_LOGIN, 'clatestportal+e2e-processor@gmail.com'],
  [E2E_PROCESSOR_LOGIN, 'other@gmail.com'],
  [E2E_PROCESSOR_LOGIN, 'clatestportal@gmail.com.evil'],
  [E2E_PROCESSOR_LOGIN + '.extra', E2E_PROCESSOR_GMAIL],
  ['not-an-email', 'not-an-email'],
];
for (const [portal, google] of refused) {
  ok(!gmailAccountAllowed(portal, google), 'refused: ' + JSON.stringify(portal) + ' / ' + JSON.stringify(google));
}

const sql = readFileSync(new URL('../supabase/migrations/20261123120000_e2e_processor_gmail.sql', import.meta.url), 'utf8');
ok(sql.includes("v_login = 'clatestportal+e2e-processor@gmail.com' and v_email = 'clatestportal@gmail.com'"), 'the database allows only that one login and that one Gmail address');
ok(sql.includes("raise exception 'Only an @clatitle.com Google account can be connected.'"), 'every other non-clatitle address still raises the domain error');
ok(!sql.includes("v_email ~ '^[^@[:space:]]+@gmail\\.com$'"), 'the database does not allow every gmail.com address');

function fake(portalEmail, profileId) {
  const calls = { svc: [], fetch: [] };
  const states = new Map();
  const deps = {
    projectRef: 'aqcervntopidtcazcmlv', clientId: 'cid.apps.googleusercontent.com', clientSecret: 'client-secret-do-not-leak', headers: {},
    getUser: async () => ({ id: profileId }),
    myContext: async () => ({ uid: profileId, viewAs: false, allowed: true, role: 'Processor', email: portalEmail, status: 'active' }),
    svc: async (fn, args) => {
      calls.svc.push({ fn, args });
      if (fn === 'gmail_svc_begin_oauth') { states.set(args.p_state_hash, args); return null; }
      if (fn === 'gmail_svc_take_oauth') { const s = states.get(args.p_state_hash); states.delete(args.p_state_hash); return s ? [{ profile_id: s.p_profile, code_verifier: s.p_verifier }] : []; }
      if (fn === 'gmail_svc_login_email') return portalEmail;
      return null;
    },
    fetch: async (url) => {
      calls.fetch.push(url);
      if (String(url).includes('/revoke')) return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({}) };
      return { ok: false, status: 404, headers: { get: () => null }, json: async () => ({}) };
    },
  };
  return { deps, calls };
}

function google(email, hd) {
  const id = b64url(JSON.stringify({ email, email_verified: true, hd }));
  return async (url) => {
    if (String(url).includes('oauth2.googleapis.com/token')) {
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ access_token: 'ya29.access', refresh_token: REFRESH, scope: SCOPES.join(' '), id_token: 'h.' + id + '.s' }) };
    }
    if (String(url).includes('/revoke')) return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({}) };
    if (String(url).endsWith('/profile')) return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ emailAddress: email, historyId: '1' }) };
    if (String(url).endsWith('/settings/sendAs')) return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ sendAs: [] }) };
    return { ok: false, status: 404, headers: { get: () => null }, json: async () => ({}) };
  };
}

const post = (body) => new Request('https://fn.test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

async function consent(portalEmail, profileId, googleEmail, hd) {
  const f = fake(portalEmail, profileId);
  const started = await handleOauthStart(post({ action: 'start' }), f.deps);
  const start = await started.json();
  const state = new URL(start.url).searchParams.get('state');
  const answer = google(googleEmail, hd);
  f.deps.fetch = async (url, init) => { f.calls.fetch.push(url); return answer(url, init); };
  const cb = await handleOauthCallback(new Request(`https://fn.test/?state=${encodeURIComponent(state)}&code=abc`), f.deps);
  return { start: new URL(start.url), loc: cb.headers.get('Location'), calls: f.calls };
}

{
  const staff = await consent('fsantos@clatitle.com', OTHER, 'fsantos@clatitle.com', 'clatitle.com');
  ok(staff.start.searchParams.get('hd') === 'clatitle.com' && staff.start.searchParams.get('login_hint') === 'fsantos@clatitle.com', 'a normal login still asks Google for an @clatitle.com account');
  ok(staff.loc.endsWith('gmail=connected') && staff.calls.svc.some((c) => c.fn === 'gmail_svc_connect' && c.args.p_email === 'fsantos@clatitle.com'), 'a normal login can still connect its @clatitle.com Gmail');
}
{
  const other = await consent('fsantos@clatitle.com', OTHER, E2E_PROCESSOR_GMAIL, '');
  ok(other.loc.endsWith('gmail=wrong_domain') && !other.calls.svc.some((c) => c.fn === 'gmail_svc_connect') && other.calls.fetch.some((u) => String(u).includes('/revoke')), 'another login cannot connect clatestportal@gmail.com, and the token is revoked');
}
{
  const buyer = await consent('clatestportal+e2e-buyer@gmail.com', OTHER, E2E_PROCESSOR_GMAIL, '');
  ok(buyer.loc.endsWith('gmail=wrong_domain') && !buyer.calls.svc.some((c) => c.fn === 'gmail_svc_connect'), 'a plus-alias of the test inbox cannot connect clatestportal@gmail.com');
}
{
  const proc = await consent(E2E_PROCESSOR_LOGIN, PROC, E2E_PROCESSOR_GMAIL, '');
  ok(!proc.start.searchParams.has('hd') && proc.start.searchParams.get('login_hint') === E2E_PROCESSOR_GMAIL, 'the E2E processor consent is not limited to @clatitle.com and hints the test inbox');
  ok(proc.loc.endsWith('gmail=connected') && proc.calls.svc.some((c) => c.fn === 'gmail_svc_connect' && c.args.p_profile === PROC && c.args.p_email === E2E_PROCESSOR_GMAIL), 'the E2E processor can connect clatestportal@gmail.com');
}
{
  const alias = await consent(E2E_PROCESSOR_LOGIN, PROC, 'clatestportal+e2e-processor@gmail.com', '');
  ok(alias.loc.endsWith('gmail=wrong_domain') && !alias.calls.svc.some((c) => c.fn === 'gmail_svc_connect'), 'the E2E processor cannot connect a different Gmail address');
}

console.log(fail ? fail + ' failed' : 'e2e processor gmail passed');
if (fail) process.exit(1);
