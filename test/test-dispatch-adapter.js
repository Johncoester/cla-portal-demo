/* Exercises the real function entry, production dependencies, native Response, and the DNS adapter.
 * No network, no hosted write, and no secret values. */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  handleStaffFeedbackDispatch, productionDeps, recordDispatchOutcome, resolveHostAddresses, toDispatchResponse, validateWebhookUrl,
} from '../supabase/functions/staff-feedback-dispatch/logic.mjs';

let fail = 0;
const check = (cond, message) => { if (cond) console.log('ok', message); else { fail++; console.log('FAIL', message); } };
const JOHN = '149e612a-6e14-4ee1-9890-0f29d6f89156';
const EVENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FEEDBACK = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CONVERSATION = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CLAIM = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const john = { id: JOHN, status: 'active', isDemo: false };
const row = { eventId: EVENT, feedbackId: FEEDBACK, conversationId: CONVERSATION, eventName: 'cla.feedback.created', deliveryState: 'pending_dispatch', dispatchAllowed: false, attemptCount: 0 };
const origin = 'https://aqcervntopidtcazcmlv.supabase.co';
const envOn = { get: (name) => ({
  STAFF_FEEDBACK_DISPATCH_ENABLED: 'true',
  STAFF_FEEDBACK_BRIDGE_URL: 'https://example.test/hook',
  STAFF_FEEDBACK_BRIDGE_HOST: 'example.test',
  STAFF_FEEDBACK_BRIDGE_TOKEN: 'sender-secret-value',
  SUPABASE_URL: origin,
  SUPABASE_ANON_KEY: 'test-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
}[name] || '') };

const indexSrc = readFileSync(new URL('../supabase/functions/staff-feedback-dispatch/index.ts', import.meta.url), 'utf8');
check(indexSrc.includes('toDispatchResponse') && indexSrc.includes('productionDeps(req)') && indexSrc.includes('handleDispatchRequest') && !indexSrc.includes('JSON.stringify(result.body)'), 'the entry uses the shared response and production dependencies');
check(indexSrc.includes('JWT verification stays on') && !indexSrc.includes('verify_jwt = false'), 'the entry keeps JWT verification on');

let threw = false;
try { new Response('null', { status: 204 }); } catch (e) { threw = true; }
check(threw, 'a 204 response cannot carry the string null');
const preflight = toDispatchResponse({ status: 204, headers: { 'Access-Control-Allow-Origin': 'https://testportal.clatitle.com', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }, body: null });
check(preflight instanceof Response && preflight.status === 204 && preflight.headers.get('access-control-allow-origin') === 'https://testportal.clatitle.com' && await preflight.text() === '', 'the adapter returns an empty 204 with CORS');
const json = toDispatchResponse({ status: 503, headers: { 'Access-Control-Allow-Origin': 'https://testportal.clatitle.com' }, body: { sent: false, replied: false, reason: 'bridge_unconfigured' } });
check(json.status === 503 && json.headers.get('content-type') === 'application/json' && JSON.parse(await json.text()).replied === false, 'a JSON result keeps CORS and does not claim a reply');

const notFound = new Error('missing'); notFound.name = 'NotFound';
const publicDns = async (host, kind) => { if (kind === 'AAAA') throw notFound; return ['93.184.216.34']; };
check((await resolveHostAddresses('example.test', publicDns)).join() === '93.184.216.34', 'a missing AAAA record still keeps the public address');
check((await resolveHostAddresses('example.test', async () => { throw new Error('servfail'); })).length === 0, 'a DNS failure returns no addresses');
check(!validateWebhookUrl('https://example.test/hook', 'example.test', ['::ffff:169.254.169.254']).ok && !validateWebhookUrl('https://example.test/hook', 'example.test', null).ok, 'mapped and missing addresses are refused');

const req = new Request(origin + '/functions/v1/staff-feedback-dispatch', { method: 'POST', headers: { origin: 'https://testportal.clatitle.com', authorization: 'Bearer user-jwt' } });
let posts = 0;
const blind = productionDeps(req, { Deno: { env: envOn }, fetch: async () => { throw new Error('network'); }, crypto: { randomUUID: () => CLAIM } });
check(typeof blind.resolveHost === 'function' && typeof blind.recordOutcome === 'function', 'production dependencies supply DNS and outcome recording');
const blocked = await handleStaffFeedbackDispatch({
  ...blind, allowSend: true, body: { explicit: true, feedback_id: FEEDBACK }, getActor: async () => john, loadEvent: async () => row, claim: async () => ({ claimed: true, claimId: CLAIM }),
  transport: async () => { posts += 1; return { status: 200 }; },
});
check(blocked.status === 503 && blocked.body.reason === 'dns_private' && blocked.body.replied === false && posts === 0, 'no DNS result rejects the send before the webhook');

