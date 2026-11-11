/* My Tasks and View Tasks. Filter the tasks already loaded. No hosted project. */
import { readFileSync } from 'node:fs';
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { toText } from '../js/ui.js';
import { render as renderTasks } from '../js/pages/dealtasks.js';
import { ownTaskBox, tasksForViewer, viewTasksHref, myTasksHref } from '../js/data/task-board.js';

const { window, document } = parseHTML('<!doctype html><html><body></body></html>');
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.scrollTo = () => {};
globalThis.window = window; globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node;
const hash = { value: '#/deals/deal-1/tasks' };
Object.defineProperty(globalThis, 'location', { configurable: true, value: { get hash() { return hash.value; }, set hash(v) { hash.value = v; }, pathname: '/', search: '' } });

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

ok(ownTaskBox({ role: 'Listing Agent' }) === 'listing-agent', 'a listing agent section is Listing (Seller\'s) Agent tasks');
ok(ownTaskBox({ role: 'Buyer Agent' }) === 'buyer-agent', 'a buyer agent section is the buyer-agent box');
ok(ownTaskBox({ roles: ['Client-Buyer'] }) === 'buyer' && ownTaskBox({ roles: ['Client-Seller'] }) === 'seller', 'a client section is their side');
ok(ownTaskBox({ role: 'Processor' }) === 'other', 'staff tasks sit in the other box');
const sample = [
  { id: 'a', assignedRole: 'Listing Agent', mine: true },
  { id: 'b', assignedRole: 'Buyer Agent', mine: false },
  { id: 'c', assignedRole: 'Client-Buyer', mine: true },
  { id: 'd', assignedRole: 'Processor', mine: true },
  { id: 'e', assignedRole: 'Processor', mine: false },
];
ok(tasksForViewer({ role: 'Listing Agent' }, sample).map((t) => t.id).join() === 'a', 'listing agent My Tasks is only that role');
ok(tasksForViewer({ role: 'Buyer Agent' }, sample).map((t) => t.id).join() === 'b', 'buyer agent My Tasks is only that role');
ok(tasksForViewer({ roles: ['Client-Buyer'] }, sample).map((t) => t.id).join() === 'c', 'buyer My Tasks is only the buyer side');
ok(tasksForViewer({ role: 'Processor' }, [{ id: 'd', assignedRole: 'Processor', mine: true }, { id: 'e', assignedRole: 'Processor', mine: false }, { id: 'a', assignedRole: 'Listing Agent', mine: false }]).map((t) => t.id).join() === 'd', 'staff My Tasks is only tasks assigned to them');
ok(viewTasksHref('deal-1', { role: 'Listing Agent' }) === '#/deals/deal-1/tasks?section=listing-agent', 'View Tasks opens the listing-agent section');
ok(myTasksHref('deal-1') === '#/deals/deal-1/tasks?mine=1', 'My Tasks is a filter on the same page');

const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
ok(app.includes("${link('tasks', 'Tasks', 'task')}${myTasksLink}"), 'My Tasks is directly under Tasks');
ok(app.includes("${link('tasks', 'To-do list', 'task')}${myTasksLink}"), 'My Tasks is directly under the client to-do list');

const api = createMockAdapter({ storage: mapStore(), sessionStorage: mapStore() });
function mapStore() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; }
async function open(id, query) {
  await api.signInDev(id);
  const session = await api.getSession();
  const deal = await api.getDeal('deal-1');
  const user = session.role === 'Outside user' && deal.myRole ? { ...session, role: deal.myRole, roles: deal.myRoles || [deal.myRole], accountRole: session.role } : session;
  let calls = 0;
  const orig = api.listTasks.bind(api);
  api.listTasks = async (...args) => { calls += 1; return orig(...args); };
  hash.value = `#/deals/deal-1/tasks${query}`;
  const view = await renderTasks({ api, user, deal, refresh() {} });
  document.body.innerHTML = toText(view.body);
  if (view.mount) view.mount(document.body);
  api.listTasks = orig;
  return { calls, html: document.body.innerHTML, user };
}

const listing = await open('u-lagent', '?section=listing-agent');
ok(listing.calls === 1, 'View Tasks does not load the task list again');
ok(listing.html.includes('data-sidebox="listing-agent"') && listing.html.includes('data-sidebox="buyer"'), 'View Tasks keeps every section on the page');
ok(document.querySelector('[data-sidebox="listing-agent"] summary').getAttribute('tabindex') === '-1', 'View Tasks focuses the listing agent section');
ok(document.querySelector('[data-sidebox="listing-agent"]').hasAttribute('data-focused-section'), 'the listing agent section is marked focused');

const mine = await open('u-lagent', '?mine=1');
ok(mine.calls === 1 && mine.html.includes('data-file-tasks="mine"') && mine.html.includes('data-sidebox="listing-agent"'), 'listing agent My Tasks shows that role');
ok(!mine.html.includes('data-sidebox="buyer"') && !mine.html.includes('data-sidebox="seller"'), 'listing agent My Tasks hides the other sides');

const buyer = await open('u-buyer', '?mine=1');
ok(buyer.calls === 1 && buyer.html.includes('data-file-tasks="mine"') && buyer.html.includes('data-sidebox="buyer"'), 'a buyer My Tasks is the buyer side');
ok(!buyer.html.includes('data-sidebox="seller"') && !buyer.html.includes('data-sidebox="listing-agent"'), 'a buyer My Tasks hides the other sides');

const staff = await open('u-proc', '?mine=1');
ok(staff.calls === 1 && staff.html.includes('data-file-tasks="mine"'), 'staff My Tasks uses the tasks already loaded');
ok(!/data-mine="0"/.test(staff.html), 'staff My Tasks drops tasks that are not assigned to them');

console.log(fail ? fail + ' failed' : 'my tasks section passed');
if (fail) process.exit(1);
