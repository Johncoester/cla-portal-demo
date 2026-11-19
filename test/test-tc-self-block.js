/* TC-SELF-BLOCK. John Coester, Nov 19 2026, 10:18 AM ET.
 * The buyer agent on a file cannot also be saved as that side's transaction coordinator.
 * Same contact or the same email. A coordinator link cannot point an agent at themselves.
 * Fake data only. Run: node test/test-tc-self-block.js */
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { fileAgents, selfTcOnOrderProblem, tcSelfOnOrderMessage } from '../js/data/agent-tc.js';
import { TC_SELF, sameContactOrEmail } from '../js/data/agent-tc-links.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const rejects = async (p, name, re) => { try { await p(); ok(false, name + ' (should have failed)'); } catch (e) { ok(!re || re.test(String(e && e.message)), name + ' [' + (e && e.message) + ']'); } };

const buyerMsg = 'This person is already the Buyer Agent on this order. A transaction coordinator must be a different person.';
const listingMsg = 'This person is already the Listing Agent on this order. A transaction coordinator must be a different person.';
ok(tcSelfOnOrderMessage('Buyer Agent') === buyerMsg && tcSelfOnOrderMessage('Listing Agent') === listingMsg, 'the refusal names the agent role on this order');

const agents = [
  { contactId: 'c-bagent', email: 'bianca.buyeragent@example.test', role: 'Buyer Agent' },
  { contactId: 'c-lagent', email: 'larry.listingagent@example.test', role: 'Listing Agent' },
];
ok(sameContactOrEmail({ id: 'c-bagent' }, { contactId: 'c-bagent', email: '' }), 'the same contact matches even when the email box is blank');
ok(!sameContactOrEmail({ id: 'c-a', email: '' }, { id: 'c-b', email: '' }) && !sameContactOrEmail({ id: 'c-a', email: '  ' }, { id: 'c-b', email: '' }), 'a blank email is not the same person');
ok(sameContactOrEmail({ id: 'c-a', email: 'John@Example.test' }, { id: 'c-b', email: ' john@example.test ' }), 'the same email matches ignoring capitals and spaces');
ok(selfTcOnOrderProblem({ contactId: 'c-bagent', email: '' }, agents, ['Buyer Agent TC']) === buyerMsg, 'picking the buyer agent as the buyer coordinator is refused');
ok(selfTcOnOrderProblem({ contactId: 'c-typed', email: 'Bianca.BuyerAgent@example.test' }, agents, ['Buyer Agent TC']) === buyerMsg, 'typing the buyer agent email is refused');
ok(selfTcOnOrderProblem({ contactId: 'c-bagent', email: 'bianca.buyeragent@example.test' }, agents, ['Listing Agent TC']) === '', 'the buyer agent can still be the listing coordinator for a different listing agent');
ok(selfTcOnOrderProblem({ contactId: 'c-riley', email: 'riley.selfblock@example.test' }, agents, ['Buyer Agent TC']) === '', 'a different person is allowed');
ok(selfTcOnOrderProblem({ contactId: 'c-bagent' }, agents, []) === '', 'no side yet does not invent a refusal');
ok(selfTcOnOrderProblem({ contactId: 'c-lagent' }, agents, ['Listing Agent TC']) === listingMsg, 'the listing agent is refused on the listing side');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-proc');
const deal = await api.createDeal({ street: '97260 Self Block Lane', city: 'Rockville', state: 'MD', zip: '20850', openDate: '2026-11-19', transactionType: 'Purchase', processorId: 'u-proc' });
await api.addParticipant(deal.id, 'c-bagent', 'Buyer Agent');
await api.addParticipant(deal.id, 'c-lagent', 'Listing Agent');
const before = await api.getDeal(deal.id);
ok(fileAgents(before.participants).some((a) => a.contactId === 'c-bagent' && /bianca\.buyeragent@example\.test/i.test(a.email)), 'the file agent keeps the email used for the check');
await rejects(() => api.addParticipant(deal.id, 'c-bagent', 'Buyer Agent TC'), 'the buyer agent cannot be added as the buyer coordinator', /already the Buyer Agent/);
await rejects(() => api.addParticipant(deal.id, 'c-lagent', 'Listing Agent TC'), 'the listing agent cannot be added as the listing coordinator', /already the Listing Agent/);
const still = await api.getDeal(deal.id);
ok(still.participants.some((p) => p.contactId === 'c-bagent' && p.role === 'Buyer Agent') && !still.participants.some((p) => p.contactId === 'c-bagent' && p.role === 'Buyer Agent TC'), 'a refusal leaves the buyer agent on the file and does not add the coordinator row');
const riley = await api.createContact({ firstName: 'Riley', lastName: 'Coordinator', email: 'riley.selfblock@example.test', phone: '301-555-0199', company: 'Harbor Realty (fake)', contactType: 'realtor' });
await api.addParticipant(deal.id, riley.id, 'Buyer Agent TC');
ok((await api.getDeal(deal.id)).participants.some((p) => p.contactId === riley.id && p.role === 'Buyer Agent TC'), 'a different person is saved as the buyer coordinator');
await api.addParticipant(deal.id, 'c-bagent', 'Listing Agent TC');
ok((await api.getDeal(deal.id)).participants.some((p) => p.contactId === 'c-bagent' && p.role === 'Listing Agent TC'), 'the buyer agent can be the listing coordinator when the listing agent is someone else');

