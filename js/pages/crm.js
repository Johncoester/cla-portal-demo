// crm.js : the CRM (John, Nov 2). Routes #/crm/<section>[/<id>]: home (default), leads, contacts (= Clients), accounts (= Companies), pipeline, reports,
// tasks/<id>, meetings/<id>; followups (older link) shows Home. Labels follow John's Zoho (Clients / Companies); internal names stay contacts / accounts.
// Reachable only when the `crm` feature flag is on (app.js never loads this module otherwise) and only for CLA staff (adapter refuses others).
import { html, raw, $, $$, guard, formData, toast, fmtDate, fmtDateTime, modal, closeModal, pill } from '../ui.js?v=202611022114';
import { CONTACT_TYPES, contactTypeLabel, US_STATES } from '../data/constants.js?v=202611022114';
import { LEAD_SOURCES, RELATIONSHIP_STATUSES, ROLES_IN_COMPANY, ACCOUNT_KINDS, accountKindLabel, accountKindForType } from '../data/crm.js?v=202611022114';
import { tabs, head, sel, pairs, ownerSel, ctype, money, listView, ordersCard, archiveBtn, wireArchive } from './crm-kit.js?v=202611022114';
import { personModal, personView, relatedHtml, wireRelated } from './crm-forms.js?v=202611022114';
import { pipelinePage, reportsPage } from './crm-more.js?v=202611022114';
import { homePage, taskPage, meetingPage } from './crm-home.js?v=202611022114';

const crumbs = (label, extra) => [['CRM', '#/crm'], ...(extra ? [[label, extra[0]], [extra[1]]] : [[label]])];
const archivedOpts = [['only', 'Archived only'], ['all', 'Active + archived']];
const ownerOpts = (owners) => [['none', 'Unassigned'], ...owners.map((o) => [o.id, o.name])];
const ctOpts = [...CONTACT_TYPES, ['none', 'Not set']];
const countyOpts = (rows) => [...new Set(rows.map((r) => (r.county || '').trim()).filter(Boolean))].sort().map((c) => [c, c]).concat([['none', '(no county)']]);
const stateOpts = (rows) => [...new Set(rows.map((r) => r.state).filter(Boolean))].sort().map((s) => [s, s]);
const link = (sec, r) => html`<a href="#/crm/${sec}/${r.id}" data-open="${r.id}">${r.name}</a>`;
const muted = (t) => html`<span class="muted">${t}</span>`;

export async function render(ctx) {
  const { api, params } = ctx; const me = await api.crmMe(); const owners = await api.listCrmOwners(); const assignees = await api.listCrmAssignees(); const c = { ...ctx, me, owners, assignees };
  const s = params.section || 'home';
  if (s === 'home' || s === 'followups') return homePage(c);
  if (s === 'leads') return params.id ? leadPage(c) : leadsList(c);
  if (s === 'contacts') return params.id ? contactPage(c) : contactsList(c);
  if (s === 'accounts') return params.id ? accountPage(c) : accountsList(c);
  if (s === 'tasks' && params.id) return taskPage(c);
  if (s === 'meetings' && params.id) return meetingPage(c);
  if (s === 'pipeline') return pipelinePage(c);
  if (s === 'reports') return reportsPage(c);
  throw new Error('That CRM page does not exist.');
}

