// crm-kit.js : shared CRM screen pieces (John, Nov 2): section tabs, list views (search / filters / sort), selects, activities panel, CSV download.
// Function first, minimal styling. Every rule is enforced by the adapter (and RLS in migration 22), not by these screens.
import { html, raw, toText, $, $$, guard, formData, toast, fmtDate, fmtMoney, pill } from '../ui.js?v=202611060220';
import { CONTACT_TYPES, contactTypeLabel } from '../data/constants.js?v=202611060220';
import { crmFilter, crmSort, toCsv } from '../data/crm.js?v=202611060220';
import { modOn, modBeta, BETA_LABEL } from '../data/modules.js?v=202611060220';   // module switches: Deals hidden when not Live (beta badge for Admins)
import { createNewMenu } from './crm-janine.js?v=202611060220';
import { savedFiltersHtml, wireSavedFilters } from './crm-saved-filters.js?v=202611060220';

// Nov 2 (Zoho): Home is the CRM landing page; Contacts are shown as Clients and Accounts as Companies (routes keep their internal names); My follow-ups -> Home tasks
export const SECTIONS = [['home', 'Home'], ['leads', 'Leads'], ['contacts', 'Clients'], ['accounts', 'Companies'], ['deals', 'Deals'], ['pipeline', 'Pipeline'], ['dashboards', 'Dashboards'], ['reports', 'Reports'], ['templates', 'Templates']];   // Nov 3 (b): Deals (the portal's orders), Dashboards (video 9);   // Nov 3: Templates (email templates, every CRM user; Processor read-only)
// Settings tab: Admin / Super admin only (crm.js calls setCrmAdmin on every CRM page load; the adapter refuses everyone else anyway)
let ADMIN = false; export const setCrmAdmin = (v) => { ADMIN = !!v; };
const TAB_MODULE = { deals: 'crm-deals' };
// Janine, Nov 3: a "+" Create New menu at the end of the tabs on every CRM page (crm.js calls setCrmMe on every CRM page load; only modules this user may add to)
let ME = null; export const setCrmMe = (me) => { ME = me || null; };
export const tabs = (cur) => html`<div class="crm-tabs-row"><ul class="nav-tabs" data-crm-tabs>${[...SECTIONS, ...(ADMIN ? [['settings', 'Settings']] : [])].filter(([k]) => !TAB_MODULE[k] || modOn(TAB_MODULE[k])).map(([k, l]) => html`<li><a class="${k === cur ? 'active' : ''}" href="#/crm/${k}" data-crm-tab="${k}">${l}${TAB_MODULE[k] && modBeta(TAB_MODULE[k]) ? html` <span class="beta-badge" data-beta-badge="${TAB_MODULE[k]}" title="${BETA_LABEL}">Beta</span>` : ''}</a></li>`)}</ul>${ME ? createNewMenu(ME) : ''}</div>`;
export const head = (title, me, extra = '') => html`<div class="box-title"><h2><span class="h-ico"></span>${title}</h2>${extra}</div>
  ${me.canEdit ? '' : html`<p class="muted" data-readonly>Read-only: the Processor can see the CRM but not change it.</p>`}`;
export const sel = (name, list, cur, blank) => html`<select name="${name}">${blank != null ? html`<option value="">${blank}</option>` : ''}${list.map(([v, l]) => html`<option value="${v}" ${String(v) === String(cur ?? '') ? raw('selected') : ''}>${l}</option>`)}</select>`;
export const pairs = (list) => list.map((v) => [v, v]);
export const ctypeSel = (cur, name = 'contactType') => sel(name, CONTACT_TYPES, cur, '(not set)');
export const ownerSel = (owners, cur, blank = 'Unassigned', name = 'ownerId') => sel(name, owners.map((o) => [o.id, `${o.name} (${o.role})`]), cur, blank == null ? undefined : blank);
export const ctype = (c) => contactTypeLabel(c) || html`<span class="muted">&mdash;</span>`;
export const money = (n) => (n == null || n === '' ? '' : fmtMoney(n));
export const dis = (me) => (me.canEdit ? '' : raw('disabled'));

