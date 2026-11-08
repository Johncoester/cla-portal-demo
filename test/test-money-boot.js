/* A failed money-input module during shell startup. No hosted project and no secrets. */
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { pathToFileURL } from 'node:url';

const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear(), key: (i) => [...m.keys()][i], get length() { return m.size; } }; };
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.localStorage = mem(); window.sessionStorage = mem();
globalThis.window = window; globalThis.document = document;
globalThis.localStorage = window.localStorage; globalThis.sessionStorage = window.sessionStorage;
globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node;
window.CLA_PORTAL_CONFIG = { mode: 'mock' };
window.CLA_WS_DEFAULT = 'everything';
const location = { hash: '#/deals/deal-1/tasks', search: '', pathname: '/', href: 'http://localhost/' };
window.location = location; globalThis.location = location;
window.history = { replaceState() {} }; globalThis.history = window.history;
window.confirm = () => false;
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms) => realSetTimeout(fn, ms || 0);
window.setTimeout = globalThis.setTimeout;

let fail = 0;
const check = (cond, msg) => { if (cond) console.log('ok', msg); else { fail += 1; console.log('FAIL', msg); } };
const unhandled = [];
process.on('unhandledRejection', (err) => { unhandled.push(err && err.message ? err.message : String(err)); });

const chain = (err) => {
  const out = [];
  let cur = err;
  for (let i = 0; cur && i < 6; i += 1) { out.push(cur.message || String(cur)); cur = cur.cause; }
  return out.join(' | ');
};
const entry = process.env.APP_ENTRY || pathToFileURL(new URL('../js/app.js', import.meta.url).pathname).href;
let message = '';
try { await import(entry); }
catch (err) {
  message = chain(err);
}
await new Promise((r) => realSetTimeout(r, 40));
const text = (document.querySelector('#app') || document.body).textContent || '';
const booted = text.includes('Loading this page.') || /sign in/i.test(text) || text.includes('All Tasks');
console.log('entry', entry);
console.log('import', message || 'resolved', 'booted', booted, 'unhandled', unhandled.length);
if (process.env.EXPECT_BOOT === '1') {
  check(!message && booted && unhandled.length === 0, 'a failed money formatter still starts the page');
  const app = await import(entry);
  const { getAdapter } = await import(new URL('./data/adapter.js', entry).href);
  const api = await getAdapter();
  await api.signInDev('u-admin');
  location.hash = '#/deals/deal-1/tasks';
  await app.render();
  await new Promise((r) => realSetTimeout(r, 50));
  const tasks = (document.querySelector('#view') || document.body).textContent || '';
  check(tasks.includes('All Tasks') && unhandled.length === 0 && !(document.querySelector('.err-text') && /MONEY_INPUT_503/.test(document.querySelector('.err-text').textContent || '')), 'tasks still open when the money formatter fails');
} else {
  check(/MONEY_INPUT_503/.test(message) && !booted, 'a failed static money formatter stops the page before tasks');
}
console.log(fail ? fail + ' failed' : 'money boot passed');
process.exit(fail ? 1 : 0);
