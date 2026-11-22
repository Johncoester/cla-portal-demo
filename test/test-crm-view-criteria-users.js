/* Custom view criteria: a user field lists every CRM user, and the saved id matches the record.
 * Fake data only. No network. */
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';

const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
globalThis.window = window;
globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Node = window.Node;
globalThis.location = { origin: 'https://test.example', pathname: '/portal/', hash: '#/crm/views/new/leads', reload() {} };
const selectValue = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');
Object.defineProperty(window.HTMLSelectElement.prototype, 'value', {
  configurable: true,
  get() { return selectValue.get.call(this); },
  set(v) { const want = String(v); [...this.options].forEach((o) => { if (o.getAttribute('value') === want) o.setAttribute('selected', ''); else o.removeAttribute('selected'); }); },
});

const { createMockAdapter } = await import('../js/data/mock-adapter.js');
const { toText } = await import('../js/ui.js');
const { viewPage } = await import('../js/pages/crm-views.js');
const { criteriaUserList, viewModuleFields } = await import('../js/data/crm-views.js');

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const sameIds = (a, b) => a.length === b.length && a.every((id) => b.includes(id));

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-admin');
await api.adminUpdateUser('u-sp', { canOwnCrm: true });
const owners = await api.listCrmOwners();
ok(owners.length === 1 && owners[0].id === 'u-sp', 'the owner list in this test is the one ticked sales rep');
const me = await api.crmMe();
const cfg = await api.getCrmSettings();
const share = await api.listCrmShareTargets();
const everyone = criteriaUserList(share.users).map((u) => u.id);
ok(everyone.includes('u-admin') && everyone.includes('u-adam') && everyone.includes('u-sp') && everyone.includes('u-proc'), 'the share list has a super admin, an admin, a sales rep, and other CRM staff');
ok(!everyone.includes('u-buyer') && !everyone.includes('u-tc'), 'outside users and transaction coordinators stay off the CRM user list');

const USER_LABEL = {
  leads: { createdBy: 'Created By', modifiedBy: 'Modified By', ownerId: 'Lead Owner', lastActivityBy: 'Last Activity By' },
  contacts: { createdBy: 'Created By', modifiedBy: 'Modified By', ownerId: 'Client Owner', lastActivityBy: 'Last Activity By' },
  accounts: { createdBy: 'Created By', modifiedBy: 'Modified By', ownerId: 'Company Owner', lastActivityBy: 'Last Activity By' },
  deals: { createdBy: 'Created By', ownerId: 'Deal Owner', lastActivityBy: 'Last Activity By' },
};
let shareCalls = 0;
const realShare = api.listCrmShareTargets.bind(api);
api.listCrmShareTargets = async () => { shareCalls += 1; return realShare(); };

for (const module of ['leads', 'contacts', 'accounts', 'deals']) {
  shareCalls = 0;
  const fields = viewModuleFields(module, cfg).filter((f) => f.type === 'user');
  const want = USER_LABEL[module];
  ok(fields.length === Object.keys(want).length && fields.every((f) => want[f.key] === f.label), `${module} criteria include the user fields`);
  const page = await viewPage({ api, me, cfg, owners, params: { id: 'new', sub: module } });
  const root = document.createElement('div');
  root.innerHTML = toText(page.body);
  document.body.appendChild(root);
  page.mount(root);
  ok(shareCalls === 1, `${module} loads the CRM user list once`);
  const shareIds = [...root.querySelector('[name=shareUsers]').options].map((o) => o.value);
  ok(!shareIds.includes(me.id) && shareIds.includes('u-sp') && shareIds.includes('u-adam'), `${module} share list still offers other CRM users and not the signed-in person`);
  root.querySelector('[data-crit-add]').click();
  for (const field of fields) {
    const sel = root.querySelector('[data-crit-field]');
    sel.value = field.key;
    sel.dispatchEvent(new window.Event('change', { bubbles: true }));
    const val = root.querySelector('[data-crit-value]');
    const ids = [...val.options].map((o) => o.getAttribute('value'));
    const labels = [...val.options].map((o) => o.textContent);
    ok(!!val && sameIds(ids, everyone), `${module} ${field.label} lists every CRM user, not only the sales rep`);
    ok(ids.includes('u-admin') && labels.some((t) => t.includes('King John')) && !ids.some((id) => id.includes(' ')), `${module} ${field.label} stores a user id, and a super admin is in the list`);
    ok(shareCalls === 1, `${module} ${field.label} does not load the user list again`);
  }
  root.remove();
}

