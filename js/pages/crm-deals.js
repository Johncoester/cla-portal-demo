/* crm-deals.js : DEALS in the CRM (Zoho's Deals module) = the portal's orders you can already see. #/crm/deals[/<id>]. Read-only here (orders are run
 * in the portal); a deal has Send Email (saved, NOT sent) and its Emails list. Function only. */
import { html, raw, toText, $, $$, fmtDate, formData, modal, closeModal, guard, toast } from '../ui.js?v=202611070139';
import { crmSort, inLocalRange } from '../data/crm.js?v=202611070139';
import { DEAL_COLS, DEFAULT_HIDDEN, loadHidden } from '../data/crm-deal-cols.js?v=202611070139';
import { display, moduleFields } from '../data/crm-analytics.js?v=202611070139';
import { crmDealName, columnKey, loadColumns, normalizeColumns, beginColumnPrefs, schedulePageSizeSave } from '../data/crm-columns.js?v=202611131100';
import { columnChooserHtml, wireColumnChooser } from './crm-columns.js?v=202611131100';
import { tabs, head, money, wireRowOpen, pageSizeControl, pageNav } from './crm-kit.js?v=202611131200';
import { sendEmailBtn, wireSendEmail, emailsCard, wireEmails } from './crm-compose.js?v=202611090905';
import { viewsBar, wireViewsBar } from './crm-views.js?v=202611131200';
import { savedFiltersHtml, wireSavedFilters } from './crm-saved-filters.js?v=202611070139';
import { DISBURSEMENT_FIELDS } from '../data/crm-disbursement.js?v=202611070139';
import { pageOf, selectionState, selectPage, loadPageSize } from '../data/crm-bulk.js?v=202611131100';
import { filterFromValues, matchBannerState } from '../data/crm-match.js?v=202611131200';
import { bulkBar, wireBulk } from './crm-bulk.js?v=202611131200';

export async function dealsPage(c) { return c.params.id ? dealPage(c) : dealsList(c); }

