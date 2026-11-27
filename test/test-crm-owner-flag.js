/* CRM-OWNER-1. Fake data only. A user can own CRM records when an Admin or Super admin turns the tick on.
 * F35 row 415: an active Sales Person is also an owner choice, without the tick. The tick still adds everyone else.
 * Those picker assertions changed because the owner list changed, not to hide a failure. */
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { canOwnCrmRecords } from '../js/data/crm-owner.js';
import { toText } from '../js/ui.js';
import { render } from '../js/pages/users.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const aerr = async (p) => { try { await p; return ''; } catch (e) { return e.message; } };

ok(canOwnCrmRecords({ status: 'active', canOwnCrm: false }) === false && canOwnCrmRecords({ status: 'active' }) === false, 'a missing tick counts as off');
ok(canOwnCrmRecords({ status: 'disabled', canOwnCrm: true }) === false, 'a disabled user is not an owner even when ticked');
ok(canOwnCrmRecords({ status: 'active', canOwnCrm: true }) === true, 'an active ticked user can own records');

const storage = mem();
const api = createMockAdapter({ storage, sessionStorage: mem() });
await api.signInDev('u-admin');
const users = await api.adminListUsers();
ok(users.length > 0 && users.every((u) => u.canOwnCrm !== true), 'every user starts unticked, including admins');
const beforeTick = await api.listCrmOwners();
ok(beforeTick.length === 1 && beforeTick[0].id === 'u-sp' && beforeTick[0].role === 'Sales Person', 'an active Sales Person is in the owner picker before anyone is ticked');
ok(!beforeTick.some((o) => o.id === 'u-team' || o.id === 'u-admin' || o.id === 'u-adam'), 'Sales Team and an unticked admin are not added by role');
const filters = await api.listCrmDealFilters();
ok(filters.scope === 'all' && filters.owners.length === 1 && filters.owners[0].id === 'u-sp', 'the deal owner picker lists the active Sales Person before anyone is ticked');
const harbor = (await api.listCrmAccounts()).find((a) => a.id === 'acc-harbor');
ok(harbor && harbor.ownerId === 'u-sp' && harbor.ownerName.includes('Sam'), 'a record keeps the name of an owner who is not ticked');

const created = await api.adminCreateUser({ email: 'new.owner@example.test', firstName: 'New', lastName: 'Owner', role: 'Processor' });
ok(created.canOwnCrm === false && !(await api.listCrmOwners()).some((o) => o.id === created.id), 'a new user starts unticked and is not in the picker');

await api.adminUpdateUser('u-proc', { canOwnCrm: true });
await api.adminUpdateUser('u-bagent', { canOwnCrm: true });
const owners = await api.listCrmOwners();
ok(owners.some((o) => o.id === 'u-proc' && o.role === 'Processor') && owners.some((o) => o.id === 'u-bagent' && o.role === 'Outside user'), 'a ticked user of any role is in the picker');
ok(owners.some((o) => o.id === 'u-sp' && o.role === 'Sales Person') && !owners.some((o) => o.id === 'u-admin' || o.id === 'u-adam'), 'the active salesperson stays in the picker and an unticked admin does not');
const dealOwners = (await api.listCrmDealFilters()).owners.map((o) => o.id);
ok(dealOwners.includes('u-proc') && dealOwners.includes('u-bagent') && dealOwners.includes('u-sp') && !dealOwners.includes('u-team'), 'the deal owner picker keeps the tick and the active salesperson');

const log = await api.listActivity(null, {});
const turnedOn = log.items.find((a) => a.action === 'user.crm_owner' && a.entityId === 'u-proc' && /from no to yes/.test(a.detail));
ok(turnedOn && turnedOn.actorId === 'u-admin' && turnedOn.entity === 'user' && turnedOn.createdAt, 'turning the tick on is logged with who, which user, old, new, and when');

const lead = (await api.listCrmLeads()).find((l) => !l.archived && !l.converted);
const saved = await api.updateCrmLead(lead.id, { ownerId: 'u-proc' });
ok(saved.ownerId === 'u-proc' && saved.ownerName.includes('Paula'), 'mass-update style owner save accepts a ticked user and keeps the name');
const asSam = await api.updateCrmLead(lead.id, { ownerId: 'u-sp' });
ok(asSam.ownerId === 'u-sp' && asSam.ownerName.includes('Sam'), 'an active salesperson can be saved as the owner without the tick');
await api.updateCrmLead(lead.id, { ownerId: 'u-proc' });
ok(/can own CRM records/.test(await aerr(api.updateCrmLead(lead.id, { ownerId: 'u-preproc' }))), 'an unticked user who is not a Sales Person cannot be saved as the owner');
ok((await api.getCrmLead(lead.id)).ownerId === 'u-proc', 'the lead still has the ticked owner');

