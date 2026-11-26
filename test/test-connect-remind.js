/* CONNECT-REMIND (John, Nov 25 2026, 9:02 PM ET; Connect Live Test Checklist row 6.3, team live test).
 * The processor's Remind on a task queues a real outbox email (queue_task_reminder) instead of the old
 * "CLA Portal Live Test does not send email. Nothing was queued." stub, and outbox-send sends that row from the
 * file's processor's connected Gmail (portal@ is only the claimed From stamp). No network, no secrets, no real addresses.
 * Run: node --import ./test/register-supabase-fake.mjs test/test-connect-remind.js */
import { readFileSync } from 'node:fs';
import { handleOutboxSend, REASONS } from '../supabase/functions/_shared/outbox-core.mjs';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

// 1. the hosted adapter calls the existing RPC and returns how many reminders were queued
const calls = [];
let answer = { data: 1, error: null };
globalThis.__fakeSB = { auth: { onAuthStateChange() {}, getUser: async () => ({ data: { user: { id: 'u1' } } }), signOut: async () => ({}) },
  rpc: async (name, args) => { calls.push({ name, args }); if (name === 'my_profile') return { data: { id: 'u1', role: 'Processor', status: 'active' }, error: null };
    if (name === 'queue_task_reminder') return answer; return { data: [], error: null }; },
  from: () => { const q = { select: () => q, eq: () => q, in: () => q, order: () => q, is: () => q, limit: () => q, single: async () => ({ data: null, error: null }), maybeSingle: async () => ({ data: null, error: null }), then: (a, b) => Promise.resolve({ data: [], error: null }).then(a, b) }; return q; },
  functions: { invoke: async () => ({ data: {}, error: null }) } };
try {
  const { createSupabaseAdapter } = await import('../js/data/supabase-adapter.js');
  const api = await createSupabaseAdapter({ url: 'https://fake.invalid', anonKey: 'FAKE-NOT-A-KEY' });
  const r = await api.sendTaskReminder('task-1');
  const c = calls.filter((x) => x.name === 'queue_task_reminder');
  ok(c.length === 1 && c[0].args.p_task === 'task-1' && r.queued === 1, 'Remind calls queue_task_reminder for the task and reports 1 queued');
  answer = { data: 0, error: null };
  ok((await api.sendTaskReminder('task-1')).queued === 0, 'a second Remind the same day reports 0 queued (one per person per task per day, in the database)');
  answer = { data: null, error: { message: 'Only the processor or coordinator can send reminders' } };
  let msg = ''; try { await api.sendTaskReminder('task-1'); } catch (e) { msg = e.message; }
  ok(msg === 'Only the processor or coordinator can send reminders', 'a refused Remind shows the database\'s plain reason');
  msg = ''; try { await api.sendTaskReminder(''); } catch (e) { msg = e.message; }
  ok(msg === 'Pick a task to remind.' && calls.filter((x) => x.name === 'queue_task_reminder').length === 3, 'no task id: nothing is called');
} catch (e) { fail++; console.log('FAIL hosted adapter check threw:', e && e.message); }
const adapterSrc = read('js/data/supabase-adapter.js');
ok(!/async sendTaskReminder\(\) \{ throw/.test(adapterSrc), 'the "does not send email. Nothing was queued." stub is gone from Remind');

// 2. the task page: Remind no longer says nothing is sent, and the toasts say what happens
const page = read('js/pages/dealtasks.js');
ok(!/Nothing is sent from this build/.test(page) && !/queued in the outbox \(not sent\)/.test(page), 'the Remind button and toast no longer say nothing is sent');
ok(/REMIND_QUEUED : REMIND_NONE/.test(page) && /processor\\'s Gmail/.test(page) && /no active portal login/.test(page), 'the toasts say it goes from the processor\'s Gmail, or why none was queued');

// 3. the reminder row the database queues goes out from the file processor's Gmail, not portal@
const TOKEN = 'x'.repeat(64);
const post = () => new Request('https://example.test/functions/v1/outbox-send', { method: 'POST', headers: { 'x-outbox-send-token': TOKEN }, body: '{}' });
const reminder = { id: 'ob-rem-1', to: 'clatestportal+buyer@gmail.com', toName: '', cc: [], bcc: [], from: 'portal@clatitle.com', fromName: 'CLA Title & Escrow',
  subject: 'Reminder: Personal Information (MD-26-99001)',
  body: 'Hello Test,\n\nThis is a reminder about "Personal Information" on order MD-26-99001, due 2026-11-30.\nPlease sign in to the portal to finish it.\n\nCLA Title & Escrow', attachmentIds: [] };
const FILE = { dealId: 'd1', fileNumber: 'MD-26-99001', processorId: 'p1', processorName: 'Test Processor', processorStatus: 'active' };
function harness(tok) {
  const log = { rpc: [], fetch: [] };
  const deps = { clientId: 'cid', clientSecret: 'csecret', now: () => 0, checkToken: async () => true, loadDocs: async () => [], fileFor: async () => FILE,
    fetch: async (u, init) => { log.fetch.push({ u, init }); const body = u.includes('oauth2') ? { access_token: 'ya29.fake' } : { id: 'gm-rem', threadId: 'th-rem' }; return new Response(JSON.stringify(body), { status: 200 }); },
    rpc: async (fn, args) => { log.rpc.push({ fn, args }); if (fn === 'outbox_claim_batch') return { mode: 'test', testAddressRegex: '^clatestportal\\+[a-z0-9._-]+@gmail\\.com$', rows: [reminder] }; if (fn === 'gmail_svc_token') return tok ? [tok] : []; return 'ok'; } };
  return { deps, log };
}
{ const h = harness({ email: 'clatestportal+processor@gmail.com', refresh_token: 'fake-refresh', status: 'connected' });
  const j = await (await handleOutboxSend(post(), h.deps)).json();
  const s = h.log.fetch.filter((x) => x.u.includes('gmail.googleapis.com'));
  const raw = s.length ? Buffer.from(JSON.parse(s[0].init.body).raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString() : '';
  ok(j.sent === 1 && s.length === 1, 'the queued reminder is sent once');
  ok(/^From: "Test Processor" <clatestportal\+processor@gmail\.com>/m.test(raw) && !/portal@clatitle\.com/.test(raw), 'From is the processor\'s connected Gmail; portal@ is not used to send');
  ok(/^To: clatestportal\+buyer@gmail\.com/m.test(raw) && /^Subject: Reminder: Personal Information \(MD-26-99001\)/m.test(raw), 'To is the task\'s person and the subject names the task and order');
  const m = h.log.rpc.find((x) => x.fn === 'outbox_mark_result'); ok(m && m.args.p_ok === true && m.args.p_provider_id === 'gm-rem', 'the outbox row is marked sent'); }
{ const h = harness(null);
  const j = await (await handleOutboxSend(post(), h.deps)).json();
  const m = h.log.rpc.find((x) => x.fn === 'outbox_mark_result');
  ok(j.failed === 1 && !h.log.fetch.some((x) => x.u.includes('gmail.googleapis.com')), 'processor\'s Gmail not connected: nothing is sent');
  ok(m && m.args.p_ok === false && m.args.p_retry === false && m.args.p_error === REASONS.notConnected('Test Processor'), 'the row fails with "Test Processor\'s Gmail is not connected" like every other outbox email (no portal@ fallback)'); }

console.log(fail ? fail + ' failed' : 'connect remind passed');
if (fail) process.exit(1);
