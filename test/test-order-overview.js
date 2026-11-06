/* Order overview is a real read. Hidden contacts stay hidden. A missing deal is an error, not an empty page. */
import { buildOrderOverview } from '../js/data/order-overview.js';
import { orderOverviewSupabase } from '../js/data/supabase-order-overview.js';
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const deal = { id: 'deal-1', fileNumber: 'MD-26-97183', transactionType: 'Purchase', purchasePrice: 100, loanAmount: 80, stage: 1, status: 'Open', processorName: 'Paula Processor', processorId: 'u-proc', myRole: 'Client-Buyer', myRoles: ['Client-Buyer'], participants: [
  { role: 'Client-Buyer', contact: { firstName: 'Ben', lastName: 'Buyer', email: 'ben@example.test', phone: '301-555-0107', profileId: 'u-buyer', contactHidden: false } },
  { role: 'Listing Agent', contact: { firstName: 'Larry', lastName: 'Listing-Agent', email: 'larry@example.test', phone: '301-555-0106', profileId: 'u-lagent', contactHidden: true } },
  { role: 'Buyer Agent', contact: { firstName: 'Bianca', lastName: 'Buyer-Agent', email: 'bianca@example.test', phone: '301-555-0105', profileId: 'u-bagent', contactHidden: false } },
] };
const tasks = [{ id: 't1', dealId: 'deal-1', title: 'Earnest money deposit receipt', assignedRole: 'Client-Buyer', status: 'todo', ownerId: 'u-buyer' }, { id: 't2', dealId: 'deal-1', title: 'Seller bank', assignedRole: 'Client-Seller', status: 'todo', ownerId: 'u-seller' }];
const buyer = buildOrderOverview({ deal, me: { id: 'u-buyer', role: 'Outside user' }, tasks, documents: [{ id: 'd1', dealId: 'deal-1', sample: true }, { id: 'd2', dealId: 'deal-1' }], threads: [], activity: [{ id: 'a1', detail: 'staff only wire account 999', actorName: 'Paula' }] });
const hidden = buyer.parties.find((p) => p.label === 'Listing Agent');
ok(hidden && hidden.contactHidden && hidden.email === '' && hidden.phone === '' && !JSON.stringify(hidden).includes('larry@'), 'a hidden listing agent has no email or phone');
ok(buyer.emdPending === true && buyer.outstanding === 1, 'the buyer sees their own open task, including the EMD flag');
ok(!JSON.stringify(buyer.orderDetails).includes('999') && buyer.orderDetails.purchasePrice === 100, 'overview does not add a wire account and keeps the price already on the file');
const sales = buildOrderOverview({ deal: { ...deal, myRole: null, myRoles: [] }, me: { id: 'u-sp', role: 'Sales Person', isAdmin: false }, tasks, documents: [], threads: [], activity: [] });
ok(sales.canRequestUpdate === false && sales.canShareAccess === false && sales.parties.every((p) => p.canMessage === false), 'a view-only sales login cannot request, share, or message');
const agent = buildOrderOverview({ deal: { ...deal, myRole: 'Buyer Agent', myRoles: ['Buyer Agent'] }, me: { id: 'u-bagent', role: 'Outside user' }, tasks: [], documents: [], threads: [], activity: [], salesPeople: [{ id: 'u-sp', name: 'Sam Salesperson' }] });
ok((agent.parties.find((p) => p.salesRep) || {}).name === 'Sam Salesperson' && agent.parties.find((p) => p.label === 'Settlement Agent').canMessage === true && agent.parties.find((p) => p.label === 'Listing Agent').canMessage === false, 'the file sales name is kept, a hidden contact cannot be messaged');
const refi = buildOrderOverview({ deal: { ...deal, transactionType: 'Refinance', purchasePrice: 100 }, me: { id: 'u-proc', role: 'Processor', isAdmin: false }, tasks: [], documents: [], threads: [], activity: [] });
ok(refi.orderDetails.purchasePrice === null && refi.orderDetails.refinance === true, 'a refinance overview does not present a purchase price');
let threw = false; try { buildOrderOverview({ deal: null, me: { id: 'u' } }); } catch (e) { threw = /not found/i.test(e.message); }
ok(threw, 'a missing order is an error');

const calls = [];
const chain = (rows) => { const q = { select() { return q; }, eq() { return q; }, in() { return q; }, order() { return q; }, then(fn) { return Promise.resolve(fn({ data: rows, error: null })); } }; return q; };
const sb = { from(table) { calls.push(table); return chain([]); } };
const api = { async getDeal(id) { if (id === 'missing') throw new Error('Order not found.'); return deal; }, async listTasks() { return tasks; }, async listDocuments() { return []; }, async listThreads() { return [{ id: 'th', subject: 'Hello', messages: [] }]; }, async listActivity() { return { items: [{ id: 'a', createdAt: '2026-11-01T00:00:00Z', action: 'note', detail: 'Opened', actorName: 'Paula' }] }; } };
const supa = orderOverviewSupabase({ sb, ok: (r) => { if (r.error) throw new Error(r.error.message); return r.data; }, camel: (o) => o, me: async () => ({ id: 'u-proc', role: 'Processor' }), api });
const ov = await supa.getOrderOverview('deal-1');
ok(ov.parties.some((p) => p.label === 'Buyer') && ov.counts.documents === 0 && ov.conversations[0].subject === 'Hello' && ov.recentActivity[0].detail === 'Opened', 'supabase overview uses the deal, tasks, threads, and activity it was given');
let missing = false; try { await supa.getOrderOverview('missing'); } catch (e) { missing = /not found/i.test(e.message); }
ok(missing, 'supabase overview does not replace a missing file with an empty page');
const ur = await supa.listUpdateRequests('deal-1');
const shares = await supa.listSharedAccess('deal-1');
ok(Array.isArray(ur) && Array.isArray(shares) && calls.includes('update_requests') && calls.includes('access_invites'), 'update requests and shared access are read from their tables');
console.log(fail ? fail + ' failed' : 'order overview passed');
if (fail) process.exit(1);
