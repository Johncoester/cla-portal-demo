/* Trusted server dispatcher for the TEST webhook pilot.
 * STAFF_FEEDBACK_DISPATCH_ENABLED must be the string true, and the URL and sender key
 * must be in the function environment. The browser cannot supply them.
 * HTTP 200 from the routine means a run was accepted. It is not a reply.
 * JWT verification stays on. The platform service role, if present, stays inside this process.
 * https://cursor.com/help/grok-bot/routines.md */
export const DISPATCH_HTTP_ENABLED = true;
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

const PORTAL_ORIGINS = Object.freeze(['https://testportal.clatitle.com', 'https://johncoester.github.io']);

export function corsHeaders(origin) {
  const headers = {
    'Cache-Control': 'no-store',
    Vary: 'Origin',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (PORTAL_ORIGINS.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function addressIsPublic(addr) {
  const host = String(addr || '').toLowerCase();
  if (!host || host === '::' || host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) return false;
  if (host.includes(':') && host.includes('.')) return false;
  if (host.includes(':')) return true;
  return !ipv4Private(host);
}

export function addressesArePublic(list) {
  if (!Array.isArray(list) || !list.length) return false;
  return list.every(addressIsPublic);
}

/* Deno.resolveDns adapter. A missing AAAA record is empty. Any other failure returns no addresses. */
export async function resolveHostAddresses(hostname, resolveDns) {
  const name = String(hostname || '').trim().replace(/\.+$/, '').toLowerCase();
  if (!name || typeof resolveDns !== 'function') return [];
  const collect = async (kind) => {
    try {
      const rows = await resolveDns(name, kind);
      return Array.isArray(rows) ? rows.map((item) => String(item)) : [];
    } catch (err) {
      if (err && (err.name === 'NotFound' || err.code === 'NotFound')) return [];
      return null;
    }
  };
  const v4 = await collect('A');
  const v6 = await collect('AAAA');
  if (v4 === null || v6 === null) return [];
  return v4.concat(v6);
}

export function validateWebhookUrl(raw, hostPin, addresses) {
  let url;
  try { url = new URL(raw); } catch (e) { return { ok: false, reason: 'invalid_url' }; }
  if (url.protocol !== 'https:' || url.username || url.password) return { ok: false, reason: 'invalid_url' };
  if (url.port && url.port !== '443') return { ok: false, reason: 'invalid_url' };
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const pin = String(hostPin || '').toLowerCase();
  if (!pin || host !== pin) return { ok: false, reason: 'host_not_pinned' };
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === 'metadata.google.internal') return { ok: false, reason: 'invalid_url' };
  if (host.includes(':') || ipv4Private(host) || /^\d+$/.test(host)) return { ok: false, reason: 'invalid_url' };
  if (!addressesArePublic(addresses)) return { ok: false, reason: 'dns_private' };
  return { ok: true, url: url.toString(), host };
}

export function isDispatchPilot(actor) {
  if (!actor || actor.demoActive || actor.viewingAs || actor.demoViewActive) return false;
  if (actor.status !== 'active' || actor.isDemo !== false) return false;
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
  if (!profile || profile.status !== 'active' || profile.is_demo !== false) return null;
  return { id, status: 'active', isDemo: false };
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

async function serviceRpc(name, args, env, fetchImpl) {
  const origin = projectHostOk(env);
  const key = envGet(env, 'SUPABASE_SERVICE_ROLE_KEY');
  if (!origin || !key || !fetchImpl) return null;
  const res = await fetchImpl(`${origin}/rest/v1/rpc/${name}`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  if (!res || !res.ok) return null;
  return res.json();
}

export async function claimDispatch(eventId, claimId, env, fetchImpl) {
  const body = await serviceRpc('staff_feedback_claim_dispatch', { p_event: eventId, p_claim: claimId }, env, fetchImpl);
  if (!body || body.claimed !== true) return { claimed: false, reason: body && body.reason || 'in_progress' };
  return { claimed: true, claimId, reason: 'claimed' };
}

/* One database call records the outcome. HTTP success from the RPC is not enough. */
export async function recordAcceptance(eventId, claimId, env, fetchImpl) {
  const body = await serviceRpc('staff_feedback_finish_dispatch', { p_event: eventId, p_claim: claimId, p_outcome: 'run_accepted', p_http: 200 }, env, fetchImpl);
  return { ok: !!(body && body.ok === true && body.delivery_state === 'run_accepted') };
}

const STORED_OUTCOMES = new Set(['accepted_unrecorded', 'outcome_unknown', 'transport_rejected']);

/* Persists a non-reply outcome with the same claim. It does not post the webhook. */
export async function recordDispatchOutcome(eventId, claimId, outcome, httpStatus, env, fetchImpl) {
  if (!STORED_OUTCOMES.has(outcome) || !UUID.test(String(eventId || '')) || !UUID.test(String(claimId || ''))) return { ok: false };
  try {
    const body = await serviceRpc('staff_feedback_finish_dispatch', {
      p_event: eventId, p_claim: claimId, p_outcome: outcome, p_http: Number.isInteger(httpStatus) ? httpStatus : null,
    }, env, fetchImpl);
    return { ok: !!(body && body.ok === true && body.outcome === outcome) };
  } catch (e) {
    return { ok: false };
  }
}

/* Native Response. A 204 has no body. CORS headers from the handler are kept. */
export function toDispatchResponse(result) {
  const headers = new Headers(result && result.headers || {});
  headers.set('Cache-Control', 'no-store');
  const status = result && Number(result.status) || 500;
  if (status === 101 || status === 204 || status === 205 || status === 304) {
    headers.delete('Content-Type');
    return new Response(null, { status, headers });
  }
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const payload = result && result.body != null ? result.body : {};
  return new Response(JSON.stringify(payload), { status, headers });
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
    return { ok: true, sent: false, replied: false, runAccepted: true, botRead: false, transportCalled: false, httpStatus: null, deliveryState: state, reason: 'already_accepted', duplicate: true, dispatchAllowed: row.dispatchAllowed === true, exactlyOnce: false };
  }
  if (state !== 'pending_dispatch') return hidden('not_eligible', { deliveryState: state });
  if (!config || config.enabled !== true || !config.token) return hidden('bridge_unconfigured');
  const url = validateWebhookUrl(config.url, config.host, config.addresses);
  if (!url.ok) return hidden(url.reason || 'invalid_url');
  let res;
  let payload;
  try { payload = buildPayload(row); } catch (e) { return hidden('invalid_event'); }
  try {
    res = await transport({ method: 'POST', url: url.url, redirect: 'error', authorization: `Bearer ${config.token}`, payload });
  } catch (e) {
    return { ...hidden('outcome_unknown'), transportCalled: true, attemptCount: (row.attemptCount || 0) + 1, dispatchAllowed: false, exactlyOnce: false, receiverMustDedupe: true };
  }
  const status = res && Number(res.status);
  if (status === 200) {
    return { ok: true, sent: false, replied: false, runAccepted: true, botRead: false, transportCalled: true, httpStatus: 200, deliveryState: 'run_accepted', reason: 'run_started', duplicate: false, dispatchAllowed: false, persist: 'mark_run_accepted', exactlyOnce: false, receiverMustDedupe: true };
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

const LEASE_MS = 120000;

/* In-memory CAS used by tests. The database function is the installed claim. */
export function claimPending(rows, eventId, claimId, now, leaseMs = LEASE_MS) {
  const row = rows.find((r) => (r.eventId || r.id) === eventId);
  if (!row || row.deliveryState !== 'pending_dispatch' || row.eventName !== 'cla.feedback.created') return { claimed: false, reason: 'not_eligible' };
  if (row.outcome === 'accepted_unrecorded') return { claimed: false, reason: 'accepted_unrecorded', row };
  if (row.outcome === 'outcome_unknown') return { claimed: false, reason: 'needs_reconciliation', row };
  if (row.claimId && row.claimedAt && now - row.claimedAt < leaseMs && row.claimId !== claimId) return { claimed: false, reason: 'in_progress' };
  row.claimId = claimId;
  row.claimedAt = now;
  row.attemptCount = (row.attemptCount || 0) + 1;
  row.outcome = 'claimed';
  return { claimed: true, row };
}

export function productionDeps(req, platform = globalThis) {
  const deno = platform.Deno;
  const env = deno && deno.env;
  const fetchImpl = platform.fetch;
  const resolveDns = deno && typeof deno.resolveDns === 'function' ? deno.resolveDns.bind(deno) : null;
  return {
    request: req,
    env,
    getActor: () => lookupVerifiedUser(req, env, fetchImpl),
    loadEvent: (id) => loadOutboxEvent(id, env, fetchImpl, req.headers.get('authorization') || ''),
    claim: async (eventId) => { const claimId = platform.crypto.randomUUID(); return { ...(await claimDispatch(eventId, claimId, env, fetchImpl)), claimId }; },
    recordAcceptance: (eventId, claimId) => recordAcceptance(eventId, claimId, env, fetchImpl),
    recordOutcome: ({ eventId, claimId, outcome, http }) => recordDispatchOutcome(eventId, claimId, outcome, http, env, fetchImpl),
    resolveHost: (host) => resolveHostAddresses(host, resolveDns),
    transport: (call) => fetchImpl(call.url, { method: 'POST', redirect: 'error', headers: { Authorization: call.authorization, 'Content-Type': 'application/json' }, body: JSON.stringify(call.payload) }),
  };
}

function withCors(deps, status, body, extra = {}) {
  const origin = deps.request && deps.request.headers && deps.request.headers.get ? deps.request.headers.get('origin') : deps.origin;
  return { status, headers: corsHeaders(origin || ''), transportCalled: !!extra.transportCalled, body: { ...body, exactlyOnce: false, receiverMustDedupe: true } };
}

export async function handleStaffFeedbackDispatch(deps = {}) {
  const method = deps.request && deps.request.method ? deps.request.method : deps.method || 'POST';
  if (method === 'OPTIONS') return { status: 204, headers: corsHeaders((deps.request && deps.request.headers.get('origin')) || deps.origin || ''), body: null, transportCalled: false };
  const config = readBridgeConfig(deps.env);
  if (deps.allowSend !== true || config.enabled !== true) {
    return withCors(deps, 503, { sent: false, replied: false, runAccepted: false, deliveryState: 'pending_dispatch', reason: 'bridge_unconfigured', error: 'Dispatch is not enabled. The webhook was not called. Reports stay pending.' });
  }
  let requestBody = {};
  try { requestBody = deps.body || (deps.request ? await deps.request.json() : {}); } catch (e) { requestBody = {}; }
  if (requestBody.explicit !== true) return withCors(deps, 400, { sent: false, replied: false, reason: 'not_explicit', error: 'Sending is an explicit action. Nothing was called.' });
  const actor = deps.getActor ? await deps.getActor() : null;
  if (!actor || !actor.id) return withCors(deps, 401, { sent: false, replied: false, reason: 'sign_in_required', error: 'Sign in is required.' });
  const feedbackId = String(requestBody.feedback_id || requestBody.feedbackId || '');
  const row = deps.loadEvent ? await deps.loadEvent(feedbackId) : null;
  if (!row) return withCors(deps, 404, { sent: false, replied: false, reason: 'event_not_found', error: 'That report event was not found.' });
  if (!deps.claim) return withCors(deps, 503, { sent: false, replied: false, reason: 'claim_unconfigured', error: 'Dispatch cannot reserve this report yet. Nothing was called.' });
  const claim = await deps.claim(row.eventId || row.event_id);
  if (!claim || !claim.claimed) {
    const reason = claim && claim.reason || 'in_progress';
    if (reason === 'accepted_unrecorded' && deps.recordAcceptance) {
      const again = await deps.recordAcceptance(row.eventId || row.event_id, claim && claim.claimId);
      return withCors(deps, again && again.ok ? 200 : 503, { sent: false, replied: false, runAccepted: true, recorded: !!(again && again.ok), reason: again && again.ok ? 'run_started' : 'accepted_unrecorded', error: again && again.ok ? '' : 'The routine accepted a run, but the portal could not record it. It was not posted again.' });
    }
    return withCors(deps, reason === 'needs_reconciliation' ? 409 : 409, { sent: false, replied: false, runAccepted: false, reason, error: 'This report is already reserved or needs reconciliation. It was not posted again.' });
  }
  let addresses = null;
  if (deps.resolveHost) {
    try { addresses = await deps.resolveHost(envGet(deps.env, 'STAFF_FEEDBACK_BRIDGE_HOST')); } catch (e) { addresses = null; }
  }
  const pinned = { ...config, host: envGet(deps.env, 'STAFF_FEEDBACK_BRIDGE_HOST'), addresses };
  const result = await explicitDispatch({ actor, row, config: pinned, transport: deps.transport, explicit: true });
  if (result.reason === 'outcome_unknown') {
    if (deps.recordOutcome) await deps.recordOutcome({ eventId: row.eventId, claimId: claim.claimId, outcome: 'outcome_unknown' });
    return withCors(deps, 504, { sent: false, replied: false, runAccepted: false, recorded: false, reason: 'outcome_unknown', error: 'The portal could not tell whether the routine started. It will not post again until that is reconciled.' }, { transportCalled: true });
  }
  if (result.persist === 'mark_run_accepted') {
    const recorded = deps.recordAcceptance ? await deps.recordAcceptance(row.eventId || row.event_id, claim.claimId) : { ok: false };
    if (!recorded || !recorded.ok) {
      if (deps.recordOutcome) await deps.recordOutcome({ eventId: row.eventId, claimId: claim.claimId, outcome: 'accepted_unrecorded', http: 200 });
      return withCors(deps, 503, { sent: false, replied: false, runAccepted: true, recorded: false, reason: 'accepted_unrecorded', error: 'The routine accepted a run, but the portal could not record it. It was not posted again.' }, { transportCalled: true });
    }
    return withCors(deps, 200, { sent: false, replied: false, runAccepted: true, recorded: true, botRead: false, deliveryState: 'run_accepted', reason: 'run_started' }, { transportCalled: true });
  }
  if (deps.recordOutcome && (result.reason === 'transport_rejected' || result.reason === 'outcome_unknown' || result.reason === 'accepted_unrecorded')) {
    await deps.recordOutcome({ eventId: row.eventId, claimId: claim.claimId, outcome: result.reason, http: result.httpStatus });
  }
  const status = result.reason === 'not_pilot' ? 403 : result.reason === 'not_eligible' ? 409 : 503;
  return withCors(deps, status, { sent: false, replied: false, runAccepted: false, recorded: false, deliveryState: result.deliveryState, reason: result.reason, httpStatus: result.httpStatus, error: 'The routine was not accepted. Nothing was marked delivered.' }, { transportCalled: !!result.transportCalled });
}
