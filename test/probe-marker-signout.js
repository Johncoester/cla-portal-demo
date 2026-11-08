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
location.hash='#/deals/deal-1/tasks';let gen=0;api.authGeneration=()=>gen;
let finishTasks;api.listTasks=()=>new Promise(r=>finishTasks=r);
const app=await import('../js/app.js');
for(let i=0;i<100&&!finishTasks;i++)await wait(5);
if(!finishTasks)throw Error('task renderer did not start');
gen++;await api.signOut();finishTasks([]);await wait(80);
const root=document.querySelector('#app');console.log('After identity invalidation/signout during task render: session=',await api.getSession(),'marker=',root.getAttribute('data-content-ready'),'taskContent=',document.body.textContent.includes('All Tasks'));
process.exit(root.getAttribute('data-content-ready')==null?0:1);
