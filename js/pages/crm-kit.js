// crm-kit.js : shared CRM screen pieces (John, Nov 2): section tabs, list views (search / filters / sort), selects, activities panel, CSV download.
// Function first, minimal styling. Every rule is enforced by the adapter (and RLS in migration 22), not by these screens.
import { html, raw, toText, $, $$, guard, formData, toast, fmtDate, fmtMoney, pill } from '../ui.js?v=202611022114';
import { CONTACT_TYPES, contactTypeLabel } from '../data/constants.js?v=202611022114';
import { crmFilter, crmSort, toCsv } from '../data/crm.js?v=202611022114';

// Nov 2 (Zoho): Home is the CRM landing page; Contacts are shown as Clients and Accounts as Companies (routes keep their internal names); My follow-ups -> Home tasks
export const SECTIONS = [['home', 'Home'], ['leads', 'Leads'], ['contacts', 'Clients'], ['accounts', 'Companies'], ['pipeline', 'Pipeline'], ['reports', 'Reports']];
export const tabs = (cur) => html`<ul class="nav-tabs" data-crm-tabs>${SECTIONS.map(([k, l]) => html`<li><a class="${k === cur ? 'active' : ''}" href="#/crm/${k}" data-crm-tab="${k}">${l}</a></li>`)}</ul>`;
export const head = (title, me, extra = '') => html`<div class="box-title"><h2><span class="h-ico"></span>${title}</h2>${extra}</div>
  ${me.canEdit ? '' : html`<p class="muted" data-readonly>Read-only: the Processor can see the CRM but not change it.</p>`}`;
export const sel = (name, list, cur, blank) => html`<select name="${name}">${blank != null ? html`<option value="">${blank}</option>` : ''}${list.map(([v, l]) => html`<option value="${v}" ${String(v) === String(cur ?? '') ? raw('selected') : ''}>${l}</option>`)}</select>`;
export const pairs = (list) => list.map((v) => [v, v]);
export const ctypeSel = (cur, name = 'contactType') => sel(name, CONTACT_TYPES, cur, '(not set)');
export const ownerSel = (owners, cur, blank = 'Unassigned', name = 'ownerId') => sel(name, owners.map((o) => [o.id, `${o.name} (${o.role})`]), cur, blank == null ? undefined : blank);
export const ctype = (c) => contactTypeLabel(c) || html`<span class="muted">&mdash;</span>`;
export const money = (n) => (n == null || n === '' ? '' : fmtMoney(n));
export const dis = (me) => (me.canEdit ? '' : raw('disabled'));

// LIST VIEW. cols: [key, label, (row) => cell]. filters: [name, label, [[value, label]], blankLabel]. sorts: [[key, label]].
export function listView({ key, rows, cols, filters = [], sorts = [], fields, dflt = {}, sortDefault = 'name:asc' }) {
  const body = html`<form class="filter-bar" id="crm-f-${key}" onsubmit="return false">
      <label>Search<input name="q" type="search" placeholder="Name, email, company, county, tag" data-crm-search></label>
      ${filters.map(([name, label, opts, blank]) => html`<label>${label}${sel(name, opts, dflt[name] || '', blank)}</label>`)}
      <label>Sort<select name="sort">${sorts.flatMap(([k, l]) => [html`<option value="${k}:asc" ${sortDefault === k + ':asc' ? raw('selected') : ''}>${l} &uarr;</option>`, html`<option value="${k}:desc" ${sortDefault === k + ':desc' ? raw('selected') : ''}>${l} &darr;</option>`])}</select></label>
    </form>
    <div class="table-tools"><span class="muted" data-count></span></div>
    <table class="tbl" id="crm-t-${key}"><thead><tr>${cols.map(([, l]) => html`<th>${l}</th>`)}</tr></thead><tbody></tbody></table>`;
  function mount(root) {
    const f = $(`#crm-f-${key}`, root); const tb = $(`#crm-t-${key} tbody`, root);
    const apply = () => { const v = formData(f); const [k, dir] = (v.sort || sortDefault).split(':'); const list = crmSort(crmFilter(rows, v, fields), k, dir);
      tb.innerHTML = toText(list.length ? list.map((r) => html`<tr data-row="${r.id}">${cols.map(([c, , fn]) => html`<td data-col="${c}">${fn ? fn(r) : r[c] ?? ''}</td>`)}</tr>`) : html`<tr><td colspan="${cols.length}" class="muted">Nothing matches.</td></tr>`);
      $('[data-count]', root).textContent = `${list.length} of ${rows.length} shown`; };
    f.addEventListener('input', apply); f.addEventListener('change', apply); apply();
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