// John, Nov 3: SORT (click a column header: up / down arrows, click again to reverse), HIDE COLUMNS (Columns chooser, remembered for this login;
// this browser paints first) and FILTERS. Who sees which deals is the adapter's job (and migration 32's): an Admin / Super admin (and the Processor, read-only, and Sales Team)
// see every deal and filter by Deal Owner and Client; a Sales Person sees ONLY their own deals and filters by Source. Everyone can filter by Status
// (Open by default) and Source, search, sort and hide columns.
const arrows = html`<span class="sort-arrows" aria-hidden="true"><span class="up">&#9650;</span><span class="dn">&#9660;</span></span>`;
function dealColumnState(storage, userId, known) {
  try { if (storage && storage.getItem(columnKey(userId, 'deals'))) return loadColumns(storage, userId, 'deals', { known, defaults: known }); } catch (e) { /* use the older hide-list */ }
  const hidden = new Set(loadHidden(storage, userId));
  const legacy = DEAL_COLS.map(([k]) => k).filter((k) => known.includes(k) && !hidden.has(k));
  return normalizeColumns(legacy.length ? legacy : known.filter((k) => !DEFAULT_HIDDEN.includes(k)), known, known);
}
async function dealsList(c) {
  const { api, me, cfg = {} } = c; const fl = await api.listCrmDealFilters(); const all = fl.scope === 'all';
  const canBulk = me.canEdit || me.isAdmin || ['Processor', 'Preprocessor'].includes(me.role);
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const cur = { status: q.get('status') || 'Open', ownerId: all ? q.get('owner') || '' : '', clientId: all ? q.get('client') || '' : '', source: q.get('source') || '' };
  const rows = await api.listCrmDeals(cur); const bar = await viewsBar(api, 'deals');
  const storage = typeof localStorage !== 'undefined' ? localStorage : null;
  const cell = { actualRevenue: (r) => money(r.actualRevenue), disbursementDate: (r) => fmtDate(r.disbursementDate), name: (r) => html`<a href="${r._link}" data-open="${r.id}">${crmDealName(r)}</a>`, amount: (r) => money(r.amount), loanAmount: (r) => money(r.loanAmount), closingDate: (r) => fmtDate(r.closingDate), openDate: (r) => fmtDate(r.openDate),
    clientName: (r) => (r._clientLink ? html`<a href="${r._clientLink}">${r.clientName}</a>` : r.clientName), sourceText: (r) => r.sourceText || html`<span class="muted">&mdash;</span>`, propertyAddress: (r) => crmDealName(r) };
  const dealFields = moduleFields('deals', cfg);
  const have = new Set(DEAL_COLS.map(([k]) => k));
  const extra = dealFields.filter((f) => !have.has(f.key) && !(f.labelKey && have.has(f.labelKey))).map((f) => [f.key, f.label]);
  const catalog = [...DEAL_COLS, ...extra];
  const known = catalog.map(([k]) => k);
  let visible = dealColumnState(storage, me.id || fl.me.id, known);
  const useCols = () => visible.map((k) => catalog.find((c) => c[0] === k)).filter(Boolean);
  const sel = (name, label, list, value, blank) => html`<label>${label}<select name="${name}" data-deal-filter="${name}" aria-label="${label}">${blank ? html`<option value="">${blank}</option>` : ''}${list.map(([v, l]) => html`<option value="${v}" ${String(v) === String(value) ? raw('selected') : ''}>${l}</option>`)}</select></label>`;
  const body = html`${tabs('deals')}${head('Deals', me)}${bar}<p class="muted small">Deals are the portal's orders${all ? '' : ' you are a salesperson on'}. Run the order itself in the portal.
    ${all ? html`<span data-deal-scope="all">You see every deal owner's deals.</span>` : html`<span data-deal-scope="own">You see only your own deals.</span>`}</p>
    <form class="filter-bar" id="deal-filters" onsubmit="return false">
      <label>Search<input name="q" type="search" placeholder="Deal, file number, address, client" data-crm-search></label>
      ${sel('status', 'Status', fl.statuses.map((s) => [s, s === 'All' ? 'All (incl. closed / cancelled)' : s === 'Open' ? 'Open deals' : s]), cur.status)}
      ${all ? sel('owner', 'Deal Owner / salesperson', [...fl.owners.map((o) => [o.id, `${o.name} (${o.role})`]), ['none', '(no salesperson)']], cur.ownerId, 'All deal owners') : ''}
      ${all ? sel('client', 'Client', fl.clients.map((x) => [x.id, x.name]), cur.clientId, 'All clients') : ''}
      ${sel('source', 'Source (who sent the deal)', [...fl.sources.map((o) => [o.value, o.label]), ['none', '(not set)']], cur.source, 'All sources')}
      <label>Created Time from<input type="date" name="createdFrom" data-crm-date></label><label>Created Time to<input type="date" name="createdTo" data-crm-date></label>
      <label>Modified Time from<input type="date" name="modifiedFrom" data-crm-date></label><label>Modified Time to<input type="date" name="modifiedTo" data-crm-date></label>
      <label>Last Activity Time from<input type="date" name="activityFrom" data-crm-date></label><label>Last Activity Time to<input type="date" name="activityTo" data-crm-date></label>
      <label>Open Date from<input type="date" name="openFrom" data-crm-date></label><label>Open Date to<input type="date" name="openTo" data-crm-date></label>
      <label>Closing Date from<input type="date" name="closingFrom" data-crm-date></label><label>Closing Date to<input type="date" name="closingTo" data-crm-date></label>
      <button type="button" class="ghost" data-crm-reset>Reset</button>
    </form>${savedFiltersHtml('deals')}
    ${canBulk ? bulkBar('deal') : ''}${canBulk ? html`<p class="notice" data-match-banner hidden></p>` : ''}
    <div class="table-tools"><span class="muted" data-count></span> <span data-bulk-pager></span> ${pageSizeControl(loadPageSize(storage, me.id || '', 'deals'))} ${columnChooserHtml('deals', catalog.map(([k, l]) => ({ key: k, label: l })), visible)}</div>
    <table class="tbl" id="crm-t-deals" data-deals-table><thead></thead><tbody></tbody></table>`;
  function mount(root) {
    const f = $('#deal-filters', root); const tb = $('[data-deals-table] tbody', root); let sort = 'closingDate'; let dir = 'desc';
    let selected = new Set(); let page = 1; let sig = ''; let viewRows = []; let allMatching = false; let matchFilter = {}; let matchCount = 0;
    let pageSize = loadPageSize(storage, me.id || '', 'deals');
    // a changed Status / Owner / Client / Source asks the adapter again (it applies the access rule); the URL keeps them so Back / refresh keep the view
    $$('[data-deal-filter]', f).forEach((s) => s.addEventListener('change', () => { const p = new URLSearchParams(); const v = formData(f);
      if (v.status && v.status !== 'Open') p.set('status', v.status); ['owner', 'client', 'source'].forEach((k) => { if (v[k]) p.set(k, v[k]); });
      const qs = p.toString(); location.hash = '#/crm/deals' + (qs ? '?' + qs : ''); }));
    const head = () => { const cols = useCols(); $('[data-deals-table] thead', root).innerHTML = toText(html`<tr>${canBulk ? html`<th><input type="checkbox" data-bulk-page aria-label="Select all on this page"></th>` : ''}${cols.map(([k, l]) => html`<th data-col="${k}" data-sort="${k}"><button type="button" class="th-sort" title="Sort by ${l}">${l} ${arrows}</button></th>`)}</tr>`);
      $$('th[data-sort] button', root).forEach((b) => b.addEventListener('click', () => { const k = b.closest('th').dataset.sort; dir = k === sort ? (dir === 'asc' ? 'desc' : 'asc') : 'asc'; sort = k; apply(); })); };
    const apply = () => { const words = String(f.q.value || '').toLowerCase().split(/\s+/).filter(Boolean); const v = formData(f);
      const nextSig = JSON.stringify({ ...v, sort, dir }); if (nextSig !== sig) { if (sig) { selected = new Set(); allMatching = false; page = 1; } sig = nextSig; }
      matchFilter = filterFromValues({ ...v, ownerId: v.owner || '', clientId: v.client || '', source: v.source || '', status: v.status || '' }); matchCount = 0;
      const list = crmSort(rows.filter((r) => { const hay = [r.name, r.fileNumber, r.propertyAddress, r.clientName, r.contactName, r.ownerName, r.salesReps, r.sourceText].join(' ').toLowerCase();
        return words.every((w) => hay.includes(w)) && inLocalRange(r.createdAt, v.createdFrom, v.createdTo) && inLocalRange(r.modifiedAt, v.modifiedFrom, v.modifiedTo) && inLocalRange(r.lastActivityAt, v.activityFrom, v.activityTo) && inLocalRange(r.openDate, v.openFrom, v.openTo) && inLocalRange(r.closingDate, v.closingFrom, v.closingTo); }), sort, dir);
      const view = pageOf(list, page, pageSize); page = view.page; viewRows = view.rows; matchCount = list.length;
      const cols = useCols(); const span = cols.length + (canBulk ? 1 : 0);
      head();
      tb.innerHTML = toText(view.rows.length ? view.rows.map((r) => html`<tr data-row="${r.id}">${canBulk ? html`<td><input type="checkbox" data-bulk-row value="${r.id}" aria-label="Select ${crmDealName(r) || 'deal'}" ${selected.has(r.id) ? raw('checked') : ''}></td>` : ''}${cols.map(([k]) => { const f = dealFields.find((z) => z.key === k); const shown = cell[k] ? cell[k](r) : f ? (display(f, r, cfg) || '') : (r[k] ?? ''); return html`<td data-col="${k}">${shown}</td>`; })}</tr>`) : html`<tr><td colspan="${span}" class="muted">Nothing matches.</td></tr>`);
      $('[data-count]', root).textContent = view.pages > 1 ? `${view.rows.length} on this page, ${list.length} of ${rows.length} match` : `${list.length} of ${rows.length} shown`;
      const box = $('[data-bulk-page]', root); if (box) { const st = selectionState(selected, view.rows); box.checked = st.allOnPage; box.indeterminate = st.someOnPage; }
      const pg = $('[data-bulk-pager]', root); if (pg) pg.innerHTML = toText(pageNav(view));
      const sizeSel = $('[data-page-size]', root); if (sizeSel && String(sizeSel.value) !== String(pageSize)) sizeSel.value = String(pageSize);
      const barEl = $('[data-bulk-bar]', root); if (barEl) { const n = allMatching ? list.length : selected.size; barEl.hidden = n === 0; const label = $('[data-bulk-count]', barEl); if (label) label.textContent = allMatching ? `${n} matching records selected` : `${n} selected`; }
      const banner = $('[data-match-banner]', root); if (banner) { const st = selectionState(selected, view.rows); const state = matchBannerState({ allOnPage: st.allOnPage, pageCount: view.rows.length, matchCount: list.length, allMatching }); banner.hidden = !state; banner.innerHTML = toText(state ? (state.mode === 'all' ? html`All ${state.matchCount} matching records are selected. <button type="button" data-clear-matching>Clear selection</button>` : html`All ${state.pageCount} on this page are selected. <button type="button" data-select-all-matching>Select all ${state.matchCount} matching records</button>`) : html``); }
      $$('th[data-sort]', root).forEach((th) => { const on = th.dataset.sort === sort; if (on) th.setAttribute('aria-sort', dir === 'asc' ? 'ascending' : 'descending'); else th.removeAttribute('aria-sort');
        $('.up', th).classList.toggle('on', on && dir === 'asc'); $('.dn', th).classList.toggle('on', on && dir === 'desc'); }); };
    f.q.addEventListener('input', apply); $$('[data-crm-date]', f).forEach((el) => el.addEventListener('change', apply));
    wireRowOpen(tb, (id) => `#/crm/deals/${id}`);
    const reset = $('[data-crm-reset]', f); if (reset) reset.addEventListener('click', () => {
      const bare = (location.hash || '').split('?')[0] === '#/crm/deals' && !(location.hash || '').includes('?');
      if (!bare) { location.hash = '#/crm/deals'; return; }
      f.q.value = ''; $$('[data-crm-date]', f).forEach((el) => { el.value = ''; });
      const st = f.querySelector('[name=status]'); if (st) st.value = 'Open';
      $$('[data-deal-filter]', f).forEach((el) => { if (el.name !== 'status') el.value = ''; });
      apply();
    });
    wireViewsBar(root, api);
    if (q.get('q')) f.q.value = q.get('q');
    // Janine, Nov 4: saved filters = the search box + the drop-downs; the drop-downs ask the adapter again (URL), the search stays on the screen
    wireSavedFilters(root, api, 'deals', { getValues: () => { const v = formData(f); if (v.status === 'Open') delete v.status; return v; },
      setValues: (o) => { const p = new URLSearchParams(); if (o.status && o.status !== 'Open') p.set('status', o.status); ['owner', 'client', 'source'].forEach((k) => { if (o[k]) p.set(k, o[k]); }); if (o.q) p.set('q', o.q);
        const next = '#/crm/deals' + (p.toString() ? '?' + p.toString() : ''); if (location.hash === next) { f.q.value = o.q || ''; apply(); } else location.hash = next; },
      count: (o) => { const same = (o.status || 'Open') === cur.status && (o.owner || '') === cur.ownerId && (o.client || '') === cur.clientId && (o.source || '') === cur.source;
        if (!same) return '·'; const words = String(o.q || '').toLowerCase().split(/\s+/).filter(Boolean); return rows.filter((r) => { const hay = [r.name, r.fileNumber, r.propertyAddress, r.clientName, r.contactName, r.ownerName, r.salesReps, r.sourceText].join(' ').toLowerCase(); return words.every((w) => hay.includes(w)); }).length; } });
    const defaults = normalizeColumns(DEAL_COLS.map(([k]) => k).filter((k) => !DEFAULT_HIDDEN.includes(k)), known, known);
    const dealUser = me.id || fl.me.id;
    const wiredCols = wireColumnChooser(root, { module: 'deals', userId: dealUser, fields: catalog.map(([k, l]) => ({ key: k, label: l })), visible, defaults, known, storage, api, onChange: (next) => { visible = next; apply(); } });
    if (api && typeof api.getUserUiPrefs === 'function') {
      const opened = beginColumnPrefs({ api, storage, userId: dealUser, module: 'deals', known, defaults, local: visible });
      opened.ready.then((order) => {
        if (!order || order.join('\n') === visible.join('\n')) return;
        visible = order;
        if (wiredCols && wiredCols.setOrder) wiredCols.setOrder(order);
        apply();
      }).catch(() => {});
      if (opened.pageSizeReady) opened.pageSizeReady.then((n) => { if (!n || n === pageSize) return; pageSize = n; apply(); }).catch(() => {});
    }
    const sizeSel = $('[data-page-size]', root);
    if (sizeSel) sizeSel.addEventListener('change', () => { pageSize = schedulePageSizeSave({ api, storage, userId: dealUser, module: 'deals', pageSize: sizeSel.value }); page = 1; apply(); });
    apply();
    if (canBulk) {
      $('[data-deals-table]', root).addEventListener('change', (e) => {
        const el = e.target; if (!el.matches) return;
        if (el.matches('[data-bulk-page]')) { if (!el.checked) allMatching = false; selected = selectPage(selected, viewRows, el.checked); apply(); return; }
        if (!el.matches('[data-bulk-row]')) return; if (el.checked) selected.add(el.value); else selected.delete(el.value); apply();
      });
      wireBulk(root, { module: 'deal', api, me, owners: fl.owners || [], getPageRows: () => viewRows.filter((r) => selected.has(r.id)), getMatch: () => ({ all: allMatching, filter: matchFilter, count: matchCount }), clear: () => { selected = new Set(); allMatching = false; apply(); }, refresh: c.refresh });
    }
    root.addEventListener('click', (e) => { const t = e.target; if (!(t && t.matches)) return;
      if (t.matches('[data-select-all-matching]')) { allMatching = true; apply(); return; }
      if (t.matches('[data-clear-matching]')) { allMatching = false; selected = new Set(); apply(); return; }
      if (!(t.matches('[data-bulk-prev]') || t.matches('[data-bulk-next]'))) return; if (t.matches('[data-bulk-prev]')) page -= 1; else page += 1; selected = new Set(); allMatching = false; apply(); });
  }
  return { title: 'Deals', crumbs: [['CRM', '#/crm'], ['Deals']], body, mount };
}

