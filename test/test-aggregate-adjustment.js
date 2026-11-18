/* FF-096. Francis Santos, Nov 17 2026, 2:20 PM ET. On Escrow (CD section G) she entered an aggregate
 * adjustment of -$1,200. The line was saved as a normal $1,200 charge, so the section total added it
 * ($1,368.00 + $3,568.00 + $1,200.00 = $6,136.00) instead of taking it off ($3,736.00). */
import { aggregateAdjustmentPatch } from '../js/pages/dealaccounting-charges.js';
import { cleanFee, closingDisclosure, ledgerTotals, altaStatement } from '../js/data/accounting.js';
import { sectionGrid } from '../js/data/qualia-charges.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const deal = { transactionType: 'Purchase', purchasePrice: 400000, loanAmount: 320000, emdAmount: 10000, closingDate: '2026-12-15', lenderName: 'Atlantic Union Bank' };
const round = (n) => Math.round(n * 100) / 100;

const formats = ['-$1,200', '-$1,200.00', '$-1,200.00', '-1200', '-1,200.00', '($1,200)', '($1,200.00)', '(1,200.00)', '(1200)', '$1,200', '$1,200.00', '1,200.00', '1200'];
for (const typed of formats) {
  const p = aggregateAdjustmentPatch(typed);
  ok(p.amount === '1200.00' && p.reduces === true && p.paidBy === 'buyer' && p.timing === 'at' && p.poc === false && p.split === null, typed + ' is a $1,200.00 aggregate adjustment that reduces the total');
}
const blank = aggregateAdjustmentPatch('');
ok(blank.amount === '0.00' && blank.reduces === false, 'a blank aggregate adjustment clears the amount and does not reduce the total');
const zero = aggregateAdjustmentPatch('$0.00');
ok(zero.amount === '0.00' && zero.reduces === false, 'a $0.00 aggregate adjustment does not reduce the total');
for (const bad of ['abc', '-$1,200.555', '12.3.4', '($1,200.999)', '--1200']) {
  let message = '';
  try { aggregateAdjustmentPatch(bad); } catch (e) { message = e.message; }
  ok(/-\$1,200\.00/.test(message) && !/SQL|undefined|NaN/.test(message), bad + ' says to enter -$1,200.00, ($1,200.00), or $1,200.00');
}

function line(description, amount, lineNo, extra = {}) {
  return cleanFee({ kind: 'charge', description, altaSection: 'impounds', cdSection: 'G', cdLine: lineNo, payee: 'Atlantic Union Bank', amount, paidBy: 'buyer', timing: 'at', ...extra }, deal);
}
const hoi = line("Homeowner's insurance", '1368.00', '01');
const taxes = line('Property taxes', '3568.00', '03');
const savedFirst = line('Aggregate adjustment', '0', '08');
ok(!savedFirst.reduces && savedFirst.amount === 0, 'saving the description first, with no amount, does not mark a reduction');

const typed = aggregateAdjustmentPatch('-$1,200');
const agg = cleanFee({ ...typed, description: 'Aggregate adjustment', altaSection: 'impounds', cdSection: 'G', cdLine: '08', payee: 'Atlantic Union Bank' }, deal, savedFirst);
ok(agg.reduces === true && agg.amount === 1200 && agg.paidBy === 'buyer' && agg.split.buyer === 1200 && agg.timing === 'at' && !agg.poc, 'the second save of -$1,200 is stored as $1,200.00 that reduces the total');

const without = [hoi, taxes];
const withAdj = [hoi, taxes, agg];
const added = cleanFee({ kind: 'charge', description: 'Aggregate adjustment', altaSection: 'impounds', cdSection: 'G', cdLine: '08', amount: '1200.00', paidBy: 'buyer', timing: 'at' }, deal, savedFirst);
const bug = closingDisclosure(deal, [hoi, taxes, added]);
const bugG = bug.sections.find((s) => s.key === 'G');
ok(bugG.borrowerAt === 6136, 'without the reduction mark, $1,368.00 + $3,568.00 + $1,200.00 is $6,136.00');

const cd = closingDisclosure(deal, withAdj);
const G = cd.sections.find((s) => s.key === 'G');
const row = G.rows.find((r) => r.line === '08');
ok(row.borrowerAt === -1200 && row.reduces === true, 'CD section G shows the aggregate adjustment as -$1,200.00');
ok(G.borrowerAt === 3736, 'the Escrow section total is $3,736.00 ($1,368.00 + $3,568.00 - $1,200.00)');
const grid = sectionGrid(deal, cd, withAdj, 'G');
ok(grid.totals.borrowerAt === 3736 && grid.rows.find((r) => r.line === '08').borrowerAt === -1200, 'the Escrow table total is $3,736.00');

const plain = closingDisclosure(deal, without);
ok(cd.J.borrowerAt === round(plain.J.borrowerAt - 1200), 'CD closing costs (J) are $1,200.00 lower');
ok(cd.cashToClose === round(plain.cashToClose - 1200), 'cash to close is $1,200.00 lower');

const t0 = ledgerTotals(deal, without);
const t1 = ledgerTotals(deal, withAdj);
ok(t1.buyerDebits === round(t0.buyerDebits - 1200), 'the borrower\'s debits are $1,200.00 lower');
ok(t1.dueFromBuyer === round(t0.dueFromBuyer - 1200), 'the amount due from the borrower is $1,200.00 lower');

const alta = altaStatement(deal, withAdj, 'combined');
const imp = alta.sections.find((s) => s.key === 'impounds');
const altaRow = imp.rows.find((r) => r.description === 'Aggregate adjustment');
ok(altaRow.buyerDebit === -1200, 'the settlement statement shows -$1,200.00 on the borrower');
ok(alta.subtotals.buyerDebit === t1.buyerDebits, 'the settlement statement borrower total uses the same $1,200.00 reduction');

const paren = cleanFee({ ...aggregateAdjustmentPatch('($1,200.00)'), description: 'Aggregate adjustment', altaSection: 'impounds', cdSection: 'G', cdLine: '08', payee: 'Atlantic Union Bank' }, deal);
const dollars = cleanFee({ ...aggregateAdjustmentPatch('$1,200.00'), description: 'Aggregate adjustment', altaSection: 'impounds', cdSection: 'G', cdLine: '08', payee: 'Atlantic Union Bank' }, deal);
ok(paren.reduces && dollars.reduces && paren.amount === 1200 && dollars.amount === 1200, '($1,200.00) and $1,200.00 are the same $1,200.00 reduction');
const cdParen = closingDisclosure(deal, [hoi, taxes, paren]);
ok(cdParen.sections.find((s) => s.key === 'G').borrowerAt === 3736, '($1,200.00) also makes the Escrow total $3,736.00');

const refiDeal = { transactionType: 'Refinance', loanAmount: 320000, closingDate: '2026-12-15' };
const refiAgg = cleanFee({ ...aggregateAdjustmentPatch('-$1,200.00'), description: 'Aggregate adjustment', altaSection: 'impounds', cdSection: 'G', cdLine: '08' }, refiDeal);
const refiPlain = ledgerTotals(refiDeal, [line("Homeowner's insurance", '1368.00', '01')]);
const refiWith = ledgerTotals(refiDeal, [line("Homeowner's insurance", '1368.00', '01'), refiAgg]);
ok(refiWith.buyerDebits === round(refiPlain.buyerDebits - 1200), 'a refinance borrower total is also $1,200.00 lower');

console.log(fail ? fail + ' failed' : 'aggregate adjustment passed');
process.exit(fail ? 1 : 0);
