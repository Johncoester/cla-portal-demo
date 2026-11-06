/* crm-deals.js : DEALS in the CRM (Zoho's Deals module) = the portal's orders you can already see. #/crm/deals[/<id>]. Read-only here (orders are run
 * in the portal); a deal has Send Email (saved, NOT sent) and its Emails list. Function only. */
import { html, raw, toText, $, $$, fmtDate, formData, modal, closeModal, guard, toast } from '../ui.js?v=202611060013';
import { crmSort } from '../data/crm.js?v=202611060013';
import { DEAL_COLS, LOCKED_COLS, DEFAULT_HIDDEN, loadHidden, saveHidden } from '../data/crm-deal-cols.js?v=202611060013';
import { tabs, head, money } from './crm-kit.js?v=202611060013';
import { sendEmailBtn, wireSendEmail, emailsCard, wireEmails } from './crm-compose.js?v=202611060013';
import { viewsBar, wireViewsBar } from './crm-views.js?v=202611060013';
import { savedFiltersHtml, wireSavedFilters } from './crm-saved-filters.js?v=202611060013';
import { DISBURSEMENT_FIELDS } from '../data/crm-disbursement.js?v=202611060013';

export async function dealsPage(c) { return c.params.id ? dealPage(c) : dealsList(c); }

