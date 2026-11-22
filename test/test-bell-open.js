/* FF-064 / FF-065 (Janine's video, Nov 12; Francis Feedback tickets): a bell notification click must close the menu and open the
   item for sellers and processors, including when the person is already on that page. */
import { readFileSync } from 'node:fs';
import { openNotification } from '../js/data/bell-open.js';
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const world = (hash) => { const w = { hash, renders: 0, marked: 0, dd: { hidden: false } };
  w.args = (href, extra = {}) => ({ href, dd: w.dd, getHash: () => w.hash, setHash: (h) => { w.hash = h; }, rerender: () => { w.renders += 1; }, markRead: () => { w.marked += 1; }, ...extra }); return w; };
let w = world('#/dashboard');
await openNotification(w.args('#/deals/d1/closing'));
ok(w.dd.hidden && w.hash === '#/deals/d1/closing' && w.marked === 1 && w.renders === 0, 'seller: the click closes the menu, marks it read and opens Closing appointment');
w = world('#/deals/d1/closing');
await openNotification(w.args('#/deals/d1/closing'));
ok(w.dd.hidden && w.renders === 1, 'processor already on that page: the menu closes and the page is drawn again (no stuck dropdown)');
w = world('#/dashboard');
await openNotification(w.args('#/deals/d1/tasks/t1', { markRead: () => Promise.reject(new Error('offline')) }));
ok(w.dd.hidden && w.hash === '#/deals/d1/tasks/t1', 'a failed mark-read still opens the item');
w = world('#/dashboard');
const t0 = Date.now();
await openNotification(w.args('#/deals/d1/documents', { markRead: () => new Promise(() => {}), waitMs: 50 }));
ok(w.hash === '#/deals/d1/documents' && Date.now() - t0 < 1000, 'a hung mark-read never blocks the visit');
w = world('#/orders');
await openNotification(w.args('javascript:alert(1)'));
ok(w.hash === '#/dashboard', 'a link that is not a portal page opens the dashboard instead');
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
ok(app.includes('openNotification({') && app.includes("e.preventDefault();") && !app.includes("a.addEventListener('click', async () => { const api2 = await getAdapter(); await api2.markNotificationRead(a.dataset.nid); })"), 'the bell uses openNotification instead of the old mark-only click');
console.log(fail ? `FAIL ${fail}` : 'all bell open checks passed');
process.exit(fail ? 1 : 0);
