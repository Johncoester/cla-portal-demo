/* REC-CALC-9 (John, Nov 24 2026: "connect the calculator fees to the portal"): fees fill in by themselves when a file is opened, once the order has
 * the basics (state, county, purchase or refinance, price or loan, and principal residence / first-time buyer where the state asks). A purchase starts
 * with one release (payoffs aren't known yet). It runs again when one of those answers changes; lines changed by hand are kept. */
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { autoFillCheck, vendoredTables } from '../js/data/fee-engine.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const R = vendoredTables();

// ---- what the order must have ----
const md = { state: 'MD', county: 'Montgomery', transactionType: 'Purchase', purchasePrice: 600000, loanAmount: 480000, primaryResidence: 'yes', firstTimeBuyer: 'no', payoffCount: 0 };
ok(autoFillCheck(md, [], R).ready && autoFillCheck(md, [], R).due === 'first', 'a Maryland purchase with every answer is ready and due on its first open');
const noFthb = autoFillCheck({ ...md, firstTimeBuyer: '' }, [], R);
ok(!noFthb.ready && noFthb.missing.join() === 'first-time buyer (yes / no)' && /fill in by themselves once the order has: first-time buyer/.test(noFthb.reason), 'Maryland waits for the first-time buyer answer and says so');
const noOcc = autoFillCheck({ ...md, primaryResidence: '' }, [], R);
ok(!noOcc.ready && noOcc.missing.includes('primary residence (yes / no)'), 'Maryland waits for the primary residence answer');
ok(!autoFillCheck({ ...md, county: '' }, [], R).ready && autoFillCheck({ ...md, county: '' }, [], R).missing.includes('county'), 'no county: waits');
ok(autoFillCheck({ ...md, county: 'Narnia' }, [], R).missing.includes('a county from the list'), 'a county that is not on the list: waits');
ok(autoFillCheck({ ...md, purchasePrice: 0 }, [], R).missing.includes('purchase price'), 'no price: waits');
ok(autoFillCheck({ ...md, transactionType: '' }, [], R).missing.includes('purchase or refinance'), 'no transaction type: waits');
const refi = autoFillCheck({ state: 'MD', county: 'Montgomery', transactionType: 'Refinance', loanAmount: 300000, primaryResidence: 'yes' }, [], R);
ok(refi.ready, 'a Maryland refinance needs no first-time buyer answer');
const va = autoFillCheck({ state: 'VA', county: 'Fairfax', transactionType: 'Purchase', purchasePrice: 500000, loanAmount: 400000 }, [], R);
ok(va.ready, 'Virginia (and FL, PA, WV, MI) asks no residence questions, so it is ready without them');
ok(!autoFillCheck({ ...md, state: 'TX' }, [], R).ready, 'a state CLA does not quote never fills');
ok(autoFillCheck(md, [], R).options.docs.Release[0] === 1, 'a purchase with no payoffs on file starts with one release');
ok(autoFillCheck({ ...md, payoffCount: 2 }, [], R).options.docs.Release[0] === 2, 'payoffs on file set the release count');

ok(!autoFillCheck({ ...md, status: 'Closed' }, [], R).ready && /closed/.test(autoFillCheck({ ...md, status: 'Closed' }, [], R).reason), 'a closed file never fills by itself');
const hand = [{ id: 'f1', description: "Owner's policy", altaSection: 'title', amount: 900 }];
const h = autoFillCheck(md, hand, R);
ok(!h.ready && /entered by hand/.test(h.reason), 'a file with title fees typed in by hand is left alone (Calculate fees compares first)');
ok(autoFillCheck(md, [{ id: 'f2', description: 'Commission', altaSection: 'commission', amount: 9000 }], R).ready, 'other hand fees (commission) do not stop it');

// ---- the mock portal ----
const api = createMockAdapter({ storage: mem(), sessionStorage: mem(), features: { accounting: true } });
await api.signInDev('u-admin');
await api.updateDeal('deal-1', { state: 'MD', county: 'Montgomery', transactionType: 'Purchase', purchasePrice: 600000, loanAmount: 480000, primaryResidence: 'yes', firstTimeBuyer: '' });
const wait = await api.autoFillFees('deal-1');
ok(!wait.applied && !wait.ready && wait.missing.includes('first-time buyer (yes / no)'), 'the file waits while the first-time buyer answer is blank');
await api.updateDeal('deal-1', { firstTimeBuyer: 'no' });
const first = await api.autoFillFees('deal-1');
ok(first.applied && first.added > 5 && first.due === 'first', `opening the file fills in its fees (${first.added} lines)`);
const acc = await api.getAccounting('deal-1');
const calc = acc.entries.filter((e) => e.calc && !e.retired);
ok(calc.some((e) => /Owner's Title Policy/.test(e.description)) && calc.some((e) => /Recording fees – Deed$/.test(e.description)) && calc.some((e) => /Recording fees – Release/.test(e.description)) && calc.some((e) => /transfer tax/i.test(e.description)),
  'premiums, recording (with one release) and transfer taxes are on the ledger');
const again = await api.autoFillFees('deal-1');
ok(!again.applied && again.ready && !again.due, 'opening it again changes nothing');
await api.updateDeal('deal-1', { purchasePrice: 650000 });
const changed = await api.autoFillFees('deal-1');
ok(changed.applied && changed.updated > 0 && /price/.test(changed.due), `a new price fills the fees again (${changed.updated} updated)`);
const owner = (await api.getAccounting('deal-1')).entries.find((e) => e.calc && !e.retired && /Owner's Title Policy/.test(e.description));
await api.updateAccountingFee(owner.id, { amount: 1234.56 });
await api.updateDeal('deal-1', { loanAmount: 500000 });
const kept = await api.autoFillFees('deal-1');
const owner2 = (await api.getAccounting('deal-1')).entries.find((e) => e.id === owner.id);
ok(kept.applied && owner2.amount === 1234.56, 'a line changed by hand is kept when the fees fill in again');

console.log(fail ? fail + ' failed' : 'auto fill fees passed');
process.exit(fail ? 1 : 0);
