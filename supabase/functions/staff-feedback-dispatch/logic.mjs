/* Trusted server dispatcher. Not deployed.
 * Defaults off: STAFF_FEEDBACK_DISPATCH_ENABLED must be the string true, and the
 * URL and sender key must be in the function environment. The browser cannot supply them.
 * HTTP 200 from the routine means a run was accepted. It is not a reply.
 * The platform service role, if present, stays inside this process. It is never returned or logged.
 * https://cursor.com/help/grok-bot/routines.md */
export const DISPATCH_HTTP_ENABLED = false;
export const TEST_PROJECT_REF = 'aqcervntopidtcazcmlv';
export const PILOT_IDS = Object.freeze([
  '149e612a-6e14-4ee1-9890-0f29d6f89156',
  'd02722a1-582b-42c0-b3d1-28d25adb758d',
]);
export const PAYLOAD_KEYS = Object.freeze(['event', 'version', 'event_id', 'feedback_id', 'conversation_id']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TERMINAL = new Set(['run_accepted', 'bot_acknowledged', 'replied']);

const envGet = (env, name) => {
  const value = env && typeof env.get === 'function' ? env.get(name) : env ? env[name] : '';
  return typeof value === 'string' ? value : '';
};

export function readBridgeConfig(env) {
  return {
    enabled: envGet(env, 'STAFF_FEEDBACK_DISPATCH_ENABLED') === 'true',
    url: envGet(env, 'STAFF_FEEDBACK_BRIDGE_URL').trim(),
    token: envGet(env, 'STAFF_FEEDBACK_BRIDGE_TOKEN'),
  };
}

function ipv4Private(host) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const o = m.slice(1).map(Number);
  if (o.some((n) => n > 255)) return true;
  const [a, b] = o;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 255) return true;
  return false;
}

export function validateWebhookUrl(raw) {
  let url;
  try { url = new URL(raw); } catch (e) { return { ok: false, reason: 'invalid_url' }; }
  if (url.protocol !== 'https:' || url.username || url.password) return { ok: false, reason: 'invalid_url' };
  if (url.port && url.port !== '443') return { ok: false, reason: 'invalid_url' };
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === 'metadata.google.internal') return { ok: false, reason: 'invalid_url' };
  if (host.includes(':') || ipv4Private(host) || /^\d+$/.test(host)) return { ok: false, reason: 'invalid_url' };
  return { ok: true, url: url.toString() };
}

export function isDispatchPilot(actor) {
  if (!actor || actor.demoActive || actor.viewingAs || actor.isDemo || actor.demoViewActive) return false;
  if ((actor.status || 'active') !== 'active') return false;
  return PILOT_IDS.includes(String(actor.id || '').toLowerCase());
}

function projectHostOk(env) {
  let url;
  try { url = new URL(envGet(env, 'SUPABASE_URL')); } catch (e) { return null; }
  if (url.protocol !== 'https:' || url.hostname !== `${TEST_PROJECT_REF}.supabase.co`) return null;
  return url.origin;
}

/* Verifies the caller JWT. Profile status is read with that same user token, not with a forged body. */
export async function lookupVerifiedUser(req, env, fetchImpl) {
  const header = req && req.headers && req.headers.get ? req.headers.get('authorization') || '' : '';
  if (!header.startsWith('Bearer ')) return null;
  const origin = projectHostOk(env);
  const anon = envGet(env, 'SUPABASE_ANON_KEY');
  if (!origin || !anon || !fetchImpl) return null;
  const headers = { Authorization: header, apikey: anon };
  const res = await fetchImpl(`${origin}/auth/v1/user`, { headers });
  if (!res || !res.ok) return null;
  const body = await res.json();
  const id = body && body.id;
  if (!UUID.test(String(id || ''))) return null;
  const profileRes = await fetchImpl(`${origin}/rest/v1/profiles?id=eq.${id}&select=status,is_demo`, { headers });
  const profiles = profileRes && profileRes.ok ? await profileRes.json() : [];
  const profile = Array.isArray(profiles) ? profiles[0] : null;
  if (!profile) return null;
  return { id, status: profile.status, isDemo: profile.is_demo === true };
}

