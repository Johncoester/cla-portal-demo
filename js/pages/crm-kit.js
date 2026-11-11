// crm-kit.js : shared CRM screen pieces (John, Nov 2): section tabs, list views (search / filters / sort), selects, activities panel, CSV download.
// Function first, minimal styling. Every rule is enforced by the adapter (and RLS in migration 22), not by these screens.
import { html, raw, toText, $, $$, guard, formData, toast, fmtDate, fmtMoney, pill } from '../ui.js?v=202611070139';
import { CONTACT_TYPES, contactTypeLabel } from '../data/constants.js?v=202611101015';
import { crmFilter, crmSort, toCsv } from '../data/crm.js?v=202611070139';
import { modOn, modBeta, BETA_LABEL } from '../data/modules.js?v=202611101015';   // module switches: Deals hidden when not Live (beta badge for Admins)
import { columnChooserHtml, columnState, wireColumnChooser } from './crm-columns.js?v=202611130300';
import { beginColumnPrefs, schedulePageSizeSave } from '../data/crm-columns.js?v=202611130300';
import { savedFiltersHtml, wireSavedFilters } from './crm-saved-filters.js?v=202611070139';
import { pageOf, selectionState, selectPage, loadPageSize, normalizePageSize, PAGE_SIZE_OPTIONS } from '../data/crm-bulk.js?v=202611130300';
import { filterFromValues, matchBannerState } from '../data/crm-match.js?v=202611130400';
import { bulkBar, wireBulk } from './crm-bulk.js?v=202611130400';

// A click on the row (not on a link, button, or checkbox) opens the record. The name link still navigates on its own.
export function wireRowOpen(tb, hrefFor) {
  if (!tb || !tb.addEventListener) return;
  tb.addEventListener('click', (e) => {
    const t = e.target; const el = t && typeof t.closest === 'function' ? t : (t && t.parentElement);
    if (!el || typeof el.closest !== 'function') return;
    if (el.closest('a, button, input, select, textarea, label, summary')) return;
    const tr = el.closest('tr[data-row]'); if (!tr || !tr.dataset || !tr.dataset.row) return;
    const href = hrefFor(tr.dataset.row); if (href) location.hash = href;
  });
}

