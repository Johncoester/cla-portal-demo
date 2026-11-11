/* Earnest money and commissions are optional and live on the order. Accounting reads and writes those same fields. */
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { earnestView } from '../js/data/earnest-commission.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

const orderSrc = readFileSync(new URL('../js/pages/ordernew.js', import.meta.url), 'utf8');
const sheetSrc = readFileSync(new URL('../js/pages/dealaccounting-contract.js', import.meta.url), 'utf8');
ok(orderSrc.includes('Earnest &amp; Commissions <span class="muted small">(optional)</span>'), 'Add New Order marks earnest and commissions optional');
ok(sheetSrc.includes('Earnest money and commissions are optional'), 'Accounting says earnest and commissions are optional');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem(), features: { accounting: true } });
await api.signInDev('u-proc');
const opened = await api.createDeal({
  street: '4 Shared Way', city: 'Rockville', state: 'MD', zip: '20850', openDate: '2026-11-01',
  purchasePrice: '400000', loanAmount: '320000', emdAmount: '10000', emdDueDate: '2026-11-20',
  emdHeldBy: 'Listing brokerage', commissionBase: '400000', commissionPercent: '3', commissionAdditional: '100', commissionPaidBy: 'buyer',
});
const price = opened.purchasePrice;
const loan = opened.loanAmount;
const first = await api.getContractTerms(opened.id);
ok(first.fields.emdAmount === 10000 && first.fields.emdHolder === 'Listing brokerage' && first.fields.emdDueOn === '2026-11-20', 'Accounting shows the earnest money entered on Add New Order');
ok(first.fields.buyerBrokerPercent === 3 && first.fields.buyerBrokerAmount === 12100 && first.fields.listingCommissionPercent == null && first.fields.listingCommissionAmount == null, 'the buyer commission shows on Accounting and the listing side stays blank');
ok(first.fields.salePrice == null, 'the contract sheet does not copy the sale price into its own box');

const saved = await api.saveContractTerms(opened.id, {
  emdAmount: '15000', emdHolder: 'CLA Title', emdDueOn: '2026-12-01',
  listingCommissionPercent: '2.5', listingCommissionAmount: '10000', buyerBrokerPercent: '', buyerBrokerAmount: '',
});
ok(saved.fields.emdAmount === 15000 && saved.fields.listingCommissionPercent === 2.5 && saved.fields.buyerBrokerPercent == null, 'the sheet keeps the earnest and listing commission just saved');
const afterSheet = await api.getDeal(opened.id);
const sheetView = earnestView(afterSheet);
ok(afterSheet.purchasePrice === price && afterSheet.loanAmount === loan, 'the sale price and loan stay on the order');
ok(afterSheet.emdAmount === 15000 && afterSheet.emdDueDate === '2026-12-01' && afterSheet.emdHolder === 'CLA Title', 'Accounting earnest money is written onto the order');
ok(afterSheet.listingCommissionPct === 2.5 && afterSheet.listingCommissionAmount === 10000 && afterSheet.buyerCommissionPct == null, 'Accounting commissions replace the order commission columns');
ok(sheetView.paid === 'seller' && sheetView.percent === 2.5 && sheetView.total === 10000 && sheetView.held === 'CLA Title', 'the order form reads the commission saved on Accounting');
ok(afterSheet.financial && afterSheet.financial.commissionTotal === 10000, 'the commission total stays on the order financial record');

await api.updateDeal(opened.id, { emdAmount: '8000', emdDueDate: '2026-12-15', emdHeldBy: 'Buyer brokerage', commissionBase: '400000', commissionPercent: '1', commissionAdditional: '0', commissionPaidBy: 'buyer' });
const fromOrder = await api.getContractTerms(opened.id);
ok(fromOrder.fields.emdAmount === 8000 && fromOrder.fields.emdHolder === 'Buyer brokerage' && fromOrder.fields.emdDueOn === '2026-12-15', 'an order edit shows on Accounting');
ok(fromOrder.fields.buyerBrokerPercent === 1 && fromOrder.fields.buyerBrokerAmount === 4000 && fromOrder.fields.listingCommissionPercent == null, 'the buyer commission edited on the order replaces the listing commission on Accounting');

await api.saveContractTerms(opened.id, { emdAmount: '', emdHolder: '', emdDueOn: '', listingCommissionPercent: '', listingCommissionAmount: '', buyerBrokerPercent: '', buyerBrokerAmount: '' });
const cleared = await api.getDeal(opened.id);
ok(cleared.purchasePrice === price && cleared.loanAmount === loan && cleared.emdAmount == null && cleared.emdHolder === '' && !earnestView(cleared).any, 'clearing the sheet clears the order figures and leaves the price and loan');

const refi = await api.createDeal({ street: '9 Refi Lane', city: 'Rockville', state: 'MD', zip: '20850', openDate: '2026-11-01', transactionType: 'Refinance', loanAmount: '200000' });
const refiSheet = await api.saveContractTerms(refi.id, { emdAmount: '10', emdHolder: 'CLA Title', listingCommissionPercent: '1', listingCommissionAmount: '100' });
const refiDeal = await api.getDeal(refi.id);
ok(refiSheet.fields.emdAmount == null && refiSheet.fields.listingCommissionPercent == null && refiDeal.emdAmount == null && refiDeal.loanAmount === 200000 && !earnestView(refiDeal).any, 'a refinance keeps no earnest money or commission');

console.log(fail ? fail + ' failed' : 'earnest accounting sync passed');
if (fail) process.exit(1);
