/* County names and the rate tables (John, Nov 15 2026: "make sure the fees are actually pulling to the portal").
 * Claude ran 23 orders through Calculate fees from CLA rates. Two came back "county not found" and got no fees at all: Virginia Beach City and
 * Hillsborough County. The rate sheet only names the counties that have a row of their own, and the portal treated every other county as unknown.
 * Now every county of MD, VA, FL and DC is known (statewide rows apply, the same as the quote calculator), and spellings that mean the same place match. */
import { proposeFees, vendoredTables, knownCounties, countyOf, countyIsKnown, COUNTY_UNKNOWN } from '../js/data/fee-engine.js';
import { countyChoice } from '../js/data/county-field.js';
import { STATE_COUNTIES } from '../js/data/state-counties.js';
import { COUNTIES } from '../js/data/zip-county-data.js';
import { autoCounty } from '../js/data/county-auto.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const R = vendoredTables();
const order = (state, county, price, loan, extra = {}) => ({ id: 'd', state, county, transactionType: 'Purchase', purchasePrice: price, loanAmount: loan, primaryResidence: 'yes', firstTimeBuyer: 'no', ...extra });
const line = (P, re) => P.lines.find((l) => re.test(l.description));
const near = (a, b) => Math.abs(a - b) < 0.01;

// ---- the county list is the whole state, taken from the Census table the portal already ships ----
for (const st of ['MD', 'VA', 'FL', 'DC']) {
  const census = COUNTIES.filter((x) => x.startsWith(st + '|')).map((x) => x.slice(3).replace(/ County$/, '').replace(/ city$/, ' City').replace(/^(James City|Charles City)$/, '$1 County')).sort((a, b) => a.localeCompare(b));
  ok(JSON.stringify(census) === JSON.stringify(STATE_COUNTIES[st]), `${st}: the county list is the Census list (${census.length} names)`);
}
ok(knownCounties(R, 'MD').length === 24 && knownCounties(R, 'VA').length === 133 && knownCounties(R, 'FL').length === 67, 'Place Order offers 24 Maryland, 133 Virginia and 67 Florida counties and cities, each once');
ok(countyChoice('FL', '').names.includes('Hillsborough') && countyChoice('VA', '').names.includes('Virginia Beach City') && countyChoice('VA', '').names.includes('Fairfax') && countyChoice('VA', '').names.includes('Fairfax City'), 'the county dropdown lists Hillsborough, Virginia Beach City, Fairfax and Fairfax City');

// ---- the two orders that got no fees ----
const vb = proposeFees(order('VA', 'Virginia Beach City', 515000, 412000));
ok(vb.lines.length > 5 && line(vb, /Hampton Roads/) && near(line(vb, /Hampton Roads/).amount, 309), 'Virginia Beach City: fees are proposed, with the Hampton Roads fee $309.00');
const hb = proposeFees(order('FL', 'Hillsborough County', 400000, 320000));
ok(hb.lines.length > 5 && line(hb, /stamps on deed/i) && near(line(hb, /stamps on deed/i).amount, 2800) && near(line(hb, /stamps on note/i).amount, 1120) && near(line(hb, /intangible/i).amount, 640), 'Hillsborough County, Florida: doc stamps on the deed $2,800.00, on the note $1,120.00, intangible tax $640.00');
ok(hb.inputs.county === 'Hillsborough' && !line(hb, /surtax/i), 'Hillsborough uses the statewide Florida rows, not Miami-Dade\'s');

// ---- spellings that mean the same place ----
const same = [['VA', 'Virginia Beach', 'Virginia Beach City'], ['VA', 'City of Virginia Beach', 'Virginia Beach City'], ['VA', 'Alexandria', 'Alexandria City'], ['VA', 'City of Fairfax', 'Fairfax City'], ['VA', 'Fairfax County', 'Fairfax'], ['VA', 'Fairfax', 'Fairfax'],
  ['VA', 'James City County', 'James City County'], ['VA', 'Richmond', 'Richmond'], ['VA', 'Richmond City', 'Richmond City'],
  ['FL', 'Miami Dade', 'Miami-Dade'], ['FL', 'Miami-Dade County', 'Miami-Dade'], ['FL', 'Saint Johns', 'St. Johns'], ['FL', 'St Lucie County', 'St. Lucie'], ['FL', 'De Soto', 'DeSoto'],
  ['MD', 'Prince Georges', "Prince George's"], ['MD', "prince george's county", "Prince George's"], ['MD', 'Saint Marys', "St. Mary's"], ['MD', 'Baltimore', 'Baltimore'], ['MD', 'Baltimore County', 'Baltimore'], ['MD', 'Baltimore City', 'Baltimore City'], ['MD', 'City of Baltimore', 'Baltimore City'],
  ['DC', '', 'District of Columbia'], ['DC', 'Washington', 'District of Columbia']];