const leads = await api.listCrmLeads();
const createdByAdmin = new Set(leads.filter((l) => l.createdBy === 'u-admin').map((l) => l.id));
const ownedBySam = new Set(leads.filter((l) => l.ownerId === 'u-sp').map((l) => l.id));
const leadView = await api.createCrmView({ module: 'leads', name: 'Created by super admin', criteria: [{ field: 'createdBy', op: 'is', value: 'u-admin' }] });
ok(leadView.criteria.length === 1 && leadView.criteria[0].field === 'createdBy' && leadView.criteria[0].op === 'is' && leadView.criteria[0].value === 'u-admin', 'the saved criteria value is still the user id');
const ranLeads = await api.runCrmView(leadView.id);
ok(createdByAdmin.size > 0 && ranLeads.total === createdByAdmin.size && ranLeads.rows.every((r) => createdByAdmin.has(r.id)), 'leads created by the chosen user are the ones shown');
const ranOwners = await api.runCrmView((await api.createCrmView({ module: 'leads', name: 'Lead owner Sam', criteria: [{ field: 'ownerId', op: 'is', value: 'u-sp' }] })).id);
ok(ownedBySam.size > 0 && ranOwners.total === ownedBySam.size && ranOwners.rows.every((r) => ownedBySam.has(r.id)), 'leads match the chosen lead owner');
const ranModified = await api.runCrmView((await api.createCrmView({ module: 'leads', name: 'Modified by super admin', criteria: [{ field: 'modifiedBy', op: 'is', value: 'u-admin' }] })).id);
ok(ranModified.rows.some((r) => r.id === 'lead-5') && !ranModified.rows.some((r) => r.id === 'lead-1'), 'leads match Modified By');
const ranActivity = await api.runCrmView((await api.createCrmView({ module: 'leads', name: 'Last activity Sam', criteria: [{ field: 'lastActivityBy', op: 'is', value: 'u-sp' }] })).id);
ok(ranActivity.rows.some((r) => r.id === 'lead-1') && !ranActivity.rows.some((r) => r.id === 'lead-5'), 'leads match Last Activity By');
const notAdmin = await api.runCrmView((await api.createCrmView({ module: 'leads', name: 'Not created by super admin', criteria: [{ field: 'createdBy', op: 'isnt', value: 'u-admin' }] })).id);
ok(notAdmin.rows.some((r) => r.id === 'lead-1') && !notAdmin.rows.some((r) => r.id === 'lead-5'), "leads that are not created by that user stay in an isn't filter");

const made = await api.createCrmContact({ firstName: 'Ada', lastName: 'Criteria', email: 'ada.criteria@example.test', roleInCompany: 'Realtor', relationshipStatus: 'Potential/Warm', state: 'MD', leadSource: 'Personal Network' });
const clientView = await api.runCrmView((await api.createCrmView({ module: 'contacts', name: 'Client created by super admin', criteria: [{ field: 'createdBy', op: 'is', value: 'u-admin' }] })).id);
ok(clientView.rows.some((r) => r.id === made.id) && !clientView.rows.some((r) => r.id === 'c-bagent'), 'clients match Created By');
const clientModified = await api.runCrmView((await api.createCrmView({ module: 'contacts', name: 'Client modified by super admin', criteria: [{ field: 'modifiedBy', op: 'is', value: 'u-admin' }] })).id);
ok(clientModified.rows.some((r) => r.id === made.id) && !clientModified.rows.some((r) => r.id === 'c-bagent'), 'clients match Modified By');
const clientOwner = await api.runCrmView((await api.createCrmView({ module: 'contacts', name: 'Client owner Sam', criteria: [{ field: 'ownerId', op: 'is', value: 'u-sp' }] })).id);
ok(clientOwner.rows.some((r) => r.id === 'c-bagent') && !clientOwner.rows.some((r) => r.id === made.id), 'clients match Client Owner');

