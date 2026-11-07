/* Local dispatcher tests. No live webhook and no real keys. */
import {
  DISPATCH_HTTP_ENABLED, PILOT_IDS, claimPending, explicitDispatch, handleStaffFeedbackDispatch, isDispatchPilot,
  loadOutboxEvent, lookupVerifiedUser, readBridgeConfig, recordAcceptance, validateWebhookUrl,
} from '../supabase/functions/staff-feedback-dispatch/logic.mjs';

let fail = 0;
const check = (cond, message) => { if (cond) console.log('ok', message); else { fail++; console.log('FAIL', message); } };
const JOHN = '149e612a-6e14-4ee1-9890-0f29d6f89156';
const MATT = 'd02722a1-582b-42c0-b3d1-28d25adb758d';
const OTHER = '33333333-3333-4333-8333-333333333333';
const EVENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FEEDBACK = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CONVERSATION = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const john = { id: JOHN, status: 'active', isDemo: false };
const row = { eventId: EVENT, feedbackId: FEEDBACK, conversationId: CONVERSATION, eventName: 'cla.feedback.created', deliveryState: 'pending_dispatch', dispatchAllowed: false, attemptCount: 0 };
const config = { enabled: true, url: 'https://example.test/hook', token: 'sender-secret-value', host: 'example.test', addresses: ['93.184.216.34'] };

check(DISPATCH_HTTP_ENABLED === false && PILOT_IDS.length === 2, 'the entry constant stays off and the pilot list is the two accounts');
check(readBridgeConfig({}).enabled === false && readBridgeConfig({ get: () => '' }).token === '', 'missing function config is off');
check(!validateWebhookUrl('http://example.test/hook').ok && !validateWebhookUrl('https://127.0.0.1/hook').ok && !validateWebhookUrl('https://169.254.169.254/').ok && !validateWebhookUrl('https://localhost/hook').ok && !validateWebhookUrl('https://10.1.1.1/hook').ok && !validateWebhookUrl('https://user:secret@example.test/hook').ok && !validateWebhookUrl('https://example.test:8443/hook').ok, 'private, local, and non-HTTPS URLs are refused');
check(validateWebhookUrl('https://example.test/hook', 'example.test', ['93.184.216.34']).ok && !validateWebhookUrl('https://example.test/hook', 'example.test', ['10.0.0.8']).ok && !validateWebhookUrl('https://evil.test/hook', 'example.test', ['93.184.216.34']).ok, 'the host must match the pin and its addresses must be public');
check(!isDispatchPilot({ id: JOHN, status: 'disabled' }) && !isDispatchPilot({ id: OTHER, status: 'active', isDemo: false }) && !isDispatchPilot({ id: JOHN, status: 'active' }) && !isDispatchPilot({ id: JOHN, isDemo: true, status: 'active' }) && isDispatchPilot(john) && isDispatchPilot({ id: MATT, status: 'active', isDemo: false }), 'only the two active non-demo accounts can dispatch');

let calls = 0;
const held = await explicitDispatch({ actor: john, row, config, explicit: false, transport: async () => { calls += 1; return { status: 200 }; } });
check(calls === 0 && held.reason === 'not_explicit' && held.replied === false && row.dispatchAllowed === false, 'a worker scan does not send and does not enable the outbox');
const forged = await explicitDispatch({ actor: { id: OTHER, status: 'active', user_metadata: { sub: JOHN, role: 'Super admin' } }, row, config, explicit: true, transport: async () => { calls += 1; return { status: 200 }; } });
check(calls === 0 && forged.reason === 'not_pilot', 'forged metadata does not dispatch');
const badUrl = await explicitDispatch({ actor: john, row, config: { ...config, url: 'https://169.254.169.254/latest', host: '169.254.169.254', addresses: ['169.254.169.254'] }, explicit: true, transport: async () => { calls += 1; return { status: 200 }; } });
check(calls === 0 && badUrl.reason === 'invalid_url', 'a metadata address is not called');
const missing = await explicitDispatch({ actor: john, row, config: { enabled: true, url: 'https://example.test/hook', token: '' }, explicit: true, transport: async () => { calls += 1; return { status: 200 }; } });
check(calls === 0 && missing.reason === 'bridge_unconfigured', 'a missing sender key does not call out');