const wrong = same.filter(([st, typed, want]) => countyOf(R, { state: st, county: typed }) !== want || !countyIsKnown(R, { state: st, county: typed }));
ok(!wrong.length, `${same.length} spellings land on the right county` + (wrong.length ? ': NOT ' + wrong.map((w) => `${w[0]} "${w[1]}" -> "${countyOf(R, { state: w[0], county: w[1] })}"`).join('; ') : ''));
ok(countyChoice('FL', 'Hillsborough County').selected === 'Hillsborough' && countyChoice('VA', 'Virginia Beach').selected === 'Virginia Beach City' && countyChoice('MD', 'Narnia').unmatched === 'Narnia', 'a saved county shows as its list name; one that is not a county is marked not matched');
// a county the ZIP fills in is always a known county
const zips = [['23451', 'VA'], ['33602', 'FL'], ['32084', 'FL'], ['22314', 'VA'], ['21201', 'MD'], ['20850', 'MD'], ['34952', 'FL'], ['23185', 'VA']]; const lost = [];
for (const [zip, st] of zips) { const a = await autoCounty({ county: '', zip, state: st }); if (!a.county || !countyIsKnown(R, { state: st, county: a.county })) lost.push(`${zip} "${a.county}"`); }
ok(!lost.length, 'a county filled from the ZIP is found in the rates (8 ZIPs)' + (lost.length ? ': NOT ' + lost.join(', ') : ''));

// ---- a made-up county is still refused: no fees on state taxes alone ----
let msg = ''; try { proposeFees(order('MD', 'Narnia', 500000, 400000)); } catch (e) { msg = e.message; }
ok(msg === COUNTY_UNKNOWN, 'a county that is not in the state is refused with "We couldn\'t find this county"');
msg = ''; try { proposeFees(order('FL', 'Montgomery', 500000, 400000)); } catch (e) { msg = e.message; }
ok(msg === COUNTY_UNKNOWN, 'a Maryland county on a Florida order is refused');
msg = ''; try { proposeFees(order('VA', '', 500000, 400000)); } catch (e) { msg = e.message; }
ok(msg === COUNTY_UNKNOWN, 'an order with no county is refused');

// ---- every county in the four states can be calculated ----
const broken = [];
for (const st of ['MD', 'VA', 'FL']) for (const c of knownCounties(R, st)) { try { const P = proposeFees(order(st, c, 450000, 360000)); if (!(P.lines.length > 5) || !P.lines.some((l) => l.cdSection === 'E' && /tax|stamps/i.test(l.description))) broken.push(`${st} ${c}: no tax line`); } catch (e) { broken.push(`${st} ${c}: ${e.message}`); } }
ok(!broken.length, 'all 224 counties and cities propose fees with at least one transfer or recordation tax' + (broken.length ? ': ' + broken.slice(0, 6).join(' | ') : ''));

// ---- a tax that comes to $0.00 says so ----
const moco = proposeFees(order('MD', 'Montgomery', 100000, 50000));
ok(!line(moco, /recordation/i) && moco.warnings.some((w) => /recordation/i.test(w) && /\$0\.00 on this file/.test(w)), 'Montgomery, $100,000, principal residence: no recordation line, and the preview says the tax is $0.00 on this file');
const moco2 = proposeFees(order('MD', 'Montgomery', 650000, 520000));
ok(line(moco2, /recordation/i) && near(line(moco2, /recordation/i).amount, 5930) && !moco2.warnings.some((w) => /\$0\.00 on this file/.test(w)), 'Montgomery, $650,000: recordation tax $5,930.00 and no $0.00 note');

console.log(fail ? fail + ' failed' : 'county match passed');
process.exit(fail ? 1 : 0);
