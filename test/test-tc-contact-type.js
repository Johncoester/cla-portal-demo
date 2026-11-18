/* TC-4 (John Coester, live call Nov 18 2026, 11:27 AM ET, confirmed 11:35 AM, clarified 11:37 AM).
 * Tracker row 368. A transaction coordinator is an outside assistant who works for real estate agents.
 * A new buyer or listing coordinator is saved as that contact type. An existing contact keeps its type.
 * Fake data only. Run: node test/test-tc-contact-type.js */
import { readFileSync } from 'node:fs';
import { AGENT_TC_TYPE, AGENT_TC_TYPE_LABEL, AGENT_TC_TYPE_NOTE, CONTACT_TYPES, contactTypeForRole, contactTypeLabel, outsideTypeLabel } from '../js/data/constants.js';
import { manualPartyEntry, directoryModel } from '../js/data/file-party.js';
import { contactInsertRow, contactTypeSaveError } from '../js/data/contact-insert.js';
import { USER_ROLE_FILTERS, filterUsers } from '../js/data/user-filter.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const rejects = async (p, name, re) => { try { await p(); ok(false, name + ' (should have failed)'); } catch (e) { ok(!re || re.test(e.message), name + ' [' + e.message + ']'); } };

ok(AGENT_TC_TYPE === 'agent_tc' && AGENT_TC_TYPE.length <= 20, 'the stored code is short enough for the contact type field');
ok(contactTypeLabel(AGENT_TC_TYPE) === AGENT_TC_TYPE_LABEL && /outside/i.test(AGENT_TC_TYPE_LABEL) && /agents/i.test(AGENT_TC_TYPE_LABEL), 'the label says this is an outside coordinator who works for agents');
ok(/outside assistant/i.test(AGENT_TC_TYPE_NOTE) && /real estate agents/i.test(AGENT_TC_TYPE_NOTE) && /not a cla title staff role/i.test(AGENT_TC_TYPE_NOTE), 'the description is an outside assistant, not CLA staff');
ok(CONTACT_TYPES.some(([code, label]) => code === AGENT_TC_TYPE && label === AGENT_TC_TYPE_LABEL), 'the contact type list offers Transaction coordinator');
ok(contactTypeForRole('Buyer Agent TC') === AGENT_TC_TYPE && contactTypeForRole('Listing Agent TC') === AGENT_TC_TYPE, 'a new buyer or listing coordinator defaults to Transaction coordinator');
ok(contactTypeForRole('Transaction Coordinator') === '' && contactTypeForRole('Buyer Agent') === 'realtor' && contactTypeForRole('Lender') === 'lender', 'the CLA staff role has no contact type, and agents and lenders keep theirs');

const typed = manualPartyEntry({ label: "Buyer's transaction coordinator", person: 'Riley Coordinator', company: 'Harbor Realty (fake)', email: 'riley.tc-type@example.test', phone: '301-555-0199', contactType: AGENT_TC_TYPE });
ok(typed.ok && typed.action === 'create' && typed.invite === false && typed.contact.contactType === AGENT_TC_TYPE && typed.contact.firstName === 'Riley', 'a new coordinator is a transaction coordinator and is not invited');
ok(manualPartyEntry({ label: 'Buyer agent', person: 'Rita Agent', company: 'Harbor Realty (fake)', email: 'rita.agent@example.test', phone: '' }).contact.contactType === 'realtor', 'a new agent is still a realtor');
ok(manualPartyEntry({ label: "Buyer's transaction coordinator", contactId: 'c-old', person: 'Someone', contactType: AGENT_TC_TYPE }).action === 'existing', 'picking an existing contact does not rewrite that contact');

const directory = directoryModel([
  { id: 'c-tc', contactType: AGENT_TC_TYPE, firstName: 'Riley', lastName: 'Coordinator', company: 'Harbor Realty (fake)' },
  { id: 'c-agent', contactType: 'realtor', firstName: 'Bianca', lastName: 'Buyer-Agent', company: 'Harbor Realty (fake)' },
  { id: 'c-buyer', contactType: 'buyer_seller', firstName: 'Ben', lastName: 'Buyer', company: '' },
  { id: 'c-staff', contactType: null, firstName: 'Paula', lastName: 'Processor', company: 'CLA Title & Escrow' },
], 'tc');
ok(directory.peopleLabel === 'Transaction coordinators' && directory.people.length === 1 && directory.people[0].value === 'c-tc', 'the coordinator list is the new contact type');
ok(directory.extraLabel === 'Agents' && directory.extraPeople.length === 1 && directory.extraPeople[0].value === 'c-agent', 'agents already saved stay available and keep their type');
ok(!directory.people.concat(directory.extraPeople).some((o) => /Ben|Paula/.test(o.label)), 'buyers and CLA staff are not listed as transaction coordinators');

const row = contactInsertRow({ firstName: 'Riley', lastName: 'Coordinator', email: 'Riley.TC-Type@example.test', phone: '', company: 'Harbor Realty (fake)', contactType: AGENT_TC_TYPE });
ok(row.contact_type === AGENT_TC_TYPE && row.email === 'riley.tc-type@example.test', 'a saved coordinator keeps the transaction coordinator type');
let bad = '';
try { contactInsertRow({ firstName: 'No', lastName: 'Type', company: 'X', contactType: 'staff_tc' }); } catch (e) { bad = e.message; }
ok(/transaction coordinator/i.test(bad) && /outside assistant/i.test(bad) && !/23514|constraint/i.test(bad), 'an unknown type is refused in plain words');
const mapped = contactTypeSaveError(new Error('new row for relation "contacts" violates check constraint "contacts_contact_type_check"'));
ok(mapped && /transaction coordinator/i.test(mapped.message) && !/constraint|23514/.test(mapped.message), 'a database refusal is told in plain words');
ok(/leave contact type blank/i.test(contactTypeSaveError(new Error('CLA staff have no contact type.')).message), 'CLA staff are still told they have no contact type');

