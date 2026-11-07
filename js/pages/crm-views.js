/* crm-views.js : CRM CUSTOM VIEWS + SAVED FILTERS screens (Janine, Nov 4 video "Custom View / Filters": Zoho's pinned view tabs above a list,
 * "New Custom View" = criteria + columns + sharing, and "Save filter" chips with counts). Routes: #/crm/views/<id> (a view), #/crm/views/new/<module>,
 * #/crm/views/<id>/edit. The adapter decides which rows a person may see; a view only narrows them. Function first, minimal styling. */
import { html, raw, toText, $, $$, guard, toast, modal, closeModal } from '../ui.js?v=202611070009';
import { moduleFields } from '../data/crm-analytics.js?v=202611070009';
import { VIEW_MODULE_LABEL, VIEW_VISIBILITY, VIEW_DEFAULT_COLUMNS, VIEW_NAME_KEY } from '../data/crm-views.js?v=202611070009';
import { criteriaEditor } from './crm-criteria.js?v=202611070009';
import { tabs, head } from './crm-kit.js?v=202611070009';
import { savedFiltersHtml, wireSavedFilters } from './crm-saved-filters.js?v=202611070009';

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
  const arrows = html`<span class="sort-arrows" aria-hidden="true"><span class="up">&#9650;</span><span class="dn">&#9660;</span></span>`;
  const body = html`${head(`${VIEW_MODULE_LABEL[m]}: ${v.name}`, me, html`<span data-view-actions>${v.canEdit ? html`<a class="ghost" href="#/crm/views/${v.id}/edit" data-view-edit>Edit view</a> ` : ''}<button class="ghost" type="button" data-view-clone>Clone</button>
      <button class="ghost" type="button" data-view-pin>${v.pinned ? 'Unpin' : 'Pin to the top'}</button>${v.canEdit ? html` <button class="ghost" type="button" data-view-retire>Remove view</button>` : ''}</span>`)}${tabs(m)}${bar}
    <p class="muted small" data-view-meta>${v.visibility === 'me' ? 'Only you see this view.' : v.visibility === 'all' ? 'Shared with everyone with the CRM.' : 'Shared with selected users.'} Made by ${v.ownerName}. ${v.criteria.length ? `${v.criteria.length} condition(s), match ${v.logic === 'or' ? 'any' : 'all'}.` : 'No conditions (every record you can see).'}</p>
    <form class="filter-bar" data-view-filter onsubmit="return false"><label>Search in this view<input name="q" type="search" data-view-q placeholder="Any column"></label></form>
    ${savedFiltersHtml('view:' + v.id)}
    <div class="table-tools"><span class="muted" data-count></span></div>
    <div class="table-wrap"><table class="tbl" data-view-table="${v.id}"><thead><tr>${r.columns.map((col) => html`<th data-sort="${col.key}"><button type="button" class="th-sort">${col.label} ${arrows}</button></th>`)}</tr></thead><tbody></tbody></table></div>`;
  function mount(root) {
    wireViewsBar(root, api); const f = $('[data-view-filter]', root); const tb = $(`[data-view-table="${v.id}"] tbody`, root); let sort = null; let dir = 'asc';
    const words = (q) => String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
    const match = (row, q) => { const hay = Object.values(row.cells).map((z) => z.text).join(' ').toLowerCase(); return words(q).every((w) => hay.includes(w)); };
    const apply = () => { let list = r.rows.filter((row) => match(row, f.q.value));
      if (sort) { const num = ['number', 'currency', 'percent'].includes((r.columns.find((z) => z.key === sort) || {}).type); const val = (row) => { const t = row.cells[sort].text; return num ? Number(String(t).replace(/[^\d.-]/g, '')) || 0 : String(t).toLowerCase(); };
        list = list.slice().sort((a, b) => { const A = val(a), B = val(b); const c0 = num ? A - B : String(A).localeCompare(String(B)); return dir === 'desc' ? -c0 : c0; }); }
      tb.innerHTML = toText(list.length ? list.map((row) => html`<tr data-row="${row.id}">${r.columns.map((col) => { const cell = row.cells[col.key]; return html`<td data-col="${col.key}">${cell.link ? html`<a href="${cell.link}">${cell.text}</a>` : cell.text}</td>`; })}</tr>`) : html`<tr><td colspan="${r.columns.length}" class="muted">Nothing matches.</td></tr>`);
      $('[data-count]', root).textContent = `${list.length} of ${r.total} shown`;
      $$('th[data-sort]', root).forEach((th) => { const on = th.dataset.sort === sort; $('.up', th).classList.toggle('on', on && dir === 'asc'); $('.dn', th).classList.toggle('on', on && dir === 'desc'); }); };
    f.q.addEventListener('input', apply);
    $$('th[data-sort] button', root).forEach((b) => b.addEventListener('click', () => { const k = b.closest('th').dataset.sort; dir = k === sort ? (dir === 'asc' ? 'desc' : 'asc') : 'asc'; sort = k; apply(); }));
    wireSavedFilters(root, api, 'view:' + v.id, { getValues: () => ({ q: f.q.value }), setValues: (o) => { f.q.value = o.q || ''; apply(); }, count: (o) => r.rows.filter((row) => match(row, o.q)).length });
    $('[data-view-clone]', root).addEventListener('click', guard(async () => { const n = prompt('Name of the copy', `Copy of ${v.name}`); if (!n) return; const cl = await api.cloneCrmView(v.id, { name: n }); toast('View cloned'); location.hash = `#/crm/views/${cl.id}`; }));
    $('[data-view-pin]', root).addEventListener('click', guard(async () => { await api.pinCrmView(v.id, !v.pinned); toast(v.pinned ? 'Unpinned' : 'Pinned'); c.refresh(); }));
    const rt = $('[data-view-retire]', root); if (rt) rt.addEventListener('click', guard(async () => { if (!confirm(`Remove the view "${v.name}"? It is hidden for everyone it was shared with (kept in the history, not deleted).`)) return; await api.retireCrmView(v.id); toast('View removed'); location.hash = `#/crm/${m}`; }));
    apply();
  }
  return { title: v.name, crumbs: [['CRM', '#/crm'], [VIEW_MODULE_LABEL[m], `#/crm/${m}`], [v.name]], body, mount };
}

