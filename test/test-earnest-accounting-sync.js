/* Earnest money is optional and lives on the order; Accounting reads and writes those same fields.
 * Commissions are not on the order any more (one place, John Nov 13 2026): they are Agent fees. The order refuses a commission,
 * Place Order / Edit order details / Accounting point to the Agent fees box, and Accounting shows the agent fees read only. */
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { earnestView, OLD_COMMISSION_REFUSED } from '../js/data/earnest-commission.js';
import { CONTRACT_FIELDS } from '../js/data/contract-terms.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const refused = async (fn) => { try { await fn(); return ''; } catch (e) { return e.message; } };

const orderSrc = readFileSync(new URL('../js/pages/ordernew.js', import.meta.url), 'utf8');
const sheetSrc = readFileSync(new URL('../js/pages/dealaccounting-contract.js', import.meta.url), 'utf8');
const dealSrc = readFileSync(new URL('../js/pages/deal.js', import.meta.url), 'utf8');
const tcSrc = readFileSync(new URL('../js/pages/tc-overview.js', import.meta.url), 'utf8');
ok(orderSrc.includes('Earnest money &amp; agent fees <span class="muted small">(optional)</span>') && orderSrc.includes('placeOrderFeesHtml()'), 'Add New Order takes earnest money and each agent side\'s commission and admin fee, both optional');
ok(!/name="commission(Base|Percent|Additional|PaidBy)"/.test(orderSrc + sheetSrc + dealSrc) && !/name="(listing|buyer)CommissionPct"/.test(tcSrc), 'no form takes a commission for the order any more');
ok(dealSrc.includes("agentFeesPointer('modal')") && tcSrc.includes("agentFeesPointer('modal')") && sheetSrc.includes('agentFeesSummaryHtml(fees, deal.id)'), 'Edit order details and the TC contract figures point to the Agent fees box; Accounting shows the agent fees read only');
ok(sheetSrc.includes('Earnest money is optional') && !CONTRACT_FIELDS.some((f) => /commission|broker/i.test(f.key)), 'the contract sheet has no commission boxes');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem(), features: { accounting: true } });
await api.signInDev('u-proc');
const opened = await api.createDeal({
  street: '4 Shared Way', city: 'Rockville', state: 'MD', zip: '20850', openDate: '2026-11-01',
  purchasePrice: '400000', loanAmount: '320000', emdAmount: '10000', emdDueDate: '2026-11-20', emdHeldBy: 'Listing brokerage',
});
const price = opened.purchasePrice;
const loan = opened.loanAmount;
const first = await api.getContractTerms(opened.id);
ok(first.fields.emdAmount === 10000 && first.fields.emdHolder === 'Listing brokerage' && first.fields.emdDueOn === '2026-11-20', 'Accounting shows the earnest money entered on Add New Order');
ok(first.fields.salePrice == null, 'the contract sheet does not copy the sale price into its own box');

const saved = await api.saveContractTerms(opened.id, { emdAmount: '15000', emdHolder: 'CLA Title', emdDueOn: '2026-12-01' });
ok(saved.fields.emdAmount === 15000 && saved.fields.emdHolder === 'CLA Title', 'the sheet keeps the earnest money just saved');
const afterSheet = await api.getDeal(opened.id);
ok(afterSheet.purchasePrice === price && afterSheet.loanAmount === loan, 'the sale price and loan stay on the order');
ok(afterSheet.emdAmount === 15000 && afterSheet.emdDueDate === '2026-12-01' && afterSheet.emdHolder === 'CLA Title' && earnestView(afterSheet).held === 'CLA Title', 'Accounting earnest money is written onto the order');

await api.updateDeal(opened.id, { emdAmount: '8000', emdDueDate: '2026-12-15', emdHeldBy: 'Buyer brokerage' });
const fromOrder = await api.getContractTerms(opened.id);
ok(fromOrder.fields.emdAmount === 8000 && fromOrder.fields.emdHolder === 'Buyer brokerage' && fromOrder.fields.emdDueOn === '2026-12-15', 'an order edit shows on Accounting');

// one place for commissions: the order refuses one, Agent fees takes it and Accounting gets the line
ok(await refused(() => api.updateDeal(opened.id, { listingCommissionPct: 3 })) === OLD_COMMISSION_REFUSED, 'the order refuses a commission with a plain message');
ok(await refused(() => api.updateDeal(opened.id, { financial: { commissionPercent: 3 } })) === OLD_COMMISSION_REFUSED, 'a commission sent in the order\'s financial record is refused too');
await api.saveAgentFees(opened.id, 'listing', { commission: { basis: 'percent', percent: 2.5, amount: 10000 }, admin: null, other: [] }, '');
const fees = await api.getAgentFees(opened.id);
ok(fees.fees.listing.commission.amount === 10000, 'the listing commission is kept in Agent fees');
const line = (await api.getAccounting(opened.id)).entries.find((f) => f.presetKey === 'agent_fee:listing:commission:0');
ok(line && Number(line.amount) === 10000 && line.altaSection === 'commission', 'and posts to the Accounting fee ledger');
const order = await api.getDeal(opened.id);
ok(order.listingCommissionPct == null && order.buyerCommissionPct == null && !Object.keys(order.financial || {}).some((k) => /ommission/.test(k)), 'the order itself holds no commission');

await api.saveContractTerms(opened.id, { emdAmount: '', emdHolder: '', emdDueOn: '' });
const cleared = await api.getDeal(opened.id);
ok(cleared.purchasePrice === price && cleared.loanAmount === loan && cleared.emdAmount == null && cleared.emdHolder === '' && !earnestView(cleared).any, 'clearing the sheet clears the order figures and leaves the price and loan');

const refi = await api.createDeal({ street: '9 Refi Lane', city: 'Rockville', state: 'MD', zip: '20850', openDate: '2026-11-01', transactionType: 'Refinance', loanAmount: '200000' });
const refiSheet = await api.saveContractTerms(refi.id, { emdAmount: '10', emdHolder: 'CLA Title' });
const refiDeal = await api.getDeal(refi.id);
ok(refiSheet.fields.emdAmount == null && refiDeal.emdAmount == null && refiDeal.loanAmount === 200000 && !earnestView(refiDeal).any, 'a refinance keeps no earnest money');

console.log(fail ? fail + ' failed' : 'earnest accounting sync passed');
if (fail) process.exit(1);