const outside = { id: 'u-out', role: 'Outside user', contactType: AGENT_TC_TYPE, status: 'active', firstName: 'Riley', lastName: 'Coordinator', email: 'riley.tc-type@example.test', files: [{ role: 'Buyer Agent TC', fileNumber: 'MD-26-1' }] };
const staff = { id: 'u-tc', role: 'Transaction Coordinator', contactType: null, status: 'active', firstName: 'Morgan', lastName: 'Coordinator', email: 'morgan@example.test', files: [] };
ok(outsideTypeLabel(outside) === AGENT_TC_TYPE_LABEL && !/staff/i.test(outsideTypeLabel(outside)), 'an outside coordinator is not shown as CLA staff');
ok(USER_ROLE_FILTERS.some(([value, label]) => value === 'type:' + AGENT_TC_TYPE_LABEL && label === AGENT_TC_TYPE_LABEL), 'the user list can group by the outside coordinator type');
ok(filterUsers([outside, staff], { contactType: AGENT_TC_TYPE }).map((u) => u.id).join() === 'u-out', 'the contact type filter finds the new type and leaves others out');
ok(filterUsers([outside, staff], { role: 'type:' + AGENT_TC_TYPE_LABEL }).length === 1, 'the outside-type filter matches a coordinator');
ok(filterUsers([outside, staff], { role: 'Transaction Coordinator' }).map((u) => u.id).join() === 'u-tc', 'the CLA staff role filter is unchanged');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-admin');
await rejects(() => api.adminUpdateUser('u-proc', { contactType: AGENT_TC_TYPE }), 'a CLA staff login cannot be saved as a transaction coordinator', /CLA staff have no contact type/);
await api.signInDev('u-proc');
const deal = await api.createDeal({ street: '368 Coordinator Lane', city: 'Rockville', state: 'MD', zip: '20850', openDate: '2026-11-18', transactionType: 'Purchase', processorId: 'u-proc' });
const created = await api.createContact({ firstName: 'Riley', lastName: 'Coordinator', email: 'riley.tc-type@example.test', phone: '301-555-0199', company: 'Harbor Realty (fake)', contactType: AGENT_TC_TYPE });
ok(created.contactType === AGENT_TC_TYPE && !created.profileId, 'the new coordinator is stored with no portal login');
const existing = await api.createContact({ firstName: 'Casey', lastName: 'Listingtc', email: 'casey.kept@example.test', phone: '301-555-0188', company: 'Oak Street Realty (fake)', contactType: 'realtor' });
await api.addParticipant(deal.id, existing.id, 'Listing Agent TC');
const opened = await api.getDeal(deal.id);
const kept = opened.participants.find((p) => p.role === 'Listing Agent TC' && p.contactId === existing.id);
ok(kept && kept.contact.contactType === 'realtor', 'an existing realtor added as a coordinator keeps Realtor');
await rejects(() => api.createContact({ firstName: 'Bad', lastName: 'Type', email: 'bad.type@example.test', contactType: 'staff_tc' }), 'the contact list refuses a type that is not offered', /transaction coordinator/i);

const page = readFileSync(new URL('../js/pages/ordernew.js', import.meta.url), 'utf8');
const contacts = readFileSync(new URL('../js/pages/dealcontacts.js', import.meta.url), 'utf8');
const parties = readFileSync(new URL('../js/pages/deal.js', import.meta.url), 'utf8');
const mig = readFileSync(new URL('../supabase/migrations/20261125230000_tc_contact_type.sql', import.meta.url), 'utf8');
const back = readFileSync(new URL('../supabase/rollbacks/20261125230000_tc_contact_type.sql', import.meta.url), 'utf8');
ok(!page.includes("isAgentTcRole(r) ? 'realtor'") && page.includes('contactTypeForRole(r)') && page.includes('AGENT_TC_TYPE_NOTE'), 'Place Order no longer saves a new coordinator as a Realtor');
ok(!contacts.includes("isAgentTcRole(r) ? 'realtor'") && contacts.includes('contactTypeForRole(r)') && contacts.includes('AGENT_TC_TYPE_NOTE'), 'Order Contacts defaults a new coordinator to Transaction coordinator');
ok(parties.includes('contactTypeForRole(role)') && /not as a Realtor/.test(parties), 'Parties saves a new coordinator as Transaction coordinator');
ok(mig.includes("'agent_tc'") && mig.includes('contacts_contact_type_check') && mig.includes('crm_leads_contact_type_check') && !/update\s+public\.contacts\s+set\s+contact_type/i.test(mig) && !/update\s+public\.crm_leads\s+set\s+contact_type/i.test(mig), 'the database file allows the type and does not rewrite existing rows');
ok(/cannot be undone yet/.test(back) && back.includes("contact_type in ('realtor', 'lender', 'buyer_seller')") && !/contact_type in \('realtor', 'lender', 'buyer_seller', 'agent_tc'\)/.test(back), 'the rollback puts the old list back and refuses while a coordinator is saved');

console.log(fail ? fail + ' failed' : 'tc contact type passed');
if (fail) process.exit(1);
