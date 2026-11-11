/* Role access (John, Nov 9): Super admin grid of roles x modules. Seed = today's behaviour; Processor CRM off hides the CRM and refuses its data
 * in the mock, while Accounting / Place Order source options stay. Fake data only. Nothing is sent. */
import { readFileSync } from 'node:fs';
import { ROLE_ACCESS_SEED, ELIGIBLE, roleAllowed, roleCan, roleHrOk, setRoleAccess, seedRows, canManageRoleAccess, checkRoleAccessChange } from '../js/data/role-access.js?v=202611100100';
import { canUseCrm, CRM_ROLES } from '../js/data/crm.js';
import { acctCanRead, acctCanEdit, ACCT_EDIT_ROLES, ACCT_READ_ROLES } from '../js/data/accounting.js';
import { hrVisibleFor } from '../js/data/hr.js';
import { routeAllowed } from '../js/data/locked-links.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const ROLES = ['Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin', 'Outside user', 'Employee'];
const user = (role) => ({ id: 'x', role, isAdmin: role === 'Admin' || role === 'Super admin', status: 'active', hrRole: role === 'Super admin' ? 'super' : 'employee' });
// the hard-coded rules before this change
const oldCrm = (u) => !!u && (!!u.isAdmin || ['Processor', 'Preprocessor', 'Sales Person', 'Sales Team'].includes(u.role));
const oldRead = (u) => !!u && (u.isAdmin || ACCT_EDIT_ROLES.includes(u.role) || ACCT_READ_ROLES.includes(u.role));
const oldEdit = (u) => !!u && (u.isAdmin || ACCT_EDIT_ROLES.includes(u.role));
const oldHr = (u, a) => !!u && !!u.hrRole && !u.accountRole && u.role !== 'Outside user' && (u.hrRole === 'super' ? a !== 'off' : a === 'live');
const oldScopeAll = (u) => u.isAdmin || ['Processor', 'Preprocessor', 'Sales Team'].includes(u.role);

for (const loaded of [false, true]) {
  setRoleAccess(loaded ? seedRows() : null);
  for (const r of ROLES) { const u = user(r);
    ok(canUseCrm(u) === oldCrm(u) && acctCanRead(u) === oldRead(u) && acctCanEdit(u) === oldEdit(u) && hrVisibleFor(u, 'live') === oldHr(u, 'live') && hrVisibleFor(u, 'beta') === oldHr(u, 'beta')
      && (u.isAdmin || roleAllowed(r, 'crm_all_deals') === true) === oldScopeAll(u), `${loaded ? 'loaded seed' : 'not loaded'}: ${r} sees exactly what it saw before`); }
}
ok(CRM_ROLES.join() === ELIGIBLE.crm.join(), 'the CRM grid rows are the old CRM_ROLES');
ok(seedRows().length === 18 && !seedRows().some((r) => ['Admin', 'Super admin', 'Outside user', 'Employee'].includes(r.role)), 'eighteen seeded rows; never Admin / Super admin / outside / Employee');
ok(ROLE_ACCESS_SEED.crm_all_deals['Sales Person'] === false && ROLE_ACCESS_SEED.crm.Processor === true, 'seed keeps Processor CRM on (John flips it after release)');

// Processor CRM off: only the CRM changes for Processors
setRoleAccess(seedRows().map((r) => (r.role === 'Processor' && r.module === 'crm' ? { ...r, allowed: false } : r)));
ok(!canUseCrm(user('Processor')) && canUseCrm(user('Preprocessor')) && canUseCrm(user('Super admin')) && canUseCrm(user('Admin')), 'Processor CRM off: Processor loses the CRM, others keep it');
ok(roleAllowed('Processor', 'crm_all_deals') === false, 'all deals needs the CRM');
ok(acctCanEdit(user('Processor')) && hrVisibleFor(user('Processor'), 'live'), 'Processor keeps Accounting and HR');
ok(!routeAllowed(user('Processor'), { page: 'crm', params: {} }) && routeAllowed(user('Processor'), { page: 'orders/new', params: {} }), 'Processor: #/crm refused, Place Order still allowed');
// everything off: Admins / Super admins still have it all; HR-only logins keep HR
setRoleAccess(seedRows().map((r) => ({ ...r, allowed: false })));
ok(['Admin', 'Super admin'].every((r) => canUseCrm(user(r)) && acctCanEdit(user(r)) && roleCan(user(r), 'crm_all_deals') && roleHrOk(user(r))), 'Admins / Super admins keep everything with every box off');
ok(!acctCanRead(user('Transaction Coordinator')) && !hrVisibleFor(user('Sales Team'), 'live') && roleHrOk(user('Employee')), 'TC loses Accounting, Sales Team loses HR, an HR-only login keeps HR');
setRoleAccess(null);
ok(canManageRoleAccess(user('Super admin')) && !canManageRoleAccess(user('Admin')) && !canManageRoleAccess(user('Processor')), 'only a Super admin manages Role access');
for (const [r, m, v, re] of [['Super admin', 'crm', false, /always/], ['Admin', 'hr', false, /always/], ['Outside user', 'crm', true, /cannot get/], ['Transaction Coordinator', 'crm', true, /cannot get/], ['Processor', 'nope', true, /Unknown/], ['Processor', 'crm', 'x', /on or off/]]) {
  let t = ''; try { checkRoleAccessChange(r, m, v); } catch (e) { t = e.message; } ok(re.test(t), `refused: ${r} / ${m} / ${v}`); }

