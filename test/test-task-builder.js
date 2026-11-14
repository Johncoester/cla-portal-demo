/* TB-1 Task Builder (John, Nov 13 2026; docs/specs/task-builder.md): its own Admin menu item, Admin / Super admin only,
 * a list of flows (name, what starts it, On / Off), new flows start Off, every change kept in a history. Flows do not run yet. */
import { readFileSync } from 'node:fs';
import { cleanFlow, canManageTaskBuilder, triggerText, TRIGGERS, triggerNeedsDays } from '../js/data/task-builder.js';
import { routeAllowed, SECTIONS } from '../js/data/locked-links.js';
import { routeWs } from '../js/workspace.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { toText } from '../js/ui.js';
import { render } from '../js/pages/task-builder.js';

globalThis.location = { origin: 'https://test.example', pathname: '/portal/', hash: '#/task-builder', reload() {} };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const err = (fn) => { try { fn(); return ''; } catch (e) { return e.message; } };
const aerr = async (p) => { try { await p; return ''; } catch (e) { return e.message; } };
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

// rules
ok(TRIGGERS.map((t) => t.code).join() === 'order_opened,contract_received,emd_received,emd_not_received,commitment_received,closing_date_set,days_before_closing', 'the starter list of triggers');
ok(triggerNeedsDays('emd_not_received') && triggerNeedsDays('days_before_closing') && !triggerNeedsDays('order_opened'), 'only the two day-based triggers need days');
ok(triggerText('emd_not_received', 2) === 'EMD not received, 2 days after the order was opened' && triggerText('days_before_closing', 1) === 'Days before closing, 1 day before the closing date', 'trigger text reads in plain words');
ok(/Give the flow a name/.test(err(() => cleanFlow({ name: '  ', trigger: 'order_opened' }))), 'a blank name is refused in plain words');
ok(/too short/.test(err(() => cleanFlow({ name: 'ab', trigger: 'order_opened' }))), 'a two-letter name is refused');
ok(/Choose what starts/.test(err(() => cleanFlow({ name: 'EMD reminder' }))), 'a missing trigger is refused');
ok(/not on the list/.test(err(() => cleanFlow({ name: 'EMD reminder', trigger: 'drop table' }))), 'an unknown trigger is refused');
ok(/how many days/.test(err(() => cleanFlow({ name: 'EMD reminder', trigger: 'emd_not_received' }))), 'EMD not received needs days');
ok(/1 to 60/.test(err(() => cleanFlow({ name: 'EMD reminder', trigger: 'emd_not_received', triggerDays: '61' }))) && /1 to 60/.test(err(() => cleanFlow({ name: 'EMD reminder', trigger: 'emd_not_received', triggerDays: '1.5' }))), 'days must be a whole number from 1 to 60');
const c = cleanFlow({ name: '  EMD   reminder ', trigger: 'order_opened', triggerDays: '4', description: ' x ' });
ok(c.name === 'EMD reminder' && c.triggerDays === null && c.description === 'x', 'spaces are tidied and days are dropped for a trigger that has none');

// who can use it
const user = (role, extra = {}) => ({ id: 'u', role, isAdmin: role === 'Admin' || role === 'Super admin', status: 'active', ...extra });
ok(canManageTaskBuilder(user('Admin')) && canManageTaskBuilder(user('Super admin')), 'Admins and Super admins can use Task Builder');
ok(!canManageTaskBuilder(user('Processor')) && !canManageTaskBuilder(user('Sales Person')) && !canManageTaskBuilder(user('Admin', { status: 'removed' })) && !canManageTaskBuilder(null), 'Processors, sales and removed admins cannot');
const route = { page: 'task-builder', params: {} };
ok(routeAllowed(user('Admin'), route) && routeAllowed(user('Super admin'), route), 'the page is open to Admins and Super admins');
ok(!routeAllowed(user('Processor'), route) && !routeAllowed(user('Buyer Agent'), route) && !routeAllowed(user('Client-Buyer'), route), 'a Processor, agent or client gets Not authorized');
ok(!routeAllowed(user('Super admin'), route, { demo: { active: true, portalRole: 'Processor' } }), 'Demo mode follows the persona being viewed');
ok(SECTIONS['task-builder'] === '/task-builder' && routeWs(route) === 'admin', 'a section link opens it, in the Admin workspace');

// menu: its own item, not under Task Templates
const app = read('js/app.js');
ok(/add\('task-builder', 'Task Builder', '#\/task-builder', 'task'\)/.test(app) && app.includes("if (canOpenTaskSetup(u, demo)) add('task-builder'"), 'Task Builder is its own admin menu item for Admins and Super admins');
ok(app.includes("'task-builder': () => import('./pages/task-builder.js?v=202611211000')"), 'the page is registered at its stamp');