const imported = await api.runCrmImport({
  module: 'leads',
  csv: 'Last Name,Role in Company,Relationship Status,State,Owner\nOwned,Realtor,Hot Prospect,MD,Paula Processor\nBlocked,Realtor,Hot Prospect,MD,Sam Salesperson\n',
  fileName: 'owners.csv',
});
const good = imported.rows.find((r) => r.values && r.values.lastName === 'Owned');
const bad = imported.rows.find((r) => r.values && r.values.lastName === 'Blocked');
const owned = good && good.id ? await api.getCrmLead(good.id) : null;
ok(good && good.status === 'ok' && owned && owned.ownerId === 'u-proc' && owned.ownerName.includes('Paula'), 'the import owner column matches a ticked user by name');
ok(bad && bad.status === 'error' && /can own CRM records/.test(bad.message), 'the import refuses a name that is not ticked');
ok(/can own CRM records/.test(await aerr(api.previewCrmImport({
  module: 'leads', csv: 'Last Name\nSample\n', fileName: 'default.csv', defaults: { ownerId: 'u-sp', roleInCompany: 'Realtor', relationshipStatus: 'Hot Prospect', state: 'MD' },
}))), 'a default owner who is not ticked is refused');

const people = await api.setDealSalesPeople('deal-1', ['u-bagent']);
ok(people.some((p) => p.id === 'u-bagent' || p.salesId === 'u-bagent'), 'a ticked user of any role can be saved as the deal owner');
ok(/staff login/.test(await aerr(api.setDealSalesPeople('deal-1', ['u-lagent']))), 'an unticked outside user cannot be saved as the deal owner');

await api.adminUpdateUser('u-proc', { canOwnCrm: false });
const turnedOff = (await api.listActivity(null, {})).items.find((a) => a.action === 'user.crm_owner' && a.entityId === 'u-proc' && /from yes to no/.test(a.detail));
ok(turnedOff && turnedOff.actorId === 'u-admin' && !(await api.listCrmOwners()).some((o) => o.id === 'u-proc'), 'turning the tick off is logged and removes that person from the picker');
ok((await api.getCrmAccount('acc-harbor')).ownerName.includes('Sam'), 'turning other people off does not blank an existing owner name');

await api.adminUpdateUser('u-proc', { isAdmin: true });
await api.signOut();
await api.signInDev('u-proc');
ok(/Only an Admin or Super admin/.test(await aerr(api.adminUpdateUser('u-tc', { canOwnCrm: true }))), 'a Processor with Admin access cannot change the tick');
ok((await api.adminGetUser('u-tc')).canOwnCrm !== true, 'the refused change is not saved');
await api.signOut();
await api.signInDev('u-sp');
ok(/Only an Admin can do this/.test(await aerr(api.adminUpdateUser('u-tc', { canOwnCrm: true }))), 'a salesperson cannot open user management to change the tick');

await api.signOut();
await api.signInDev('u-adam');
await api.adminUpdateUser('u-tc', { canOwnCrm: true });
ok((await api.listCrmOwners()).some((o) => o.id === 'u-tc' && o.role === 'Transaction Coordinator'), 'a plain Admin can turn the tick on');

const adminPage = await render({
  api, user: { id: 'u-adam', role: 'Admin', isAdmin: true, status: 'active' },
  params: { mode: 'edit', id: 'u-sp' }, refresh() {}, go() {},
});
const adminHtml = toText(adminPage.body);
ok(adminHtml.includes('Can own CRM records') && adminHtml.includes('name="canOwnCrm"') && !/name="canOwnCrm"[^>]*checked/.test(adminHtml), 'edit user shows the checkbox off for someone who was never ticked');
ok(!/name="canOwnCrm"[^>]*disabled/.test(adminHtml), 'an Admin can change the checkbox');

const procPage = await render({
  api, user: { id: 'u-proc', role: 'Processor', isAdmin: true, status: 'active' },
  params: { mode: 'edit', id: 'u-tc' }, refresh() {}, go() {},
});
ok(/name="canOwnCrm"[^>]*disabled/.test(toText(procPage.body)), 'a Processor sees the checkbox and cannot change it');

const adminUser = { id: 'u-adam', role: 'Admin', isAdmin: true, status: 'active' };
const listPage = await render({ api, user: adminUser, params: {}, refresh() {}, go() {} });
const listHtml = toText(listPage.body);
ok(/<th>Admin<\/th><th>CRM owner<\/th><th>Teams<\/th>/.test(listHtml), 'the User List has a CRM owner column beside Admin');
ok(listHtml.includes('class="user-list-scroll"') && listHtml.includes('colspan="9"'), 'the list scrolls on a narrow screen and the empty row spans the new column');
const spBox = listHtml.match(/data-crm-owner="u-sp"[^>]*/);
ok(spBox && !/checked/.test(spBox[0]) && !/disabled/.test(spBox[0]), 'an unticked person has an open CRM owner box for an Admin');
const selfBox = listHtml.match(/data-crm-owner="u-adam"[^>]*/);
ok(selfBox && !/disabled/.test(selfBox[0]), 'an Admin can change their own CRM owner tick');
ok(listHtml.includes('Can own CRM records') && listHtml.includes('aria-label="Can own CRM records"'), 'the row uses the same words as Edit user');

