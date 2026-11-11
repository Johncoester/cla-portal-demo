/* Coordinator file summaries: one call, same fields as the per-file summary. Fake data only. */
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-tc');
const open = (await api.loadDashboard()).openRows;
const ids = open.map((d) => d.id);
let calls = 0;
const orig = api.getTcFileSummaries.bind(api);
api.getTcFileSummaries = async (list) => { calls += 1; return orig(list); };
const batch = await api.getTcFileSummaries(ids);
ok(calls === 1, 'the summary method is one call for the whole list');
ok(batch.length === ids.length, 'every visible open file comes back');
for (const id of ids) {
  const one = await api.getTcFileSummary(id);
  const row = batch.find((r) => r.dealId === id);
  ok(!!row && row.outstanding === one.outstanding && JSON.stringify(row.milestones) === JSON.stringify(one.milestones) && JSON.stringify(row.emdAlta) === JSON.stringify(one.emdAlta) && JSON.stringify(row.tasks) === JSON.stringify(one.tasks), 'batch summary matches the per-file summary for ' + id);
}

const dash = readFileSync(new URL('../js/pages/dashboard.js', import.meta.url), 'utf8');
const coord = dash.slice(dash.indexOf('async function coordinator'), dash.indexOf('const agentCards'));
ok(coord.includes('getTcFileSummaries(') && !coord.includes('getTcFileSummary(') && !coord.includes('mapLimit'), 'the coordinator dashboard makes one summary call');

const sql = readFileSync(new URL('../supabase/migrations/20261113180100_tc_file_summaries.sql', import.meta.url), 'utf8');
const rollback = readFileSync(new URL('../supabase/rollbacks/20261113180100_tc_file_summaries.sql', import.meta.url), 'utf8');
ok(sql.includes('security invoker') && sql.includes('p_deal_ids uuid[]') && !/create policy/i.test(sql) && !/create index/i.test(sql), 'the function runs as the caller and adds no policy or index');
ok(rollback.includes('drop function if exists public.rpc_tc_file_summaries(uuid[])') && !/drop table/i.test(rollback), 'the rollback drops only the function');

console.log(fail ? fail + ' failed' : 'tc file summaries passed');
if (fail) process.exit(1);
