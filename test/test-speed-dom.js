/* Production widget and router, in a local DOM. No hosted project and no secrets. */
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';

const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() }; };
const local = mem(); const session = mem();
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.localStorage = local; window.sessionStorage = session;
globalThis.window = window; globalThis.document = document;
globalThis.localStorage = local; globalThis.sessionStorage = session;
globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node;
window.CLA_PORTAL_CONFIG = { mode: 'mock' };
const location = { hash: '#/login', search: '', pathname: '/', href: 'http://localhost/' };
window.location = location;
globalThis.location = location;
window.history = { replaceState() {} };
globalThis.history = window.history;
const timers = [];
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms) => { if (typeof ms === 'number' && ms >= 1000) { timers.push(fn); return timers.length; } return realSetTimeout(fn, ms); };
window.setTimeout = globalThis.setTimeout;

let fail = 0;
const check = (cond, msg) => { if (cond) console.log('ok', msg); else { fail += 1; console.log('FAIL', msg); } };
const wait = (ms) => new Promise((r) => realSetTimeout(r, ms));
const hold = () => { let go; const p = new Promise((r) => { go = r; }); return { p, go }; };

let gate = hold();
let who = 'A';
const api = {
  async listStaffFeedback() { const id = who; await gate.p; return [{ id: id === 'A' ? 'thread-a' : 'thread-b', mine: true, title: id }]; },
  async getStaffFeedback(id) { await gate.p; return { id, deliveryState: 'run_started' === 'x' ? '' : 'run_accepted', messages: [{ authorKind: 'reporter', body: id === 'thread-a' ? 'ONLY-A' : 'ONLY-B', turnOrd: 1 }] }; },
  async createStaffFeedback() { return { id: 'thread-a' }; },
  async addStaffFeedbackTurn() { return { turnEventId: 'event-1' }; },
  async requestStaffFeedbackDispatch() { return { reason: 'run_started' }; },
};

const john = { id: '149e612a-6e14-4ee1-9890-0f29d6f89156', status: 'active', isDemo: false };
const matt = { id: 'd02722a1-582b-42c0-b3d1-28d25adb758d', status: 'active', isDemo: false };
const widget = await import('../js/pages/staff-feedback-widget.js');
widget.syncStaffFeedbackWidget({ user: john, getApi: async () => api });
await wait(10);
widget.openStaffFeedbackPanel();
const firstGate = gate;
await wait(10);
who = 'B';
gate = hold();
widget.syncStaffFeedbackWidget({ user: matt, getApi: async () => api });
await wait(0);
firstGate.go();
await wait(20);
gate.go();
await wait(20);
const thread = () => (document.querySelector('.claSfThread') || { textContent: '' }).textContent;
check(thread().includes('ONLY-B') && !thread().includes('ONLY-A'), 'a pending read for one person does not paint into the next person');

widget.hideStaffFeedbackPanel();
check(document.querySelector('.claSfOvl').hidden === true, 'close hides the panel');
widget.openStaffFeedbackPanel();
await wait(20);
check(thread().includes('ONLY-B'), 'reopen shows the current person');

const form = document.querySelector('.claSfCompose');
document.querySelector('textarea').value = 'hello';
form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await wait(30);
check(timers.length >= 1, 'a sent thread schedules a display check');
const duringPoll = hold();
const oldList = async () => { await duringPoll.p; return [{ id: 'thread-b', mine: true, title: 'B' }]; };
const oldGet = async () => { await duringPoll.p; return { id: 'thread-b', deliveryState: 'run_accepted', messages: [{ authorKind: 'reporter', body: 'ONLY-B', turnOrd: 1 }] }; };
api.listStaffFeedback = () => oldList();
api.getStaffFeedback = (id) => oldGet(id);
timers.shift()();
await wait(0);
api.listStaffFeedback = async () => [{ id: 'thread-a', mine: true, title: 'A' }];
api.getStaffFeedback = async () => ({ id: 'thread-a', deliveryState: 'run_accepted', messages: [{ authorKind: 'reporter', body: 'ONLY-A', turnOrd: 1 }] });
widget.syncStaffFeedbackWidget({ user: john, getApi: async () => api });
await wait(10);
duringPoll.go();
await wait(30);
check(thread().includes('ONLY-A') && !thread().includes('ONLY-B'), 'a poll that started on the previous thread does not overwrite the new one');

widget.syncStaffFeedbackWidget({ user: null, getApi: async () => api });
await wait(10);
check(!document.getElementById('claStaffFeedbackRoot'), 'sign-out removes the thread');

const app = await import('../js/app.js');
const { getAdapter } = await import('../js/data/adapter.js');
const portal = await getAdapter();
await portal.signInDev('u-admin');
window.location.hash = '#/orders';
const seen = [];
const orig = portal.getModuleAccess.bind(portal);
portal.getModuleAccess = async () => {
  const session = await portal.getSession();
  seen.push(session && session.id);
  await wait(40);
  return orig();
};
const slow = app.render();
await wait(5);
await portal.signInDev('u-adam');
window.location.hash = '#/orders';
const next = app.render();
await Promise.allSettled([slow, next]);
check(seen.includes('u-adam'), 'module access runs for the person signed in after the switch');
check(!document.body.textContent.includes('undefined'), 'the latest route rendered without dumping an empty module error');

console.log(fail ? fail + ' failed' : 'speed dom passed');
process.exit(fail ? 1 : 0);
