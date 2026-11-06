/* Mint a short-lived Grok voice pass. The xAI key stays in the function secret.
 * Callers cannot name an account. The id comes from the verified Supabase session.
 * No audio or transcript is stored. */
export const TEST_PROJECT_REF = 'aqcervntopidtcazcmlv';
export const TOKEN_SECONDS = 60;
export const MINT_LIMIT = 4;
export const MINT_WINDOW_MS = 10 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function projectRefFromUrl(url) {
  const m = String(url || '').match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/);
  return m ? m[1] : '';
}

/* Comma-separated auth user ids from the function secret. Anything else is ignored. */
export function parseAllowlist(raw) {
  const ids = new Set();
  for (const part of String(raw || '').split(',')) {
    const id = part.trim().toLowerCase();
    if (UUID.test(id)) ids.add(id);
  }
  return ids;
}

export function createMintLog() {
  const hits = new Map();
  return {
    recent(id, now) {
      const list = (hits.get(id) || []).filter((t) => now - t < MINT_WINDOW_MS);
      hits.set(id, list);
      return list.length;
    },
    note(id, now) {
      const list = hits.get(id) || [];
      list.push(now);
      hits.set(id, list);
    },
  };
}

function json(status, body, headers) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}

export async function handleVoiceToken(req, deps) {
  const headers = deps.headers || { 'Cache-Control': 'no-store' };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return json(405, { error: 'Voice is not available on this sign-in.' }, headers);
  if (deps.projectRef !== TEST_PROJECT_REF) return json(403, { error: 'Voice is only available on CLA Portal Live Test.' }, headers);
  let body = {};
  try { body = await req.json(); } catch (e) { body = {}; }
  const action = body && body.action === 'mint' ? 'mint' : 'check';
  const user = await deps.getUser();
  if (!user || !user.id) return json(401, { error: 'Sign in is required.' }, headers);
  if (user.is_anonymous === true) return json(403, { error: 'Voice is not available on this sign-in.' }, headers);
  const allow = deps.allowlist instanceof Set ? deps.allowlist : parseAllowlist(deps.allowlist);
  if (!allow.has(String(user.id).toLowerCase())) return json(403, { error: 'Voice is limited to two test accounts.' }, headers);
  const profile = await deps.profile(user.id);
  if (!profile || profile.status !== 'active') return json(403, { error: 'This account is not active.' }, headers);
  const demo = await deps.demoView();
  if (demo && demo.active) return json(403, { error: 'Leave demo view before using voice.' }, headers);
  if (action === 'check') return json(200, { allowed: true }, headers);
  if (!deps.providerKey) return json(503, { error: 'Grok voice is not configured on the server yet.' }, headers);
  const now = deps.now || Date.now();
  if (deps.mints.recent(user.id, now) >= MINT_LIMIT) return json(429, { error: 'Voice is paused for a few minutes so this test does not run up a bill.' }, headers);
  let minted = null;
  try { minted = await deps.mint(deps.providerKey); } catch (e) { minted = null; }
  if (!minted || typeof minted.value !== 'string') return json(502, { error: 'Grok voice could not be reached. Nothing was recorded.' }, headers);
  deps.mints.note(user.id, now);
  return json(200, { value: minted.value, expires_at: minted.expires_at }, headers);
}
