/* crm-reports.js : CRM REPORTS (Janine, Zoho video 10). #/crm/reports (list + folders), #/crm/reports/new, #/crm/reports/<id> (run), #/crm/reports/<id>/edit,
 * #/crm/reports/summary (the older per-table summary). Builder: primary module, related modules, Columns (search / add / remove / drag), Row Groups,
 * Aggregate Columns, Filters (AND / OR), sort. Run, Save, Edit, Clone, Export (CSV: Admin / Super admin only), Send Email (saved, NOT sent).
 * Shared with everyone unless restricted to users / roles. Nothing is deleted: reports are RETIRED (hidden, restorable). Function only. */
import { html, raw, $, $$, guard, toast, modal, closeModal, toText, fmtDateTime } from '../ui.js?v=202611041817';
import { REPORT_MODULES, RELATED, moduleName, reportFields, AGG_FNS, NUMERIC, BUCKETS, isDateType } from '../data/crm-analytics.js?v=202611041817';
import { tabs, head } from './crm-kit.js?v=202611041817';
import { criteriaEditor } from './crm-criteria.js?v=202611041817';
import { composeOverlay } from './crm-compose.js?v=202611041817';
import { fmtNum } from './crm-charts.js?v=202611041817';

const opts = (list, cur) => list.map(([k, l]) => html`<option value="${k}" ${String(k) === String(cur) ? raw('selected') : ''}>${l}</option>`);
const download = (name, text) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); };

export async function reportsHome(c) {
  const { api, params } = c;
  if (params.id === 'new') return builderPage(c, null);
  if (params.id && params.sub === 'edit') return builderPage(c, await api.getCrmReport(params.id));
  if (params.id) return runPage(c);
  return listPage(c);
}

async function listPage(c) {
  const { api, me } = c; const [fl, all] = await Promise.all([api.listCrmReportFolders(), api.listCrmReports({ includeRetired: true })]);
  const key = 'cla-crm-report-folder'; let folder = sessionStorage.getItem(key) || 'all';
  const body = html`${tabs('reports')}${head('Reports', me, html`${me.canEdit ? html`<a class="m-btn" href="#/crm/reports/new" data-create-report>Create Report</a> ` : ''}<a class="ghost" href="#/crm/reports/summary" data-summary-link>Summary by table</a>`)}
    <div style="display:flex;gap:12px"><div style="min-width:220px" data-report-folders><strong>Folders</strong><ul>
      <li><a href="#" data-folder="all">All Reports</a> <span class="muted small">(${all.filter((r) => !r.retired).length})</span></li>
      ${fl.folders.map((f) => html`<li><a href="#" data-folder="${f.id}" data-folder-name="${f.name}">${f.name}</a> <span class="muted small">(${f.count})</span>${f.kind === 'personal' ? html` <span class="muted small">(your folder)</span>` : ''}</li>`)}
      ${all.some((r) => r.retired) ? html`<li><a href="#" data-folder="retired">Retired</a> <span class="muted small">(${all.filter((r) => r.retired).length})</span></li>` : ''}</ul>
      ${fl.canCreate ? html`<button class="ghost small" data-create-folder>+ Create Folder</button>` : html`<p class="muted small">Admins create shared folders.</p>`}</div>
    <div style="flex:1"><p><input type="search" data-report-q placeholder="Search reports"></p>
      <table class="tbl" data-reports-table><thead><tr><th>Report Name</th><th>Description</th><th>Folder</th><th>Last Accessed Date</th><th>Created By</th></tr></thead><tbody></tbody></table></div></div>`;
  function mount(root) {
    const tb = $('[data-reports-table] tbody', root); const q = $('[data-report-q]', root);
    const draw = () => { const s = q.value.trim().toLowerCase(); const rows = all.filter((r) => (folder === 'retired' ? r.retired : !r.retired && (folder === 'all' || r.folderId === folder)) && (!s || `${r.name} ${r.description}`.toLowerCase().includes(s)));
      $$('[data-folder]', root).forEach((a) => { a.style.fontWeight = a.dataset.folder === folder ? 'bold' : ''; });
      tb.innerHTML = toText(rows.length ? rows.map((r) => html`<tr data-report-row="${r.id}"><td><a href="#/crm/reports/${r.id}">${r.name}</a>${r.share.mode === 'custom' ? html` <span class="muted small">(restricted)</span>` : ''}</td><td>${r.description}</td><td>${r.folderName}</td><td>${r.lastAccessedAt ? fmtDateTime(r.lastAccessedAt) : ''}</td><td>${r.createdByName}</td></tr>`) : html`<tr><td colspan="5" class="muted">No reports here.</td></tr>`); };
    $$('[data-folder]', root).forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); folder = a.dataset.folder; sessionStorage.setItem(key, folder); draw(); }));
    q.addEventListener('input', draw); draw();
    const cf = $('[data-create-folder]', root); if (cf) cf.addEventListener('click', guard(async () => { const n = prompt('Folder name'); if (!n) return; await api.createCrmReportFolder(n); toast('Folder created'); c.refresh(); }));
  }
  return { title: 'Reports', crumbs: [['CRM', '#/crm'], ['Reports']], body, mount };
}

