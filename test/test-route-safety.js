/* Auth cache, rejected speculative reads, and a late refused page. No hosted project and no secrets. */
import { identitySlot, navigationReads, speculativeReads } from '../js/data/read-batch.js';

let fail = 0;
const check = (cond, msg) => { if (cond) console.log('ok', msg); else { fail += 1; console.log('FAIL', msg); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const ident = identitySlot();
const ticket = ident.generation();
check(ident.hold({ id: 'person-a', role: 'Super admin' }, ticket).id === 'person-a', 'a confirmed person is remembered for that auth generation');
ident.invalidate();
check(ident.current() == null, 'an auth change drops the remembered person');
check(ident.hold({ id: 'person-a', role: 'Super admin' }, ticket) == null, 'an older generation cannot store a person after the auth change');

let unhandled = 0;
const onUnhandled = () => { unhandled += 1; };
process.on('unhandledRejection', onUnhandled);
const early = speculativeReads();
const rejected = early.read('', 'deal:1', async () => { throw new Error('file down'); });
await wait(30);
let message = '';
try { await rejected; } catch (e) { message = e.message; }
check(unhandled === 0 && message === 'file down', 'an early file failure is handled and still rejects');
process.off('unhandledRejection', onUnhandled);

const nav = navigationReads();
const spec = speculativeReads();
let generation = 1;
const first = spec.read('', 'deal:file', async () => ({ who: 'first' }));
generation += 1;
const adopted = spec.adopt(nav, 'person-b', 1, generation);
nav.begin('person-b');
let fetches = 0;
const second = await nav.share('person-b', 'deal:file', async () => { fetches += 1; return { who: 'second' }; });
const firstResult = await first;
check(adopted === false && second.who === 'second' && fetches === 1 && firstResult.who === 'first', 'a speculative read from before an auth change is not adopted');

const ownedNav = navigationReads();
const ownedSpec = speculativeReads();
const owned = ownedSpec.read('person-a', 'shell:file', async () => ({ street: 'PRIVATE-FOR-A' }), ownedNav);
const adoptedOwned = ownedSpec.adopt(ownedNav, 'person-a', 0, 0);
let ownedAgain = 0;
const reused = await ownedNav.share('person-a', 'shell:file', async () => { ownedAgain += 1; return { street: 'other' }; });
check(adoptedOwned === true && reused.street === 'PRIVATE-FOR-A' && ownedAgain === 0 && (await owned).street === 'PRIVATE-FOR-A', 'a speculative read is reused only for the owner it started with');

const unknownNav = navigationReads();
const unknownSpec = speculativeReads();
const unknown = unknownSpec.read('', 'shell:file', async () => ({ street: 'PRIVATE-FOR-A' }), unknownNav);
const adoptedUnknown = unknownSpec.adopt(unknownNav, 'person-b', 0, 0);
let unknownAgain = 0;
const refetched = await unknownNav.share('person-b', 'shell:file', async () => { unknownAgain += 1; return { street: 'PRIVATE-FOR-B' }; });
check(adoptedUnknown === true && refetched.street === 'PRIVATE-FOR-B' && unknownAgain === 1 && (await unknown).street === 'PRIVATE-FOR-A', 'an unowned speculative read is dropped and read again for the confirmed person');

import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear(), key: (i) => [...m.keys()][i], get length() { return m.size; } }; };
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.localStorage = mem(); window.sessionStorage = mem();
globalThis.window = window; globalThis.document = document;
globalThis.localStorage = window.localStorage; globalThis.sessionStorage = window.sessionStorage;
globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node;
window.CLA_PORTAL_CONFIG = { mode: 'mock' };
const location = { hash: '#/login', search: '', pathname: '/', href: 'http://localhost/' };
window.location = location; globalThis.location = location;
window.history = { replaceState() {} }; globalThis.history = window.history;
window.setTimeout = globalThis.setTimeout;

const app = await import('../js/app.js');
const { getAdapter } = await import('../js/data/adapter.js');
const api = await getAdapter();
const waiting = [];
let open = true;
api.notificationCount = () => new Promise((resolve) => { if (!open) resolve(0); else waiting.push(resolve); });
const release = () => { open = false; waiting.splice(0).forEach((fn) => fn(0)); };
const until = async (pred) => { for (let i = 0; i < 100 && !pred(); i += 1) await wait(10); };

await api.signInDev('u-buyer');
location.hash = '#/crm';
const refused = app.render();
await until(() => waiting.length > 0);
const beforeOrders = waiting.length;
location.hash = '#/orders';
const orders = app.render();
await until(() => waiting.length > beforeOrders);
release();
await Promise.allSettled([refused, orders]);
check(!document.querySelector('[data-route-refused]') && document.body.textContent.includes('Open Orders'), 'a late refused page does not replace the newer route');

open = true;
await api.signInDev('u-admin');
location.hash = '#/missing-page';
const missing = app.render();
await until(() => waiting.length > 0);
const beforeHome = waiting.length;
location.hash = '#/orders';
const afterMissing = app.render();
await until(() => waiting.length > beforeHome);
release();
await Promise.allSettled([missing, afterMissing]);
check(!document.body.textContent.includes('Page not found') && document.body.textContent.includes('Open Orders'), 'a late missing page does not replace the newer route');

open = true;
location.hash = '#/dashboard';
const neutral = app.render();
await until(() => waiting.length > 0);
const beforeLeave = waiting.length;
location.hash = '#/orders';
const leaveHome = app.render();
await until(() => waiting.length > beforeLeave);
release();
await Promise.allSettled([neutral, leaveHome]);
check(!document.body.textContent.includes('Pick a workspace') && document.body.textContent.includes('Open Orders'), 'a late workspace home does not replace the newer route');

console.log(fail ? fail + ' failed' : 'route safety passed');
process.exit(fail ? 1 : 0);
