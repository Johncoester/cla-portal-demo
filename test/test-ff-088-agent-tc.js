/* FF-088 (Francis Santos, Nov 16 2026, 3:10 PM ET, msg 1a1e5fbfe4183a9f).
 * A Processor places an order and enters the agents' Transaction Coordinator, an outside person.
 * That person saves as the buyer's or listing agent's coordinator. The CLA staff rule still
 * refuses an outside person as the file's Transaction Coordinator. Fake data only. */
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { manualPartyEntry } from '../js/data/file-party.js';
import { STAFF_TC_MESSAGE, agentTcLabel, partyProblemLine, roleForPartyField, uniqueProblems } from '../js/data/agent-tc.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const rejects = async (p, name, re) => { try { await p(); ok(false, name + ' (should have failed)'); } catch (e) { ok(!re || re.test(e.message), name + ' [' + e.message + ']'); } };

const buyerLine = partyProblemLine('p:Transaction Coordinator', STAFF_TC_MESSAGE);
const listingLine = partyProblemLine('p:Transaction Coordinator:2', STAFF_TC_MESSAGE);
ok(buyerLine !== listingLine, 'the two Place Order boxes are not the same bullet');
ok(buyerLine.startsWith(agentTcLabel('Buyer Agent TC')) && listingLine.startsWith(agentTcLabel('Listing Agent TC')), 'each box names its side');
ok(!buyerLine.startsWith('Transaction Coordinator:') && !listingLine.startsWith('Transaction Coordinator:'), 'the old staff role name is not the label on an agent coordinator');
ok(uniqueProblems([STAFF_TC_MESSAGE, STAFF_TC_MESSAGE]).length === 1, 'the same sentence is not listed twice');
ok(uniqueProblems([buyerLine, listingLine]).length === 2, 'two different sides both stay on the list');
ok(roleForPartyField('p:Transaction Coordinator') === 'Buyer Agent TC' && roleForPartyField('p:Transaction Coordinator:2') === 'Listing Agent TC', 'the old field names map to the agent roles, not the staff role');
ok(roleForPartyField('p:Buyer Agent TC') === 'Buyer Agent TC' && roleForPartyField('p:Client-Buyer:2') === 'Client-Buyer', 'current field names and extra buyer rows keep their roles');

const typed = { label: "Buyer's transaction coordinator", person: 'Riley Coordinator', company: 'Harbor Realty (fake)', email: 'not-an-email', phone: '301-555-0199', contactType: 'realtor' };
const badEmail = manualPartyEntry(typed);
ok(!badEmail.ok && /valid email/.test(badEmail.error) && typed.email === 'not-an-email' && typed.person === 'Riley Coordinator', 'a bad email is refused and what was typed stays');
const badPhone = manualPartyEntry({ ...typed, email: 'riley.agenttc@example.test', phone: '555' });
ok(!badPhone.ok && /phone/i.test(badPhone.error), 'a partial phone is refused');
const blank = manualPartyEntry({ label: "Buyer's transaction coordinator", person: '', company: '', email: '', phone: '', contactType: 'realtor' });
ok(blank.ok && blank.action === 'skip', 'a blank coordinator row is skipped');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-proc');
const deal = await api.createDeal({ street: '97386 Agent TC Lane', city: 'Rockville', state: 'MD', zip: '20850', openDate: '2026-11-16', transactionType: 'Purchase', processorId: 'u-proc' });
ok(!!deal.fileNumber && !deal.tcUserId, 'the order is created without making the agent coordinator the CLA Transaction Coordinator');

const buyerTc = await api.createContact({ firstName: 'Riley', lastName: 'Coordinator', email: 'riley.agenttc@example.test', phone: '301-555-0199', company: 'Harbor Realty (fake)', contactType: 'realtor' });
const listingTc = await api.createContact({ firstName: 'Casey', lastName: 'Listingtc', email: 'casey.agenttc@example.test', phone: '301-555-0188', company: 'Oak Street Realty (fake)', contactType: 'realtor' });
ok(!buyerTc.profileId && !listingTc.profileId, 'an agent coordinator can be saved with no portal login');
await api.addParticipant(deal.id, buyerTc.id, roleForPartyField('p:Transaction Coordinator'));
await api.addParticipant(deal.id, 'c-bagent', roleForPartyField('p:Transaction Coordinator:2'));
const opened = await api.getDeal(deal.id);
const buyerRow = opened.participants.find((p) => p.role === 'Buyer Agent TC' && p.contactId === buyerTc.id);
const listingRow = opened.participants.find((p) => p.role === 'Listing Agent TC' && p.contactId === 'c-bagent');
ok(!!buyerRow && buyerRow.contact.firstName === 'Riley' && !buyerRow.contact.profileId, 'the outside contact is the buyer\'s transaction coordinator');
ok(!!listingRow && listingRow.contact.profileId === 'u-bagent', 'an outside login can be the listing transaction coordinator');
ok(!opened.tcUserId, 'saving an agent coordinator does not set the CLA Transaction Coordinator');