function disbView(x) {
  const raw = x && typeof x === 'object' ? x : {}; const src = raw.values && typeof raw.values === 'object' ? raw.values : raw; const out = {};
  DISBURSEMENT_FIELDS.forEach(([k]) => { out[k] = src[k] == null || src[k] === '' ? null : src[k]; });
  return { ...out, canEdit: !!raw.canEdit, updatedAt: raw.updatedAt || null, updatedByName: raw.updatedByName || '', history: Array.isArray(raw.history) ? raw.history : [] };
}
async function loadDisb(api, id) {
  if (!api || typeof api.getCrmDealDisbursement !== 'function') return disbView(null);
  try { return disbView(await api.getCrmDealDisbursement(id)); } catch { return disbView(null); }
}
async function dealPage(c) {
  const { api, me, params, refresh } = c; const d = await api.getCrmDeal(params.id); const disb = await loadDisb(api, d.id);
  if (typeof api.noteCrmRecent === 'function') { try { const p = api.noteCrmRecent('deal', d.id); if (p && typeof p.catch === 'function') p.catch(() => {}); } catch { /* recent items are optional */ } }
  const people = Array.isArray(d.people) ? d.people : []; const emails = Array.isArray(d.emails) ? d.emails : []; const portal = d._portalLink || `#/deals/${d.id}`;
  const row = (l, v) => html`<tr><th>${l}</th><td>${v}</td></tr>`;
  const dealName = crmDealName(d);
  const body = html`${tabs('deals')}${head(dealName, me, html`<span data-record-actions>${sendEmailBtn('deal', d.id, me)} <a class="ghost" href="${portal}" data-open-order>Open the order</a></span>`)}
    <div class="card" data-deal-summary><table class="tbl">${row('Deal Name', dealName)}${row('File Number', d.fileNumber)}${row('Property Address', d.propertyAddress || dealName)}${row('Amount', money(d.amount))}${row('Loan Amount', money(d.loanAmount))}
      ${row('Stage', d.stage)}${row('Closing Date', fmtDate(d.closingDate))}${row('Open Date', fmtDate(d.openDate))}${row('Deal Owner', d.ownerName)}${row('Sales Reps', d.salesReps)}${row('Transaction Type', d.transactionType)}</table></div>
    <div class="card" data-deal-people><h3>People on the file</h3><table class="tbl"><thead><tr><th>Role</th><th>Name</th><th>Email</th></tr></thead><tbody>${people.map((p) => html`<tr><td>${p.role}</td><td>${p.link ? html`<a href="${p.link}">${p.name}</a>` : p.name}</td><td>${p.email}</td></tr>`)}</tbody></table></div>
    ${disbCard(disb)}
    ${emailsCard(emails)}`;
  return { title: dealName, crumbs: [['CRM', '#/crm'], ['Deals', '#/crm/deals'], [d.fileNumber]], body, mount(root) { wireSendEmail(root, api, me, refresh); wireEmails(root, api, emails); wireDisb(root, api, d.id, disb, refresh); void $; } };
}

