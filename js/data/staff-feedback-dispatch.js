/* Outbound contract for a future bot-owned webhook routine.
 * Official meaning of HTTP 200: the routine accepted the call and started a run.
 * It does not mean the bot read the report, replied, or changed a status.
 * Docs: https://cursor.com/help/grok-bot/routines.md
 *
 * The portal never calls this. DISPATCH_HTTP_ENABLED stays false until John confirms
 * a parent-supplied POST URL and Bearer key, stored as backend secrets.
 * Payload keys are fixed. No report text, attachments, PII, callback, project, or SQL. */

export const DISPATCH_HTTP_ENABLED = false;
export const EVENT_CREATED = 'cla.feedback.created';
export const EVENT_VERSION = 1;
export const PAYLOAD_KEYS = Object.freeze(['event', 'version', 'event_id', 'feedback_id', 'conversation_id']);

const TERMINAL = new Set(['run_accepted', 'bot_acknowledged', 'replied']);

export function buildPayload(row) {
  const payload = {
    event: EVENT_CREATED,
    version: EVENT_VERSION,
    event_id: row.eventId || row.event_id,
    feedback_id: row.feedbackId || row.feedback_id,
    conversation_id: row.conversationId || row.conversation_id,
  };
  const keys = Object.keys(payload);
  if (keys.join(',') !== PAYLOAD_KEYS.join(',')) throw new Error('The webhook payload shape is wrong. Nothing was sent.');
  for (const key of keys) {
    if (key === 'version') {
      if (payload.version !== 1) throw new Error('The webhook payload shape is wrong. Nothing was sent.');
    } else if (key !== 'event' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(payload[key] || ''))) {
      throw new Error('The webhook payload shape is wrong. Nothing was sent.');
    }
  }
  if (payload.event !== EVENT_CREATED) throw new Error('The webhook payload shape is wrong. Nothing was sent.');
  return payload;
}

export function bridgeReady(config) {
  return !!(config && config.enabled === true && typeof config.url === 'string' && /^https:\/\//.test(config.url) && typeof config.token === 'string' && config.token.length > 0);
}

/* Pure decision. `transport` is called only when this event is allowed to leave. */
export async function dispatchEvent(row, config, transport) {
  const state = row.deliveryState || row.delivery_state || 'saved';
  const eventName = row.eventName || row.event_name || '';
  const allowed = (row.dispatchAllowed ?? row.dispatch_allowed) === true;
  const base = { sent: false, botRead: false, runAccepted: false, transportCalled: false, httpStatus: null };
  if (eventName !== EVENT_CREATED || !allowed) {
    return { ...base, ok: false, deliveryState: state === 'pending_dispatch' ? 'saved' : state, reason: 'staff_reply_held', error: 'Staff replies are not sent. They stay saved until a later review.' };
  }
  if (TERMINAL.has(state)) {
    return { ...base, ok: true, duplicate: true, deliveryState: state, reason: 'already_accepted', runAccepted: true, botRead: state === 'bot_acknowledged' || state === 'replied', transportCalled: false };
  }
  if (!bridgeReady(config)) {
    return { ...base, ok: false, deliveryState: 'pending_dispatch', reason: 'bridge_unconfigured', error: 'Webhook URL and Bearer key are not configured. Nothing was sent.' };
  }
  let res;
  try {
    res = await transport({
      method: 'POST',
      url: config.url,
      authorization: `Bearer ${config.token}`,
      payload: buildPayload(row),
    });
  } catch (e) {
    return { ...base, ok: false, deliveryState: 'pending_dispatch', reason: 'transport_error', error: 'The webhook call failed. Nothing was marked delivered.', transportCalled: true };
  }
  const status = res && Number(res.status);
  if (status === 200) {
    return { ...base, ok: true, deliveryState: 'run_accepted', reason: 'run_started', runAccepted: true, botRead: false, sent: false, transportCalled: true, httpStatus: 200 };
  }
  return { ...base, ok: false, deliveryState: 'pending_dispatch', reason: 'transport_rejected', error: 'The webhook did not accept it. Nothing was marked delivered.', transportCalled: true, httpStatus: Number.isFinite(status) ? status : 0 };
}

/* HTTP entry for a future backend worker. It cannot send while the constant is false. */
export function handleDispatchHttp(deps = {}) {
  const fetchImpl = deps.fetch;
  if (!DISPATCH_HTTP_ENABLED) {
    return { status: 503, body: { sent: false, deliveryState: 'pending_dispatch', reason: 'bridge_unconfigured', error: 'Dispatch is not enabled. The webhook was not called. Reports stay pending.' }, fetchCalled: false, fetchImpl };
  }
  return { status: 503, body: { sent: false, deliveryState: 'pending_dispatch', reason: 'bridge_unconfigured', error: 'Dispatch is not enabled. The webhook was not called. Reports stay pending.' }, fetchCalled: false };
}
