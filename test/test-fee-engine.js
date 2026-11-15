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

console.log(fail ? fail + ' failed' : 'fee engine passed');
process.exit(fail ? 1 : 0);