// Janine, Nov 4 (video "Disbursement Details - Deals"): Zoho's Disbursement Details section. Typed amounts + a date; Admin / Super admin edit; every change logged.
const cents = (v) => '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const disbVal = (type, v) => (v == null ? html`<span class="muted">&mdash;</span>` : type === 'date' ? fmtDate(v) : cents(v));
function disbCard(x) {
  const half = Math.ceil(DISBURSEMENT_FIELDS.length / 2); const colA = DISBURSEMENT_FIELDS.slice(0, half); const colB = DISBURSEMENT_FIELDS.slice(half);
  const tbl = (list) => html`<table class="tbl">${list.map(([k, l, t]) => html`<tr><th>${l}</th><td data-disb="${k}">${disbVal(t, x[k])}</td></tr>`)}</table>`;
  return html`<div class="card" data-deal-disbursement><div class="deal-card-head"><h3>Disbursement Details</h3>${x.canEdit ? html`<button class="ghost" type="button" data-disb-edit>Edit</button>` : ''}</div>
    <div style="display:flex;gap:16px;flex-wrap:wrap"><div style="flex:1;min-width:260px">${tbl(colA)}</div><div style="flex:1;min-width:260px">${tbl(colB)}</div></div>
    <p class="muted small">${x.updatedAt ? `Last changed by ${x.updatedByName} on ${fmtDate(String(x.updatedAt).slice(0, 10))}. ` : 'Not entered yet. '}${x.canEdit ? '' : 'Admins and Super admins enter these.'}${x.history && x.history.length ? ` ${x.history.length} change(s) logged.` : ''}</p></div>`;
}
function wireDisb(root, api, dealId, x, refresh) {
  const b = $('[data-disb-edit]', root); if (!b) return;
  b.addEventListener('click', () => {
    const m = modal('Disbursement Details', html`<form data-disb-form class="form-grid">${DISBURSEMENT_FIELDS.map(([k, l, t]) => html`<label>${l}${t === 'date' ? html`<input type="date" name="${k}" value="${x[k] || ''}">` : html`<input type="number" step="0.01" min="0" name="${k}" value="${x[k] == null ? '' : x[k]}" inputmode="decimal">`}</label>`)}
      <p class="span2 muted small">Leave a field empty if it does not apply. Amounts in dollars.</p><div class="span2"><button type="button" class="ghost" data-close>Cancel</button> <button class="m-btn">Save</button></div></form>`, { wide: true });
    $('[data-disb-form]', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); const v = formData(e.target); await api.saveCrmDealDisbursement(dealId, Object.fromEntries(DISBURSEMENT_FIELDS.map(([k]) => [k, v[k] ?? '']))); closeModal(); toast('Disbursement Details saved'); refresh(); }));
  });
}
