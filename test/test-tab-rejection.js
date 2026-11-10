/* Rejected tab loads and inherited tab names. No hosted project and no secrets. */
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { dealTabSpec, prefetchDealTab, useDealTabLoader } from '../js/pages/deal-tab.js?v=202611120500';
import { render as renderDeal } from '../js/pages/deal.js?v=202611120500';
import { toText } from '../js/ui.js';

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
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms) => realSetTimeout(fn, ms || 0);
window.setTimeout = globalThis.setTimeout;

let fail = 0;
const check = (cond, msg) => { if (cond) console.log('ok', msg); else { fail += 1; console.log('FAIL', msg); } };
const wait = (ms) => new Promise((r) => realSetTimeout(r, ms));
const unhandled = [];
const onUnhandled = (err) => { unhandled.push(err && err.message ? err.message : String(err)); };
process.on('unhandledRejection', onUnhandled);

['toString', 'constructor', '__proto__', 'hasOwnProperty', 'valueOf'].forEach((name) => {
  check(dealTabSpec(name) === '' && dealTabSpec(name, 'x') === '' && prefetchDealTab(name) === null, 'a built-in name is not a file tab');
});
check(dealTabSpec('tasks').includes('dealtasks.js') && dealTabSpec('tasks', '1').includes('dealtaskform.js'), 'tasks and its form keep their own modules');

let loads = 0;
const restoreFail = useDealTabLoader(() => { loads += 1; return Promise.reject(new Error('MODULE_IMPORT_FAILED')); });
const ignored = prefetchDealTab('tasks');
if (ignored) ignored.catch(() => {});
await wait(30);
let still = '';
try { await prefetchDealTab('tasks'); } catch (err) { still = err.message; }
check(unhandled.length === 0 && still === 'MODULE_IMPORT_FAILED' && loads === 2, 'a failed tab load is handled and the next attempt tries again');
restoreFail();
loads = 0;
const restoreOnce = useDealTabLoader(() => { loads += 1; return loads === 1 ? Promise.reject(new Error('MODULE_IMPORT_FAILED')) : import('../js/pages/dealtasks.js'); });
const first = prefetchDealTab('documents');
if (first) first.catch(() => {});
await wait(20);
const second = await prefetchDealTab('documents');
check(unhandled.length === 0 && loads === 2 && second && typeof second.render === 'function', 'a failed load is not kept for the next documents module');
restoreOnce();

const user = { id: 'u-processor', role: 'Processor', firstName: 'Pat', lastName: 'Lee', isAdmin: true };
const deal = { id: 'file-1', fileNumber: 'MD-26-97216', street: '1 Main', city: 'Baltimore', state: 'MD', zip: '21201', myRole: '', myRoles: [] };
let taskReads = 0;
const restoreRender = useDealTabLoader(() => Promise.reject(new Error('MODULE_IMPORT_FAILED')));
let rendered = '';
try {
  await renderDeal({ api: { readFileShell: async () => deal, listTasks: async () => { taskReads += 1; return []; }, features: {} }, user, params: { id: 'file-1', tab: 'tasks' }, refresh() {} });
} catch (err) { rendered = err.message; }
await wait(20);
check(rendered === 'MODULE_IMPORT_FAILED' && taskReads === 0 && unhandled.length === 0, 'the open tasks page still reports the module failure and does not read tasks');
restoreRender();

const { getAdapter } = await import('../js/data/adapter.js');
const api = await getAdapter();
let signedOutReads = 0;
const origTasks = api.listTasks.bind(api);
api.listTasks = async (...args) => { signedOutReads += 1; return origTasks(...args); };
const restoreSignedOut = useDealTabLoader(() => Promise.reject(new Error('MODULE_IMPORT_FAILED')));
const app = await import('../js/app.js');
await wait(40);
check(location.hash === '#/login' && signedOutReads === 0 && unhandled.length === 0 && !document.querySelector('[data-content-ready]'), 'a signed-out file address still asks for sign-in when the tab module fails');
restoreSignedOut();

await api.signInDev('u-admin');
location.hash = '#/deals/deal-1/tasks';
await app.render();
await wait(40);
const tasksText = (document.querySelector('#view') || document.body).textContent || '';
check(tasksText.includes('All Tasks') && unhandled.length === 0, 'after the failed load, tasks still open');

const restoreCurrent = useDealTabLoader((spec) => String(spec).includes('dealdocs') ? Promise.reject(new Error('MODULE_IMPORT_FAILED')) : import(spec));
location.hash = '#/deals/deal-1/documents';
await app.render();
await wait(30);
const errText = document.querySelector('.err-text');
check(!!errText && errText.textContent.includes('MODULE_IMPORT_FAILED') && unhandled.length === 0, 'the current documents page shows the module failure');
restoreCurrent();

const pending = [];
const tabDir = new URL('../js/pages/', import.meta.url);
const restoreHeld = useDealTabLoader((spec) => {
  if (String(spec).includes('dealtasks')) return new Promise((_, reject) => pending.push(reject));
  const clean = String(spec).replace(/\?v=[^./]+/, '');
  return import(new URL(clean, tabDir).href);
});
location.hash = '#/deals/deal-1/tasks';
const oldTasks = app.render();
await wait(30);
location.hash = '#/deals/deal-1/documents';
await app.render();
await wait(30);
pending.splice(0).forEach((reject) => reject(new Error('MODULE_IMPORT_FAILED')));
await oldTasks;
await wait(30);
const after = document.querySelector('#app');
const afterText = (document.querySelector('#view') || document.body).textContent || '';
check(after && after.getAttribute('data-content-ready') === 'documents' && afterText.includes('Documents & Files') && !afterText.includes('MODULE_IMPORT_FAILED') && unhandled.length === 0, 'an old tasks module failure does not replace documents');
restoreHeld();

process.off('unhandledRejection', onUnhandled);
console.log(unhandled.length ? 'unhandled ' + unhandled.join(',') : 'no unhandled rejection');
console.log(fail ? fail + ' failed' : 'tab rejection passed');
process.exit(fail ? 1 : 0);
