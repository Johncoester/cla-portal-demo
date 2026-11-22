/* Francis open items: editable agent details, optional processor draft, earnest money (commissions are Agent fees since Nov 13),
 * address fill from the bundled ZIP table, parcel id, and entity names. Fake data only. */
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { fillProperty, parsePropertyAddress, cleanParcel } from '../js/data/address-fill.js';
import { readEarnest, earnestView } from '../js/data/earnest-commission.js';
import { fileTitleOf, partyDisplayName } from '../js/data/party-name.js';
import { LENDER_CONTACT_ROLES, lenderCompanyContact } from '../js/data/lender-file.js';
import { runsOrders } from '../js/data/constants.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

const parsed = parsePropertyAddress('123 Sample Street, Rockville, MD 20850');
ok(parsed.parsed && parsed.street === '123 Sample Street' && parsed.city === 'Rockville' && parsed.state === 'MD' && parsed.zip === '20850', 'a full property address splits into street, city, state and ZIP');
ok(parsePropertyAddress('123 Sample Street').parsed === false, 'a street alone is not rewritten');
const filled = await fillProperty({ street: '123 Sample Street, Rockville, MD 20850', city: '', state: '', zip: '', county: '' });
ok(filled.city === 'Rockville' && filled.state === 'MD' && filled.zip === '20850' && filled.county === 'Montgomery', 'city, state, ZIP and county fill from the address and the bundled ZIP table');
const kept = await fillProperty({ street: '9 Kept Lane', city: 'Frederick', state: 'MD', zip: '21701', county: 'Carroll' });
ok(kept.city === 'Frederick' && kept.county === 'Carroll' && kept.street === '9 Kept Lane', 'a city, state or county already typed is kept');
const zipOnly = await fillProperty({ street: '9 Zip Lane', city: '', state: '', zip: '20850', county: '' });
ok(zipOnly.state === 'MD' && zipOnly.county === 'Montgomery' && zipOnly.city === '', 'a ZIP fills state and county, and does not invent a city');
ok((() => { try { cleanParcel('x'.repeat(81)); return false; } catch (e) { return /too long/.test(e.message); } })(), 'a parcel id over 80 characters is refused');

const earnest = readEarnest({ emdHeldBy: 'CLA Title', commissionBase: '400,000', commissionPercent: '2.5' });
ok(earnest.emdHeldBy === 'CLA Title' && !('commissionTotal' in earnest), 'Place Order earnest money parses; commission fields are not order fields any more');
ok((() => { try { readEarnest({ emdHeldBy: 'CLA Title' }, { refinance: true }); return false; } catch (e) { return /refinance/i.test(e.message); } })(), 'a refinance cannot save earnest money');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-admin');
const draft = await api.createDeal({ street: '4 Draft Way', city: 'Rockville', state: 'MD', zip: '20850', transactionType: 'Purchase', processorId: '', parcelId: '12-345-678', emdHeldBy: 'Listing brokerage' });
ok(draft.status === 'Open' && !draft.processorId && draft.processorName === 'Unassigned', 'Save as draft opens the file as Open with Processor Unassigned');
ok(draft.parcelId === '12-345-678', 'parcel id is saved on the order');
const view = earnestView(draft);
ok(view.held === 'Listing brokerage', 'EMD held by is on the file');
ok(draft.emdHolder === 'Listing brokerage' && draft.buyerCommissionPct == null && draft.listingCommissionPct == null, 'EMD held by mirrors the deal column; the order keeps no commission');
const again = await api.getDeal(draft.id);
ok(again.parcelId === '12-345-678' && again.financial.emdHeldBy === 'Listing brokerage', 'the file read still shows the parcel and EMD held by');

