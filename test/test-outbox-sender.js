/* OUTBOX-SEND-1/2 (John, Nov 24 2026, 11:06 AM / 12:24 PM ET): outbox-send sends from the file's processor's own Gmail.
 * Sender selection, every not-sent reason, Test mode guard, retries, attachments, and the Reminder Outbox status. No network, no secrets. */
import { handleOutboxSend, testModeProblem, pickSender, REASONS } from '../supabase/functions/_shared/outbox-core.mjs';
import { readFileSync, existsSync } from 'node:fs';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const TOKEN = 'x'.repeat(64);
const post = (headers = { 'x-outbox-send-token': TOKEN }) => new Request('https://example.test/functions/v1/outbox-send', { method: 'POST', headers, body: '{}' });
const row = (o = {}) => ({ id: 'r1', to: 'clatestportal+buyer@gmail.com', cc: [], bcc: [], subject: 'Hi', body: 'Hello\nthere', attachmentIds: [], ...o });
const FILE = { dealId: 'd1', fileNumber: 'MD-26-99001', processorId: 'p1', processorName: 'John Coester', processorStatus: 'active' };
const TOK = { email: 'jcoester@clatitle.com', refresh_token: 'refresh-secret', status: 'connected' };

function fake({ claim = { mode: 'test', testAddressRegex: '^clatestportal\\+[a-z0-9._-]+@gmail\\.com$', rows: [row()] }, file = FILE, tok = TOK, google = {}, docs = [], tokenOk = true, clientId = 'cid', clientSecret = 'csecret' } = {}) {
  const calls = { rpc: [], fetch: [] };
  const g = { token: () => ({ status: 200, body: { access_token: 'ya29.access' } }), send: () => ({ status: 200, body: { id: 'gm-1', threadId: 'th-1' } }), ...google };
  const deps = {
    clientId, clientSecret, now: () => 0,
    checkToken: async () => tokenOk,
    fetch: async (u, init) => {
      calls.fetch.push({ u, init });
      const r = u.includes('oauth2.googleapis.com/token') ? g.token() : g.send(u, init);
      if (r.throw) throw new Error('net');
      return new Response(JSON.stringify(r.body), { status: r.status, headers: r.headers || {} });
    },
    rpc: async (fn, args) => { calls.rpc.push({ fn, args }); if (fn === 'outbox_claim_batch') return claim; if (fn === 'gmail_svc_token') return tok ? [tok] : []; return 'ok'; },
    fileFor: async () => (typeof file === 'function' ? file() : file),
    loadDocs: async () => docs,
  };
  return { deps, calls };
}
const marks = (calls) => calls.rpc.filter((c) => c.fn === 'outbox_mark_result').map((c) => c.args);
const sends = (calls) => calls.fetch.filter((c) => c.u.includes('gmail.googleapis.com'));

// 1. no Google app secrets: nothing is claimed, sent or failed
for (const [id, sec] of [['', ''], ['cid', ''], ['', 'csecret']]) {
  const f = fake({ clientId: id, clientSecret: sec }); const r = await handleOutboxSend(post(), f.deps); const j = await r.json();
  ok(r.status === 200 && j.status === 'idle' && f.calls.rpc.length === 0 && f.calls.fetch.length === 0, `no Google app secret (${id || '-'}/${sec ? 'set' : '-'}): idle, no row touched, nothing sent`);
}
// 2. the caller must hold the Vault token
{ const f = fake({ tokenOk: false }); const r = await handleOutboxSend(post(), f.deps); ok(r.status === 401 && !f.calls.rpc.length && !f.calls.fetch.length, 'wrong token -> 401, nothing claimed'); }
{ const f = fake(); const r = await handleOutboxSend(post({}), f.deps); ok(r.status === 401 && !f.calls.rpc.length, 'no token -> 401'); }
{ const f = fake(); const r = await handleOutboxSend(new Request('https://example.test/', { method: 'GET' }), f.deps); ok(r.status === 405 && !f.calls.rpc.length, 'GET -> 405'); }

