// crm.js : the CRM (John, Nov 2). Routes #/crm/<section>[/<id>]: home (default), leads, contacts (= Clients), accounts (= Companies), pipeline, reports,
// tasks/<id>, meetings/<id>; followups (older link) shows Home. Labels follow John's Zoho (Clients / Companies); internal names stay contacts / accounts.
// Reachable only when the `crm` feature flag is on (app.js never loads this module otherwise) and only for CLA staff (adapter refuses others).
import { html, raw, $, $$, guard, formData, toast, fmtDate, fmtDateTime, modal, closeModal, pill } from '../ui.js?v=202611070139';
import { CONTACT_TYPES, contactTypeLabel, US_STATES, US_STATE_NAMES } from '../data/constants.js?v=202611101015';
import { LEAD_SOURCES, RELATIONSHIP_STATUSES, ROLES_IN_COMPANY, ACCOUNT_KINDS, accountKindLabel, accountKindForType } from '../data/crm.js?v=202611070139';
import { display, moduleFields } from '../data/crm-analytics.js?v=202611070139';
import { tabs, head, sel, pairs, ownerSel, ctype, money, listView, ordersCard, archiveBtn, wireArchive, setCrmAdmin, setCrmMe } from './crm-kit.js?v=202611121000';
import { newActivityPage, importPage, wireCompanyDup, dupHtml } from './crm-janine.js?v=202611131900';
import { flattenCustom, defaultOption, fieldsInSection } from '../data/crm-config.js?v=202611070139';
import { optSel, lbl, fopts, hiddenField, cfInputs, cfRows, cfCols, cfFilters, cfSorts, cfSearch, cfExtraSections, wireCfFiles } from './crm-custom.js?v=202611070139';
import { settingsPage } from './crm-settings.js?v=202611121000';
import { personModal, personView, relatedHtml, wireRelated, taskModal, meetingModal } from './crm-forms.js?v=202611131900';
import { pipelinePage, reportsPage } from './crm-more.js?v=202611121000';
import { homePage, taskPage, meetingPage } from './crm-home.js?v=202611131900';
import { templatesPage, signaturePage, composeBtn, wireCompose } from './crm-templates.js?v=202611121000';
import { sendEmailBtn, wireSendEmail, emailsCard, wireEmails } from './crm-compose.js?v=202611090905';
import { searchPage } from './crm-search.js?v=202611121000';
import { dashboardsPage } from './crm-dashboards.js?v=202611130700';
import { reportsHome } from './crm-reports.js?v=202611121000';
import { dealsPage } from './crm-deals.js?v=202611121000';
import { callPage, callModal } from './crm-calls.js?v=202611121000';
import { viewPage, viewsBar, wireViewsBar } from './crm-views.js?v=202611121000';

const crumbs = (label, extra) => [['CRM', '#/crm'], ...(extra ? [[label, extra[0]], [extra[1]]] : [[label]])];
const archivedOpts = [['only', 'Archived only'], ['all', 'Active + archived']];
const ownerOpts = (owners) => [['none', 'Unassigned'], ...owners.map((o) => [o.id, o.name])];
const ctOpts = [...CONTACT_TYPES, ['none', 'Not set']];
const countyOpts = (rows) => [...new Set(rows.map((r) => (r.county || '').trim()).filter(Boolean))].sort().map((c) => [c, c]).concat([['none', '(no county)']]);
const stateOpts = (rows) => [...new Set(rows.map((r) => r.state).filter(Boolean))].sort().map((s) => [s, s]);
const link = (sec, r) => html`<a href="#/crm/${sec}/${r.id}" data-open="${r.id}">${r.name}</a>`;
const muted = (t) => html`<span class="muted">${t}</span>`;
// record header (Zoho, video 7): Send Email | Edit | More (Archive, Compose from template). Nothing is ever sent.
const moreMenu = (...items) => html`<details class="more-menu" data-more style="display:inline-block"><summary class="ghost" data-more-btn>More &#9662;</summary><div data-more-items>${items}</div></details>`;
const noteRecent = (api, entity, id) => { if (!api || typeof api.noteCrmRecent !== 'function') return; try { const p = api.noteCrmRecent(entity, id); if (p && typeof p.catch === 'function') p.catch(() => {}); } catch { /* a recent-item note never blocks the record */ } };
const recordEmails = async (api, entity, id) => { if (!api || typeof api.listCrmEmails !== 'function') return []; try { const rows = await api.listCrmEmails(entity, id); return Array.isArray(rows) ? rows : []; } catch { return []; } };
// Zoho record header prev / next arrows (video 7): the neighbours in the list order (by name, archived left out), only records you may see
async function recNav(list, id, base) {
  const rows = (await list).filter((r) => !r.archived || r.id === id).sort((a, b) => String(a.name).localeCompare(String(b.name)) || String(a.id).localeCompare(String(b.id)));
  const i = rows.findIndex((r) => r.id === id); if (i < 0) return '';
  const p = rows[i - 1]; const n = rows[i + 1];
  return html`<span data-rec-nav>${p ? html`<a class="ghost" href="#/crm/${base}/${p.id}" data-rec-prev title="Previous: ${p.name}" aria-label="Previous record">&lsaquo;</a>` : html`<span class="ghost muted" aria-hidden="true">&lsaquo;</span>`} <span class="muted small">${i + 1} of ${rows.length}</span> ${n ? html`<a class="ghost" href="#/crm/${base}/${n.id}" data-rec-next title="Next: ${n.name}" aria-label="Next record">&rsaquo;</a>` : html`<span class="ghost muted" aria-hidden="true">&rsaquo;</span>`}</span>`;
}

