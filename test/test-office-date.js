/* Open date uses the office day, America/New_York. No network. */
import { readFileSync } from 'node:fs';
import { officeDate, OFFICE_TZ } from '../js/data/office-date.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

ok(OFFICE_TZ === 'America/New_York', 'the office is Eastern time');
ok(officeDate(0, new Date('2026-11-10T02:35:00Z')) === '2026-11-09', '02:35 UTC on Nov 10 is still Nov 9 in New York');
ok(officeDate(0, new Date('2026-11-10T15:00:00Z')) === '2026-11-10', '15:00 UTC is the same calendar day in New York');
ok(officeDate(1, new Date('2026-11-10T02:35:00Z')) === '2026-11-10', 'an offset walks the office calendar, not the browser clock');
ok(officeDate(-1, new Date('2026-03-08T06:30:00Z')) === '2026-03-07', '01:30 Eastern on the morning clocks change is still that office day, and the day before is the 7th');

const order = readFileSync(new URL('../js/pages/ordernew.js', import.meta.url), 'utf8');
ok(order.includes("from '../data/office-date.js?v=202611102100'") && order.includes('const today = officeDate()') && order.includes('f.openDate > officeDate()'), 'Place Order defaults and checks Open date on the office day');
const deal = readFileSync(new URL('../js/pages/deal.js', import.meta.url), 'utf8');
ok(deal.includes('max="${officeDate()}"'), 'editing an order uses the same office day as the latest open date');
const hosted = readFileSync(new URL('../js/data/supabase-adapter.js', import.meta.url), 'utf8');
ok(hosted.includes('open_date: input.openDate || officeDate()'), 'a hosted order with no open date stores the office day');
const mock = readFileSync(new URL('../js/data/mock-part-deals.js', import.meta.url), 'utf8');
ok(mock.includes('openDate > officeDate()') && mock.includes('|| officeDate()'), 'the mock refuses an open date after the office day');

console.log(fail ? fail + ' failed' : 'office date passed');
if (fail) process.exit(1);