function resultsHtml(out) {
  const cols = out.columns; const agg = (list) => (list.length ? html`<div class="small" data-aggregates>${list.map((a) => html`<span data-agg="${a.fn}:${a.field}">${a.label}: <strong>${fmtNum(a.value, a.currency)}</strong></span> `)}</div>` : '');
  const cellsRow = (r) => html`<tr data-result-row="${r.id}">${r.cells.map((x) => html`<td data-col="${x.key}">${x.link ? html`<a href="${x.link}">${x.text}</a>` : x.text}</td>`)}</tr>`;
  const groups = (list, depth) => list.map((g) => html`<tr data-group-row="${depth}"><th colspan="${cols.length}" style="text-align:left;padding-left:${depth * 16}px" data-group-header>${g.header}${g.aggregates.length ? html` <span class="small">${g.aggregates.map((a) => `${a.label}: ${fmtNum(a.value, a.currency)}`).join('; ')}</span>` : ''}</th></tr>
    ${g.groups ? groups(g.groups, depth + 1) : g.rows.map(cellsRow)}`);
  return html`<p data-total-records>Total Records: <strong>${out.total}</strong>${out.filterText ? html` <span class="muted small" data-report-filter-text>Filters: ${out.filterText}</span>` : ''}</p>${agg(out.aggregates)}
    <table class="tbl" data-report-results><thead><tr>${cols.map((x) => html`<th>${x.label}</th>`)}</tr></thead><tbody>${out.groups ? groups(out.groups, 0) : out.rows.map(cellsRow)}</tbody></table>
    ${out.total ? '' : html`<p class="muted" data-no-rows>No records match.</p>`}`;
}

async function runPage(c) {
  const { api, me, params } = c; const rep = await api.getCrmReport(params.id); const out = await api.runCrmReport(rep.id);
  const body = html`${tabs('reports')}${head(rep.name, me, html`<select data-report-menu aria-label="Report actions"><option value="">Edit &#9662;</option>${rep.canEdit && !rep.retired ? html`<option value="edit">Edit</option>` : ''}${me.canEdit ? html`<option value="clone">Clone</option>` : ''}
      <option value="export" ${rep.canExport ? '' : raw('disabled')}>Export${rep.canExport ? '' : ' (Admin only)'}</option>${me.canEdit ? html`<option value="email">Send Email</option>` : ''}${rep.canEdit ? html`<option value="${rep.retired ? 'restore' : 'retire'}">${rep.retired ? 'Restore' : 'Retire (hide)'}</option>` : ''}</select> <a class="ghost" href="#/crm/reports">Back to reports</a>`)}
    <p class="muted small" data-report-meta>${rep.description} · ${rep.moduleLabel}${rep.related.length ? ` + ${rep.related.map(moduleName).join(', ')}` : ''} · folder ${rep.folderName} · created by ${rep.createdByName}${rep.share.mode === 'custom' ? ' · restricted sharing' : ' · shared with everyone with the CRM'}${rep.retired ? ' · RETIRED' : ''}</p>
    <div data-report-out>${resultsHtml(out)}</div>`;
  function mount(root) {
    const m = $('[data-report-menu]', root); m.addEventListener('change', guard(async () => { const v = m.value; m.value = '';
      if (v === 'edit') location.hash = `#/crm/reports/${rep.id}/edit`;
      if (v === 'clone') { const n = prompt('Name of the copy (saved in your folder)', `Copy of ${rep.name}`); if (n == null) return; const r = await api.cloneCrmReport(rep.id, { name: n }); toast('Report cloned'); location.hash = `#/crm/reports/${r.id}`; }
      if (v === 'export') { const r = await api.exportCrmReport(rep.id); download(r.name, r.csv); toast('CSV downloaded'); }
      if (v === 'email') await composeOverlay(api, me, 'report', rep.id, { attachReport: true, subject: rep.name, done: () => {} });
      if (v === 'retire') { if (!confirm('Retire this report? It is hidden, never deleted; you can restore it.')) return; await api.retireCrmReport(rep.id, true); toast('Report retired'); location.hash = '#/crm/reports'; }
      if (v === 'restore') { await api.retireCrmReport(rep.id, false); toast('Report restored'); c.refresh(); } }));
  }
  return { title: rep.name, crumbs: [['CRM', '#/crm'], ['Reports', '#/crm/reports'], [rep.name]], body, mount };
}

