/* John, Nov 9: "I want the portal to send it ... just like what staff gets / agents gets". Invites (agent, buyer / seller, HR staff) are emailed
   from the inviter's own connected Gmail through gmail-send. Google, Supabase and the browser are all fakes here. Nothing is sent. */
import { existsSync, readFileSync } from 'node:fs';
import { handleSend } from '../supabase/functions/_shared/gmail-handlers.mjs';
import { inviteEmailContent, inviteLink, AUTH_INVITE_SUBJECT } from '../supabase/functions/_shared/gmail-core.mjs';
import { tokenOfLink, autoSendInvite, inviteSendNotice } from '../js/data/invite-send.js';
import { toText } from '../js/ui.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const TOKEN = 'a'.repeat(64); const ME = '11111111-1111-4111-8111-111111111111';
const b64d = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
const fileInfo = { kind: 'agent', inviteKind: 'client', email: 'clatestportal+seller1@gmail.com', firstName: 'Cora', lastName: 'Seller', expiresAt: '2026-11-23T22:00:00Z',
  dealId: 'd1', fileNumber: 'MD-26-97216', street: '13 Drumcastle Ct', city: 'Germantown', state: 'MD', zip: '20876' };
function fake({ info = fileInfo, rpcError = null, ctx = {}, sendStatus = 200, projectRef = 'aqcervntopidtcazcmlv' } = {}) {
  const calls = { svc: [], fetch: [], rpc: [] };
  const c = { uid: ME, viewAs: false, allowed: true, role: 'Processor', firstName: 'Francis', lastName: 'Santos', mailbox: 'fsantos@clatitle.com', mailboxStatus: 'connected', signatureHtml: '<p>Francis Santos<br>CLA Title</p>', ...ctx };
  const deps = { projectRef, clientId: 'cid', clientSecret: 'never-shown', headers: {}, now: () => Date.now(), newId: () => 'seed-1',
    fetch: async (url, init = {}) => { calls.fetch.push({ url, body: init.body || '' });
      const r = url.includes('oauth2.googleapis.com/token') ? { status: 200, body: { access_token: 'ya29.x' } } : url.includes('/messages/send') ? { status: sendStatus, body: sendStatus < 300 ? { id: 'gInv1', threadId: 't1' } : { error: 'no' } } : { status: 404, body: {} };
      return { ok: r.status < 300, status: r.status, json: async () => r.body }; },
    getUser: async () => ({ id: ME }), myContext: async () => c,
    userRpc: async (fn, args) => { calls.rpc.push({ fn, args }); if (rpcError) throw new Error(rpcError); return { ...info, kind: args.p_kind === 'hr' ? 'hr' : info.kind }; },
    svc: async (fn, args) => { calls.svc.push({ fn, args }); if (fn === 'gmail_svc_token') return [{ email: 'fsantos@clatitle.com', refresh_token: 'r', status: 'connected' }]; return null; } };
  return { deps, calls };
}
const post = (body) => new Request('https://x.supabase.co/functions/v1/gmail-send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const run = async (body, opts) => { const f = fake(opts); const res = await handleSend(post(body), f.deps); return { res, j: await res.json(), ...f }; };

// email content: the approved Auth template, with only the link variable swapped
const link = inviteLink('agent', TOKEN);
const m = inviteEmailContent(fileInfo, { token: TOKEN, inviterName: 'Francis Santos' });
ok(m.subject === AUTH_INVITE_SUBJECT && m.subject === "You're invited to the CLA Title Portal" && !m.subject.includes('MD-26-97216'), 'invite subject is the Auth subject, with no file tag');
ok(m.html.includes('href="' + link + '"') && m.html.includes('Accept invitation') && m.html.includes('https://testportal.clatitle.com/assets/img/logo-white.png') && m.html.includes('alt="C.L.A. Title &amp; Escrow"') && m.html.includes('>clatitle.com</a>') && m.html.includes('C.L.A. Title &amp; Escrow') && !m.html.includes('{{ .ConfirmationURL }}') && m.to === 'clatestportal+seller1@gmail.com', 'buyer / seller email is the approved template with the portal link');
ok(existsSync(new URL('../assets/img/logo-white.png', import.meta.url)), 'the invite logo path exists in the repo');
const ag = inviteEmailContent({ ...fileInfo, inviteKind: 'agent' }, { token: TOKEN });
ok(ag.html.includes('/#/agent-invite/' + TOKEN) && ag.html.includes('Accept invitation') && ag.subject === AUTH_INVITE_SUBJECT, 'agent email uses the same approved design');
const hr = inviteEmailContent({ kind: 'hr', inviteKind: 'staff', email: 'clatestportal+newhire@gmail.com', firstName: 'Nina' }, { token: TOKEN });
ok(hr.subject === AUTH_INVITE_SUBJECT && hr.link.endsWith('/#/hr-invite/' + TOKEN) && hr.html.includes('/#/hr-invite/' + TOKEN), 'HR invite: Auth subject, hr-invite link');
const nasty = inviteEmailContent({ ...fileInfo, firstName: '<b>x</b>' }, { token: '<script>' });
ok(!nasty.html.includes('<script>') && !nasty.html.includes('<b>x</b>') && nasty.html.includes('&lt;script&gt;'), 'the invite link is escaped');

// gmail-send invite mode: the inviter's own Gmail, the approved template, no fallback mailbox
let r = await run({ invite: { kind: 'agent', token: TOKEN } });
const sendCall = r.calls.fetch.find((x) => x.url.includes('/messages/send')); const raw = sendCall ? b64d(JSON.parse(sendCall.body).raw) : '';
const htmlPart = (() => { const i = raw.indexOf('text/html'); if (i < 0) return ''; const body = raw.slice(i).split('\r\n\r\n')[1] || ''; return b64d(body.split('\r\n--')[0].replace(/\r\n/g, '')); })();
ok(r.res.status === 200 && r.j.sent === true && r.j.to === 'clatestportal+seller1@gmail.com' && r.j.from === 'fsantos@clatitle.com' && r.j.gmailMessageId === 'gInv1', 'sent from the inviter Gmail to the invite email');
ok(/^From: "Francis Santos" <fsantos@clatitle.com>\r?$/m.test(raw) && htmlPart.includes('Accept invitation') && htmlPart.includes('/#/agent-invite/' + TOKEN) && htmlPart.includes('logo-white.png') && !htmlPart.includes('{{ .ConfirmationURL }}') && !htmlPart.includes('Francis Santos<br>CLA Title') && !/^(Cc|Bcc):/m.test(raw), 'one To, approved template, inviter as From, no extra signature, no CC');
ok(r.calls.svc.some((x) => x.fn === 'gmail_svc_token' && x.args.p_profile === ME) && !r.calls.svc.some((x) => x.fn === 'gmail_svc_token' && x.args.p_profile !== ME), 'the token read is the inviter, not another mailbox');
ok(r.calls.rpc[0] && r.calls.rpc[0].fn === 'invite_send_info' && r.calls.rpc[0].args.p_token === TOKEN, 'recipient comes from invite_send_info run as the inviter');
const mark = r.calls.svc.find((x) => x.fn === 'invite_svc_mark_sent');
ok(mark && mark.args.p_message_id === 'gInv1' && mark.args.p_error === null && mark.args.p_profile === ME, 'sent_by is the inviter and the Gmail message id is stored');
ok(!r.calls.svc.some((x) => x.fn === 'gmail_svc_record'), 'the one-time link is not copied into the file email list');
r = await run({ invite: { kind: 'agent', token: TOKEN }, to: ['someone-else@example.com'] });
ok(r.j.to === 'clatestportal+seller1@gmail.com', 'a To from the browser is ignored');
r = await run({ invite: { kind: 'hr', token: TOKEN } }); ok(r.j.sent === true && r.calls.rpc[0].args.p_kind === 'hr', 'HR staff invite is sent too');
r = await run({ invite: { kind: 'agent', token: 'short' } }); ok(r.res.status === 400 && !r.calls.fetch.length, 'a bad token is refused before anything');
r = await run({ invite: { kind: 'agent', token: TOKEN } }, { rpcError: 'Only CLA staff can send portal invites.' });
ok(r.res.status === 403 && /Only CLA staff/.test(r.j.error) && !r.calls.fetch.some((x) => x.url.includes('/messages/send')), 'someone who may not invite (e.g. a TC) is refused, nothing sent');
r = await run({ invite: { kind: 'agent', token: TOKEN } }, { info: { ...fileInfo, email: 'carrie.real@remax.example' } });
ok(r.res.status === 403 && r.j.refused[0] === 'carrie.real@remax.example' && !r.calls.fetch.length, 'Live Test refuses a real (non-test) address');
ok(r.calls.svc.some((x) => x.fn === 'invite_svc_mark_sent' && /test addresses/.test(x.args.p_error)), 'the refusal is recorded on the invite');
r = await run({ invite: { kind: 'agent', token: TOKEN } }, { ctx: { mailbox: null, mailboxStatus: null } });
ok(r.res.status === 409 && r.j.connectGmail === true && /Connect Gmail/.test(r.j.error) && !r.calls.fetch.length, 'no connected Gmail: clear Connect Gmail answer, nothing sent');
r = await run({ invite: { kind: 'agent', token: TOKEN } }, { ctx: { allowed: false, role: 'Employee', mailbox: null } });
ok(r.res.status === 403 && !r.calls.fetch.length && !r.calls.rpc.length, 'a non-staff login is refused before any send');
r = await run({ invite: { kind: 'agent', token: TOKEN } }, { projectRef: 'bxixxgcqxmtzkrolywas' });
ok(r.res.status === 503 && /Live Test only/.test(r.j.error) && !r.calls.fetch.length, 'production is refused before any invite is sent');
r = await run({ invite: { kind: 'agent', token: TOKEN } }, { sendStatus: 500 });
ok(r.res.status === 502 && r.calls.svc.some((x) => x.fn === 'invite_svc_mark_sent' && /HTTP 500/.test(x.args.p_error)), 'a Gmail failure is reported and recorded');

// page helpers
ok(tokenOfLink('#/agent-invite/' + TOKEN) === TOKEN && tokenOfLink('#/hr-invite/' + TOKEN) === TOKEN && tokenOfLink('#/x/1') === '', 'token is read from the link');
let asked = null; const res1 = await autoSendInvite({ sendInviteEmail: async (a) => { asked = a; return { sent: true, to: 't@x' }; } }, 'hr', '#/hr-invite/' + TOKEN);
ok(asked && asked.kind === 'hr' && asked.token === TOKEN && res1.sent, 'autoSendInvite asks for the right invite');
ok(/Emailed to/.test(toText(inviteSendNotice({ sent: true, to: 'a@b.c' }))) && /Connect Gmail/.test(toText(inviteSendNotice({ sent: false, connectGmail: true, error: 'x' }))) && /Not emailed/.test(toText(inviteSendNotice({ sent: false, error: 'y' }))), 'notice says sent / connect Gmail / not emailed');

// every invite screen calls it
for (const [f, kind] of [['js/pages/dealcontacts.js', "'agent'"], ['js/pages/agent-invites.js', "'agent'"], ['js/pages/hr.js', "'hr'"]]) {
  const s = readFileSync(f, 'utf8'); ok(s.includes(`autoSendInvite(api, ${kind}`), `${f} emails its invites`); }
const ai = readFileSync('js/pages/agent-invites.js', 'utf8');
ok((ai.match(/autoSendInvite\(api, 'agent'/g) || []).length >= 2 && /data-invite-emailed/.test(ai), 'Agent Invites: Create and Resend both email, list shows Emailed');
const hrs = readFileSync('js/pages/hr.js', 'utf8'); ok((hrs.match(/autoSendInvite\(api, 'hr'/g) || []).length >= 2, 'HR: add employee and new invite link both email');
const sql = readFileSync('supabase/migrations/20261110001000_invite_auto_email.sql', 'utf8');
ok(/can_invite_agents\(\)/.test(sql) && /hr_admin\(\)/.test(sql) && /to service_role/.test(sql) && /from public, anon, authenticated/.test(sql), 'SQL: inviter checked as the user; mark-sent is service role only');

console.log(fail ? `FAIL ${fail}` : 'all invite auto-email checks passed');
process.exit(fail ? 1 : 0);
