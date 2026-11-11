/* CRM date operators (JN-48). Fake data only. No network and no hosted database. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addMonthsClamped, dateWindow, matchesDateWindow, nyDay } from '../js/data/crm-date-filter.js';
import { filterFromValues, rowMatches } from '../js/data/crm-match.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const now = new Date('2026-11-11T15:00:00Z');
const win = (spec) => dateWindow(spec, now);
const bounds = (spec) => { const w = win(spec); return [w.mode, w.startDate, w.endDate]; };

ok(nyDay('2026-11-11T04:30:00Z') === '2026-11-10' && nyDay('2026-11-11T15:00:00Z') === '2026-11-11', 'New York day boundaries, not UTC');
ok(bounds({ op: 'today' }).join() === 'range,2026-11-11,2026-11-12', 'today is the New York civil day');
ok(bounds({ op: 'yesterday' }).join() === 'range,2026-11-10,2026-11-11', 'yesterday is the day before');
ok(bounds({ op: 'tomorrow' }).join() === 'range,2026-11-12,2026-11-13', 'tomorrow is the next day');
ok(bounds({ op: 'till_yesterday' }).join() === 'range,,2026-11-11', 'till yesterday is everything before today');
ok(bounds({ op: 'starting_tomorrow' }).join() === 'range,2026-11-12,', 'starting tomorrow has no end');
ok(bounds({ op: 'this_week' }).join() === 'range,2026-11-08,2026-11-15', 'this week starts Sunday');
ok(bounds({ op: 'prev_week' }).join() === 'range,2026-11-01,2026-11-08', 'previous week is the Sunday before');
ok(bounds({ op: 'this_month' }).join() === 'range,2026-11-01,2026-12-01', 'this month is the calendar month');
ok(bounds({ op: 'prev_month' }).join() === 'range,2026-10-01,2026-11-01', 'previous month is the calendar month before');
ok(bounds({ op: 'this_year' }).join() === 'range,2026-01-01,2027-01-01' && bounds({ op: 'next_year' }).join() === 'range,2027-01-01,2028-01-01', 'this year and next year are calendar years');
ok(bounds({ op: 'age_in', n: 1, unit: 'days' }).join() === 'range,2026-11-11,2026-11-12', 'age in 1 day is today');
ok(bounds({ op: 'age_in', n: 7, unit: 'days' }).join() === 'range,2026-11-05,2026-11-12', 'age in 7 days includes today and the six days before');
ok(bounds({ op: 'due_in', n: 1, unit: 'days' }).join() === 'range,2026-11-11,2026-11-12', 'due in 1 day is today');
ok(bounds({ op: 'prev_n', n: 1, unit: 'days' }).join() === 'range,2026-11-10,2026-11-11', 'previous 1 day is yesterday, not today');
ok(bounds({ op: 'next_n', n: 2, unit: 'weeks' }).join() === 'range,2026-11-12,2026-11-26', 'next 2 weeks start tomorrow and last 14 days');
ok(bounds({ op: 'age_in', n: 1, unit: 'months' }).join() === 'range,2026-10-11,2026-11-12', 'age in 1 month steps back one calendar month');
ok(bounds({ op: 'prev_n', n: 1, unit: 'months' }).join() === 'range,2026-10-01,2026-11-01', 'previous 1 month is the whole previous calendar month');
ok(bounds({ op: 'next_n', n: 1, unit: 'months' }).join() === 'range,2026-12-01,2027-01-01', 'next 1 month is the whole next calendar month');
ok(addMonthsClamped('2026-03-31', -1) === '2026-02-28', '31 March minus one month is 28 February in a non-leap year');
ok(dateWindow({ op: 'age_in', n: 1, unit: 'months' }, new Date('2026-03-31T16:00:00Z')).startDate === '2026-02-28', 'age in one month from 31 March uses that clamp');
ok(bounds({ op: 'on', value: '2026-01-15' }).join() === 'range,2026-01-15,2026-01-16', 'on is that one day');
ok(bounds({ op: 'before', value: '2026-01-15' }).join() === 'range,,2026-01-15', 'before stops at the start of that day');
ok(bounds({ op: 'after', value: '2026-01-15' }).join() === 'range,2026-01-16,', 'after starts the next day');
ok(bounds({ op: 'between', value: '2026-01-05', value2: '2026-01-02' }).join() === 'range,2026-01-02,2026-01-06', 'between includes both days, in either order');
ok(bounds({ op: 'not_between', value: '2026-01-02', value2: '2026-01-05' }).join() === 'outside,2026-01-02,2026-01-06', 'not between is outside that inclusive span');
ok(bounds({ op: 'empty' })[0] === 'empty' && bounds({ op: 'not_empty' })[0] === 'present', 'empty and not empty do not invent a range');
ok(matchesDateWindow('2026-11-11T04:30:00Z', { op: 'today' }, now) === false && matchesDateWindow('2026-11-11T15:00:00Z', { op: 'today' }, now) === true, 'today matches the New York day of the value');
ok(matchesDateWindow('', { op: 'empty' }, now) && !matchesDateWindow('', { op: 'not_between', value: '2026-01-01', value2: '2026-01-02' }, now), 'a blank value is empty and is not outside a range');
ok(dateWindow({ op: 'age_in', n: 0, unit: 'days' }, now).mode === 'none', 'a missing or zero count does not filter');

const legacy = filterFromValues({ createdFrom: '2026-11-01', createdTo: '2026-11-11' });
ok(legacy.dates[0].op === 'between' && rowMatches({ createdAt: '2026-11-11T15:00:00Z' }, legacy) && rowMatches({ createdAt: '2026-11-11T04:30:00Z' }, legacy) && !rowMatches({ createdAt: '2026-11-12T15:00:00Z' }, legacy), 'an old from/to pair is between, in New York');

const mig = read('supabase/migrations/20261112130000_crm_date_ops.sql');
const rb = read('supabase/rollbacks/20261112130000_crm_date_ops.sql');
ok(mig.includes("268485523c31ac857f1b1b82c76e75c1") && mig.includes('extract(dow from today)') && mig.includes('make_interval(months => n)') && mig.includes("at time zone 'America/New_York'"), 'the migration replaces the date bounds and keeps them sargable');
ok(!/private\.[a-z_]/.test(mig) && rb.includes('268485523c31ac857f1b1b82c76e75c1') && rb.includes('drop function if exists public.crm_list_page'), 'the rollback restores the previous bounds and drops the page function');
console.log('crm-date-ops-migration-sha256', createHash('sha256').update(mig).digest('hex'));
console.log('crm-date-ops-rollback-sha256', createHash('sha256').update(rb).digest('hex'));

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-admin');
const leads = (await api.listCrmLeads()).filter((l) => l.email && !l.archived);
const sample = leads[0];
const day = nyDay(sample.createdAt);
const plan = await api.crmMatchPlan({ module: 'lead', filter: { dates: [{ field: 'createdAt', op: 'on', value: day }] }, action: 'update' });
ok(plan.count >= 1 && !('rows' in plan), 'select all can use an On date and still returns a count');
const page = await api.crmListPage({ module: 'lead', filter: { dates: [{ field: 'createdAt', op: 'on', value: day }] }, page: 1, pageSize: 100 });
ok(page.total === plan.count && page.ids.length <= 100 && page.ids.includes(sample.id) && !page.rows, 'the list page returns ids and the same total, not full rows');

console.log(fail ? fail + ' failed' : 'crm date filters passed');
if (fail) process.exit(1);
