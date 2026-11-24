/* OUTBOX-SEND-1 (John, Nov 24 2026, 11:06 AM ET): outbox-send edge function logic and the email service layer. No network, no secrets. */
import { handleOutboxSend, testModeProblem, buildMessage } from '../supabase/functions/_shared/outbox-core.mjs';
import { pickProvider, sigv4, sesProvider, resendProvider, safeError } from '../supabase/functions/_shared/outbox-providers.mjs';
import { readFileSync } from 'node:fs';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const TOKEN = 'x'.repeat(64);
const post = (headers = { 'x-outbox-send-token': TOKEN }) => new Request('https://example.test/functions/v1/outbox-send', { method: 'POST', headers, body: '{}' });
const row = (o = {}) => ({ id: 'r1', to: 'clatestportal+buyer@gmail.com', cc: [], bcc: [], subject: 'Hi', body: 'Hello\nthere', from: 'portal@clatitle.com', fromName: 'CLA Title Portal', attachmentIds: [], ...o });
const SES = { OUTBOX_PROVIDER: 'ses', AWS_SES_REGION: 'us-east-1', AWS_SES_ACCESS_KEY_ID: 'AKIDEXAMPLE', AWS_SES_SECRET_ACCESS_KEY: 'k'.repeat(40) };

function fake({ env = SES, claim = { mode: 'test', testAddressRegex: '^clatestportal\\+[a-z0-9._-]+@gmail\\.com$', rows: [row()] }, fetchRes = () => ({ status: 200, body: { MessageId: 'ses-1' } }), docs = [], tokenOk = true } = {}) {
  const calls = { rpc: [], fetch: [] };
  const deps = {
    env, now: () => 0,
    checkToken: async () => tokenOk,
    fetch: async (u, init) => { calls.fetch.push({ u, init }); const r = fetchRes(u, init); if (r.throw) throw new Error('net'); return new Response(JSON.stringify(r.body), { status: r.status }); },
    rpc: async (fn, args) => { calls.rpc.push({ fn, args }); return fn === 'outbox_claim_batch' ? claim : 'ok'; },
    loadDocs: async () => docs,
  };
  return { deps, calls };
}
const marks = (calls) => calls.rpc.filter((c) => c.fn === 'outbox_mark_result').map((c) => c.args);

// 1. no email service connected: nothing is claimed, sent, skipped or failed
for (const env of [{}, { OUTBOX_PROVIDER: 'ses' }, { OUTBOX_PROVIDER: 'resend' }, { OUTBOX_PROVIDER: 'smtp', RESEND_API_KEY: 'x' }]) {
  const f = fake({ env }); const r = await handleOutboxSend(post(), f.deps); const j = await r.json();
  ok(r.status === 200 && j.status === 'idle' && f.calls.rpc.length === 0 && f.calls.fetch.length === 0, `no credentials (${env.OUTBOX_PROVIDER || 'none'}): idle, no row touched, nothing sent`);
}
ok(pickProvider({ OUTBOX_PROVIDER: 'ses', AWS_SES_REGION: 'us-east-1' }).missing === 'AWS_SES_ACCESS_KEY_ID, AWS_SES_SECRET_ACCESS_KEY', 'missing secrets are named, never valued');
ok(pickProvider({ ...SES, AWS_SES_REGION: 'nowhere' }).missing.startsWith('AWS_SES_REGION'), 'a bad region is refused');

// 2. the caller must hold the Vault token
{ const f = fake({ tokenOk: false }); const r = await handleOutboxSend(post(), f.deps); ok(r.status === 401 && !f.calls.rpc.length && !f.calls.fetch.length, 'wrong token -> 401, nothing claimed'); }
{ const f = fake(); const r = await handleOutboxSend(post({}), f.deps); ok(r.status === 401 && !f.calls.rpc.length, 'no token -> 401'); }
{ const f = fake(); const r = await handleOutboxSend(new Request('https://example.test/', { method: 'GET' }), f.deps); ok(r.status === 405 && !f.calls.rpc.length, 'GET -> 405'); }

// 3. a test address in Test mode is sent and marked sent with the service id
{ const f = fake(); const r = await handleOutboxSend(post(), f.deps); const j = await r.json(); const m = marks(f.calls);
  ok(j.sent === 1 && f.calls.fetch.length === 1 && m.length === 1 && m[0].p_ok === true && m[0].p_provider_id === 'ses-1', 'test address: sent once, marked sent with the SES id'); }

