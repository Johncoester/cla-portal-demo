/* Fake latency only. No hosted project, no secrets, no webhook. */
import { gatherReads, profileFlight, routeTokens } from '../js/data/read-batch.js';
import { readFileSync } from 'node:fs';

let fail = 0;
const check = (cond, message) => { if (cond) console.log('ok', message); else { fail += 1; console.log('FAIL', message); } };
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const slow = (ms, value) => async () => { await wait(ms); return value; };

const sequentialMs = async (jobs) => {
  const t0 = Date.now();
  const out = [];
  for (const job of jobs) out.push(await job());
  return { ms: Date.now() - t0, out };
};
const overlapped = await (async () => {
  const t0 = Date.now();
  const out = await gatherReads({ a: slow(40, 1), b: slow(40, 2), c: slow(40, 3), d: slow(40, 4), e: slow(40, 5), f: slow(40, 6) });
  return { ms: Date.now() - t0, out };
})();
const serial = await sequentialMs([slow(40, 1), slow(40, 2), slow(40, 3), slow(40, 4), slow(40, 5), slow(40, 6)]);
console.log('TIMING list-shaped reads', JSON.stringify({ serialMs: serial.ms, overlappedMs: overlapped.ms, reads: 6, eachMs: 40 }));
check(overlapped.out.a === 1 && overlapped.out.f === 6, 'overlapped reads keep each result');
check(overlapped.ms < serial.ms / 2, 'six independent reads finish in one round instead of six');

const dealReads = await (async () => {
  const t0 = Date.now();
  const out = await gatherReads({
    roles: slow(30, 'roles'), parties: slow(30, 'parties'), row: slow(30, 'deal'),
    contacts: slow(30, 'contacts'), sales: slow(30, 'sales'), titles: slow(30, 'titles'),
    entities: slow(30, 'entities'), source: slow(30, 'source'),
  });
  return { ms: Date.now() - t0, out };
})();
console.log('TIMING deal-shaped reads', JSON.stringify({ overlappedMs: dealReads.ms, reads: 8, eachMs: 30 }));
check(dealReads.out.row === 'deal' && dealReads.ms < 120, 'eight deal reads share one round');

const routes = routeTokens();
let painted = '';
async function paint(name, ms) {
  const token = routes.start();
  await wait(ms);
  if (!routes.isCurrent(token)) return 'stale';
  painted = name;
  return 'painted';
}
const first = paint('dashboard', 80);
const second = paint('orders', 15);
const results = await Promise.all([first, second]);
console.log('TIMING route race', JSON.stringify({ results, painted }));
check(results[0] === 'stale' && painted === 'orders', 'a slow route does not replace the newer page');

const flight = profileFlight();
let fetches = 0;
const loadA = () => flight.load({ id: 'john' }, async () => { fetches += 1; await wait(30); return { id: 'john', name: 'John' }; });
const [one, two] = await Promise.all([loadA(), loadA()]);
check(one.name === 'John' && two.name === 'John' && fetches === 1, 'one navigation shares a single profile read');
flight.begin();
await flight.load({ id: 'john' }, async () => { fetches += 1; return { id: 'john', name: 'John again' }; });
check(fetches === 2, 'the next navigation reads the profile again');
flight.clear();
const matt = await flight.load({ id: 'matt' }, async () => { fetches += 1; return { id: 'matt', name: 'Matt' }; });
check(matt.id === 'matt' && matt.name === 'Matt', 'sign-out then another person does not reuse the first profile');

const dash = readFileSync(new URL('../js/pages/dashboard.js', import.meta.url), 'utf8');
check(!dash.includes('for (const d of deals) tasksByDeal'), 'the dashboard does not walk every order for tasks before choosing the view');
check(dash.includes('needsTasks') && dash.includes('getWorkQueue({ deals })'), 'a processor reuses the order list already loaded');
const adapter = readFileSync(new URL('../js/data/supabase-adapter.js', import.meta.url), 'utf8');
check(adapter.includes('gatherReads') && adapter.includes('profile.clear()'), 'order reads overlap and sign-out drops the profile flight');
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
check(app.includes('Loading this page.') && app.includes('data-loading-note') && app.includes('Promise.all'), 'a route shows a loading line and overlaps the shell reads');
const widget = readFileSync(new URL('../js/pages/staff-feedback-widget.js', import.meta.url), 'utf8');
check(widget.includes('armReplyWatch') && widget.includes('dataset.sentAt') && widget.includes('Nothing back in this thread yet'), 'a sent thread checks again for a saved reply without inventing one');

console.log(fail ? `${fail} failed` : 'portal speed passed');
if (fail) process.exit(1);