// the mock portal
const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-proc');
ok(/Only an Admin or Super admin/.test(await aerr(api.listTaskFlows())) && /Only an Admin or Super admin/.test(await aerr(api.createTaskFlow({ name: 'Sneaky', trigger: 'order_opened' }))), 'a Processor cannot read or add flows');
await api.signInDev('u-adam');
ok((await api.listTaskFlows()).flows.length === 0, 'no flows to start with');
const f0 = await api.createTaskFlow({ name: 'No steps yet', trigger: 'order_opened' });
ok(f0.active === false && f0.steps.length === 0, 'a new flow starts Off, and can be saved with no steps');
ok(/Add at least one/.test(await aerr(api.setTaskFlowActive(f0.id, true))), 'TB-2: a flow with no task step cannot be turned on');
const STEPS = [{ type: 'create_task', title: 'Chase the EMD', assignTo: 'Buyer Agent', dueDays: 1 }];
const f1 = await api.createTaskFlow({ name: 'EMD reminder', trigger: 'emd_not_received', triggerDays: 2, description: 'Chase the EMD', steps: STEPS });
ok(f1.active === false && f1.triggerText === 'EMD not received, 2 days after the order was opened' && f1.steps.length === 1, 'a new flow with a step starts Off');
ok(/already has that name/.test(await aerr(api.createTaskFlow({ name: 'emd  REMINDER', trigger: 'order_opened' }))), 'two flows cannot share a name (case and spacing do not count)');
ok(/Days must be/.test(await aerr(api.createTaskFlow({ name: 'Too long wait', trigger: 'days_before_closing', triggerDays: 90 }))), 'the adapter checks days too');
await api.updateTaskFlow(f1.id, { name: 'EMD reminder', trigger: 'emd_not_received', triggerDays: 3, description: 'Chase the EMD', steps: STEPS });
const on = await api.setTaskFlowActive(f1.id, true);
ok(on.active === true, 'a flow can be turned on');
await api.setTaskFlowActive(f1.id, true);
await api.signInDev('u-admin');
const off = await api.setTaskFlowActive(f1.id, false);
ok(off.active === false && off.updatedByName === 'King John Admin', 'a Super admin can turn it off, and the change shows who');
const list = await api.listTaskFlows();
const mine = list.log.filter((l) => l.flowId === f1.id);
ok(mine.map((l) => l.action).join() === 'turned off,turned on,changed,created', 'the history keeps each change once, newest first');
ok(/2 days after .* now EMD not received, 3 days/.test(mine[2].detail) && mine[3].byName === 'Adam Admin', 'the history says what changed and who did it');
ok(/not found/.test(await aerr(api.setTaskFlowActive('flow-nope', true))), 'a missing flow gives a plain message');

// the page
const page = await render({ api, user: { id: 'u-admin', role: 'Super admin', isAdmin: true, status: 'active' }, refresh() {} });
const body = toText(page.body);
ok(page.title === 'Task Builder' && body.includes('data-tb-new') && body.includes('EMD reminder') && body.includes('data-tb-on=') && body.includes('check open files about every 15 minutes') && body.includes('data-tb-run-now') && body.includes('data-tb-runs'), 'the page lists flows with an On / Off switch, Check files now and recent runs');
ok(/does not exist/.test(await aerr(render({ api, user: user('Processor'), refresh() {} }))), 'the page refuses a Processor');

// the database file
const mig = read('supabase/migrations/20261120010000_task_builder_flows.sql');
const rb = read('supabase/rollbacks/20261120010000_task_builder_flows.sql');
ok((mig.match(/if not private\.is_admin\(\) then raise exception 'Only an Admin or Super admin can use Task Builder\.'/g) || []).length === 3, 'every database function is Admin / Super admin only');
ok(/revoke all on public\.task_flows from public, anon, authenticated/.test(mig) && /revoke all on public\.task_flow_log from public, anon, authenticated/.test(mig) && !/create policy/i.test(mig), 'nobody reads or writes the tables directly');
ok(/active boolean not null default false/.test(mig) && /values \(v_name, v_desc, p_trigger, v_days, false/.test(mig), 'new flows start Off in the database too');
ok(/drop table if exists public\.task_flows/.test(rb) && /drop function if exists public\.save_task_flow/.test(rb), 'the rollback removes the tables and functions');

console.log(fail ? `${fail} failed` : 'all passed');
process.exit(fail ? 1 : 0);