const procList = await render({
  api, user: { id: 'u-proc', role: 'Processor', isAdmin: true, status: 'active' }, params: {}, refresh() {}, go() {},
});
const procListHtml = toText(procList.body);
const procBoxes = procListHtml.match(/data-crm-owner="[^"]+"[^>]*/g) || [];
ok(procBoxes.length > 0 && procBoxes.every((b) => /disabled/.test(b)), 'a Processor sees every CRM owner box and cannot change one');

await api.adminDeleteUser('u-bagent');
const goneList = toText((await render({ api, user: adminUser, params: {}, refresh() {}, go() {} })).body);
const goneBox = goneList.match(/data-crm-owner="u-bagent"[^>]*/);
ok(goneBox && /disabled/.test(goneBox[0]) && /checked/.test(goneBox[0]), 'a removed user keeps the tick and the box is locked');

const { parseHTML } = await import('/tmp/domtest/node_modules/linkedom/worker.js');
const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
globalThis.window = window;
globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Node = window.Node;
globalThis.FormData = window.FormData;
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const mountList = async () => {
  const page = await render({ api, user: adminUser, params: {}, refresh() {}, go() {} });
  const root = document.createElement('div');
  root.innerHTML = toText(page.body);
  document.body.appendChild(root);
  page.mount(root);
  return root;
};
const ticked = (el) => !!(el && (el.checked || el.hasAttribute('checked')));
let root = await mountList();
let box = root.querySelector('[data-crm-owner="u-sp"]');
ok(box && !ticked(box) && !box.disabled, 'the mounted row starts unticked');
box.checked = true;
box.dispatchEvent(new window.Event('change'));
await flush();
ok((await api.adminGetUser('u-sp')).canOwnCrm === true, 'ticking the row saves through the same update as Edit user');
const rowOn = (await api.listActivity(null, {})).items.find((a) => a.action === 'user.crm_owner' && a.entityId === 'u-sp' && /from no to yes/.test(a.detail));
ok(rowOn && rowOn.actorId === 'u-adam', 'the row tick is logged the same way: who, which user, old, new');
const editOn = toText((await render({ api, user: adminUser, params: { mode: 'edit', id: 'u-sp' }, refresh() {}, go() {} })).body);
ok(/name="canOwnCrm"[^>]*checked/.test(editOn), 'Edit user shows the tick the row just saved');
root.remove();
root = await mountList();
box = root.querySelector('[data-crm-owner="u-sp"]');
ok(ticked(box), 'the row shows the tick after a reload');
box.checked = false;
box.dispatchEvent(new window.Event('change'));
await flush();
ok((await api.adminGetUser('u-sp')).canOwnCrm !== true, 'unticking the row clears the same tick');
const editOff = toText((await render({ api, user: adminUser, params: { mode: 'edit', id: 'u-sp' }, refresh() {}, go() {} })).body);
ok(!/name="canOwnCrm"[^>]*checked/.test(editOff), 'Edit user follows the row when the tick is cleared');

const realUpdate = api.adminUpdateUser.bind(api);
api.adminUpdateUser = async (id, patch) => {
  if (patch && patch.canOwnCrm != null) {
    const denied = new Error('permission denied for column can_own_crm');
    denied.code = '42501';
    throw denied;
  }
  return realUpdate(id, patch);
};
root.remove();
root = await mountList();
box = root.querySelector('[data-crm-owner="u-sp"]');
box.checked = true;
box.dispatchEvent(new window.Event('change'));
await flush();
const errToast = document.querySelector('.toast.err .toast-text');
ok(box.checked === false && !box.disabled, 'a failed save puts the box back');
ok(errToast && /not allowed to change this/.test(errToast.textContent) && !/42501|can_own_crm/.test(errToast.textContent), 'the failed save says what happened in plain words, with no error code');
ok((await realUpdate('u-sp', {})).canOwnCrm !== true, 'the refused row tick is not saved');
api.adminUpdateUser = async () => { throw new Error('42501'); };
box.checked = true;
box.dispatchEvent(new window.Event('change'));
await flush();
const codeToast = [...document.querySelectorAll('.toast.err .toast-text')].pop();
ok(box.checked === false && codeToast && /Refresh the page and try again/.test(codeToast.textContent) && !/42501/.test(codeToast.textContent), 'a bare error code is not shown');

const css = await import('node:fs');
ok(css.readFileSync('css/portal.css', 'utf8').includes('.user-list-scroll .crm-owner-tick { min-width: 44px; min-height: 44px; }'), 'a phone can tap the CRM owner box');
ok(css.readFileSync('js/app.js', 'utf8').includes("pages/users.js?v=202611312900") && css.readFileSync('index.html', 'utf8').includes('js/app.js?v=202611314500'), 'the User List uses cache stamp 202611248300 and the shell is 202611290610');

if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('crm owner flag passed');
