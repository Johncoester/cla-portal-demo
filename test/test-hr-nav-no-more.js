/* HR-only / HR workspace: no More fold and no empty order search. Staff/other roles unchanged. */
import { readFileSync } from 'node:fs';
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

ok(app.includes("ws !== 'hr' && !hrOnly(u)"), 'sideSearchOn turns off for the HR workspace and HR-only logins');
ok(app.includes("sideSearchOn && !isStaff(u.role) ? moreWrap"), 'non-staff portal users still get moreWrap when side search is on');
ok(app.includes('sideSearchOn ? mainPin()'), 'order search pin still gated by sideSearchOn');
ok(app.includes("sideSearchOn && route.page === 'dashboard' ? homeSearch()"), 'dashboard home search still gated by sideSearchOn');
ok(app.includes("export const hrOnly") === false && app.includes('hrOnly(u)'), 'uses the existing hrOnly helper from workspace.js');
ok(!app.includes("role === 'Employee' && isStaff"), 'does not grant Employee staff access');
ok(!/Employee.*isStaff|isStaff.*Employee/.test(app), 'Employee is not added to staff checks in app.js');

console.log(fail ? fail + ' failed' : 'hr nav no-more passed');
if (fail) process.exit(1);
