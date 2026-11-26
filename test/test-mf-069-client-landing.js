/* MF-069 (Matt Landsberg, Nov 25 2026, confirmed): the buyer landing page after first login is mobile friendly,
   it is easy to pick the file, and it is clear which tasks the buyer has to do. Staff, agents and coordinators keep the table. */
import { readFileSync as read } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { clientHomeFiles, clientHomeCards, taskHref } from '../js/pages/client-home.js';
import { isClientOnlyUser } from '../js/data/constants.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

// ---- the pure builder: two files, one with a required task ----
const deals = [
  { id: 'd2', fileNumber: 'MD-26-2', street: '2 Quiet Rd', city: 'Bowie', state: 'MD', zip: '20715', stage: 1, closingDate: '2026-12-10', myRole: 'Client-Buyer', status: 'Open' },
  { id: 'd1', fileNumber: 'MD-26-1', street: '1 Busy Ln', city: 'Rockville', state: 'MD', zip: '20850', stage: 2, closingDate: '2026-12-30', myRole: 'Client-Buyer', status: 'Open' },
];
const tasks = [
  { id: 't1', dealId: 'd1', title: 'Upload your ID (front and back)', status: 'todo', kind: 'form', dueDate: '2026-11-20', mine: true },
  { id: 't2', dealId: 'd1', title: 'Sign the disclosure', status: 'in_progress', kind: 'sign', dueDate: '2026-12-01', mine: true },
  { id: 't3', dealId: 'd2', title: 'Done already', status: 'done', kind: 'form', mine: true },
  { id: 't4', dealId: 'd2', title: 'Not mine', status: 'todo', kind: 'form', mine: false },
];
const files = clientHomeFiles(deals, tasks, '2026-11-26');
ok(files.length === 2 && files[0].id === 'd1', 'the file that needs something from the buyer comes first, even with a later closing date');
ok(files[0].tasks.length === 2 && files[0].tasks[0].id === 't1' && files[0].tasks[0].overdue === true && files[0].tasks[1].overdue === false, 'open tasks are listed soonest first, and an overdue one is marked');
ok(files[1].tasks.length === 0, 'done tasks and tasks that are not the buyer\'s are not listed');
ok(taskHref(files[0].tasks[0]) === '#/deals/d1/tasks/t1' && taskHref({ id: 'x', dealId: 'd1', kind: 'simple' }) === '#/deals/d1/tasks', 'a form task links straight to its form; other tasks link to the Tasks tab');
const out = String(clientHomeCards(files));
ok((out.match(/data-ch-file=/g) || []).length === 2, 'one card per file');
ok(/data-ch-open[^>]*>/.test(out) && out.includes('href="#/deals/d1"') && out.includes('1 Busy Ln') && out.includes('MD-26-1'), 'the card shows the address and file number and opens the file');
ok(out.includes('Needed from you (2)') && out.includes('Upload your ID (front and back)') && out.includes('Overdue, was due'), 'required tasks are listed by title under "Needed from you"');
ok(out.includes('Nothing needed from you right now.'), 'a file with nothing to do says so');
ok(String(clientHomeCards([])).includes('data-ch-empty'), 'no files shows a plain message');
ok(!/<script/i.test(String(clientHomeCards(clientHomeFiles([{ id: 'x', fileNumber: '<script>', street: '<script>alert(1)</script>' }], [], '')))), 'file text is escaped');

// ---- who gets it ----
ok(isClientOnlyUser({ role: 'Outside user', fileRoles: ['Client-Buyer'] }) && !isClientOnlyUser({ role: 'Outside user', fileRoles: ['Client-Buyer', 'Buyer Agent'] }) && !isClientOnlyUser({ role: 'Processor', fileRoles: [] }), 'only a login whose files are all client files is a client-only login');
const orders = read(new URL('../js/pages/orders.js', import.meta.url), 'utf8');
ok(/const clientHome = isClientOnlyUser\(user\);/.test(orders) && /\$\{clientHome \? clientHomeCards\(clientHomeFiles\(deals, myTasks, localDate\(\)\)\) : ''\}/.test(orders), 'Open Orders shows the cards only for a client-only login');
ok(/class="\$\{clientHome \? 'ch-table-wrap' : ''\}"/.test(orders), 'for everyone else the table block has no new class (staff and agents are unchanged)');

// ---- mock data end to end: a buyer's cards come from their own files and tasks ----
const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-buyer');
const myDeals = await api.listDeals({ status: 'Open' });
const myTasks = await api.listMyTasks({ fileStatus: 'Open' });
const real = clientHomeFiles(myDeals, myTasks, '2026-11-26');
ok(real.length === myDeals.length && real.length > 0, 'the seeded buyer gets a card for each of their files');
ok(real.every((f) => f.tasks.every((t) => myTasks.some((m) => m.id === t.id))), 'every listed task is one of the buyer\'s own');
await api.signInDev('u-proc');
ok((await api.listDeals({ status: 'Open' })).length >= myDeals.length, 'a Processor still reads the full order list for the table');

// ---- the real page, rendered for a buyer and for a Processor ----
globalThis.location = { hash: '#/orders' };
const { render } = await import('../js/pages/orders.js');
await api.signInDev('u-buyer');
const buyerPage = String((await render({ api, user: await api.getSession() })).body);
ok(buyerPage.includes('data-client-home') && (buyerPage.match(/data-ch-file=/g) || []).length === myDeals.length && buyerPage.includes('data-ch-task') && buyerPage.includes('ch-table-wrap'), 'a buyer\'s Open Orders page has a card per file, the task links, and the table marked for computers only');
await api.signInDev('u-proc');
const procPage = String((await render({ api, user: await api.getSession() })).body);
ok(!procPage.includes('data-client-home') && !procPage.includes('ch-table-wrap') && procPage.includes('id="otable"'), 'a Processor\'s Open Orders page is the same table as before');

// ---- phone layout ----
const css = read(new URL('../css/client-home.css', import.meta.url), 'utf8');
const html = read(new URL('../index.html', import.meta.url), 'utf8');
ok(/@media \(max-width: 860px\)[\s\S]*\.ch-table-wrap \{ display: none; \}/.test(css), 'on a phone the eight-column table is hidden for a client');
ok(/@media \(max-width: 860px\)[\s\S]*\.client-home \{ grid-template-columns: 1fr;/.test(css), 'on a phone the cards are one per row');
ok(/\.ch-tasks li a \{[^}]*min-height: 44px/.test(css) && /\.ch-open \{[^}]*min-height: 48px/.test(css), 'tap targets are at least 44 px');
ok(html.includes('css/client-home.css?v=202611313700'), 'the page loads the new stylesheet');

if (fail) { console.log(`${fail} failed`); process.exit(1); }
console.log('MF-069 client landing: all passed');
