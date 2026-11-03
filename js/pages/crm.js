// crm.js : the CRM (John, Nov 2). Routes #/crm/<section>[/<id>]: leads, contacts, accounts, pipeline, followups, reports.
// Reachable only when the `crm` feature flag is on (app.js never loads this module otherwise) and only for CLA staff (adapter refuses others).
import { html, raw, $, $$, guard, formData, toast, fmtDate, modal, closeModal, pill } from '../ui.js?v=202611022019';
import { CONTACT_TYPES, contactTypeLabel, US_STATES } from '../data/constants.js?v=202611022019';
import { LEAD_STATUSES, LEAD_SOURCES, CRM_STAGES, crmStageLabel, ACCOUNT_KINDS, accountKindLabel, accountKindForType } from '../data/crm.js?v=202611022019';
import { tabs, head, sel, pairs, ctypeSel, ownerSel, ctype, money, dis, listView, activityPanel, wireActivities, ordersCard, archiveBtn, wireArchive } from './crm-kit.js?v=202611022019';
import { pipelinePage, followupsPage, reportsPage } from './crm-more.js?v=202611022019';

const crumbs = (label, extra) => [['CRM', '#/crm'], ...(extra ? [[label, extra[0]], [extra[1]]] : [[label]])];
const archivedOpts = [['only', 'Archived only'], ['all', 'Active + archived']];
const ownerOpts = (owners) => [['none', 'Unassigned'], ...owners.map((o) => [o.id, o.name])];
const ctOpts = [...CONTACT_TYPES, ['none', 'Not set']];
const link = (sec, r) => html`<a href="#/crm/${sec}/${r.id}" data-open="${r.id}">${r.name}</a>`;

export async function render(ctx) {
  const { api, params } = ctx; const me = await api.crmMe(); const owners = await api.listCrmOwners(); const c = { ...ctx, me, owners };
  const s = params.section;
  if (s === 'leads') return params.id ? leadPage(c) : leadsList(c);
  if (s === 'contacts') return params.id ? contactPage(c) : contactsList(c);
  if (s === 'accounts') return params.id ? accountPage(c) : accountsList(c);
  if (s === 'pipeline') return pipelinePage(c);
  if (s === 'followups') return followupsPage(c);
  if (s === 'reports') return reportsPage(c);
  throw new Error('That CRM page does not exist.');
}