// 4. Test mode guard in the function too (the database already skips these): not sent, marked failed with the reason, no retry
for (const bad of [row({ to: 'buyer@example.com' }), row({ cc: ['agent@realty.com'] }), row({ bcc: ['jcoester@clatitle.com'] }), row({ to: 'clatestportal+x@evil.com' })]) {
  const f = fake({ claim: { mode: 'test', testAddressRegex: '^.*$', rows: [bad] } }); await handleOutboxSend(post(), f.deps); const m = marks(f.calls);
  ok(!f.calls.fetch.length && m.length === 1 && m[0].p_ok === false && m[0].p_retry === false && /^Test mode: /.test(m[0].p_error), `Test mode guard (even with a loose stored pattern): ${bad.to} ${bad.cc} ${bad.bcc} not sent`);
}
ok(testModeProblem(row(), null) === null && testModeProblem(row({ to: 'CLATestPortal+A@gmail.com' }), null) === null, 'clatestportal+ addresses pass (any case)');
ok(/clatestportal/.test(testModeProblem(row({ to: 'clatestportal@gmail.com' }), null)), 'clatestportal@gmail.com without a +tag is not a test address');
// Live mode sends to anyone with a valid address
{ const f = fake({ claim: { mode: 'live', rows: [row({ to: 'buyer@example.com', cc: ['agent@realty.com'] })] } }); await handleOutboxSend(post(), f.deps);
  ok(f.calls.fetch.length === 1 && marks(f.calls)[0].p_ok === true, 'Live mode: a real address is sent'); }
{ const f = fake({ claim: { mode: 'live', rows: [row({ to: 'not an email' })] } }); await handleOutboxSend(post(), f.deps);
  ok(!f.calls.fetch.length && marks(f.calls)[0].p_ok === false, 'an invalid address is never sent'); }

// 5. failures: a retryable one is retried, a refusal is not, a network error is retried
{ const f = fake({ fetchRes: () => ({ status: 503, body: { message: 'Service Unavailable' } }) }); await handleOutboxSend(post(), f.deps); const m = marks(f.calls)[0];
  ok(m.p_ok === false && m.p_retry === true && /503/.test(m.p_error), '503 -> marked for retry with the reason'); }
{ const f = fake({ fetchRes: () => ({ status: 400, body: { message: 'Email address is not verified.' } }) }); await handleOutboxSend(post(), f.deps); const m = marks(f.calls)[0];
  ok(m.p_ok === false && m.p_retry === false && /not verified/.test(m.p_error), '400 -> failed with the reason, no retry'); }
{ const f = fake({ fetchRes: () => ({ throw: true }) }); await handleOutboxSend(post(), f.deps); const m = marks(f.calls)[0];
  ok(m.p_ok === false && m.p_retry === true, 'network error -> retry'); }
{ const f = fake({ fetchRes: () => ({ status: 403, body: { message: 'The security token included in the request is invalid. Signature=abc' } }) }); await handleOutboxSend(post(), f.deps);
  ok(!/Signature=/.test(marks(f.calls)[0].p_error), 'a reason that echoes signing detail is replaced'); }
ok(safeError('') === 'The email service did not say why.', 'empty reason gets a plain sentence');

// 6. attachments: wire instructions are never sent; a missing document fails; bytes are attached
{ const f = fake({ claim: { mode: 'test', rows: [row({ attachmentIds: ['d1'] })] }, docs: [{ name: 'Wire Instructions.pdf', mime: 'application/pdf', size: 10, wire: false, bytes: async () => new Uint8Array(3) }] });
  await handleOutboxSend(post(), f.deps); ok(!f.calls.fetch.length && /Wire instructions/.test(marks(f.calls)[0].p_error), 'a wire instructions file is never emailed'); }
{ const f = fake({ claim: { mode: 'test', rows: [row({ attachmentIds: ['d1', 'd2'] })] }, docs: [] }); await handleOutboxSend(post(), f.deps);
  ok(!f.calls.fetch.length && marks(f.calls)[0].p_retry === false, 'a missing attachment fails, no retry'); }
{ const f = fake({ claim: { mode: 'test', rows: [row({ attachmentIds: ['d1'] })] }, docs: [{ name: 'Commitment.pdf', mime: 'application/pdf', size: 3, wire: false, bytes: async () => new Uint8Array([37, 80, 68]) }] });
  await handleOutboxSend(post(), f.deps); const raw = Buffer.from(JSON.parse(f.calls.fetch[0].init.body).Content.Raw.Data, 'base64').toString();
  ok(/filename="Commitment.pdf"/.test(raw), 'an attachment is in the SES message'); }

