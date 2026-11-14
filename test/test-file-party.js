/* FF-049 / MF-046 (Francis option 3, Nov 13 2026). Typed parties are contacts with no portal login and no invite.
 * Run: node test/test-file-party.js */
import { readFileSync } from 'node:fs';
import { buyerSellerEntry, manualPartyEntry, directoryModel, directoryChoice, companyOnlyContact } from '../js/data/file-party.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const typed = buyerSellerEntry({ label: 'Buyer', typedName: 'Pat Buyer', email: '', phone: '' });
ok(typed.ok && typed.action === 'create' && typed.invite === false && typed.contact.firstName === 'Pat' && typed.contact.lastName === 'Buyer' && typed.contact.contactType === 'buyer_seller', 'a typed buyer name is a new contact and is not invited');

const fields = buyerSellerEntry({ label: 'Seller', firstName: 'Ann', lastName: 'Seller', email: 'ann.seller@example.test', phone: '301-555-0199' });
ok(fields.ok && fields.action === 'create' && fields.contact.email === 'ann.seller@example.test' && fields.invite === false, 'name, email and phone can be typed with no contact picked');

const picked = buyerSellerEntry({ label: 'Buyer', contactId: 'c-buyer', typedName: 'Someone Else', firstName: 'Nope' });
ok(picked.ok && picked.action === 'existing' && picked.contactId === 'c-buyer' && picked.invite === false, 'picking an existing contact still uses that contact');

ok(buyerSellerEntry({ label: 'Buyer' }).action === 'skip', 'a blank buyer row is skipped');
ok(!buyerSellerEntry({ label: 'Buyer', email: 'not-an-email' }).ok, 'a bad email is refused');
ok(buyerSellerEntry({ label: 'Buyer', firstName: 'Pat', email: '' }).ok, 'email is not required');
ok(!buyerSellerEntry({ label: 'Buyer', firstName: 'Pat', phone: '555' }).ok, 'a partial phone is refused');
ok(buyerSellerEntry({ label: 'Buyer', firstName: 'Pat', phone: '' }).ok, 'phone is not required');
ok(!buyerSellerEntry({ label: 'Buyer', email: 'pat@example.test' }).ok, 'an email with no name asks for a name');

const agents = directoryModel([
  { id: 'c-bagent', contactType: 'realtor', firstName: 'Bianca', lastName: 'Buyer-Agent', company: 'Harbor Realty (fake)' },
  { id: 'c-lena', contactType: 'realtor', firstName: 'Lena', lastName: 'Listing', company: 'Bayview Realty (fake)' },
  { id: 'c-buyer', contactType: 'buyer_seller', firstName: 'Ben', lastName: 'Buyer', company: '' },
  { id: 'c-staff', contactType: null, firstName: 'Paula', lastName: 'Processor', company: 'CLA Title & Escrow' },
], 'agent');
ok(agents.companies.map((o) => o.label).join('|') === 'Bayview Realty (fake)|Harbor Realty (fake)', 'agent companies are the brokerages already saved');
ok(agents.people.length === 2 && agents.people.every((o) => o.label.includes('—')), 'agents are listed with their company');
ok(!agents.people.some((o) => /Ben|Paula/.test(o.label)), 'buyers and staff are not in the agent list');

const lenders = directoryModel([
  { id: 'c-lender1', contactType: 'lender', firstName: 'Linda', lastName: 'Lender', company: 'Example Home Loans (fake)', lenderRole: 'loan_officer' },
  { id: 'c-co', contactType: 'lender', firstName: '', lastName: '', company: 'Only Company Loans' },
], 'lender');
ok(lenders.peopleLabel === 'Loan officers' && lenders.people.some((o) => o.value === 'c-lender1' && o.label.includes('Loan Officer')), 'loan officers are listed under the lender');
ok(lenders.companies.some((o) => o.value === 'company:Only Company Loans'), 'lender companies are listed even with no person');
ok(directoryChoice('company:Only Company Loans').kind === 'company' && directoryChoice('c-lender1').kind === 'person' && directoryChoice('').kind === 'manual', 'a directory value is a company, a person, or manual entry');

