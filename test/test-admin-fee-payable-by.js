/* FF-093: Admin fee Payable by on the file. Buyer, Seller, or Split (Buyer and Seller).
 * Split is half and half. An odd cent goes to the seller. Fake data only. */
import assert from 'node:assert/strict';
import { readAgentFees, adminHalves, feeText } from '../js/data/agent-fees.js';
import { formHtml, sideHtml } from '../js/pages/agent-fees-box.js';
import { agentFeesPart } from '../js/data/mock-part-agent-fees.js';
import { altaStatement, closingDisclosure } from '../js/data/accounting.js';
import { toText } from '../js/ui.js';

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log(`ok ${name}`); };
const throwsMsg = (fn, msg) => assert.throws(fn, (e) => e.message === msg, msg);

ok('a blank Payable by still uses the side default', () => {
  assert.equal(readAgentFees({ adminAmount: '395' }, { side: 'buyer', price: 1 }).admin.payer, 'buyer');
  assert.equal(readAgentFees({ adminAmount: '395' }, { side: 'listing', price: 1 }).admin.payer, 'seller');
  assert.equal(readAgentFees({ adminAmount: '395', adminPayer: 'seller' }, { side: 'buyer', price: 1 }).admin.payer, 'seller');
  assert.equal(readAgentFees({ adminAmount: '395', adminPayer: 'seller' }, { side: 'buyer', price: 1 }).admin.splitBuyer, undefined);
});

ok('$395 split is $197.50 and $197.50, and an odd cent goes to the seller', () => {
  assert.deepEqual(adminHalves(395), { splitBuyer: 197.5, splitSeller: 197.5 });
  const even = readAgentFees({ adminAmount: '395', adminPayer: 'split' }, { side: 'listing', price: 1 }).admin;
  assert.equal(even.payer, 'split');
  assert.equal(even.splitBuyer, 197.5);
  assert.equal(even.splitSeller, 197.5);
  const saved = readAgentFees({ adminAmount: '$10.01', adminPayer: 'split' }, { side: 'buyer', price: 1 }).admin;
  assert.equal(saved.amount, 10.01);
  assert.equal(saved.splitBuyer, 5);
  assert.equal(saved.splitSeller, 5.01);
  assert.equal(adminHalves(0.01).splitBuyer, 0);
  assert.equal(adminHalves(0.01).splitSeller, 0.01);
  assert.equal(feeText('admin', saved), '$10.01 (split: buyer $5.00, seller $5.01)');
});

ok('Payable by must be one of the three choices, and an other fee cannot be split', () => {
  throwsMsg(() => readAgentFees({ adminAmount: '10', adminPayer: 'lender' }, { side: 'listing', price: 1 }),
    'Payable by must be Buyer, Seller, or Split (Buyer and Seller).');
  throwsMsg(() => readAgentFees({ other: [{ description: 'Referral', amount: '10', paidTo: 'Example Co', payer: 'split' }] }, { side: 'listing', price: 1 }),
    'Paid by must be Buyer or Seller.');
});

ok('the Admin fee section offers Buyer, Seller, and Split (Buyer and Seller)', () => {
  const blank = toText(formHtml('listing', { commission: { percent: 3, amount: 100, payer: 'seller' }, admin: { amount: 395, payer: 'seller' } }, { price: 10000 }));
  assert.match(blank, /Payable by/);
  assert.match(blank, /Split \(Buyer and Seller\)/);
  const split = String(formHtml('buyer', { admin: { amount: 10.01, payer: 'split', splitBuyer: 5, splitSeller: 5.01 } }, { price: 10000 }));
  assert.match(split, /name="adminPayer"/);
  assert.match(split, /value="split"[^>]*selected/);
  assert.match(split, /data-af-admin-split/);
  assert.doesNotMatch(split, /data-af-admin-split[^>]*hidden/);
  const shown = toText(sideHtml('buyer', { admin: { amount: 10.01, payer: 'split', splitBuyer: 5, splitSeller: 5.01 }, other: [], rows: 1 }, 'read'));
  assert.match(shown, /\$10\.01/);
  assert.match(shown, /split: buyer \$5, seller \$5\.01/);
});

const data = { deals: [{ id: 'd1', purchasePrice: 300000, loanAmount: 0, transactionType: 'Purchase', tcUserId: null, closingDate: '2026-12-01' }], participants: [
  { dealId: 'd1', contactId: 'c-ba', role: 'Buyer Agent' }],
  contacts: [{ id: 'c-ba', profileId: 'ba', company: 'Example Realty' }], accountingFees: [], agentFeeLedger: [] };
const people = { pro: { id: 'pro', role: 'Processor' } };
const part = agentFeesPart({ load: () => data, save() {}, nid: (p) => `${p}-1`, needUser: () => people.pro, dealOr404: (u, id) => data.deals.find((d) => d.id === id),
  fileRoles: () => ['Processor'], teamAgentIds: () => new Set(), isStaffView: () => true, nameOf: (id) => id, now: () => '2026-11-17T18:00:00Z', fail: (m) => { throw new Error(m); }, clone: (x) => JSON.parse(JSON.stringify(x)) });

const run = async () => {
  await part.saveAgentFees('d1', 'buyer', { commission: null, admin: { amount: 10.01, payer: 'split', splitBuyer: 5, splitSeller: 5.01 }, other: [] });
  let v = await part.getAgentFees('d1');
  assert.equal(v.fees.buyer.admin.payer, 'split');
  assert.equal(v.fees.buyer.admin.splitBuyer, 5);
  assert.equal(v.fees.buyer.admin.splitSeller, 5.01);
  v = await part.getAgentFees('d1');
  assert.equal(v.fees.buyer.admin.amount, 10.01, 'the choice is still there on the next read');
  const line = data.accountingFees.find((f) => f.presetKey === 'agent_fee:buyer:admin:0' && !f.retired);
  assert.equal(line.paidBy, 'split');
  assert.equal(line.split.buyer, 5);
  assert.equal(line.split.seller, 5.01);
  const alta = altaStatement(data.deals[0], data.accountingFees);
  const comm = alta.sections.find((x) => x.key === 'commission');
  const row = comm.rows.find((r) => /Admin fee/.test(r.description));
  assert.equal(row.buyerDebit, 5);
  assert.equal(row.sellerDebit, 5.01);
  const cd = closingDisclosure(data.deals[0], data.accountingFees);
  const H = cd.sections.find((x) => x.key === 'H');
  const cdRow = H.rows.find((r) => /Admin fee/.test(r.description));
  assert.equal(cdRow.borrowerAt, 5);
  assert.equal(cdRow.sellerAt, 5.01);
  n += 1;
  console.log('ok a saved split stays on the file and lands half on each column');
  console.log(`\n${n} admin fee payable-by checks passed`);
};
run().catch((e) => { console.error('FAIL', e); process.exit(1); });
