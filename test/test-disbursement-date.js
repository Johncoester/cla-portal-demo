/* FF-071 #23 (Janine's video, Nov 12 "CLA Portal Test - Processor and Seller Screens"; Francis confirm-back Nov 12 6:14 PM ET) and FF-052 / MF-050:
   File Overview shows the disbursement date. Purchase = closing date. Refinance with rescission = 4th business day after closing
   (Sundays and federal holidays skipped, Saturdays count). The processor can set a different date. */
import { readFileSync } from 'node:fs';
import { disbursementFor, refinanceDisbursement, federalHolidays, isRescissionBusinessDay } from '../js/data/disbursement.js';
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
ok(disbursementFor({ transactionType: 'Purchase', closingDate: '2026-12-19' }).date === '2026-12-19', 'purchase: disbursement is the closing date');
ok(refinanceDisbursement('2026-11-12') === '2026-11-17', 'refinance closing Thu Nov 12: Fri, Sat, (Sun skipped), Mon are the 3 days; disburse Tue Nov 17');
ok(refinanceDisbursement('2026-11-06') === '2026-11-12', 'Veterans Day (Wed Nov 11) is skipped');
ok(refinanceDisbursement('2026-12-23') === '2026-12-29', 'Christmas and the Sunday are skipped, the Saturday counts');
ok(refinanceDisbursement('2026-07-01') === '2026-07-07', 'July 4 on a Saturday is skipped on the day itself');
ok(refinanceDisbursement('2026-11-25') === '2026-12-01', 'Thanksgiving (4th Thursday) is skipped');
const h = federalHolidays(2027);
ok(['2027-01-01', '2027-01-18', '2027-02-15', '2027-05-31', '2027-06-19', '2027-07-04', '2027-09-06', '2027-10-11', '2027-11-11', '2027-11-25', '2027-12-25'].every((x) => h.has(x)) && h.size === 11, 'the 11 federal holidays for 2027');
ok(isRescissionBusinessDay('2026-11-14') && !isRescissionBusinessDay('2026-11-15'), 'Saturday counts, Sunday does not');
const refi = disbursementFor({ transactionType: 'Refinance', closingDate: '2026-11-12' });
ok(refi.date === '2026-11-17' && refi.source === 'auto' && /4th business day/.test(refi.note), 'a refinance file shows the automatic date and says how it was worked out');
const set = disbursementFor({ transactionType: 'Refinance', closingDate: '2026-11-12', disbursementDate: '2026-11-12' });
ok(set.date === '2026-11-12' && set.source === 'set', 'a date the processor set wins (e.g. a refinance with no right of rescission)');
ok(disbursementFor({ transactionType: 'Purchase', scheduledClosing: { at: '2026-12-19T17:00' } }).date === '2026-12-19', 'with no closing date on the order, the scheduled closing day is used');
ok(disbursementFor({ transactionType: 'Purchase' }).date === '', 'no closing yet: not set');
const page = readFileSync(new URL('../js/pages/deal.js', import.meta.url), 'utf8');
ok(page.includes('<span data-disbursement=') && page.includes('name="disbursementDate"'), 'File Overview shows it, and Edit order details has the override next to Closing date');
const ad = readFileSync(new URL('../js/data/supabase-adapter.js', import.meta.url), 'utf8');
ok(ad.includes("disbursementDate: 'disbursement_date'") && ad.includes("'disbursement_date', 'emd_due_date'"), 'the override saves as a date (blank = automatic)');
const mig = readFileSync(new URL('../supabase/migrations/20261117020000_deal_disbursement_date.sql', import.meta.url), 'utf8');
ok(/add column if not exists disbursement_date date/.test(mig) && !/create policy|grant /i.test(mig), 'the migration only adds the date column (no policy or grant changes)');
console.log(fail ? `FAIL ${fail}` : 'all disbursement date checks passed');
process.exit(fail ? 1 : 0);
