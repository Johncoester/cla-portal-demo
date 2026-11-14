/* REC-CALC-1 (John, Nov 14 2026): a county that is not on CLA's rate sheet does not calculate.
 * A county on the list still produces the county recordation and transfer lines. */
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { COUNTY_UNKNOWN, calcSetup, proposeFees, presetChoices, countyIsKnown, vendoredTables } from '../js/data/fee-engine.js';
import { countyChoice } from '../js/data/county-field.js';
import { countyFieldHtml } from '../js/pages/county-field.js';
import { toText } from '../js/ui.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const purchase = { state: 'MD', county: 'Montgomery', transactionType: 'Purchase', purchasePrice: 600000, loanAmount: 480000, primaryResidence: 'yes', firstTimeBuyer: 'no' };
const typo = { ...purchase, county: 'Mongomery' };
const blank = { ...purchase, county: '' };

ok(countyIsKnown(vendoredTables(), purchase) === true, 'Montgomery is on the rate sheet');
ok(countyIsKnown(vendoredTables(), typo) === false, 'Mongomery is not on the rate sheet');
ok(countyIsKnown(vendoredTables(), blank) === false, 'a blank county is not on the rate sheet');

const goodSetup = calcSetup(purchase, []);
ok(goodSetup.covered === true && goodSetup.countyKnown === true && goodSetup.county === 'Montgomery', 'a listed county is ready to calculate');
const good = proposeFees(purchase);
const countyTaxes = good.lines.filter((l) => l.key === 'tax:County recordation tax' || l.key === 'tax:County transfer tax');
ok(countyTaxes.length === 2 && countyTaxes.reduce((n, l) => n + l.amount, 0) === 10910, 'a $600,000 Montgomery purchase includes $10,910 of county recordation and transfer tax');
ok(good.lines.length > countyTaxes.length, 'the rest of the fee lines are still produced');

const badSetup = calcSetup(typo, []);
ok(badSetup.covered === false && badSetup.countyKnown === false && badSetup.reason === COUNTY_UNKNOWN, 'a misspelled county shows the plain message');
let threw = '';
try { proposeFees(typo); } catch (e) { threw = e.message; }
ok(threw === COUNTY_UNKNOWN, 'a misspelled county produces no fee lines');
const presets = presetChoices(typo, {});
ok(presets.calculated.length === 0 && presets.reason === COUNTY_UNKNOWN, 'the fee preset list adds no calculated lines for a misspelled county');

const blankSetup = calcSetup(blank, []);
ok(blankSetup.countyKnown === false && blankSetup.reason === COUNTY_UNKNOWN, 'a blank county shows the same message');
let blankThrew = '';
try { proposeFees(blank); } catch (e) { blankThrew = e.message; }
ok(blankThrew === COUNTY_UNKNOWN, 'a blank county produces no fee lines');

const dc = proposeFees({ state: 'DC', county: '', transactionType: 'Purchase', purchasePrice: 600000, loanAmount: 0 });
ok(dc.lines.length > 0 && calcSetup({ state: 'DC', county: '', transactionType: 'Purchase', purchasePrice: 600000 }, []).countyKnown === true, 'the District of Columbia still calculates');

const md = countyChoice('MD', 'Mongomery');
ok(md.unmatched === 'Mongomery' && md.names.includes('Montgomery') && !md.names.includes('Miami-Dade'), 'Maryland offers only its rate-sheet counties, and a typo stays readable');
const matched = countyChoice('MD', 'Montgomery County');
ok(matched.selected === 'Montgomery' && matched.unmatched === '', 'Montgomery County matches the list name Montgomery');
const va = countyChoice('VA', '');
ok(va.names.includes('Fairfax') && !va.names.includes('Montgomery'), 'Virginia is its own list');
ok(countyChoice('', '').names.length === 0, 'no state means no county list yet');

const html = toText(countyFieldHtml('MD', 'Mongomery', '(pick from the list)'));
ok(html.includes('data-county-select') && html.includes('Mongomery (not matched)') && html.includes('value="Montgomery"') && !html.includes('<input'), 'Edit order shows the saved typo as not matched inside the county list');
const fresh = toText(countyFieldHtml('MD', '', '(optional; pick from the list, or leave blank to fill from the address or the ZIP)'));
ok(fresh.includes('Select county') && fresh.includes('>Montgomery<') && !fresh.includes('not matched'), 'a new order starts with a county list and no typo');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem(), features: { accounting: true } });
await api.signInDev('u-admin');
await api.updateDeal('deal-1', { county: 'Mongomery', purchasePrice: 600000, loanAmount: 480000 });
const setup = await api.getCalculatorSetup('deal-1');
ok(setup.countyKnown === false && setup.covered === false && setup.reason === COUNTY_UNKNOWN, 'the mock order with a misspelled county shows the message');
let previewMsg = '';
try { await api.previewCalculatedFees('deal-1', {}); } catch (e) { previewMsg = e.message; }
ok(previewMsg === COUNTY_UNKNOWN, 'preview on the mock order produces no fee lines');
await api.updateDeal('deal-1', { county: 'Montgomery' });
const again = await api.getCalculatorSetup('deal-1');
ok(again.countyKnown === true && again.covered === true, 'putting Montgomery back lets the mock order calculate');
const preview = await api.previewCalculatedFees('deal-1', again.options);
const shown = (preview.rows || []).filter((r) => r.proposed && (/^County recordation tax/.test(r.proposed.description) || /^County transfer tax/.test(r.proposed.description)));
ok(shown.length === 2, 'the mock preview for Montgomery includes both county tax lines');

console.log(fail ? fail + ' failed' : 'recording county passed');
if (fail) process.exit(1);
