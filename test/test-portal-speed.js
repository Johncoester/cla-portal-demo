/* Fake latency only. No hosted project, no secrets, no webhook. */
import { gatherReads, mapLimit, navigationReads, profileFlight, routeTokens } from '../js/data/read-batch.js';
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

let peak = 0; let active = 0;
const limited = await mapLimit([1, 2, 3, 4, 5, 6, 7, 8], 4, async (n) => {
  active += 1; peak = Math.max(peak, active); await wait(20); active -= 1; return n;
});
console.log('TIMING capped file reads', JSON.stringify({ count: limited.length, peak }));
check(limited.join(',') === '1,2,3,4,5,6,7,8' && peak <= 4, 'per-file reads stay capped at four at a time');

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

let releaseRole;
const roleGate = new Promise((resolve) => { releaseRole = resolve; });
const roles = profileFlight();
const adminP = roles.load({ id: 'same' }, async () => { await roleGate; return { id: 'same', role: 'Admin', isDemo: false }; });
roles.begin();
const demoP = roles.load({ id: 'same' }, async () => ({ id: 'same', role: 'Admin', isDemo: true }));
releaseRole();
const staleRole = await adminP;
const freshRole = await demoP;
check(staleRole == null && freshRole && freshRole.isDemo === true, 'a same-person demo change discards the older profile read');

const nav = navigationReads();
let dealFetches = 0;
nav.begin('person-a');
const dealOnce = () => nav.share('person-a', 'deal:file', async () => { dealFetches += 1; await wait(20); return { id: 'file', who: 'person-a' }; });
const [dealA, dealB] = await Promise.all([dealOnce(), dealOnce()]);
check(dealA.id === 'file' && dealB === dealA && dealFetches === 1, 'one navigation reads a file once when the page and the shell both ask');
nav.begin('person-b');
const other = await nav.share('person-b', 'deal:file', async () => { dealFetches += 1; return { id: 'file', who: 'person-b' }; });
check(other.who === 'person-b' && dealFetches === 2, 'the next person does not receive the first person\'s file');
nav.clear();
const afterSignOut = await nav.share('person-b', 'deal:file', async () => { dealFetches += 1; return { id: 'file', who: 'fresh' }; });
check(afterSignOut.who === 'fresh' && dealFetches === 3, 'sign-out drops the shared file read');
let failed = 0;
nav.begin('person-a');
await nav.share('person-a', 'deal:bad', async () => { failed += 1; throw new Error('down'); }).catch(() => null);
await nav.share('person-a', 'deal:bad', async () => { failed += 1; return 'recovered'; });
check(failed === 2, 'a failed file read is not reused');

const dash = readFileSync(new URL('../js/pages/dashboard.js', import.meta.url), 'utf8');
check(!dash.includes('for (const d of deals) tasksByDeal'), 'the dashboard does not walk every order for tasks before choosing the view');
check(dash.includes('loadDashboard') && dash.includes('Promise.all') && !dash.includes("listDeals({ status: 'All' })") && !dash.includes("listAllTasks({ fileStatus: 'All' })"), 'the dashboard loads open files and does not pull every deal and every task');
const adapter = readFileSync(new URL('../js/data/supabase-adapter.js', import.meta.url), 'utf8');
check(adapter.includes('gatherReads') && adapter.includes('profile.clear()') && adapter.includes('nav.clear()') && adapter.includes('read-batch.js?v=202611111200') && adapter.includes('supabase-staff.js?v=202611141400'), 'order reads overlap, sign-out drops the profile, and the staff module stamp is current');
check(adapter.includes('task-actions.js?v=202611141400') && adapter.includes('supabase-order-overview.js?v=202611141400') && adapter.includes('supabase-tc.js?v=202611140800') && !adapter.includes('task-actions.js?v=202611070139') && !adapter.includes('supabase-order-overview.js?v=202611071845'), 'the changed hosted modules are imported at the current stamp');
check(adapter.includes("sessionCache('roles'") && adapter.includes("sessionCache('parties'") && adapter.includes("fileRead('activity#' + fileGen"), 'file roles and agent parties stay for the session, and the activity log stays for the page');
const warm = adapter.slice(adapter.indexOf('function warmFile'));
const overview = warm.slice(warm.indexOf("tab === 'overview'"), warm.indexOf("fileRead('shell:'"));
check(!overview.includes('listActivity') && warm.includes("tab === 'activity' && a.listActivity"), 'activity_log is requested when the activity tab opens');
const appSrc = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
check(appSrc.includes("adapter.js?v=202611171030") && appSrc.includes("deal.js?v=202611171030") && appSrc.includes("dashboard.js?v=202611171030") && appSrc.includes("ordernew.js?v=202611162200") && appSrc.includes("prefetchDealTab") && !appSrc.includes('modsEarly'), 'the shell loads the current adapter and does not reuse an early module map');
const taskPage = readFileSync(new URL('../js/pages/dealtasks.js', import.meta.url), 'utf8');
const dealTab = readFileSync(new URL('../js/pages/deal-tab.js', import.meta.url), 'utf8');
const dealPage = readFileSync(new URL('../js/pages/deal.js', import.meta.url), 'utf8');
check(taskPage.includes('constants.js?v=202611101015') && dealTab.includes('dealtasks.js?v=202611171030') && dealPage.includes('prefetchDealTab') && appSrc.includes('tabFlight.catch'), 'the tasks tab loads the current task module');
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
check(app.includes('Loading this page.') && app.includes('data-loading-note') && app.includes('#view') && !app.includes('getOrderOverview(dealId).then'), 'a file tab clears the open page before the next read and does not wait on a second overview');
const widget = readFileSync(new URL('../js/pages/staff-feedback-widget.js', import.meta.url), 'utf8');
check(widget.includes('armReplyWatch') && widget.includes('dataset.sentAt') && widget.includes('Nothing back in this thread yet'), 'a sent thread checks again for a saved reply without inventing one');

console.log(fail ? `${fail} failed` : 'portal speed passed');
if (fail) process.exit(1);
