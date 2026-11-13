/* John, Nov 9: "I want the portal to send it ... just like what staff gets / agents gets". Invites (agent, buyer / seller, HR staff) are emailed
   through gmail-send. John, Nov 11 (t1488u / t1490u): they go FROM testportal@clatitle.com (TEST Auth's approved invite email), never from
   the inviter's Gmail. Google, Supabase Auth and the browser are all fakes here. Nothing is sent. */
import { existsSync, readFileSync } from 'node:fs';
import { handleSend } from '../supabase/functions/_shared/gmail-handlers.mjs';
import { inviteEmailContent, inviteLink, inviteAuthRedirect, PORTAL_INVITE_SENDER, AUTH_INVITE_SUBJECT, taskNoticeContent, unnotifiedTasks } from '../supabase/functions/_shared/gmail-core.mjs';
import { tokenOfLink, autoSendInvite, inviteSendNotice } from '../js/data/invite-send.js';
import { toText } from '../js/ui.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const TOKEN = 'a'.repeat(64); const ME = '11111111-1111-4111-8111-111111111111';
const b64d = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
const fileInfo = { kind: 'agent', inviteKind: 'client', email: 'clatestportal+seller1@gmail.com', firstName: 'Cora', lastName: 'Seller', expiresAt: '2026-11-23T22:00:00Z',
  dealId: 'd1', fileNumber: 'MD-26-97216', street: '13 Drumcastle Ct', city: 'Germantown', state: 'MD', zip: '20876' };