// 3. sender selection: the file's processor, through their stored Gmail connection
{ const f = fake(); const r = await handleOutboxSend(post(), f.deps); const j = await r.json(); const m = marks(f.calls); const s = sends(f.calls);
  const tokCall = f.calls.rpc.find((c) => c.fn === 'gmail_svc_token');
  ok(tokCall && tokCall.args.p_profile === 'p1', 'the Gmail connection read is the file processor\'s');
  ok(j.sent === 1 && s.length === 1 && s[0].u.endsWith('/users/me/messages/send') && s[0].init.headers.Authorization === 'Bearer ya29.access', 'sent once through the processor\'s Gmail');
  const raw = Buffer.from(JSON.parse(s[0].init.body).raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
  ok(/^From: "John Coester" <jcoester@clatitle\.com>/m.test(raw) && /^To: clatestportal\+buyer@gmail\.com/m.test(raw) && /^Subject: Hi/m.test(raw), 'From is the processor\'s connected Gmail address and name');
  ok(m.length === 1 && m[0].p_ok === true && m[0].p_provider_id === 'gm-1', 'marked sent with the Gmail message id');
  const rec = f.calls.rpc.find((c) => c.fn === 'gmail_svc_record');
  ok(rec && rec.args.p.deal_id === 'd1' && rec.args.p.mailbox_profile_id === 'p1' && rec.args.p.sent_by === 'p1' && rec.args.p.gmail_message_id === 'gm-1', 'also saved on the file\'s Email tab');
  ok(!JSON.stringify(f.calls.rpc).includes('refresh-secret') && !JSON.stringify(m).includes('ya29'), 'no token is written anywhere'); }
ok(pickSender(FILE).ok && pickSender(FILE).processor.id === 'p1', 'pickSender: the processor on the file');

// 4. every not-sent reason, one row at a time, never retried
const cases = [
  ['no file', { file: null }, REASONS.noFile],
  ['file has no processor', { file: { ...FILE, processorId: null, processorName: '' } }, REASONS.noProcessor('MD-26-99001')],
  ['processor not active', { file: { ...FILE, processorStatus: 'inactive' } }, REASONS.inactive('John Coester')],
  ['processor Gmail not connected', { tok: null }, REASONS.notConnected('John Coester')],
  ['connection without a refresh token', { tok: { ...TOK, refresh_token: '' } }, REASONS.notConnected('John Coester')],
  ['connection marked needs_reconnect', { tok: { ...TOK, status: 'needs_reconnect' } }, REASONS.reconnect('John Coester')],
  ['Google revoked the access', { google: { token: () => ({ status: 400, body: { error: 'invalid_grant' } }) } }, REASONS.reconnect('John Coester')],
];
for (const [name, opt, reason] of cases) {
  const f = fake(opt); await handleOutboxSend(post(), f.deps); const m = marks(f.calls);
  ok(!sends(f.calls).length && m.length === 1 && m[0].p_ok === false && m[0].p_retry === false && m[0].p_error === reason, `${name}: not sent, "${reason.slice(0, 60)}...", no retry`);
}
{ const f = fake({ google: { token: () => ({ status: 400, body: { error: 'invalid_grant' } }) } }); await handleOutboxSend(post(), f.deps);
  const u = f.calls.rpc.find((c) => c.fn === 'gmail_svc_update_account');
  ok(u && u.args.p_profile === 'p1' && u.args.p_status === 'needs_reconnect', 'a revoked Gmail is flagged needs_reconnect on the processor\'s Profile, like gmail-send does'); }
// several rows for one processor whose Gmail is revoked: Google is asked once, each row gets its own reason, nothing else is touched
{ const f = fake({ claim: { mode: 'test', rows: [row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c' })] }, google: { token: () => ({ status: 400, body: { error: 'invalid_grant' } }) } });
  await handleOutboxSend(post(), f.deps); const m = marks(f.calls);
  ok(f.calls.fetch.filter((c) => c.u.includes('oauth2')).length === 1 && m.length === 3 && m.every((x) => x.p_ok === false && x.p_retry === false), 'three rows, one Google refresh, each row marked on its own'); }
{ const f = fake({ google: { token: () => ({ status: 503, body: {} }) } }); await handleOutboxSend(post(), f.deps); const m = marks(f.calls)[0];
  ok(m.p_retry === true && /Trying again later/.test(m.p_error) && !sends(f.calls).length, 'Google down while refreshing: retried later'); }
{ const f = fake({ file: () => { throw new Error('db'); } }); await handleOutboxSend(post(), f.deps); ok(marks(f.calls)[0].p_retry === true, 'file read error: retried later'); }

// 5. Test mode guard in the function too (the database already skips these)
for (const bad of [row({ to: 'buyer@example.com' }), row({ cc: ['agent@realty.com'] }), row({ bcc: ['jcoester@clatitle.com'] }), row({ to: 'clatestportal+x@evil.com' })]) {
  const f = fake({ claim: { mode: 'test', testAddressRegex: '^.*$', rows: [bad] } }); await handleOutboxSend(post(), f.deps); const m = marks(f.calls);
  ok(!f.calls.fetch.length && m.length === 1 && m[0].p_ok === false && m[0].p_retry === false && /^Test mode: /.test(m[0].p_error), `Test mode guard (even with a loose stored pattern): ${bad.to} ${bad.cc} ${bad.bcc} not sent`);
}
ok(testModeProblem(row(), null) === null && /clatestportal/.test(testModeProblem(row({ to: 'clatestportal@gmail.com' }), null)), 'clatestportal+tag passes; the bare address does not');
{ const f = fake({ claim: { mode: 'live', rows: [row({ to: 'buyer@example.com', cc: ['agent@realty.com'] })] } }); await handleOutboxSend(post(), f.deps);
  ok(sends(f.calls).length === 1 && marks(f.calls)[0].p_ok === true, 'Live mode: a real address is sent'); }
{ const f = fake({ claim: { mode: 'live', rows: [row({ to: 'not an email' })] } }); await handleOutboxSend(post(), f.deps);
  ok(!f.calls.fetch.length && marks(f.calls)[0].p_ok === false, 'an invalid address is never sent'); }

// 6. Gmail refuses: a temporary problem is retried, a refusal is not
{ const f = fake({ google: { send: () => ({ status: 503, body: {} }) } }); await handleOutboxSend(post(), f.deps); const m = marks(f.calls)[0];
  ok(m.p_ok === false && m.p_retry === true && /HTTP 503/.test(m.p_error), 'Gmail 503 -> retry with the reason'); }
{ const f = fake({ google: { send: () => ({ status: 400, body: { error: { message: 'Invalid To header' } } }) } }); await handleOutboxSend(post(), f.deps); const m = marks(f.calls)[0];
  ok(m.p_ok === false && m.p_retry === false && /^Not sent: Gmail \(jcoester@clatitle.com\) did not send it \(HTTP 400\)/.test(m.p_error), 'Gmail 400 -> failed with the reason, no retry'); }
{ const f = fake({ google: { send: () => ({ throw: true }) } }); await handleOutboxSend(post(), f.deps); ok(marks(f.calls)[0].p_retry === true, 'network error -> retry'); }

// 7. attachments: wire instructions are never sent; a missing document fails; files go by Gmail's upload endpoint
{ const f = fake({ claim: { mode: 'test', rows: [row({ attachmentIds: ['d1'] })] }, docs: [{ name: 'Wire Instructions.pdf', mime: 'application/pdf', size: 10, wire: false, bytes: async () => new Uint8Array(3) }] });
  await handleOutboxSend(post(), f.deps); ok(!sends(f.calls).length && /wire instructions/.test(marks(f.calls)[0].p_error), 'a wire instructions file is never emailed'); }
{ const f = fake({ claim: { mode: 'test', rows: [row({ attachmentIds: ['d1'] })] }, docs: [{ name: 'x.pdf', mime: 'application/pdf', size: 1, wire: true, bytes: async () => new Uint8Array(1) }] });
  await handleOutboxSend(post(), f.deps); ok(!sends(f.calls).length, 'a document flagged wire instructions is never emailed'); }
{ const f = fake({ claim: { mode: 'test', rows: [row({ attachmentIds: ['d1', 'd2'] })] }, docs: [] }); await handleOutboxSend(post(), f.deps);
  ok(!sends(f.calls).length && marks(f.calls)[0].p_retry === false, 'a missing attachment fails, no retry'); }
{ const f = fake({ claim: { mode: 'test', rows: [row({ attachmentIds: ['d1'] })] }, docs: [{ name: 'Commitment.pdf', mime: 'application/pdf', size: 3, wire: false, bytes: async () => new Uint8Array([37, 80, 68]) }],
    google: { send: (u) => (u.includes('uploadType=resumable') ? { status: 200, body: {}, headers: { Location: 'https://gmail.googleapis.com/upload/x' } } : { status: 200, body: { id: 'gm-2' } }) } });
  await handleOutboxSend(post(), f.deps); const s = sends(f.calls);
  ok(s.length === 2 && s[0].u.includes('uploadType=resumable') && /filename="Commitment.pdf"/.test(Buffer.from(s[1].init.body).toString()) && marks(f.calls)[0].p_provider_id === 'gm-2', 'an attachment goes through gmail-send\'s upload path'); }

// 8. files: shared Google code, no SES/Resend left, no logging
{ const idx = readFileSync(new URL('../supabase/functions/outbox-send/index.ts', import.meta.url), 'utf8');
  const core = readFileSync(new URL('../supabase/functions/_shared/outbox-core.mjs', import.meta.url), 'utf8');
  ok(/from '\.\/gmail-handlers\.mjs'/.test(core) && !/oauth2\.googleapis\.com\/token/.test(core), 'Google token refresh and send are shared with gmail-send, not copied');
  ok(!existsSync(new URL('../supabase/functions/_shared/outbox-providers.mjs', import.meta.url)) && !/AWS_|RESEND/.test(idx + core), 'no SES / Resend left');
  ok(/GOOGLE_CLIENT_ID/.test(idx) && !/console\.log/.test(idx + core) && /outbox_svc_check_token/.test(idx), 'index.ts: existing Google app secrets, token checked in the database, no logging'); }

// 9. Reminder Outbox page shows the real status, sent time and reason
{ const page = readFileSync(new URL('../js/pages/outbox.js', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8'); const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  ok(!/queued - not sent/.test(page) && !/never sent/.test(page) && /statusReason/.test(page) && /sentAt/.test(page), 'the page no longer says every email is "queued - not sent"');
  ok(app.includes("import('./pages/outbox.js?v=202611310100')") && html.includes('js/app.js?v=202611311200'), 'the page and the shell load at stamp 202611310100'); }

console.log(fail ? `${fail} failed` : 'outbox sender passed');
if (fail) process.exit(1);
