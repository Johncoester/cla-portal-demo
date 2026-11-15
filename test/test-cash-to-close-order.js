/* QF-1 (John, Nov 15 2026, option a): sale price, deposit and loan are read from the order.
 * Francis's file MD-26-32954: price $625,000, loan $500,000, deposit $10,000, seller credit $3,000,
 * borrower closing costs $36,610.67, and $847.36 of adjustments, cash to close $149,458.03. */
import { autoEntries, closingDisclosure, ledgerTotals, manualOrderFigure } from '../js/data/accounting.js';
import { cashToCloseTable } from '../js/data/cd-pages.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const charge = (id, section, amount, side) => ({ id, kind: 'charge', description: id, altaSection: section === 'A' ? 'loanCharges' : section === 'H' ? 'misc' : 'government', cdSection: section, cdLine: '01', amount, paidBy: side, timing: 'at', poc: false, retired: false,
  split: { buyer: side === 'buyer' ? amount : 0, seller: side === 'seller' ? amount : 0, lender: 0, other: 0 } });

const deal = { fileNumber: 'MD-26-32954', transactionType: 'Purchase', purchasePrice: 625000, loanAmount: 500000, emdAmount: 10000 };
const fees = [
  charge('loan-costs', 'A', 18589, 'buyer'),
  charge('other-costs', 'E', 18021.67, 'buyer'),
  charge('seller-costs', 'H', 40965.25, 'seller'),
  { id: 'seller-credit', kind: 'credit', description: 'Seller Credit', amount: 3000, from: 'seller', to: 'buyer', altaSection: 'misc', cdSection: 'L', cdLine: '05', retired: false },
  { id: 'proration', kind: 'credit', description: 'City/Town Taxes', amount: 847.36, from: 'buyer', to: 'seller', altaSection: 'prorations', cdSection: '', retired: false },
];
const cd = closingDisclosure(deal, fees);
ok(cd.D.borrower === 18589, 'D is the borrower loan costs, $18,589.00');
ok(cd.I.borrower === 18021.67, 'I is the borrower other costs, $18,021.67');
ok(cd.J.borrower === 36610.67, 'closing costs are $36,610.67');
ok(cd.summaries.N.rows.some((r) => r.id === 'J-seller' && r.amount === 40965.25), 'N.02 seller closing costs are $40,965.25');
ok(cd.cashToClose === 149458.03, 'cash to close is $149,458.03');
const table = cashToCloseTable(deal, cd, {});
const adj = table.find((r) => r.key === 'adjustments');
ok(adj && adj.final !== -97676.58, 'page 3 does not back-solve adjustments to -$97,676.58');

const rows = autoEntries(deal);
ok(rows.map((r) => r.autoKey).join() === 'salesPrice,deposit,loanAmount' && rows.every((r) => r.auto), 'the three order lines are derived and marked from the order');
const manual = [{ id: 'typed', description: 'Sale Price of Property', kind: 'credit', amount: 1, from: 'buyer', to: 'seller', retired: false }];
ok(!autoEntries(deal, manual).some((r) => r.autoKey === 'salesPrice') && manualOrderFigure(manual, 'salesPrice'), 'a typed Sale Price line is not counted a second time');
const doubled = ledgerTotals(deal, manual);
ok(doubled.warnings.some((w) => /already on the fee ledger/.test(w)) && doubled.entries === autoEntries(deal, manual).length + 1, 'the balance check says the typed line replaced the order figure');

const missing = ledgerTotals({ transactionType: 'Purchase', purchasePrice: null, loanAmount: null, emdAmount: null }, []);
ok(missing.balanced === false && missing.issues.some((i) => /sale price/.test(i)) && missing.issues.some((i) => /loan amount/.test(i)), 'a purchase with no sale price and no loan is not called balanced');
const cash = ledgerTotals({ transactionType: 'Purchase', purchasePrice: 625000, loanAmount: 0, emdAmount: 0 }, []);
ok(cash.balanced === true && !autoEntries({ transactionType: 'Purchase', purchasePrice: 625000, loanAmount: 0 }).some((r) => r.autoKey === 'loanAmount'), 'a cash purchase with loan 0 is balanced and has no loan line');
const refi = ledgerTotals({ transactionType: 'Refinance', loanAmount: 500000 }, []);
ok(refi.balanced === true && !refi.issues.some((i) => /sale price/.test(i)) && autoEntries({ transactionType: 'Refinance', loanAmount: 500000 }).every((r) => r.autoKey === 'loanAmount'), 'a refinance needs the loan, not a sale price');

console.log(fail ? fail + ' failed' : 'cash to close order lines passed');
process.exit(fail ? 1 : 0);
