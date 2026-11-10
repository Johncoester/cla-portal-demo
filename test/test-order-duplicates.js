/* Place Order duplicate warning and the Team & Notes empty lists. No network. */
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { coordinatorRoster, duplicateNotice, duplicateOrders, sameAddress, streetKey } from '../js/data/order-duplicates.js';
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let pass = 0, fails = 0;
const ok = (c, name) => { if (c) pass++; else { fails++; console.log('FAIL', name); } };

const e2e = { id: 'd-e2e', fileNumber: 'MD-26-97225', street: 'E2E 123 Fake St', city: 'Annapolis', state: 'MD', zip: '21401', status: 'Open', buyerIds: ['buyer-e2e'], sellerIds: ['seller-e2e'] };
const golden = { id: 'd-gm', fileNumber: 'MD-26-97219', street: '2009 Golden Morning Drive #51', city: 'Bowie', state: 'MD', zip: '20721', status: 'Open', buyerIds: ['morris'], sellerIds: ['carrie'] };
const closed = { id: 'd-old', fileNumber: 'MD-26-96000', street: '9 Harbor Lane', city: 'Annapolis', state: 'MD', zip: '21401', status: 'Closed', buyerIds: ['buyer-e2e'], sellerIds: [] };
const orders = [e2e, golden, closed];

ok(streetKey('E2E 123 Fake Street') === streetKey('E2E 123 Fake St'), 'Street and St are the same street');
ok(streetKey('E2E 123 Fake St') !== streetKey('123 Fake St'), 'a leading word that is not a house number stays in the key');
ok(sameAddress({ street: 'E2E 123 Fake St.', city: 'Annapolis', state: 'md', zip: '21401-1234' }, e2e), 'case, punctuation and ZIP+4 still match the open file');
ok(sameAddress({ street: '2009 Golden Morning Dr Apt 51', city: 'Bowie', state: 'MD', zip: '20721' }, golden), 'Drive #51 matches Dr Apt 51');
ok(!sameAddress({ street: '2009 Golden Morning Drive #52', city: 'Bowie', state: 'MD', zip: '20721' }, golden), 'a different unit is not the same address');

const picked = duplicateOrders({ street: 'e2e  123 fake street', city: 'annapolis', state: 'MD', zip: '21401', buyerIds: ['buyer-e2e'], sellerIds: [], orders });
ok(picked.length === 1 && picked[0].fileNumber === 'MD-26-97225' && picked[0].sameBuyer === true && picked[0].status === 'Open', 'the existing buyer on E2E 123 Fake St warns');
const addressOnly = duplicateOrders({ street: 'E2E 123 Fake St', city: 'Annapolis', state: 'MD', zip: '21401', buyerIds: ['someone-else'], sellerIds: [], orders });
ok(addressOnly.length === 1 && addressOnly[0].sameBuyer === false && addressOnly[0].fileNumber === 'MD-26-97225', 'an open file at the same address warns without the same buyer');
const goldenHit = duplicateOrders({ street: '2009 Golden Morning Drive #51', city: 'Bowie', state: 'MD', zip: '20721', buyerIds: [], sellerIds: [], orders });
ok(goldenHit.length === 1 && goldenHit[0].fileNumber === 'MD-26-97219', 'Golden Morning still matches an open file at that address');
const closedParty = duplicateOrders({ street: '9 Harbor Lane', city: 'Annapolis', state: 'MD', zip: '21401', buyerIds: ['buyer-e2e'], sellerIds: [], orders });
ok(closedParty.length === 1 && closedParty[0].status === 'Closed' && closedParty[0].sameBuyer === true, 'a closed file warns when the buyer is the same');
const closedOther = duplicateOrders({ street: '9 Harbor Lane', city: 'Annapolis', state: 'MD', zip: '21401', buyerIds: ['other'], sellerIds: [], orders });
ok(closedOther.length === 0, 'a closed file with a different buyer does not warn');
ok(duplicateOrders({ street: 'E2E 123 Fake St', city: 'Annapolis', state: 'MD', zip: '21401', buyerIds: [], sellerIds: [], orders: [{ ...e2e, status: 'Cancelled' }] }).length === 0, 'a cancelled file does not warn');
ok(duplicateOrders({ street: '', city: 'Annapolis', state: 'MD', zip: '21401', orders }).length === 0, 'a blank street does not warn');
const note = duplicateNotice(picked);
ok(note.show && note.proceed === 'You can still place this order.' && note.lines[0].text.includes('MD-26-97225') && note.lines[0].text.includes('same buyer'), 'the warning names the file and still lets staff place the order');