// ---------------- LEADS ----------------
async function leadsList({ api, me, owners, refresh, go }) {
  const rows = await api.listCrmLeads();
  const lv = listView({ key: 'leads', rows, fields: ['name', 'email', 'company', 'phone', 'source', 'notes'], sortDefault: 'createdAt:desc',
    cols: [['name', 'Name', (r) => html`${link('leads', r)}${r.converted ? html` ${pill('Converted', 'ok')}` : ''}${r.archived ? html` ${pill('Archived')}` : ''}`], ['company', 'Company'], ['email', 'Email'], ['phone', 'Phone'],
      ['contactType', 'Contact type', (r) => ctype(r.contactType)], ['source', 'Source'], ['status', 'Status'], ['ownerName', 'Owner', (r) => r.ownerName || html`<span class="muted">Unassigned</span>`], ['createdAt', 'Created', (r) => fmtDate(r.createdAt)]],
    filters: [['ownerId', 'Owner', ownerOpts(owners), 'Any owner'], ['contactType', 'Contact type', ctOpts, 'Any type'], ['status', 'Status', pairs(LEAD_STATUSES), 'Any status'], ['source', 'Source', pairs(LEAD_SOURCES), 'Any source'],
      ['converted', 'Converted', [['only', 'Converted only'], ['all', 'Open + converted']], 'Hide converted'], ['archived', 'Archived', archivedOpts, 'Hide archived']],
    sorts: [['name', 'Name'], ['company', 'Company'], ['status', 'Status'], ['source', 'Source'], ['ownerName', 'Owner'], ['createdAt', 'Created']] });
  const body = html`${head('CRM: Leads', me, me.canEdit ? html`<button class="m-btn right" data-new-lead>+ New lead</button>` : '')}${tabs('leads')}${lv.body}`;
  return { title: 'CRM Leads', crumbs: crumbs('Leads'), body, mount(root) { lv.mount(root);
    const b = $('[data-new-lead]', root); if (b) b.addEventListener('click', () => leadForm(api, me, owners, null, (l) => go('/crm/leads/' + l.id))); } };
}
function leadForm(api, me, owners, l, done) {
  const v = l || { source: 'Referral', status: 'New', ownerId: me.isAdmin ? '' : me.id };
  const m = modal(l ? 'Edit lead' : 'New lead', html`<form id="lead-form" class="form-grid">
    <label>First name *<input name="firstName" required maxlength="80" value="${v.firstName || ''}"></label><label>Last name<input name="lastName" maxlength="80" value="${v.lastName || ''}"></label>
    <label>Company<input name="company" maxlength="120" value="${v.company || ''}"></label><label>Email<input name="email" type="email" value="${v.email || ''}"></label>
    <label>Phone<input name="phone" type="tel" data-phone placeholder="xxx-xxx-xxxx" value="${v.phone || ''}"></label><label>Contact type${ctypeSel(v.contactType)}</label>
    <label>Source${sel('source', pairs(LEAD_SOURCES), v.source)}</label><label>Status${sel('status', pairs(LEAD_STATUSES), v.status)}</label>
    <label>Owner${ownerSel(owners, v.ownerId)}</label><label class="span2">Notes<textarea name="notes" rows="3" maxlength="4000">${v.notes || ''}</textarea></label>
    <p class="muted small span2">One person per email: a lead cannot use the email of an existing contact.</p>
    <div class="span2"><button class="m-btn" type="submit">${l ? 'Save lead' : 'Create lead'}</button> <button class="ghost" type="button" data-close>Cancel</button></div></form>`, { wide: true });
  $('#lead-form', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); const f = formData(e.target);
    const r = l ? await api.updateCrmLead(l.id, f) : await api.createCrmLead(f); closeModal(); toast(l ? 'Lead saved' : 'Lead created'); done(r); }));
}
async function leadPage({ api, me, owners, params, refresh, go }) {
  const l = await api.getCrmLead(params.id); const accounts = me.canEdit && !l.converted ? await api.listCrmAccounts() : [];
  const body = html`${head(`Lead: ${l.name}`, me)}${tabs('leads')}
    <div class="card" data-lead="${l.id}"><p>${l.converted ? html`${pill('Converted', 'ok')} to contact <a href="#/crm/contacts/${l.convertedContactId}" data-converted-contact>${l.convertedContactName}</a> on ${fmtDate(l.convertedAt)}` : ''}${l.archived ? html` ${pill('Archived')}` : ''}</p>
      <dl class="kv" data-lead-fields><dt>Company</dt><dd>${l.company || '—'}</dd><dt>Email</dt><dd>${l.email || '—'}</dd><dt>Phone</dt><dd>${l.phone || '—'}</dd><dt>Contact type</dt><dd data-lead-ctype>${contactTypeLabel(l.contactType) || 'Not set'}</dd>
        <dt>Source</dt><dd>${l.source}</dd><dt>Status</dt><dd data-lead-status>${l.status}</dd><dt>Owner</dt><dd data-lead-owner>${l.ownerName || 'Unassigned'}</dd><dt>Created</dt><dd>${fmtDate(l.createdAt)}</dd><dt>Notes</dt><dd>${l.notes || '—'}</dd></dl>
      <p>${me.canEdit && !l.converted ? html`<button class="ghost" data-edit-lead>Edit</button> ${l.archived ? '' : html`<button class="m-btn" data-convert>Convert to contact</button>`} ` : ''}${archiveBtn(me, 'lead', l.id, l.archived)}
        <a class="ghost" href="#/crm/leads">Back to leads</a></p></div>
    ${activityPanel(l.activities, { entity: 'lead', entityId: l.id, me, owners })}`;
  return { title: 'Lead ' + l.name, crumbs: crumbs('Leads', ['#/crm/leads', l.name]), body, mount(root) {
    wireActivities(root, api, refresh); wireArchive(root, api, refresh);
    const e = $('[data-edit-lead]', root); if (e) e.addEventListener('click', () => leadForm(api, me, owners, l, () => refresh()));
    const cv = $('[data-convert]', root); if (cv) cv.addEventListener('click', () => {
      const m = modal('Convert lead to contact', html`<form id="convert-form" class="form-grid">
        <p class="span2">Creates a CRM contact for <strong>${l.name}</strong> (contact type ${contactTypeLabel(l.contactType) || 'not set'}) owned by ${l.ownerName || 'nobody yet'}. The lead is kept, marked converted.</p>
        <label>Existing account${sel('accountId', accounts.filter((a) => !a.archived).map((a) => [a.id, `${a.name} (${accountKindLabel(a.kind)})`]), accounts.find((a) => l.company && a.name.toLowerCase() === l.company.toLowerCase())?.id || '', '(none / new account)')}</label>
        <label>Or a new account<input name="newAccountName" maxlength="160" value="${l.company && !accounts.some((a) => a.name.toLowerCase() === l.company.toLowerCase()) ? l.company : ''}" placeholder="Company name"></label>
        <label>New account type${sel('accountKind', ACCOUNT_KINDS, accountKindForType(l.contactType))}</label>
        <label>Also start a pipeline opportunity (optional)<input name="opportunityName" maxlength="160" placeholder="e.g. ${l.company || l.name}: referrals"></label>
        <label class="check span2" data-link-existing hidden><input type="checkbox" name="linkExisting" value="1"> Link to the existing contact (one person per email)</label>
        <p class="err-text span2" data-convert-err></p>
        <div class="span2"><button class="m-btn" type="submit">Convert</button> <button class="ghost" type="button" data-close>Cancel</button></div></form>`, { wide: true });
      $('#convert-form', m).addEventListener('submit', async (ev) => { ev.preventDefault(); const f = formData(ev.target);
        const opts = { accountId: f.accountId, newAccountName: f.accountId ? '' : f.newAccountName, accountKind: f.accountKind, opportunityName: f.opportunityName, linkExisting: !!f.linkExisting };
        try { const r = await api.convertCrmLead(l.id, opts); closeModal(); toast(r.linkedExisting ? 'Lead linked to the existing contact' : 'Lead converted'); go('/crm/contacts/' + r.contactId); }
        catch (err) { $('[data-convert-err]', m).textContent = err.message; if (/existing contact/i.test(err.message)) $('[data-link-existing]', m).hidden = false; } });
    }); } };
}

