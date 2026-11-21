/* F35 row 415. Fake data only. Active Sales Person users are owner choices.
 * The tick still adds everyone else. A salesperson still cannot change a record they do not own. */
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { toText } from '../js/ui.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { crmOwnerOption, canOwnCrmRecords } from '../js/data/crm-owner.js';
import { canChangeCrmRecord } from '../js/data/crm-visibility.js';
import { render } from '../js/pages/crm.js';
import { personFormHtml } from '../js/pages/crm-forms.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear() { m.clear(); }, key: (i) => [...m.keys()][i], get length() { return m.size; } }; };
const aerr = async (p) => { try { await p; return ''; } catch (e) { return e.message; } };

ok(canOwnCrmRecords({ status: 'active', role: 'Sales Person', canOwnCrm: false }) === false, 'the tick stays off for an unticked salesperson');
ok(crmOwnerOption({ status: 'active', role: 'Sales Person', canOwnCrm: false }) === true, 'an active Sales Person is an owner choice');
ok(crmOwnerOption({ status: 'disabled', role: 'Sales Person', canOwnCrm: true }) === false, 'a disabled Sales Person is not an owner choice');
ok(crmOwnerOption({ status: 'active', role: 'Sales Team', canOwnCrm: false }) === false, 'Sales Team is not added by role');
ok(crmOwnerOption({ status: 'active', role: 'Super admin', canOwnCrm: true }) === true, 'a ticked admin is still an owner choice');
ok(canChangeCrmRecord({ id: 'u-sp', isAdmin: false }, { ownerId: 'u-admin' }) === false, 'a salesperson still cannot change a record they do not own');
ok(canChangeCrmRecord({ id: 'u-sp', isAdmin: false }, { ownerId: 'u-sp' }) === true, 'a salesperson can still change a record they own');
ok(canChangeCrmRecord({ id: 'u-admin', isAdmin: true }, { ownerId: 'u-sp' }) === true, 'an admin can still change any record');

const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const local = mem();
window.localStorage = local;
window.sessionStorage = mem();
globalThis.window = window;
globalThis.document = document;
globalThis.localStorage = local;
globalThis.sessionStorage = window.sessionStorage;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Node = window.Node;
globalThis.location = { hash: '#/crm/contacts', search: '', pathname: '/', origin: 'https://test.example' };
globalThis.FormData = class {
  constructor(form) { this._v = {}; if (form && form.querySelectorAll) form.querySelectorAll('[name]').forEach((el) => { if (!el.disabled) this._v[el.name] = el.value || ''; }); }
  entries() { return Object.entries(this._v); }
};
const selectValue = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');
Object.defineProperty(window.HTMLSelectElement.prototype, 'value', {
  configurable: true,
  get() { return selectValue.get.call(this); },
  set(v) {
    const want = String(v);
    [...this.options].forEach((o) => { if (o.getAttribute('value') === want) o.setAttribute('selected', ''); else o.removeAttribute('selected'); });
  },
});

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-admin');
const idle = await api.adminCreateUser({ email: 'idle.sales@example.test', firstName: 'Idle', lastName: 'Sales', role: 'Sales Person' });
await api.adminUpdateUser('u-admin', { canOwnCrm: true });
const owners = await api.listCrmOwners();
const ids = owners.map((o) => o.id);
ok(ids.includes('u-sp') && ids.includes(idle.id) && ids.includes('u-admin'), 'active sales people and a ticked super admin are in the owner list');
ok(!ids.includes('u-team') && !ids.includes('u-adam') && !ids.includes('u-proc'), 'Sales Team, an unticked admin, and an unticked processor are not in the list');
await api.adminUpdateUser(idle.id, { status: 'disabled' });
ok(!(await api.listCrmOwners()).some((o) => o.id === idle.id), 'turning a salesperson inactive removes them from the list');
const dealIds = (await api.listCrmDealFilters()).owners.map((o) => o.id);
ok(dealIds.includes('u-sp') && dealIds.includes('u-admin') && !dealIds.includes(idle.id) && !dealIds.includes('u-team'), 'Deal Owner uses the same people');

const lead = (await api.listCrmLeads()).find((l) => !l.archived && !l.converted);
const saved = await api.updateCrmLead(lead.id, { ownerId: 'u-sp' });
ok(saved.ownerId === 'u-sp' && saved.ownerName.includes('Sam'), 'Client and lead save accepts an active salesperson');
ok(/can own CRM records/.test(await aerr(api.updateCrmLead(lead.id, { ownerId: 'u-team' }))), 'an unticked Sales Team user is still refused');
ok(/only assign records to themselves/i.test(await (async () => {
  await api.signInDev('u-sp');
  return aerr(api.updateCrmLead(lead.id, { ownerId: 'u-admin' }));
})()), 'a salesperson still cannot assign a record to someone else');
ok((await api.getCrmLead(lead.id)).ownerId === 'u-sp', 'the refused assign leaves the salesperson as the owner');