// mock adapter: the screen, the log, the gate on the data calls
const sa = createMockAdapter({ storage: mem(), sessionStorage: mem() }); await sa.signInDev('u-admin');
const list = await sa.listRoleAccess();
ok(list.roles.length === 5 && list.modules.map((m) => m.id).join() === 'crm,crm_all_deals,accounting,hr' && list.rows.length === 18 && list.log.length === 0, 'Super admin sees the grid (5 roles x 4 areas) and an empty log');
const store = mem(); const a1 = createMockAdapter({ storage: store, sessionStorage: mem() }); await a1.signInDev('u-admin');
await a1.setRoleAccess('Processor', 'crm', false);
let t = ''; try { await a1.setRoleAccess('Super admin', 'crm', false); } catch (e) { t = e.message; } ok(/always/.test(t), 'mock: a Super admin cannot remove Super admin access');
const after = await a1.listRoleAccess();
ok(after.log.length === 1 && after.log[0].role === 'Processor' && after.log[0].old === true && after.log[0].new === false && after.log[0].byName, 'the change is logged with who');
ok(after.rows.find((r) => r.role === 'Processor' && r.module === 'crm').updatedBy === 'u-admin', 'the row carries who changed it');
const adam = createMockAdapter({ storage: store, sessionStorage: mem() }); await adam.signInDev('u-adam');
t = ''; try { await adam.setRoleAccess('Processor', 'crm', true); } catch (e) { t = e.message; } ok(/Only a Super admin/.test(t), 'a plain Admin cannot change Role access');
const pr = createMockAdapter({ storage: store, sessionStorage: mem() }); await pr.signInDev('u-proc');
t = ''; try { await pr.listRoleAccess(); } catch (e) { t = e.message; } ok(/Only a Super admin/.test(t), 'a Processor cannot open Role access');
await pr.getModuleAccess();
t = ''; try { await pr.crmMe(); } catch (e) { t = e.message; } ok(/CLA staff only/.test(t), 'mock: Processor CRM data calls refuse once CRM is off');
let srcOk = false; try { const s = await pr.listSourceOptions(); srcOk = Array.isArray(s) && s.length > 0; } catch (e) { srcOk = false; }
ok(srcOk, 'mock: Processor still gets the Place Order source of business list');
await a1.setRoleAccess('Processor', 'crm', true);
const pr2 = createMockAdapter({ storage: store, sessionStorage: mem() }); await pr2.signInDev('u-proc'); await pr2.getModuleAccess();
let me = null; try { me = await pr2.crmMe(); } catch (e) { me = null; } ok(!!me && me.canEdit === false, 'turning it back on restores read-only CRM for the Processor');

// the page, nav and route are wired
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8'); const ws = readFileSync(new URL('../js/workspace.js', import.meta.url), 'utf8');
const mig = readFileSync(new URL('../supabase/migrations/20261110010000_role_module_access.sql', import.meta.url), 'utf8');
ok(app.includes("'role-access': () => import('./pages/role-access.js?v=") && app.includes("if (canManageRoleAccess(u)) add('role-access', 'Role access', '#/role-access'"), 'Role access page and nav item (Super admin)');
ok(ws.includes("'role-access': 'admin'") && ws.includes("'modules', 'role-access', 'underwriters'"), 'Role access lives in Admin / Settings');
ok(!/create or replace function private\.crm_user\(/i.test(mig), 'the migration does not change private.crm_user()');
ok(/\('Processor', 'crm', true\)/.test(mig) && /\('Sales Person', 'crm_all_deals', false\)/.test(mig), 'the SQL seed keeps Processor CRM on and Sales Person on own deals');
console.log(fail ? fail + ' failed' : 'role access passed');
if (fail) process.exit(1);
