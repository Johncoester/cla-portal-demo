/* REC-CALC-2 (John, Nov 14 2026): documents to record. Defaults, validation, the docs passed to the calculator, and save/reload. */
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { defaultRecordingDocs, recordingDocsProblem, proposeFees, calcSetup, COUNTY_UNKNOWN } from '../js/data/fee-engine.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const purchase = defaultRecordingDocs('purchase');
ok(purchase.Deed[0] === 1 && purchase.Deed[1] === 3, 'a purchase starts with 1 deed of 3 pages');
ok(purchase['Deed of Trust'][0] === 1 && purchase['Deed of Trust'][1] === 30, 'a purchase with a loan starts with 1 deed of trust of 30 pages');
ok(purchase.Release[0] === 0 && purchase['Power of Attorney'][0] === 0, 'release and power of attorney start at none');
ok(defaultRecordingDocs('cash')['Deed of Trust'][0] === 0, 'a file with no loan starts with no deed of trust');
ok(defaultRecordingDocs('refi').Release[0] === 1 && defaultRecordingDocs('refi').Deed[0] === 0, 'a refinance keeps the calculator starting counts (releases are not tied to payoffs here)');

const badCount = recordingDocsProblem({ ...purchase, Deed: ['1.5', 3] });
ok(badCount && /whole number from 0 to 10/.test(badCount.message) && badCount.part === 'count', 'a fraction is not a document count');
const blank = recordingDocsProblem({ ...purchase, Release: ['', 3] });
ok(blank && /how many release documents/.test(blank.message), 'a blank count is not calculated');
const lowPages = recordingDocsProblem({ ...purchase, 'Deed of Trust': [1, 0] });
ok(lowPages && /1 to 500/.test(lowPages.message) && lowPages.part === 'pages', 'zero pages is not allowed');
const highPages = recordingDocsProblem({ ...purchase, 'Power of Attorney': [0, 501] });
ok(highPages && /1 to 500/.test(highPages.message), 'more than 500 pages is not allowed');
const highCount = recordingDocsProblem({ ...purchase, Release: [11, 3] });
ok(highCount && /0 to 10/.test(highCount.message), 'more than 10 documents is not allowed');
ok(recordingDocsProblem(purchase) == null, 'the starting counts are valid');

const deal = { state: 'MD', county: 'Montgomery', transactionType: 'Purchase', purchasePrice: 600000, loanAmount: 480000, primaryResidence: 'yes' };
const custom = { Deed: [1, 3], 'Deed of Trust': [0, 30], Release: [2, 4], 'Power of Attorney': [1, 2] };
const proposed = proposeFees(deal, { docs: custom });
ok(proposed.inputs.docs.Release[0] === 2 && proposed.inputs.docs.Release[1] === 4 && proposed.inputs.docs['Power of Attorney'][1] === 2, 'the calculator receives the counts and pages that were entered');
ok(proposed.lines.some((l) => l.key === 'rec:Release') && proposed.lines.some((l) => l.key === 'rec:Deed') && !proposed.lines.some((l) => l.key === 'rec:Deed of Trust'), 'a zero deed of trust produces no deed of trust recording line, and a release does');
const untouched = proposeFees(deal);
ok(untouched.inputs.docs['Deed of Trust'][0] === 1 && untouched.lines.some((l) => l.key === 'rec:Deed of Trust'), 'leaving the documents alone still records the deed of trust');
let refused = '';
try { proposeFees(deal, { docs: { ...custom, Deed: [1, ''] } }); } catch (e) { refused = e.message; }
ok(/pages the deed has/.test(refused), 'an invalid page count produces no fee lines');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem(), features: { accounting: true } });
await api.signInDev('u-admin');
await api.updateDeal('deal-1', { county: 'Montgomery', purchasePrice: 600000, loanAmount: 480000 });
const setup = await api.getCalculatorSetup('deal-1');
ok(setup.covered === true && setup.options.docs.Deed[0] === 1 && setup.options.docs.Deed[1] === 3 && setup.options.docs['Deed of Trust'][1] === 30, 'the form opens with the starting document counts');
const preview = await api.previewCalculatedFees('deal-1', { ...setup.options, docs: custom });
await api.applyCalculatedFees('deal-1', { ...setup.options, docs: custom }, { token: preview.token, retireExamples: false });
const again = await api.getCalculatorSetup('deal-1');
ok(again.options.docs.Release[0] === 2 && again.options.docs.Release[1] === 4 && again.options.docs['Deed of Trust'][0] === 0 && again.options.docs['Power of Attorney'][1] === 2, 'the document counts are saved and come back');
let reloadMsg = '';
try { await api.previewCalculatedFees('deal-1', { ...again.options, docs: { ...again.options.docs, Deed: [1, 0] } }); } catch (e) { reloadMsg = e.message; }
ok(/1 to 500/.test(reloadMsg), 'a saved file still refuses an invalid page count');
ok(calcSetup({ ...deal, county: 'Mongomery' }, []).reason === COUNTY_UNKNOWN, 'a misspelled county still stops the calculator');

console.log(fail ? fail + ' failed' : 'recording docs passed');
if (fail) process.exit(1);