// ---------------- LEADS (Zoho list: Lead Name, Company, Email, Phone, Lead Source, Lead Owner) ----------------
const blankPerson = (me) => ({ ownerId: me.isAdmin ? '' : me.id, relationshipStatus: '', links: {} });
async function leadsList({ api, me, owners, go }) {
  const rows = await api.listCrmLeads();
  const lv = listView({ key: 'leads', rows, fields: ['name', 'email', 'company', 'phone', 'leadSource', 'notes', 'county', 'city', 'roleInCompany'], sortDefault: 'createdAt:desc',
    cols: [['name', 'Lead Name', (r) => html`${link('leads', r)}${r.converted ? html` ${pill('Converted', 'ok')}` : ''}${r.archived ? html` ${pill('Archived')}` : ''}`], ['company', 'Company'], ['email', 'Email'], ['phone', 'Phone'],
      ['leadSource', 'Lead Source'], ['relationshipStatus', 'Relationship Status'], ['roleInCompany', 'Role in Company'], ['county', 'County'], ['ownerName', 'Lead Owner', (r) => r.ownerName || muted('Unassigned')], ['createdAt', 'Created', (r) => fmtDate(r.createdAt)]],
    filters: [['ownerId', 'Lead Owner', ownerOpts(owners), 'Any owner'], ['roleInCompany', 'Role in Company', pairs(ROLES_IN_COMPANY), 'Any role'], ['relationshipStatus', 'Relationship Status', pairs(RELATIONSHIP_STATUSES), 'Any status'],
      ['leadSource', 'Lead Source', pairs(LEAD_SOURCES), 'Any source'], ['county', 'County', countyOpts(rows), 'Any county'], ['state', 'State', stateOpts(rows), 'Any state'], ['contactType', 'Contact type', ctOpts, 'Any type'],
      ['converted', 'Converted', [['only', 'Converted only'], ['all', 'Open + converted']], 'Hide converted'], ['archived', 'Archived', archivedOpts, 'Hide archived']],
    sorts: [['name', 'Lead Name'], ['company', 'Company'], ['relationshipStatus', 'Relationship Status'], ['leadSource', 'Lead Source'], ['county', 'County'], ['ownerName', 'Lead Owner'], ['createdAt', 'Created']] });
  const body = html`${head('CRM: Leads', me, me.canEdit ? html`<button class="m-btn right" data-new-lead>+ Create Lead</button>` : '')}${tabs('leads')}${lv.body}`;
  return { title: 'CRM Leads', crumbs: crumbs('Leads'), body, mount(root) { lv.mount(root);
    const b = $('[data-new-lead]', root); if (b) b.addEventListener('click', () => personModal('lead', blankPerson(me), { owners, me, blank: () => blankPerson(me) }, (v) => api.createCrmLead(v), (l) => go('/crm/leads/' + l.id))); } };
}
async function leadPage({ api, me, owners, assignees, params, refresh, go }) {
  const l = await api.getCrmLead(params.id); const accounts = me.canEdit && !l.converted ? await api.listCrmAccounts() : [];
  const body = html`${head(`Lead: ${l.name}`, me)}${tabs('leads')}
    <div class="card" data-lead="${l.id}"><p>${l.converted ? html`${pill('Converted', 'ok')} to client <a href="#/crm/contacts/${l.convertedContactId}" data-converted-contact>${l.convertedContactName}</a> on ${fmtDate(l.convertedAt)}` : ''}${l.archived ? html` ${pill('Archived')}` : ''}</p>
      <p>${me.canEdit && !l.converted ? html`<button class="ghost" data-edit-lead>Edit</button> ${l.archived ? '' : html`<button class="m-btn" data-convert>Convert to client</button>`} ` : ''}${archiveBtn(me, 'lead', l.id, l.archived)}
        <a class="ghost" href="#/crm/leads">Back to leads</a></p>
      <span hidden data-lead-owner>${l.ownerName || 'Unassigned'}</span><span hidden data-lead-ctype>${contactTypeLabel(l.contactType) || 'Not set'}</span><span hidden data-lead-status>${l.relationshipStatus}</span></div>
    ${personView('lead', l, html`<dt>Created</dt><dd>${fmtDateTime(l.createdAt)}</dd>${l.modifiedByName ? html`<dt>Modified By</dt><dd>${l.modifiedByName}, ${fmtDateTime(l.modifiedAt)}</dd>` : ''}`)}
    ${relatedHtml(l, { entity: 'lead', entityId: l.id, me })}`;
  return { title: 'Lead ' + l.name, crumbs: crumbs('Leads', ['#/crm/leads', l.name]), body, mount(root) {
    wireArchive(root, api, refresh); wireRelated(root, api, refresh, { entity: 'lead', entityId: l.id, parentName: l.name, me, assignees });
    const e = $('[data-edit-lead]', root); if (e) e.addEventListener('click', () => personModal('lead', l, { owners, me, edit: true }, (v) => api.updateCrmLead(l.id, v), () => refresh()));
    const cv = $('[data-convert]', root); if (cv) cv.addEventListener('click', () => {
      const m = modal('Convert lead to client', html`<form id="convert-form" class="form-grid">
        <p class="span2">Creates a CRM client for <strong>${l.name}</strong> (${l.roleInCompany || 'no role'}, contact type ${contactTypeLabel(l.contactType) || 'not set'}) owned by ${l.ownerName || 'nobody yet'}, with all the lead's details. The lead is kept, marked Converted/Current Client.</p>
        <label>Existing company${sel('accountId', accounts.filter((a) => !a.archived).map((a) => [a.id, `${a.name} (${accountKindLabel(a.kind)})`]), accounts.find((a) => l.company && a.name.toLowerCase() === l.company.toLowerCase())?.id || '', '(none / new company)')}</label>
        <label>Or a new company<input name="newAccountName" maxlength="160" value="${l.company && !accounts.some((a) => a.name.toLowerCase() === l.company.toLowerCase()) ? l.company : ''}" placeholder="Company name"></label>
        <label>New company type${sel('accountKind', ACCOUNT_KINDS, accountKindForType(l.contactType))}</label>
        <label>Also start a pipeline opportunity (optional)<input name="opportunityName" maxlength="160" placeholder="e.g. ${l.company || l.name}: referrals"></label>
        <label class="check span2" data-link-existing hidden><input type="checkbox" name="linkExisting" value="1"> Link to the existing client (one person per email)</label>
        <p class="err-text span2" data-convert-err></p>
        <div class="span2"><button class="m-btn" type="submit">Convert</button> <button class="ghost" type="button" data-close>Cancel</button></div></form>`, { wide: true });
      $('#convert-form', m).addEventListener('submit', async (ev) => { ev.preventDefault(); const f = formData(ev.target);
        const opts = { accountId: f.accountId, newAccountName: f.accountId ? '' : f.newAccountName, accountKind: f.accountKind, opportunityName: f.opportunityName, linkExisting: !!f.linkExisting };
        try { const r = await api.convertCrmLead(l.id, opts); closeModal(); toast(r.linkedExisting ? 'Lead linked to the existing client' : 'Lead converted'); go('/crm/contacts/' + r.contactId); }
        catch (err) { $('[data-convert-err]', m).textContent = err.message; if (/existing client/i.test(err.message)) $('[data-link-existing]', m).hidden = false; } });
    }); } };
}

