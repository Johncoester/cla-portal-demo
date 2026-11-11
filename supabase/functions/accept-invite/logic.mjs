// Decision logic for accept-invite. No service-role key and no network.
// index.ts wires the Supabase service client. Node tests call this file directly.
export const PORTAL_ORIGINS = ['https://johncoester.github.io', 'https://testportal.clatitle.com'];
export const ALLOWED_ORIGIN = PORTAL_ORIGINS[0];
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
  const allow = PORTAL_ORIGINS.includes(origin);
  if (allow) headers['Access-Control-Allow-Origin'] = origin;
  return { allow, headers };
}

export function checkBody(body) {
  if (!body || typeof body !== 'object') return { ok: false, status: 400, error: GENERIC };
  const kind = body.kind;
  const token = typeof body.token === 'string' ? body.token.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (kind !== 'hr' && kind !== 'agent') return { ok: false, status: 400, error: GENERIC };
  if (!/^[0-9a-f]{64}$/.test(token)) return { ok: false, status: 400, error: GENERIC };
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

// deps: { sha256(text), gate(key)->bool, email(kind, token)->string|null, createUser({email,password,email_confirm})->{id}, deleteUser(id), accept(kind, token, userId, profile),
//         findStub(email)->{id, invited, hasProfile}|null, claimStub(id, password) }   (an Auth invite-only login, Nov 11)
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
    let user;
    try {
      user = await deps.createUser({ email, password: checked.password, email_confirm: true });
    } catch {
      // John, Nov 11: the invite email now comes from TEST Auth (testportal@clatitle.com), which makes an invite-only
      // login first. That login is claimed here only if Auth invited it and it never became a portal user.
      let stub = null;
      try { stub = typeof deps.findStub === 'function' ? await deps.findStub(email) : null; } catch { stub = null; }
      if (!stub || !stub.id || !stub.invited || stub.hasProfile || typeof deps.claimStub !== 'function') return json(headers, 400, { error: GENERIC });
      try { await deps.claimStub(stub.id, checked.password); } catch { return json(headers, 400, { error: GENERIC }); }
      user = { id: stub.id };
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
