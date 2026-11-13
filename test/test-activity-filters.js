/* FF-071b (Janine's video, Nov 12 "CLA Portal Test - Processor and Seller Screens"; Francis Feedback ticket): on hosted files
   the Activity filters did nothing and the Who column was empty. Checks the filter rules, the query they build, and the names. */
import { readFileSync } from 'node:fs';
import { activityFilters, applyActivityFilters, hasActivityFilter, matchesActivity, withActors, actorList, localDayStart } from '../js/data/activity-filter.js';
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const A = '11111111-1111-4111-8111-111111111111'; const B = '22222222-2222-4222-8222-222222222222';
const day = (d, h) => new Date(2026, 10, d, h).toISOString();
const rows = [
  { id: 1, action: 'agreement.signed', actorId: A, createdAt: day(12, 9), detail: 'Seller signed the agreement' },
  { id: 2, action: 'client.task_completed', actorId: A, createdAt: day(12, 23), detail: 'Personal Information completed' },
  { id: 3, action: 'closing.confirmed', actorId: B, createdAt: day(11, 8), detail: 'Closing confirmed for Dec 19' },
  { id: 4, action: 'closing', actorId: null, createdAt: day(10, 8), detail: 'Closing set' },
];
const run = (f) => rows.filter((a) => matchesActivity(a, activityFilters(f))).map((a) => a.id).join(',');
ok(run({}) === '1,2,3,4' && !hasActivityFilter(activityFilters({})), 'no filter shows everything');
ok(run({ type: 'agreement' }) === '1', 'Type: agreement shows only agreement entries');
ok(run({ type: 'client' }) === '2', 'Type: client shows only client entries');
ok(run({ type: 'closing' }) === '3,4', 'Type: closing matches closing.* and a bare closing action');
ok(run({ actorId: B }) === '3', 'Person filters by who did it');
ok(run({ from: '2026-11-12' }) === '1,2', 'From keeps the whole local day, including late evening');
ok(run({ to: '2026-11-11' }) === '3,4', 'To includes that whole local day');
ok(run({ q: 'DEC 19' }) === '3', 'Contains matches text, ignoring case');
const bad = activityFilters({ type: "x';drop", actorId: 'not-a-uuid', from: '12/11/2026', to: 'soon', q: 'a'.repeat(300) });
ok(!bad.type && !bad.actorId && !bad.from && !bad.to && bad.q.length === 100, 'bad input is dropped or trimmed before the query');
// the query builder calls
const calls = []; const q = new Proxy({}, { get: (t, k) => (...args) => { calls.push([k, ...args]); return q; } });
applyActivityFilters(q, activityFilters({ type: 'client', actorId: A, from: '2026-11-12', to: '2026-11-12', q: '50%_off' }));
const has = (k, ...v) => calls.some((c) => c[0] === k && v.every((x, i) => c[i + 1] === x));
ok(has('or', 'action.eq.client,action.like.client.%'), 'type becomes an action prefix filter');
ok(has('eq', 'actor_id', A), 'person becomes actor_id');
ok(has('gte', 'created_at', localDayStart('2026-11-12')) && has('lt', 'created_at', localDayStart('2026-11-12', 1)), 'dates become a local-day range');
ok(has('ilike', 'detail', '%50\\%\\_off%'), 'text search escapes % and _');
// names
const people = new Map([[A, { name: 'Test Seller', role: 'Outside user' }], [B, { name: 'Test Processor01', role: 'Processor' }]]);
const named = withActors(rows, people, new Map([[A, 'Client-Seller']]));
ok(named[0].actorName === 'Test Seller' && named[0].actorRole === 'Seller', 'a seller shows her name and "Seller"');
ok(named[2].actorName === 'Test Processor01' && named[2].actorRole === 'Processor', 'staff show their name and CLA role');
ok(named[3].actorName === 'Portal', 'an automatic entry is labeled Portal, never blank');
ok(withActors([{ actorId: 'x' }], new Map())[0].actorName === 'Someone on this file', 'an unreadable person is never blank');
const list = actorList(named);
ok(list.length === 2 && list[0].name === 'Test Processor01' && list[1].id === A, 'the Person dropdown lists each person once, by name');
const src = readFileSync(new URL('../js/data/supabase-adapter.js', import.meta.url), 'utf8');
ok(src.includes('async listActivity(dealId, filters = {})') && src.includes('applyActivityFilters(') && !src.includes("actors: [] };"), 'the hosted adapter uses the filters and fills actors');
console.log(fail ? `FAIL ${fail}` : 'all activity filter checks passed');
process.exit(fail ? 1 : 0);
