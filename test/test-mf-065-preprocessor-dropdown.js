/* MF-065 (Matt Landsberg, Nov 25 2026): the Preprocessor dropdown lists the staff who have the Preprocessor role.
   Matt, 9:29 PM ET Nov 25: "We will assign multiple people the pre-processor role. Any random name can be assigned for testing."
   Not a fixed Leen / Alexandra / Ellen list. Ellen's role is not changed. No database file. */
import { readFileSync as read } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { preprocessorChoices, preprocessorLabel, paintPreprocessorSelect, PREPROCESSOR_ROLE, NO_PREPROCESSOR_HINT } from '../js/data/preprocessor-pick.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

// ---- the helper ----
ok(PREPROCESSOR_ROLE === 'Preprocessor', 'the role is Preprocessor');
ok(preprocessorLabel({ firstName: 'Test', lastName: 'Preprocessor 1', email: 'p1@example.test' }) === 'Test Preprocessor 1 (Preprocessor) \u2014 p1@example.test', 'label = Name (Role) \u2014 email, like the other staff pickers');
ok(preprocessorLabel({ firstName: 'Ana', lastName: 'Reyes' }) === 'Ana Reyes (Preprocessor)', 'no email = no dash');
const list = [
  { id: 'a', firstName: 'Ana', lastName: 'Reyes', role: 'Preprocessor', status: 'active' },
  { id: 'b', firstName: 'Ben', lastName: 'Cole', role: 'Preprocessor', status: 'active' },
  { id: 'c', firstName: 'Cy', lastName: 'Tc', role: 'Transaction Coordinator', status: 'active' },
  { id: 'd', firstName: 'Di', lastName: 'Off', role: 'Preprocessor', status: 'disabled' },
  { id: 'a', firstName: 'Ana', lastName: 'Reyes', role: 'Preprocessor', status: 'active' },
];
const c = preprocessorChoices(list, '', '');
ok(c.options.map((o) => o.value).join() === ',a,b', '(none) then each active Preprocessor once; other roles and disabled logins are not listed');
ok(c.options[0].label === '(none)' && c.available === 2 && !c.empty && c.value === '' && !c.kept, '(none) is a real choice and two people are available');
ok(preprocessorChoices([], '', '').empty && preprocessorChoices(null, '', '').available === 0, 'an empty list says so, so the page can show the hint');
ok(/Preprocessor role/.test(NO_PREPROCESSOR_HINT) && NO_PREPROCESSOR_HINT.startsWith('No preprocessor is available for this login.') && /Users/.test(NO_PREPROCESSOR_HINT) && /Refresh list/.test(NO_PREPROCESSOR_HINT), 'the empty hint says how to fill the list');
const keep = preprocessorChoices(list, 'zz', 'Former Pre');
ok(keep.kept && keep.value === 'zz' && keep.options.some((o) => o.value === 'zz' && /Former Pre \(no longer an active Preprocessor\)/.test(o.label)), 'a person already on the file stays selectable after losing the role');
ok(preprocessorChoices(list, 'b', '').value === 'b' && !preprocessorChoices(list, 'b', '').kept, 'a current Preprocessor who is still listed is just selected');

// ---- repaint keeps the pick and the rest of the form ----
const mkOpt = () => ({ set value(v) { this._v = v; }, get value() { return this._v; }, textContent: '' });
const sel = { value: 'b', children: [], ownerDocument: { createElement: mkOpt }, replaceChildren() { this.children = []; }, appendChild(o) { this.children.push(o); } };
const hint = { hidden: true };
let r = paintPreprocessorSelect(sel, preprocessorChoices(list, 'b', ''), hint);
ok(sel.children.length === 3 && sel.value === 'b' && !r.dropped && hint.hidden === true, 'Refresh list keeps the person who was picked');
sel.value = 'ghost'; r = paintPreprocessorSelect(sel, preprocessorChoices(list, 'ghost', ''), hint);
ok(sel.value === 'ghost', 'a kept person is still picked after a refresh');
sel.value = 'ghost'; r = paintPreprocessorSelect(sel, preprocessorChoices(list, '', ''), hint);
ok(sel.value === '' && r.dropped, 'a pick that is no longer listed falls back to (none) and says so');
paintPreprocessorSelect(sel, preprocessorChoices([], '', ''), hint);
ok(hint.hidden === false, 'the empty hint appears when nobody has the role');