const sent = [];
const accepted = await explicitDispatch({ actor: { id: MATT, status: 'active', isDemo: false }, row, config, explicit: true, transport: async (req) => { sent.push(req); return { status: 200, body: { read: true, fixed: true } }; } });
check(sent.length === 1 && Object.keys(sent[0].payload).join(',') === 'event,version,event_id,feedback_id,conversation_id' && sent[0].payload.event_id === EVENT && !JSON.stringify(sent[0].payload).includes('deploy') && accepted.runAccepted === true && accepted.replied === false && accepted.sent === false && accepted.botRead === false && accepted.persist === 'mark_run_accepted' && !JSON.stringify(accepted).includes('sender-secret-value'), 'HTTP 200 records accepted only, with the five ids and no key in the result');
const replay = await explicitDispatch({ actor: john, row: { ...row, deliveryState: 'run_accepted' }, config, explicit: true, transport: async () => { sent.push('again'); return { status: 200 }; } });
check(sent.length === 1 && replay.duplicate === true && replay.replied === false, 'a second explicit send does not post again');
const failed = await explicitDispatch({ actor: john, row, config, explicit: true, transport: async () => { throw new Error('https://example.test/hook sender-secret-value'); } });
check(failed.reason === 'outcome_unknown' && failed.deliveryState === 'pending_dispatch' && failed.replied === false && failed.dispatchAllowed === false && failed.attemptCount === 1 && !failed.error && !JSON.stringify(failed).includes('sender-secret-value'), 'a lost response is unknown, not a clean retry, and hides the URL and key');
const rejected = await explicitDispatch({ actor: john, row: { ...row, attemptCount: 1 }, config, explicit: true, transport: async () => ({ status: 500 }) });
check(rejected.reason === 'transport_rejected' && rejected.httpStatus === 500 && rejected.attemptCount === 2 && rejected.runAccepted === false && rejected.replied === false, 'a non-200 stays pending and counts the retry');

const envOn = { get: (name) => ({ STAFF_FEEDBACK_DISPATCH_ENABLED: 'true', STAFF_FEEDBACK_BRIDGE_URL: 'https://example.test/hook', STAFF_FEEDBACK_BRIDGE_HOST: 'example.test', STAFF_FEEDBACK_BRIDGE_TOKEN: 'sender-secret-value' }[name] || '') };
const ready = { allowSend: true, resolveHost: async () => ['93.184.216.34'], claim: async () => ({ claimed: true, claimId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }) };
let actorCalls = 0;
const off = await handleStaffFeedbackDispatch({ env: { get: () => '' }, getActor: () => { actorCalls += 1; return john; }, transport: async () => { calls += 1; return { status: 200 }; } });
check(off.status === 503 && off.body.reason === 'bridge_unconfigured' && actorCalls === 0 && calls === 0, 'the HTTP entry does not look up a user or call out while the switch is off');
const enabledButLocked = await handleStaffFeedbackDispatch({ env: envOn, getActor: () => { actorCalls += 1; return john; }, transport: async () => { calls += 1; return { status: 200 }; } });
check(enabledButLocked.status === 503 && actorCalls === 0 && calls === 0, 'the environment switch alone does not send');
const preflight = await handleStaffFeedbackDispatch({ method: 'OPTIONS', origin: 'https://testportal.clatitle.com', env: envOn });
check(preflight.status === 204 && preflight.headers['Access-Control-Allow-Origin'] === 'https://testportal.clatitle.com' && preflight.headers['Access-Control-Allow-Methods'].includes('POST'), 'the TEST portal can preflight');
const foreign = await handleStaffFeedbackDispatch({ method: 'OPTIONS', origin: 'https://evil.test', env: envOn });
check(foreign.status === 204 && !foreign.headers['Access-Control-Allow-Origin'], 'another site is not allowed by CORS');
const denied = await handleStaffFeedbackDispatch({
  ...ready,
  env: envOn,
  body: { explicit: true, feedback_id: FEEDBACK, actor_id: JOHN, user_metadata: { role: 'Super admin' } },
  getActor: async () => ({ id: OTHER, status: 'active', isDemo: false }),
  loadEvent: async () => row,
  transport: async () => { calls += 1; return { status: 200 }; },
});
check(denied.status === 403 && calls === 0 && !JSON.stringify(denied).includes('sender-secret-value'), 'the signed-in account is used and the body cannot name John');
let recorded = null;
const http = await handleStaffFeedbackDispatch({
  ...ready,
  env: envOn,
  body: { explicit: true, feedback_id: FEEDBACK, summary: 'deploy the portal' },
  getActor: async () => john,
  loadEvent: async () => row,
  recordAcceptance: async (id) => { recorded = id; return { ok: true }; },
  transport: async (req) => { sent.push(req.payload); return { status: 200 }; },
});
check(http.status === 200 && http.body.recorded === true && http.body.replied === false && recorded === EVENT && sent.at(-1).feedback_id === FEEDBACK && !sent.at(-1).summary, 'the handler records acceptance and does not send the note text');