await rejects(() => api.linkAgentTc('c-bagent', 'c-bagent'), 'an agent cannot be linked as their own coordinator', new RegExp(TC_SELF.replace(/[.]/g, '\\.')));
await rejects(() => api.createAndLinkAgentTc('c-bagent', { firstName: 'Bianca', lastName: 'Buyer-Agent', email: 'bianca.buyeragent@example.test', phone: '', company: 'Harbor Realty (fake)' }), 'typing the agent email is refused before a second contact is saved', /cannot be their own/);
const linked = await api.createAndLinkAgentTc('c-lagent', { firstName: 'Casey', lastName: 'Helper', email: 'casey.selfblock@example.test', phone: '', company: '' });
ok(linked.contactId && linked.contactId !== 'c-lagent', 'a different person can still be linked');

const read = (rel) => readFileSync(new URL('../' + rel, import.meta.url), 'utf8');
const contacts = read('js/pages/dealcontacts.js');
ok(!contacts.includes('data-tc-open') && !contacts.includes('>Transaction coordinators<') && contacts.includes('Invite to portal') && contacts.includes('Remove from order'), 'Add contact still refuses a self coordinator after the Transaction coordinators button was removed');
ok(contacts.includes('selfTcOnOrderProblem') && read('js/pages/ordernew.js').includes('selfTcOnOrderProblem') && read('js/pages/deal.js').includes('selfTcOnOrderProblem'), 'Add contact, Place Order, and Parties use the same refusal');
ok(read('js/pages/agent-tc-panel.js').includes('sameContactOrEmail') && read('js/pages/agent-tc-panel.js').includes('TC_SELF'), 'the coordinator link form refuses the agent before it saves');

const mig = read('supabase/migrations/20261125340000_tc_self_block.sql');
const rb = read('supabase/rollbacks/20261125340000_tc_self_block.sql');
const links = read('supabase/migrations/20261125240000_agent_tc_links.sql');
ok(mig.includes('A transaction coordinator must be a different person.') && mig.includes('already the % on this order') && mig.includes(TC_SELF) && /before insert/i.test(mig), 'the database refuses a new coordinator row and a self link in plain words');
ok(!/delete from/i.test(mig) && !/update public\.deal_participants/i.test(mig) && !/update public\.contacts/i.test(mig), 'the database file does not change or delete existing rows');
ok(rb.includes('drop trigger if exists participants_tc_not_self') && rb.includes('drop function if exists private.agent_tc_link_not_self') && !/delete from/i.test(rb), 'rollback removes only the new guards');
ok(links.includes(TC_SELF) && links.includes('agent_tc_links_distinct'), 'the link save already refuses the same contact, and the new file adds the email guard without rewriting that applied file');

console.log(fail ? `tc-self-block: ${fail} failed` : 'tc-self-block passed');
if (fail) process.exit(1);