const hand = manualPartyEntry({ label: 'Buyer agent', person: 'Rita Agent', company: 'New Brokerage (fake)', email: 'rita.agent@example.test', phone: '' });
ok(hand.ok && hand.action === 'create' && hand.invite === false && hand.contact.contactType === 'realtor' && hand.contact.firstName === 'Rita', 'an agent typed by hand is a realtor contact and is not invited');
ok(manualPartyEntry({ label: 'Listing agent', contactId: 'c-lagent', person: 'Other' }).action === 'existing', 'a chosen agent is not saved again');
const company = manualPartyEntry({ label: 'Lender', company: 'Only Company Loans', contactType: 'lender', lenderRole: 'loan_officer' });
ok(company.ok && company.action === 'create' && company.contact.firstName === '' && !company.contact.lenderRole && company.invite === false, 'a lender company can be typed with no person and no invite');
ok(!manualPartyEntry({ label: 'Lender', person: 'Sam Officer', company: 'Only Company Loans', contactType: 'lender' }).ok, 'a typed lender person needs Loan Officer or Lender TC');
ok(manualPartyEntry({ label: 'Lender', person: 'Sam Officer', company: 'Only Company Loans', contactType: 'lender', lenderRole: 'loan_officer' }).ok, 'a typed loan officer is accepted');

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-proc');
const before = (await api.listAgentInvites()).length;
const deal = await api.createDeal({ street: '100 Typed Party Lane', city: 'Alexandria', state: 'VA', zip: '22314', openDate: '2026-11-01', transactionType: 'Purchase', claRepresentation: 'both' });
const made = await api.createContact(typed.contact);
ok(!made.profileId, 'the typed buyer has no portal login');
await api.addParticipant(deal.id, made.id, 'Client-Buyer');
const opened = await api.getDeal(deal.id);
const row = (opened.participants || []).find((p) => p.role === 'Client-Buyer' && !p.removed);
ok(row && row.contact.firstName === 'Pat' && row.contact.lastName === 'Buyer' && !row.contact.profileId, 'the typed buyer is on the file and still has no login');
ok((await api.listAgentInvites()).length === before, 'saving the typed buyer does not create an invite');
const again = companyOnlyContact(await api.listContacts(), 'Only Company Loans', 'lender');
ok(again === null || again.company === 'Only Company Loans', 'company lookup stays on contacts that already exist');

const page = readFileSync(new URL('../js/pages/ordernew.js', import.meta.url), 'utf8');
ok(!page.includes('pick a person from the list'), 'Place Order no longer blocks a typed buyer with the pick-a-person error');
ok(!page.includes('createPortalInvite') && !page.includes('inviteAfterEmailChange'), 'Place Order does not invite someone who was typed onto the file');
ok(page.includes('materializeTyped') && page.includes('data-dir-select'), 'Place Order saves typed parties and lists existing agents and lenders');
const contacts = readFileSync(new URL('../js/pages/dealcontacts.js', import.meta.url), 'utf8');
ok(!contacts.includes('Pick a person from the list, choose Add as a new person'), 'Contacts lets staff type the person instead of forcing a pick');
ok(contacts.includes('data-dir-select') && contacts.includes('no portal login'), 'Contacts offers the company list and does not create a login');
const overview = readFileSync(new URL('../js/pages/deal.js', import.meta.url), 'utf8');
ok(overview.includes('No portal invite was sent') && overview.includes('data-add-party="Buyer Agent"') && overview.includes('data-add-party="Lender"'), 'the file overview can add a typed buyer, agent or lender');

console.log(fail ? fail + ' failed' : 'file party passed');
if (fail) process.exit(1);