// LIST VIEW. cols: [key, label, (row) => cell, (row) => csv text]. filters: [name, label, [[value, label]], blankLabel]. sorts: [[key, label]].
// csv: file name -> an "Export CSV" button that downloads the rows currently shown (filters + sort), with the columns shown.
// exporter(cols, rows) -> { name, csv }: the adapter builds the file and refuses anyone but an Admin / Super admin (John, Nov 3: Clients, Leads, Companies)
// Janine, Nov 4: bar = the custom-view tabs (crm-views.js viewsBar) shown above the filters; saved = { api, listKey } adds Saved Filters chips
export function listView({ key, rows, cols, filters = [], sorts = [], fields, dflt = {}, sortDefault = 'name:asc', csv = '', exporter = null, bar = '', saved = null }) {
  const body = html`${bar}<form class="filter-bar" id="crm-f-${key}" onsubmit="return false">
      <label>Search<input name="q" type="search" placeholder="Name, email, company, county, tag" data-crm-search></label>
      ${filters.map(([name, label, opts, blank]) => html`<label>${label}${sel(name, opts, dflt[name] || '', blank)}</label>`)}
      <label>Sort<select name="sort">${sorts.flatMap(([k, l]) => [html`<option value="${k}:asc" ${sortDefault === k + ':asc' ? raw('selected') : ''}>${l} &uarr;</option>`, html`<option value="${k}:desc" ${sortDefault === k + ':desc' ? raw('selected') : ''}>${l} &darr;</option>`])}</select></label>
    </form>${saved ? savedFiltersHtml(saved.listKey) : ''}
    <div class="table-tools"><span class="muted" data-count></span>${csv ? html` <button class="ghost" type="button" data-list-csv="${key}">Export CSV</button>` : exporter ? html` <span class="muted small" data-csv-admin-only>CSV download: Admins only</span>` : ''}</div>
    <table class="tbl" id="crm-t-${key}"><thead><tr>${cols.map(([, l]) => html`<th>${l}</th>`)}</tr></thead><tbody></tbody></table>`;
  function mount(root) {
    const f = $(`#crm-f-${key}`, root); const tb = $(`#crm-t-${key} tbody`, root); let shown = rows;
    const apply = () => { const v = formData(f); const [k, dir] = (v.sort || sortDefault).split(':'); const list = crmSort(crmFilter(rows, v, fields), k, dir); shown = list;
      tb.innerHTML = toText(list.length ? list.map((r) => html`<tr data-row="${r.id}">${cols.map(([c, , fn]) => html`<td data-col="${c}">${fn ? fn(r) : r[c] ?? ''}</td>`)}</tr>`) : html`<tr><td colspan="${cols.length}" class="muted">Nothing matches.</td></tr>`);
      $('[data-count]', root).textContent = `${list.length} of ${rows.length} shown`; };
    f.addEventListener('input', apply); f.addEventListener('change', apply); apply();
    if (saved) wireSavedFilters(root, saved.api, saved.listKey, { getValues: () => { const v = formData(f); delete v.sort; return v; },
      setValues: (o) => { [...f.elements].forEach((el) => { if (!el.name || el.name === 'sort') return; el.value = o[el.name] != null ? o[el.name] : ''; }); apply(); },
      count: (o) => crmFilter(rows, o, fields).length });
    const cb = $(`[data-list-csv="${key}"]`, root); if (cb) cb.addEventListener('click', guard(async () => {
      const text = (c, r) => { const [k, , fn, csvFn] = c; if (csvFn) return csvFn(r); const v = r[k]; if (fn && (v == null || typeof v === 'object')) return toText(fn(r)).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim(); return v; };
      const out = shown.map((r) => Object.fromEntries(cols.map((c) => [c[0], text(c, r)])));
      if (exporter) { const r = await exporter(cols.map(([k2, l]) => [k2, l]), shown.map((row, i) => ({ id: row.id, ...out[i] }))); downloadText(r.name || csv, r.csv); }
      else downloadCsv(csv, cols.map(([k2, l]) => [k2, l]), out);
      toast('CSV downloaded'); }));
  }
  return { body, mount };
}

// orders linked to a contact / account (from the portal), with totals
export function ordersCard(orders, totals, showPeople = false) {
  return html`<div class="card" data-crm-orders><h3>Orders in the portal</h3>
    <p data-order-totals><strong>${totals.orders}</strong> order(s): ${totals.open} open, ${totals.closed} closed${totals.cancelled ? `, ${totals.cancelled} cancelled` : ''}. Volume (purchase price, not cancelled): <strong>${fmtMoney(totals.volume)}</strong></p>
    <table class="tbl"><thead><tr><th>File</th><th>Address</th><th>${showPeople ? 'People and roles' : 'Role on the file'}</th><th>Open date</th><th>Status</th><th>Purchase price</th></tr></thead>
    <tbody>${orders.length ? orders.map((o) => html`<tr data-order="${o.dealId}"><td>${o.canOpen ? html`<a href="#/deals/${o.dealId}">${o.fileNumber}</a>` : o.fileNumber}</td><td>${o.address}</td>
      <td data-order-role>${showPeople ? o.people.join('; ') : o.roles.join(', ')}</td><td>${fmtDate(o.openDate)}</td><td>${o.status}</td><td>${money(o.purchasePrice)}</td></tr>`) : html`<tr><td colspan="6" class="muted">No orders yet.</td></tr>`}</tbody></table>
    <p class="muted small">File links open only for orders you can already see in the portal.</p></div>`;
}
export function downloadText(name, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' }); const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
export function downloadCsv(name, cols, rows) {
  const blob = new Blob([toCsv(cols, rows)], { type: 'text/csv;charset=utf-8' }); const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
export const archiveBtn = (me, entity, id, archived) => (me.canEdit ? html`<button class="ghost" data-archive="${entity}:${id}:${archived ? '0' : '1'}">${archived ? 'Restore from archive' : 'Archive'}</button>` : '');
export function wireArchive(root, api, refresh) {
  $$('[data-archive]', root).forEach((b) => b.addEventListener('click', guard(async () => { const [e, id, on] = b.dataset.archive.split(':');
    if (on === '1' && !confirm('Archive this record? It is hidden from lists but never deleted; you can restore it.')) return;
    await api.archiveCrmRecord(e, id, on === '1'); toast(on === '1' ? 'Archived' : 'Restored'); refresh(); })));
}
