/* Place Order (John, Nov 6). Mock mode saves the seven steps. Supabase mode is checked from the adapter source and the shared helpers. No network. */
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { encodeReferral, showMdQuestions, withoutHiddenProfiles, sourceChoices, referralLabel, PROCESSOR_PICK_ROLES, SALES_PICK_ROLES, REFERRALS } from '../js/data/place-order.js';
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let pass = 0, fails = 0;
const ok = (c, name) => { if (c) pass++; else { fails++; console.log('FAIL', name); } };
const rejects = async (p, name, re) => { try { await p(); ok(false, name + ' (should have failed)'); } catch (e) { ok(!re || re.test(e.message), name + ' [' + e.message + ']'); } };
const store = mem();
const a = createMockAdapter({ storage: store, sessionStorage: mem() });
const as = async (id) => { await a.signInDev(id); return a; };
const ORDER = { street: '9 Nov6 Lane', city: 'Rockville', state: 'MD', zip: '20850', processorId: 'u-proc', openDate: '2026-11-01' };

ok(showMdQuestions('MD', false) === true && showMdQuestions('md', false) === true, 'Maryland purchase shows the two questions');
ok(showMdQuestions('VA', false) === false && showMdQuestions('MD', true) === false, 'other states and a refinance hide them');
ok(withoutHiddenProfiles([{ id: 'demo', profileId: 'p-demo' }, { id: 'open', profileId: null }, { id: 'real', profileId: 'p-real' }], ['p-real']).map((c) => c.id).join() === 'open,real', 'demo logins drop out of a real contact list; a contact with no login stays');
ok(PROCESSOR_PICK_ROLES.join() === 'Processor,Preprocessor,Admin,Super admin', 'processor picker roles');
ok(SALES_PICK_ROLES.join() === 'Sales Person,Sales Team', 'sales picker stays sales roles');
ok(sourceChoices('Google Ads', 'Google Ads', false).some((o) => o.value === 'Google Ads') && sourceChoices('Google Ads', 'Google Ads', false).some((o) => o.value === 'buyer_agent'), 'an older marketing source stays on the edit list');
ok(sourceChoices('', '', true).every((o) => o.value === 'lender'), 'a refinance offers only the lender');
ok(referralLabel('buyer_agent:c-bagent', (id) => (id === 'c-bagent' ? 'Bianca Agent' : '')) === "Buyer's agent — Bianca Agent", 'referral label names the contact');

await as('u-proc');
const staff = await a.listSalesStaff();
const people = await a.listContacts();
ok(staff.every((s) => SALES_PICK_ROLES.includes(s.role)) && staff.length > 0, 'step 6 sales list is Sales Person or Sales Team');
ok(!people.filter((c) => staff.some((s) => s.id === c.profileId)).some((c) => /buyer|seller/i.test(c.firstName + c.lastName) && !SALES_PICK_ROLES.includes((staff.find((s) => s.id === c.profileId) || {}).role)), 'sales contacts are the staff rows, not clients');
const procs = await a.listProcessors();
ok(procs.every((p) => p.role === 'Processor'), 'mock processor list stays Processor accounts (supabase mode adds Admin there)');
const tcs = await a.listCoordinators();
ok(tcs.length >= 2, 'two transaction coordinators are available');

