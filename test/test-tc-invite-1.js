/* TC-INVITE-1 (John Coester, Nov 20 2026, 10:41 AM ET, chat: "yes of course a TC needs an invite").
   An agent's transaction coordinator row (Buyer Agent TC / Listing Agent TC) with no portal login gets Invite to portal on Order Contacts,
   the same as a buyer, seller or agent. The invite is the short client login (no agent profile form). Lenders, CLA staff and other roles
   still get no button, a CLA staff Transaction Coordinator can invite (STAFF-INVITE-1, Nov 23 2026), and editing a coordinator's email sends nothing by itself.
   Fake / mock data only. Nothing is sent. */
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { canInviteToPortal, inviteKindForRole, PORTAL_INVITE_ROLES } from '../js/data/agent-profile.js';
import { SHARE_INVITE_ROLES, canShareInvite } from '../js/data/share-invite.js';
import { shouldInviteAfterEmailChange, EMAIL_CHANGE_INVITE_ROLES } from '../js/data/invite-send.js';
import { addTypedRecipient } from '../js/data/typed-recipient.js';
import { toText } from '../js/ui.js';

const { window, document } = parseHTML('<!doctype html><html><body></body></html>');
globalThis.window = window; globalThis.document = document; globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node; globalThis.Event = window.Event;
globalThis.location = { href: 'https://testportal.example/#/deals/deal-4/contacts', hash: '#/deals/deal-4/contacts' };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const rejects = async (fn, re, m) => { try { await fn(); ok(false, m + ' (no error)'); } catch (e) { ok(re.test(e.message), m + ' -> ' + e.message); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const TC = ['Buyer Agent TC', 'Listing Agent TC'];
const U = (role, extra = {}) => ({ id: 'x', role, status: 'active', isAdmin: false, ...extra });

// the rule
ok(TC.every((r) => PORTAL_INVITE_ROLES.includes(r)), 'both coordinator roles are portal invite roles');
for (const who of ['Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator']) ok(TC.every((r) => canInviteToPortal(U(who), r)), `${who} may invite an agent's coordinator`);
ok(TC.every((r) => canInviteToPortal(U('Super admin', { isAdmin: true }), r)), 'Super admin may invite an agent\'s coordinator');
ok(TC.every((r) => inviteKindForRole(r) === 'client'), 'a coordinator gets the short client login, not the agent account');
for (const r of ['Lender', 'Processor', 'Preprocessor', 'Sales Person', 'Transaction Coordinator', 'Abstractor', 'Attorney', '']) ok(!canInviteToPortal(U('Processor'), r), `still no invite for the ${r || 'blank'} role`);
ok(TC.every((r) => SHARE_INVITE_ROLES.includes(r)) && !SHARE_INVITE_ROLES.includes('Lender'), 'Share Files can invite the same coordinator roles, still not a lender');
ok(canShareInvite({ id: 'c-tc' }, [{ id: 'dp1', contactId: 'c-tc', role: 'Listing Agent TC', contact: { id: 'c-tc', profileId: null } }]) === true, 'Share Files offers to invite a coordinator with no login');
ok(TC.every((r) => !EMAIL_CHANGE_INVITE_ROLES.includes(r) && !shouldInviteAfterEmailChange(r, 'a@example.test', 'b@example.test')), 'changing a coordinator email does not send an invite by itself');
ok(shouldInviteAfterEmailChange('Client-Buyer', 'a@example.test', 'b@example.test'), 'changing a buyer email still does');
await rejects(() => addTypedRecipient({}, { id: 'deal-4' }, { firstName: 'T', lastName: 'C', email: 'tc@example.test' }, 'Listing Agent TC'), /Pick how this person is on the file/, 'the typed-person picker still offers only buyer, seller and the agents');

// Order Contacts, as a Processor
const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-proc');
const user = await api.getSession();
const tc = await api.createContact({ firstName: 'Tess', lastName: 'Coordinator', email: 'tess.tc@example.test', contactType: 'agent_tc' });
await api.addParticipant('deal-4', tc.id, 'Listing Agent TC');
const lender = await api.createContact({ firstName: 'Lou', lastName: 'Lender', email: 'lou.lender@example.test', contactType: 'lender' });
await api.addParticipant('deal-4', lender.id, 'Lender');
const deal = await api.getDeal('deal-4');
ok(deal.participants.some((p) => p.contactId === tc.id && p.role === 'Listing Agent TC'), 'the coordinator is on the file');
const { render } = await import('../js/pages/dealcontacts.js');
const page = await render({ api, user, deal, refresh: () => {} });
document.body.innerHTML = toText(page.body); page.mount(document.body);
const btn = (cid, role) => document.querySelector(`[data-invite-portal="${cid}"][data-invite-role="${role}"]`);
ok(!!btn(tc.id, 'Listing Agent TC'), 'Invite to portal shows on the coordinator row with no login');
ok(!document.querySelector(`[data-invite-portal="${lender.id}"]`), 'failure case: the lender row still has no Invite to portal');
ok(!!btn('c-lena', 'Listing Agent'), 'the listing agent row keeps its button');

btn(tc.id, 'Listing Agent TC').dispatchEvent(new window.Event('click', { bubbles: true }));
const m = document.getElementById('modal');
ok(!!m && /Tess/.test(m.textContent) && /Transaction coordinator/.test(m.textContent) && !/Listing Agent TC/.test(m.textContent), 'the dialog names the role as Transaction coordinator, not the stored role name');
ok(/portal login/.test(m.textContent) && !/agent account/.test(m.textContent), 'the dialog offers a portal login, not an agent account');
m.querySelector('#ipf').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 30));
const link = m.querySelector('[data-invite-link]');
ok(!!link && /#\/agent-invite\/[0-9a-f]{64}$/.test(link.value), 'the one-time link is shown');
const token = link.value.split('/').pop();
const inv = await api.getAgentInvite(token);
ok(inv.status === 'pending' && inv.inviteKind === 'client', 'the coordinator invite is a client invite');
const signup = await import('../js/pages/agent-signup.js');
const sp = await signup.render({ api, params: { token }, go: () => {} });
ok(/data-client-signup/.test(toText(sp.body)) && !/data-agent-form/.test(toText(sp.body)), 'the coordinator gets the short login form, no brokerage or license');
await api.acceptAgentInvite(token, { firstName: 'Tess', lastName: 'Coordinator', email: 'tess.tc@example.test', cellPhone: '410-555-0177' });
const me = await api.getSession();
ok(me.role === 'Outside user' && me.email === 'tess.tc@example.test', 'the coordinator signs in as an Outside user');
ok((await api.getMyAgentProfile()) === null, 'no agent profile was made for the coordinator');

// a lender is still refused by the data layer; a staff Transaction Coordinator may invite (STAFF-INVITE-1)
await api.signInDev('u-tc');
const asTc = await api.createPortalInvite({ dealId: 'deal-4', contactId: 'c-cora' });
ok(asTc && asTc.link, 'a staff Transaction Coordinator can create a portal invite');
await api.signInDev('u-proc');
await rejects(() => api.createPortalInvite({ dealId: 'deal-4', contactId: lender.id }), /can be invited/, 'a lender is refused');

// the SQL mirrors it
const sql = readFileSync('supabase/migrations/20261125360000_tc_portal_invite.sql', 'utf8');
const back = readFileSync('supabase/rollbacks/20261125360000_tc_portal_invite.sql', 'utf8');
const list = "dp.role in ('Client-Buyer', 'Client-Seller', 'Buyer Agent', 'Listing Agent', 'Buyer Agent TC', 'Listing Agent TC')";
ok(sql.split(list).length === 3, 'the portal invite and the Share Files invite both accept the two coordinator roles');
ok(/create or replace function private\.rpc_create_portal_invite/i.test(sql) && /create or replace function private\.rpc_create_thread_invited/i.test(sql), 'the migration recreates both functions');
ok((sql.replace(/^--.*$/gm, '').match(/if not private\.can_invite_agents\(\)/g) || []).length === 2, 'both still require someone who may invite (STAFF-INVITE-1 now includes a staff Transaction Coordinator)');
ok(/then 'agent' else 'client' end/.test(sql) && /when dp\.role in \('Buyer Agent', 'Listing Agent'\) then 0/.test(sql), 'only the two agent roles get the agent account; a coordinator is a client invite');
ok(/150cb04c7b6eda8be11071077f9f6b7f/.test(sql) && /c7eaa26169b75f5dfe958f309d8bb726/.test(sql), 'the migration stops if either live function changed since it was read');
ok(!/rpc_invite_after_email_change|agent_tc_links|participant_tc_not_self|invite_service_accept/.test(sql.replace(/^--.*$/gm, '')), 'the email-change invite, the coordinator links, the self-block and the accept step are not touched');
ok(/Listing Agent'\)\n/.test(back) && !/Buyer Agent TC/.test(back.replace(/^--.*$/gm, '')), 'the rollback puts back the four-role list');

console.log(fail ? `FAIL ${fail}` : 'all TC-INVITE-1 checks passed');
process.exit(fail ? 1 : 0);