export async function loadOutboxEvent(eventId, env, fetchImpl, userHeader) {
  if (!UUID.test(String(eventId || ''))) return null;
  const origin = projectHostOk(env);
  const anon = envGet(env, 'SUPABASE_ANON_KEY');
  if (!origin || !anon || !fetchImpl || !userHeader) return null;
  const select = 'id,feedback_id,conversation_id,delivery_state,dispatch_allowed,attempt_count,event_name';
  const res = await fetchImpl(`${origin}/rest/v1/staff_feedback_outbox?id=eq.${eventId}&select=${select}`, { headers: { Authorization: userHeader, apikey: anon } });
  if (!res || !res.ok) return null;
  const rows = await res.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return null;
  return { eventId: row.id, feedbackId: row.feedback_id, conversationId: row.conversation_id, deliveryState: row.delivery_state, dispatchAllowed: row.dispatch_allowed === true, attemptCount: row.attempt_count || 0, eventName: row.event_name };
}

/* Records HTTP 200 only. Uses the platform service role inside the function and does not return it. */
export async function recordAcceptance(eventId, env, fetchImpl) {
  const origin = projectHostOk(env);
  const key = envGet(env, 'SUPABASE_SERVICE_ROLE_KEY');
  if (!origin || !key || !fetchImpl || !UUID.test(String(eventId || ''))) return { ok: false };
  const headers = { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' };
  const patch = await fetchImpl(`${origin}/rest/v1/staff_feedback_outbox?id=eq.${eventId}`, { method: 'PATCH', headers, body: JSON.stringify({ dispatch_allowed: true }) });
  if (!patch || !patch.ok) return { ok: false };
  const rpc = await fetchImpl(`${origin}/rest/v1/rpc/staff_feedback_mark_run_accepted`, { method: 'POST', headers, body: JSON.stringify({ p_event: eventId, p_http: 200 }) });
  return { ok: !!(rpc && rpc.ok) };
}

export function buildPayload(row) {
  const payload = {
    event: 'cla.feedback.created',
    version: 1,
    event_id: row.eventId || row.event_id,
    feedback_id: row.feedbackId || row.feedback_id,
    conversation_id: row.conversationId || row.conversation_id,
  };
  if (Object.keys(payload).join(',') !== PAYLOAD_KEYS.join(',')) throw new Error('payload');
  for (const key of PAYLOAD_KEYS) {
    if (key === 'event' && payload.event !== 'cla.feedback.created') throw new Error('payload');
    if (key === 'version' && payload.version !== 1) throw new Error('payload');
    if (key !== 'event' && key !== 'version' && !UUID.test(String(payload[key] || ''))) throw new Error('payload');
  }
  return payload;
}

function hidden(reason, extra = {}) {
  return { ok: false, sent: false, replied: false, runAccepted: false, botRead: false, transportCalled: false, httpStatus: null, deliveryState: 'pending_dispatch', reason, duplicate: false, ...extra };
}

/* Explicit send for one event. A new row stays dispatch_allowed false until this succeeds. */
export async function explicitDispatch({ actor, row, config, transport, explicit = false } = {}) {
  if (!explicit) return hidden('not_explicit');
  if (!isDispatchPilot(actor)) return hidden('not_pilot', { deliveryState: row && row.deliveryState || 'pending_dispatch' });
  if (!row || (row.eventName || row.event_name) !== 'cla.feedback.created') return hidden('not_a_created_event');
  const state = row.deliveryState || row.delivery_state || 'pending_dispatch';
  if (TERMINAL.has(state)) {
    return { ok: true, sent: false, replied: state === 'replied', runAccepted: true, botRead: state === 'bot_acknowledged' || state === 'replied', transportCalled: false, httpStatus: null, deliveryState: state, reason: 'already_accepted', duplicate: true, dispatchAllowed: row.dispatchAllowed === true };
  }
  if (!config || config.enabled !== true || !config.token) return hidden('bridge_unconfigured');
  const url = validateWebhookUrl(config.url);
  if (!url.ok) return hidden('invalid_url');
  let res;
  let payload;
  try { payload = buildPayload(row); } catch (e) { return hidden('invalid_event'); }
  try {
    res = await transport({ method: 'POST', url: url.url, redirect: 'error', authorization: `Bearer ${config.token}`, payload });
  } catch (e) {
    return { ...hidden('transport_error'), transportCalled: true, attemptCount: (row.attemptCount || 0) + 1, dispatchAllowed: false };
  }
  const status = res && Number(res.status);
  if (status === 200) {
    return { ok: true, sent: false, replied: false, runAccepted: true, botRead: false, transportCalled: true, httpStatus: 200, deliveryState: 'run_accepted', reason: 'run_started', duplicate: false, dispatchAllowed: true, persist: 'mark_run_accepted' };
  }
  return { ...hidden('transport_rejected'), transportCalled: true, httpStatus: Number.isFinite(status) ? status : 0, attemptCount: (row.attemptCount || 0) + 1, dispatchAllowed: false };
}

function safeBody(result) {
  return {
    sent: false,
    replied: false,
    runAccepted: !!result.runAccepted,
    botRead: false,
    duplicate: !!result.duplicate,
    deliveryState: result.deliveryState,
    reason: result.reason,
    httpStatus: result.httpStatus,
    transportCalled: !!result.transportCalled,
  };
}

export function productionDeps(req) {
  const env = globalThis.Deno && globalThis.Deno.env;
  const fetchImpl = globalThis.fetch;
  return {
    request: req,
    env,
    getActor: () => lookupVerifiedUser(req, env, fetchImpl),
    loadEvent: (id) => loadOutboxEvent(id, env, fetchImpl, req.headers.get('authorization') || ''),
    recordAcceptance: (eventId) => recordAcceptance(eventId, env, fetchImpl),
    transport: (call) => fetchImpl(call.url, { method: 'POST', redirect: 'error', headers: { Authorization: call.authorization, 'Content-Type': 'application/json' }, body: JSON.stringify(call.payload) }),
  };
}

export async function handleStaffFeedbackDispatch(deps = {}) {
  const config = readBridgeConfig(deps.env);
  if (config.enabled !== true) {
    return { status: 503, transportCalled: false, body: { sent: false, replied: false, runAccepted: false, deliveryState: 'pending_dispatch', reason: 'bridge_unconfigured', error: 'Dispatch is not enabled. The webhook was not called. Reports stay pending.' } };
  }
  let requestBody = {};
  try { requestBody = deps.body || (deps.request ? await deps.request.json() : {}); } catch (e) { requestBody = {}; }
  const actor = deps.getActor ? await deps.getActor() : null;
  if (!actor || !actor.id) return { status: 401, transportCalled: false, body: { sent: false, replied: false, reason: 'sign_in_required', error: 'Sign in is required.' } };
  const eventId = String(requestBody.event_id || requestBody.eventId || '');
  const row = deps.loadEvent ? await deps.loadEvent(eventId) : null;
  if (!row) return { status: 404, transportCalled: false, body: { sent: false, replied: false, reason: 'event_not_found', error: 'That report event was not found.' } };
  const result = await explicitDispatch({ actor, row, config, transport: deps.transport, explicit: requestBody.explicit === true });
  let recorded = false;
  if (result.persist === 'mark_run_accepted' && deps.recordAcceptance) recorded = !!(await deps.recordAcceptance(row.eventId || row.event_id)).ok;
  const body = safeBody(result);
  body.recorded = recorded;
  if (result.reason === 'not_pilot') return { status: 403, transportCalled: false, body: { ...body, error: 'Portal feedback is not available for this account.' } };
  if (result.reason === 'invalid_url' || result.reason === 'bridge_unconfigured') return { status: 503, transportCalled: false, body: { ...body, error: 'The webhook is not configured for a public HTTPS endpoint.' } };
  return { status: result.duplicate || result.runAccepted ? 200 : 502, transportCalled: !!result.transportCalled, body, persist: result.persist || null };
}
