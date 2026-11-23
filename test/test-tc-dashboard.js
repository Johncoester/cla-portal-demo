/* TC-DASHBOARD-1 (tracker row 422). John Coester, Nov 21 2026 (video as TC Portal Jc; 1:05 PM ET screenshot: "this layout looks horrible").
 * The outside user's My Files home becomes a dashboard in the Open Orders table look: outstanding tasks grouped by file with File No,
 * Property Address and Your Role in their own columns, a file overview with Stage and Task Pending, and the commission only on files
 * where the person is on the agent side.
 * Nov 22 2026 (John chat 1:23-1:26 PM ET): outstanding / overdue EMDs, ALTA review needed (closing in the next 2 days),
 * File Overview EMD received Yes/No, and admin fees the agents entered. Fake data only. No hosted project. */
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { localDate } from '../js/data/constants.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() }; };
globalThis.location = { hash: '#/', search: '', pathname: '/', href: 'http://localhost/' };
globalThis.localStorage = mem(); globalThis.sessionStorage = mem();
const { render, outsideTaskGroups, DASH_FEE_FILES, outstandingEmds, altaReviewNeeded, emdReceivedLabel, adminFeesText, ALTA_REVIEW_DAYS } = await import('../js/pages/dashboard.js');

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const plusDays = (iso, n) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '')); if (!m) return ''; const d = new Date(+m[1], +m[2] - 1, +m[3] + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// helpers: overdue first, received files left out, refinance left out; ALTA is today through today+2 only
const today = '2026-11-22';
const emdList = outstandingEmds([
  { id: 'over', status: 'Open', fileNumber: 'B', emdAmount: 1000, emdDueDate: '2026-11-01', emdReceived: false },
  { id: 'open', status: 'Open', fileNumber: 'A', emdAmount: 2000, emdDueDate: '2026-12-01', emdReceived: false, emdHolder: 'CLA Title' },
  { id: 'got', status: 'Open', fileNumber: 'C', emdAmount: 3000, emdDueDate: '2026-10-01', emdReceived: true },
  { id: 'none', status: 'Open', fileNumber: 'D' },
  { id: 'refi', status: 'Open', fileNumber: 'E', transactionType: 'Refinance', emdAmount: 1, emdDueDate: '2026-10-01' },
  { id: 'shut', status: 'Closed', fileNumber: 'F', emdAmount: 1, emdDueDate: '2026-10-01' },
], today);
ok(emdList.map((r) => r.deal.id).join() === 'over,open' && emdList[0].overdue && !emdList[1].overdue, 'outstanding EMDs are open unpaid files with EMD info, overdue first');
ok(altaReviewNeeded([
  { id: 'today', status: 'Open', closingDate: '2026-11-22', fileNumber: 'A' },
  { id: 'two', status: 'Open', closingDate: '2026-11-24', fileNumber: 'B' },
  { id: 'three', status: 'Open', closingDate: '2026-11-25', fileNumber: 'C' },
  { id: 'past', status: 'Open', closingDate: '2026-11-21', fileNumber: 'D' },
  { id: 'shut', status: 'Closed', closingDate: '2026-11-23', fileNumber: 'E' },
], today).map((d) => d.id).join() === 'today,two', 'ALTA review is open files closing today through today+2, not past or later');
ok(ALTA_REVIEW_DAYS === 2 && emdReceivedLabel({ emdReceived: true }) === 'Yes' && emdReceivedLabel({ emdReceived: false }) === 'No' && emdReceivedLabel({ transactionType: 'Refinance' }) === '—', 'EMD received is Yes or No, or a dash on a refinance');
ok(adminFeesText({ admin: { amount: 395 }, other: [{ description: 'Courier', amount: 50 }] }) === 'Admin fee $395; Courier $50' && adminFeesText({ commission: { amount: 1000 } }) === '', 'admin fees list the admin fee and other fees, not the commission');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-admin');
const login = await api.adminCreateUser({ firstName: 'Dana', lastName: 'Dash', email: 'dana.tcdash@example.test', phone: '301-555-0166', role: 'Outside user', contactType: 'agent_tc' });
await api.signInDev('u-proc');
const dana = (await api.listContacts()).find((c) => c.profileId === login.id);
await api.linkAgentTc('c-bagent', dana.id);
const officeToday = localDate();
const closeSoon = plusDays(officeToday, 1);
await api.updateDeal('deal-1', { closingDate: closeSoon, emdHolder: 'CLA Title (fake)' });
await api.updateEmdAlta('deal-5', { received: true, receivedDate: officeToday });
await api.saveAgentFees('deal-1', 'buyer', { commission: { basis: 'percent', percent: 2.5, amount: 12125, payer: 'buyer' }, admin: { amount: 395, payer: 'buyer' }, other: [{ description: 'Courier', amount: 50, paidTo: 'Courier Co', payer: 'buyer' }] }, '');

await api.signInDev(login.id);
const user = await api.getMyProfile();
const page = await render({ api, user });
const out = String(page.body);
ok(page.title === 'Dashboard', 'an outside user lands on the Dashboard (renamed from My files, John Nov 22 2026)');
ok(out.includes('data-dash-stats') && out.includes('Tasks for you') && out.includes('Overdue'), 'the dashboard opens with the task and file counts');
ok(out.includes('data-my-tasks') && out.includes('Outstanding tasks') && out.includes('File overview'), 'outstanding tasks and file overview stay on the dashboard');
const tasksTable = out.slice(out.indexOf('data-dash-tasks'), out.indexOf('</table>', out.indexOf('data-dash-tasks')));
ok(out.includes('class="tbl striped" data-dash-tasks') || !out.includes('data-dash-tasks'), 'outstanding tasks use the Open Orders table style (tbl striped)');
ok(/<th>File No<\/th><th>Property Address<\/th><th>Your Role<\/th><th>Task<\/th><th>Due<\/th>/.test(out), 'file number, address and role each have their own column');
ok(!tasksTable || (tasksTable.match(/data-task-file/g) || []).length === new Set((tasksTable.match(/data-my-task-deal="[^"]+"/g) || [])).size, 'each file is named once, with its tasks under it');
ok(!tasksTable.includes('data-my-task-role></td>'), 'the role column is never blank');
const label = (await api.getDeal('deal-1')).myRoleLabel;
ok(label && out.includes(`data-dash-role>${label}<`) && out.includes(`data-my-task-role>${label}<`), 'the role columns show the file label (Transaction Coordinator for a coordinator once TC-PROFILE-1 is in) [' + label + ']');
ok(out.includes('class="tbl striped" data-dash-files') && /<th>Closing Date<\/th><th>EMD Received<\/th><th>Stage<\/th><th>Task Pending<\/th><th>Commission<\/th><th>Admin fees<\/th>/.test(out), 'the file overview has EMD received, Stage, Task Pending, Commission and Admin fees');

ok(out.includes('data-emd-card') && out.includes('Outstanding / overdue EMDs') && out.includes('data-emd-file="deal-1"') && out.includes('data-emd-overdue="yes"'), 'the EMD card lists deal-1 as overdue');
ok(!out.includes('data-emd-file="deal-5"'), 'an EMD marked received is left off the outstanding EMD card');
ok(out.includes('data-alta-card') && out.includes('ALTA review needed') && out.includes('data-alta-file="deal-1"') && !out.includes('data-alta-file="deal-5"'), 'ALTA review needed lists the file closing tomorrow, not a later closing');
ok(out.includes('closing-date reminder') || out.includes('does not read an ALTA status'), 'the ALTA card says this is a closing-date reminder');
ok(out.includes('data-emd-received="deal-1">No<') && out.includes('data-emd-received="deal-5">Yes<'), 'file overview shows EMD received Yes or No');

const cells = {}; const root = { querySelector: (sel) => { const m = sel.match(/data-(commission|admin-fees)="([^"]+)"/); if (!m) return null; const key = m[1] + ':' + m[2]; return cells[key] || (cells[key] = { innerHTML: '' }); }, querySelectorAll: () => [] };
page.mount(root); await new Promise((r) => setTimeout(r, 40));
ok(Object.keys(cells).some((k) => k.startsWith('commission:')) && Object.values(cells).every((c) => c.innerHTML && !c.innerHTML.includes('Loading')), 'commission cells are filled after the page is drawn [' + Object.values(cells).map((c) => c.innerHTML).join(' | ') + ']');
const adminCell = cells['admin-fees:deal-1'];
ok(adminCell && adminCell.innerHTML.includes('395') && adminCell.innerHTML.includes('Courier') && adminCell.innerHTML.includes('50'), 'admin fees on the file overview show the admin fee and the other fee label [' + (adminCell && adminCell.innerHTML) + ']');

// a client: no commission or admin fees column, still gets "What we need from you"
await api.signInDev('u-buyer');
const buyer = await api.getMyProfile();
const buyerPage = await render({ api, user: buyer });
const b = String(buyerPage.body);
if (buyer.role === 'Outside user') {
  ok(!b.includes('<th>Commission</th>') && !b.includes('<th>Admin fees</th>'), 'a client never sees a commission or admin fees column');
} else ok(!b.includes('<th>Commission</th>') && !b.includes('<th>Admin fees</th>'), 'the demo buyer uses the client view and does not see fee columns');

// staff dashboards are unchanged: no EMD / ALTA cards from this item
await api.signInDev('u-proc');
const procPage = String((await render({ api, user: await api.getMyProfile() })).body);
ok(!procPage.includes('data-emd-card') && !procPage.includes('data-alta-card'), 'a processor work queue is unchanged');
await api.signInDev('u-tc');
const tcStaff = String((await render({ api, user: await api.getMyProfile() })).body);
ok(!tcStaff.includes('data-emd-card') && tcStaff.includes('data-tc-dashboard-files'), 'a staff coordinator still gets the coordination dashboard');

// grouping helper: tasks sort by due date inside each file; closed files are left out
const deals = [{ id: 'a', status: 'Open', myRole: 'Buyer Agent', myRoleLabel: 'Transaction Coordinator' }, { id: 'b', status: 'Open', myRole: 'Listing Agent', myRoleLabel: 'Listing Agent' }];
const all = [{ id: 1, mine: true, status: 'todo', dueDate: '2026-12-05', deal: { id: 'a', status: 'Open' } }, { id: 2, mine: true, status: 'todo', dueDate: '2026-12-01', deal: { id: 'a', status: 'Open' } },
  { id: 3, mine: true, status: 'done', deal: { id: 'b', status: 'Open' } }, { id: 4, mine: false, status: 'todo', deal: { id: 'b', status: 'Open' } }, { id: 5, mine: true, status: 'todo', deal: { id: 'c', status: 'Closed' } }];
const g = outsideTaskGroups(deals, all);
ok(g.length === 1 && g[0].deal.id === 'a' && g[0].tasks.map((t) => t.id).join() === '2,1' && g[0].deal.myRoleLabel === 'Transaction Coordinator', 'tasks are grouped by file, earliest due first, and take the file\'s role');

const src = readFileSync(new URL('../js/pages/dashboard.js', import.meta.url), 'utf8');
const appSrc = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
ok(appSrc.includes("'Outside user': 'Dashboard'") && !appSrc.includes("'Outside user': 'My Files'") && out.includes('<h2 class="page-title">Dashboard</h2>') && !/MY FILES|>My files</.test(out.slice(0, out.indexOf('data-dash-stats'))), 'the menu item and page heading say Dashboard, not My Files (John, Nov 22 2026)');
ok(DASH_FEE_FILES <= 12 && src.includes('feeFiles.slice(0, DASH_FEE_FILES)'), 'speed: fee reads are capped and run after the page is drawn');

if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('all ok');