const rpc = [];
const wired = productionDeps(req, {
  Deno: { env: envOn, resolveDns: publicDns },
  fetch: async (url, opts) => {
    rpc.push({ url, body: opts && opts.body });
    const args = JSON.parse(opts.body);
    if (args.p_outcome === 'run_accepted') return { ok: true, json: async () => ({ ok: false, delivery_state: 'pending_dispatch' }) };
    return { ok: true, json: async () => ({ ok: true, outcome: args.p_outcome, delivery_state: 'pending_dispatch' }) };
  },
  crypto: { randomUUID: () => CLAIM },
});
const lost = await handleStaffFeedbackDispatch({
  ...wired, allowSend: true, body: { explicit: true, feedback_id: FEEDBACK }, getActor: async () => john, loadEvent: async () => row, claim: async () => ({ claimed: true, claimId: CLAIM }),
  transport: async () => { posts += 1; throw new Error('https://example.test/hook sender-secret-value'); },
});
const lostBody = rpc.map((call) => JSON.parse(call.body)).find((body) => body.p_outcome === 'outcome_unknown');
check(lost.status === 504 && lost.body.reason === 'outcome_unknown' && lost.body.runAccepted === false && lost.body.replied === false && posts === 1 && lostBody.p_claim === CLAIM && lostBody.p_http === null && rpc.every((call) => !call.url.includes('example.test')) && !JSON.stringify(lost).includes('sender-secret-value'), 'a lost response is stored as unknown and is not posted again');

rpc.length = 0;
const accepted = await handleStaffFeedbackDispatch({
  ...wired, allowSend: true, body: { explicit: true, feedback_id: FEEDBACK }, getActor: async () => john, loadEvent: async () => row, claim: async () => ({ claimed: true, claimId: CLAIM }),
  transport: async () => { posts += 1; return { status: 200 }; },
});
const stored = rpc.map((call) => JSON.parse(call.body));
check(accepted.status === 503 && accepted.body.reason === 'accepted_unrecorded' && accepted.body.runAccepted === true && accepted.body.replied === false && stored.some((body) => body.p_outcome === 'run_accepted') && stored.some((body) => body.p_outcome === 'accepted_unrecorded' && body.p_http === 200 && body.p_claim === CLAIM), 'a 200 that is not recorded is stored without another post');

const dir = mkdtempSync(join(tmpdir(), 'dispatch-index-'));
const logicUrl = new URL('../supabase/functions/staff-feedback-dispatch/logic.mjs', import.meta.url).href;
const js = indexSrc.replace("from './logic.mjs'", 'from ' + JSON.stringify(logicUrl)).replaceAll(': Request', '').replaceAll(': Promise<Response>', '');
writeFileSync(join(dir, 'index.mjs'), js);
let served = null;
const seen = [];
globalThis.Deno = { serve(fn) { served = fn; }, env: { get() { return ''; } }, resolveDns: async () => { throw new Error('network'); } };
globalThis.fetch = async (url) => { seen.push(url); throw new Error('network'); };
await import(pathToFileURL(join(dir, 'index.mjs')).href + '?entry=1');
const opt = await served(new Request(origin + '/functions/v1/staff-feedback-dispatch', { method: 'OPTIONS', headers: { origin: 'https://testportal.clatitle.com' } }));
const denied = await served(new Request(origin + '/functions/v1/staff-feedback-dispatch', { method: 'OPTIONS', headers: { origin: 'https://evil.test' } }));
const off = await served(new Request(origin + '/functions/v1/staff-feedback-dispatch', { method: 'POST', headers: { origin: 'https://johncoester.github.io', 'content-type': 'application/json' }, body: JSON.stringify({ explicit: true, feedback_id: FEEDBACK }) }));
check(typeof served === 'function' && opt.status === 204 && opt.headers.get('access-control-allow-origin') === 'https://testportal.clatitle.com' && await opt.text() === '' && denied.status === 204 && !denied.headers.get('access-control-allow-origin') && off.status === 503 && off.headers.get('access-control-allow-origin') === 'https://johncoester.github.io' && JSON.parse(await off.text()).reason === 'bridge_unconfigured' && seen.length === 0, 'the real entry returns CORS, an empty preflight, and does not call out while the switch is off');

const direct = await recordDispatchOutcome(EVENT, CLAIM, 'transport_rejected', 500, envOn, async (url, opts) => ({ ok: true, json: async () => ({ ok: true, outcome: JSON.parse(opts.body).p_outcome }) }));
check(direct.ok === true, 'a rejected transport can be stored by the same claim');

console.log(fail ? `${fail} failed` : 'dispatch adapter passed');
if (fail) process.exit(1);