async function builderPage(c, rep) {
  const { api, me, owners, cfg } = c; if (!me.canEdit) throw new Error('The Processor has read-only access to the CRM.');
  const [fl, targets] = await Promise.all([api.listCrmReportFolders(), api.listCrmShareTargets()]);
  const st = rep ? { ...JSON.parse(JSON.stringify(rep)) } : null;
  const body = html`${tabs('reports')}${head(rep ? `Edit report: ${rep.name}` : 'Create Report', me)}<div data-report-builder></div>`;
  function mount(root) {
    const box = $('[data-report-builder]', root);
    if (!st) return pickModule(box, (s) => draw(box, s));
    draw(box, st);
  }
  function pickModule(box, next) {
    box.innerHTML = toText(html`<form data-pick-module class="form-grid"><label>Select Primary Module<select name="module">${opts(REPORT_MODULES.map((m) => [m, moduleName(m)]))}</select></label>
      <fieldset class="span2" data-related-pick><legend>Related modules (optional)</legend><div data-related-opts></div></fieldset><div class="span2"><button class="m-btn">Continue</button> <a class="ghost" href="#/crm/reports">Cancel</a></div></form>`);
    const f = $('[data-pick-module]', box); const rel = () => { $('[data-related-opts]', f).innerHTML = toText((RELATED[f.module.value] || []).length ? RELATED[f.module.value].map((m) => html`<label><input type="checkbox" name="related" value="${m}"> ${moduleName(m)}</label> `) : html`<span class="muted small">None for this module.</span>`); };
    f.module.addEventListener('change', rel); rel();
    f.addEventListener('submit', (e) => { e.preventDefault(); const s = { module: f.module.value, related: $$('[name=related]:checked', f).map((x) => x.value).slice(0, 2), columns: null, rowGroups: [], aggregates: [], filters: [], logic: 'and', sort: null, share: { mode: 'all', users: [], roles: [] } };
      details(s, () => next(s)); });
  }
  function details(s, next) {
    const m = modal('Report Details', html`<form data-report-details class="form-grid"><label class="span2">Report Name<input name="name" maxlength="120" required value="${s.name || ''}"></label>
      <label class="span2">Description<textarea name="description" maxlength="500" rows="2">${s.description || ''}</textarea></label>
      <label>Folder<select name="folderId">${fl.folders.map((f) => html`<option value="${f.id}" ${f.id === s.folderId ? raw('selected') : ''}>${f.name}${f.kind === 'personal' ? ' (your folder)' : ''}</option>`)}</select></label>
      ${fl.canCreate ? html`<p><button type="button" class="ghost small" data-details-new-folder>+ Create Folder</button></p>` : html`<span></span>`}
      <fieldset class="span2"><legend>Share with</legend><label><input type="radio" name="mode" value="all" ${s.share.mode !== 'custom' ? raw('checked') : ''}> Everyone with the CRM</label> <label><input type="radio" name="mode" value="custom" ${s.share.mode === 'custom' ? raw('checked') : ''}> Only these users / roles</label>
        <div data-share-custom ${s.share.mode === 'custom' ? '' : raw('hidden')}><label>Users<select name="users" multiple size="5">${targets.users.map((u) => html`<option value="${u.id}" ${s.share.users.includes(u.id) ? raw('selected') : ''}>${u.name} (${u.role})</option>`)}</select></label>
        <label>Roles<select name="roles" multiple size="5">${targets.roles.map((r) => html`<option value="${r}" ${s.share.roles.includes(r) ? raw('selected') : ''}>${r}</option>`)}</select></label></div></fieldset>
      <div class="span2"><button class="ghost" type="button" data-close>Cancel</button> <button class="m-btn">OK</button></div></form>`, { wide: true });
    const f = $('[data-report-details]', m); $$('[name=mode]', f).forEach((r) => r.addEventListener('change', () => { $('[data-share-custom]', f).hidden = f.mode.value !== 'custom'; }));
    if (!s.folderId) f.folderId.value = fl.folders.find((x) => x.kind === 'personal').id;
    const nf = $('[data-details-new-folder]', f); if (nf) nf.addEventListener('click', guard(async () => { const n = prompt('Folder name'); if (!n) return; const r = await api.createCrmReportFolder(n);
      fl.folders.push({ id: r.id, name: r.name, kind: 'shared', count: 0 }); const o = document.createElement('option'); o.value = r.id; o.textContent = r.name; f.folderId.appendChild(o); f.folderId.value = r.id; toast('Folder created'); }));
    f.addEventListener('submit', (e) => { e.preventDefault(); if (!f.name.value.trim()) { toast('Report Name is required.', 'err'); return; } Object.assign(s, { name: f.name.value.trim(), description: f.description.value, folderId: f.folderId.value,
      share: { mode: f.mode.value, users: [...f.users.selectedOptions].map((o) => o.value), roles: [...f.roles.selectedOptions].map((o) => o.value) } }); closeModal(); next(); });
  }
  function draw(box, s) {
    const fields = reportFields(s.module, s.related, cfg); s.columns ||= fields.slice(0, 6).map((f) => f.key); const lab = (k) => (fields.find((f) => f.key === k) || { label: k }).label;
    const nums = fields.filter((f) => NUMERIC.includes(f.type));
    box.innerHTML = toText(html`<p data-builder-head><strong>${s.name}</strong> · ${moduleName(s.module)}${s.related.length ? ` + ${s.related.map(moduleName).join(', ')}` : ''} <button type="button" class="linkish" data-edit-details>Report Details</button></p>
      <div style="display:flex;gap:16px;flex-wrap:wrap">
        <div data-columns-pane><strong>Columns</strong><p><input type="search" data-col-q placeholder="Search fields"></p><select data-col-avail multiple size="10" style="min-width:220px">${fields.filter((f) => !s.columns.includes(f.key)).map((f) => html`<option value="${f.key}">${f.label}</option>`)}</select>
          <p><button type="button" class="ghost small" data-col-add>Add &rarr;</button></p></div>
        <div><strong>Selected Columns</strong> <span class="muted small">(drag or use the arrows)</span><ol data-col-list>${s.columns.map((k, i) => html`<li draggable="true" data-col="${k}">${lab(k)} <button type="button" class="linkish" data-col-up="${i}">&uarr;</button><button type="button" class="linkish" data-col-down="${i}">&darr;</button> <button type="button" class="linkish" data-col-x="${k}">&times;</button></li>`)}</ol></div>
        <div><strong>Row Groups</strong> <span class="muted small">(up to 3)</span>${[0, 1, 2].map((i) => html`<p><select data-group="${i}"><option value="">(none)</option>${opts(fields.map((f) => [f.key, f.label]), s.rowGroups[i] || '')}</select></p>`)}
          <p><label>Date grouping<select data-bucket>${opts(BUCKETS, s.bucket || 'day')}</select></label></p></div>
        <div><strong>Aggregate Columns</strong><div data-aggs>${(s.aggregates.length ? s.aggregates : []).map((a, i) => html`<p data-agg-row="${i}"><select data-agg-fn>${opts(AGG_FNS, a.fn)}</select> of <select data-agg-field>${opts(fields.map((f) => [f.key, f.label]), a.field)}</select> <button type="button" class="linkish" data-agg-x="${i}">&times;</button></p>`)}</div>
          <button type="button" class="ghost small" data-agg-add ${nums.length ? '' : raw('disabled')}>+ Add aggregate</button>
          <p><strong>Sort</strong> <select data-sort><option value="">(none)</option>${opts(fields.map((f) => [f.key, f.label]), (s.sort || {}).field || '')}</select><select data-sort-dir>${opts([['asc', 'Ascending'], ['desc', 'Descending']], (s.sort || {}).dir || 'asc')}</select></p></div>
      </div>
      <div data-filters-pane><strong>Filters</strong><div data-filters></div></div>
      <p><button type="button" class="ghost" data-run>Run</button> <button type="button" class="m-btn" data-save-report>Save</button> <a class="ghost" href="${rep ? `#/crm/reports/${rep.id}` : '#/crm/reports'}">Cancel</a></p>
      <div data-report-out></div>`);
    const ce = criteriaEditor('rep', fields, s.filters, { logic: s.logic || 'and', cfg, users: owners }); $('[data-filters]', box).innerHTML = toText(ce.body); const crit = ce.mount(box);
    const read = () => { const g = [0, 1, 2].map((i) => $(`[data-group="${i}"]`, box).value).filter(Boolean); const fc = crit.get();
      s.rowGroups = [...new Set(g)]; s.bucket = $('[data-bucket]', box).value; s.filters = fc.criteria; s.logic = fc.logic;
      s.aggregates = $$('[data-agg-row]', box).map((r) => ({ fn: $('[data-agg-fn]', r).value, field: $('[data-agg-field]', r).value }));
      const sf = $('[data-sort]', box).value; s.sort = sf ? { field: sf, dir: $('[data-sort-dir]', box).value } : null; return s; };
    const redraw = () => { read(); draw(box, s); };
    $('[data-edit-details]', box).addEventListener('click', () => { read(); details(s, () => draw(box, s)); });
    $('[data-col-q]', box).addEventListener('input', (e) => { const q = e.target.value.toLowerCase(); $$('[data-col-avail] option', box).forEach((o) => { o.hidden = q && !o.textContent.toLowerCase().includes(q); }); });
    $('[data-col-add]', box).addEventListener('click', () => { const add = [...$('[data-col-avail]', box).selectedOptions].map((o) => o.value); if (!add.length) return; read(); s.columns = [...s.columns, ...add]; draw(box, s); });
    const list = $('[data-col-list]', box); let dragKey = null;
    list.addEventListener('click', (e) => { const t = e.target.dataset; if (t.colX) { read(); s.columns = s.columns.filter((k) => k !== t.colX); draw(box, s); return; }
      const i = t.colUp != null ? +t.colUp : t.colDown != null ? +t.colDown : null; if (i == null) return; const j = t.colUp != null ? i - 1 : i + 1; if (j < 0 || j >= s.columns.length) return; read(); [s.columns[i], s.columns[j]] = [s.columns[j], s.columns[i]]; draw(box, s); });
    list.addEventListener('dragstart', (e) => { dragKey = e.target.closest('[data-col]').dataset.col; }); list.addEventListener('dragover', (e) => e.preventDefault());
    list.addEventListener('drop', (e) => { e.preventDefault(); const li = e.target.closest('[data-col]'); if (!li || !dragKey) return; read(); const from = s.columns.indexOf(dragKey); const to = s.columns.indexOf(li.dataset.col); s.columns.splice(to, 0, s.columns.splice(from, 1)[0]); dragKey = null; draw(box, s); });
    $('[data-agg-add]', box).addEventListener('click', () => { read(); s.aggregates.push({ fn: 'sum', field: nums[0].key }); draw(box, s); });
    $$('[data-agg-x]', box).forEach((b) => b.addEventListener('click', () => { read(); s.aggregates.splice(+b.dataset.aggX, 1); draw(box, s); }));
    const def = () => { read(); return { module: s.module, related: s.related, columns: s.columns, rowGroups: s.rowGroups, aggregates: s.aggregates, filters: s.filters, logic: s.logic, sort: s.sort, bucket: s.bucket }; };
    $('[data-run]', box).addEventListener('click', guard(async () => { const out = await api.runCrmReport({ ...def(), name: s.name }); $('[data-report-out]', box).innerHTML = toText(resultsHtml(out)); }));
    $('[data-save-report]', box).addEventListener('click', guard(async () => { const d = { ...def(), name: s.name, description: s.description || '', folderId: s.folderId, share: s.share };
      const r = rep ? await api.updateCrmReport(rep.id, (({ module, ...x }) => x)(d)) : await api.createCrmReport(d); toast('Report saved'); location.hash = `#/crm/reports/${r.id}`; }));
    void redraw;
  }
  return { title: rep ? `Edit ${rep.name}` : 'Create Report', crumbs: [['CRM', '#/crm'], ['Reports', '#/crm/reports'], [rep ? rep.name : 'Create Report']], body, mount };
}
export { isDateType };