function fake({ info = fileInfo, rpcError = null, ctx = {}, sendStatus = 200, projectRef = 'aqcervntopidtcazcmlv', auth = [{ id: 'auth-u1' }], stub = null } = {}) {
  const calls = { svc: [], fetch: [], rpc: [], auth: [], stub: [], del: [] };
  const c = { uid: ME, viewAs: false, allowed: true, role: 'Processor', firstName: 'Francis', lastName: 'Santos', mailbox: 'fsantos@clatitle.com', mailboxStatus: 'connected', signatureHtml: '<p>Francis Santos<br>CLA Title</p>', ...ctx };
  const deps = { projectRef, clientId: 'cid', clientSecret: 'never-shown', headers: {}, now: () => Date.now(), newId: () => 'seed-1',
    fetch: async (url, init = {}) => { calls.fetch.push({ url, body: init.body || '' });
      const n = calls.fetch.filter((x) => String(x.url).includes('/messages/send')).length;
      const r = url.includes('oauth2.googleapis.com/token') ? { status: 200, body: { access_token: 'ya29.x' } } : url.includes('/messages/send') ? { status: sendStatus, body: sendStatus < 300 ? { id: 'gInv' + n, threadId: 't1' } : { error: 'no' } } : { status: 404, body: {} };
      return { ok: r.status < 300, status: r.status, json: async () => r.body }; },
    getUser: async () => ({ id: ME }), myContext: async () => c,
    userRpc: async (fn, args) => { calls.rpc.push({ fn, args }); if (rpcError) throw new Error(rpcError); return { ...info, kind: args.p_kind === 'hr' ? 'hr' : info.kind }; },
    svc: async (fn, args) => { calls.svc.push({ fn, args }); if (fn === 'gmail_svc_token') return [{ email: 'fsantos@clatitle.com', refresh_token: 'r', status: 'connected' }]; return null; },
    authInvite: async (email, opts) => { calls.auth.push({ email, opts }); return auth[Math.min(calls.auth.length - 1, auth.length - 1)]; },
    authStub: async (email) => { calls.stub.push(email); return stub; },
    deleteAuthUser: async (id) => { calls.del.push(id); } };
  return { deps, calls };
}
const post = (body) => new Request('https://x.supabase.co/functions/v1/gmail-send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const run = async (body, opts) => { const f = fake(opts); const res = await handleSend(post(body), f.deps); return { res, j: await res.json(), ...f }; };

// email content: approved design, plus the property address in the subject and a welcome line
const ADDR = '13 Drumcastle Ct, Germantown MD 20876';
const link = inviteLink('agent', TOKEN);
const m = inviteEmailContent({ ...fileInfo, partyRole: 'seller' }, { token: TOKEN, inviterName: 'Francis Santos' });
ok(m.subject === `CLA Title & Escrow Has Shared Access to ${ADDR}` && !m.subject.includes('MD-26-97216'), 'invite subject names the property address and not the file number');
ok(m.html.includes('Welcome, Cora.') && m.html.includes('You&#39;re the seller for ' + ADDR) && m.html.includes('href="' + link + '"') && m.html.includes('Accept invitation') && m.html.includes('https://testportal.clatitle.com/assets/img/logo-white.png') && m.html.includes('>clatitle.com</a>') && !m.html.includes('{{ .ConfirmationURL }}') && m.to === 'clatestportal+seller1@gmail.com', 'welcome line names the person, role, and address inside the approved design');
ok(existsSync(new URL('../assets/img/logo-white.png', import.meta.url)), 'the invite logo path exists in the repo');
const noAddr = inviteEmailContent({ kind: 'agent', inviteKind: 'client', partyRole: 'buyer', email: 'clatestportal+buyer@gmail.com', firstName: 'Pat' }, { token: TOKEN });
ok(noAddr.subject === AUTH_INVITE_SUBJECT && !noAddr.html.includes('Welcome, Pat'), 'no address: the Auth subject stays and no welcome line is added');
const ag = inviteEmailContent({ ...fileInfo, inviteKind: 'agent', partyRole: 'agent', firstName: 'Lee' }, { token: TOKEN });
ok(ag.html.includes('You&#39;re the agent for ' + ADDR) && ag.subject.startsWith('CLA Title & Escrow Has Shared Access to '), 'an agent invite names the agent role and the same address');
const hr = inviteEmailContent({ kind: 'hr', inviteKind: 'staff', email: 'clatestportal+newhire@gmail.com', firstName: 'Nina' }, { token: TOKEN });
ok(hr.subject === AUTH_INVITE_SUBJECT && hr.link.endsWith('/#/hr-invite/' + TOKEN) && !hr.html.includes('Welcome, Nina'), 'HR invite: Auth subject, no property line');
const nasty = inviteEmailContent({ ...fileInfo, partyRole: 'buyer', firstName: '<b>x</b>' }, { token: '<script>' });
ok(!nasty.html.includes('<script>') && !nasty.html.includes('<b>x</b>') && nasty.html.includes('&lt;script&gt;') && nasty.html.includes('&lt;b&gt;x&lt;/b&gt;'), 'the invite link and the welcome name are escaped');
const batch = unnotifiedTasks({ tasks: [{ id: 't1', title: 'Personal information', status: 'todo' }, { id: 't2', title: 'Photo ID', status: 'blocked' }, { id: 't0', title: 'Old task', status: 'todo' }, { id: 'td', title: 'Already done', status: 'done' }, { id: 'tx', title: 'Cancelled task', status: 'cancelled' }], taskNoticeIds: ['t0'] });
ok(batch.map((t) => t.title).join('|') === 'Personal information|Photo ID', 'a task notice is one batch of open tasks and skips tasks already emailed');
ok(unnotifiedTasks({ tasks: [{ id: 'td', title: 'Already done', status: 'done' }] }).length === 0, 'no open tasks means nothing to email');
const notice = taskNoticeContent({ ...fileInfo, partyRole: 'seller' }, batch, { token: TOKEN });
ok(notice.subject === `You have new tasks for ${ADDR}` && notice.html.includes('Personal information, Photo ID') && !notice.html.includes('Old task') && !notice.html.includes('Already done') && notice.html.includes('See my tasks') && notice.html.includes(link), 'the follow-up uses the approved shell and lists the open batch once');
const dollar = taskNoticeContent({ ...fileInfo }, [{ id: 't9', title: '$&' }], { token: TOKEN });
ok(dollar.html.includes('$&amp;') && !dollar.html.includes('in one place'), 'a $& task title is inserted literally');

// gmail-send invite mode: TEST Auth's approved invite email FROM testportal@clatitle.com. The inviter's Gmail is never read or used.
const googleSends = (calls) => calls.fetch.filter((x) => String(x.url).includes('googleapis.com'));
let r = await run({ invite: { kind: 'agent', token: TOKEN } });
ok(r.res.status === 200 && r.j.sent === true && r.j.via === 'auth' && r.j.to === 'clatestportal+seller1@gmail.com' && r.j.from === 'testportal@clatitle.com' && PORTAL_INVITE_SENDER === 'testportal@clatitle.com' && r.j.subject === AUTH_INVITE_SUBJECT && AUTH_INVITE_SUBJECT === "You're invited to the CLA Title Portal", 'sent FROM testportal@clatitle.com with the approved Auth invite subject');
ok(r.calls.auth.length === 1 && r.calls.auth[0].email === 'clatestportal+seller1@gmail.com' && r.calls.auth[0].opts.redirectTo === inviteAuthRedirect('agent', TOKEN) && inviteAuthRedirect('agent', TOKEN) === 'https://testportal.clatitle.com/?portal_invite=agent.' + TOKEN, 'Auth is asked once, landing on the portal accept page for this token');
ok(!googleSends(r.calls).length && !r.calls.svc.some((x) => x.fn === 'gmail_svc_token'), "the inviter's Gmail token is never read and Google is never called");
ok(r.calls.rpc[0] && r.calls.rpc[0].fn === 'invite_send_info' && r.calls.rpc[0].args.p_token === TOKEN, 'recipient comes from invite_send_info run as the inviter');
const mark = r.calls.svc.find((x) => x.fn === 'invite_svc_mark_sent');
ok(mark && mark.args.p_message_id === 'auth-invite:auth-u1' && mark.args.p_error === null && mark.args.p_profile === ME, 'sent_by is the inviter and the Auth invite id is stored');
ok(!r.calls.svc.some((x) => x.fn === 'gmail_svc_record'), 'the one-time link is not copied into the file email list');
r = await run({ invite: { kind: 'agent', token: TOKEN }, to: ['someone-else@example.com'] });
ok(r.j.to === 'clatestportal+seller1@gmail.com' && r.calls.auth[0].email === 'clatestportal+seller1@gmail.com', 'a To from the browser is ignored');
r = await run({ invite: { kind: 'hr', token: TOKEN } });
ok(r.j.sent === true && r.calls.rpc[0].args.p_kind === 'hr' && r.calls.auth[0].opts.redirectTo === 'https://testportal.clatitle.com/?portal_invite=hr.' + TOKEN, 'HR staff invite is sent too, landing on the HR accept page');
r = await run({ invite: { kind: 'agent', token: TOKEN } }, { ctx: { mailbox: null, mailboxStatus: null } });
ok(r.res.status === 200 && r.j.sent === true && r.j.from === 'testportal@clatitle.com' && !r.j.connectGmail, 'no connected Gmail is needed: the invite still goes from testportal');
r = await run({ invite: { kind: 'agent', token: 'short' } }); ok(r.res.status === 400 && !r.calls.auth.length, 'a bad token is refused before anything');
r = await run({ invite: { kind: 'agent', token: TOKEN } }, { rpcError: 'Only CLA staff can send portal invites.' });
ok(r.res.status === 403 && /Only CLA staff/.test(r.j.error) && !r.calls.auth.length, 'someone who may not invite (e.g. a TC) is refused, nothing sent');
r = await run({ invite: { kind: 'agent', token: TOKEN } }, { info: { ...fileInfo, email: 'carrie.real@remax.example' } });
// Nov 13 (John): no test-address list on TEST. A real address gets its invite like any other.
ok(r.res.status === 200 && r.j.sent === true && r.calls.auth.length === 1 && r.calls.auth[0].email === 'carrie.real@remax.example', 'Live Test sends the invite to a real (non-test) address');
ok(!r.calls.svc.some((x) => x.fn === 'invite_svc_mark_sent' && /test addresses/.test(String(x.args.p_error || ''))), 'nothing records a test-address refusal');
for (const a of ['testbuyerjohnc@gmail.com', 'testsellergael@gmail.com', 'johncoester@gmail.com', 'listingagentrosy@gmail.com']) {
  r = await run({ invite: { kind: 'agent', token: TOKEN } }, { info: { ...fileInfo, email: a } });
  ok(r.j.sent === true && r.calls.auth[0].email === a, `the test inbox ${a} is allowed`);
}
r = await run({ invite: { kind: 'agent', token: TOKEN } }, { ctx: { allowed: false, role: 'Employee', mailbox: null } });
ok(r.res.status === 403 && !r.calls.auth.length && !r.calls.rpc.length, 'a non-staff login is refused before any send');
r = await run({ invite: { kind: 'agent', token: TOKEN } }, { projectRef: 'bxixxgcqxmtzkrolywas' });
ok(r.res.status === 503 && /Live Test only/.test(r.j.error) && !r.calls.auth.length, 'production is refused before any invite is sent');
r = await run({ invite: { kind: 'agent', token: TOKEN } }, { auth: [{ error: 'Error sending invite email' }] });
ok(r.res.status === 502 && /testportal@clatitle\.com/.test(r.j.error) && r.calls.svc.some((x) => x.fn === 'invite_svc_mark_sent' && /Error sending invite email/.test(x.args.p_error)) && !googleSends(r.calls).length, 'an Auth mail failure is reported and recorded, with no Gmail fallback');
r = await run({ invite: { kind: 'agent', token: TOKEN } }, { auth: [{ id: 'auth-u2' }], stub: { id: 'stub-1', invited: true, hasProfile: false } });
ok(r.j.sent === true && r.calls.del.join() === 'stub-1' && r.calls.auth.length === 1 && r.calls.auth[0].opts.data.portal_invite === 'agent.' + TOKEN && r.calls.svc.find((x) => x.fn === 'invite_svc_mark_sent').args.p_message_id === 'auth-invite:auth-u2', 'Resend after an unfinished invite replaces the invite-only login and sends this link');
r = await run({ invite: { kind: 'agent', token: TOKEN } }, { stub: { id: 'real-1', invited: false, hasProfile: true } });
ok(r.res.status === 409 && /already has a portal login/.test(r.j.error) && !r.calls.del.length && !r.calls.auth.length, 'a real portal login is never deleted or re-invited');
r = await run({ invite: { kind: 'agent', token: TOKEN } }, { stub: { id: 'claimed-1', invited: true, hasProfile: true } });
ok(r.res.status === 409 && !r.calls.del.length && !r.calls.auth.length, 'an accepted invite login (has a profile) is never deleted');
r = await run({ invite: { kind: 'agent', token: TOKEN } }, { auth: [{ error: 'already registered', exists: true }] });
ok(r.res.status === 409 && !r.calls.del.length, 'Auth saying the email exists is a plain not-emailed answer');
const taskInfo = { ...fileInfo, partyRole: 'buyer', tasks: [{ id: '11111111-1111-4111-8111-111111111111', title: 'Personal information' }, { id: '22222222-2222-4222-8222-222222222222', title: 'Photo ID' }, { id: '33333333-3333-4333-8333-333333333333', title: 'Already sent' }], taskNoticeIds: ['33333333-3333-4333-8333-333333333333'] };
r = await run({ invite: { kind: 'agent', token: TOKEN } }, { info: taskInfo });
ok(r.res.status === 200 && r.j.sent === true && r.j.taskNotice.sent === false && r.j.taskNotice.count === 2 && !googleSends(r.calls).length && !r.calls.svc.some((x) => x.fn === 'invite_svc_mark_task_notice'), "the task follow-up is not sent from the inviter's Gmail (counted, left for a later notice)");

// the Auth button lands on index.html, which opens the portal accept page and drops Auth's sign-in
const idx = readFileSync('index.html', 'utf8');
const land = /<script>([\s\S]*?portal_invite[\s\S]*?)<\/script>/.exec(idx);
ok(land && idx.indexOf(land[0]) < idx.indexOf('type="module"'), 'the invite landing runs before the portal module starts');
const jwt = (meta) => 'h.' + Buffer.from(JSON.stringify({ sub: 'u', user_metadata: meta })).toString('base64url') + '.s';
const viaSite = '#access_token=' + jwt({ portal_invite: 'agent.' + TOKEN }) + '&expires_in=3600&refresh_token=r&token_type=bearer&type=invite';
for (const [search, hash, want] of [['?portal_invite=agent.' + TOKEN, '#access_token=x&type=invite', '/#/agent-invite/' + TOKEN], ['?portal_invite=hr.' + TOKEN, '', '/#/hr-invite/' + TOKEN], ['?portal_invite=agent.short', '', null], ['?x=1', '', null],
  ['', viaSite, '/#/agent-invite/' + TOKEN], ['', viaSite.replace('type=invite', 'type=recovery'), null], ['', '#access_token=' + jwt({ portal_invite: 'agent.<b>' }) + '&type=invite', null], ['', '#/dashboard', null]]) {
  let to = null; const loc = { search, hash, pathname: '/' }; const hist = { replaceState: (a, b, u) => { to = u; } };
  new Function('location', 'history', 'atob', land[1])(loc, hist, (x) => Buffer.from(x, 'base64').toString('binary'));
  ok(to === want, `landing ${search}${hash.slice(0, 20)} -> ${want}`);
}

// page helpers
ok(tokenOfLink('#/agent-invite/' + TOKEN) === TOKEN && tokenOfLink('#/hr-invite/' + TOKEN) === TOKEN && tokenOfLink('#/x/1') === '', 'token is read from the link');
let asked = null; const res1 = await autoSendInvite({ sendInviteEmail: async (a) => { asked = a; return { sent: true, to: 't@x' }; } }, 'hr', '#/hr-invite/' + TOKEN);
ok(asked && asked.kind === 'hr' && asked.token === TOKEN && res1.sent, 'autoSendInvite asks for the right invite');
ok(/Emailed to/.test(toText(inviteSendNotice({ sent: true, to: 'a@b.c' }))) && /from testportal@clatitle\.com/.test(toText(inviteSendNotice({ sent: true, to: 'a@b.c', from: 'testportal@clatitle.com' }))) && !/your Gmail/.test(toText(inviteSendNotice({ sent: true, to: 'a@b.c' }))) && /Connect Gmail/.test(toText(inviteSendNotice({ sent: false, connectGmail: true, error: 'x' }))) && /Not emailed/.test(toText(inviteSendNotice({ sent: false, error: 'y' }))), 'notice says sent / connect Gmail / not emailed');

// every invite screen calls it
for (const [f, kind] of [['js/pages/dealcontacts.js', "'agent'"], ['js/pages/agent-invites.js', "'agent'"], ['js/pages/hr.js', "'hr'"]]) {
  const s = readFileSync(f, 'utf8'); ok(s.includes(`autoSendInvite(api, ${kind}`), `${f} emails its invites`); }
const ai = readFileSync('js/pages/agent-invites.js', 'utf8');
ok((ai.match(/autoSendInvite\(api, 'agent'/g) || []).length >= 2 && /data-invite-emailed/.test(ai), 'Agent Invites: Create and Resend both email, list shows Emailed');
const hrs = readFileSync('js/pages/hr.js', 'utf8'); ok((hrs.match(/autoSendInvite\(api, 'hr'/g) || []).length >= 2, 'HR: add employee and new invite link both email');
const sql = readFileSync('supabase/migrations/20261110001000_invite_auto_email.sql', 'utf8');
ok(/can_invite_agents\(\)/.test(sql) && /hr_admin\(\)/.test(sql) && /to service_role/.test(sql) && /from public, anon, authenticated/.test(sql), 'SQL: inviter checked as the user; mark-sent is service role only');
const taskSql = readFileSync('supabase/migrations/20261112140000_invite_address_task_notice.sql', 'utf8');
const taskRb = readFileSync('supabase/rollbacks/20261112140000_invite_address_task_notice.sql', 'utf8');
ok(/partyRole/.test(taskSql) && /jsonb_agg/.test(taskSql) && /gmail_sync_token/.test(taskSql) && /invite_svc_mark_task_notice/.test(taskSql) && /to service_role/.test(taskSql), 'task notice SQL is TEST-only, one batch, service role');
const openSql = readFileSync('supabase/migrations/20261112150000_invite_task_notice_open_only.sql', 'utf8');
const openRb = readFileSync('supabase/rollbacks/20261112150000_invite_task_notice_open_only.sql', 'utf8');
ok(/t\.status in \('todo', 'in_progress', 'blocked'\)/.test(openSql) && !/t\.status <> 'cancelled'/.test(openSql) && /gmail_sync_token/.test(openSql), 'the follow-up query returns open tasks only and stays on Live Test');
ok(/t\.status <> 'cancelled'/.test(openRb) && /gmail_sync_token/.test(openRb), 'rollback restores the previous task list');
ok(/drop function if exists public.invite_svc_mark_task_notice/.test(taskRb) && /drop column if exists task_notice_ids/.test(taskRb), 'rollback removes the task notice and restores invite_send_info');

console.log(fail ? `FAIL ${fail}` : 'all invite auto-email checks passed');
process.exit(fail ? 1 : 0);