const buyer = encodeReferral('buyer_agent', 'c-bagent');
const md = await a.createDeal({ ...ORDER, transactionType: 'Purchase', purchasePrice: '485000', loanAmount: '388000', emdAmount: '10000', emdDueDate: '2026-11-20', closingDate: '2026-12-01', primaryResidence: 'yes', firstTimeBuyer: 'yes', sourceOfBusiness: buyer, notes: 'Nov 6 purchase', salesIds: [] });
ok(md.state === 'MD' && md.primaryResidence === 'yes' && md.firstTimeBuyer === 'yes', 'step 2 saves Maryland answers');
ok(md.sourceOfBusiness === buyer && md.sourceOfBusinessLabel === "Buyer's agent — Bianca Buyer-Agent", 'step 5 saves the buyer agent referral');
ok(md.transactionType === 'Purchase' && md.openDate === '2026-11-01' && md.purchasePrice === 485000, 'steps 1 and 4 save type, open date and loan amounts');
await a.addParticipant(md.id, 'c-buyer', 'Client-Buyer');
await a.addParticipant(md.id, 'c-seller', 'Client-Seller');
await a.addParticipant(md.id, 'c-bagent', 'Buyer Agent');
await a.addParticipant(md.id, 'c-lagent', 'Listing Agent');
await a.addParticipant(md.id, 'c-lender1', 'Lender');
await a.addParticipant(md.id, tcs[0].contactId, 'Transaction Coordinator');
await a.addParticipant(md.id, tcs[1].contactId, 'Transaction Coordinator');
await a.addDocument(md.id, { name: 'sales-contract.pdf', size: 20, mimeType: 'application/pdf', dataUrl: 'data:application/pdf;base64,RkFLRQ==', visibility: 'all', docType: 'Contract / addendum' });
const got = await a.getDeal(md.id);
const roles = got.participants.map((p) => p.role);
ok(roles.filter((r) => r === 'Transaction Coordinator').length === 2, 'both transaction coordinators are on the order');
ok(['Client-Buyer', 'Client-Seller', 'Buyer Agent', 'Listing Agent', 'Lender'].every((r) => roles.includes(r)), 'steps 3, 4 and 5 save buyer, seller, agents and lender');
ok((await a.listDocuments(md.id)).some((d) => d.name === 'sales-contract.pdf' && d.visibility === 'all'), 'step 1 document uses the same document save, with who can see it');
ok(!(got.salesPeople || []).length, 'an empty sales list does not block the order');

const va = await a.createDeal({ ...ORDER, street: '4 Other State Rd', state: 'VA', zip: '20190', primaryResidence: '', firstTimeBuyer: '', sourceOfBusiness: 'homeowner' });
ok(va.state === 'VA' && va.primaryResidence === '' && va.firstTimeBuyer === '' && va.sourceOfBusinessLabel === 'Homeowner', 'a non-Maryland order does not keep the Maryland answers');
const refi = await a.createDeal({ ...ORDER, street: '2 Refi Rd', transactionType: 'Refinance', loanAmount: '250000', sourceOfBusiness: 'lender' });
ok(refi.transactionType === 'Refinance' && refi.primaryResidence === '' && refi.sourceOfBusiness === 'lender', 'a refinance referral is the lender and has no occupancy answers');
await rejects(() => a.createDeal({ ...ORDER, sourceOfBusiness: 'Skywriting' }), 'NEG a marketing value that is not a referral or a Lead Source', /Source of business/);
ok((await a.createDeal({ ...ORDER, street: '8 Old Source Rd', sourceOfBusiness: 'Existing Client or Agent' })).sourceOfBusiness === 'Existing Client or Agent', 'an older Lead Source value still saves');

const page = readFileSync(new URL('../js/pages/ordernew.js', import.meta.url), 'utf8');
const adapter = readFileSync(new URL('../js/data/supabase-adapter.js', import.meta.url), 'utf8');
for (const bit of ['Upload sales contract', 'Upload title request', 'Add lender', "Buyer's transaction coordinator", 'Listing transaction coordinator', '+ Add another ${MULTI[role]}', "'Client-Seller': 'seller'", 'Who can see these files', 'id="tx-files"', 'id="tx-vis"', 'id="sob-block"', 'options(salesParty', 'MIN_ROWS = 1', 'data-add-tc']) ok(page.includes(bit), 'wizard has ' + bit);
ok(!/name="p:Sales Team"[\s\S]{0,180}options\(contacts/.test(page), 'sales team member is not the full contact list');
ok(adapter.includes('withoutHiddenProfiles') && adapter.includes('PROCESSOR_PICK_ROLES') && adapter.includes("!== 'MD'"), 'supabase adapter filters demo contacts, widens the processor list, and keeps occupancy for Maryland');
ok(REFERRALS.length === 4, 'four referral choices');

console.log(fails ? `place-order-nov6: ${fails} failed` : `place-order-nov6: ${pass} passed`);
if (fails) process.exit(1);
