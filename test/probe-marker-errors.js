/* File-tab critical path. Local DOM and timed fakes. No hosted project and no secrets. */
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';

const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear(), key: (i) => [...m.keys()][i], get length() { return m.size; } }; };
const local = mem(); const session = mem();
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.localStorage = local; window.sessionStorage = session;
globalThis.window = window; globalThis.document = document;
globalThis.localStorage = local; globalThis.sessionStorage = session;
globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node;
window.CLA_PORTAL_CONFIG = { mode: 'mock' };
window.CLA_WS_DEFAULT = 'everything';
const location = { hash: '#/deals/deal-1/documents', search: '', pathname: '/', href: 'http://localhost/' };
window.location = location;
globalThis.location = location;
window.history = { replaceState() {} };
globalThis.history = window.history;
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms) => realSetTimeout(fn, ms || 0);
window.setTimeout = globalThis.setTimeout;

let fail = 0;
const check = (cond, msg) => { if (cond) console.log('ok', msg); else { fail += 1; console.log('FAIL', msg); } };
const wait = (ms) => new Promise((r) => realSetTimeout(r, ms));
const hold = () => { let go; const p = new Promise((r) => { go = r; }); return { p, go }; };

const started = [];
const gate = (name, fn) => async (...args) => {
  const item = { name, ...hold() };
  started.push(item);
  await item.p;
  return fn(...args);
};

const { getAdapter } = await import('../js/data/adapter.js');
const api = await getAdapter();
await api.signInDev('u-admin');
location.hash='#/deals/deal-1/tasks';
api.listTasks=async()=>{throw new Error('TASK_CONTENT_FAILED');};
const app=await import('../js/app.js');await wait(100);
const root=document.querySelector('#app');
console.log('Tasks failure: error=',document.body.textContent.includes('TASK_CONTENT_FAILED'),'marker=',root.getAttribute('data-content-ready'));
let failMarker=root.getAttribute('data-content-ready');
api.listDocuments=async()=>{throw new Error('DOC_CONTENT_FAILED');};
location.hash='#/deals/deal-1/documents';await app.render();await wait(30);
console.log('Documents failure: error=',document.body.textContent.includes('DOC_CONTENT_FAILED'),'marker=',root.getAttribute('data-content-ready'));
console.log('marker payload on invalid route');location.hash='#/deals/deal-1/PRIVATE-CUSTOM-ROUTE';await app.render();console.log(root.getAttribute('data-content-ready'));
if(failMarker!=null)process.exitCode=1;
process.exit(process.exitCode||0);