const crmBack = (params) => {
  const s = (params && params.section) || 'home';
  if (s === 'views') { const mod = params.id === 'new' ? params.sub : ''; return ['contacts', 'leads', 'accounts', 'deals'].includes(mod) ? `/crm/${mod}` : '/crm'; }
  if (['leads', 'contacts', 'accounts', 'deals', 'pipeline', 'reports', 'dashboards', 'templates', 'settings', 'search'].includes(s)) return `/crm/${s}`;
  return '/crm';
};
export async function render(ctx) {
  try { return await renderCrm(ctx); }
  catch (e) {
    const back = crmBack(ctx.params);
    return { title: 'Not available', crumbs: [['CRM', '#/crm'], ['Not available']], body: html`<div class="box-title" data-crm-unavailable><h2>Not available</h2></div><p class="err-text">${e.message}</p><p><a class="back-btn" href="#${back}" data-crm-back>Back</a></p>` };
  }
}
async function renderCrm(ctx) {
  const { api, params } = ctx; const me = await api.crmMe(); setCrmAdmin(me.canConfigure); setCrmMe(me);
  const [owners, assignees, cfg] = await Promise.all([api.listCrmOwners(), api.listCrmAssignees(), api.getCrmSettings()]); const c = { ...ctx, me, owners, assignees, cfg };
  // Nov 3 (b): choices for User and Lookup custom fields (only loaded when such a field exists)
  const cfl = (cfg.customFields || []).filter((f) => !f.archivedAt); cfg.userOptions = owners.map((o) => [o.id, o.name]);
  const targets = [...new Set(cfl.filter((f) => f.type === 'lookup').map((f) => (f.config || {}).target).filter(Boolean))]; cfg.lookupOptions = {};
  await Promise.all(targets.map(async (t) => { try { cfg.lookupOptions[t] = (await api.listCrmModuleRows(t)).map((r) => [r.id, r.name || r.subject || r.id]); } catch { cfg.lookupOptions[t] = []; } }));
  const s = params.section || 'home';
  if (s === 'settings') return settingsPage(c);
  // Janine, Nov 3: "+" Create New -> #/crm/new/<module> (opens the module's own create form), CSV import (Admin / Super admin)
  if (s === 'new') return newPage(c);
  if (s === 'import') return importPage(c, { tabs, head });
  if (s === 'home' || s === 'followups') return homePage(c);
  if (s === 'leads') return params.id ? leadPage(c) : leadsList(c);
  if (s === 'contacts') return params.id ? contactPage(c) : contactsList(c);
  if (s === 'accounts') return params.id ? accountPage(c) : accountsList(c);
  if (s === 'tasks' && params.id) return taskPage(c);
  if (s === 'meetings' && params.id) return meetingPage(c);
  if (s === 'calls' && params.id) return callPage(c);   // video 11: a call's details
  if (s === 'pipeline') return pipelinePage(c);
  if (s === 'reports') return params.id === 'summary' ? reportsPage(c) : reportsHome(c);   // Nov 3 (b), video 10: Zoho-style reports; the older per-table summary stays at #/crm/reports/summary
  if (s === 'dashboards') return dashboardsPage(c);   // video 9
  if (s === 'deals') return dealsPage(c);   // the portal's orders as Zoho deals (read-only here)
  if (s === 'search') return searchPage(c);   // video 7: full search results
  if (s === 'views') return viewPage(c);   // Janine, Nov 4: custom views
  if (s === 'templates') return templatesPage(c);   // Nov 3: email templates (nothing is ever sent)
  if (s === 'signature') return signaturePage(c);
  throw new Error('That CRM page does not exist.');
}