// ---------------- CONTACTS ----------------
const stageOpts = [...CRM_STAGES, ['none', 'Not set']];
async function contactsList({ api, me, owners, go }) {
  const rows = await api.listCrmContacts(); const accounts = me.canEdit ? await api.listCrmAccounts() : [];
  const lv = listView({ key: 'contacts', rows, fields: ['name', 'email', 'company', 'phone', 'accountName', 'tags'],
    cols: [['name', 'Name', (r) => html`${link('contacts', r)}${r.archived ? html` ${pill('Archived')}` : ''}${r.hasLogin ? html` <span class="muted small">(portal login)</span>` : ''}`], ['contactType', 'Contact type', (r) => ctype(r.contactType)],
      ['accountName', 'Account', (r) => (r.accountId ? html`<a href="#/crm/accounts/${r.accountId}">${r.accountName}</a>` : r.company)], ['ownerName', 'Owner', (r) => r.ownerName || html`<span class="muted">Unassigned</span>`],
      ['stage', 'CRM stage', (r) => r.stageLabel || html`<span class="muted">&mdash;</span>`], ['lastContactedOn', 'Last contacted', (r) => fmtDate(r.lastContactedOn)], ['tags', 'Tags', (r) => r.tags.join(', ')],
      ['orders', 'Orders'], ['volume', 'Volume', (r) => money(r.volume)]],
    filters: [['ownerId', 'Owner', ownerOpts(owners), 'Any owner'], ['contactType', 'Contact type', ctOpts, 'Any type'], ['stage', 'CRM stage', stageOpts, 'Any stage'], ['archived', 'Archived', archivedOpts, 'Hide archived']],
    sorts: [['name', 'Name'], ['accountName', 'Account'], ['lastContactedOn', 'Last contacted'], ['orders', 'Orders'], ['volume', 'Volume'], ['ownerName', 'Owner']] });
  const body = html`${head('CRM: Contacts', me, me.canEdit ? html`<button class="m-btn right" data-new-contact>+ New contact</button>` : '')}${tabs('contacts')}
    <p class="muted small">These are the portal's own contacts (one person per email). CLA staff are not listed.</p>${lv.body}`;
  return { title: 'CRM Contacts', crumbs: crumbs('Contacts'), body, mount(root) { lv.mount(root);
    const b = $('[data-new-contact]', root); if (b) b.addEventListener('click', () => {
      const m = modal('New contact', html`<form id="ncon-form" class="form-grid"><label>First name *<input name="firstName" required maxlength="80"></label><label>Last name<input name="lastName" maxlength="80"></label>
        <label>Email<input name="email" type="email"></label><label>Phone<input name="phone" type="tel" data-phone placeholder="xxx-xxx-xxxx"></label><label>Contact type${ctypeSel('')}</label>
        <label>Account${sel('accountId', accounts.filter((a) => !a.archived).map((a) => [a.id, a.name]), '', '(none)')}</label><label>Company (if no account)<input name="company" maxlength="120"></label>
        <label>Owner${ownerSel(owners, me.isAdmin ? '' : me.id)}</label><label>CRM stage${sel('stage', CRM_STAGES, 'prospect')}</label><label>Tags<input name="tags" placeholder="comma separated"></label>
        <p class="muted small span2">No portal login and no email is sent. A contact cannot reuse the email of another contact or user.</p>
        <div class="span2"><button class="m-btn" type="submit">Create contact</button> <button class="ghost" type="button" data-close>Cancel</button></div></form>`, { wide: true });
      $('#ncon-form', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); const r = await api.createCrmContact(formData(e.target)); closeModal(); toast('Contact created'); go('/crm/contacts/' + r.id); }));
    }); } };
}
async function contactPage({ api, me, owners, params, refresh }) {
  const c = await api.getCrmContact(params.id); const accounts = me.canEdit ? await api.listCrmAccounts() : [];
  const body = html`${head(`Contact: ${c.name}`, me)}${tabs('contacts')}
    <div class="card-grid"><div class="card" data-contact="${c.id}"><h3>${c.name} ${c.archived ? pill('Archived') : ''}</h3>
      <dl class="kv"><dt>Email</dt><dd>${c.email || '—'}</dd><dt>Phone</dt><dd>${c.phone || '—'}</dd><dt>Company</dt><dd>${c.company || '—'}</dd>
        <dt>Account</dt><dd data-contact-account>${c.accountId ? html`<a href="#/crm/accounts/${c.accountId}">${c.accountName}</a>` : '—'}</dd><dt>Portal login</dt><dd>${c.hasLogin ? 'Yes (outside user)' : 'No'}</dd>
        <dt>Salespeople</dt><dd data-sales-reps>${c.salesReps.length ? c.salesReps.map((s) => s.name).join(', ') : html`<span class="muted">none linked</span>`} <span class="muted small">(client links from Admin &gt; Users)</span></dd>
        ${c.fromLeadId ? html`<dt>From lead</dt><dd><a href="#/crm/leads/${c.fromLeadId}">open the lead</a></dd>` : ''}</dl>
      <p class="muted small">Name, email and phone are edited by the Processor on the order's Contacts tab.</p><p>${archiveBtn(me, 'contact', c.id, c.archived)}</p></div>
    <form class="card form-grid" id="crm-contact-form"><h3 class="span2">CRM details</h3>
      <label>Owner${ownerSel(owners, c.ownerId)}</label><label>Contact type${ctypeSel(c.contactType)}</label>
      <label>Account${sel('accountId', accounts.filter((a) => !a.archived || a.id === c.accountId).map((a) => [a.id, a.name]).concat(!me.canEdit && c.accountId ? [[c.accountId, c.accountName]] : []), c.accountId, '(none)')}</label>
      <label>CRM stage${sel('stage', CRM_STAGES, c.stage, '(not set)')}</label><label>Last contacted<input type="date" name="lastContactedOn" value="${c.lastContactedOn || ''}"></label>
      <label>Tags<input name="tags" value="${c.tags.join(', ')}" placeholder="comma separated"></label><label class="span2">Notes<textarea name="notes" rows="3" maxlength="4000">${c.notes}</textarea></label>
      ${me.canEdit ? html`<div class="span2"><button class="m-btn" type="submit">Save CRM details</button></div>` : ''}</form></div>
    ${ordersCard(c.orders, c.totals)}
    <div class="card" data-contact-opps><h3>Pipeline</h3>${c.opportunities.length ? html`<ul>${c.opportunities.map((o) => html`<li>${o.name}: <strong>${o.stage}</strong> (${o.ownerName || 'unassigned'})</li>`)}</ul>` : html`<p class="muted">No opportunities.</p>`}<a href="#/crm/pipeline">Open the pipeline</a></div>
    ${activityPanel(c.activities, { entity: 'contact', entityId: c.id, me, owners })}`;
  return { title: 'Contact ' + c.name, crumbs: crumbs('Contacts', ['#/crm/contacts', c.name]), body, mount(root) {
    const f = $('#crm-contact-form', root); if (!me.canEdit) $$('input,select,textarea', f).forEach((el) => { el.disabled = true; });
    f.addEventListener('submit', guard(async (e) => { e.preventDefault(); await api.updateCrmContact(c.id, formData(f)); toast('CRM details saved'); refresh(); }));
    wireActivities(root, api, refresh); wireArchive(root, api, refresh); } };
}

