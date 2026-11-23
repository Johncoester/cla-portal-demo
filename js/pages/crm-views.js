/* crm-views.js : CRM CUSTOM VIEWS + SAVED FILTERS screens (Janine, Nov 4 video "Custom View / Filters": Zoho's pinned view tabs above a list,
 * "New Custom View" = criteria + columns + sharing, and "Save filter" chips with counts). Routes: #/crm/views/<id> (a view), #/crm/views/new/<module>,
 * #/crm/views/<id>/edit. The adapter decides which rows a person may see; a view only narrows them. Function first, minimal styling. */
import { html, raw, toText, $, $$, guard, toast, modal, closeModal } from '../ui.js?v=202611161500';
import { VIEW_MODULE_LABEL, VIEW_VISIBILITY, VIEW_NAME_KEY, placeNameColumn, criteriaUserList, viewModuleFields } from '../data/crm-views.js?v=202611301000';
import { startingViewColumns } from '../data/crm-all-columns.js?v=202611301000';
import { columnOrderItem, wireColumnDrag } from './crm-columns.js?v=202611249870';
import { criteriaEditor } from './crm-criteria.js?v=202611301000';
import { tabs, head, pageSizeControl, pageNav } from './crm-kit.js?v=202611289980';
import { savedFiltersHtml, wireSavedFilters } from './crm-saved-filters.js?v=202611161500';
import { pageOf, selectionState, selectPage, loadPageSize, savePageSize } from '../data/crm-bulk.js?v=202611160300';
import { matchBannerState } from '../data/crm-match.js?v=202611160400';
import { bulkBar, wireBulk } from './crm-bulk.js?v=202611247100';