// Nov 2 (Zoho): Home is the CRM landing page; Contacts are shown as Clients and Accounts as Companies (routes keep their internal names); My follow-ups -> Home tasks
export const SECTIONS = [['home', 'Home'], ['leads', 'Leads'], ['contacts', 'Clients'], ['accounts', 'Companies'], ['deals', 'Deals'], ['pipeline', 'Pipeline'], ['dashboards', 'Dashboards'], ['reports', 'Reports'], ['templates', 'Templates']];   // Nov 3 (b): Deals (the portal's orders), Dashboards (video 9);   // Nov 3: Templates (email templates, every CRM user; Processor read-only)
// Settings tab: Admin / Super admin only (crm.js calls setCrmAdmin on every CRM page load; the adapter refuses everyone else anyway)
let ADMIN = false; export const setCrmAdmin = (v) => { ADMIN = !!v; };
const TAB_MODULE = { deals: 'crm-deals' };
// Janine, Nov 5: the "+" Create New menu sits in the global header, beside Search CRM. The tab row no longer repeats it.
let ME = null; export const setCrmMe = (me) => { ME = me || null; };
export const tabs = (cur) => html`<div class="crm-tabs-row" data-crm-user="${(ME && ME.id) || ''}"><ul class="nav-tabs" data-crm-tabs>${[...SECTIONS, ...(ADMIN ? [['settings', 'Settings']] : [])].filter(([k]) => !TAB_MODULE[k] || modOn(TAB_MODULE[k])).map(([k, l]) => html`<li><a class="${k === cur ? 'active' : ''}" href="#/crm/${k}" data-crm-tab="${k}">${l}${TAB_MODULE[k] && modBeta(TAB_MODULE[k]) ? html` <span class="beta-badge" data-beta-badge="${TAB_MODULE[k]}" title="${BETA_LABEL}">Beta</span>` : ''}</a></li>`)}</ul></div>`;
export const head = (title, me, extra = '') => html`<div class="box-title crm-page-head"><h2><span class="h-ico"></span>${title}</h2><div class="crm-head-actions">${extra}</div></div>
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
const datePair = (from, to, label) => html`<label>${label} from<input type="date" name="${from}" data-crm-date></label><label>${label} to<input type="date" name="${to}" data-crm-date></label>`;
export function listView({ key, rows, cols, catalog = null, userId = '', filters = [], sorts = [], fields, dflt = {}, sortDefault = 'name:asc', csv = '', exporter = null, bar = '', saved = null, dates = false, bulk = null }) {
  const all = catalog && catalog.length ? catalog : cols;
  const known = all.map(([k]) => k);
  const defaults = cols.map(([k]) => k).filter((k) => known.includes(k));
  let visible = columnState(null, userId, key, known, defaults);
  const active = () => visible.map((k) => all.find((c) => c[0] === k)).filter(Boolean);
  const fieldMeta = all.map(([k, l]) => ({ key: k, label: l }));
  const headRow = () => html`<tr>${bulk ? html`<th><input type="checkbox" data-bulk-page aria-label="Select all on this page"></th>` : ''}${active().map(([, l]) => html`<th>${l}</th>`)}</tr>`;
  const body = html`${bar}<form class="filter-bar" id="crm-f-${key}" onsubmit="return false">
      <label>Search<input name="q" type="search" placeholder="Name, email, company, county, tag" data-crm-search></label>
      ${filters.map(([name, label, opts, blank]) => html`<label>${label}${sel(name, opts, dflt[name] || '', blank)}</label>`)}
      ${dates ? html`${datePair('createdFrom', 'createdTo', 'Created Time')}${datePair('modifiedFrom', 'modifiedTo', 'Modified Time')}${datePair('activityFrom', 'activityTo', 'Last Activity Time')}` : ''}
      <label>Sort<select name="sort">${sorts.flatMap(([k, l]) => [html`<option value="${k}:asc" ${sortDefault === k + ':asc' ? raw('selected') : ''}>${l} &uarr;</option>`, html`<option value="${k}:desc" ${sortDefault === k + ':desc' ? raw('selected') : ''}>${l} &darr;</option>`])}</select></label>
      <button type="button" class="ghost" data-crm-reset>Reset</button>
    </form>${saved ? savedFiltersHtml(saved.listKey) : ''}
    ${bulk ? bulkBar(bulk.module) : ''}${bulk ? html`<p class="notice" data-match-banner hidden></p>` : ''}
    <div class="table-tools"><span class="muted" data-count></span> <span data-bulk-pager></span> ${pageSizeControl(loadPageSize(typeof localStorage !== 'undefined' ? localStorage : null, userId, key))}${columnChooserHtml(key, fieldMeta, visible)}${csv ? html` <button class="ghost" type="button" data-list-csv="${key}">Export CSV</button>` : exporter ? html` <span class="muted small" data-csv-admin-only>CSV download: Admins only</span>` : ''}</div>
    <table class="tbl" id="crm-t-${key}"><thead>${headRow()}</thead><tbody></tbody></table>`;
  function mount(root) {
    const f = $(`#crm-f-${key}`, root); const tb = $(`#crm-t-${key} tbody`, root); const thead = $(`#crm-t-${key} thead`, root); let shown = rows;
    let storage = null; try { storage = typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { storage = null; }
    let selected = new Set(); let page = 1; let sig = ''; let pageSize = loadPageSize(storage, userId, key); let allMatching = false; let matchFilter = {};
    const paintBar = () => { const barEl = $('[data-bulk-bar]', root); if (!barEl) return; const n = allMatching ? shown.length : selected.size; barEl.hidden = n === 0; const label = $('[data-bulk-count]', barEl); if (label) label.textContent = allMatching ? `${n} matching records selected` : `${n} selected`; };
    const apply = () => { const v = formData(f); const nextSig = JSON.stringify(v); if (nextSig !== sig) { if (sig) { selected = new Set(); allMatching = false; page = 1; } sig = nextSig; } matchFilter = filterFromValues(v);
      const [k, dir] = (v.sort || sortDefault).split(':'); const list = crmSort(crmFilter(rows, v, fields), k, dir); shown = list;
      const view = pageOf(list, page, pageSize); page = view.page;
      const use = active(); const span = use.length + (bulk ? 1 : 0);
      if (thead) thead.innerHTML = toText(headRow());
      tb.innerHTML = toText(view.rows.length ? view.rows.map((r) => html`<tr data-row="${r.id}">${bulk ? html`<td><input type="checkbox" data-bulk-row value="${r.id}" aria-label="Select ${r.name || 'record'}" ${selected.has(r.id) ? raw('checked') : ''}></td>` : ''}${use.map(([c, , fn]) => html`<td data-col="${c}">${fn ? fn(r) : r[c] ?? ''}</td>`)}</tr>`) : html`<tr><td colspan="${span}" class="muted">Nothing matches.</td></tr>`);
      $('[data-count]', root).textContent = view.pages > 1 ? `${view.rows.length} on this page, ${list.length} of ${rows.length} match` : `${list.length} of ${rows.length} shown`;
      const box = $('[data-bulk-page]', root); if (box) { const st = selectionState(selected, view.rows); box.checked = st.allOnPage; box.indeterminate = st.someOnPage; }
      const pg = $('[data-bulk-pager]', root); if (pg) pg.innerHTML = toText(pageNav(view));
      const sizeSel = $('[data-page-size]', root); if (sizeSel && String(sizeSel.value) !== String(pageSize)) sizeSel.value = String(pageSize);
      const banner = $('[data-match-banner]', root);
      if (banner) { const st = selectionState(selected, view.rows); const state = matchBannerState({ allOnPage: st.allOnPage, pageCount: view.rows.length, matchCount: list.length, allMatching });
        banner.hidden = !state; banner.innerHTML = toText(state ? (state.mode === 'all' ? html`All ${state.matchCount} matching records are selected. <button type="button" data-clear-matching>Clear selection</button>` : html`All ${state.pageCount} on this page are selected. <button type="button" data-select-all-matching>Select all ${state.matchCount} matching records</button>`) : html``); }
      paintBar(); };
    f.addEventListener('input', apply); f.addEventListener('change', apply);
    const prefsApi = saved && saved.api;
    const wiredCols = wireColumnChooser(root, { module: key, userId, fields: fieldMeta, visible, defaults, known, api: prefsApi, onChange: (next) => { visible = next; apply(); } });
    if (prefsApi && typeof prefsApi.getUserUiPrefs === 'function') {
      const opened = beginColumnPrefs({ api: prefsApi, userId, module: key, known, defaults, local: visible });
      opened.ready.then((order) => {
        if (!order || order.join('\n') === visible.join('\n')) return;
        visible = order;
        if (wiredCols && wiredCols.setOrder) wiredCols.setOrder(order);
        apply();
      }).catch(() => {});
      if (opened.pageSizeReady) opened.pageSizeReady.then((n) => { if (!n || n === pageSize) return; pageSize = n; apply(); }).catch(() => {});
    }
    const sizeSel = $('[data-page-size]', root);
    if (sizeSel) sizeSel.addEventListener('change', () => { pageSize = schedulePageSizeSave({ api: prefsApi, storage, userId, module: key, pageSize: sizeSel.value }); page = 1; apply(); });
    wireRowOpen(tb, (id) => `#/crm/${key}/${id}`);
    const resetBtn = $('[data-crm-reset]', f); if (resetBtn) resetBtn.addEventListener('click', () => {
      [...f.elements].forEach((el) => { if (!el.name) return; el.value = el.name === 'sort' ? sortDefault : (dflt[el.name] || ''); });
      apply();
    });
    apply();
    if (bulk) {
      $(`#crm-t-${key}`, root).addEventListener('change', (e) => {
        const el = e.target; if (!el.matches) return;
        if (el.matches('[data-bulk-page]')) { if (!el.checked) allMatching = false; selected = selectPage(selected, pageOf(shown, page, pageSize).rows, el.checked); apply(); return; }
        if (!el.matches('[data-bulk-row]')) return; if (el.checked) selected.add(el.value); else selected.delete(el.value);
        const box = $('[data-bulk-page]', root); const st = selectionState(selected, pageOf(shown, page, pageSize).rows); if (box) { box.checked = st.allOnPage; box.indeterminate = st.someOnPage; } paintBar();
      });
      wireBulk(root, { ...bulk, getPageRows: () => pageOf(shown, page, pageSize).rows.filter((r) => selected.has(r.id)), getMatch: () => ({ all: allMatching, filter: matchFilter, count: shown.length }), clear: () => { selected = new Set(); allMatching = false; apply(); } });
    }
    root.addEventListener('click', (e) => { const t = e.target; if (!(t && t.matches)) return;
      if (t.matches('[data-select-all-matching]')) { allMatching = true; apply(); return; }
      if (t.matches('[data-clear-matching]')) { allMatching = false; selected = new Set(); apply(); return; }
      if (!(t.matches('[data-bulk-prev]') || t.matches('[data-bulk-next]'))) return; if (t.matches('[data-bulk-prev]')) page -= 1; else page += 1; selected = new Set(); allMatching = false; apply(); });
    if (saved) wireSavedFilters(root, saved.api, saved.listKey, { getValues: () => { const v = formData(f); delete v.sort; return v; },
      setValues: (o) => { [...f.elements].forEach((el) => { if (!el.name || el.name === 'sort') return; el.value = o[el.name] != null ? o[el.name] : ''; }); apply(); },
      count: (o) => crmFilter(rows, o, fields).length });
    const cb = $(`[data-list-csv="${key}"]`, root); if (cb) cb.addEventListener('click', guard(async () => {
      const text = (c, r) => { const [k, , fn, csvFn] = c; if (csvFn) return csvFn(r); const v = r[k]; if (fn && (v == null || typeof v === 'object')) return toText(fn(r)).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim(); return v; };
      const use = active();
      const out = shown.map((r) => Object.fromEntries(use.map((c) => [c[0], text(c, r)])));
      if (exporter) { const r = await exporter(use.map(([k2, l]) => [k2, l]), shown.map((row, i) => ({ id: row.id, ...out[i] }))); downloadText(r.name || csv, r.csv); }
      else downloadCsv(csv, use.map(([k2, l]) => [k2, l]), out);
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
export function pageSizeControl(size) {
  const n = normalizePageSize(size);
  return html`<label>Records per page<select data-page-size aria-label="Records per page">${PAGE_SIZE_OPTIONS.map((s) => html`<option value="${s}" ${s === n ? raw('selected') : ''}>${s}</option>`)}</select></label>`;
}
export function pageNav(view) {
  if (!view || view.pages <= 1) return html``;
  return html`<button type="button" class="ghost" data-bulk-prev ${view.page <= 1 ? raw('disabled') : ''}>Previous</button> Page ${view.page} of ${view.pages} <button type="button" class="ghost" data-bulk-next ${view.page >= view.pages ? raw('disabled') : ''}>Next</button>`;
}
export const archiveBtn = (me, entity, id, archived) => (me.canEdit ? html`<button class="ghost" data-archive="${entity}:${id}:${archived ? '0' : '1'}">${archived ? 'Restore from archive' : 'Archive'}</button>` : '');
export function wireArchive(root, api, refresh) {
  $$('[data-archive]', root).forEach((b) => b.addEventListener('click', guard(async () => { const [e, id, on] = b.dataset.archive.split(':');
    if (on === '1' && !confirm('Archive this record? It is hidden from lists but never deleted; you can restore it.')) return;
    await api.archiveCrmRecord(e, id, on === '1'); toast(on === '1' ? 'Archived' : 'Restored'); refresh(); })));
}