const seller = { role: 'Client-Seller', contact: { firstName: 'Warren', lastName: 'Spencer', company: 'Spencer LLC' }, entity: { name: 'Spencer LLC', repName: 'Warren Spencer' } };
const buyer = { role: 'Client-Buyer', contact: { firstName: 'Ada', lastName: 'Buyer' } };
ok(partyDisplayName(seller) === 'Spencer LLC' && partyDisplayName(buyer) === 'Ada Buyer', 'an entity seller shows the entity name and a person buyer still shows first and last');
ok(fileTitleOf([buyer, seller]) === 'Buyer / Spencer LLC', 'the file title uses the entity name instead of the representative last name');

const company = lenderCompanyContact({ company: 'Example Home Loans' });
const lo = lenderCompanyContact({ company: 'Example Home Loans', firstName: 'Linda', lastName: 'Officer', lenderRole: 'loan_officer' });
const tc = lenderCompanyContact({ company: 'Example Home Loans', firstName: 'Pat', lastName: 'Coord', lenderRole: 'lender_tc' });
ok(company.ok && !company.contact.firstName && lo.ok && tc.ok && LENDER_CONTACT_ROLES.map(([c]) => c).join() === 'loan_officer,lender_tc', 'a lender company can be saved with no person, and Loan Officer and Lender TC already exist');

const roles = [
  ['Processor', true], ['Preprocessor', true], ['Admin', true], ['Super admin', true],
  ['Transaction Coordinator', false], ['Sales Person', false], ['Sales Team', false],
  ['Buyer Agent', false], ['Listing Agent', false], ['Client-Buyer', false], ['Client-Seller', false],
];
ok(roles.every(([role, staff]) => runsOrders({ role, isAdmin: role === 'Admin' || role === 'Super admin' }) === staff), 'order edit stays with Processor, Preprocessor and Admin; sales, TC, agents, buyers and sellers do not get those controls');

const orderSrc = readFileSync(new URL('../js/pages/ordernew.js', import.meta.url), 'utf8');
const dealSrc = readFileSync(new URL('../js/pages/deal.js', import.meta.url), 'utf8');
ok(orderSrc.includes("throw new Error('Only a Processor or Admin can place orders.')") && orderSrc.includes('data-agent-edit') && orderSrc.includes('data-earnest-commission') && orderSrc.includes('data-save-draft') && orderSrc.includes('Save as draft'), 'Place Order is staff-only and has agent edits, earnest money and agent fees, and Save as draft');
ok(orderSrc.includes('<option value="">Unassigned</option>') && orderSrc.includes('Processor can stay Unassigned'), 'Processor stays optional, including on Save as draft');
const editModal = dealSrc.slice(dealSrc.indexOf('async function editModal'), dealSrc.indexOf('async function addPartyModal'));
const earnestRead = dealSrc.slice(dealSrc.indexOf('function earnestBlock'), dealSrc.indexOf('// ---------------- ORDER PAGE REDESIGN (John, Nov 4): ONE Parties list'));
const parcelFields = readFileSync(new URL('../js/pages/parcel-fields.js', import.meta.url), 'utf8');
ok(editModal.includes('parcelFieldsHtml') && editModal.includes('name="emdHeldBy"') && parcelFields.includes('parcelId') && parcelFields.includes('data-add-parcel') && !earnestRead.includes('<input') && !earnestRead.includes('<button') && !earnestRead.includes('<select'), 'earnest inputs live in the staff edit dialog; parcel ids use the parcel component; the file summary is read-only');
ok(dealSrc.includes('edit ? html`<button class="icon-edit" id="editdeal"'), 'the edit control is still limited to staff who can edit the order');

const migration = readFileSync(new URL('../supabase/migrations/20261110200000_parcel_earnest_financial.sql', import.meta.url), 'utf8');
ok(migration.includes('parcel_id') && migration.includes('financial') && migration.includes("lock_timeout = '3s'") && migration.includes('expected 68') && migration.includes('expected 70') && !/update\s+public\.contacts/i.test(migration) && !/contacts\.custom/.test(migration), 'the migration adds parcel and financial on deals and does not write contacts.custom');

console.log(fail ? fail + ' failed' : 'francis open feedback passed');
if (fail) process.exit(1);
