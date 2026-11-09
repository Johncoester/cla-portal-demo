/* Francis + John, Nov 9 ("Sales Person Portal- (HR Portal)"): HR Add Employee offers Designation 'Sales Person' and Location 'Florida'
   (plus the other CLA states), and an HR invite gives a NEW login the portal role of its designation (never Admin).
   Run: node test/test-hr-portal-role.js */
import { readFileSync } from 'node:fs';
import { WORK_LOCATIONS, HR_PORTAL_ROLE_BY_DESIGNATION, portalRoleForDesignation } from '../js/data/hr.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

// ---- locations ----
for (const l of ['Florida', 'Virginia', 'Washington, DC', 'Rockville, MD (office)', 'Annapolis, MD (office)']) ok(WORK_LOCATIONS.includes(l), 'location offered: ' + l);
ok(new Set(WORK_LOCATIONS).size === WORK_LOCATIONS.length, 'no duplicate locations');

// ---- role map ----
ok(portalRoleForDesignation('Processor') === 'Processor', 'Processor -> Processor');
ok(portalRoleForDesignation('Sales Person') === 'Sales Person', 'Sales Person -> Sales Person');
ok(portalRoleForDesignation('  sales   person ') === 'Sales Person', 'case / extra spaces ignored');
ok(portalRoleForDesignation('Preprocessor') === 'Preprocessor', 'Preprocessor -> Preprocessor');
ok(portalRoleForDesignation('Transaction Coordinator') === 'Transaction Coordinator', 'Transaction Coordinator -> Transaction Coordinator');
for (const n of ['Administrator', 'Admin', 'Super admin', 'CEO', 'Manager', 'Vice-President', '', null, undefined]) ok(portalRoleForDesignation(n) === 'Employee', `${JSON.stringify(n)} -> Employee`);
ok(Object.values(HR_PORTAL_ROLE_BY_DESIGNATION).every((r) => !/admin/i.test(r)), 'the map never contains an Admin role');
ok(Object.isFrozen(HR_PORTAL_ROLE_BY_DESIGNATION), 'the map is frozen');

// ---- SQL mirrors the map, guarded, with an exact rollback ----
const mig = read('supabase/migrations/20261109170000_hr_invite_portal_role.sql');
const rb = read('supabase/rollbacks/20261109170000_hr_invite_portal_role.sql');
const fn = mig.slice(mig.indexOf('create function private.hr_portal_role_for'), mig.indexOf('revoke all on function private.hr_portal_role_for'));
for (const [k, v] of Object.entries(HR_PORTAL_ROLE_BY_DESIGNATION)) ok(fn.includes(`when '${k}' then '${v}'`), `SQL map has ${k} -> ${v}`);
ok(!/'(Admin|Super admin)'/.test(fn) && !/is_admin/.test(fn), 'SQL helper never returns Admin / Super admin or touches is_admin');
ok(fn.includes("'Employee')"), 'SQL helper falls back to Employee');
ok((mig.match(/private\.hr_portal_role_for\(e\.designation_id\)/g) || []).length === 2, 'both accept paths use the map for a NEW profile');
ok(!/update public\.profiles/i.test(mig), 'migration never updates existing profiles');
ok(!/create policy|alter policy|drop policy/i.test(mig), 'no RLS policy change');
ok(mig.includes("6a5908277c7699a08ed6aa80c85112d8") && mig.includes("b7069ecd96238da4524b482549a7647d"), 'migration refuses to run on drifted functions');
ok(/insert into public\.hr_designations \(name\)\s+select 'Sales Person' where not exists/.test(mig), 'adds the Sales Person designation once');
ok((rb.match(/else '' end, 'Employee'\);/g) || []).length === 2, 'rollback restores both functions with role Employee');
ok(rb.includes('drop function if exists private.hr_portal_role_for(uuid)'), 'rollback drops the helper');

// ---- Add Employee page shows the portal access the invite will give ----
const page = read('js/pages/hr.js');
ok(page.includes('data-hr-portal-role') && page.includes('portalRoleForDesignation('), 'Add Employee shows "Portal access" for the picked designation');
const mock = read('js/data/mock-part-hr.js');
ok(mock.includes("['hrg-salesp', 'Sales Person']") && /role: portalRoleForDesignation\(/.test(mock), 'demo data mirrors the designation and the role map');

console.log(fail ? fail + ' failed' : 'hr portal role passed');
if (fail) process.exit(1);