const companyView = await api.runCrmView((await api.createCrmView({ module: 'accounts', name: 'Company created by super admin', criteria: [{ field: 'createdBy', op: 'is', value: 'u-admin' }] })).id);
ok(companyView.rows.some((r) => r.id === 'acc-harbor') && companyView.total > 0, 'companies match Created By');
const notSamCompany = await api.runCrmView((await api.createCrmView({ module: 'accounts', name: 'Company created by Sam', criteria: [{ field: 'createdBy', op: 'is', value: 'u-sp' }] })).id);
ok(notSamCompany.total === 0, 'a company created by someone else does not match Sam');
await api.updateCrmAccount('acc-harbor', { notes: 'Fake note so modified by is set.' });
const companyModified = await api.runCrmView((await api.createCrmView({ module: 'accounts', name: 'Company modified by super admin', criteria: [{ field: 'modifiedBy', op: 'is', value: 'u-admin' }] })).id);
ok(companyModified.rows.some((r) => r.id === 'acc-harbor'), 'companies match Modified By');
const companyOwner = await api.runCrmView((await api.createCrmView({ module: 'accounts', name: 'Company owner Sam', criteria: [{ field: 'ownerId', op: 'is', value: 'u-sp' }] })).id);
ok(companyOwner.rows.some((r) => r.id === 'acc-harbor') && !companyOwner.rows.some((r) => r.id === 'acc-oak'), 'companies match Company Owner');

const dealOwner = await api.runCrmView((await api.createCrmView({ module: 'deals', name: 'Deal owner Sam', criteria: [{ field: 'ownerId', op: 'is', value: 'u-sp' }] })).id);
ok(dealOwner.rows.some((r) => r.id === 'deal-1') && !dealOwner.rows.some((r) => r.id === 'deal-2'), 'deals match Deal Owner');
const dealCreated = await api.runCrmView((await api.createCrmView({ module: 'deals', name: 'Deal created by processor', criteria: [{ field: 'createdBy', op: 'is', value: 'u-proc' }] })).id);
ok(dealCreated.rows.some((r) => r.id === 'deal-1'), 'deals match Created By');
const dealNotAdmin = await api.runCrmView((await api.createCrmView({ module: 'deals', name: 'Deal created by super admin', criteria: [{ field: 'createdBy', op: 'is', value: 'u-admin' }] })).id);
ok(!dealNotAdmin.rows.some((r) => r.id === 'deal-1'), 'a deal created by someone else does not match the super admin');

const root = document.createElement('div');
const editor = await viewPage({ api, me, cfg, owners, params: { id: 'new', sub: 'leads' } });
root.innerHTML = toText(editor.body);
document.body.appendChild(root);
editor.mount(root);
root.querySelector('[data-crit-add]').click();
const field = root.querySelector('[data-crit-field]');
field.value = 'createdBy';
field.dispatchEvent(new window.Event('change', { bubbles: true }));
const val = root.querySelector('[data-crit-value]');
val.value = 'u-admin';
const chosen = [...val.options].find((o) => o.hasAttribute('selected'));
ok(val.value === 'u-admin' && chosen && chosen.getAttribute('value') === 'u-admin' && !chosen.textContent.includes('u-admin'), 'choosing a super admin puts that user id in the criteria value');

console.log(fail ? fail + ' failed' : 'crm view criteria users passed');
if (fail) process.exit(1);
