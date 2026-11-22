/* FF-052 (row 183) / MF-050 (row 181), Francis, confirmed Nov 11 2:37 PM ET: a Disbursement Date with a calendar picker next to
 * Closing Date in the Loan section. Edit order details has had it since FF-071c. This is the same field on Place Order
 * (step 4, Lender & Loan), so it can be set when the order is opened. Blank = the automatic date. No network. */
import { readFileSync } from 'node:fs';
import { disbursementFor } from '../js/data/disbursement.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const page = read('js/pages/ordernew.js');
const closing = page.indexOf('<label>Closing date<input name="closingDate" type="date"></label>');
const disb = page.indexOf('<label>Disbursement date<input name="disbursementDate" type="date" data-disbursement-input>');
ok(closing > 0 && disb > closing && disb - closing < 120, 'Place Order has a Disbursement date picker right after Closing date, in Lender & Loan');
ok(page.slice(page.indexOf("panel('loan'"), disb).length > 0 && page.indexOf("panel('loan'") < disb, 'it is inside the Lender & Loan step');
ok(page.includes('Leave blank for the automatic date: the closing date for a purchase, the 4th business day after closing for a refinance.'), 'the hint says what a blank date means');
ok(page.includes("['Disbursement date', f.disbursementDate ? val(fmtDate(f.disbursementDate))") && page.includes('data-review-disbursement-auto>Automatic'), 'Review shows the date, or "Automatic" when left blank');
ok(!/name="disbursementDate"[^>]*required/.test(page), 'the date is optional');

const ad = read('js/data/supabase-adapter.js');
ok(ad.includes("...(input.disbursementDate ? { disbursement_date: input.disbursementDate } : {})"), 'the order saves the date only when one was picked (blank stays automatic)');
const mock = read('js/data/mock-part-deals.js');
ok(mock.includes("disbursementDate: dateOrNull(input.disbursementDate, 'Disbursement date')"), 'the demo data keeps it too');

// what the file then shows
ok(disbursementFor({ transactionType: 'Purchase', closingDate: '2026-12-18', disbursementDate: '2026-12-21' }).date === '2026-12-21', 'a date picked on Place Order is the one the file shows');
ok(disbursementFor({ transactionType: 'Purchase', closingDate: '2026-12-18', disbursementDate: null }).date === '2026-12-18', 'left blank on a purchase: the closing date');
ok(disbursementFor({ transactionType: 'Refinance', closingDate: '2026-11-12', disbursementDate: '' }).date === '2026-11-17', 'left blank on a refinance: the 4th business day after closing');
ok(read('js/pages/deal.js').includes('name="disbursementDate"'), 'Edit order details still has the same field next to Closing date');

console.log(fail ? fail + ' failed' : 'place order disbursement date passed');
if (fail) process.exit(1);
