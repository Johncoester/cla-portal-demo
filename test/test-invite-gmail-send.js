/* Buyer and seller portal invites go out through gmail-send, FROM testportal@clatitle.com via TEST Auth (John, Nov 11). Auth and Google are fakes. Nothing is sent.
   The role-suite hold is the same answer the hosted check returns so the e2e logins never reach Google. */
import { readFileSync } from 'node:fs';
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { handleSend } from '../supabase/functions/_shared/gmail-handlers.mjs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { gmailSupabase } from '../js/data/supabase-gmail.js';
import { E2E_INVITE_HOLD } from '../js/data/invite-send.js';
import { toText } from '../js/ui.js';

const { window, document } = parseHTML('<!doctype html><html><body></body></html>');
globalThis.window = window; globalThis.document = document; globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node; globalThis.Event = window.Event;
globalThis.location = { href: 'https://testportal.example/#/deals/deal-4/contacts', hash: '#/deals/deal-4/contacts' };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
globalThis.sessionStorage = mem();
const tick = () => new Promise((r) => setTimeout(r, 40));
const ME = '11111111-1111-4111-8111-111111111111';
const post = (body) => new Request('https://x.supabase.co/functions/v1/gmail-send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

function makeFake(info, ctx = {}) {
  const calls = { fetch: [], auth: [] };
  const c = { uid: ME, viewAs: false, allowed: true, role: 'Processor', firstName: 'Francis', lastName: 'Santos', mailbox: 'fsantos@clatitle.com', mailboxStatus: 'connected', signatureHtml: '<p>Francis Santos<br>CLA Title</p>', ...ctx };
  const deps = { projectRef: 'aqcervntopidtcazcmlv', clientId: 'cid', clientSecret: 'never-shown', headers: {}, now: () => Date.now(), newId: () => 'seed-1',
    fetch: async (url, init = {}) => { calls.fetch.push({ url, body: init.body || '' });
      const send = String(url).includes('/messages/send');
      const r = String(url).includes('oauth2.googleapis.com/token') ? { status: 200, body: { access_token: 'ya29.x' } } : send ? { status: 200, body: { id: 'gInv1', threadId: 't1' } } : { status: 404, body: {} };
      return { ok: r.status < 300, status: r.status, json: async () => r.body }; },
    getUser: async () => ({ id: ME }), myContext: async () => c,
    userRpc: async () => info,
    svc: async (fn) => { if (fn === 'gmail_svc_token') return [{ email: 'fsantos@clatitle.com', refresh_token: 'r', status: 'connected' }]; return null; },
    authInvite: async (email, opts) => { calls.auth.push({ email, opts }); return { id: 'auth-' + calls.auth.length }; } };
  return { deps, calls };
}
const googleSends = (calls) => calls.fetch.filter((x) => String(x.url).includes('/messages/send'));
const authSends = (calls) => calls.auth.length;

// The browser keeps a reason when gmail-send answers 200 with sent:false (the role suite's no-send hold).
const asked = [];
const sb = { functions: { invoke: async (name, opts) => { asked.push({ name, body: opts.body }); return { data: { ...E2E_INVITE_HOLD }, error: null }; } } };
const held = await gmailSupabase({ sb, ok: (r) => r, camel: (x) => x }).sendInviteEmail({ kind: 'agent', token: 'a'.repeat(64) });
ok(asked.length === 1 && asked[0].name === 'gmail-send' && asked[0].body.invite.token === 'a'.repeat(64) && held.sent === false && held.error === E2E_INVITE_HOLD.error, 'e2e no-send: gmail-send is asked, the reason is kept, nothing is marked sent');
const sentSb = { functions: { invoke: async () => ({ data: { sent: true, to: 'clatestportal+buyer1@gmail.com', from: 'fsantos@clatitle.com', subject: 'You are invited' }, error: null }) } };
const sent = await gmailSupabase({ sb: sentSb, ok: (r) => r, camel: (x) => x }).sendInviteEmail({ kind: 'agent', token: 'b'.repeat(64) });
ok(sent.sent === true && sent.to === 'clatestportal+buyer1@gmail.com' && sent.from === 'fsantos@clatitle.com', 'a real gmail-send success is an email, not a copy-link fallback');
const spec = readFileSync('tests/e2e-roles/specs/agents-tc-sales.spec.js', 'utf8');
ok(spec.includes('E2E_INVITE_HOLD') && spec.includes('functions/v1/gmail-send') && spec.includes('gated += 1') && !spec.includes('seed_accounts'), 'the role spec blocks gmail-send with the shared no-send answer and does not seed accounts');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-proc');
const user = await api.getSession();
const mode = { connected: true };
const sends = [];
api.sendInviteEmail = async ({ kind, token }) => {
  const info = await api.getAgentInvite(token);
  const deal = await api.getDeal('deal-4');
  const ctx = mode.connected ? {} : { mailbox: null, mailboxStatus: null };
  const fake = makeFake({ kind: 'agent', inviteKind: info.inviteKind || 'client', email: info.email, firstName: info.firstName, lastName: info.lastName, expiresAt: info.expiresAt, dealId: deal.id, fileNumber: deal.fileNumber, street: deal.street, city: deal.city, state: deal.state, zip: deal.zip }, ctx);
  const res = await handleSend(post({ invite: { kind, token } }), fake.deps);
  const j = await res.json();
  sends.push({ kind, token, status: res.status, j, google: authSends(fake.calls), gmail: googleSends(fake.calls).length });
  if (res.status >= 400) return { sent: false, error: j.error || 'The invite was not emailed.', connectGmail: j.connectGmail === true, to: j.to || '', refused: j.refused || [] };
  return { sent: j.sent === true, to: j.to || '', from: j.from || '', subject: j.subject || '', error: j.error || '' };
};

const buyer = await api.createContact({ firstName: 'Bea', lastName: 'Buyer', email: 'clatestportal+buyer1@gmail.com', contactType: 'buyer_seller' });
const seller = await api.createContact({ firstName: 'Sue', lastName: 'Seller', email: 'clatestportal+seller1@gmail.com', contactType: 'buyer_seller' });
await api.addParticipant('deal-4', buyer.id, 'Client-Buyer');
await api.addParticipant('deal-4', seller.id, 'Client-Seller');
const { render } = await import('../js/pages/dealcontacts.js');
const open = async (cid, role) => {
  const page = await render({ api, user, deal: await api.getDeal('deal-4'), refresh: () => {} });
  document.body.innerHTML = toText(page.body); page.mount(document.body);
  document.querySelector(`[data-invite-portal="${cid}"][data-invite-role="${role}"]`).dispatchEvent(new window.Event('click', { bubbles: true }));
  const m = document.getElementById('modal');
  m.querySelector('#ipf').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await tick();
  return m;
};

let m = await open(buyer.id, 'Client-Buyer');
ok(sends.length === 1 && sends[0].kind === 'agent' && sends[0].j.sent === true && sends[0].j.to === 'clatestportal+buyer1@gmail.com' && sends[0].j.from === 'testportal@clatitle.com' && sends[0].google === 1 && sends[0].gmail === 0, 'buyer invite sends via gmail-send from testportal (Auth), not the inviter Gmail');
ok(m.querySelector('[data-invite-sent="yes"]') && /Emailed to clatestportal\+buyer1@gmail\.com from testportal@clatitle\.com/.test(m.textContent) && !/your Gmail/.test(m.textContent) && m.querySelector('[data-invite-link]'), 'buyer dialog says it was emailed from testportal and still shows the link');

m = await open(seller.id, 'Client-Seller');
ok(sends.length === 2 && sends[1].j.sent === true && sends[1].j.to === 'clatestportal+seller1@gmail.com' && sends[1].google === 1 && sends[1].token !== sends[0].token, 'seller invite sends via gmail-send');
ok(m.querySelector('[data-invite-sent="yes"]') && /Emailed to clatestportal\+seller1@gmail\.com/.test(m.textContent), 'seller dialog says it was emailed');
const firstSeller = sends[1].token;
m.querySelector('[data-close]').dispatchEvent(new window.Event('click', { bubbles: true }));
m = await open(seller.id, 'Client-Seller');
ok(sends.length === 3 && sends[2].j.sent === true && sends[2].j.to === 'clatestportal+seller1@gmail.com' && sends[2].google === 1 && sends[2].token !== firstSeller, 'resend of a pending seller invite emails the new link');
ok(/Emailed to clatestportal\+seller1@gmail\.com/.test(m.textContent) && m.querySelector('[data-invite-link]'), 'resend dialog says it was emailed and shows the new link');

mode.connected = false;
const quiet = await api.createContact({ firstName: 'Ned', lastName: 'NoGmail', email: 'clatestportal+nogmail@gmail.com', contactType: 'buyer_seller' });
await api.addParticipant('deal-4', quiet.id, 'Client-Buyer');
const before = sends.length;
m = await open(quiet.id, 'Client-Buyer');
ok(sends.length === before + 1 && sends[sends.length - 1].status === 200 && sends[sends.length - 1].j.sent === true && sends[sends.length - 1].google === 1 && sends[sends.length - 1].gmail === 0, 'no connected Gmail: the invite still goes from testportal and Google is not called');
ok(m.querySelector('[data-invite-sent="yes"]') && !/Connect Gmail/.test(m.textContent) && m.querySelector('[data-invite-link]'), 'no Gmail: emailed, no Connect Gmail prompt');

mode.connected = true;
const blank = await api.createContact({ firstName: 'Nora', lastName: 'Noemail', email: '', contactType: 'buyer_seller' });
await api.addParticipant('deal-4', blank.id, 'Client-Buyer');
const googleBefore = sends.reduce((n, s) => n + s.google, 0);
m = await open(blank.id, 'Client-Buyer');
ok(sends.length === before + 1 && sends.reduce((n, s) => n + s.google, 0) === googleBefore, 'no email on the row: gmail-send is not called');
ok(m.querySelector('[data-invite-sent="no"]') && /no email address, so nothing was emailed/.test(m.textContent) && !m.querySelector('[data-invite-link]') && !/copy the link below/i.test(m.textContent), 'no email: a plain reason, and no link that looks sent');

// The role-suite hold, through the same dialog: reason on screen, copy link, not marked emailed, Google not called.
api.sendInviteEmail = async () => ({ ...E2E_INVITE_HOLD });
const holdWho = await api.createContact({ firstName: 'Eve', lastName: 'Hold', email: 'clatestportal+e2ehold@gmail.com', contactType: 'buyer_seller' });
await api.addParticipant('deal-4', holdWho.id, 'Client-Buyer');
const googleHeld = sends.reduce((n, s) => n + s.google, 0);
m = await open(holdWho.id, 'Client-Buyer');
ok(sends.reduce((n, s) => n + s.google, 0) === googleHeld && m.querySelector('[data-invite-sent="no"]') && m.textContent.includes(E2E_INVITE_HOLD.error) && m.querySelector('[data-invite-link]') && !m.querySelector('[data-invite-sent="yes"]'), 'e2e no-send path shows the stored reason and the copy link, and does not email');

console.log(fail ? `FAIL ${fail}` : 'all invite gmail-send checks passed');
process.exit(fail ? 1 : 0);
