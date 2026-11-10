/* Francis: searchable loss-payee clause, CPL address, lender contact types, company with no person,
 * mortgage broker, and FF-012 entity buyers/sellers. Fake data only. */
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { contactInsertRow } from '../js/data/contact-insert.js';
import {
  lossPayeeSuggestions, filterClauses, lenderExtras, lenderColumnWrite, lenderCompanyContact,
  entityIdentity, newPartyContact, newPartyError, looksLikeEntityName, cleanLenderRole, contactDisplayName,
} from '../js/data/lender-file.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const deals = [
  { lenderName: 'Example Home Loans', lossPayeeName: 'Example Home Loans ISAOA', openDate: '2026-10-01' },
  { lenderName: 'example home loans', lossPayeeName: 'Example Home Loans, its successors and/or assigns', openDate: '2026-11-02' },
  { lenderName: 'Example Home Loans', lossPayeeName: 'Example Home Loans ISAOA', openDate: '2026-09-01' },
  { lenderName: 'Other Bank', lossPayeeName: 'Other Bank ATIMA', openDate: '2026-11-08' },
  { lenderName: 'Example Home Loans', lossPayeeName: '   ', openDate: '2026-11-09' },
];
const clauses = lossPayeeSuggestions(deals, '  Example   Home Loans ');
ok(clauses.length === 2 && clauses[0].includes('successors') && clauses[1] === 'Example Home Loans ISAOA', 'clauses for that lender are newest first and not mixed with another lender');
ok(filterClauses(clauses, 'isaoa').length === 1 && filterClauses(clauses, 'isaoa')[0] === 'Example Home Loans ISAOA', 'a picked clause can be narrowed by typing and stays the stored text');
ok(lossPayeeSuggestions(deals, '').length === 0, 'no lender name yields no clauses');

const same = lenderExtras({ lenderAddress: '1 Main St', cplAddress: 'typed', cplSameAsLender: 'on', mortgageBrokerName: 'Harbor Brokerage' });
ok(same.cplSameAsLender === true && same.cplAddress === '1 Main St' && same.mortgageBrokerName === 'Harbor Brokerage', 'same as lender copies the lender address into the CPL address');
const own = lenderExtras({ lenderAddress: '1 Main St', cplAddress: '9 CPL Ave', cplSameAsLender: false, mortgageBrokerName: '' });
ok(own.cplAddress === '9 CPL Ave' && own.cplSameAsLender === false, 'an unchecked CPL address stays the address that was typed');
ok(lenderColumnWrite({ lenderAddress: '', cplAddress: '', cplSameAsLender: false, mortgageBrokerName: '' }) == null, 'a blank lender block does not write the new columns');
ok(lenderColumnWrite({ mortgageBrokerName: 'Harbor Brokerage' }).mortgageBrokerName === 'Harbor Brokerage', 'a brokerage name is a column write');

const company = lenderCompanyContact({ company: 'Example Home Loans' });
ok(company.ok && company.contact.firstName === '' && company.contact.lastName === '' && company.contact.lenderRole == null, 'a lender company can be saved with no contact person');
const officer = lenderCompanyContact({ company: 'Example Home Loans', firstName: 'Linda', lastName: 'Lender', lenderRole: 'loan_officer', email: 'linda@example.test' });
const tc = lenderCompanyContact({ company: 'Example Home Loans', firstName: 'Pat', lastName: 'Processor', lenderRole: 'lender_tc' });
ok(officer.ok && officer.contact.lenderRole === 'loan_officer' && tc.ok && tc.contact.lenderRole === 'lender_tc', 'Loan Officer and Lender TC are both allowed on one company');
ok(!lenderCompanyContact({ company: 'Example Home Loans', firstName: 'Linda', lenderRole: '' }).ok, 'a named lender contact needs a type');
ok(!lenderCompanyContact({ company: '', firstName: 'Linda', lenderRole: 'loan_officer' }).ok, 'a lender contact still needs the company');
let badRole = '';
try { cleanLenderRole('processor', 'lender'); } catch (e) { badRole = e.message; }
ok(/Loan Officer or Lender TC/.test(badRole), 'an unknown lender contact type is refused');

const entity = entityIdentity({ entityName: 'Spencer LLC', entityType: 'LLC' });
ok(entity.ok && entity.contact.firstName === '' && entity.contact.lastName === '' && entity.contact.company === 'Spencer LLC' && entity.entity.name === 'Spencer LLC', 'an entity is stored as the entity name, not a first and last name');
ok(!looksLikeEntityName('Warren Spencer') && looksLikeEntityName('Spencer Trust'), 'a person name is not treated as an entity; a trust is');
const rep = entityIdentity({ entityName: 'Spencer LLC', firstName: 'Warren', lastName: 'Spencer' });
ok(rep.contact.firstName === 'Warren' && rep.contact.lastName === 'Spencer' && rep.contact.company === 'Spencer LLC' && !rep.contact.firstName.includes('LLC'), 'a representative is optional and does not replace the entity name');
ok(newPartyError({ role: 'Client-Buyer', kind: 'entity', entityName: 'Spencer LLC', firstName: '' }) === '', 'Add new user kind=entity does not require a first name');
ok(newPartyError({ role: 'Client-Buyer', kind: 'person', firstName: '' }) === 'First name is required.', 'a person buyer still needs a first name');
const added = newPartyContact({ role: 'Client-Seller', kind: 'entity', entityName: 'Oak Trust', entityType: 'Trust' });
ok(added.ok && added.contact.firstName === '' && added.contact.company === 'Oak Trust' && added.entity.name === 'Oak Trust', 'Place Order / Add new user builds an entity contact from the entity name');
ok(contactDisplayName({ firstName: '', lastName: '', company: 'Oak Trust' }) === 'Oak Trust', 'an entity with no person shows the entity name');

