/* REC-CALC-4 (John, Nov 14 2026): the portal's fee numbers must match the calculator's own calc()
 * on the saved Nov 2 copy. No network. A failed read of the live sheet keeps that copy. */
import * as C from '../js/data/vendor/cla-calculator/calc-core.js';
import { FALLBACK_RATE_NOTE, formatRateLoaded, loadCalculatorRates, proposeFees, resetLiveRates } from '../js/data/fee-engine.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const money = (n) => Math.round((Number(n) || 0) * 100) / 100;
const purchase = (state, county, price, loan) => ({ state, county, transactionType: 'Purchase', purchasePrice: price, loanAmount: loan, primaryResidence: 'yes' });

function agree(label, deal) {
  let P;
  try { P = proposeFees(deal); } catch (e) { ok(false, `${label} could not be calculated: ${e.message}`); return; }
  const q = P.calc;
  const buyer = money(P.lines.reduce((t, l) => t + l.split.buyer, 0));
  const seller = money(P.lines.reduce((t, l) => t + l.split.seller, 0));
  const missing = [];
  for (const l of q.lines || []) {
    const amt = money(l.b + (deal.transactionType === 'Refinance' ? 0 : l.s));
    if (!(amt > 0)) continue;
    if (!P.lines.some((x) => x.calcItem === l.item && money(x.amount) === amt)) missing.push(`${l.item} $${amt}`);
  }
  const extra = P.lines.filter((x) => !(q.lines || []).some((l) => l.item === x.calcItem)).map((x) => x.description);
  ok(buyer === money(q.buyer) && seller === money(q.seller) && P.totals.total === money(q.total) && !missing.length && !extra.length,
    `${label}: portal matches the calculator (buyer $${buyer}, seller $${seller}${missing.length ? '; missing ' + missing.join(', ') : ''}${extra.length ? '; extra ' + extra.join(', ') : ''})`);
}

agree('Montgomery', purchase('MD', 'Montgomery', 600000, 480000));
agree("Prince George's", purchase('MD', "Prince George's", 500000, 400000));
agree('Baltimore City', purchase('MD', 'Baltimore City', 450000, 360000));
agree('DC under $400k', purchase('DC', 'District of Columbia', 350000, 280000));
agree('DC over $400k', purchase('DC', 'District of Columbia', 500000, 400000));
agree('Fairfax', purchase('VA', 'Fairfax', 700000, 560000));
agree('MD refinance', { state: 'MD', county: 'Montgomery', transactionType: 'Refinance', loanAmount: 250000 });

ok(formatRateLoaded(new Date('2026-11-02T20:04:00Z')) === 'Nov 2, 2026, 3:04 PM ET', 'the loaded time is shown in Eastern time');

resetLiveRates();
const down = await loadCalculatorRates(async () => { throw new Error('offline'); }, { fresh: true });
const frozen = proposeFees(purchase('MD', 'Montgomery', 600000, 480000));
const fell = proposeFees(purchase('MD', 'Montgomery', 600000, 480000), {}, down.tables, down.source);
ok(!down.live && down.note === FALLBACK_RATE_NOTE && fell.totals.total === frozen.totals.total, 'a sheet that cannot be reached keeps the saved Nov 2 copy and says so');

const csv = (rows) => rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
resetLiveRates();
const live = await loadCalculatorRates(async (url) => {
  const tab = decodeURIComponent(String(url).split('sheet=')[1] || '');
  const rows = C.SNAP[tab];
  if (!rows) return { ok: false, status: 404, text: async () => '' };
  return { ok: true, status: 200, text: async () => csv(rows) };
}, { fresh: true });
ok(live.live && /^Rates from the live sheet, loaded .+ ET$/.test(live.note), 'a readable sheet says when the rates were loaded: ' + live.note);
const fromSheet = proposeFees(purchase('MD', 'Montgomery', 600000, 480000), {}, live.tables, live.source);
ok(fromSheet.totals.total === frozen.totals.total && fromSheet.totals.total > 0, 'the live sheet, when it is the saved copy, prices Montgomery the same way');

// John, Nov 15 2026 (Lodestar test VA-24, VA-17): a Virginia refinance that pays nothing off is a new loan (full rate); Hampton Roads fee on Virginia Beach.
const vaRefi = (payoff) => proposeFees({ state: 'VA', county: 'Arlington', loanAmount: 350000, transactionType: 'Refinance' }, { payoff })
  .lines.filter((l) => l.key.startsWith('tax:')).reduce((a, l) => a + l.amount, 0);
