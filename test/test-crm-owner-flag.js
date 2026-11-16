/* CRM-OWNER-1. Fake data only. A user can own CRM records only when an Admin or Super admin turns it on. */
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
ok((await api.listCrmOwners()).length === 0, 'the owner picker is empty until someone is ticked');
const filters = await api.listCrmDealFilters();
ok(filters.scope === 'all' && filters.owners.length === 0, 'the deal owner picker is empty until someone is ticked');
const harbor = (await api.listCrmAccounts()).find((a) => a.id === 'acc-harbor');
ok(harbor && harbor.ownerId === 'u-sp' && harbor.ownerName.includes('Sam'), 'a record keeps the name of an owner who is not ticked');

const created = await api.adminCreateUser({ email: 'new.owner@example.test', firstName: 'New', lastName: 'Owner', role: 'Processor' });
ok(created.canOwnCrm === false && !(await api.listCrmOwners()).some((o) => o.id === created.id), 'a new user starts unticked and is not in the picker');

await api.adminUpdateUser('u-proc', { canOwnCrm: true });
await api.adminUpdateUser('u-bagent', { canOwnCrm: true });
const owners = await api.listCrmOwners();
ok(owners.some((o) => o.id === 'u-proc' && o.role === 'Processor') && owners.some((o) => o.id === 'u-bagent' && o.role === 'Outside user'), 'a ticked user of any role is in the picker');
ok(!owners.some((o) => o.id === 'u-sp' || o.id === 'u-admin' || o.id === 'u-adam'), 'an unticked salesperson or admin is not in the picker');
const dealOwners = (await api.listCrmDealFilters()).owners.map((o) => o.id);
ok(dealOwners.includes('u-proc') && dealOwners.includes('u-bagent') && !dealOwners.includes('u-sp'), 'the deal owner picker uses the same tick');

const log = await api.listActivity(null, {});
const turnedOn = log.items.find((a) => a.action === 'user.crm_owner' && a.entityId === 'u-proc' && /from no to yes/.test(a.detail));
ok(turnedOn && turnedOn.actorId === 'u-admin' && turnedOn.entity === 'user' && turnedOn.createdAt, 'turning the tick on is logged with who, which user, old, new, and when');

const lead = (await api.listCrmLeads()).find((l) => !l.archived && !l.converted);
const saved = await api.updateCrmLead(lead.id, { ownerId: 'u-proc' });
ok(saved.ownerId === 'u-proc' && saved.ownerName.includes('Paula'), 'mass-update style owner save accepts a ticked user and keeps the name');
ok(/can own CRM records/.test(await aerr(api.updateCrmLead(lead.id, { ownerId: 'u-sp' }))), 'an unticked salesperson cannot be saved as the owner');
ok(saved.ownerName.includes('Paula') && (await api.getCrmLead(lead.id)).ownerId === 'u-proc', 'the lead still has the ticked owner');

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

if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('crm owner flag passed');
