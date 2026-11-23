/* LOAD-RETRY-1: a failed dynamic import is tried again on the same URL. No hosted project and no secrets. */
import { readFileSync } from 'node:fs';
import { importWithRetry } from '../js/data/import-retry.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };

const slept = [];
const sleep = async (ms) => { slept.push(ms); };
const waits = [200, 600];

slept.length = 0;
let calls = 0;
const first = await importWithRetry(() => { calls += 1; return { ready: true }; }, { sleep, waits });
ok(first.ready === true && calls === 1 && slept.length === 0, 'a page that loads the first time is not delayed');

slept.length = 0;
calls = 0;
const args = [];
const second = await importWithRetry((...a) => {
  args.push(a);
  calls += 1;
  if (calls < 3) throw new Error('503');
  return { ready: true };
}, { sleep, waits });
ok(second.ready === true && calls === 3 && args.every((a) => a.length === 0) && slept.join() === '200,600', 'two failures then the same import succeeds, with a short wait between tries');

slept.length = 0;
calls = 0;
let thrown = '';
try {
  await importWithRetry(() => { calls += 1; throw new Error(calls === 3 ? 'still down' : '503'); }, { sleep, waits });
} catch (err) { thrown = err.message; }
ok(thrown === 'still down' && calls === 3 && slept.join() === '200,600', 'three failures give up with the last error and do not wait again');

calls = 0;
slept.length = 0;
let once = '';
try { await importWithRetry(() => { calls += 1; throw new Error('once'); }, { tries: 1, sleep, waits }); } catch (err) { once = err.message; }
ok(once === 'once' && calls === 1 && slept.length === 0, 'a single try does not wait');

const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const adapter = readFileSync(new URL('../js/data/adapter.js', import.meta.url), 'utf8');
ok(app.includes('const loadRoute = (load) => importWithRetry(() => fetchRoute(load))') && app.includes("deal: () => loadRoute(() => import('./pages/deal.js?v=202611301300'))"), 'every route import goes through the retry helper, including the deal page');
ok(adapter.includes("importWithRetry(() => import('./supabase-adapter.js?v=202611301452'))") && adapter.includes("importWithRetry(() => import('./mock-adapter.js?v=202611301452'))") && adapter.includes('loading = null'), 'the adapter retries both back ends and does not keep a failed load');
console.log(fail ? fail + ' failed' : 'import retry passed');
process.exit(fail ? 1 : 0);