await rejects(() => api.addParticipant(deal.id, buyerTc.id, 'Transaction Coordinator'), 'an outside contact cannot be the CLA Transaction Coordinator', new RegExp(STAFF_TC_MESSAGE.replace(/[.]/g, '\\.')));
await rejects(() => api.addParticipant(deal.id, 'c-bagent', 'Transaction Coordinator'), 'an outside login cannot be the CLA Transaction Coordinator', /cannot be added as CLA staff|active staff login/);
const staff = await api.listCoordinators();
const staffContact = staff.find((t) => t.contactId);
await api.addParticipant(deal.id, staffContact.contactId, 'Transaction Coordinator');
const withStaff = await api.getDeal(deal.id);
ok(withStaff.participants.some((p) => p.role === 'Transaction Coordinator' && p.contactId === staffContact.contactId), 'an active staff login can still be the CLA Transaction Coordinator');
await api.updateDeal(deal.id, { tcUserId: staffContact.profileId || staffContact.id });
ok((await api.getDeal(deal.id)).tcUserId, 'Edit order details can still set the CLA Transaction Coordinator');
await rejects(() => api.updateDeal(deal.id, { tcUserId: 'u-bagent' }), 'an outside login cannot be stored as the CLA Transaction Coordinator', /active staff login/);

const replacement = await api.createContact({ firstName: 'Jordan', lastName: 'Newtc', email: 'jordan.newtc@example.test', phone: '301-555-0177', company: 'Harbor Realty (fake)', contactType: 'realtor' });
await api.addParticipant(deal.id, replacement.id, 'Buyer Agent TC');
const prior = (await api.getDeal(deal.id)).participants.find((p) => p.role === 'Buyer Agent TC' && p.contactId === buyerTc.id);
await api.removeParticipant(deal.id, prior.id);
const changed = (await api.getDeal(deal.id)).participants.filter((p) => p.role === 'Buyer Agent TC');
ok(changed.length === 1 && changed[0].contactId === replacement.id && changed[0].contact.email === 'jordan.newtc@example.test', 'the buyer\'s transaction coordinator can be changed on the existing file');

const refi = await api.createDeal({ street: '2 Refi Coordinator Rd', city: 'Rockville', state: 'MD', zip: '20850', openDate: '2026-11-16', transactionType: 'Refinance', processorId: 'u-proc' });
await rejects(() => api.addParticipant(refi.id, buyerTc.id, 'Buyer Agent TC'), 'a refinance has no agent coordinator', /refinance/i);

const page = readFileSync(new URL('../js/pages/ordernew.js', import.meta.url), 'utf8');
const contacts = readFileSync(new URL('../js/pages/dealcontacts.js', import.meta.url), 'utf8');
const parties = readFileSync(new URL('../js/pages/deal.js', import.meta.url), 'utf8');
const mig = readFileSync(new URL('../supabase/migrations/20261124160000_agent_side_tc.sql', import.meta.url), 'utf8');
const rb = readFileSync(new URL('../supabase/rollbacks/20261124160000_agent_side_tc.sql', import.meta.url), 'utf8');
ok(page.includes('data-agent-tc') && page.includes('data-add-tc') && page.includes('agentTcLabel(BUYER_AGENT_TC)') && page.includes('agentTcLabel(LISTING_AGENT_TC)') && !page.includes('needs a Transaction Coordinator login'), 'Place Order types an outside coordinator and no longer asks for a staff login');
ok(page.includes('uniqueProblems(problems)') && page.includes('partyProblemLine'), 'Place Order shows each failed person once');
ok(contacts.includes('data-agent-tc-note') && contacts.includes('AGENT_TC_ROLES') && contacts.includes('Any active staff login can be the Transaction Coordinator'), 'Contacts can add an agent coordinator and still keeps the staff rule');
ok(parties.includes('data-add-party="${BUYER_AGENT_TC}"') && parties.includes('data-add-party="${LISTING_AGENT_TC}"') && parties.includes("The agent's coordinator"), 'Parties can add or change either coordinator');
ok(mig.includes("new.role in ('Buyer Agent TC', 'Listing Agent TC')") && mig.includes("new.role = 'Transaction Coordinator'") && mig.includes(STAFF_TC_MESSAGE), 'the database lets the agent roles through and still checks the staff role');
ok(mig.includes("'Buyer Agent TC', 'Listing Agent TC'") && rb.includes("select r in ('Client-Seller', 'Buyer Agent', 'Listing Agent', 'Transaction Coordinator')") && !rb.includes('Buyer Agent TC'), 'rollback puts the refinance list back without the agent roles');
ok(rb.includes(STAFF_TC_MESSAGE), 'rollback keeps the staff Transaction Coordinator sentence');

console.log(fail ? `ff-088: ${fail} failed` : 'ff-088 passed');
if (fail) process.exit(1);