const row = contactInsertRow({ firstName: '', lastName: '', company: 'Example Home Loans', contactType: 'lender' });
ok(row.first_name === '' && row.company === 'Example Home Loans' && !('lender_role' in row), 'a company-only insert does not send lender_role');
const typed = contactInsertRow({ firstName: 'Pat', lastName: 'Processor', company: 'Example Home Loans', contactType: 'lender', lenderRole: 'lender_tc' });
ok(typed.lender_role === 'lender_tc', 'a Lender TC insert sends lender_role');

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-admin');
const old = await api.createDeal({ street: '9 Old Lender Ln', city: 'Rockville', state: 'MD', zip: '20850', openDate: '2026-10-01', transactionType: 'Purchase', lenderName: 'Example Home Loans', lenderContact: 'Linda Lender', lenderPhone: '301-555-0100', lenderEmail: 'linda@example.test', lossPayeeName: 'Example Home Loans ISAOA/ATIMA', processorId: '' });
ok(old.lenderName === 'Example Home Loans' && old.lenderContact === 'Linda Lender' && old.lossPayeeName === 'Example Home Loans ISAOA/ATIMA' && old.lenderAddress === '' && old.cplSameAsLender === false, 'an existing lender shape still saves, with the new fields blank');
const newer = await api.createDeal({ street: '2 Newer Way', city: 'Rockville', state: 'MD', zip: '20850', openDate: '2026-11-01', transactionType: 'Purchase', lenderName: 'Example Home Loans', lossPayeeName: 'Example Home Loans, its successors and/or assigns', processorId: '' });
const found = await api.listLossPayeeClauses('Example Home Loans');
ok(found[0] === newer.lossPayeeName && found.includes(old.lossPayeeName) && !found.some((c) => /Other Bank/.test(c)), 'the order lookup returns only that lender\'s saved clauses, newest first');
const saved = await api.updateDeal(old.id, { lenderAddress: '100 Lender Ave', cplAddress: 'should be replaced', cplSameAsLender: true, mortgageBrokerName: 'Harbor Brokerage' });
ok(saved.lenderAddress === '100 Lender Ave' && saved.cplAddress === '100 Lender Ave' && saved.cplSameAsLender === true && saved.mortgageBrokerName === 'Harbor Brokerage' && saved.lossPayeeName === old.lossPayeeName, 'CPL same-as-lender saves the lender address and keeps the old loss payee');
const co = await api.createContact(company.contact);
const lo = await api.createContact(officer.contact);
const ltc = await api.createContact(tc.contact);
await api.addParticipant(old.id, co.id, 'Lender');
await api.addParticipant(old.id, lo.id, 'Lender');
await api.addParticipant(old.id, ltc.id, 'Lender');
const again = await api.getDeal(old.id);
const lenders = again.participants.filter((p) => p.role === 'Lender');
ok(lenders.length === 3 && lenders.some((p) => p.contact.lenderRole === 'loan_officer') && lenders.some((p) => p.contact.lenderRole === 'lender_tc') && lenders.some((p) => !p.contact.firstName && p.contact.company === 'Example Home Loans'), 'one lender company can have a Loan Officer, a Lender TC, and no person');
const entContact = await api.createContact(entity.contact);
const entRow = await api.addParticipant(again.id, entContact.id, 'Client-Buyer', { entity: entity.entity });
ok(entRow.ok && entContact.firstName === '' && entContact.company === 'Spencer LLC', 'a buyer entity is added without a first or last name');

const orderSrc = readFileSync(new URL('../js/pages/ordernew.js', import.meta.url), 'utf8');
const contactsSrc = readFileSync(new URL('../js/pages/dealcontacts.js', import.meta.url), 'utf8');
const dealSrc = readFileSync(new URL('../js/pages/deal.js', import.meta.url), 'utf8');
ok(orderSrc.includes('newPartyContact') && orderSrc.includes('lenderFieldsHtml') && orderSrc.includes('mountLossPayee') && orderSrc.includes('mountCplSame') && orderSrc.includes('data-add-lender-contact') && !orderSrc.includes('pick the person who is our contact for the entity'), 'Place Order uses the entity name, the clause search, CPL checkbox, and extra lender contacts');
ok(contactsSrc.includes('lenderSectionHtml') && contactsSrc.includes('lenderCompanyContact') && dealSrc.includes('mountLenderSection'), 'Parties and Contacts share the lender section');
const migration = readFileSync(new URL('../supabase/migrations/20261110081500_lender_clause_cpl_contacts.sql', import.meta.url), 'utf8');
const rollback = readFileSync(new URL('../supabase/rollbacks/20261110081500_lender_clause_cpl_contacts.sql', import.meta.url), 'utf8');
ok(migration.includes('loss_payee_name') && migration.includes('lender_address') && migration.includes('cpl_same_as_lender') && migration.includes('mortgage_broker_name') && migration.includes('lender_role') && migration.includes("expected 59") && migration.includes('contacts_lender_role_chk'), 'the migration adds the new columns and guards the current deals shape');
ok(rollback.includes('drop column lender_address') && rollback.includes('drop column lender_role') && rollback.includes('loss_payee_name was dropped') && rollback.includes('expected 59'), 'the rollback removes only the new columns and checks the old shape');

console.log(fail ? fail + ' failed' : 'lender file passed');
if (fail) process.exit(1);