// ---------------- ACCOUNTS ----------------
async function accountsList({ api, me, owners, go }) {
  const rows = (await api.listCrmAccounts()).map((a) => ({ ...a, place: [a.city, a.state].filter(Boolean).join(', ') }));
  const lv = listView({ key: 'accounts', rows, fields: ['name', 'city', 'website', 'notes'],
    cols: [['name', 'Account', (r) => html`${link('accounts', r)}${r.archived ? html` ${pill('Archived')}` : ''}`], ['kind', 'Type', (r) => accountKindLabel(r.kind)], ['place', 'City'], ['ownerName', 'Owner', (r) => r.ownerName || html`<span class="muted">Unassigned</span>`],
      ['contacts', 'Contacts'], ['orders', 'Orders'], ['volume', 'Volume', (r) => money(r.volume)]],
    filters: [['ownerId', 'Owner', ownerOpts(owners), 'Any owner'], ['kind', 'Type', ACCOUNT_KINDS, 'Any type'], ['archived', 'Archived', archivedOpts, 'Hide archived']],
    sorts: [['name', 'Name'], ['kind', 'Type'], ['orders', 'Orders'], ['volume', 'Volume'], ['ownerName', 'Owner']] });
  const body = html`${head('CRM: Accounts', me, me.canEdit ? html`<button class="m-btn right" data-new-account>+ New account</button>` : '')}${tabs('accounts')}${lv.body}`;
  return { title: 'CRM Accounts', crumbs: crumbs('Accounts'), body, mount(root) { lv.mount(root);
    const b = $('[data-new-account]', root); if (b) b.addEventListener('click', () => accountForm(api, me, owners, null, (a) => go('/crm/accounts/' + a.id))); } };
}
function accountForm(api, me, owners, a, done) {
  const v = a || { kind: 'brokerage', ownerId: me.isAdmin ? '' : me.id };
  const m = modal(a ? 'Edit account' : 'New account', html`<form id="acc-form" class="form-grid"><label>Name *<input name="name" required maxlength="160" value="${v.name || ''}"></label><label>Type${sel('kind', ACCOUNT_KINDS, v.kind)}</label>
    <label>Phone<input name="phone" type="tel" data-phone value="${v.phone || ''}"></label><label>Website<input name="website" value="${v.website || ''}"></label>
    <label>City<input name="city" value="${v.city || ''}"></label><label>State${sel('state', US_STATES.map((s) => [s, s]), v.state, '—')}</label>
    <label>Owner${ownerSel(owners, v.ownerId)}</label><label class="span2">Notes<textarea name="notes" rows="2">${v.notes || ''}</textarea></label>
    <div class="span2"><button class="m-btn" type="submit">${a ? 'Save account' : 'Create account'}</button> <button class="ghost" type="button" data-close>Cancel</button></div></form>`, { wide: true });
  $('#acc-form', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); const f = formData(e.target); const r = a ? await api.updateCrmAccount(a.id, f) : await api.createCrmAccount(f); closeModal(); toast(a ? 'Account saved' : 'Account created'); done(r); }));
}
async function accountPage({ api, me, owners, params, refresh }) {
  const a = await api.getCrmAccount(params.id);
  const body = html`${head(`Account: ${a.name}`, me)}${tabs('accounts')}
    <div class="card" data-account="${a.id}"><h3>${a.name} ${a.archived ? pill('Archived') : ''}</h3>
      <dl class="kv"><dt>Type</dt><dd>${accountKindLabel(a.kind)}</dd><dt>Phone</dt><dd>${a.phone || '—'}</dd><dt>Website</dt><dd>${a.website || '—'}</dd><dt>City</dt><dd>${[a.city, a.state].filter(Boolean).join(', ') || '—'}</dd>
        <dt>Owner</dt><dd data-account-owner>${a.ownerName || 'Unassigned'}</dd><dt>Notes</dt><dd>${a.notes || '—'}</dd></dl>
      <p>${me.canEdit ? html`<button class="ghost" data-edit-account>Edit</button> ` : ''}${archiveBtn(me, 'account', a.id, a.archived)}</p></div>
    <div class="card" data-account-contacts><h3>Contacts at ${a.name} (${a.contactList.length})</h3>
      <table class="tbl"><thead><tr><th>Name</th><th>Contact type</th><th>Owner</th><th>CRM stage</th><th>Orders</th><th>Volume</th></tr></thead><tbody>
      ${a.contactList.length ? a.contactList.map((c) => html`<tr data-row="${c.id}"><td>${link('contacts', c)}</td><td>${ctype(c.contactType)}</td><td>${c.ownerName}</td><td>${crmStageLabel(c.stage)}</td><td>${c.orders}</td><td>${money(c.volume)}</td></tr>`) : html`<tr><td colspan="6" class="muted">No contacts yet. Link one from its CRM page (Account).</td></tr>`}
      </tbody></table></div>
    ${ordersCard(a.orders, a.totals, true)}
    <div class="card"><h3>Pipeline</h3>${a.opportunities.length ? html`<ul>${a.opportunities.map((o) => html`<li>${o.name}: <strong>${o.stage}</strong></li>`)}</ul>` : html`<p class="muted">No opportunities.</p>`}</div>
    ${activityPanel(a.activities, { entity: 'account', entityId: a.id, me, owners })}`;
  return { title: 'Account ' + a.name, crumbs: crumbs('Accounts', ['#/crm/accounts', a.name]), body, mount(root) {
    const e = $('[data-edit-account]', root); if (e) e.addEventListener('click', () => accountForm(api, me, owners, a, () => refresh()));
    wireActivities(root, api, refresh); wireArchive(root, api, refresh); } };
}
