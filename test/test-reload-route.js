/* A signed-in reload of a file URL stays on that file. No hosted project and no secrets. */
import { authEventAction } from '../js/data/read-batch.js';

let fail = 0;
const check = (cond, msg) => { if (cond) console.log('ok', msg); else { fail += 1; console.log('FAIL', msg); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

check(authEventAction('SIGNED_IN', 'person-a', '', '') === 'keep', 'a session restore does not drop a navigation that has not confirmed anyone');
check(authEventAction('SIGNED_OUT', 'person-a', 'person-a', 'person-a') === 'drop', 'sign-out drops the remembered person');
check(authEventAction('SIGNED_IN', 'person-b', 'person-a', 'person-a') === 'drop', 'a different person drops the previous file reads');
check(authEventAction('USER_UPDATED', 'person-a', 'person-a', 'person-a') === 'refresh', 'the same person updating does not look signed out');
check(authEventAction('INITIAL_SESSION', 'person-a', '', '') === 'keep', 'the initial session event keeps the route');

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
let hash = '#/deals/deal-1/documents';
const location = {
  get hash() { return hash; },
  set hash(v) { hash = String(v); window.dispatchEvent(new window.Event('hashchange')); },
  search: '', pathname: '/', href: 'http://localhost/',
};
window.location = location; globalThis.location = location;
window.history = { replaceState() {} }; globalThis.history = window.history;

const { getAdapter } = await import('../js/data/adapter.js');
const api = await getAdapter();
await api.signInDev('u-admin');
const app = await import('../js/app.js');
await wait(50);
check(hash === '#/deals/deal-1/documents' && document.body.textContent.includes('Documents & Files'), 'a signed-in reload of Documents stays on that file');

let calls = 0;
const realSession = api.getSession.bind(api);
api.getSession = async () => { calls += 1; if (calls === 1) return null; return realSession(); };
hash = '#/deals/deal-1/documents';
await app.render();
await wait(50);
check(hash === '#/deals/deal-1/documents' && document.body.textContent.includes('Documents & Files'), 'a session that confirms on the second read returns to Documents, not the dashboard');

api.getSession = async () => null;
hash = '#/deals/deal-1/documents';
await app.render();
await wait(20);
check(hash === '#/login', 'a signed-out file address still asks for sign-in');

console.log(fail ? fail + ' failed' : 'reload route passed');
process.exit(fail ? 1 : 0);