// John, Nov 3: SORT (click a column header: up / down arrows, click again to reverse), HIDE COLUMNS (Columns chooser, remembered per user in this
// browser) and FILTERS. Who sees which deals is the adapter's job (and migration 32's): an Admin / Super admin (and the Processor, read-only, and Sales Team)
// see every deal and filter by Deal Owner and Client; a Sales Person sees ONLY their own deals and filters by Source. Everyone can filter by Status
// (Open by default) and Source, search, sort and hide columns.
const arrows = html`<span class="sort-arrows" aria-hidden="true"><span class="up">&#9650;</span><span class="dn">&#9660;</span></span>`;
async function dealsList(c) {
  const { api, me } = c; const fl = await api.listCrmDealFilters(); const all = fl.scope === 'all';
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const cur = { status: q.get('status') || 'Open', ownerId: all ? q.get('owner') || '' : '', clientId: all ? q.get('client') || '' : '', source: q.get('source') || '' };
  const rows = await api.listCrmDeals(cur); const bar = await viewsBar(api, 'deals');
  const storage = typeof localStorage !== 'undefined' ? localStorage : null; let hidden = loadHidden(storage, me.id || fl.me.id);
  const cell = { actualRevenue: (r) => money(r.actualRevenue), disbursementDate: (r) => fmtDate(r.disbursementDate), name: (r) => html`<a href="${r._link}" data-open="${r.id}">${r.name}</a>`, amount: (r) => money(r.amount), loanAmount: (r) => money(r.loanAmount), closingDate: (r) => fmtDate(r.closingDate), openDate: (r) => fmtDate(r.openDate),
    clientName: (r) => (r._clientLink ? html`<a href="${r._clientLink}">${r.clientName}</a>` : r.clientName), sourceText: (r) => r.sourceText || html`<span class="muted">&mdash;</span>` };
  const sel = (name, label, list, value, blank) => html`<label>${label}<select name="${name}" data-deal-filter="${name}" aria-label="${label}">${blank ? html`<option value="">${blank}</option>` : ''}${list.map(([v, l]) => html`<option value="${v}" ${String(v) === String(value) ? raw('selected') : ''}>${l}</option>`)}</select></label>`;
  const body = html`${tabs('deals')}${head('Deals', me)}${bar}<p class="muted small">Deals are the portal's orders${all ? '' : ' you are a salesperson on'}. Run the order itself in the portal.
    ${all ? html`<span data-deal-scope="all">You see every deal owner's deals.</span>` : html`<span data-deal-scope="own">You see only your own deals.</span>`}</p>
    <form class="filter-bar" id="deal-filters" onsubmit="return false">
      <label>Search<input name="q" type="search" placeholder="Deal, file number, address, client" data-crm-search></label>
      ${sel('status', 'Status', fl.statuses.map((s) => [s, s === 'All' ? 'All (incl. closed / cancelled)' : s === 'Open' ? 'Open deals' : s]), cur.status)}
      ${all ? sel('owner', 'Deal Owner / salesperson', [...fl.owners.map((o) => [o.id, `${o.name} (${o.role})`]), ['none', '(no salesperson)']], cur.ownerId, 'All deal owners') : ''}
      ${all ? sel('client', 'Client', fl.clients.map((x) => [x.id, x.name]), cur.clientId, 'All clients') : ''}
      ${sel('source', 'Source (who sent the deal)', [...fl.sources.map((o) => [o.value, o.label]), ['none', '(not set)']], cur.source, 'All sources')}
    </form>${savedFiltersHtml('deals')}
    <div class="table-tools"><span class="muted" data-count></span> <details class="col-chooser" data-col-chooser><summary>Columns</summary>
      <div class="col-list">${DEAL_COLS.map(([k, l]) => html`<label class="check"><input type="checkbox" data-col-toggle="${k}" ${hidden.includes(k) ? '' : raw('checked')} ${LOCKED_COLS.includes(k) ? raw('disabled') : ''}> ${l}</label>`)}</div>
      <p class="muted small">Remembered for you on this browser.</p><button type="button" class="ghost" data-cols-reset>Default columns</button></details></div>
    <table class="tbl" id="crm-t-deals" data-deals-table><thead><tr>${DEAL_COLS.map(([k, l]) => html`<th data-col="${k}" data-sort="${k}"><button type="button" class="th-sort" title="Sort by ${l}">${l} ${arrows}</button></th>`)}</tr></thead><tbody></tbody></table>`;
  function mount(root) {
    const f = $('#deal-filters', root); const tb = $('[data-deals-table] tbody', root); let sort = 'closingDate'; let dir = 'desc';
    // a changed Status / Owner / Client / Source asks the adapter again (it applies the access rule); the URL keeps them so Back / refresh keep the view
    $$('[data-deal-filter]', f).forEach((s) => s.addEventListener('change', () => { const p = new URLSearchParams(); const v = formData(f);
      if (v.status && v.status !== 'Open') p.set('status', v.status); ['owner', 'client', 'source'].forEach((k) => { if (v[k]) p.set(k, v[k]); });
      const qs = p.toString(); location.hash = '#/crm/deals' + (qs ? '?' + qs : ''); }));
    const showCols = () => { $$('[data-col]', root).forEach((el) => { el.hidden = hidden.includes(el.dataset.col); }); };
    const apply = () => { const words = String(f.q.value || '').toLowerCase().split(/\s+/).filter(Boolean);
      const list = crmSort(rows.filter((r) => { const hay = [r.name, r.fileNumber, r.propertyAddress, r.clientName, r.contactName, r.ownerName, r.salesReps, r.sourceText].join(' ').toLowerCase(); return words.every((w) => hay.includes(w)); }), sort, dir);
      tb.innerHTML = toText(list.length ? list.map((r) => html`<tr data-row="${r.id}">${DEAL_COLS.map(([k]) => html`<td data-col="${k}">${cell[k] ? cell[k](r) : r[k] ?? ''}</td>`)}</tr>`) : html`<tr><td colspan="${DEAL_COLS.length}" class="muted">Nothing matches.</td></tr>`);
      $('[data-count]', root).textContent = `${list.length} of ${rows.length} shown`; showCols();
      $$('th[data-sort]', root).forEach((th) => { const on = th.dataset.sort === sort; if (on) th.setAttribute('aria-sort', dir === 'asc' ? 'ascending' : 'descending'); else th.removeAttribute('aria-sort');
        $('.up', th).classList.toggle('on', on && dir === 'asc'); $('.dn', th).classList.toggle('on', on && dir === 'desc'); }); };
    f.q.addEventListener('input', apply); wireViewsBar(root);
    if (q.get('q')) f.q.value = q.get('q');
    // Janine, Nov 4: saved filters = the search box + the drop-downs; the drop-downs ask the adapter again (URL), the search stays on the screen
    wireSavedFilters(root, api, 'deals', { getValues: () => { const v = formData(f); if (v.status === 'Open') delete v.status; return v; },
      setValues: (o) => { const p = new URLSearchParams(); if (o.status && o.status !== 'Open') p.set('status', o.status); ['owner', 'client', 'source'].forEach((k) => { if (o[k]) p.set(k, o[k]); }); if (o.q) p.set('q', o.q);
        const next = '#/crm/deals' + (p.toString() ? '?' + p.toString() : ''); if (location.hash === next) { f.q.value = o.q || ''; apply(); } else location.hash = next; },
      count: (o) => { const same = (o.status || 'Open') === cur.status && (o.owner || '') === cur.ownerId && (o.client || '') === cur.clientId && (o.source || '') === cur.source;
        if (!same) return '·'; const words = String(o.q || '').toLowerCase().split(/\s+/).filter(Boolean); return rows.filter((r) => { const hay = [r.name, r.fileNumber, r.propertyAddress, r.clientName, r.contactName, r.ownerName, r.salesReps, r.sourceText].join(' ').toLowerCase(); return words.every((w) => hay.includes(w)); }).length; } });
    $$('th[data-sort] button', root).forEach((b) => b.addEventListener('click', () => { const k = b.closest('th').dataset.sort; dir = k === sort ? (dir === 'asc' ? 'desc' : 'asc') : 'asc'; sort = k; apply(); }));
    $$('[data-col-toggle]', root).forEach((cb) => cb.addEventListener('change', () => { const k = cb.dataset.colToggle; hidden = saveHidden(storage, me.id || fl.me.id, cb.checked ? hidden.filter((z) => z !== k) : [...hidden, k]); showCols(); }));
    $('[data-cols-reset]', root).addEventListener('click', () => { hidden = saveHidden(storage, me.id || fl.me.id, DEFAULT_HIDDEN); $$('[data-col-toggle]', root).forEach((cb) => { cb.checked = !hidden.includes(cb.dataset.colToggle); }); showCols(); });
    apply();
  }
  return { title: 'Deals', crumbs: [['CRM', '#/crm'], ['Deals']], body, mount };
}

async function dealPage(c) {
  const { api, me, params, refresh } = c; const d = await api.getCrmDeal(params.id); const disb = await api.getCrmDealDisbursement(d.id); api.noteCrmRecent('deal', d.id).catch(() => {});
  const row = (l, v) => html`<tr><th>${l}</th><td>${v}</td></tr>`;
  const body = html`${tabs('deals')}${head(d.name, me, html`<span data-record-actions>${sendEmailBtn('deal', d.id, me)} <a class="ghost" href="${d._portalLink}" data-open-order>Open the order</a></span>`)}
    <div class="card" data-deal-summary><table class="tbl">${row('Deal Name', d.name)}${row('File Number', d.fileNumber)}${row('Property Address', d.propertyAddress)}${row('Amount', money(d.amount))}${row('Loan Amount', money(d.loanAmount))}
      ${row('Stage', d.stage)}${row('Closing Date', fmtDate(d.closingDate))}${row('Open Date', fmtDate(d.openDate))}${row('Deal Owner', d.ownerName)}${row('Sales Reps', d.salesReps)}${row('Transaction Type', d.transactionType)}</table></div>
    <div class="card" data-deal-people><h3>People on the file</h3><table class="tbl"><thead><tr><th>Role</th><th>Name</th><th>Email</th></tr></thead><tbody>${d.people.map((p) => html`<tr><td>${p.role}</td><td>${p.link ? html`<a href="${p.link}">${p.name}</a>` : p.name}</td><td>${p.email}</td></tr>`)}</tbody></table></div>
    ${disbCard(disb)}
    ${emailsCard(d.emails)}`;
  return { title: d.name, crumbs: [['CRM', '#/crm'], ['Deals', '#/crm/deals'], [d.fileNumber]], body, mount(root) { wireSendEmail(root, api, me, refresh); wireEmails(root, api, d.emails); wireDisb(root, api, d.id, disb, refresh); void $; } };
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
