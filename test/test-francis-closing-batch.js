/* FF-024 through FF-029. Fake data only. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { CPL_CLAUSES, CPL_OTHER } from '../js/data/cpl-clauses.js';
import { officeOptionLabel } from '../js/data/closing-side.js';
import { SAMPLE_OFFICES, officeAddress } from '../js/data/offices.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const expected = [
  'None', 'ISAOA', 'ISAOA/ATIMA', 'ISAOA ATIMA and/or Warehouse Lender', 'And/or its Warehouse Lender',
  'Its successors and assigns, as their interest may appear', 'Its successors and assigns, as their interests may appear',
  'Its successors and/or assigns', 'Its successors and/or assigns, as their interests may appear', 'Its Successors and/or Assigns, ATIMA',
  'ISAOA, as their respective interests may appear',
  'And/or United States Department of Agriculture, its respective successors and/or assigns as their interests may appear',
  'Acting through the Rural Housing Service, or successor agency, United States Department of Agriculture, their successors and assigns, as their interests may appear',
  'And/or Secretary of Department of Veterans Affairs, an officer of the United States of America, their respective successors and assigns',
  'And/or the Secretary of Veterans Affairs, their successors and/or assigns as their interest may appear',
  'And/or the Secretary of Veterans Affairs, an Officer of the United States of America, its successors and/or assigns as their interest may appear',
  'And/or the Department of Veterans Affairs, its successors and/or assigns, as their interests may appear',
  'Its successors and/or Administrator of Veteran Affairs and/or assigns, as their respective interests may appear',
  'And/or the Secretary of Housing and Urban Development, their successors and/or assigns, as their interests may appear',
  'And/or the Secretary of Housing and Urban Development of Washington, D.C., their successors and/or assigns as their interests may appear',
  'PAYEE IN NOTE AND/OR SECRETARY OF HOUSING AND URBAN DEVELOPMENT, THEIR SUCCESSORS AND OR ASSIGNS AS THEIR INTEREST MAY APPEAR',
  'Its successors and/or assigns appearing of record as Mortgage Electronic Registration Systems, Inc. as the Insured',
  'Its successors and/or assigns appearing of record as Mortgage Electronic Registration Systems, Inc. as the Nominee',
  'And/or the Secretary of Veterans Affairs, its successors and or assigns appearing of record as Mortgage Electronic Registration Systems, Inc., as nominee',
  'And/or the Secretary of Housing and Urban Development, its successors and or assigns appearing of record as Mortgage Electronic Registration Systems, Inc., as nominee',
  'Appearing of record as Mortgage Electronic Registration Systems, Inc., (MERS), solely as a nominee for lender and lender\'s successors and assigns',
  'And each successor and/or assign that is defined as an Insured in the Conditions.',
  'And each successor and/or assign that is defined as an Insured in the Conditions of the Policy.',
];
ok(CPL_CLAUSES.length === 28 && CPL_CLAUSES.every((c, i) => c === expected[i]), 'the CPL clause list is Francis\'s 28 strings in order');
ok(CPL_OTHER === 'Other / Custom Clause', 'custom clause is a separate choice');
ok(SAMPLE_OFFICES.every((o) => o.addressLine1 && o.city && o.state && o.zip), 'the sample offices already store street, city, state, and ZIP');
const miami = SAMPLE_OFFICES.find((o) => o.name === 'Miami');
ok(officeOptionLabel({ name: miami.name, address: officeAddress(miami) }).includes('1111 Brickell Ave') && officeOptionLabel(miami).includes('Miami, FL 33131'), 'the office option shows the street, city, state, and ZIP');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-admin');
const deal = await api.createDeal({ street: '16 Closing Lane', city: 'Miami', state: 'FL', zip: '33131', processorId: 'u-proc' });
const buyer = await api.addParticipant(deal.id, 'c-buyer', 'Client-Buyer');
await api.addParticipant(deal.id, 'c-seller', 'Client-Seller');
await api.addParticipant(deal.id, 'c-bagent', 'Buyer Agent');
const lender = await api.createContact({ firstName: 'Lana', lastName: 'Lender', email: 'lana.lender@example.test', phone: '3015550198', contactType: 'lender' });
await api.addParticipant(deal.id, lender.id, 'Lender');
const blank = await api.createContact({ firstName: 'Blank', lastName: 'Processor', email: '', phone: '3015550196', contactType: 'lender' });
await api.addParticipant(deal.id, blank.id, 'Processor');

await api.signInDev('u-proc');
const offices = await api.getClosingOfficeDefault(deal.id);
ok(offices.offices.every((o) => officeOptionLabel(o) === o.address && o.address.includes(o.state) && /\d{5}/.test(o.address)), 'the closing office list carries a full address for every office');
const when = '2026-12-20T10:30';
await api.confirmClosing(deal.id, { at: when, location: 'Mobile notary', closingManualStreet: '9 Fake Pier', closingManualCity: 'Miami', closingManualState: 'FL', closingManualZip: '33131' });
const reloaded = await api.getDeal(deal.id);
ok(reloaded.closingManualStreet === '9 Fake Pier' && reloaded.closingManualZip === '33131', 'a typed closing address reloads with the file');

const saved = await api.saveSideSigning(deal.id, { side: 'buyer', status: 'signed', signedOn: '2026-11-02', date: '2026-12-20', time: '10:30', placeKind: 'mobile_notary', street: '9 Fake Pier', city: 'Miami', state: 'FL', zip: '33131' });
const again = await api.getDeal(deal.id);
ok(saved.status === 'signed' && again.buyerSignStatus === 'signed' && again.buyerSignedOn === '2026-11-02' && again.buyerManualStreet === '9 Fake Pier' && again.sellerSignStatus !== 'signed', 'the buyer side signs on its own, with the mobile notary address');
await api.saveSideSigning(deal.id, { side: 'seller', status: 'pending', placeKind: 'office', officeId: 'off-miami', date: '2026-12-21', time: '15:00' });
const both = await api.getDeal(deal.id);
ok(both.sellerPlaceKind === 'office' && both.sellerOfficeId === 'off-miami' && both.buyerSignStatus === 'signed', 'the seller side keeps its own office and does not clear the buyer');

const prior = { lenderName: 'Old Lender', lenderContact: 'Pat', lenderPhone: '', lenderEmail: 'old@example.test', lossPayeeName: 'ISAOA', at: '2026-11-01T00:00:00Z' };
await api.updateDeal(deal.id, { lenderName: 'New Lender', lenderContact: 'Ann', lenderEmail: 'ann@example.test', lossPayeeName: 'ISAOA/ATIMA', lenderHistory: [prior] });
const switched = await api.getDeal(deal.id);
ok(switched.lenderName === 'New Lender' && switched.lenderHistory[0].lenderName === 'Old Lender' && switched.lossPayeeName === 'ISAOA/ATIMA', 'switching lenders keeps the previous lender and the clause');

await api.signInDev('u-admin');
const people = await api.listMessageRecipients(deal.id);
const roles = people.map((p) => p.role);
ok(roles.includes('Client-Buyer') && roles.includes('Client-Seller') && roles.includes('Buyer Agent') && roles.includes('Lender'), 'staff can choose the buyer, seller, agent, and lender');
ok(people.find((p) => p.role === 'Lender').email === 'lana.lender@example.test', 'the lender is offered from the contact email');
ok(people.some((p) => p.id === 'u-proc' && p.email.includes('@')) && !people.some((p) => p.firstName === 'Blank'), 'the assigned processor has an email and a processor with no email is left out');
ok(buyer && buyer.tasksCreated >= 0, 'the buyer was added to the file');

const sql = readFileSync('supabase/migrations/20261112040000_closing_lender_batch.sql', 'utf8');
ok(/btrim\(people\.email\)/.test(sql) && !/can_message\(/.test(sql), 'the picker is one query and does not call can_message per person');
const hash = createHash('sha256').update(sql).digest('hex');
const roll = createHash('sha256').update(readFileSync('supabase/rollbacks/20261112040000_closing_lender_batch.sql')).digest('hex');
console.log('closing-lender-migration-sha256', hash);
console.log('closing-lender-rollback-sha256', roll);

console.log(fail ? fail + ' failed' : 'francis closing batch passed');
if (fail) process.exit(1);
