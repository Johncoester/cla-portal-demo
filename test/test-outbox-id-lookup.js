/* The failed TEST send used a report id that is not the outbox id.
 * PostgREST returns [] for id=eq.<report> and one created row for feedback_id=eq.<report>.
 * No network and no hosted read. */
import { handleStaffFeedbackDispatch, loadOutboxEvent, productionDeps } from '../supabase/functions/staff-feedback-dispatch/logic.mjs';

let fail = 0;
const check = (cond, message) => { if (cond) console.log('ok', message); else { fail++; console.log('FAIL', message); } };
const JOHN = '149e612a-6e14-4ee1-9890-0f29d6f89156';
const REPORT = '7aa03713-f4b6-4352-b507-d6c65ced6017';
const EVENT = 'aa335a84-b539-44a6-975d-e43d28e75e42';
const CONVERSATION = '52512ab3-5841-49f7-b7cd-e7f447d80ba5';
const ORIGIN = 'https://aqcervntopidtcazcmlv.supabase.co';
const created = { id: EVENT, feedback_id: REPORT, conversation_id: CONVERSATION, delivery_state: 'pending_dispatch', dispatch_allowed: false, attempt_count: 0, event_name: 'cla.feedback.created' };
const reply = { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', feedback_id: REPORT, conversation_id: CONVERSATION, delivery_state: 'saved', dispatch_allowed: false, attempt_count: 0, event_name: 'cla.feedback.staff_reply' };

const param = (url, name) => new URL(url).searchParams.get(name) || '';
function outboxRows(url) {
  const byReportKey = param(url, 'id') === `eq.${REPORT}`;
  const byFeedback = param(url, 'feedback_id') === `eq.${REPORT}`;
  const createdOnly = param(url, 'event_name') === 'eq.cla.feedback.created';
  if (byReportKey || !byFeedback) return [];
  return createdOnly ? [created] : [created, reply];
}

const env = { get: (name) => ({
  STAFF_FEEDBACK_DISPATCH_ENABLED: 'true',
  STAFF_FEEDBACK_BRIDGE_URL: 'https://example.test/hook',
  STAFF_FEEDBACK_BRIDGE_HOST: 'example.test',
  STAFF_FEEDBACK_BRIDGE_TOKEN: 'sender-secret-value',
  SUPABASE_URL: ORIGIN,
  SUPABASE_ANON_KEY: 'test-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
}[name] || '') };

const direct = await loadOutboxEvent(REPORT, env, async (url) => ({ ok: true, json: async () => outboxRows(url) }), 'Bearer user-jwt');
check(direct && direct.eventId === EVENT && direct.feedbackId === REPORT && direct.eventId !== REPORT, 'a report id loads the separate created outbox id');
const wrongKey = await loadOutboxEvent(REPORT, env, async (url) => {
  const next = new URL(url);
  next.searchParams.set('id', `eq.${REPORT}`);
  next.searchParams.delete('feedback_id');
  return { ok: true, json: async () => outboxRows(next.toString()) };
}, 'Bearer user-jwt');
check(wrongKey === null, 'looking up the outbox primary key with the report id finds no row');

const claims = [];
const posts = [];
const lookups = [];
const fetchImpl = async (url, opts = {}) => {
  const u = String(url);
  if (u.endsWith('/auth/v1/user')) return { ok: true, status: 200, json: async () => ({ id: JOHN, user_metadata: { role: 'Super admin' } }) };
  if (u.includes('/rest/v1/profiles')) return { ok: true, status: 200, json: async () => ([{ status: 'active', is_demo: false }]) };
  if (u.includes('/rest/v1/staff_feedback_outbox')) { lookups.push(u); return { ok: true, status: 200, json: async () => outboxRows(u) }; }
  if (u.includes('/rpc/staff_feedback_claim_dispatch')) {
    const body = JSON.parse(opts.body);
    claims.push(body);
    return { ok: true, status: 200, json: async () => (body.p_event === EVENT ? { claimed: true, claim_id: body.p_claim } : { claimed: false, reason: 'in_progress' }) };
  }
  if (u.includes('/rpc/staff_feedback_finish_dispatch')) {
    const body = JSON.parse(opts.body);
    return { ok: true, status: 200, json: async () => (body.p_event === EVENT && body.p_outcome === 'run_accepted' ? { ok: true, delivery_state: 'run_accepted' } : { ok: false, delivery_state: 'pending_dispatch' }) };
  }
  if (u.startsWith('https://example.test/')) { posts.push(JSON.parse(opts.body)); return { ok: true, status: 200, json: async () => ({}) }; }
  return { ok: false, status: 500, json: async () => ({}) };
};
const req = new Request(`${ORIGIN}/functions/v1/staff-feedback-dispatch`, {
  method: 'POST',
  headers: { authorization: 'Bearer user-jwt', origin: 'https://testportal.clatitle.com', 'content-type': 'application/json' },
  body: JSON.stringify({ explicit: true, feedback_id: REPORT }),
});
const result = await handleStaffFeedbackDispatch({
  ...productionDeps(req, { Deno: { env, resolveDns: async (_host, kind) => (kind === 'A' ? ['93.184.216.34'] : []) }, fetch: fetchImpl, crypto: { randomUUID: () => 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' } }),
  allowSend: true,
});
check(result.status === 200 && result.body.reason === 'run_started' && result.body.replied === false && result.body.runAccepted === true, 'the report id is accepted instead of returned as 404');
check(lookups.length === 1 && param(lookups[0], 'feedback_id') === `eq.${REPORT}` && param(lookups[0], 'event_name') === 'eq.cla.feedback.created' && param(lookups[0], 'id') === '', 'the pre-claim read filters the created event by report id');
check(claims.length === 1 && claims[0].p_event === EVENT && claims[0].p_event !== REPORT, 'the claim reserves the outbox id');
check(posts.length === 1 && posts[0].event_id === EVENT && posts[0].feedback_id === REPORT && posts[0].conversation_id === CONVERSATION && posts[0].version === 1 && !JSON.stringify(result).includes('sender-secret-value'), 'the webhook payload uses both ids and hides the sender key');
const FOLLOW = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const followUrls = [];
const follow = await loadOutboxEvent(REPORT, env, async (url) => {
  followUrls.push(url);
  const params = new URL(url).searchParams;
  if (params.get('id') !== `eq.${FOLLOW}` || params.get('feedback_id') !== `eq.${REPORT}`) return { ok: true, json: async () => [] };
  return { ok: true, json: async () => ([{ id: FOLLOW, feedback_id: REPORT, conversation_id: CONVERSATION, delivery_state: 'pending_dispatch', dispatch_allowed: false, attempt_count: 0, event_name: 'cla.feedback.follow_up' }]) };
}, 'Bearer user-jwt', FOLLOW);
check(follow && follow.eventId === FOLLOW && follow.feedbackId === REPORT && follow.eventName === 'cla.feedback.follow_up' && !followUrls.some((url) => new URL(url).searchParams.get('id') === `eq.${REPORT}`), 'a follow-up is loaded by its own event id and the report id together');

console.log(fail ? `${fail} failed` : 'outbox id lookup passed');
if (fail) process.exit(1);
