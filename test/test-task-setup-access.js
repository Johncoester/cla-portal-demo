/* Task Templates and the Task Grid are Admin and Super admin only, including Demo mode view-as. */
import { readFileSync } from 'node:fs';
import { routeAllowed, canOpenTaskSetup, legacyTemplatesHash, sectionHash } from '../js/data/locked-links.js';
import { routeWs, navInWs } from '../js/workspace.js';
const R = (page) => ({ page, params: {} });
const admin = { role: 'Admin', isAdmin: true, status: 'active' };
const superA = { role: 'Super admin', isAdmin: true, status: 'active' };
const people = ['Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Outside user', 'Client-Buyer', 'Employee'];
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
for (const page of ['templates', 'admin/templates', 'task-grid']) {
  ok(routeAllowed(admin, R(page)) && routeAllowed(superA, R(page)), page + ' opens for Admin and Super admin');
  for (const role of people) ok(!routeAllowed({ role, isAdmin: false, status: 'active' }, R(page)), role + ' refused ' + page);
}
ok(legacyTemplatesHash('#/templates') === '#/admin/templates', 'old templates link redirects');
ok(legacyTemplatesHash('#/templates?tab=switches') === '#/admin/templates?tab=switches', 'Task switches tab is kept');
ok(legacyTemplatesHash('#/templates?tab=admin') === '#/admin/templates?tab=admin', 'Task admin tab is kept');
ok(legacyTemplatesHash('#/admin/templates') === null && sectionHash('templates') === '#/admin/templates', 'new links are not redirected again');
ok(routeWs({ page: 'admin/templates' }) === 'admin' && routeWs({ page: 'task-grid' }) === 'portal', 'templates move to Admin / Settings; the grid stays in the portal');
ok(navInWs('templates', 'admin') && !navInWs('templates', 'portal') && !navInWs('templates', 'everything'), 'Task Templates is not in the Portal or Everything menus');
ok(navInWs('task-grid', 'portal') && navInWs('task-grid', 'everything'), 'Task Grid stays on the portal menu');
ok(!routeAllowed(superA, R('templates'), { demo: { active: true, role: 'Processor', portalRole: 'Processor' } }), 'demo view as Processor loses Task Templates');
ok(!routeAllowed(superA, R('task-grid'), { demo: { active: true, portalRole: 'Buyer Agent' } }), 'demo view as a buyer agent loses the Task Grid');
ok(!routeAllowed(superA, R('templates'), { demo: { active: true, role: 'Transaction Coordinator' } }), 'demo view as a coordinator loses Task switches and Task admin too');
ok(routeAllowed(superA, R('templates'), { demo: { active: false } }), 'a Demo mode session that is not active keeps Super admin access');
ok(routeAllowed({ role: 'Processor', isAdmin: false }, R('outbox')) && routeAllowed({ role: 'Transaction Coordinator', isAdmin: false }, R('tasks')), 'outbox and All Tasks stay with the people who had them');
ok(canOpenTaskSetup(admin) && canOpenTaskSetup(superA) && !canOpenTaskSetup({ role: 'Processor', isAdmin: false }), 'helper matches the route guard');
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const app = read('../js/app.js');
ok(app.includes("canOpenTaskSetup(u, demo) && modOn('task-grid')") && app.includes("add('templates', 'Task Templates', '#/admin/templates'"), 'the grid stays guarded and templates points at Admin / Settings');
ok(app.includes('legacyTemplatesHash(location.hash)'), 'old #/templates URLs redirect');
ok(app.includes('demo: DEMO_VIEW') && app.includes('You are not authorized to open this page.'), 'a typed URL is refused with a not-authorized message, and Demo mode is part of the guard');
ok(!read('../js/pages/dashboard.js').includes('#/task-grid'), 'the work queue no longer links the Task Grid');
ok(read('../js/pages/tasks.js').includes('user.isAdmin ?') && !read('../js/pages/tasks.js').includes('runsOrders'), 'All Tasks links the grid only for an admin');
console.log(fail ? fail + ' failed' : 'task setup access passed');
if (fail) process.exit(1);