// The All list's mass update accepts at most one page of ids. A view can be longer, so Select all matching sends the view's rows in pages of this size.
const VIEW_ID_PAGE = 100;
const BULK_MODULE = { leads: 'lead', contacts: 'contact', accounts: 'account', deals: 'deal' };
const LIST_FN = { leads: 'listCrmLeads', contacts: 'listCrmContacts', accounts: 'listCrmAccounts', deals: 'listCrmDeals' };
// Same people who see checkboxes on that module's All list. Deals follow the Deals list. The other three lists always show them.
const viewCanBulk = (me, module) => {
  if (!me) return false;
  if (module === 'deals') return !!(me.canEdit || me.isAdmin || me.role === 'Processor' || me.role === 'Preprocessor');
  return true;
};
// Owner and name stay off the chooser. They are how the All list's mass actions know who owns the row.
async function recordMeta(api, module) {
  const fn = api && api[LIST_FN[module]];
  if (typeof fn !== 'function') return new Map();
  try {
    const rows = module === 'deals' ? await fn.call(api, { status: 'All' }) : await fn.call(api);
    const map = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      if (!row || row.id == null || row.id === '') return;
      map.set(row.id, { name: row.name || '', ownerId: row.ownerId || row.crmOwnerId || '' });
    });
    return map;
  } catch (e) { return new Map(); }
}
// crm_match_ids understands the All list's filters, not a view's criteria. The view already applied those criteria.
// Select all matching sends the resulting ids through the same mass-update and mass-email calls the All list uses.
function viewBulkApi(api, readMatch) {
  const isView = (filter) => !!(filter && filter.viewId);
  const idsOf = () => {
    const match = readMatch() || {};
    return [...new Set((match.ids || []).filter(Boolean))];
  };
  return new Proxy(api, {
    get(target, prop) {
      if (prop === 'crmMassUpdate') return async (input = {}) => {
        if (!isView(input.filter) || input.ids) return target.crmMassUpdate.call(target, input);
        const ids = idsOf();
        let updated = 0; let failed = 0; let skipped = 0;
        for (let i = 0; i < ids.length; i += VIEW_ID_PAGE) {
          const part = await target.crmMassUpdate.call(target, { module: input.module, ids: ids.slice(i, i + VIEW_ID_PAGE), field: input.field, value: input.value, filter: {} });
          updated += Number(part && part.updated) || 0;
          failed += Number(part && part.failed) || 0;
          skipped += Number(part && part.skipped) || 0;
        }
        return { count: updated, updated, failed, skipped };
      };
      if (prop === 'crmMassEmail') return async (input = {}) => {
        if (!isView(input.filter) || input.ids) return target.crmMassEmail.call(target, input);
        return target.crmMassEmail.call(target, { ...input, ids: idsOf(), filter: {} });
      };
      if (prop === 'crmMatchPlan') return async (input = {}) => {
        if (!isView(input.filter)) return target.crmMatchPlan.call(target, input);
        const ids = idsOf();
        return { count: ids.length, records: ids.length, recipients: ids.length, skipped: 0 };
      };
      const value = target[prop];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

const allLabel = (m) => `All ${VIEW_MODULE_LABEL[m]}`;
// the row of view tabs above a list: All <module> | pinned views | Views (every view you may use) | + New Custom View
export async function viewsBar(api, module, curId = '') {
  const list = await api.listCrmViews(module); const pinned = list.filter((v) => v.pinned).sort((a, b) => a.pinPosition - b.pinPosition);
  const group = (title, rows) => (rows.length ? html`<li class="muted small"><strong>${title}</strong></li>${rows.map((v) => html`<li><a href="#/crm/views/${v.id}" data-view-pick="${v.id}">${v.name}</a>${v.pinned ? html` <span class="muted small">(pinned)</span>` : ''}</li>`)}` : '');
  const pinMenu = (v) => html`<details class="view-pin-menu" data-pin-menu="${v.id}"><summary class="ghost" aria-label="Actions for ${v.name}">&#9662;</summary><div role="menu">
      ${v.canEdit ? html`<a href="#/crm/views/${v.id}/edit" data-pin-edit="${v.id}">Edit</a>` : ''}<button type="button" data-pin-unpin="${v.id}">Unpin</button><button type="button" data-pin-clone="${v.id}">Clone</button>
      <a href="#/crm/${module}" data-pin-close>Close</a>${v.canEdit ? html`<button type="button" data-pin-delete="${v.id}">Delete</button>` : ''}</div></details>`;
  return html`<div class="crm-views-bar" data-views-bar="${module}" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0">
    <a class="${curId ? 'ghost' : 'm-btn'}" href="#/crm/${module}" data-view-tab="all">${allLabel(module)}</a>
    ${pinned.map((v) => html`<span class="view-pin" data-pin-wrap="${v.id}"><a class="${v.id === curId ? 'm-btn' : 'ghost'}" href="#/crm/views/${v.id}" data-view-tab="${v.id}">${v.name}</a>${pinMenu(v)}</span>`)}
    <details class="more-menu" data-views-menu style="display:inline-block"><summary class="ghost" data-views-menu-btn>Views &#9662; <span class="muted small">(${list.length})</span></summary>
      <div data-views-list style="max-height:320px;overflow:auto;min-width:240px"><input type="search" placeholder="Search views" data-views-q aria-label="Search views" style="width:100%">
        <ul style="list-style:none;padding-left:0">${group('Created by me', list.filter((v) => v.mine))}${group('Shared with me', list.filter((v) => !v.mine))}${list.length ? '' : html`<li class="muted small">No custom views yet.</li>`}</ul>
        <p><a href="#/crm/views/new/${module}" data-new-view="${module}">+ New Custom View</a></p></div></details></div>`;
}
const reopen = (hash) => { const cur = (location.hash || '#/').split('?')[0]; location.hash = cur === hash ? hash + '?r=' + Date.now() : hash; };
export function wireViewsBar(root, api) {
  const q = $('[data-views-q]', root); if (q) q.addEventListener('input', () => { const t = q.value.toLowerCase(); $$('[data-view-pick]', root).forEach((a) => { a.closest('li').hidden = t && !a.textContent.toLowerCase().includes(t); }); });
  const all = $('[data-view-tab="all"]', root);
  if (all) all.addEventListener('click', (e) => {
    const here = (location.hash || '').split('?')[0];
    if (here !== all.getAttribute('href')) return;
    e.preventDefault();
    const reset = $('[data-crm-reset]', root); if (reset) reset.click();
    const deal = $('#deal-filters', root); if (deal && !reset) { deal.q.value = ''; $$('[data-crm-date]', deal).forEach((el) => { el.value = ''; }); const st = deal.querySelector('[name=status]'); if (st) st.value = 'Open'; $$('[data-deal-filter]', deal).forEach((el) => { if (el.name !== 'status') el.value = ''; }); location.hash = '#/crm/deals'; }
  });
  if (!api) return;
  $$('[data-pin-unpin]', root).forEach((b) => b.addEventListener('click', guard(async () => { await api.pinCrmView(b.dataset.pinUnpin, false); toast('Unpinned. The view is still saved.'); reopen((location.hash || '#/').split('?')[0]); })));
  $$('[data-pin-clone]', root).forEach((b) => b.addEventListener('click', guard(async () => { const n = prompt('Name of the copy'); if (!n) return; const cl = await api.cloneCrmView(b.dataset.pinClone, { name: n }); toast('View cloned'); location.hash = `#/crm/views/${cl.id}`; })));
  $$('[data-pin-delete]', root).forEach((b) => b.addEventListener('click', guard(async () => {
    const name = (b.closest('[data-pin-wrap]') && b.closest('[data-pin-wrap]').querySelector('[data-view-tab]') || {}).textContent || 'this view';
    if (!confirm(`Delete the view "${name.trim()}"? This removes the view definition only. Contacts, companies, deals, and tasks stay.`)) return;
    await api.retireCrmView(b.dataset.pinDelete); toast('View deleted'); const bar = $('[data-views-bar]', root); reopen(bar ? `#/crm/${bar.dataset.viewsBar}` : '#/crm');
  })));
}
// ---------- the view page ----------
export async function viewPage(c) {
  const { api, me, params } = c;
  if (params.id === 'new') return editorPage(c, null, params.sub);
  if (params.sub === 'edit') { const r = await api.runCrmView(params.id); return editorPage(c, r.view, r.view.module); }
  const r = await api.runCrmView(params.id); const v = r.view; const m = v.module;
  const bar = await viewsBar(api, m, v.id);
  const bulkModule = BULK_MODULE[m];
  const canBulk = !!bulkModule && viewCanBulk(me, m);
  const metaMap = canBulk ? await recordMeta(api, m) : new Map();
  let dealOwners = c.owners || [];
  if (canBulk && m === 'deals' && typeof api.listCrmDealFilters === 'function') {
    try { const fl = await api.listCrmDealFilters(); if (fl && Array.isArray(fl.owners)) dealOwners = fl.owners; } catch (e) { /* Change salesperson still opens; the list may be empty */ }
  }
  const arrows = html`<span class="sort-arrows" aria-hidden="true"><span class="up">&#9650;</span><span class="dn">&#9660;</span></span>`;
  let storage = null; try { storage = typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { storage = null; }
  const openedSize = loadPageSize(storage, me && me.id, 'view:' + v.id);
  const body = html`${head(`${VIEW_MODULE_LABEL[m]}: ${v.name}`, me, html`<span data-view-actions>${v.canEdit ? html`<a class="ghost" href="#/crm/views/${v.id}/edit" data-view-edit>Edit view</a> ` : ''}<button class="ghost" type="button" data-view-clone>Clone</button>
      <button class="ghost" type="button" data-view-pin>${v.pinned ? 'Unpin' : 'Pin to the top'}</button>${v.canEdit ? html` <button class="ghost" type="button" data-view-retire>Remove view</button>` : ''}</span>`)}${tabs(m)}${bar}
    <p class="muted small" data-view-meta>${v.visibility === 'me' ? 'Only you see this view.' : v.visibility === 'all' ? 'Shared with everyone with the CRM.' : 'Shared with selected users.'} Made by ${v.ownerName}. ${v.criteria.length ? `${v.criteria.length} condition(s), match ${v.logic === 'or' ? 'any' : 'all'}.` : 'No conditions (every record you can see).'}</p>
    <form class="filter-bar" data-view-filter onsubmit="return false"><label>Search in this view<input name="q" type="search" data-view-q placeholder="Any column"></label></form>
    ${savedFiltersHtml('view:' + v.id)}
    ${canBulk ? bulkBar(bulkModule) : ''}${canBulk ? html`<p class="notice" data-match-banner hidden></p>` : ''}
    <div class="table-tools"><span class="muted" data-count></span> <span data-bulk-pager></span> ${pageSizeControl(openedSize)}</div>
    <div class="table-wrap"><table class="tbl" data-view-table="${v.id}"><thead></thead><tbody></tbody></table></div>`;
  function mount(root) {
    wireViewsBar(root, api); const f = $('[data-view-filter]', root); const q = $('[name=q]', f); const table = $(`[data-view-table="${v.id}"]`, root); const tb = $('tbody', table); const thead = $('thead', table);
    let sort = null; let dir = 'asc'; let selected = new Set(); let page = 1; let sig = ''; let pageRows = []; let allMatching = false; let pageSize = openedSize;
    const matchState = { all: false, filter: {}, ids: [], count: 0 };
    const words = (q0) => String(q0 || '').toLowerCase().split(/\s+/).filter(Boolean);
    const rowMatch = (row, q0) => { const hay = Object.values(row.cells).map((z) => z.text).join(' ').toLowerCase(); return words(q0).every((w) => hay.includes(w)); };
    const withOwner = (row) => { const meta = metaMap.get(row.id) || {}; const named = row.cells && row.cells.name; return { ...row, name: meta.name || (named && named.text) || 'record', ownerId: meta.ownerId || '' }; };
    const paintBar = () => { const barEl = $('[data-bulk-bar]', root); if (!barEl) return; const n = allMatching ? matchState.count : selected.size; barEl.hidden = n === 0; const label = $('[data-bulk-count]', barEl); if (label) label.textContent = allMatching ? `${n} matching records selected` : `${n} selected`; };
    const headRow = () => { if (thead) thead.innerHTML = toText(html`<tr>${canBulk ? html`<th data-bulk-check><input type="checkbox" data-bulk-page aria-label="Select all on this page"></th>` : ''}${r.columns.map((col) => html`<th data-col="${col.key}" data-sort="${col.key}"><button type="button" class="th-sort">${col.label} ${arrows}</button></th>`)}</tr>`);
      $$('th[data-sort] button', root).forEach((b) => b.addEventListener('click', () => { const k = b.closest('th').dataset.sort; dir = k === sort ? (dir === 'asc' ? 'desc' : 'asc') : 'asc'; sort = k; apply(); })); };
    const apply = () => { const nextSig = JSON.stringify({ q: q.value, sort, dir }); if (nextSig !== sig) { if (sig) { selected = new Set(); allMatching = false; page = 1; } sig = nextSig; }
      let list = r.rows.filter((row) => rowMatch(row, q.value)).map(withOwner);
      if (sort) { const num = ['number', 'currency', 'percent'].includes((r.columns.find((z) => z.key === sort) || {}).type); const val = (row) => { const t = (row.cells[sort] && row.cells[sort].text) || ''; return num ? Number(String(t).replace(/[^\d.-]/g, '')) || 0 : String(t).toLowerCase(); };
        list = list.slice().sort((a, b) => { const A = val(a), B = val(b); const c0 = num ? A - B : String(A).localeCompare(String(B)); return dir === 'desc' ? -c0 : c0; }); }
      const view = pageOf(list, page, pageSize); page = view.page; pageRows = view.rows;
      matchState.all = allMatching; matchState.count = list.length; matchState.ids = list.map((row) => row.id);
      matchState.filter = { viewId: v.id, module: m, logic: v.logic || 'and', criteria: (v.criteria || []).map((item) => ({ field: item.field, op: item.op, value: item.value, ...(item.value2 ? { value2: item.value2 } : {}) })), q: String(q.value || '').trim() };
      const span = r.columns.length + (canBulk ? 1 : 0);
      headRow();
      tb.innerHTML = toText(view.rows.length ? view.rows.map((row) => html`<tr data-row="${row.id}">${canBulk ? html`<td data-bulk-check><input type="checkbox" data-bulk-row value="${row.id}" aria-label="Select ${row.name || 'record'}" ${selected.has(row.id) ? raw('checked') : ''}></td>` : ''}${r.columns.map((col) => { const cell = row.cells[col.key] || { text: '' }; return html`<td data-col="${col.key}">${cell.link ? html`<a href="${cell.link}">${cell.text}</a>` : cell.text}</td>`; })}</tr>`) : html`<tr><td colspan="${span}" class="muted">Nothing matches.</td></tr>`);
      $('[data-count]', root).textContent = view.pages > 1 ? `${view.rows.length} on this page, ${list.length} of ${r.total} match` : `${list.length} of ${r.total} shown`;
      const box = $('[data-bulk-page]', root); if (box) { const st = selectionState(selected, view.rows); box.checked = st.allOnPage; box.indeterminate = st.someOnPage; }
      const pg = $('[data-bulk-pager]', root); if (pg) pg.innerHTML = toText(pageNav(view));
      const sizeSel = $('[data-page-size]', root);
      if (sizeSel && String(sizeSel.value) !== String(pageSize)) { try { sizeSel.value = String(pageSize); } catch (e) { /* the menu already shows this size */ } }
      const banner = $('[data-match-banner]', root);
      if (banner) { const st = selectionState(selected, view.rows); const state = matchBannerState({ allOnPage: st.allOnPage, pageCount: view.rows.length, matchCount: list.length, allMatching });
        banner.hidden = !state; banner.innerHTML = toText(state ? (state.mode === 'all' ? html`All ${state.matchCount} matching records are selected. <button type="button" data-clear-matching>Clear selection</button>` : html`All ${state.pageCount} on this page are selected. <button type="button" data-select-all-matching>Select all ${state.matchCount} matching records</button>`) : html``); }
      paintBar();
      $$('th[data-sort]', root).forEach((th) => { const on = th.dataset.sort === sort; if (on) th.setAttribute('aria-sort', dir === 'asc' ? 'ascending' : 'descending'); else th.removeAttribute('aria-sort'); const up = $('.up', th); const dn = $('.dn', th); if (up) up.classList.toggle('on', on && dir === 'asc'); if (dn) dn.classList.toggle('on', on && dir === 'desc'); }); };
    q.addEventListener('input', apply);
    wireSavedFilters(root, api, 'view:' + v.id, { getValues: () => ({ q: q.value }), setValues: (o) => { q.value = o.q || ''; apply(); }, count: (o) => r.rows.filter((row) => rowMatch(row, o.q)).length });
    $('[data-view-clone]', root).addEventListener('click', guard(async () => { const n = prompt('Name of the copy', `Copy of ${v.name}`); if (!n) return; const cl = await api.cloneCrmView(v.id, { name: n }); toast('View cloned'); location.hash = `#/crm/views/${cl.id}`; }));
    $('[data-view-pin]', root).addEventListener('click', guard(async () => { await api.pinCrmView(v.id, !v.pinned); toast(v.pinned ? 'Unpinned' : 'Pinned'); c.refresh(); }));
    const rt = $('[data-view-retire]', root); if (rt) rt.addEventListener('click', guard(async () => { if (!confirm(`Remove the view "${v.name}"? It is hidden for everyone it was shared with (kept in the history, not deleted).`)) return; await api.retireCrmView(v.id); toast('View removed'); location.hash = `#/crm/${m}`; }));
    const sizeSel = $('[data-page-size]', root);
    if (sizeSel) sizeSel.addEventListener('change', () => { pageSize = savePageSize(storage, me && me.id, 'view:' + v.id, sizeSel.value); page = 1; selected = new Set(); allMatching = false; apply(); });
    apply();
    if (canBulk) {
      table.addEventListener('change', (e) => {
        const el = e.target; if (!el.matches) return;
        if (el.matches('[data-bulk-page]')) { if (!el.checked) allMatching = false; selected = selectPage(selected, pageRows, el.checked); apply(); return; }
        if (!el.matches('[data-bulk-row]')) return; if (el.checked) selected.add(el.value); else selected.delete(el.value); apply();
      });
      wireBulk(root, { module: bulkModule, api: viewBulkApi(api, () => matchState), me, owners: m === 'deals' ? dealOwners : (c.owners || []), getPageRows: () => pageRows.filter((row) => selected.has(row.id)), getMatch: () => matchState, clear: () => { selected = new Set(); allMatching = false; apply(); }, refresh: c.refresh });
    }
    root.addEventListener('click', (e) => { const t = e.target; if (!(t && t.matches)) return;
      if (t.matches('[data-select-all-matching]')) { allMatching = true; apply(); return; }
      if (t.matches('[data-clear-matching]')) { allMatching = false; selected = new Set(); apply(); return; }
      if (!(t.matches('[data-bulk-prev]') || t.matches('[data-bulk-next]'))) return; if (t.matches('[data-bulk-prev]')) page -= 1; else page += 1; selected = new Set(); allMatching = false; apply(); });
  }
  return { title: v.name, crumbs: [['CRM', '#/crm'], [VIEW_MODULE_LABEL[m], `#/crm/${m}`], [v.name]], body, mount };
}

// ---------- create / edit a view (Zoho "New Custom View": name, criteria, columns, share with) ----------
async function editorPage(c, v0, module) {
  const { api, me, cfg } = c; if (!VIEW_MODULE_LABEL[module]) throw new Error('Pick Clients, Leads, Companies or Deals.');
  const fields = viewModuleFields(module, cfg); const targets = await api.listCrmShareTargets(); const users = criteriaUserList(targets.users).map((u) => ({ id: u.id, name: u.role ? `${u.name} (${u.role})` : u.name })); const nk = VIEW_NAME_KEY[module];
  const s = v0 ? JSON.parse(JSON.stringify(v0)) : { name: '', criteria: [], logic: 'and', columns: [], sortField: nk, sortDir: 'asc', visibility: 'me', shareUsers: [], pinned: true };
  s.columns = v0 ? placeNameColumn(module, s.columns) : await startingViewColumns({ api, userId: me && me.id, module, cfg, fields });
  const lab = (k) => (fields.find((f) => f.key === k) || { label: k }).label;
  const ce = criteriaEditor('view', fields, s.criteria, { logic: s.logic || 'and', cfg, users });
  const body = html`${head(v0 ? `Edit view: ${v0.name}` : `New Custom View: ${VIEW_MODULE_LABEL[module]}`, me)}${tabs(module)}
    <form data-view-form class="form-grid" onsubmit="return false">
      <label class="span2">View Name *<input name="name" maxlength="60" required value="${s.name}" data-view-name></label>
      <fieldset class="span2" data-view-criteria><legend>Specify Criteria</legend>${ce.body}</fieldset>
      <fieldset class="span2" data-view-columns><legend>Choose Columns</legend><div style="display:flex;gap:16px;flex-wrap:wrap">
        <div><strong>Available</strong><p><input type="search" data-vcol-q placeholder="Search fields"></p><select data-vcol-avail multiple size="10" style="min-width:220px"></select><p><button type="button" class="ghost small" data-vcol-add>Add &rarr;</button></p></div>
        <div><strong>Selected</strong> <span class="muted small">(${lab(nk)} stays selected. Drag a column to change the order.)</span><div class="col-chooser" data-view-col-order style="display:block;margin:6px 0 0"><ol data-col-order data-vcol-list></ol></div></div></div></fieldset>
      <label>Sort by<select name="sortField" data-view-sort>${fields.map((f) => html`<option value="${f.key}" ${f.key === s.sortField ? raw('selected') : ''}>${f.label}</option>`)}</select></label>
      <label>Order<select name="sortDir"><option value="asc" ${s.sortDir !== 'desc' ? raw('selected') : ''}>Ascending</option><option value="desc" ${s.sortDir === 'desc' ? raw('selected') : ''}>Descending</option></select></label>
      <fieldset class="span2" data-view-share><legend>Share this with</legend>${VIEW_VISIBILITY.map(([k, l]) => html`<label><input type="radio" name="visibility" value="${k}" ${k === s.visibility ? raw('checked') : ''} ${k !== 'me' && !me.canEdit ? raw('disabled') : ''}> ${l}</label> `)}
        <div data-view-users ${s.visibility === 'custom' ? '' : raw('hidden')}><label>Users<select name="shareUsers" multiple size="6">${targets.users.filter((u) => u.id !== me.id).map((u) => html`<option value="${u.id}" ${s.shareUsers.includes(u.id) ? raw('selected') : ''}>${u.name} (${u.role})</option>`)}</select></label></div></fieldset>
      ${v0 ? '' : html`<label class="check span2"><input type="checkbox" name="pin" checked> Pin it above the ${VIEW_MODULE_LABEL[module]} list</label>`}
      <div class="span2"><a class="ghost" href="${v0 ? `#/crm/views/${v0.id}` : `#/crm/${module}`}">Cancel</a> <button class="m-btn" type="button" data-view-save>Save</button></div></form>`;
  function mount(root) {
    const f = $('[data-view-form]', root); const crit = ce.mount(root); const av = $('[data-vcol-avail]', root); const ol = $('[data-vcol-list]', root);
    const draw = () => { s.columns = placeNameColumn(module, s.columns);
      av.innerHTML = toText(fields.filter((z) => !s.columns.includes(z.key)).map((z) => html`<option value="${z.key}">${z.label}</option>`));
      ol.innerHTML = toText(s.columns.map((k) => {
        const remove = k === nk ? '' : html` <button type="button" class="linkish" data-vcol-x="${k}" aria-label="Remove ${lab(k)}">&times;</button>`;
        return columnOrderItem(k, lab(k), remove);
      })); };
    $('[data-vcol-q]', root).addEventListener('input', (e) => { const q = e.target.value.toLowerCase(); $$('option', av).forEach((o) => { o.hidden = q && !o.textContent.toLowerCase().includes(q); }); });
    $('[data-vcol-add]', root).addEventListener('click', () => { const add = [...av.selectedOptions].map((o) => o.value); if (!add.length) return; s.columns = [...s.columns, ...add]; draw(); });
    ol.addEventListener('click', (e) => {
      const el = e.target.closest ? e.target : e.target.parentElement;
      const btn = el && el.closest ? el.closest('[data-vcol-x]') : null;
      if (!btn || !ol.contains(btn) || btn.dataset.vcolX === nk) return;
      s.columns = s.columns.filter((k) => k !== btn.dataset.vcolX);
      draw();
    });
    wireColumnDrag(ol, { getOrder: () => s.columns.slice(), setOrder: (next) => { s.columns = placeNameColumn(module, next); draw(); } });
    $$('[name=visibility]', f).forEach((r) => r.addEventListener('change', () => { const on = f.querySelector('[name=visibility]:checked'); $('[data-view-users]', f).hidden = !on || on.value !== 'custom'; }));
    $('[data-view-save]', root).addEventListener('click', guard(async () => { const cr = crit.get();
      const field = (name) => $(`[name="${name}"]`, f);
      const share = field('shareUsers');
      const chosen = share ? [...share.selectedOptions || []].map((o) => o.value) : [];
      const picked = field('visibility');
      const vis = (f.querySelector && f.querySelector('[name=visibility]:checked') || picked || { value: 'me' }).value;
      const input = { module, name: field('name').value, criteria: cr.criteria, logic: cr.logic, columns: s.columns, sortField: field('sortField').value, sortDir: field('sortDir').value, visibility: vis, shareUsers: chosen };
      const pin = field('pin');
      const out = v0 ? await api.updateCrmView(v0.id, input) : await api.createCrmView({ ...input, pin: pin ? pin.checked : true });
      toast(v0 ? 'View saved' : 'View created'); location.hash = `#/crm/views/${out.id}`; }));
    draw();
  }
  return { title: v0 ? 'Edit view' : 'New Custom View', crumbs: [['CRM', '#/crm'], [VIEW_MODULE_LABEL[module], `#/crm/${module}`], [v0 ? 'Edit view' : 'New Custom View']], body, mount };
}
