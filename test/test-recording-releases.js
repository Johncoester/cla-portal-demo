/* REC-CALC-3 (John, Nov 14 2026): on a purchase, the release count starts as the number of payoffs. A saved count wins. */
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { proposeFees, defaultRecordingDocs } from '../js/data/fee-engine.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const release = (P) => P.lines.find((l) => l.key === 'rec:Release');
const base = { state: 'MD', county: 'Montgomery', transactionType: 'Purchase', purchasePrice: 600000, loanAmount: 480000, primaryResidence: 'yes' };

const none = proposeFees({ ...base, payoffCount: 0 });
ok(none.inputs.docs.Release[0] === 0 && !release(none), 'a Montgomery purchase with no payoffs records no release');
const one = proposeFees({ ...base, payoffCount: 1 });
const oneLine = release(one);
ok(one.inputs.docs.Release[0] === 1 && oneLine && oneLine.description === 'Recording fees – Release' && oneLine.amount === 50 && oneLine.paidBy === 'seller', 'a Montgomery purchase with one payoff records a $50 release paid by the seller');
const two = proposeFees({ ...base, payoffCount: 2 });
const twoLine = release(two);
ok(two.inputs.docs.Release[0] === 2 && twoLine && twoLine.amount === 100 && twoLine.paidBy === 'seller', 'a Montgomery purchase with two payoffs records both releases, $50 each, paid by the seller');
const kept = proposeFees({ ...base, payoffCount: 1 }, { docs: { ...defaultRecordingDocs('purchase', 1), Release: [0, 3] } });
ok(kept.inputs.docs.Release[0] === 0 && !release(kept), 'a saved release count of 0 wins over one payoff');
const refi = proposeFees({ state: 'MD', county: 'Montgomery', transactionType: 'Refinance', loanAmount: 200000, payoffCount: 2 });
ok(refi.inputs.docs.Release[0] === 1, 'a refinance keeps the calculator starting release count');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem(), features: { accounting: true } });
await api.signInDev('u-admin');
await api.updateDeal('deal-1', { county: 'Montgomery', purchasePrice: 600000, loanAmount: 480000 });
const empty = await api.getCalculatorSetup('deal-1');
ok(empty.options.docs.Release[0] === 0, 'the form starts at no releases when the file has no payoffs');
await api.savePayoff('deal-1', { position: 1, lender: { name: 'Example Home Loans (fake)' } });
const setup = await api.getCalculatorSetup('deal-1');
ok(setup.options.docs.Release[0] === 1 && setup.options.docs.Release[1] === 3, 'one payoff fills the release count on the form');
const preview = await api.previewCalculatedFees('deal-1', setup.options);
const shown = (preview.rows || []).find((r) => r.proposed && r.proposed.description === 'Recording fees – Release');
ok(shown && shown.proposed.amount === 50 && shown.proposed.paidBy === 'seller', 'previewing that file shows the $50 seller release line');
const zero = { ...setup.options, docs: { ...setup.options.docs, Release: [0, 3] } };
await api.applyCalculatedFees('deal-1', zero, { token: (await api.previewCalculatedFees('deal-1', zero)).token, retireExamples: false });
const again = await api.getCalculatorSetup('deal-1');
ok(again.options.docs.Release[0] === 0, 'a saved release count stays 0 after the payoff is still on the file');

console.log(fail ? fail + ' failed' : 'recording releases passed');
if (fail) process.exit(1);