// ---------------- CREATE NEW (Janine, Nov 3) ----------------
// list-type modules: render the module's page and open its own create form (same checks as its button); task / meeting / call: pick the record first
const autoOpen = (view, selector) => ({ ...view, mount(root, x) { if (view.mount) view.mount(root, x); const b = $(selector, root); if (b) b.click(); } });
async function newPage(c) {
  const k = c.params.id; if (!c.me.canEdit) throw new Error('Read-only: you cannot create CRM records.');
  if (k === 'lead') return leadsList({ ...c, openCreate: true });
  if (k === 'contact') return contactsList({ ...c, openCreate: true });
  if (k === 'account') return accountsList({ ...c, openCreate: true });
  if (k === 'opportunity') return pipelinePage({ ...c, openCreate: true });
  if (k === 'dashboard') return autoOpen(await dashboardsPage(c), '[data-new-dash]');
  if (k === 'task' || k === 'meeting' || k === 'call') return newActivityPage(c, { tabs, head, taskModal, meetingModal, callModal });
  if (k === 'template') { c.go('/crm/templates/new'); return { title: 'New Template', crumbs: crumbs('New'), body: html`<p>Opening...</p>` }; }
  if (k === 'report') { c.go('/crm/reports/new'); return { title: 'New Report', crumbs: crumbs('New'), body: html`<p>Opening...</p>` }; }
  throw new Error('That CRM page does not exist.');
}
// old lead values stay visible in the filter even when they are not in the Leads list (Janine, Nov 3: never erased)
const leadStatusOpts = (cfg, rows) => { const o = fopts(cfg, 'leadRelationshipStatus'); const have = new Set(o.map(([v]) => v));
  const old = [...new Set(rows.map((r) => r.relationshipStatus).filter((v) => v && !have.has(v)))].sort().map((v) => [v, lbl(cfg, 'leadRelationshipStatus', v) || v]); return [...o, ...old, ['none', 'Not set']]; };
const importBtns = (me, module) => (me.isAdmin ? html` <a class="ghost right" href="#/crm/import/${module}/notes" data-import-notes-btn="${module}">Import Notes</a> <a class="ghost right" href="#/crm/import/${module}" data-import-btn="${module}">Import ${module === 'leads' ? 'Leads' : 'Clients'}</a>` : '');   // float right: shown as Import, Import Notes, + Create

