/* FF-061: Accounting is its own section under the unchanged Closing menu.
   Receipts, disbursements, balances and balancing are the test ledger, not a bank. */
import { readFileSync } from 'node:fs';
import { allEntries, ledgerTotals } from '../js/data/accounting.js';
import { bookLines, booksHtml } from '../js/pages/dealaccounting-books.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const charges = readFileSync(new URL('../js/pages/dealaccounting-charges.js', import.meta.url), 'utf8');
const buyer = app.slice(app.indexOf('const dealNav'), app.indexOf(': deal ?'));
const staff = app.slice(app.indexOf(': deal ?'), app.indexOf('const fileNav'));
ok(buyer.includes("link('closing', 'Closing appointment', 'task')") && !buyer.includes('data-nav-acct'), 'a buyer or seller keeps Closing appointment and does not get Accounting');
const side = readFileSync(new URL('../js/file-sidebar.js', import.meta.url), 'utf8');
ok(app.includes("link('closing', 'Scheduling Details', 'task')") && side.includes("link('closing', 'Scheduling Details', 'task')"), 'Scheduling Details stays in the file sidebar');
ok(!app.includes('${accountingMenu}') && staff.includes('acctCanRead(u)') && app.includes("fundingOn && !acctOn ? link('funding', 'Funding'"), 'FF-103 replaces the Accounting sub-list; Funding stays for someone who cannot see Accounting');
ok(app.includes('id="global-nav" data-global-nav hidden') && app.includes('</ul></li>${dealNav}') && app.includes('apply(false)'), 'the collapsed portal menu still starts closed and does not hide the file sidebar');
ok(!app.includes("link('accounting', 'Accounting'"), 'the old helper call is not how the file sidebar draws Accounting');

const page = readFileSync(new URL('../js/pages/dealaccounting.js', import.meta.url), 'utf8');
ok(!page.includes('qcNav(') && page.includes('data-acct-books') && page.includes("['ledger', 'Ledger']") && page.includes('data-nav-acct="funding"'), 'FF-103 stops drawing the second column; Ledger and Loan Funding stay as tabs on the accounting page');
const navFn = charges.slice(charges.indexOf('export function qcNav'), charges.indexOf('// ---------------- help rail'));
ok(navFn.includes('QC_SECTIONS.map') && !navFn.includes('Fee ledger'), 'the charge section names stay available, and Fee ledger is not a CLA tools link');

const deal = { transactionType: 'Purchase', purchasePrice: 100000, loanAmount: 50000, emdAmount: 5000, state: 'MD' };
const fees = [{ id: 'fee-1', kind: 'charge', description: 'Settlement fee', amount: 500, split: { buyer: 400, seller: 0, lender: 0, other: 0 }, timing: 'at', poc: false, retired: false, payee: 'CLA Title' }];
const entries = allEntries(deal, fees);
const totals = ledgerTotals(deal, fees);
const lines = bookLines(entries, totals);
const sum = (rows) => rows.reduce((t, r) => t + r.cents, 0);
ok(sum(lines.receipts) === Math.round(totals.receipts * 100), 'receipt lines add up to the ledger funds in (' + (sum(lines.receipts) / 100) + ')');
ok(sum(lines.disbursements) === Math.round(totals.disbursements * 100), 'disbursement lines add up to the ledger funds out (' + (sum(lines.disbursements) / 100) + ')');
ok(lines.disbursements.some((r) => r.label === 'Settlement fee' && r.who === 'CLA Title'), 'a fee going out names its payee');
ok(!totals.balanced && (totals.issues || []).length, 'a fee whose paid-by amounts do not add up is out of balance');

const text = (v) => String(v);
const empty = text(booksHtml('receipts', { entries: [], totals: { receipts: 0, disbursements: 0, balanced: false, issues: [], refi: false } }, '#/deals/deal-1/accounting'));
ok(empty.includes('data-book-empty') && empty.includes('No receipts on this file yet'), 'a file with nothing posted says there are no receipts yet');
const bad = text(booksHtml('balancing', { entries, totals }, '#/deals/deal-1/accounting'));
ok(bad.includes('data-balance="out"') && bad.includes('out of balance') && bad.includes('Open the <a href="#/deals/deal-1/accounting?v=ledger">Ledger</a>'), 'an out-of-balance file says what is wrong and points back to the Ledger');
const priced = ledgerTotals({ transactionType: 'Purchase', purchasePrice: 100000, loanAmount: 0, emdAmount: 0 }, []);
const clear = text(booksHtml('balancing', { entries: allEntries({ transactionType: 'Purchase', purchasePrice: 100000, loanAmount: 0, emdAmount: 0 }, []), totals: priced }, '#/deals/deal-1/accounting'));
ok(clear.includes('data-book="balancing"') && (clear.includes('data-book-ok') || clear.includes('data-balance-issues') || clear.includes('data-book-empty')), 'balancing still opens when the loan amount is zero');

console.log(fail ? fail + ' failed' : 'ff-061 passed');
if (fail) process.exit(1);