const real = { isDemo: false };
const profiles = [
  { id: 'tc-real', role: 'Transaction Coordinator', status: 'active', isDemo: false, firstName: 'Transaction', lastName: 'Coordinator 1', email: 'tc1@example.test' },
  { id: 'tc-demo', role: 'Transaction Coordinator', status: 'active', isDemo: true, firstName: 'Taylor', lastName: 'Demo', email: 'demo.tc@example.test' },
];
const roster = coordinatorRoster(profiles, [], real);
ok(roster.rows.length === 1 && roster.rows[0].profileId === 'tc-real' && roster.rows[0].needsContact === true && roster.rows[0].contactId === '', 'a real TC with no contact is recorded and not given an id, and the demo TC is left out');
ok(coordinatorRoster(profiles, [{ id: 'c1', profileId: 'tc-real', firstName: 'Transaction', lastName: 'Coordinator 1' }], real).rows[0].contactId === 'c1' && coordinatorRoster(profiles, [{ id: 'c1', profileId: 'tc-real' }], real).created.length === 0, 'an existing contact is reused');

const store = mem();
const a = createMockAdapter({ storage: store, sessionStorage: mem() });
await a.signInDev('u-proc');
const contactsBefore = (await a.listContacts()).length;
const tcs = await a.listCoordinators();
ok(tcs.length >= 2 && tcs.every((t) => t.contactId) && (await a.listContacts()).length === contactsBefore, 'the mock TC list keeps existing coordinators and does not create a contact');
const dup = await a.findDuplicateOrders({ street: '145 Main Street', city: 'Rockville', state: 'MD', zip: '20850', buyerIds: ['c-buyer'], sellerIds: [] });
ok(dup.some((d) => d.fileNumber === 'MD-26-97183' && d.status === 'Open' && d.sameBuyer === true), 'the open seed file at 145 Main Street warns for its buyer');
const none = await a.findDuplicateOrders({ street: '145 Main St', city: 'Bethesda', state: 'MD', zip: '20814', buyerIds: ['c-buyer'], sellerIds: [] });
ok(none.length === 0, 'the same street in another city does not warn');

const page = readFileSync(new URL('../js/pages/ordernew.js', import.meta.url), 'utf8');
const adapter = readFileSync(new URL('../js/data/supabase-adapter.js', import.meta.url), 'utf8');
const sql = readFileSync(new URL('../supabase/migrations/20261110103000_tc_place_order_contact.sql', import.meta.url), 'utf8');
const rollback = readFileSync(new URL('../supabase/rollbacks/20261110103000_tc_place_order_contact.sql', import.meta.url), 'utf8');
ok(page.includes('data-dup-orders') && page.includes('findDuplicateOrders') && page.includes('You can still place this order.') && page.includes('data-place-order'), 'review asks for duplicates and does not remove Place order');
ok(!page.includes('dup-block') && page.includes('data-review-ready'), 'a duplicate is a warning, not a thing to fix');
ok(page.includes('No salespeople are available for this login.') && page.includes('No preprocessor is available for this login.') && page.includes('No transaction coordinator is available for this login.') && page.includes('(none available for this login)'), 'empty Team and TC lists say none are available for this login');
ok(page.includes('name="p:Sales Team"') && page.includes('options(salesParty'), 'the Sales team member field already on main is left for PR 106 to remove');
const listCoordinators = adapter.slice(adapter.indexOf('async listCoordinators'), adapter.indexOf('async findDuplicateOrders'));
ok(listCoordinators.includes('coordinatorRoster') && listCoordinators.includes("eq('role', 'Transaction Coordinator')") && listCoordinators.includes('r.contactId') && !listCoordinators.includes('.insert('), 'the hosted TC list is a read and omits a coordinator who has no contact');
ok(adapter.includes('findDuplicateOrders'), 'hosted Place Order looks up visible files');
ok(sql.includes("p.role = 'Transaction Coordinator'") && sql.includes('viewer_is_demo') && sql.includes('profiles_tc_contact') && rollback.includes('drop trigger if exists profiles_tc_contact'), 'the migration backfills TC contacts and the rollback drops that trigger');

console.log(fails ? `order-duplicates: ${fails} failed` : `order-duplicates: ${pass} passed`);
if (fails) process.exit(1);
