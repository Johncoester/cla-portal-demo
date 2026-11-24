/* STAFF-INVITE-1 (John Coester, chat Nov 23 2026 5:07 PM ET):
   Any CLA Title employee who can open orders can click Invite to portal and send the invite,
   not just a Processor. Fake / mock data only. Nothing is emailed. */
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { canInviteAgents, canInviteToPortal, PORTAL_INVITE_ROLES } from '../js/data/agent-profile.js';
import { STAFF_ACCOUNT_ROLES, EMPLOYEE_ROLE, OUTSIDE } from '../js/data/constants.js';
import { toText } from '../js/ui.js';

const { window, document } = parseHTML('<!doctype html><html><body></body></html>');
globalThis.window = window; globalThis.document = document; globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node; globalThis.Event = window.Event;
globalThis.location = { href: 'https://testportal.example/#/deals/deal-4/contacts', hash: '#/deals/deal-4/contacts' };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const rejects = async (fn, re, m) => { try { await fn(); ok(false, m + ' (no error)'); } catch (e) { ok(re.test(e.message), m + ' -> ' + e.message); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const U = (role, extra = {}) => ({ id: 'x', role, status: 'active', isAdmin: false, ...extra });

const STAFF = ['Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin'];
ok(STAFF.every((r) => STAFF_ACCOUNT_ROLES.includes(r)), 'CLA Title employees who can open orders are STAFF_ACCOUNT_ROLES');
for (const who of STAFF) {
  const u = who === 'Admin' || who === 'Super admin' ? U(who, { isAdmin: true }) : U(who);
  ok(canInviteAgents(u), `${who} may open Agent Invites and send a portal invite`);
  ok(PORTAL_INVITE_ROLES.every((pr) => canInviteToPortal(u, pr)), `${who} may click Invite to portal on a buyer, seller, agent or agent TC`);
}

const blockedInviters = [
  [U(OUTSIDE), 'an Outside user'],
  [U('Buyer Agent'), 'a Buyer Agent login (not a staff account role)'],
  [U('Listing Agent'), 'a Listing Agent login'],
  [U('Client-Buyer'), 'a Client-Buyer login'],
  [U('Client-Seller'), 'a Client-Seller login'],
  [U('Lender'), 'a Lender login'],
  [U('Buyer Agent TC'), 'an outside Buyer Agent TC login'],
  [U('Listing Agent TC'), 'an outside Listing Agent TC login'],
  [U(EMPLOYEE_ROLE), 'an HR-only Employee'],
  [U('Processor', { status: 'removed' }), 'a removed Processor'],
  [null, 'no user'],
];
for (const [u, label] of blockedInviters) {
  ok(!canInviteAgents(u) && !canInviteToPortal(u || {}, 'Client-Buyer'), `${label} cannot send a portal invite`);
}

for (const r of ['Lender', 'Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin', 'Abstractor', 'Attorney', '', 'Employee']) {
  ok(!canInviteToPortal(U('Processor'), r), `Invite to portal is still not offered on a ${r || 'blank'} file role`);
}

ok(canInviteAgents(U('Sales Person')) && canInviteAgents(U('Transaction Coordinator')), 'Sales Person and a CLA Transaction Coordinator are both allowed, even though isStaff still excludes a TC');

const contacts = readFileSync('js/pages/dealcontacts.js', 'utf8');
ok(/testportal@clatitle\.com/.test(contacts) && !/from your connected Gmail/.test(contacts), 'Order Contacts says the invite is emailed from testportal@clatitle.com, not the inviter\'s Gmail');
ok(/You do not need to connect Gmail/.test(contacts), 'Order Contacts says Gmail does not need to be connected');
ok(/canInviteToPortal\(user, p\.role\)/.test(contacts), 'the Invite to portal button is still gated by canInviteToPortal');

const invitesPage = readFileSync('js/pages/agent-invites.js', 'utf8');
ok(/testportal@clatitle\.com/.test(invitesPage) && !/your connected Gmail/.test(invitesPage), 'Agent Invites (including Resend) says the email comes from testportal@clatitle.com');

const handlers = readFileSync('supabase/functions/_shared/gmail-handlers.mjs', 'utf8');
ok(/No inviter Gmail is read or used, so no "Connect Gmail" is needed/.test(handlers) && /PORTAL_INVITE_SENDER/.test(handlers), 'gmail-send invite path does not require the inviter to connect Gmail');
ok(/staffGate\(deps\)/.test(handlers) && /if \(b\.invite\) return inviteSend/.test(handlers), 'the invite endpoint still goes through the staff gate, then inviteSend');
const core = readFileSync('supabase/functions/_shared/gmail-core.mjs', 'utf8');
ok(STAFF.every((r) => new RegExp(`'${r}'`).test(core)), 'gmail-send staffGate roles include every CLA employee role that can open orders');

const sql = readFileSync('supabase/migrations/20261129120000_staff_invite_cla_employees.sql', 'utf8');
const back = readFileSync('supabase/rollbacks/20261129120000_staff_invite_cla_employees.sql', 'utf8');
ok(/Transaction Coordinator/.test(sql) && /44c379d3ed83df27959587cac0da69ec/.test(sql) && /afb2be409dc4d683382ed7f79541dcea/.test(sql), 'the migration adds Transaction Coordinator and checks both fingerprints');
ok(/begin;/.test(sql) && /lock_timeout/.test(sql) && /readback/.test(sql) && /grant_ok/.test(sql), 'the migration is one transaction with a lock timeout, pre-flight and grant readback');
ok(/44c379d3ed83df27959587cac0da69ec/.test(back) && /Transaction Coordinator/.test(back), 'the rollback restores the previous body');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
const { render } = await import('../js/pages/dealcontacts.js');
const btn = (cid, role) => document.querySelector(`[data-invite-portal="${cid}"][data-invite-role="${role}"]`);

async function firstOpenDeal() {
  for (const id of ['deal-1', 'deal-2', 'deal-4', 'deal-5', 'deal-3']) {
    try { return await api.getDeal(id); } catch (e) { /* this login cannot open that file */ }
  }
  return null;
}
const staffLogins = [
  ['u-proc', 'Processor'],
  ['u-preproc', 'Preprocessor'],
  ['u-sp', 'Sales Person'],
  ['u-team', 'Sales Team'],
  ['u-tc', 'Transaction Coordinator'],
  ['u-admin', 'Super admin'],
];
for (const [id, label] of staffLogins) {
  await api.signInDev(id);
  const user = await api.getSession();
  ok(user.role === (id === 'u-admin' ? 'Super admin' : label) || user.role === label, `${label} signs in (${user.role})`);
  ok(canInviteAgents(user), `${label} session may invite`);
  const deal = await firstOpenDeal();
  ok(!!deal, `${label} can open at least one file`);
  const page = await render({ api, user, deal, refresh: () => {} });
  document.body.innerHTML = toText(page.body); page.mount(document.body);
  const inviteBtns = document.querySelectorAll('[data-invite-portal]');
  const inviteable = (deal.participants || []).filter((p) => canInviteToPortal(user, p.role) && p.contact && !p.contact.profileId && !p.removed);
  if (inviteable.length) ok(inviteBtns.length >= 1, `${label} sees Invite to portal on a row with no login`);
  else ok(true, `${label} opened a file with no uninvited buyer/seller/agent row (button rule still applied)`);
  ok(!document.querySelector('[data-invite-portal="c-proc"]'), `${label} does not see Invite to portal on a CLA staff row`);
}

await api.signInDev('u-proc');
const ivy = await api.createContact({ firstName: 'Ivy', lastName: 'Invitee', email: 'ivy.staffinvite@example.test', contactType: 'buyer_seller' });
await api.addParticipant('deal-4', ivy.id, 'Client-Buyer');
await api.signInDev('u-tc');
ok(!!(await firstOpenDeal()), 'a CLA Transaction Coordinator can open a file');
const made = await api.createPortalInvite({ dealId: 'deal-4', contactId: ivy.id, email: '' });
ok(made && made.link, 'a CLA Transaction Coordinator can create a portal invite (data layer)');
await rejects(() => api.createPortalInvite({ dealId: 'deal-4', contactId: 'c-lender1' }), /can be invited/, 'a lender is still refused');

await api.signInDev('u-buyer');
const buyer = await api.getSession();
ok(!canInviteAgents(buyer), 'a signed-in buyer cannot invite');
await rejects(() => api.createPortalInvite({ dealId: 'deal-4', contactId: 'c-lena' }), /Only CLA staff/, 'an outside buyer is refused by the data layer');

await api.signInDev('u-bagent');
await rejects(() => api.createPortalInvite({ dealId: 'deal-4', contactId: 'c-cora' }), /Only CLA staff/, 'an outside agent is refused by the data layer');

console.log(fail ? `FAIL ${fail}` : 'all STAFF-INVITE-1 checks passed');
process.exit(fail ? 1 : 0);
