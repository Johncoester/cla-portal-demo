/* CONNECT-7 (John Coester, Nov 25 2026, Connect Live Test Checklist row 4.3).
 * A buyer-side transaction coordinator can start a conversation with the buyer, the buyer agent,
 * and the buyer's lender, plus CLA staff, and cannot add the seller side. A seller-side coordinator
 * can add the seller and the listing agent, not the buyer side or the lender. Fake data only. */
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { explainRecipients } from '../js/data/message-recipients.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const explained = explainRecipients({
  myRole: 'Buyer Agent TC',
  participants: [
    { role: 'Client-Buyer', contact: { firstName: 'Bea', lastName: 'Buyer', profileId: 'u-buyer' } },
    { role: 'Lender', contact: { firstName: 'Len', lastName: 'Lender', profileId: 'u-lend' } },
    { role: 'Client-Seller', contact: { firstName: 'Sam', lastName: 'Seller', profileId: 'u-seller' } },
  ],
  allowed: [{ id: 'u-buyer' }, { id: 'u-lend' }],
});
ok(explained.unavailable.length === 0, 'explainRecipients treats Lender as buyer-side for a buyer-side coordinator');
ok(explainRecipients({ myRole: 'Listing Agent TC', participants: [{ role: 'Client-Seller', contact: { firstName: 'Sam', lastName: 'Seller', profileId: '' } }], allowed: [] }).unavailable[0]?.reason.includes('no portal login'), 'a listing-side coordinator is told when the seller has no login');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-admin');
const buyerTc = await api.adminCreateUser({ firstName: 'Riley', lastName: 'BuyerTc', email: 'riley.connect7@example.test', phone: '301-555-0101', role: 'Outside user', contactType: 'agent_tc' });
const listingTc = await api.adminCreateUser({ firstName: 'Casey', lastName: 'ListingTc', email: 'casey.connect7@example.test', phone: '301-555-0102', role: 'Outside user', contactType: 'agent_tc' });
const lender = await api.adminCreateUser({ firstName: 'Lane', lastName: 'Loan', email: 'lane.connect7@example.test', phone: '301-555-0103', role: 'Outside user', contactType: 'lender' });

await api.signInDev('u-proc');
const deal = await api.createDeal({ street: '43 Connect Seven Lane', city: 'Rockville', state: 'MD', zip: '20850', openDate: '2026-11-25', transactionType: 'Purchase', processorId: 'u-proc' });
await api.addParticipant(deal.id, 'c-buyer', 'Client-Buyer');
await api.addParticipant(deal.id, 'c-bagent', 'Buyer Agent');
await api.addParticipant(deal.id, 'c-seller', 'Client-Seller');
await api.addParticipant(deal.id, 'c-lagent', 'Listing Agent');
const contacts = await api.listContacts();
const buyerTcC = contacts.find((c) => c.profileId === buyerTc.id);
const listingTcC = contacts.find((c) => c.profileId === listingTc.id);
const lenderC = contacts.find((c) => c.profileId === lender.id);
ok(!!buyerTcC && !!listingTcC && !!lenderC, 'the coordinator and lender contacts exist');
await api.linkAgentTc('c-bagent', buyerTcC.id);
await api.linkAgentTc('c-lagent', listingTcC.id);
await api.addParticipant(deal.id, lenderC.id, 'Lender');

const opened = await api.getDeal(deal.id);
ok(opened.participants.some((p) => p.role === 'Buyer Agent TC' && p.contactId === buyerTcC.id), 'linking the buyer agent places the buyer-side coordinator on the file');
ok(opened.participants.some((p) => p.role === 'Listing Agent TC' && p.contactId === listingTcC.id), 'linking the listing agent places the listing-side coordinator on the file');

const listAs = async (who) => { await api.signInDev(who); return api.listMessageRecipients(deal.id); };

const hasId = (rows, id) => rows.some((p) => p.id === id);
const asBuyerTc = await listAs(buyerTc.id);
ok(hasId(asBuyerTc, 'u-buyer') && hasId(asBuyerTc, 'u-bagent') && hasId(asBuyerTc, lender.id), 'a buyer-side TC can add the buyer, the buyer agent, and the lender');
ok(hasId(asBuyerTc, 'u-proc'), 'a buyer-side TC still sees the Processor');
ok(!hasId(asBuyerTc, 'u-seller') && !hasId(asBuyerTc, 'u-lagent') && !hasId(asBuyerTc, listingTc.id), 'a buyer-side TC cannot add the seller, the listing agent, or the listing-side coordinator');

const asListingTc = await listAs(listingTc.id);
ok(hasId(asListingTc, 'u-seller') && hasId(asListingTc, 'u-lagent'), 'a listing-side TC can add the seller and the listing agent');
ok(hasId(asListingTc, 'u-proc'), 'a listing-side TC still sees the Processor');
ok(!hasId(asListingTc, 'u-buyer') && !hasId(asListingTc, 'u-bagent') && !hasId(asListingTc, lender.id) && !hasId(asListingTc, buyerTc.id), 'a listing-side TC cannot add the buyer side or the lender');

await api.signInDev(buyerTc.id);
const started = await api.sendMessage({ dealId: deal.id, to: ['u-buyer', lender.id], subject: 'Buyer-side note', bodyHtml: '<p>Please confirm.</p>', files: [] });
ok(!!started.id, 'a buyer-side TC can start a conversation with the buyer and the lender');

try {
  await api.sendMessage({ dealId: deal.id, to: ['u-seller'], subject: 'Other side', bodyHtml: '<p>No.</p>', files: [] });
  ok(false, 'a buyer-side TC must not start a conversation with the seller');
} catch (e) {
  ok(/own side|other side|CLA Title/i.test(e.message), 'starting a conversation with the seller is refused [' + e.message + ']');
}

const mig = read('supabase/migrations/20261131280000_connect_7_tc_recipients.sql');
const rb = read('supabase/rollbacks/20261131280000_connect_7_tc_recipients.sql');
ok(mig.includes('private.outside_roles') && mig.includes('my_sides') && mig.includes("when 'Lender' then 'buyer'") && mig.includes('Buyer Agent TC'), 'the migration uses outside_roles, my_sides, and treats Lender and agent coordinators as a side');
ok(mig.includes('STABLE SECURITY DEFINER') && mig.includes("SET search_path TO 'pg_catalog', 'public', 'extensions'") && mig.includes("select private.lock_function_search_paths()"), 'the functions stay SECURITY DEFINER with a fixed search_path');
ok(rb.includes('private.rpc_message_recipients') && !rb.includes("when 'Lender' then 'buyer'") && !rb.includes('private.outside_roles'), 'the rollback puts the previous function bodies back');

const page = read('js/pages/dealmsgs.js');
ok(page.includes('listMessageRecipients(') && page.includes('Start conversation'), 'Start conversation lists the people the recipient query returns');

console.log(fail ? `FAIL ${fail}` : 'connect-7 tc recipients checks passed');
process.exit(fail ? 1 : 0);