// ---------------- CLIENTS (Zoho list: Client Name, Company Name, Role in Company, Email, Mobile, Lead Source, Status, Client Owner) ----------------
async function contactsList({ api, me, owners, go }) {
  const rows = await api.listCrmContacts(); const accounts = me.canEdit ? await api.listCrmAccounts() : [];
  const lv = listView({ key: 'contacts', rows, fields: ['name', 'email', 'companyName', 'phone', 'mobile', 'tags', 'county', 'city', 'roleInCompany'],
    cols: [['name', 'Client Name', (r) => html`${link('contacts', r)}${r.archived ? html` ${pill('Archived')}` : ''}${r.hasLogin ? html` <span class="muted small">(portal login)</span>` : ''}`],
      ['companyName', 'Company Name', (r) => (r.accountId ? html`<a href="#/crm/accounts/${r.accountId}">${r.accountName}</a>` : r.company)], ['roleInCompany', 'Role in Company'], ['email', 'Email'], ['mobile', 'Mobile'],
      ['leadSource', 'Lead Source'], ['relationshipStatus', 'Status', (r) => r.relationshipStatus || muted('—')], ['ownerName', 'Client Owner', (r) => r.ownerName || muted('Unassigned')],
      ['county', 'County'], ['contactType', 'Contact type', (r) => ctype(r.contactType)], ['orders', 'Orders'], ['volume', 'Volume', (r) => money(r.volume)]],
    filters: [['ownerId', 'Client Owner', ownerOpts(owners), 'Any owner'], ['roleInCompany', 'Role in Company', pairs(ROLES_IN_COMPANY), 'Any role'], ['relationshipStatus', 'Status', [...pairs(RELATIONSHIP_STATUSES), ['none', 'Not set']], 'Any status'],
      ['leadSource', 'Lead Source', pairs(LEAD_SOURCES), 'Any source'], ['county', 'County', countyOpts(rows), 'Any county'], ['state', 'State', stateOpts(rows), 'Any state'], ['contactType', 'Contact type', ctOpts, 'Any type'], ['archived', 'Archived', archivedOpts, 'Hide archived']],
    sorts: [['name', 'Client Name'], ['companyName', 'Company Name'], ['relationshipStatus', 'Status'], ['county', 'County'], ['lastContactedOn', 'Last contacted'], ['orders', 'Orders'], ['volume', 'Volume'], ['ownerName', 'Client Owner']] });
  const body = html`${head('CRM: Clients', me, me.canEdit ? html`<button class="m-btn right" data-new-contact>+ Create Client</button>` : '')}${tabs('contacts')}
    <p class="muted small">Clients are the portal's own contacts (one person per email). CLA staff are not listed.</p>${lv.body}`;
  return { title: 'CRM Clients', crumbs: crumbs('Clients'), body, mount(root) { lv.mount(root);
    const b = $('[data-new-contact]', root); if (b) b.addEventListener('click', () => personModal('contact', blankPerson(me), { owners, accounts, me, blank: () => blankPerson(me) }, (v) => api.createCrmContact(v), (r) => go('/crm/contacts/' + r.id))); } };
}
async function contactPage({ api, me, owners, assignees, params, refresh }) {
  const c = await api.getCrmContact(params.id); const accounts = me.canEdit ? await api.listCrmAccounts() : [];
  const extra = html`<dt>Portal login</dt><dd>${c.hasLogin ? 'Yes (outside user)' : 'No'}</dd>
    <dt>Salespeople</dt><dd data-sales-reps>${c.salesReps.length ? c.salesReps.map((s) => s.name).join(', ') : muted('none linked')} <span class="muted small">(client links from Admin &gt; Users)</span></dd>
    <dt>Last contacted</dt><dd>${fmtDate(c.lastContactedOn) || muted('—')}</dd><dt>Tags</dt><dd data-f="tags">${c.tags.join(', ') || muted('—')}</dd>
    ${c.fromLeadId ? html`<dt>From lead</dt><dd><a href="#/crm/leads/${c.fromLeadId}">open the lead</a></dd>` : ''}`;
  const body = html`${head(`Client: ${c.name}`, me)}${tabs('contacts')}
    <div class="card" data-contact="${c.id}"><h3>${c.name} ${c.archived ? pill('Archived') : ''}</h3>
      <p>${me.canEdit ? html`<button class="ghost" data-edit-contact>Edit</button> ` : ''}${archiveBtn(me, 'contact', c.id, c.archived)} <a class="ghost" href="#/crm/contacts">Back to clients</a></p>
      <span hidden data-contact-account>${c.accountId ? c.accountName : ''}</span></div>
    ${personView('contact', c, extra)}
    ${relatedHtml(c, { entity: 'contact', entityId: c.id, me })}
    ${ordersCard(c.orders, c.totals)}
    <div class="card" data-contact-opps><h3>Pipeline</h3>${c.opportunities.length ? html`<ul>${c.opportunities.map((o) => html`<li>${o.name}: <strong>${o.stage}</strong> (${o.ownerName || 'unassigned'})</li>`)}</ul>` : html`<p class="muted">No opportunities.</p>`}<a href="#/crm/pipeline">Open the pipeline</a></div>`;
  return { title: 'Client ' + c.name, crumbs: crumbs('Clients', ['#/crm/contacts', c.name]), body, mount(root) {
    wireArchive(root, api, refresh); wireRelated(root, api, refresh, { entity: 'contact', entityId: c.id, parentName: c.name, me, assignees });
    const e = $('[data-edit-contact]', root); if (e) e.addEventListener('click', () => personModal('contact', c, { owners, accounts, me, edit: true }, (v) => api.updateCrmContact(c.id, v), () => refresh())); } };
}

