/* Francis / John Nov 9: "can't invite buyers and sellers" / "a processor needs to be able to invite".
   Contacts tab Invite to portal for Client-Buyer, Client-Seller, Buyer Agent and Listing Agent rows (no login), for the same staff who invite
   agents (not a TC). A contact with no email takes one typed in the dialog. Buyers / sellers get a short login form (no agent profile).
   Fake / mock data only. Nothing is sent. */
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { canInviteToPortal, inviteKindForRole, PORTAL_INVITE_ROLES } from '../js/data/agent-profile.js';
import { toText } from '../js/ui.js';

const { window, document } = parseHTML('<!doctype html><html><body></body></html>');
globalThis.window = window; globalThis.document = document; globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node; globalThis.Event = window.Event;
globalThis.location = { href: 'https://testportal.example/#/deals/deal-4/contacts', hash: '#/deals/deal-4/contacts' };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const rejects = async (fn, re, m) => { try { await fn(); ok(false, m + ' (no error)'); } catch (e) { ok(re.test(e.message), m + ' -> ' + e.message); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

// who may invite
const U = (role, extra = {}) => ({ id: 'x', role, status: 'active', isAdmin: false, ...extra });
for (const r of ['Processor', 'Preprocessor', 'Sales Person', 'Sales Team']) ok(PORTAL_INVITE_ROLES.every((pr) => canInviteToPortal(U(r), pr)), `${r} may invite buyers, sellers and agents`);
ok(canInviteToPortal(U('Super admin', { isAdmin: true }), 'Client-Seller'), 'Super admin may invite a seller');
ok(!canInviteToPortal(U('Transaction Coordinator'), 'Client-Buyer') && !canInviteToPortal(U('Transaction Coordinator'), 'Buyer Agent'), 'a TC still may not invite');
ok(!canInviteToPortal(U('Outside user'), 'Client-Buyer'), 'an outside user may not invite');
ok(!canInviteToPortal(U('Processor'), 'Lender'), 'lenders are not offered an invite');
ok(inviteKindForRole('Client-Seller') === 'client' && inviteKindForRole('Listing Agent') === 'agent', 'role maps to invite kind');

// the Contacts tab shows the button on client rows too (it used to be agents only)
const src = readFileSync('js/pages/dealcontacts.js', 'utf8');
ok(!/\['Buyer Agent', 'Listing Agent'\]\.includes\(p\.role\) && !p\.contact\.profileId/.test(src), 'the old agents-only button condition is gone');
ok(/canInviteToPortal\(user, p\.role\)/.test(src) && /api\.createPortalInvite\(/.test(src), 'the button uses canInviteToPortal and createPortalInvite');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-proc');
const user = await api.getSession();
const { render } = await import('../js/pages/dealcontacts.js');
let deal = await api.getDeal('deal-4');
const page = await render({ api, user, deal, refresh: () => {} });
document.body.innerHTML = toText(page.body); page.mount(document.body);
const btn = (cid, role) => document.querySelector(`[data-invite-portal="${cid}"][data-invite-role="${role}"]`);
ok(!!btn('c-cora', 'Client-Seller'), 'Processor sees Invite to portal on the seller row (Cora, no login)');
ok(!!btn('c-lena', 'Listing Agent'), 'Processor still sees Invite to portal on the listing agent row');
ok(!document.querySelector('[data-invite-portal="c-proc"]'), 'no invite on CLA staff rows');

// open the dialog from the seller row and create the link
btn('c-cora', 'Client-Seller').dispatchEvent(new window.Event('click', { bubbles: true }));
const m = document.getElementById('modal');
ok(!!m && /Cora/.test(m.textContent) && m.querySelector('[data-invite-email]').value === 'cora.seller@example.test', 'the dialog opens with the seller email');
m.querySelector('#ipf').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 30));
const link = m.querySelector('[data-invite-link]');
ok(!!link && /#\/agent-invite\/[0-9a-f]{64}$/.test(link.value), 'the one-time link is shown to copy');
ok(/Not emailed/.test(m.textContent) && m.querySelector('[data-invite-sent="no"]'), 'demo: the dialog says it was not emailed and shows the link (auto-email: test-invite-auto-email.js)');

// the link opens the short client form and accepting makes a client login, not an agent profile
const token = link.value.split('/').pop();
const inv = await api.getAgentInvite(token);
ok(inv.status === 'pending' && inv.inviteKind === 'client', 'the invite is a pending client invite');
const signup = await import('../js/pages/agent-signup.js');
const sp = await signup.render({ api, params: { token }, go: () => {} });
ok(/data-client-signup/.test(toText(sp.body)) && !/data-agent-form/.test(toText(sp.body)), 'the seller gets the short login form, not the agent form');
await rejects(() => api.createPortalInvite({ dealId: 'deal-4', contactId: 'c-cora' }), /pending invite/, 'a second invite for the same email is refused');
await api.acceptAgentInvite(token, { firstName: 'Cora', lastName: 'Seller', email: 'cora.seller@example.test', cellPhone: '410-555-0133' });
const me = await api.getSession();
ok(me.role === 'Outside user' && me.email === 'cora.seller@example.test' && (me.fileRoles || []).includes('Client-Seller'), 'Cora is signed in as the seller on her file');
ok((await api.getMyAgentProfile()) === null, 'no agent profile was made for the seller');

// a buyer with no email: the email typed in the dialog is required and saved
await api.signInDev('u-proc');
const blank = await api.createContact({ firstName: 'Nora', lastName: 'Noemail', email: '', contactType: 'buyer_seller' });
await api.addParticipant('deal-4', blank.id, 'Client-Buyer');
await rejects(() => api.createPortalInvite({ dealId: 'deal-4', contactId: blank.id }), /valid email/, 'no email and none typed is refused with a clear message');
const r2 = await api.createPortalInvite({ dealId: 'deal-4', contactId: blank.id, email: 'nora.noemail@example.test' });
ok(r2.inviteKind === 'client' && r2.email === 'nora.noemail@example.test' && r2.sent === false, 'the typed email makes the buyer invite (nothing sent)');
deal = await api.getDeal('deal-4');
ok(deal.participants.find((p) => p.contactId === blank.id).contact.email === 'nora.noemail@example.test', 'the typed email is saved on the contact');

// Preprocessor may invite on a file they can open; a TC may not
await api.signInDev('u-tc');
await rejects(() => api.createPortalInvite({ dealId: 'deal-4', contactId: 'c-lena' }), /Only CLA staff/, 'a TC is refused');
await api.signInDev('u-proc');
await rejects(() => api.createPortalInvite({ dealId: 'deal-4', contactId: 'c-lender1' }), /buyer, seller, buyer agent or listing agent|not found/i, 'someone not a buyer/seller/agent on the file is refused');

// the SQL mirrors it (unapplied migration file)
const sql = readFileSync('supabase/migrations/20261109233000_portal_invite_clients.sql', 'utf8');
ok(/private\.can_invite_agents\(\)/.test(sql) && /can_access_deal\(p_deal\)/.test(sql) && /invite_kind = 'client'/.test(sql) && /drift/.test(sql), 'the migration checks the inviter, the file and branches the accept on kind');
ok(/'Client-Buyer', 'Client-Seller', 'Buyer Agent', 'Listing Agent'/.test(sql), 'the migration allows the four roles');

console.log(fail ? `FAIL ${fail}` : 'all portal client invite checks passed');
process.exit(fail ? 1 : 0);
