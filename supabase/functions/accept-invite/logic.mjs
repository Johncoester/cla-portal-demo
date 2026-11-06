// Decision logic for accept-invite. No service-role key and no network.
// index.ts wires the Supabase service client. Node tests call this file directly.
export const ALLOWED_ORIGIN = 'https://johncoester.github.io';
export const GENERIC = 'This invite link is not valid or has expired.';
export const SAFE_FIELD = new Set([
  'First name, last name and cell phone are required.',
  'Use the invited email.',
  'Cell phone must be a 10-digit phone number.',
  'Office phone must be a 10-digit phone number.',
  'Date of birth must be a real month and day.',
]);
const PROFILE_KEYS = ['firstName', 'lastName', 'email', 'cellPhone', 'officePhone', 'brokerage', 'licenseNumber', 'street', 'city', 'state', 'zip', 'otherContact', 'birthMonth', 'birthDay', 'photoShape'];

export function corsFor(origin) {
  const headers = {
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
  const allow = origin === ALLOWED_ORIGIN;
  if (allow) headers['Access-Control-Allow-Origin'] = ALLOWED_ORIGIN;
  return { allow, headers };
}

export function checkBody(body) {
  if (!body || typeof body !== 'object') return { ok: false, status: 400, error: GENERIC };
  const kind = body.kind;
  const token = typeof body.token === 'string' ? body.token.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (kind !== 'hr' && kind !== 'agent' && kind !== 'client') return { ok: false, status: 400, error: GENERIC };
  if (!/^[0-9a-f]{64}$/.test(token)) return { ok: false, status: 400, error: GENERIC };
  if (body.existing === true) {
    if (kind !== 'client') return { ok: false, status: 400, error: GENERIC };
    return { ok: true, kind, token, password: '', profile: {}, existing: true };
  }
  if (password.length < 8 || password.length > 72) return { ok: false, status: 400, error: 'Password must be at least 8 characters.' };
  const profile = {};
  if (kind === 'agent' && body.profile && typeof body.profile === 'object') {
    for (const k of PROFILE_KEYS) if (body.profile[k] != null && k !== 'photo') profile[k] = body.profile[k];
  }
  return { ok: true, kind, token, password, profile };
}

function json(headers, status, body) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

// deps: { sha256(text), gate(key)->bool, email(kind, token)->string|null, createUser({email,password,email_confirm})->{id}, deleteUser(id), accept(kind, token, userId, profile) }
export async function handleAcceptInvite(req, deps) {
  const origin = req.headers.get('origin') || '';
  const { allow, headers } = corsFor(origin);
  try {
    if (req.method === 'OPTIONS') return new Response(null, { status: origin && !allow ? 403 : 204, headers });
    if (req.method !== 'POST') return json(headers, 405, { error: GENERIC });
    if (origin && !allow) return json(headers, 403, { error: GENERIC });
    const ip = (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim() || 'unknown';
    if (!(await deps.gate(await deps.sha256('ip:' + ip)))) return json(headers, 429, { error: GENERIC });
    let body;
    try { body = await req.json(); } catch { return json(headers, 400, { error: GENERIC }); }
    const checked = checkBody(body);
    if (!checked.ok) return json(headers, checked.status, { error: checked.error });
    if (!(await deps.gate(await deps.sha256('tok:' + checked.token)))) return json(headers, 429, { error: GENERIC });
    const email = await deps.email(checked.kind, checked.token);
    if (!email || typeof email !== 'string' || !email.includes('@')) return json(headers, 400, { error: GENERIC });
    if (checked.existing) {
      const session = typeof deps.sessionUser === 'function' ? await deps.sessionUser(req) : null;
      const sid = session && session.id;
      const sem = session && String(session.email || '').toLowerCase();
      if (!sid || sem !== String(email).toLowerCase()) return json(headers, 400, { error: GENERIC });
      try {
        await deps.accept(checked.kind, checked.token, sid, { existing: true });
      } catch (err) {
        const msg = err && err.code === '22023' && SAFE_FIELD.has(err.message) ? err.message : GENERIC;
        return json(headers, 400, { error: msg });
      }
      return json(headers, 200, { ok: true, linked: true });
    }
    let user;
    try {
      user = await deps.createUser({ email, password: checked.password, email_confirm: true });
    } catch {
      return json(headers, 400, { error: GENERIC });
    }
    if (!user || !user.id) return json(headers, 400, { error: GENERIC });
    try {
      await deps.accept(checked.kind, checked.token, user.id, checked.profile);
    } catch (err) {
      try { await deps.deleteUser(user.id); } catch { /* the login was not linked */ }
      const msg = err && err.code === '22023' && SAFE_FIELD.has(err.message) ? err.message : GENERIC;
      return json(headers, 400, { error: msg });
    }
    return json(headers, 200, { ok: true });
  } catch {
    return json(headers, 400, { error: GENERIC });
  }
}
