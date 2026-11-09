/* John, Nov 9: "I want the portal to send it ... just like what staff gets / agents gets". Invites (agent, buyer / seller, HR staff) are emailed
   from the inviter's own connected Gmail through gmail-send. Google, Supabase and the browser are all fakes here. Nothing is sent. */
import { readFileSync } from 'node:fs';
import { handleSend } from '../supabase/functions/_shared/gmail-handlers.mjs';
import { inviteEmailContent, inviteLink } from '../supabase/functions/_shared/gmail-core.mjs';
import { tokenOfLink, autoSendInvite, inviteSendNotice } from '../js/data/invite-send.js';
import { toText } from '../js/ui.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const TOKEN = 'a'.repeat(64); const ME = '11111111-1111-4111-8111-111111111111';
const b64d = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
const fileInfo = { kind: 'agent', inviteKind: 'client', email: 'clatestportal+seller1@gmail.com', firstName: 'Cora', lastName: 'Seller', expiresAt: '2026-11-23T22:00:00Z',
  dealId: 'd1', fileNumber: 'MD-26-97216', street: '13 Drumcastle Ct', city: 'Germantown', state: 'MD', zip: '20876' };
function fake({ info = fileInfo, rpcError = null, ctx = {}, sendStatus = 200 } = {}) {
  const calls = { svc: [], fetch: [], rpc: [] };
  const c = { uid: ME, viewAs: false, allowed: true, role: 'Processor', firstName: 'Francis', lastName: 'Santos', mailbox: 'fsantos@clatitle.com', mailboxStatus: 'connected', signatureHtml: '<p>Francis Santos<br>CLA Title</p>', ...ctx };
  const deps = { projectRef: 'aqcervntopidtcazcmlv', clientId: 'cid', clientSecret: 'never-shown', headers: {}, now: () => Date.now(), newId: () => 'seed-1',
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

// email content
const m = inviteEmailContent(fileInfo, { token: TOKEN, inviterName: 'Francis Santos' });
ok(m.subject.startsWith("You're invited to the CLA Title portal") && m.subject.includes('MD-26-97216') && /Drumcastle/.test(m.subject), 'file invite subject carries [CLA #file - address]: ' + m.subject);
ok(m.html.includes(inviteLink('agent', TOKEN)) && m.html.includes('Set up my portal login') && m.to === 'clatestportal+seller1@gmail.com', 'buyer / seller email has the button and link');
const ag = inviteEmailContent({ ...fileInfo, inviteKind: 'agent' }, { token: TOKEN }); ok(ag.html.includes('Set up my agent account'), 'agent email says agent account');
const hr = inviteEmailContent({ kind: 'hr', inviteKind: 'staff', email: 'clatestportal+newhire@gmail.com', firstName: 'Nina' }, { token: TOKEN });
ok(hr.subject === "You're invited to the CLA Title portal" && hr.link.endsWith('/#/hr-invite/' + TOKEN), 'HR invite: no file tag, hr-invite link');
ok(!inviteEmailContent({ ...fileInfo, firstName: '<b>x</b>' }, { token: TOKEN }).html.includes('<b>x</b>'), 'names are escaped');

// gmail-send invite mode
let r = await run({ invite: { kind: 'agent', token: TOKEN } });
const sendCall = r.calls.fetch.find((x) => x.url.includes('/messages/send')); const raw = sendCall ? b64d(JSON.parse(sendCall.body).raw) : '';
ok(r.res.status === 200 && r.j.sent === true && r.j.to === 'clatestportal+seller1@gmail.com' && r.j.from === 'fsantos@clatitle.com', 'sent from the inviter Gmail to the invite email');
const htmlPart = (() => { const i = raw.indexOf('text/html'); if (i < 0) return ''; const body = raw.slice(i).split('\r\n\r\n')[1] || ''; return b64d(body.split('\r\n--')[0].replace(/\r\n/g, '')); })();
ok(/^To: clatestportal\+seller1@gmail\.com\r?$/m.test(raw) && htmlPart.includes('Francis Santos<br>CLA Title') && htmlPart.includes('/#/agent-invite/' + TOKEN) && !/^(Cc|Bcc):/m.test(raw), 'one To, inviter signature, invite link, no CC');
ok(r.calls.rpc[0] && r.calls.rpc[0].fn === 'invite_send_info' && r.calls.rpc[0].args.p_token === TOKEN, 'recipient comes from invite_send_info run as the inviter');
const mark = r.calls.svc.find((x) => x.fn === 'invite_svc_mark_sent');
ok(mark && mark.args.p_message_id === 'gInv1' && mark.args.p_error === null && mark.args.p_profile === ME, 'the invite row is marked sent with the Gmail message id');
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
ok(r.res.status === 409 && r.j.connectGmail === true && !r.calls.fetch.length, 'no Gmail connected: clear Connect Gmail answer, nothing sent');
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
