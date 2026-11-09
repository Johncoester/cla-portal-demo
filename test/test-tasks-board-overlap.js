/* All Tasks starts its one board read before HR and voice finish. No hosted project and no secrets. */
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';

let fail = 0;
const check = (cond, msg) => { if (cond) console.log('ok', msg); else { fail += 1; console.log('FAIL', msg); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const gate = () => { let release; const promise = new Promise((r) => { release = r; }); return { promise, release, done: false }; };

const state = {
  role: 'Admin',
  isAdmin: true,
  tasksLive: null,
  signedIn: true,
  rows: [{ id: 't1', deal_id: 'd1', title: 'SECRET-BOARD', status: 'todo', assigned_role: 'Client-Buyer', file_number: 'MD-1', street: '1 Main', city: 'Baltimore', state: 'MD', zip: '21201', deal_status: 'Open' }],
};
const gates = { hr: gate(), voice: gate(), board: gate() };
const order = [];
let boardCalls = 0;
let boardArgs = [];

function query(result) {
  const b = {
    select() { return b; }, eq() { return b; }, is() { return b; }, order() { return b; }, in() { return b; },
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
  };
  return b;
}

globalThis.__fakeSB = {
  auth: {
    onAuthStateChange() {},
    getUser() {
      order.push('getUser');
      const user = state.signedIn ? { id: 'user-1', email: 'a@example.test' } : null;
      return Promise.resolve({ data: { user } });
    },
    async signOut() { state.signedIn = false; return { error: null }; },
  },
  from(name) {
    return query(name === 'module_settings'
      ? { data: state.tasksLive == null ? [] : [{ module: 'tasks', live: state.tasksLive, updated_at: null, updated_by: null }], error: null }
      : { data: [], error: null, count: 0 });
  },
  async rpc(name, args) {
    order.push(name);
    if (name === 'hr_role') { await gates.hr.promise; gates.hr.done = true; return { data: null, error: null }; }
    if (name === 'task_board') {
      boardCalls += 1;
      boardArgs.push(args && args.p_file_status);
      order.push(gates.hr.done ? 'board-after-hr' : 'board-before-hr');
      order.push(gates.voice.done ? 'board-after-voice' : 'board-before-voice');
      await gates.board.promise;
      return { data: state.rows, error: null };
    }
    if (name === 'my_profile') return { data: { id: 'user-1', role: state.role, is_admin: state.isAdmin, status: 'active', first_name: 'Ann', last_name: 'Lee', email: 'a@example.test' }, error: null };
    if (name === 'demo_view_status') return { data: { active: false }, error: null };
    return { data: [], error: null };
  },
  functions: { invoke() { order.push('voice'); return gates.voice.promise.then(() => ({ data: { allowed: false }, error: null })); } },
};

const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear(), key: (i) => [...m.keys()][i], get length() { return m.size; } }; };
window.requestAnimationFrame = (fn) => setTimeout(fn, 0);
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const local = mem(); const session = mem();
window.localStorage = local; window.sessionStorage = session;
globalThis.window = window; globalThis.document = document;
globalThis.localStorage = local; globalThis.sessionStorage = session;
globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node;
window.CLA_PORTAL_CONFIG = { mode: 'supabase', url: 'https://fake.invalid', anonKey: 'FAKE-NOT-A-KEY' };
window.CLA_WS_DEFAULT = 'everything';
let hash = '#/tasks';
window.location = {
  get hash() { return hash; },
  set hash(v) { const next = String(v); if (next === hash) return; hash = next; window.dispatchEvent(new window.Event('hashchange')); },
  search: '', pathname: '/', href: 'http://localhost/',
};
globalThis.location = window.location;
window.history = { replaceState() {} }; globalThis.history = window.history;

async function until(cond, label) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > 2000) throw new Error('timed out waiting for ' + label);
    await wait(10);
  }
}

const { getAdapter } = await import('../js/data/adapter.js');
const app = await import('../js/app.js');
await until(() => boardCalls === 1, 'the board read');
check(order.includes('board-before-hr') && order.includes('board-before-voice'), 'the board read starts while HR and voice are still open');
check(!document.body.textContent.includes('All tasks'), 'the All Tasks heading waits for HR and voice');
gates.board.release();
await wait(30);
check(!document.body.textContent.includes('SECRET-BOARD'), 'a finished board read is not painted before HR and voice finish');
gates.hr.release();
gates.voice.release();
await until(() => document.body.textContent.includes('All tasks') && document.body.textContent.includes('SECRET-BOARD'), 'the allowed board');
check(boardCalls === 1 && boardArgs[0] === 'All', 'the page joins the same All board read');

const api = await getAdapter();
await api.listAllTasks({ fileStatus: 'All' });
check(boardCalls === 1, 'another All read in this navigation does not call task_board again');
await api.listAllTasks({ fileStatus: 'Open' });
check(boardCalls === 2 && boardArgs[1] === 'Open', 'a different file status calls task_board separately');

state.rows = [{ id: 't2', deal_id: 'd1', title: 'SECOND-BOARD', status: 'todo', assigned_role: 'Client-Buyer', file_number: 'MD-1', street: '1 Main', city: 'Baltimore', state: 'MD', zip: '21201', deal_status: 'Open' }];
gates.hr = gate(); gates.voice = gate(); gates.board = gate();
const beforeNext = boardCalls;
const next = app.render();
await until(() => boardCalls === beforeNext + 1, 'the next navigation board read');
gates.board.release(); gates.hr.release(); gates.voice.release();
await next;
await until(() => document.body.textContent.includes('SECOND-BOARD'), 'the next navigation');
check(!document.body.textContent.includes('SECRET-BOARD') && boardCalls === beforeNext + 1, 'the next navigation does not reuse the previous board rows');

state.role = 'Processor'; state.isAdmin = false; state.tasksLive = false;
const hidden = boardCalls;
await app.render();
await wait(40);
check(boardCalls === hidden && document.body.textContent.includes('Page not found') && !document.body.textContent.includes('SECOND-BOARD'), 'a staff person does not start the board read when All Tasks is off');

state.role = 'Client-Buyer'; state.isAdmin = false; state.tasksLive = null;
const refused = boardCalls;
await app.render();
await wait(40);
check(boardCalls === refused && document.body.textContent.includes('Not available') && !document.body.textContent.includes('SECOND-BOARD'), 'a client does not start the board read');

state.role = 'Admin'; state.isAdmin = true; state.tasksLive = null;
gates.hr = gate(); gates.voice = gate(); gates.board = gate();
const signedOut = app.render();
await until(() => boardCalls === refused + 1, 'the board read before sign-out');
await api.signOut();
gates.board.release(); gates.hr.release(); gates.voice.release();
await signedOut;
await until(() => hash === '#/login' || document.body.textContent.includes('Sign in') || document.body.textContent.includes('sign in'), 'the signed-out screen');
check(!document.body.textContent.includes('SECOND-BOARD'), 'signing out does not paint the board that was already started');

console.log(fail ? fail + ' failed' : 'tasks board overlap passed');
process.exit(fail ? 1 : 0);