// 7. SES request: signed, bcc only in the envelope, from name, outbox id tag
{ const f = fake({ claim: { mode: 'test', rows: [row({ cc: ['clatestportal+cc@gmail.com'], bcc: ['clatestportal+bcc@gmail.com'] })] } }); await handleOutboxSend(post(), f.deps);
  const c = f.calls.fetch[0]; const p = JSON.parse(c.init.body); const raw = Buffer.from(p.Content.Raw.Data, 'base64').toString();
  ok(c.u === 'https://email.us-east-1.amazonaws.com/v2/email/outbound-emails' && /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/us-east-1\/ses\/aws4_request/.test(c.init.headers.authorization), 'SES v2 SendEmail, SigV4 signed');
  ok(p.Destination.BccAddresses[0] === 'clatestportal+bcc@gmail.com' && !/^Bcc:/m.test(raw) && /^Cc: clatestportal\+cc@gmail.com/m.test(raw), 'bcc is in the envelope, never in the message headers');
  ok(p.FromEmailAddress === '"CLA Title Portal" <portal@clatitle.com>' && p.EmailTags[0].Value === 'r1' && /^Subject: Hi/m.test(raw), 'From name, subject and outbox id tag');
  ok(!JSON.stringify(c.init.headers).includes('k'.repeat(40)), 'the secret key is never sent'); }

// 8. Resend request: API key header, idempotency key per outbox row (a retry can not send twice)
{ const env = { OUTBOX_PROVIDER: 'resend', RESEND_API_KEY: 're_test_' + 'y'.repeat(20) };
  const f = fake({ env, fetchRes: () => ({ status: 200, body: { id: 'rs-1' } }) }); await handleOutboxSend(post(), f.deps); const c = f.calls.fetch[0]; const b = JSON.parse(c.init.body);
  ok(c.u === 'https://api.resend.com/emails' && c.init.headers['Idempotency-Key'] === 'outbox-r1' && b.to[0] === 'clatestportal+buyer@gmail.com' && b.text === 'Hello\nthere' && marks(f.calls)[0].p_provider_id === 'rs-1', 'Resend: one call, idempotency key, marked sent'); }
ok(typeof sesProvider === 'function' && typeof resendProvider === 'function', 'both providers share one send() interface');
ok(buildMessage(row()).html.includes('Hello<br>there'), 'plain text body also goes as simple HTML');

// 9. SigV4 matches AWS's published test suite (get-vanilla)
{ const h = await sigv4({ method: 'GET', host: 'example.amazonaws.com', path: '/', body: '', region: 'us-east-1', service: 'service', accessKeyId: 'AKIDEXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY', amzDate: '20150830T123600Z' });
  ok(h.authorization === 'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31', 'SigV4 get-vanilla vector'); }

// 10. the edge function and the database file
{ const idx = readFileSync(new URL('../supabase/functions/outbox-send/index.ts', import.meta.url), 'utf8');
  const sql = readFileSync(new URL('../supabase/migrations/20261131000000_outbox_sender.sql', import.meta.url), 'utf8');
  ok(/handleOutboxSend/.test(idx) && !/console\.log/.test(idx) && /outbox_svc_check_token/.test(idx), 'index.ts: shared handler, token checked in the database, no logging');
  ok(/for update skip locked/.test(sql) && /'pre-sender backlog, not sent'/.test(sql) && /mode text not null default 'test'/.test(sql), 'SQL: row claiming, backlog reason, Test mode default');
  ok(/revoke all on function public\.%s from public, anon, authenticated/.test(sql) && /grant execute on function public\.%s to service_role/.test(sql), 'SQL: only the server key can claim or mark');
  ok(/vault\.secrets where name = 'gmail_sync_token'/.test(sql) && !/bxixxgcqxmtzkrolywas/.test(sql), 'SQL: TEST only'); }

console.log(fail ? `${fail} failed` : 'outbox sender passed');
if (fail) process.exit(1);