// ---- the mock portal: giving a login the role puts the person in the dropdown ----
const api = createMockAdapter({ storage: mem() });
await api.signInDev('u-proc');
const before = await api.listPreprocessors();
ok(before.length >= 1 && before.every((p) => p.role === 'Preprocessor' && p.status === 'active') && before.some((p) => p.id === 'u-preproc'), 'the dropdown list is the staff with the Preprocessor role');
ok(before.every((p) => 'email' in p), 'each person carries an email for the label');
await api.signInDev('u-admin');
const users = await api.adminListUsers();
const tcUser = users.find((u) => u.role === 'Transaction Coordinator' && !u.isAdmin);
await api.adminUpdateUser(tcUser.id, { role: 'Preprocessor' });
await api.signInDev('u-proc');
const after = await api.listPreprocessors();
ok(after.length === before.length + 1 && after.some((p) => p.id === tcUser.id), 'another person given the Preprocessor role appears in the list');
await api.signInDev('u-admin');
await api.adminUpdateUser(tcUser.id, { status: 'disabled' });
await api.signInDev('u-proc');
ok(!(await api.listPreprocessors()).some((p) => p.id === tcUser.id), 'a disabled login drops out of the list');
await api.signInDev('u-buyer');
let blocked = false; try { await api.listPreprocessors(); } catch (e) { blocked = /Processor or Admin/.test(e.message); }
ok(blocked, 'a buyer cannot read the staff list');

// ---- wiring ----
const orderNew = read('js/pages/ordernew.js', 'utf8'); const deal = read('js/pages/deal.js', 'utf8'); const sb = read('js/data/supabase-adapter.js', 'utf8');
ok(orderNew.includes('preprocessorChoices(') && orderNew.includes('data-refresh-preprocessors') && orderNew.includes('data-preprocessor-select') && orderNew.includes('data-no-preproc') && orderNew.includes('No preprocessor is available for this login.'), 'Place Order uses the shared list, a Refresh list button, and the empty hint');
ok(deal.includes('preprocessorChoices(') && deal.includes('data-refresh-preprocessors') && deal.includes('paintPreprocessorSelect('), 'Edit order details uses the shared list and Refresh list');
ok(/if \(\(f\.preprocessorUserId \|\| ''\) === \(d\.preprocessorUserId \|\| ''\)\) delete f\.preprocessorUserId/.test(deal), 'an unchanged Preprocessor is not re-sent on save');
ok(/async listPreprocessors\(\)[\s\S]{0,900}\.eq\('role', 'Preprocessor'\)\.eq\('status', 'active'\)/.test(sb) && /is_demo/.test(sb.slice(sb.indexOf('async listPreprocessors()'), sb.indexOf('async listPreprocessors()') + 900)), 'the hosted list is active Preprocessors in the viewer\'s own (demo or real) scope');
ok(!/Leen|Alexandra/.test(orderNew + deal + read('js/data/preprocessor-pick.js', 'utf8')), 'no fixed list of names in the code');
ok(!/create or replace function|create policy|security definer/i.test(read('supabase/scripts/mf-065-test-preprocessors.sql', 'utf8')), 'the TEST seed script changes no function, policy, or guard');
ok(!read('supabase/scripts/mf-065-test-preprocessors.sql', 'utf8').includes('bxixxgcqxmtzkrolywas'), 'the seed script never names production');

console.log(fail ? fail + ' failed' : 'MF-065 passed');
if (fail) process.exit(1);
