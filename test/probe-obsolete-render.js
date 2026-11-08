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

const wait = (ms) => new Promise((r) => realSetTimeout(r, ms));

const { getAdapter } = await import('../js/data/adapter.js');
const api = await getAdapter();
await api.signInDev('u-admin');
location.hash = '#/deals/deal-1/tasks';
let finishTasks;
const taskHeld = new Promise((r) => { finishTasks = r; });
api.listTasks = () => taskHeld;
const docs = api.listDocuments.bind(api);
let freezeDocs = false;
api.listDocuments = (...args) => (freezeDocs ? new Promise(() => {}) : docs(...args));
const app = await import('../js/app.js');
await wait(40);
location.hash = '#/deals/deal-1/documents';
await app.render();
const root = document.querySelector('#app');
console.log('new Docs complete marker=', root.getAttribute('data-content-ready'));
if (root.getAttribute('data-content-ready') !== 'documents') throw Error('new docs did not complete');
freezeDocs = true;
finishTasks([]);
await wait(60);
console.log('after obsolete Tasks completes marker=', root.getAttribute('data-content-ready'), 'loading=', !!document.querySelector('[data-loading-note]'), 'documents=', document.body.textContent.includes('Documents & Files'));
process.exit(root.getAttribute('data-content-ready') === 'documents' ? 0 : 1);