// ---------------- LEADS (Zoho list: Lead Name, Company, Email, Phone, Lead Source, Lead Owner) ----------------
const blankPerson = (me) => ({ ownerId: me.isAdmin ? '' : me.id, relationshipStatus: '', links: {} });
// pick-list column: shows the current label (retired marked); CSV gets the same text. Hidden built-in fields (CRM Settings) drop out of lists too.
const pk = (cfg, key, field, label) => [field, label, (r) => lbl(cfg, key, r[field]) || muted('—'), (r) => lbl(cfg, key, r[field])];
// Manage columns lists every field of the module. The columns already on the list keep their links and labels.
const listCatalog = (module, cfg, cols) => {
  const have = new Set(cols.map((c) => c[0]));
  const scope = module === 'accounts' ? 'account' : 'person';
  const extra = moduleFields(module, cfg).filter((f) => !have.has(f.key) && !(hiddenField(cfg, scope, f.key) && !f.custom)).map((f) => [f.key, f.label, (r) => {
    const text = display(f, r, cfg); const href = f.link && r[f.link]; return href ? html`<a href="${href}">${text}</a>` : (text || muted('—'));
  }, (r) => display(f, r, cfg)]);
  return [...cols, ...extra];
};
const when = (v) => (v ? fmtDateTime(v) : html`<span class="muted">—</span>`);
const TIME_COLS = [['createdAt', 'Created Time', (r) => when(r.createdAt), (r) => r.createdAt || ''], ['modifiedAt', 'Modified Time', (r) => when(r.modifiedAt), (r) => r.modifiedAt || ''], ['lastActivityAt', 'Last Activity Time', (r) => when(r.lastActivityAt), (r) => r.lastActivityAt || '']];
// Clients: modified_at is still null until the next save. Show the created time in that column.
const CLIENT_TIME_COLS = [['createdAt', 'Created Time', (r) => when(r.createdAt), (r) => r.createdAt || ''], ['modifiedAt', 'Modified Time', (r) => when(r.modifiedAt || r.createdAt), (r) => r.modifiedAt || r.createdAt || ''], ['lastActivityAt', 'Last Activity Time', (r) => when(r.lastActivityAt), (r) => r.lastActivityAt || '']];
const TIME_SORTS = [['createdAt', 'Created Time'], ['modifiedAt', 'Modified Time'], ['lastActivityAt', 'Last Activity Time']];
async function leadsList({ api, me, owners, go, cfg, refresh, openCreate = false }) {
  const rows = (await api.listCrmLeads()).map((r) => flattenCustom(cfg, 'lead', r)); const accounts = me.canEdit ? await api.listCrmAccounts() : [];
  const H = (k) => hiddenField(cfg, 'person', k);
  const bar = await viewsBar(api, 'leads'); const leadCols = [['name', 'Lead Name', (r) => html`${link('leads', r)}${r.converted ? html` ${pill('Converted', 'ok')}` : ''}${r.archived ? html` ${pill('Archived')}` : ''}`, (r) => r.name], ['company', 'Company', (r) => (r.accountId ? html`<a href="#/crm/accounts/${r.accountId}" data-lead-company>${r.accountName}</a>` : r.company || muted('—')), (r) => r.company], ['email', 'Email'], ['phone', 'Phone'],
      ...(H('leadSource') ? [] : [pk(cfg, 'leadSource', 'leadSource', 'Lead Source')]), ...(H('relationshipStatus') ? [] : [pk(cfg, 'leadRelationshipStatus', 'relationshipStatus', 'Relationship Status')]),
      ...(H('roleInCompany') ? [] : [pk(cfg, 'roleInCompany', 'roleInCompany', 'Role in Company')]), ...(H('county') ? [] : [['county', 'County']]),
      ['ownerName', 'Lead Owner', (r) => r.ownerName || muted('Unassigned'), (r) => r.ownerName], ...TIME_COLS, ...cfCols(cfg, 'lead')];
  const lv = listView({ bar, saved: { api, listKey: 'leads' }, dates: true, key: 'leads', userId: me.id, rows, cols: leadCols.slice(0, 10), catalog: listCatalog('leads', cfg, leadCols), bulk: me.canEdit ? { module: 'lead', api, me, owners, refresh } : null, fields: ['name', 'email', 'company', 'phone', 'leadSource', 'notes', 'county', 'city', 'roleInCompany', ...cfSearch(cfg, 'lead')], sortDefault: 'createdAt:desc', csv: me.canConfigure ? 'crm-leads.csv' : '', exporter: (cols, out) => api.exportCrmList('leads', cols, out),   // John, Nov 3: CSV = Admin / Super admin only
   
    filters: [['ownerId', 'Lead Owner', ownerOpts(owners), 'Any owner'], ['roleInCompany', 'Role in Company', fopts(cfg, 'roleInCompany'), 'Any role'], ['relationshipStatus', 'Relationship Status', leadStatusOpts(cfg, rows), 'Any status'],
      ['leadSource', 'Lead Source', fopts(cfg, 'leadSource'), 'Any source'], ['county', 'County', countyOpts(rows), 'Any county'], ['state', 'State', stateOpts(rows), 'Any state'], ['contactType', 'Contact type', ctOpts, 'Any type'],
      ['converted', 'Converted', [['only', 'Converted only'], ['all', 'Open + converted']], 'Hide converted'], ['archived', 'Archived', archivedOpts, 'Hide archived'], ...cfFilters(cfg, 'lead')],
    sorts: [['name', 'Lead Name'], ['company', 'Company'], ['relationshipStatus', 'Relationship Status'], ['leadSource', 'Lead Source'], ['county', 'County'], ['ownerName', 'Lead Owner'], ...TIME_SORTS, ...cfSorts(cfg, 'lead')] });
  const body = html`${head('CRM: Leads', me, importBtns(me, 'leads'))}${tabs('leads')}${lv.body}`;
  const openLead = () => personModal('lead', blankPerson(me), { owners, accounts, me, cfg, blank: () => blankPerson(me) }, (v) => api.createCrmLead(v), (l) => go('/crm/leads/' + l.id));
  return { title: 'CRM Leads', crumbs: crumbs('Leads'), body, mount(root) { lv.mount(root); wireViewsBar(root, api); if (openCreate) openLead(); } };
}
async function leadPage({ api, me, owners, assignees, params, refresh, go, cfg }) {
  const l = await api.getCrmLead(params.id); const accounts = me.canEdit && !l.converted ? await api.listCrmAccounts() : []; const emails = await recordEmails(api, 'lead', l.id); noteRecent(api, 'lead', l.id); const nav = await recNav(api.listCrmLeads(), l.id, 'leads');
  const body = html`${head(`Lead: ${l.name}`, me)}${tabs('leads')}
    <div class="card" data-lead="${l.id}"><p>${l.converted ? html`${pill('Converted', 'ok')} to client <a href="#/crm/contacts/${l.convertedContactId}" data-converted-contact>${l.convertedContactName}</a> on ${fmtDate(l.convertedAt)}` : ''}${l.archived ? html` ${pill('Archived')}` : ''}</p>
      <p data-record-actions>${sendEmailBtn('lead', l.id, me)} ${me.canEdit && !l.converted ? html`<button class="ghost" data-edit-lead>Edit</button> ${l.archived ? '' : html`<button class="m-btn" data-convert>Convert to client</button>`} ` : ''}${moreMenu(archiveBtn(me, 'lead', l.id, l.archived), ' ', composeBtn('lead', l.id))} ${nav}
        <a class="ghost" href="#/crm/leads">Back to leads</a></p>
      <span hidden data-lead-owner>${l.ownerName || 'Unassigned'}</span><span hidden data-lead-ctype>${contactTypeLabel(l.contactType) || 'Not set'}</span><span hidden data-lead-status>${l.relationshipStatus}</span></div>
    ${personView('lead', l, html`<dt>Created</dt><dd>${fmtDateTime(l.createdAt)}</dd>${l.modifiedByName ? html`<dt>Modified By</dt><dd>${l.modifiedByName}, ${fmtDateTime(l.modifiedAt)}</dd>` : ''}`, cfg)}
    ${relatedHtml(l, { entity: 'lead', entityId: l.id, me, cfg })}${emailsCard(emails)}`;
  return { title: 'Lead ' + l.name, crumbs: crumbs('Leads', ['#/crm/leads', l.name]), body, mount(root) {
    wireSendEmail(root, api, me, refresh); wireEmails(root, api, emails); wireCfFiles(root, api, refresh); wireArchive(root, api, refresh); wireCompose(root, api, me, refresh); wireRelated(root, api, refresh, { entity: 'lead', entityId: l.id, parentName: l.name, me, assignees, cfg, rec: l });
    const e = $('[data-edit-lead]', root); if (e) e.addEventListener('click', () => personModal('lead', l, { owners, accounts, me, edit: true, cfg }, (v) => api.updateCrmLead(l.id, v), () => refresh()));
    const cv = $('[data-convert]', root); if (cv) cv.addEventListener('click', () => {
      const m = modal('Convert lead to client', html`<form id="convert-form" class="form-grid">
        <p class="span2">Creates a CRM client for <strong>${l.name}</strong> (${lbl(cfg, 'roleInCompany', l.roleInCompany) || 'no role'}, contact type ${contactTypeLabel(l.contactType) || 'not set'}) owned by ${l.ownerName || 'nobody yet'}, with all the lead's details. The lead is kept, marked Converted/Current Client.</p>
        <label>Existing company${sel('accountId', accounts.filter((a) => !a.archived).map((a) => [a.id, `${a.name} (${lbl(cfg, 'accountKind', a.kind)})`]), (l.accountId && accounts.some((a) => a.id === l.accountId && !a.archived) ? l.accountId : accounts.find((a) => l.company && a.name.toLowerCase() === l.company.toLowerCase())?.id) || '', '(none / new company)')}</label>
        <label>Or a new company<input name="newAccountName" maxlength="160" value="${!l.accountId && l.company && !accounts.some((a) => a.name.toLowerCase() === l.company.toLowerCase()) ? l.company : ''}" placeholder="Company name"></label>
        <label>New company state *${sel('accountState', US_STATE_NAMES, l.state || '', '-Pick a state-')}</label>
        <label>New company type${optSel(cfg, 'accountKind', 'accountKind', defaultOption(cfg, 'accountKind', accountKindForType(l.contactType)), null)}</label>
        <label>Also start a pipeline opportunity (optional)<input name="opportunityName" maxlength="160" placeholder="e.g. ${l.company || l.name}: referrals"></label>
        <label class="check span2" data-link-existing hidden><input type="checkbox" name="linkExisting" value="1"> Link to the existing client (one person per email)</label>
        <p class="err-text span2" data-convert-err></p>
        <div class="span2"><button class="m-btn" type="submit">Convert</button> <button class="ghost" type="button" data-close>Cancel</button></div></form>`, { wide: true });
      $('#convert-form', m).addEventListener('submit', async (ev) => { ev.preventDefault(); const f = formData(ev.target);
        const opts = { accountId: f.accountId, newAccountName: f.accountId ? '' : f.newAccountName, accountState: f.accountState, accountKind: f.accountKind, opportunityName: f.opportunityName, linkExisting: !!f.linkExisting };
        try { const r = await api.convertCrmLead(l.id, opts); closeModal(); toast(r.linkedExisting ? 'Lead linked to the existing client' : 'Lead converted'); go('/crm/contacts/' + r.contactId); }
        catch (err) { $('[data-convert-err]', m).textContent = err.message; if (/existing client/i.test(err.message)) $('[data-link-existing]', m).hidden = false; } });
    }); } };
}