// ---------- create / edit a view (Zoho "New Custom View": name, criteria, columns, share with) ----------
async function editorPage(c, v0, module) {
  const { api, me, cfg, owners } = c; if (!VIEW_MODULE_LABEL[module]) throw new Error('Pick Clients, Leads, Companies or Deals.');
  const fields = moduleFields(module, cfg); const targets = await api.listCrmShareTargets(); const nk = VIEW_NAME_KEY[module];
  const s = v0 ? JSON.parse(JSON.stringify(v0)) : { name: '', criteria: [], logic: 'and', columns: [...VIEW_DEFAULT_COLUMNS[module]], sortField: nk, sortDir: 'asc', visibility: 'me', shareUsers: [], pinned: true };
  const lab = (k) => (fields.find((f) => f.key === k) || { label: k }).label;
  const ce = criteriaEditor('view', fields, s.criteria, { logic: s.logic || 'and', cfg, users: owners });
  const body = html`${head(v0 ? `Edit view: ${v0.name}` : `New Custom View: ${VIEW_MODULE_LABEL[module]}`, me)}${tabs(module)}
    <form data-view-form class="form-grid" onsubmit="return false">
      <label class="span2">View Name *<input name="name" maxlength="60" required value="${s.name}" data-view-name></label>
      <fieldset class="span2" data-view-criteria><legend>Specify Criteria</legend>${ce.body}</fieldset>
      <fieldset class="span2" data-view-columns><legend>Choose Columns</legend><div style="display:flex;gap:16px;flex-wrap:wrap">
        <div><strong>Available</strong><p><input type="search" data-vcol-q placeholder="Search fields"></p><select data-vcol-avail multiple size="10" style="min-width:220px"></select><p><button type="button" class="ghost small" data-vcol-add>Add &rarr;</button></p></div>
        <div><strong>Selected</strong> <span class="muted small">(${lab(nk)} stays first; use the arrows)</span><ol data-vcol-list></ol></div></div></fieldset>
      <label>Sort by<select name="sortField" data-view-sort>${fields.map((f) => html`<option value="${f.key}" ${f.key === s.sortField ? raw('selected') : ''}>${f.label}</option>`)}</select></label>
      <label>Order<select name="sortDir"><option value="asc" ${s.sortDir !== 'desc' ? raw('selected') : ''}>Ascending</option><option value="desc" ${s.sortDir === 'desc' ? raw('selected') : ''}>Descending</option></select></label>
      <fieldset class="span2" data-view-share><legend>Share this with</legend>${VIEW_VISIBILITY.map(([k, l]) => html`<label><input type="radio" name="visibility" value="${k}" ${k === s.visibility ? raw('checked') : ''} ${k !== 'me' && !me.canEdit ? raw('disabled') : ''}> ${l}</label> `)}
        <div data-view-users ${s.visibility === 'custom' ? '' : raw('hidden')}><label>Users<select name="shareUsers" multiple size="6">${targets.users.filter((u) => u.id !== me.id).map((u) => html`<option value="${u.id}" ${s.shareUsers.includes(u.id) ? raw('selected') : ''}>${u.name} (${u.role})</option>`)}</select></label></div></fieldset>
      ${v0 ? '' : html`<label class="check span2"><input type="checkbox" name="pin" checked> Pin it above the ${VIEW_MODULE_LABEL[module]} list</label>`}
      <div class="span2"><a class="ghost" href="${v0 ? `#/crm/views/${v0.id}` : `#/crm/${module}`}">Cancel</a> <button class="m-btn" type="button" data-view-save>Save</button></div></form>`;
  function mount(root) {
    const f = $('[data-view-form]', root); const crit = ce.mount(root); const av = $('[data-vcol-avail]', root); const ol = $('[data-vcol-list]', root);
    const draw = () => { av.innerHTML = toText(fields.filter((z) => !s.columns.includes(z.key)).map((z) => html`<option value="${z.key}">${z.label}</option>`));
      ol.innerHTML = toText(s.columns.map((k, i) => html`<li data-vcol="${k}">${lab(k)}${k === nk ? '' : html` <button type="button" class="linkish" data-vcol-up="${i}" ${i <= 1 ? raw('disabled') : ''}>&uarr;</button><button type="button" class="linkish" data-vcol-down="${i}" ${i === s.columns.length - 1 ? raw('disabled') : ''}>&darr;</button> <button type="button" class="linkish" data-vcol-x="${k}" aria-label="Remove ${lab(k)}">&times;</button>`}</li>`)); };
    $('[data-vcol-q]', root).addEventListener('input', (e) => { const q = e.target.value.toLowerCase(); $$('option', av).forEach((o) => { o.hidden = q && !o.textContent.toLowerCase().includes(q); }); });
    $('[data-vcol-add]', root).addEventListener('click', () => { const add = [...av.selectedOptions].map((o) => o.value); if (!add.length) return; s.columns = [...s.columns, ...add]; draw(); });
    ol.addEventListener('click', (e) => { const t = e.target.dataset; if (t.vcolX) { s.columns = s.columns.filter((k) => k !== t.vcolX); draw(); return; }
      const i = t.vcolUp != null ? +t.vcolUp : t.vcolDown != null ? +t.vcolDown : null; if (i == null) return; const j = t.vcolUp != null ? i - 1 : i + 1; if (j < 1 || j >= s.columns.length) return; [s.columns[i], s.columns[j]] = [s.columns[j], s.columns[i]]; draw(); });
    $$('[name=visibility]', f).forEach((r) => r.addEventListener('change', () => { $('[data-view-users]', f).hidden = f.visibility.value !== 'custom'; }));
    $('[data-view-save]', root).addEventListener('click', guard(async () => { const cr = crit.get();
      const input = { module, name: f.name.value, criteria: cr.criteria, logic: cr.logic, columns: s.columns, sortField: f.sortField.value, sortDir: f.sortDir.value, visibility: f.visibility.value, shareUsers: [...f.shareUsers.selectedOptions].map((o) => o.value) };
      const out = v0 ? await api.updateCrmView(v0.id, input) : await api.createCrmView({ ...input, pin: f.pin ? f.pin.checked : true });
      toast(v0 ? 'View saved' : 'View created'); location.hash = `#/crm/views/${out.id}`; }));
    draw();
  }
  return { title: v0 ? 'Edit view' : 'New Custom View', crumbs: [['CRM', '#/crm'], [VIEW_MODULE_LABEL[module], `#/crm/${module}`], [v0 ? 'Edit view' : 'New Custom View']], body, mount };
}
