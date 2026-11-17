/* LOAD-RETRY-1: a route that still fails after the retries replaces "Loading this page." No hosted project and no secrets. */
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';

const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear(), key: (i) => [...m.keys()][i], get length() { return m.size; } }; };
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const local = mem(); const session = mem();
window.localStorage = local; window.sessionStorage = session;
globalThis.window = window; globalThis.document = document;
globalThis.localStorage = local; globalThis.sessionStorage = session;
globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node;
window.CLA_PORTAL_CONFIG = { mode: 'mock' };
window.CLA_WS_DEFAULT = 'everything';
let hash = '#/dashboard';
let reloads = 0;
const location = {
  get hash() { return hash; },
  set hash(v) { hash = String(v); },
  search: '', pathname: '/', href: 'http://localhost/',
  reload() { reloads += 1; },
};
window.location = location; globalThis.location = location;
window.history = { replaceState() {} }; globalThis.history = window.history;

let fail = 0;
const check = (cond, msg) => { if (cond) console.log('ok', msg); else { fail += 1; console.log('FAIL', msg); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const unhandled = [];
const onUnhandled = (err) => { unhandled.push(err && err.message ? err.message : String(err)); };
process.on('unhandledRejection', onUnhandled);

const { getAdapter } = await import('../js/data/adapter.js');
const api = await getAdapter();
await api.signInDev('u-admin');
const app = await import('../js/app.js');
for (let i = 0; i < 40 && document.querySelector('[data-route-loading]'); i += 1) await wait(25);
check(!document.querySelector('[data-route-loading]'), 'the first page finishes loading');

const seen = [];
const restoreFail = app.useRouteLoader((load) => {
  seen.push(load);
  return Promise.reject(new Error('Failed to fetch dynamically imported module: orders.js'));
});
hash = '#/orders';
await app.render();
const errBox = document.querySelector('[data-route-load-error]');
const text = (document.querySelector('#view') || document.body).textContent || '';
const btn = document.querySelector('[data-route-reload]');
check(seen.length === 3 && seen[0] === seen[1] && seen[1] === seen[2], 'a failed route retries the same import twice');
check(!!errBox && errBox.getAttribute('role') === 'alert' && text.includes("This page didn't load. Check your connection and try again."), 'the loading line is replaced with what to do next');
check(!!btn && btn.textContent === 'Reload' && btn.className === 'm-btn' && btn.type === 'button', 'Reload is a normal button');
check(!document.querySelector('[data-loading-note]') && !text.includes('Loading this page.') && document.getElementById('app').getAttribute('data-route-loading') == null && document.getElementById('app').getAttribute('aria-busy') == null, 'the loading line does not stay up');
check(!text.includes('Failed to fetch') && !text.includes('503') && !text.includes('orders.js'), 'the screen does not show the technical error');
btn.click();
check(reloads === 1, 'Reload reloads the page');
restoreFail();

hash = '#/orders';
await app.render();
await wait(30);
const again = (document.querySelector('#view') || document.body).textContent || '';
check(again.includes('Open Orders') && !document.querySelector('[data-route-load-error]') && !again.includes("This page didn't load"), 'the next open of Orders still loads after a failed try');
check(unhandled.length === 0, 'a failed import is not left unhandled');

process.off('unhandledRejection', onUnhandled);
console.log(fail ? fail + ' failed' : 'route load error passed');
process.exit(fail ? 1 : 0);