// ---------------- CLIENTS (Zoho list: Client Name, Company Name, Role in Company, Email, Mobile, Lead Source, Status, Client Owner) ----------------
async function contactsList({ api, me, owners, go, cfg, refresh, openCreate = false }) {
  const rows = (await api.listCrmContacts()).map((r) => { const row = flattenCustom(cfg, 'contact', r); return { ...row, modifiedAt: row.modifiedAt || row.createdAt || null }; }); const accounts = me.canEdit ? await api.listCrmAccounts() : [];
  const H = (k) => hiddenField(cfg, 'person', k);
  const bar = await viewsBar(api, 'contacts');
  const contactCols = [['name', 'Client Name', (r) => html`${link('contacts', r)}${r.archived ? html` ${pill('Archived')}` : ''}${r.hasLogin ? html` <span class="muted small">(portal login)</span>` : ''}`, (r) => r.name],
      ['companyName', 'Company Name', (r) => (r.accountId ? html`<a href="#/crm/accounts/${r.accountId}">${r.accountName}</a>` : r.company), (r) => r.companyName], ...(H('roleInCompany') ? [] : [pk(cfg, 'roleInCompany', 'roleInCompany', 'Role in Company')]), ['email', 'Email'],
      ...(H('mobile') ? [] : [['mobile', 'Mobile']]), ...(H('leadSource') ? [] : [pk(cfg, 'leadSource', 'leadSource', 'Lead Source')]), ...(H('relationshipStatus') ? [] : [pk(cfg, 'relationshipStatus', 'relationshipStatus', 'Status')]),
      ['ownerName', 'Client Owner', (r) => r.ownerName || muted('Unassigned'), (r) => r.ownerName], ...CLIENT_TIME_COLS,
      ...(H('county') ? [] : [['county', 'County']]), ...(H('contactType') ? [] : [['contactType', 'Contact type', (r) => ctype(r.contactType), (r) => contactTypeLabel(r.contactType) || '']]), ['orders', 'Orders'], ['volume', 'Volume', (r) => money(r.volume), (r) => r.volume], ...cfCols(cfg, 'contact')];
  const lv = listView({ bar, saved: { api, listKey: 'contacts' }, dates: true, key: 'contacts', userId: me.id, rows, cols: contactCols.slice(0, 10), catalog: listCatalog('contacts', cfg, contactCols), bulk: me.canEdit ? { module: 'contact', api, me, owners, refresh } : null, fields: ['name', 'email', 'companyName', 'phone', 'mobile', 'tags', 'county', 'city', 'roleInCompany', ...cfSearch(cfg, 'contact')], csv: me.canConfigure ? 'crm-clients.csv' : '', exporter: (cols, out) => api.exportCrmList('contacts', cols, out),   // John, Nov 3: CSV = Admin / Super admin only
    filters: [['ownerId', 'Client Owner', ownerOpts(owners), 'Any owner'], ['roleInCompany', 'Role in Company', fopts(cfg, 'roleInCompany'), 'Any role'], ['relationshipStatus', 'Status', [...fopts(cfg, 'relationshipStatus'), ['none', 'Not set']], 'Any status'],
      ['leadSource', 'Lead Source', fopts(cfg, 'leadSource'), 'Any source'], ['county', 'County', countyOpts(rows), 'Any county'], ['state', 'State', stateOpts(rows), 'Any state'], ['contactType', 'Contact type', ctOpts, 'Any type'], ['archived', 'Archived', archivedOpts, 'Hide archived'], ...cfFilters(cfg, 'contact')],
    sorts: [['name', 'Client Name'], ['companyName', 'Company Name'], ['relationshipStatus', 'Status'], ['county', 'County'], ['lastContactedOn', 'Last contacted'], ['orders', 'Orders'], ['volume', 'Volume'], ['ownerName', 'Client Owner'], ...TIME_SORTS, ...cfSorts(cfg, 'contact')] });
  const body = html`${head('CRM: Clients', me, importBtns(me, 'contacts'))}${tabs('contacts')}
    <p class="muted small">Clients are the portal's own contacts (one person per email). CLA staff are not listed.</p>${lv.body}`;
  const openClient = () => personModal('contact', blankPerson(me), { owners, accounts, me, cfg, blank: () => blankPerson(me) }, (v) => api.createCrmContact(v), (r) => go('/crm/contacts/' + r.id));
  return { title: 'CRM Clients', crumbs: crumbs('Clients'), body, mount(root) { lv.mount(root); wireViewsBar(root, api); if (openCreate) openClient(); } };
}
async function contactPage({ api, me, owners, assignees, params, refresh, cfg }) {
  const c = await api.getCrmContact(params.id); const accounts = me.canEdit ? await api.listCrmAccounts() : []; const emails = await recordEmails(api, 'contact', c.id); noteRecent(api, 'contact', c.id); const nav = await recNav(api.listCrmContacts(), c.id, 'contacts');
  const extra = html`<dt>Portal login</dt><dd>${c.hasLogin ? 'Yes (outside user)' : 'No'}</dd>
    <dt>Salespeople</dt><dd data-sales-reps>${c.salesReps.length ? c.salesReps.map((s) => s.name).join(', ') : muted('none linked')} <span class="muted small">(client links from Admin &gt; Users)</span></dd>
    <dt>Last contacted</dt><dd>${fmtDate(c.lastContactedOn) || muted('—')}</dd>${hiddenField(cfg, 'person', 'tags') ? '' : html`<dt>Tags</dt><dd data-f="tags">${c.tags.join(', ') || muted('—')}</dd>`}
    ${c.fromLeadId ? html`<dt>From lead</dt><dd><a href="#/crm/leads/${c.fromLeadId}">open the lead</a></dd>` : ''}`;
  const body = html`${head(`Client: ${c.name}`, me)}${tabs('contacts')}
    <div class="card" data-contact="${c.id}"><h3>${c.name} ${c.archived ? pill('Archived') : ''}</h3>
      <p data-record-actions>${sendEmailBtn('contact', c.id, me)} ${me.canEdit ? html`<button class="ghost" data-edit-contact>Edit</button> ` : ''}${moreMenu(archiveBtn(me, 'contact', c.id, c.archived), ' ', composeBtn('contact', c.id))} ${nav} <a class="ghost" href="#/crm/contacts">Back to clients</a></p>
      <span hidden data-contact-account>${c.accountId ? c.accountName : ''}</span></div>
    ${personView('contact', c, extra, cfg)}
    ${relatedHtml(c, { entity: 'contact', entityId: c.id, me, cfg })}
    ${ordersCard(c.orders, c.totals)}${emailsCard(emails)}
    <div class="card" data-contact-opps><h3>Pipeline</h3>${c.opportunities.length ? html`<ul>${c.opportunities.map((o) => html`<li>${o.name}: <strong>${lbl(cfg, 'oppStage', o.stage)}</strong> (${o.ownerName || 'unassigned'})</li>`)}</ul>` : html`<p class="muted">No opportunities.</p>`}<a href="#/crm/pipeline">Open the pipeline</a></div>`;
  return { title: 'Client ' + c.name, crumbs: crumbs('Clients', ['#/crm/contacts', c.name]), body, mount(root) {
    wireSendEmail(root, api, me, refresh); wireEmails(root, api, emails); wireCfFiles(root, api, refresh); wireArchive(root, api, refresh); wireCompose(root, api, me, refresh); wireRelated(root, api, refresh, { entity: 'contact', entityId: c.id, parentName: c.name, me, assignees, cfg, rec: c });
    const e = $('[data-edit-contact]', root); if (e) e.addEventListener('click', () => personModal('contact', c, { owners, accounts, me, edit: true, cfg }, (v) => api.updateCrmContact(c.id, v), () => refresh())); } };
}