// ---------------- COMPANIES ----------------
async function accountsList({ api, me, owners, go }) {
  const rows = (await api.listCrmAccounts()).map((a) => ({ ...a, place: [a.city, a.state].filter(Boolean).join(', ') }));
  const lv = listView({ key: 'accounts', rows, fields: ['name', 'city', 'website', 'notes'],
    cols: [['name', 'Company Name', (r) => html`${link('accounts', r)}${r.archived ? html` ${pill('Archived')}` : ''}`], ['kind', 'Type', (r) => accountKindLabel(r.kind)], ['place', 'City'], ['ownerName', 'Company Owner', (r) => r.ownerName || muted('Unassigned')],
      ['contacts', 'Clients'], ['orders', 'Orders'], ['volume', 'Volume', (r) => money(r.volume)]],
    filters: [['ownerId', 'Company Owner', ownerOpts(owners), 'Any owner'], ['kind', 'Type', ACCOUNT_KINDS, 'Any type'], ['archived', 'Archived', archivedOpts, 'Hide archived']],
    sorts: [['name', 'Name'], ['kind', 'Type'], ['orders', 'Orders'], ['volume', 'Volume'], ['ownerName', 'Company Owner']] });
  const body = html`${head('CRM: Companies', me, me.canEdit ? html`<button class="m-btn right" data-new-account>+ Create Company</button>` : '')}${tabs('accounts')}${lv.body}`;
  return { title: 'CRM Companies', crumbs: crumbs('Companies'), body, mount(root) { lv.mount(root);
    const b = $('[data-new-account]', root); if (b) b.addEventListener('click', () => accountForm(api, me, owners, null, (a) => go('/crm/accounts/' + a.id))); } };
}
function accountForm(api, me, owners, a, done) {
  const v = a || { kind: 'brokerage', ownerId: me.isAdmin ? '' : me.id };
  const open = (vals) => { const m = modal(a ? 'Edit Company' : 'Create Company', html`<form id="acc-form" class="form-grid"><label>Company Name *<input name="name" maxlength="160" value="${vals.name || ''}"></label><label>Type${sel('kind', ACCOUNT_KINDS, vals.kind)}</label>
    <label>Phone<input name="phone" type="tel" data-phone value="${vals.phone || ''}"></label><label>Website<input name="website" value="${vals.website || ''}"></label>
    <label>City<input name="city" value="${vals.city || ''}"></label><label>State${sel('state', US_STATES.map((s) => [s, s]), vals.state, '—')}</label>
    <label>Company Owner${ownerSel(owners, vals.ownerId)}</label><label class="span2">Description<textarea name="notes" rows="2">${vals.notes || ''}</textarea></label>
    <p class="err-text span2" data-form-err></p>
    <div class="span2"><button class="ghost" type="button" data-close>Cancel</button> ${a ? '' : html`<button class="ghost" type="button" data-save-new>Save and New</button> `}<button class="m-btn" type="submit">Save</button></div></form>`, { wide: true });
    const f = $('#acc-form', m);
    const run = (andNew) => guard(async (e) => { if (e) e.preventDefault(); $('[data-form-err]', f).textContent = '';
      try { const r = a ? await api.updateCrmAccount(a.id, formData(f)) : await api.createCrmAccount(formData(f)); toast(a ? 'Company saved' : 'Company created');
        if (andNew) open({ kind: 'brokerage', ownerId: me.isAdmin ? '' : me.id }); else { closeModal(); done(r); } } catch (err) { $('[data-form-err]', f).textContent = err.message; throw err; } });
    f.addEventListener('submit', run(false)); const sn = $('[data-save-new]', f); if (sn) sn.addEventListener('click', run(true)); };
  open(v);
}
async function accountPage({ api, me, owners, assignees, params, refresh }) {
  const a = await api.getCrmAccount(params.id);
  const body = html`${head(`Company: ${a.name}`, me)}${tabs('accounts')}
    <div class="card" data-account="${a.id}"><h3>${a.name} ${a.archived ? pill('Archived') : ''}</h3>
      <dl class="kv"><dt>Type</dt><dd>${accountKindLabel(a.kind)}</dd><dt>Phone</dt><dd>${a.phone || '—'}</dd><dt>Website</dt><dd>${a.website || '—'}</dd><dt>City</dt><dd>${[a.city, a.state].filter(Boolean).join(', ') || '—'}</dd>
        <dt>Company Owner</dt><dd data-account-owner>${a.ownerName || 'Unassigned'}</dd><dt>Description</dt><dd>${a.notes || '—'}</dd></dl>
      <p>${me.canEdit ? html`<button class="ghost" data-edit-account>Edit</button> ` : ''}${archiveBtn(me, 'account', a.id, a.archived)}</p></div>
    <div class="card" data-account-contacts><h3>Clients at ${a.name} (${a.contactList.length})</h3>
      <table class="tbl"><thead><tr><th>Client Name</th><th>Role in Company</th><th>Client Owner</th><th>Status</th><th>Orders</th><th>Volume</th></tr></thead><tbody>
      ${a.contactList.length ? a.contactList.map((c) => html`<tr data-row="${c.id}"><td>${link('contacts', c)}</td><td>${c.roleInCompany || ctype(c.contactType)}</td><td>${c.ownerName}</td><td>${c.relationshipStatus}</td><td>${c.orders}</td><td>${money(c.volume)}</td></tr>`) : html`<tr><td colspan="6" class="muted">No clients yet. Pick this company on a client's Edit form.</td></tr>`}
      </tbody></table></div>
    ${ordersCard(a.orders, a.totals, true)}
    <div class="card"><h3>Pipeline</h3>${a.opportunities.length ? html`<ul>${a.opportunities.map((o) => html`<li>${o.name}: <strong>${o.stage}</strong></li>`)}</ul>` : html`<p class="muted">No opportunities.</p>`}</div>
    ${relatedHtml(a, { entity: 'account', entityId: a.id, me })}`;
  return { title: 'Company ' + a.name, crumbs: crumbs('Companies', ['#/crm/accounts', a.name]), body, mount(root) {
    const e = $('[data-edit-account]', root); if (e) e.addEventListener('click', () => accountForm(api, me, owners, a, () => refresh()));
    wireArchive(root, api, refresh); wireRelated(root, api, refresh, { entity: 'account', entityId: a.id, parentName: a.name, me, assignees }); } };
}