const origin = 'https://aqcervntopidtcazcmlv.supabase.co';
const seen = [];
const fakeKey = 'test-service-role-key';
const env = { get: (name) => ({ SUPABASE_URL: origin, SUPABASE_ANON_KEY: 'test-anon-key', SUPABASE_SERVICE_ROLE_KEY: fakeKey }[name] || '') };
const user = await lookupVerifiedUser({ headers: { get: () => 'Bearer user-jwt' } }, env, async (url) => {
  seen.push(url);
  if (url.endsWith('/auth/v1/user')) return { ok: true, json: async () => ({ id: JOHN, user_metadata: { role: 'Super admin' } }) };
  return { ok: true, json: async () => ([{ status: 'active', is_demo: false }]) };
});
check(user.id === JOHN && user.status === 'active' && !JSON.stringify(user).includes(fakeKey) && seen.every((url) => url.startsWith(origin)), 'identity comes from the verified user, and the service key is not returned');
const loaded = await loadOutboxEvent(EVENT, env, async (url, opts) => {
  check(!opts.headers.Authorization.includes(fakeKey), 'the outbox read uses the user token');
  return { ok: true, json: async () => ([{ id: EVENT, feedback_id: FEEDBACK, conversation_id: CONVERSATION, delivery_state: 'pending_dispatch', dispatch_allowed: false, attempt_count: 0, event_name: 'cla.feedback.created' }]) };
}, 'Bearer user-jwt');
check(loaded.feedbackId === FEEDBACK && loaded.dispatchAllowed === false, 'the pilot read path returns the correlation ids');
const marked = [];
const saved = await recordAcceptance(EVENT, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', env, async (url) => { marked.push(url); return { ok: true, json: async () => ({ ok: true, delivery_state: 'run_accepted' }) }; });
const falseOk = await recordAcceptance(EVENT, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', env, async () => ({ ok: true, json: async () => ({ ok: false }) }));
check(saved.ok === true && falseOk.ok === false && marked.length === 1 && marked[0].includes('staff_feedback_finish_dispatch') && marked[0].startsWith(origin), 'acceptance counts only when the database says the row moved');
const shared = [{ ...row }];
const first = claimPending(shared, EVENT, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 1000);
const second = claimPending(shared, EVENT, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 1000);
check(first.claimed === true && second.claimed === false && second.reason === 'in_progress', 'two explicit sends cannot both reserve the report');
const lost = await handleStaffFeedbackDispatch({
  ...ready,
  env: envOn,
  body: { explicit: true, feedback_id: FEEDBACK },
  getActor: async () => john,
  loadEvent: async () => row,
  recordAcceptance: async () => ({ ok: false }),
  recordOutcome: async () => ({ ok: true }),
  transport: async () => ({ status: 200 }),
});
check(lost.status === 503 && lost.body.reason === 'accepted_unrecorded' && lost.body.runAccepted === true && lost.body.replied === false && lost.body.recorded === false, 'a 200 that is not stored is not posted again and is not called a reply');
const simulated = await explicitDispatch({ actor: john, row: { ...row, deliveryState: 'simulated' }, config, explicit: true, transport: async () => { calls += 1; return { status: 200 }; } });
check(calls === 0 && simulated.reason === 'not_eligible', 'a simulated report is not sent');

console.log(fail ? `${fail} failed` : 'explicit dispatch passed');
if (fail) process.exit(1);