// ---------------- COMPANIES ----------------
async function accountsList({ api, me, owners, go, cfg, refresh, openCreate = false }) {
  const rows = (await api.listCrmAccounts()).map((a) => flattenCustom(cfg, 'account', { ...a, place: [a.city, a.state].filter(Boolean).join(', ') }));
  const bar = await viewsBar(api, 'accounts');
  const accountCols = [['name', 'Company Name', (r) => html`${link('accounts', r)}${r.archived ? html` ${pill('Archived')}` : ''}`, (r) => r.name], pk(cfg, 'accountKind', 'kind', 'Type'), ...(hiddenField(cfg, 'account', 'city') ? [] : [['place', 'City']]), ['ownerName', 'Company Owner', (r) => r.ownerName || muted('Unassigned'), (r) => r.ownerName],
      ['contacts', 'Clients'], ['orders', 'Orders'], ['volume', 'Volume', (r) => money(r.volume), (r) => r.volume], ...TIME_COLS, ...cfCols(cfg, 'account')];
  const lv = listView({ bar, saved: { api, listKey: 'accounts' }, dates: true, key: 'accounts', userId: me.id, rows, cols: accountCols.slice(0, 10), catalog: listCatalog('accounts', cfg, accountCols), bulk: me.canEdit ? { module: 'account', api, me, owners, refresh } : null, fields: ['name', 'city', 'website', 'notes', ...cfSearch(cfg, 'account')], csv: me.canConfigure ? 'crm-companies.csv' : '', exporter: (cols, out) => api.exportCrmList('accounts', cols, out),   // John, Nov 3: CSV = Admin / Super admin only
    filters: [['ownerId', 'Company Owner', ownerOpts(owners), 'Any owner'], ['kind', 'Type', fopts(cfg, 'accountKind'), 'Any type'], ['archived', 'Archived', archivedOpts, 'Hide archived'], ...cfFilters(cfg, 'account')],
    sorts: [['name', 'Name'], ['kind', 'Type'], ['orders', 'Orders'], ['volume', 'Volume'], ['ownerName', 'Company Owner'], ...TIME_SORTS, ...cfSorts(cfg, 'account')] });
  const body = html`${head('CRM: Companies', me)}${tabs('accounts')}${lv.body}`;
  return { title: 'CRM Companies', crumbs: crumbs('Companies'), body, mount(root) { lv.mount(root); wireViewsBar(root, api);
    if (openCreate) accountForm(api, me, owners, null, (a) => go('/crm/accounts/' + a.id), cfg); } };
}
function accountForm(api, me, owners, a, done, cfg = null) {
  const blankKind = () => defaultOption(cfg, 'accountKind', 'brokerage');
  const v = a || { kind: blankKind(), ownerId: me.isAdmin ? '' : me.id };
  const H = (k) => hiddenField(cfg, 'account', k); const extra = fieldsInSection(cfg, 'account', 'additional');
  const open = (vals) => { const m = modal(a ? 'Edit Company' : 'Create Company', html`<form id="acc-form" class="form-grid" novalidate><label>Company Name *<input name="name" maxlength="160" value="${vals.name || ''}"><span data-dup-warn></span></label><label>Type${optSel(cfg, 'accountKind', 'kind', vals.kind, null)}</label>
    ${H('phone') ? '' : html`<label>Phone<input name="phone" type="tel" data-phone value="${vals.phone || ''}"></label>`}${H('website') ? '' : html`<label>Website<input name="website" value="${vals.website || ''}"></label>`}
    ${H('city') ? '' : html`<label>City<input name="city" value="${vals.city || ''}"></label>`}<label>State *${sel('state', US_STATE_NAMES.map(([s, n]) => [s, `${n} (${s})`]), vals.state, '-Pick a state-')}</label>
    <label>Company Owner${ownerSel(owners, vals.ownerId)}</label>${H('notes') ? '' : html`<label class="span2">Description<textarea name="notes" rows="2">${vals.notes || ''}</textarea></label>`}
    ${cfInputs(cfg, 'account', 'info', vals)}${extra.length ? html`<h4 class="span2" data-additional>Additional Information</h4>${cfInputs(cfg, 'account', 'additional', vals)}` : ''}${cfExtraSections(cfg, 'account', 'form', vals)}
    <p class="err-text span2" data-form-err></p>
    <div class="span2"><button class="ghost" type="button" data-close>Cancel</button> ${a ? '' : html`<button class="ghost" type="button" data-save-new>Save and New</button> `}<button class="m-btn" type="submit">Save</button></div></form>`, { wide: true });
    const f = $('#acc-form', m); wireCompanyDup(f, api, a ? a.id : null);   // Janine, Nov 3: State is mandatory; duplicates are refused (with a link to the existing company)
    const run = (andNew) => guard(async (e) => { if (e) e.preventDefault(); $('[data-form-err]', f).textContent = '';
      try { const r = a ? await api.updateCrmAccount(a.id, formData(f)) : await api.createCrmAccount(formData(f)); toast(a ? 'Company saved' : 'Company created');
        if (andNew) open({ kind: blankKind(), ownerId: me.isAdmin ? '' : me.id }); else { closeModal(); done(r); } } catch (err) { const box = $('[data-form-err]', f); box.textContent = err.message; if (err.duplicate) { box.innerHTML = ''; box.appendChild(document.createRange().createContextualFragment(String(dupHtml(err.duplicate)))); box.dataset.dupBlocked = err.duplicate.id; } throw err; } });
    f.addEventListener('submit', run(false)); const sn = $('[data-save-new]', f); if (sn) sn.addEventListener('click', run(true)); };
  open(v);
}
async function accountPage({ api, me, owners, assignees, params, refresh, cfg }) {
  const a = await api.getCrmAccount(params.id); const H = (k) => hiddenField(cfg, 'account', k); const emails = await recordEmails(api, 'account', a.id); noteRecent(api, 'account', a.id);
  const body = html`${head(`Company: ${a.name}`, me)}${tabs('accounts')}
    <div class="card" data-account="${a.id}"><h3>${a.name} ${a.archived ? pill('Archived') : ''}</h3>
      <dl class="kv"><dt>Type</dt><dd data-f="kind">${lbl(cfg, 'accountKind', a.kind)}</dd>${H('phone') ? '' : html`<dt>Phone</dt><dd>${a.phone || '—'}</dd>`}${H('website') ? '' : html`<dt>Website</dt><dd>${a.website || '—'}</dd>`}${H('city') && H('state') ? '' : html`<dt>City</dt><dd>${[H('city') ? '' : a.city, H('state') ? '' : a.state].filter(Boolean).join(', ') || '—'}</dd>`}
        <dt>Company Owner</dt><dd data-account-owner>${a.ownerName || 'Unassigned'}</dd>${H('notes') ? '' : html`<dt>Description</dt><dd>${a.notes || '—'}</dd>`}${cfRows(cfg, 'account', 'info', a)}</dl>
      ${fieldsInSection(cfg, 'account', 'additional').length ? html`<h3 data-additional>Additional Information</h3><dl class="kv" data-custom-fields>${cfRows(cfg, 'account', 'additional', a)}</dl>` : ''}${cfExtraSections(cfg, 'account', 'view', a)}
      <p data-record-actions>${sendEmailBtn('account', a.id, me)} ${me.canEdit ? html`<button class="ghost" data-edit-account>Edit</button> ` : ''}${moreMenu(archiveBtn(me, 'account', a.id, a.archived), ' ', composeBtn('account', a.id))}</p></div>
    <div class="card" data-account-contacts><h3>Clients at ${a.name} (${a.contactList.length})</h3>
      <table class="tbl"><thead><tr><th>Client Name</th><th>Role in Company</th><th>Client Owner</th><th>Status</th><th>Orders</th><th>Volume</th></tr></thead><tbody>
      ${a.contactList.length ? a.contactList.map((c) => html`<tr data-row="${c.id}"><td>${link('contacts', c)}</td><td>${lbl(cfg, 'roleInCompany', c.roleInCompany) || ctype(c.contactType)}</td><td>${c.ownerName}</td><td>${lbl(cfg, 'relationshipStatus', c.relationshipStatus)}</td><td>${c.orders}</td><td>${money(c.volume)}</td></tr>`) : html`<tr><td colspan="6" class="muted">No clients yet. Pick this company on a client's Edit form.</td></tr>`}
      </tbody></table></div>
    ${ordersCard(a.orders, a.totals, true)}
    <div class="card"><h3>Pipeline</h3>${a.opportunities.length ? html`<ul>${a.opportunities.map((o) => html`<li>${o.name}: <strong>${lbl(cfg, 'oppStage', o.stage)}</strong></li>`)}</ul>` : html`<p class="muted">No opportunities.</p>`}</div>
    ${relatedHtml(a, { entity: 'account', entityId: a.id, me, cfg })}${emailsCard(emails)}`;
  return { title: 'Company ' + a.name, crumbs: crumbs('Companies', ['#/crm/accounts', a.name]), body, mount(root) {
    const e = $('[data-edit-account]', root); if (e) e.addEventListener('click', () => accountForm(api, me, owners, a, () => refresh(), cfg));
    wireSendEmail(root, api, me, refresh); wireEmails(root, api, emails); wireCfFiles(root, api, refresh); wireArchive(root, api, refresh); wireCompose(root, api, me, refresh); wireRelated(root, api, refresh, { entity: 'account', entityId: a.id, parentName: a.name, me, assignees, cfg, rec: a }); } };
}