ok(Math.abs(vaRefi(0) - 1166.67) < 0.02, 'a Virginia refinance with no payoff is taxed at the full rate ($1,166.67): ' + vaRefi(0));
ok(Math.abs(vaRefi(300000) - 840) < 0.02, 'a Virginia refinance with a payoff keeps the refinance rate ($840): ' + vaRefi(300000));
const hr = proposeFees(purchase('VA', 'Virginia Beach City', 515000, 412000)).lines.find((l) => /Hampton Roads/.test(l.description));
ok(hr && Math.abs(hr.amount - 309) < 0.01 && hr.paidBy === 'seller', 'Virginia Beach shows the Hampton Roads fee, $309, paid by the seller');

// John, Nov 16 2026: a Maryland refinance with a payoff warns that the new-money-only tax needs the original mortgagor affidavit.
const mdRefi = proposeFees({ state: 'MD', county: 'Montgomery', loanAmount: 500000, transactionType: 'Refinance' }, { payoff: 350000 });
ok(mdRefi.warnings.some((w) => /original mortgagor affidavit/.test(w)), 'a Maryland refinance with a payoff shows the original mortgagor note');

// John, Nov 16 2026 (Melissa Gamble; closed files MD-26-32159, MD-26-32155): Maryland tax on the part of the loan above the price, paid by the buyer.
const above = (county, price, loan, o = {}) => proposeFees({ state: 'MD', county, transactionType: 'Purchase', purchasePrice: price, loanAmount: loan, primaryResidence: 'yes' }, o).lines.filter((l) => /on loan above price/.test(l.description));
const pgA = above("Prince George's", 525000, 536287);
ok(pgA.length === 2 && Math.abs(pgA.reduce((a, l) => a + l.split.buyer, 0) - 221.27) < 0.01 && pgA.every((l) => l.paidBy === 'buyer' && /loan .* − price/.test(l.calculation)),
  "MD-26-32159: Prince George's loan $11,287 above the price: recordation $63.25 + transfer $158.02, buyer pays, explained");
ok(above("Prince George's", 270000, 372000, { occ: false }).reduce((a, l) => a + l.amount, 0) === 1989, 'MD-26-32155: $102,000 above the price: $561 + $1,428');
ok(above('Montgomery', 600000, 480000).length === 0, 'no extra tax when the loan is below the price');
agree('PG loan above price', purchase('MD', "Prince George's", 525000, 536287));

// Pennsylvania and West Virginia (Nov 23 2026, calculator PR #3)
{ const pa = proposeFees(purchase('PA', 'York', 400000, 320000)), sum = (re, who) => money(pa.lines.filter((l) => re.test(l.description) && (!who || l.paidBy === who)).reduce((a, l) => a + l.amount, 0));
  ok(sum(/State realty transfer/) === 4000 && sum(/Local realty transfer/) === 4000, 'PA York $400k: 1% state + 1% local realty transfer tax: ' + sum(/State realty/) + ' / ' + sum(/Local realty/));
  ok(pa.lines.some((l) => /Owner's Title Policy/.test(l.description)), 'PA prices an owner\'s policy (TIRBOP rates)');
  const phl = proposeFees(purchase('PA', 'Philadelphia', 400000, 320000)).lines.filter((l) => /Local realty transfer/.test(l.description)).reduce((a, l) => a + l.amount, 0);
  ok(money(phl) === 14312, 'PA Philadelphia local transfer tax 3.578% ($14,312): ' + phl);
  const pgh = proposeFees(purchase('PA', 'Allegheny', 400000, 320000), { area: 'Pittsburgh' }).lines.filter((l) => /Local realty transfer/.test(l.description)).reduce((a, l) => a + l.amount, 0);
  ok(money(pgh) === 16000, 'PA Pittsburgh municipality rate 4% when the area is passed: ' + pgh);
  const wv = proposeFees(purchase('WV', 'Berkeley', 400000, 320000)), ex = money(wv.lines.filter((l) => /excise/i.test(l.description) && l.paidBy === 'seller').reduce((a, l) => a + l.amount, 0));
  ok(ex === 3080, 'WV Berkeley seller excise $3,080 on $400k: ' + ex); }
console.log(fail ? fail + ' failed' : 'fee engine passed');
process.exit(fail ? 1 : 0);
