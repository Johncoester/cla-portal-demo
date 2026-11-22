/* FF-101a. Francis Nov 18 2026 11 AM notes, confirmed by John Nov 18 2:13 PM ET.
 * Agents see only their own tasks; the general Tasks tab is removed. A TC acting
 * for an agent still sees and completes that agent's tasks (TC-3). Fake data only. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { toText } from '../js/ui.js';
import { render as renderTasks } from '../js/pages/dealtasks.js';
import { isAgent } from '../js/data/constants.js';

const { window, document } = parseHTML('<!doctype html><html><body></body></html>');
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.scrollTo = () => {};
globalThis.window = window; globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node;
const hash = { value: '#/deals/deal-1/tasks' };
Object.defineProperty(globalThis, 'location', { configurable: true, value: { get hash() { return hash.value; }, set hash(v) { hash.value = v; }, pathname: '/', search: '' } });

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const clientNav = readFileSync(new URL('../js/pages/client-overview.js', import.meta.url), 'utf8');
const dealSrc = readFileSync(new URL('../js/pages/deal.js', import.meta.url), 'utf8');
ok(app.includes('fileAgent') && app.includes('tasksNav') && app.includes('fileAgent ? myTasksLink'), 'the file menu drops Tasks for agents and keeps My Tasks');
ok(clientNav.includes("agent ? '' : tab('tasks'") || clientNav.includes('agent ? \'\' : tab(\'tasks\''), 'the agent pill tabs drop the general Tasks tab');
ok(dealSrc.includes('myTasksHref') && dealSrc.includes('data-my-tasks'), 'the agent overview opens My Tasks, not the general list');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
function fileUser(session, deal) {
  return session.role === 'Outside user' && deal.myRole ? { ...session, role: deal.myRole, roles: deal.myRoles || [deal.myRole], accountRole: session.role } : session;
}

await api.signInDev('u-bagent');
const agentDeal = await api.getDeal('deal-1');
ok(isAgent(agentDeal.myRole), 'buyer agent is on the file as Buyer Agent');
const agentTasks = await api.listTasks('deal-1');
ok(agentTasks.length > 0 && agentTasks.every((t) => t.assignedRole === 'Buyer Agent' || t.mine), 'buyer agent list is only buyer-agent tasks');
ok(!agentTasks.some((t) => t.assignedRole === 'Client-Buyer' || t.assignedRole === 'Client-Seller' || t.assignedRole === 'Listing Agent'), 'buyer agent does not see client or listing-agent tasks');

hash.value = '#/deals/deal-1/tasks';
const session = await api.getSession();
const user = fileUser(session, agentDeal);
const view = await renderTasks({ api, user, deal: agentDeal, refresh() {} });
const html = toText(view.body);
ok(html.includes('data-file-tasks="mine"') && html.includes('My Tasks'), 'opening Tasks as an agent still shows My Tasks only');
ok(!html.includes('data-sidebox="buyer"') && !html.includes('data-sidebox="seller"') && !html.includes('data-sidebox="listing-agent"'), 'agent My Tasks hides other sides');

await api.signInDev('u-proc');
const staffTasks = await api.listTasks('deal-1');
ok(staffTasks.some((t) => t.assignedRole === 'Client-Buyer') && staffTasks.some((t) => t.assignedRole === 'Buyer Agent'), 'staff still see every side');

await api.signInDev('u-admin');
const login = await api.adminCreateUser({ firstName: 'Riley', lastName: 'OwnTasks', email: 'riley.owntasks@example.test', phone: '301-555-0177', role: 'Outside user', contactType: 'realtor' });
await api.signInDev('u-proc');
const riley = (await api.listContacts()).find((c) => c.profileId === login.id);
await api.linkAgentTc('c-bagent', riley.id);
await api.signInDev(login.id);
const asAgent = await api.getDeal('deal-1');
ok(asAgent.myRole === 'Buyer Agent', 'the coordinator acts as the buyer\'s agent');
const tcTasks = await api.listTasks('deal-1');
const warranty = tcTasks.find((t) => t.templateCode === 'agent_home_warranty' && t.ownerId === 'u-bagent');
ok(!!warranty, 'the coordinator still sees the agent\'s home warranty task');
ok(!tcTasks.some((t) => t.assignedRole === 'Client-Buyer'), 'the coordinator does not see buyer client tasks');
const done = await api.submitAgentTask(warranty.id, { willPurchase: 'No' });
ok(done.completedBy === login.id && /on behalf of/i.test(done.completedByLabel || ''), 'the coordinator still completes the agent\'s task on their behalf');

const mig = readFileSync(new URL('../supabase/migrations/20261125280000_agent_own_tasks.sql', import.meta.url), 'utf8');
const rb = readFileSync(new URL('../supabase/rollbacks/20261125280000_agent_own_tasks.sql', import.meta.url), 'utf8');
const md5 = createHash('md5').update(mig).digest('hex');
ok(mig.includes('outside_readable_task_ids') && mig.includes('agent_tc_links') && !/side_of\(t\.assigned_role\)/.test(mig.split('outside_readable_task_ids')[1].split('$tasks$')[1] || ''), 'the database drops side-wide agent reads and keeps the coordinator');
ok(rb.includes('side_of(t.assigned_role)') && rb.includes('outside_readable_task_ids'), 'rollback puts the side-wide agent read back');
ok(/^[a-f0-9]{32}$/.test(md5), 'migration md5 ' + md5);

console.log(fail ? `ff-101a: ${fail} failed` : 'ff-101a passed');
if (fail) process.exit(1);
