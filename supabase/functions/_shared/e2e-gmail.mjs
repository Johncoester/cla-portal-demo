/* One-time TEST consent for clatestportal@gmail.com. The staff Gmail client is not used.
 * Nothing here logs a client secret, an authorization code, or a token. */
import { TEST_PROJECT_REF, randomToken, sha256Hex, pkceChallenge, decodeJwtPayload, corsHeaders, json } from './gmail-core.mjs';

export const E2E_PROJECT_REF = TEST_PROJECT_REF;
export const E2E_REDIRECT_URI = 'https://aqcervntopidtcazcmlv.supabase.co/functions/v1/e2e-gmail-oauth';
export const E2E_MAILBOX = 'clatestportal@gmail.com';
export const E2E_GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
];
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const PROFILE_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/profile';

export function e2eAuthUrl({ clientId, state, challenge }) {
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: E2E_REDIRECT_URI,
    response_type: 'code',
    scope: ['openid', 'email', ...E2E_GMAIL_SCOPES].join(' '),
    access_type: 'offline',
    prompt: 'consent select_account',
    login_hint: E2E_MAILBOX,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`;
}

export function missingE2eScopes(granted) {
  const have = String(granted || '').split(/\s+/);
  return E2E_GMAIL_SCOPES.filter((s) => !have.includes(s));
}

const PAGES = {
  connected: [200, 'The test inbox is connected. You can close this tab.'],
  home: [200, 'Open Profile Setting on the test portal to connect the test inbox. This address is only the Google redirect.'],
  closed: [410, 'This setup is already finished. Open Profile Setting on the test portal if you need to allow one new consent.'],
  wrong_account: [400, 'That was not clatestportal@gmail.com. Go back to Profile Setting, open the consent page again, and choose clatestportal@gmail.com.'],
  missing_scope: [400, 'Google did not grant read, send, and trash. Go back to Profile Setting and allow all of them.'],
  denied: [400, 'Google consent was cancelled. Go back to Profile Setting and open the consent page again.'],
  expired: [410, 'That consent link expired. Go back to Profile Setting and open the consent page again.'],
  failed: [400, 'The connection did not finish. Go back to Profile Setting and open the consent page again.'],
  test_only: [404, 'This setup runs on CLA Portal Live Test only.'],
};
function page(code) {
  const pair = PAGES[code] || PAGES.failed;
  return new Response(pair[1], { status: pair[0], headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' } });
}
const note = (deps, code) => { try { (deps.log || (() => {}))(`e2e-gmail-oauth ${code}`); } catch (e) { /* a log failure never changes the response */ } };
const rowOf = (x) => (Array.isArray(x) ? x[0] : x) || null;
function safeSql(message) {
  const s = String(message || '');
  if (s.length > 240 || /refresh|secret|ya29\.|client_secret|access_token/i.test(s)) return 'The database refused the request.';
  return s;
}

function clientPair(id, secret) {
  const clientId = String(id || '').trim();
  const clientSecret = String(secret || '').trim();
  if (!/^[0-9A-Za-z-]{10,}\.apps\.googleusercontent\.com$/.test(clientId)) return null;
  if (clientSecret.length < 16 || clientSecret.length > 256 || /\s/.test(clientSecret)) return null;
  return { clientId, clientSecret };
}

async function googleForm(deps, url, form) {
  const res = await deps.fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString() });
  let body = {}; try { body = await res.json(); } catch (e) { body = {}; }
  return { ok: res.ok, status: res.status, body };
}
async function revoke(deps, token) {
  if (!token) return;
  try { await deps.fetch(REVOKE_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }).toString() }); } catch (e) { /* the stored token was not kept */ }
}

async function adminPost(req, deps) {
  const H = deps.headers;
  const user = await deps.getUser();
  if (!user) return json(401, { error: 'Please sign in.' }, H);
  let body = {}; try { body = await req.json(); } catch (e) { body = {}; }
  const action = body && typeof body.action === 'string' ? body.action : 'status';
  try {
    if (action === 'status') return json(200, await deps.svc('e2e_gmail_svc_status', { p_actor: user.id }) || {}, H);
    if (action === 'save') {
      const pair = clientPair(body.clientId, body.clientSecret);
      if (!pair) return json(400, { error: 'Paste the web client id and its secret from the Google client you just created.' }, H);
      await deps.svc('e2e_gmail_svc_save_client', { p_actor: user.id, p_client_id: pair.clientId, p_client_secret: pair.clientSecret });
      return json(200, { ok: true }, H);
    }
    if (action === 'reopen') {
      await deps.svc('e2e_gmail_svc_reopen', { p_actor: user.id });
      return json(200, { ok: true }, H);
    }
    if (action === 'link') {
      const state = randomToken(32);
      const verifier = randomToken(48);
      await deps.svc('e2e_gmail_svc_begin', { p_actor: user.id, p_state_hash: await sha256Hex(state), p_verifier: verifier });
      return json(200, { url: `${E2E_REDIRECT_URI}?start=${encodeURIComponent(state)}` }, H);
    }
  } catch (e) {
    note(deps, 'admin');
    return json(400, { error: safeSql(e && e.message) }, H);
  }
  return json(400, { error: 'Unknown action.' }, H);
}

async function startRedirect(state, deps) {
  if (!state || state.length > 200) return page('expired');
  const peeked = rowOf(await deps.svc('e2e_gmail_svc_peek', { p_state_hash: await sha256Hex(state) }));
  if (!peeked || !peeked.client_id || !peeked.code_verifier) return page('expired');
  const url = e2eAuthUrl({ clientId: peeked.client_id, state, challenge: await pkceChallenge(peeked.code_verifier) });
  return new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}

async function finishConsent(req, deps) {
  const u = new URL(req.url);
  const state = u.searchParams.get('state') || '';
  const code = u.searchParams.get('code') || '';
  const err = u.searchParams.get('error') || '';
  if (!state || state.length > 200) return page('failed');
  const taken = rowOf(await deps.svc('e2e_gmail_svc_take', { p_state_hash: await sha256Hex(state) }));
  if (!taken || !taken.client_id || !taken.client_secret || !taken.code_verifier) return page('expired');
  const fail = async (why, token) => { await revoke(deps, token); try { await deps.svc('e2e_gmail_svc_abort'); } catch (e) { note(deps, 'abort'); } note(deps, why); return page(why); };
  if (err) return fail('denied');
  if (!code) return fail('failed');
  const t = await googleForm(deps, TOKEN_URL, { code, client_id: taken.client_id, client_secret: taken.client_secret, redirect_uri: E2E_REDIRECT_URI, grant_type: 'authorization_code', code_verifier: taken.code_verifier });
  if (!t.ok || !t.body.access_token) return fail('failed');
  const tok = t.body;
  if (missingE2eScopes(tok.scope).length) return fail('missing_scope', tok.refresh_token || tok.access_token);
  const idp = decodeJwtPayload(tok.id_token) || {};
  const email = String(idp.email || '').toLowerCase();
  if (!idp.email_verified || email !== E2E_MAILBOX) return fail('wrong_account', tok.refresh_token || tok.access_token);
  const prof = await deps.fetch(PROFILE_URL, { headers: { Authorization: `Bearer ${tok.access_token}` } });
  let profile = {}; try { profile = await prof.json(); } catch (e) { profile = {}; }
  if (!prof.ok || String(profile.emailAddress || '').toLowerCase() !== E2E_MAILBOX) return fail('wrong_account', tok.refresh_token || tok.access_token);
  if (!tok.refresh_token) return fail('failed', tok.access_token);
  try {
    await deps.svc('e2e_gmail_svc_finish', { p_refresh: tok.refresh_token, p_email: email, p_scopes: String(tok.scope || '') });
  } catch (e) {
    return fail('failed', tok.refresh_token);
  }
  note(deps, 'connected');
  return page('connected');
}

export async function handleE2eGmail(req, deps) {
  if (deps.projectRef !== E2E_PROJECT_REF) return req.method === 'GET' ? page('test_only') : json(404, { error: 'This setup runs on CLA Portal Live Test only.' }, deps.headers);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: deps.headers });
  if (req.method === 'POST') return adminPost(req, deps);
  if (req.method !== 'GET') return page('failed');
  const u = new URL(req.url);
  const start = u.searchParams.get('start') || '';
  if (start) return startRedirect(start, deps);
  if (u.searchParams.get('code') || u.searchParams.get('error') || u.searchParams.get('state')) return finishConsent(req, deps);
  return page('home');
}

export const e2eCors = corsHeaders;