await api.signInDev('u-admin');
const me = await api.crmMe();
const cfg = await api.getCrmSettings();
const choiceOwners = await api.listCrmOwners();
const form = toText(personFormHtml('contact', { ownerId: '', firstName: '', lastName: 'Sample' }, { owners: choiceOwners, me, edit: true, cfg }));
ok(form.includes('Client Owner') && form.includes('Unassigned') && form.includes('Sam Salesperson (Sales Person)') && form.includes('King John Admin (Super admin)'), 'the client edit form lists Unassigned, the salesperson, and the ticked admin');
ok(!form.includes('Tina Salesteam') && !form.includes('Idle Sales'), 'the client edit form leaves out Sales Team and the inactive salesperson');
const leadForm = toText(personFormHtml('lead', { ownerId: 'u-sp', firstName: 'Ada', lastName: 'Sample' }, { owners: choiceOwners, me, cfg }));
ok(leadForm.includes('Lead Owner') && leadForm.includes('value="u-sp"') && leadForm.includes('Sam Salesperson (Sales Person)'), 'the lead form offers the salesperson');

function optionText(root, name) {
  const sel = root.querySelector(`select[name="${name}"]`);
  return sel ? [...sel.options].map((o) => o.textContent) : [];
}
function nameForms(host) {
  host.querySelectorAll('form').forEach((f) => { f.querySelectorAll('[name]').forEach((el) => { f[el.name] = el; }); });
}
async function paint(section, id) {
  globalThis.location.hash = id ? `#/crm/${section}/${id}` : `#/crm/${section}`;
  const view = await render({ api, params: { section, id }, refresh() {}, go() {} });
  const host = document.getElementById('app');
  host.innerHTML = toText(view.body);
  nameForms(host);
  if (view.mount) view.mount(host);
  return host;
}
const clients = await paint('contacts');
const clientOwners = optionText(clients, 'ownerId');
ok(clientOwners.includes('Unassigned') && clientOwners.includes('Sam Salesperson') && clientOwners.includes('King John Admin'), 'the Clients Owner filter lists Unassigned, the salesperson, and the ticked admin');
ok(!clientOwners.includes('Tina Salesteam') && !clientOwners.some((t) => t.includes('Idle')), 'the Clients Owner filter leaves out Sales Team and the inactive salesperson');
const leads = await paint('leads');
ok(optionText(leads, 'ownerId').includes('Sam Salesperson') && optionText(leads, 'ownerId').includes('Unassigned'), 'the Leads Owner filter lists the salesperson and Unassigned');
const companies = await paint('accounts');
ok(optionText(companies, 'ownerId').includes('Sam Salesperson'), 'the Companies Owner filter lists the salesperson');
const deals = await paint('deals');
const dealOwners = optionText(deals, 'owner');
ok(dealOwners.some((t) => t.includes('Sam Salesperson')) && dealOwners.some((t) => t.includes('King John Admin')) && dealOwners.includes('(no salesperson)'), 'the Deal Owner filter lists the salesperson, the ticked admin, and no salesperson');
ok(!dealOwners.some((t) => t.includes('Tina Salesteam')) && !dealOwners.some((t) => t.includes('Idle')), 'the Deal Owner filter leaves out Sales Team and the inactive salesperson');

const box = clients.querySelector('[data-bulk-row]');
ok(!!box, 'the clients list can select a row for Change owner');
box.checked = true;
box.dispatchEvent(new window.Event('change', { bubbles: true }));
clients.querySelector('[data-bulk-owner]').click();
const change = document.getElementById('modal');
const changeNames = change ? optionText(change, 'ownerId') : [];
ok(changeNames.includes('Sam Salesperson') && changeNames.includes('King John Admin') && !changeNames.includes('Tina Salesteam'), 'Change owner lists the salesperson and the ticked admin');

const opened = await render({ api, me, params: { section: 'new', id: 'contact' }, refresh() {}, go() {} });
const host = document.getElementById('app');
host.innerHTML = toText(opened.body);
if (opened.mount) opened.mount(host);
const create = document.getElementById('modal');
const createNames = create ? optionText(create, 'ownerId') : [];
ok(createNames.includes('Unassigned') && createNames.includes('Sam Salesperson (Sales Person)') && !createNames.some((t) => t.includes('Tina')), 'Add client lists Unassigned and the salesperson');

const owned = (await api.listCrmLeads()).find((l) => l.ownerId === 'u-sp' && !l.archived && !l.converted);
await api.signInDev('u-sp');
const ownPage = await render({ api, params: { section: 'leads', id: owned.id }, refresh() {}, go() {} });
const ownHost = document.createElement('div');
ownHost.innerHTML = toText(ownPage.body);
ok(!!ownHost.querySelector('[data-edit-lead]') && !ownHost.querySelector('[data-lock-note]'), 'a salesperson can still open Edit on a lead they own');
const foreign = (await api.signInDev('u-admin'), (await api.listCrmLeads()).find((l) => l.ownerId && l.ownerId !== 'u-sp' && !l.converted));
await api.signInDev('u-admin');
await api.updateCrmLead(foreign.id, { ownerId: 'u-admin' });
ok(canChangeCrmRecord(await api.crmMe(), { ownerId: 'u-sp' }) === true, 'the admin is still allowed to change the salesperson record');
await api.signInDev('u-sp');
const salesMe = await api.crmMe();
ok(canChangeCrmRecord(salesMe, { ownerId: 'u-admin' }) === false && canChangeCrmRecord(salesMe, { ownerId: 'u-sp' }) === true, 'signing in as the salesperson does not widen who they can change');

console.log(fail ? fail + ' failed' : 'crm sales owners passed');
if (fail) process.exit(1);
