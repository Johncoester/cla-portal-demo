/* PERF-OVERVIEW-1 (John, Nov 19 2026, 5:46 PM ET): File Overview reads. Mock data only. No hosted project and no secrets.
 * The staff list and closing locations start with the other overview reads, not after them.
 * Staff do not load the whole contact directory when File Overview opens. The Add window still loads it when it opens. */
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { toText } from '../js/ui.js';

const { window, document } = parseHTML('<!doctype html><html><body></body></html>');
globalThis.window = window; globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node; globalThis.Event = window.Event;
globalThis.location = { href: 'https://testportal.example/#/deals/deal-1', hash: '#/deals/deal-1', search: '' };
window.scrollTo = () => {};
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
globalThis.sessionStorage = mem(); globalThis.localStorage = mem();

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };
const tick = () => new Promise((r) => setTimeout(r, 20));

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-proc');
const user = await api.getSession();
const { render: renderDeal } = await import('../js/pages/deal.js');

const calls = [];
let release; const held = new Promise((r) => { release = r; });
const wrap = (name, hold = false) => { const fn = api[name].bind(api); api[name] = async (...a) => { calls.push(name); if (hold) await held; return fn(...a); }; };
wrap('getOrderOverview', true);
if (api.readOverview) wrap('readOverview', true);
wrap('listActiveStaff'); wrap('listClosingLocations'); wrap('listContacts');

const page = renderDeal({ api, user, params: { id: 'deal-1', tab: 'overview' }, go() {}, refresh() {} });
await tick(); await tick();
ok(calls.includes('listActiveStaff') && calls.includes('listClosingLocations'), 'the staff list and closing locations start while the overview read is still open');
release();
const v = await page;
document.body.innerHTML = toText(v.body);
v.mount(document.body);
ok(!calls.includes('listContacts'), 'a Processor opening File Overview does not load the whole contact directory');
ok(document.querySelector('[data-file-summary]') && document.querySelector('[data-closing-team]'), 'the staff File Overview still draws');

const add = document.querySelector('[data-add-party="Buyer Agent"]') || document.querySelector('[data-add-party]');
ok(!!add, 'the Add button is on the staff overview');
if (add) { add.dispatchEvent(new window.Event('click')); await tick(); await tick(); }
ok(calls.includes('listContacts'), 'opening the Add window loads the contact directory then');

console.log(fail ? fail + ' failed' : 'perf overview reads passed');
if (fail) process.exit(1);
