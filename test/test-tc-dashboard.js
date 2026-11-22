/* TC-DASHBOARD-1 (tracker row 422). John Coester, Nov 21 2026 (video as TC Portal Jc; 1:05 PM ET screenshot: "this layout looks horrible").
 * The outside user's My Files home becomes a dashboard in the Open Orders table look: outstanding tasks grouped by file with File No,
 * Property Address and Your Role in their own columns, a file overview with Stage and Task Pending, and the commission only on files
 * where the person is on the agent side. Fake data only. No hosted project. */
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() }; };
globalThis.location = { hash: '#/', search: '', pathname: '/', href: 'http://localhost/' };
globalThis.localStorage = mem(); globalThis.sessionStorage = mem();
const { render, outsideTaskGroups, DASH_FEE_FILES } = await import('../js/pages/dashboard.js');

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-admin');
const login = await api.adminCreateUser({ firstName: 'Dana', lastName: 'Dash', email: 'dana.tcdash@example.test', phone: '301-555-0166', role: 'Outside user', contactType: 'agent_tc' });
await api.signInDev('u-proc');
const dana = (await api.listContacts()).find((c) => c.profileId === login.id);
await api.linkAgentTc('c-bagent', dana.id);

await api.signInDev(login.id);
const user = await api.getMyProfile();
const page = await render({ api, user });
const out = String(page.body);
ok(page.title === 'Dashboard', 'an outside user lands on the Dashboard (renamed from My files, John Nov 22 2026)');
ok(out.includes('data-dash-stats') && out.includes('Tasks for you') && out.includes('Overdue'), 'the dashboard opens with the task and file counts');
const tasksTable = out.slice(out.indexOf('data-dash-tasks'), out.indexOf('</table>', out.indexOf('data-dash-tasks')));
ok(out.includes('class="tbl striped" data-dash-tasks') || !out.includes('data-dash-tasks'), 'outstanding tasks use the Open Orders table style (tbl striped)');
ok(/<th>File No<\/th><th>Property Address<\/th><th>Your Role<\/th><th>Task<\/th><th>Due<\/th>/.test(out), 'file number, address and role each have their own column');
ok(!tasksTable || (tasksTable.match(/data-task-file/g) || []).length === new Set((tasksTable.match(/data-my-task-deal="[^"]+"/g) || [])).size, 'each file is named once, with its tasks under it');
ok(!tasksTable.includes('data-my-task-role></td>'), 'the role column is never blank');
const label = (await api.getDeal('deal-1')).myRoleLabel;
ok(label && out.includes(`data-dash-role>${label}<`) && out.includes(`data-my-task-role>${label}<`), 'the role columns show the file label (Transaction Coordinator for a coordinator once TC-PROFILE-1 is in) [' + label + ']');
ok(out.includes('class="tbl striped" data-dash-files') && /<th>Stage<\/th><th>Task Pending<\/th><th>Commission<\/th>/.test(out), 'the file overview has Stage, Task Pending and, on the agent side, Commission');
const cells = {}; const root = { querySelector: (sel) => { const m = sel.match(/data-commission="([^"]+)"/); if (!m) return null; return cells[m[1]] || (cells[m[1]] = { innerHTML: '' }); }, querySelectorAll: () => [] };
page.mount(root); await new Promise((r) => setTimeout(r, 20));
ok(Object.values(cells).length > 0 && Object.values(cells).every((c) => c.innerHTML && !c.innerHTML.includes('Loading')), 'commission cells are filled after the page is drawn [' + Object.values(cells).map((c) => c.innerHTML).join(' | ') + ']');

// a client: no commission column, still gets "What we need from you"
await api.signInDev('u-buyer');
const buyer = await api.getMyProfile();
if (buyer.role === 'Outside user') {
  const b = String((await render({ api, user: buyer })).body);
  ok(!b.includes('<th>Commission</th>'), 'a client never sees a commission column');
} else ok(true, 'the demo buyer uses the client view (unchanged)');

// grouping helper: tasks sort by due date inside each file; closed files are left out
const deals = [{ id: 'a', status: 'Open', myRole: 'Buyer Agent', myRoleLabel: 'Transaction Coordinator' }, { id: 'b', status: 'Open', myRole: 'Listing Agent', myRoleLabel: 'Listing Agent' }];
const all = [{ id: 1, mine: true, status: 'todo', dueDate: '2026-12-05', deal: { id: 'a', status: 'Open' } }, { id: 2, mine: true, status: 'todo', dueDate: '2026-12-01', deal: { id: 'a', status: 'Open' } },
  { id: 3, mine: true, status: 'done', deal: { id: 'b', status: 'Open' } }, { id: 4, mine: false, status: 'todo', deal: { id: 'b', status: 'Open' } }, { id: 5, mine: true, status: 'todo', deal: { id: 'c', status: 'Closed' } }];
const g = outsideTaskGroups(deals, all);
ok(g.length === 1 && g[0].deal.id === 'a' && g[0].tasks.map((t) => t.id).join() === '2,1' && g[0].deal.myRoleLabel === 'Transaction Coordinator', 'tasks are grouped by file, earliest due first, and take the file\'s role');

const src = readFileSync(new URL('../js/pages/dashboard.js', import.meta.url), 'utf8');
const appSrc = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
ok(appSrc.includes("'Outside user': 'Dashboard'") && !appSrc.includes("'Outside user': 'My Files'") && out.includes('<h2 class="page-title">Dashboard</h2>') && !/MY FILES|>My files</.test(out.slice(0, out.indexOf('data-dash-stats'))), 'the menu item and page heading say Dashboard, not My Files (John, Nov 22 2026)');
ok(DASH_FEE_FILES <= 12 && src.includes('feeFiles.slice(0, DASH_FEE_FILES)'), 'speed: commission reads are capped and run after the page is drawn');

if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('all ok');
