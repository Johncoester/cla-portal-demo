/* Task grid read joins one flight per navigation and does not replace the All Tasks board read. No hosted project. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { createSupabaseAdapter } from '../js/data/supabase-adapter.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;
const check = (cond, msg) => { if (cond) console.log('ok', msg); else { fail += 1; console.log('FAIL', msg); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const gate = () => { let release; const promise = new Promise((r) => { release = r; }); return { promise, release }; };
const row = (title, deal = 'd1') => ({ id: title, deal_id: deal, title, assigned_role: 'Client-Buyer', status: 'todo', due_date: '2026-11-01', file_number: 'MD-1', street: '1 Main', city: 'Baltimore', state: 'MD', zip: '21201', deal_status: 'Open' });
const deal = { id: 'd1', file_number: 'MD-1', street: '1 Main', city: 'Baltimore', state: 'MD', zip: '21201', closing_date: null, status: 'Open' };

function query(result) {
  const body = { select() { return body; }, eq() { return body; }, is() { return body; }, order() { return body; }, in() { return body; }, then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); } };
  return body;
}

async function adapterFlight() {
  const holds = [];
  const dealsHolds = [];
  const order = [];
  let who = 'A';
  let signedIn = true;
  const profile = () => ({ id: who, role: who === 'P' ? 'Processor' : who === 'C' ? 'Client-Buyer' : 'Admin', is_admin: who === 'A' || who === 'B', status: 'active', first_name: 'Ann', last_name: 'Lee' });
  const hooks = {
    getUser() { order.push('getUser:' + who); return Promise.resolve({ data: { user: signedIn ? { id: who } : null } }); },
    async signOut() { signedIn = false; return { error: null }; },
    rpc(name, args) {
      order.push(name + (args && args.p_file_status ? ':' + args.p_file_status : ''));
      if (name === 'task_grid') {
        const box = gate();
        holds.push(box);
        const title = holds.length === 1 ? 'GRID-A' : 'GRID-B';
        return box.promise.then(() => ({ data: [row(title)], error: null }));
      }
      if (name === 'my_profile') return { data: profile(), error: null };
      if (name === 'demo_view_status') return { data: { active: false }, error: null };
      return { data: [], error: null };
    },
    from(name) {
      return query(() => {
        if (name === 'deals') {
          order.push('deals');
          const box = gate();
          dealsHolds.push(box);
          return box.promise.then(() => ({ data: [deal], error: null }));
        }
        return { data: [], error: null, count: 0 };
      });
    },
    functions: { invoke() { return Promise.resolve({ data: { allowed: false }, error: null }); } },
  };
  globalThis.__fakeSB = {
    auth: { onAuthStateChange(fn) { hooks.cb = fn; }, getUser: () => hooks.getUser(), signOut: () => hooks.signOut() },
    rpc: (name, args) => hooks.rpc(name, args),
    from: (name) => hooks.from(name),
    functions: hooks.functions,
  };
  const api = await createSupabaseAdapter({ url: 'https://fake.invalid', anonKey: 'FAKE-NOT-A-KEY' });
  hooks.cb('INITIAL_SESSION', { user: { id: 'A' } });
  await api.beginNavigation();
  const first = api.getTaskGrid({ fileStatus: 'Open' });
  await until(() => order.includes('task_grid:Open') && order.includes('deals'), 'parallel grid reads');
  check(order.indexOf('task_grid:Open') >= 0 && dealsHolds.length === 1 && holds.length === 1, 'the grid file list starts before the grid rows finish');
  holds[0].release(); dealsHolds[0].release();
  const grid = await first;
  check(grid.rows.some((item) => item.title === 'GRID-A') && grid.columns.some((item) => item.fileNumber === 'MD-1'), 'the grid returns the file rows, not a loading shell');
  await api.getTaskGrid({ fileStatus: 'Open' });
  check(holds.length === 1, 'the same navigation reuses the Open grid read');
  const other = api.getTaskGrid({ fileStatus: 'All' });
  await until(() => holds.length === 2, 'the All grid read');
  holds[1].release(); dealsHolds[1].release();
  await other;
  check(order.filter((item) => item.startsWith('task_grid:')).join(',') === 'task_grid:Open,task_grid:All', 'a different file status reads the grid again');
  who = 'B';
  hooks.cb('SIGNED_IN', { user: { id: 'B' } });
  await api.beginNavigation();
  const next = api.getTaskGrid({ fileStatus: 'Open' });
  await until(() => holds.length === 3, 'the next person grid read');
  holds[2].release(); dealsHolds[2].release();
  const moved = await next;
  check(holds.length === 3 && moved.rows.some((item) => item.title === 'GRID-B') && !moved.rows.some((item) => item.title === 'GRID-A'), 'the next navigation does not reuse the previous grid rows');
  check(order.filter((item) => item.startsWith('getUser:')).includes('getUser:B'), 'the next navigation asks the server who is signed in');
  who = 'P';
  hooks.cb('SIGNED_IN', { user: { id: 'P' } });
  await api.beginNavigation();
  const before = holds.length;
  let refused = '';
  try { await api.getTaskGrid({ fileStatus: 'Open' }); } catch (err) { refused = err.message; }
  check(refused.includes('Only an Admin') && holds.length === before, 'a processor does not start the grid read');
  await api.signOut();
  try { await api.getTaskGrid({ fileStatus: 'Open' }); } catch (err) { refused = err.message; }
  check(holds.length === before, 'sign-out does not reuse the last grid rows');
}

async function until(cond, label) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > 2000) throw new Error('timed out waiting for ' + label);
    await wait(10);
  }
}

await adapterFlight();

const state = { role: 'Admin', isAdmin: true, tasksLive: null, gridLive: null, signedIn: true, empty: false, who: 'user-1' };
const gates = { hr: gate(), voice: gate(), grid: gate(), deals: gate(), board: gate() };
const calls = [];
globalThis.__fakeSB = {
  auth: {
    onAuthStateChange() {},
    getUser() { return Promise.resolve({ data: { user: state.signedIn ? { id: state.who, email: 'a@example.test' } : null } }); },
    async signOut() { state.signedIn = false; return { error: null }; },
  },
  from(name) {
    return query(() => {
      if (name === 'module_settings') {
        const data = [];
        if (state.tasksLive != null) data.push({ module: 'tasks', live: state.tasksLive, updated_at: null, updated_by: null });
        if (state.gridLive != null) data.push({ module: 'task-grid', live: state.gridLive, updated_at: null, updated_by: null });
        return { data, error: null };
      }
      if (name === 'deals') {
        calls.push('deals');
        return gates.deals.promise.then(() => ({ data: state.empty ? [] : [deal], error: null }));
      }
      return { data: [], error: null, count: 0 };
    });
  },
  rpc(name, args) {
    calls.push(name + (args && args.p_file_status ? ':' + args.p_file_status : ''));
    if (name === 'hr_role') return gates.hr.promise.then(() => ({ data: null, error: null }));
    if (name === 'task_grid') return gates.grid.promise.then(() => ({ data: state.empty ? [] : [row('GRID-SECRET')], error: null }));
    if (name === 'task_board') return gates.board.promise.then(() => ({ data: [row('BOARD-SECRET')], error: null }));
    if (name === 'my_profile') return { data: { id: state.who, role: state.role, is_admin: state.isAdmin, status: 'active', first_name: 'Ann', last_name: 'Lee', email: 'a@example.test' }, error: null };
    if (name === 'demo_view_status') return { data: { active: false }, error: null };
    return { data: [], error: null };
  },
  functions: { invoke() { calls.push('voice'); return gates.voice.promise.then(() => ({ data: { allowed: false }, error: null })); } },
};

const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear(), key: (i) => [...m.keys()][i], get length() { return m.size; } }; };
window.requestAnimationFrame = (fn) => setTimeout(fn, 0);
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const local = mem(); const session = mem();
window.localStorage = local; window.sessionStorage = session;
globalThis.window = window; globalThis.document = document; globalThis.localStorage = local; globalThis.sessionStorage = session;
globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node;
window.CLA_PORTAL_CONFIG = { mode: 'supabase', url: 'https://fake.invalid', anonKey: 'FAKE-NOT-A-KEY' };
window.CLA_WS_DEFAULT = 'everything';
let hash = '#/task-grid';
window.location = {
  get hash() { return hash; },
  set hash(v) { const next = String(v); if (next === hash) return; hash = next; window.dispatchEvent(new window.Event('hashchange')); },
  search: '', pathname: '/', href: 'http://localhost/',
};
globalThis.location = window.location;
window.history = { replaceState() {} }; globalThis.history = window.history;

const { getAdapter } = await import('../js/data/adapter.js');
const app = await import('../js/app.js');
await until(() => calls.includes('task_grid:Open') && calls.includes('deals') && !calls.includes('task_board'), 'the grid route');
check(!gates.hr.promise || calls.includes('hr_role'), 'the grid read is requested while the page is still gating');
check(!document.body.textContent.includes('GRID-SECRET'), 'the grid heading waits until the gate finishes');
gates.grid.release(); gates.deals.release(); gates.hr.release(); gates.voice.release();
await until(() => document.querySelector('[data-task-grid-ready]') && document.body.textContent.includes('MD-1'), 'the grid files');
check(document.getElementById('app').getAttribute('data-content-ready') === 'task-grid' && !document.body.textContent.includes('Loading this page.'), 'the grid ready flag marks the file rows');
check(calls.filter((item) => item.startsWith('task_grid:')).length === 1, 'the grid page joins the read that already started');

state.empty = true;
gates.hr = gate(); gates.voice = gate(); gates.grid = gate(); gates.deals = gate();
hash = '#/task-grid?s=Closed';
const empty = app.render();
await until(() => calls.includes('task_grid:Closed'), 'the closed grid');
gates.grid.release(); gates.deals.release(); gates.hr.release(); gates.voice.release();
await empty;
await until(() => document.querySelector('[data-grid-empty]'), 'the empty grid');
check(document.body.textContent.includes('No files.') && document.querySelector('[data-task-grid-ready]').getAttribute('data-file-count') === '0', 'an empty grid is finished data');

const gridCalls = calls.filter((item) => item.startsWith('task_grid:')).length;
state.empty = false; state.role = 'Admin'; state.isAdmin = true;
gates.hr = gate(); gates.voice = gate(); gates.board = gate();
hash = '#/tasks';
const tasks = app.render();
await until(() => calls.some((item) => item.startsWith('task_board')), 'the task list');
check(calls.filter((item) => item.startsWith('task_grid:')).length === gridCalls, 'opening All Tasks does not read the task grid');
gates.board.release(); gates.hr.release(); gates.voice.release();
await tasks;
await until(() => document.querySelector('[data-all-tasks-ready]'), 'the task list rows');
check(document.body.textContent.includes('BOARD-SECRET') && document.getElementById('app').getAttribute('data-content-ready') === 'all-tasks', 'All Tasks still marks its own rows');

state.role = 'Processor'; state.isAdmin = false; state.gridLive = false;
const hidden = calls.filter((item) => item.startsWith('task_grid:')).length;
hash = '#/task-grid';
await app.render();
await wait(30);
check(calls.filter((item) => item.startsWith('task_grid:')).length === hidden && document.body.textContent.includes('Not authorized'), 'a processor does not open the grid when it is off');

state.role = 'Client-Buyer'; state.isAdmin = false; state.gridLive = null;
const clientCalls = calls.filter((item) => item.startsWith('task_grid:')).length;
hash = '#/task-grid';
await app.render();
await wait(30);
check(calls.filter((item) => item.startsWith('task_grid:')).length === clientCalls && document.body.textContent.includes('Not authorized'), 'a client does not open the grid');

state.role = 'Admin'; state.isAdmin = true;
gates.hr = gate(); gates.voice = gate(); gates.grid = gate(); gates.deals = gate();
hash = '#/task-grid';
const leaving = app.render();
await until(() => calls.filter((item) => item.startsWith('task_grid:')).length === clientCalls + 1, 'the grid read before sign-out');
const api = await getAdapter();
await api.signOut();
gates.grid.release(); gates.deals.release(); gates.hr.release(); gates.voice.release();
await leaving;
await until(() => hash === '#/login' || document.body.textContent.toLowerCase().includes('sign in'), 'the signed-out screen');
check(!document.body.textContent.includes('GRID-SECRET'), 'signing out does not paint the grid that already started');

const html = readFileSync(path.join(root, 'index.html'), 'utf8');
const appSrc = readFileSync(path.join(root, 'js/app.js'), 'utf8');
const adapterSrc = readFileSync(path.join(root, 'js/data/adapter.js'), 'utf8');
const heavySrc = readFileSync(path.join(root, 'js/data/supabase-adapter.js'), 'utf8');
check(html.includes('js/app.js?v=202611100230') && !html.includes('boot-marks') && appSrc.includes("adapter.js?v=202611100230") && appSrc.includes("pages/tasks.js?v=202611100200") && appSrc.includes("pages/taskgrid.js?v=202611091600") && adapterSrc.includes("supabase-adapter.js?v=202611100230"), 'the changed imports keep their cache query');
check(appSrc.includes("api.listAllTasks({ fileStatus: 'All' })") && heavySrc.includes("nav.share(u.id, 'grid:' + fs") && heavySrc.includes('Promise.all([sb.rpc(\'task_grid\''), 'the board overlap stays and the grid read shares one flight');
const money = {
  'js/data/constants.js': '30ef60e9c1c68676d0982e106813e9b6eb574163d6bc34d6ed68a086e7f6e5cd',
  'js/data/supabase-tc.js': '56bb2d60d60f38384df385d102a5bf3f5a7116768896bd35eb2b93e6440975a6',
  'js/pages/deal-buyer-legacy.js': 'a18e6c94baf312aef30902db949ebb477fc591622481d5f4006af4cb7c8b412b',
  'js/pages/deal.js': '671da616f5ca4ed2827e00c3fd2ca64c3f74f9c2ae82b108a50ec90afae129e2',
  'js/pages/money-input.js': '014244be259d403571d283caa85afde7ff2b355a3ad5ba8f024034a76a26188d',
  'js/pages/ordernew.js': '8971e977e0e66efe0f1d7bb166f84a1093fae23e2424c1260615e5ed89a6e5b4',
  'js/pages/tc-overview.js': '5f1572ee9b4afa15012fd09409f59e5af2755d309853d3252b72069bf7157ee0',
};
for (const [file, hash] of Object.entries(money)) {
  const got = createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex');
  check(got === hash, file + ' is unchanged');
}

console.log(fail ? fail + ' failed' : 'task grid integrate passed');
process.exit(fail ? 1 : 0);
