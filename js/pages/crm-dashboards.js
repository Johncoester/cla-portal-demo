/* crm-dashboards.js : CRM DASHBOARDS (Janine, Zoho video 9). #/crm/dashboards[/<id>]. Built-in Lead, Company and Client, Deal and Task dashboards plus
 * your own (Only me / All Users / Custom users, roles, departments; "Lock this dashboard for shared users"). Components: Chart and KPI (full),
 * Target Meter and Funnel (basic); the other Zoho types say "coming soon". Quick Chart builder: Component Name, Module, Measure, Grouping (date
 * fields: By Day / Calendar Week / Month / Quarter / Year), Criteria (ANDed). Hover shows the value; click a bar or slice for the records behind it.
 * Nothing is deleted: dashboards and components are RETIRED (hidden, restorable). Function only (no styling work). */
import { html, raw, $, $$, guard, toast, modal, closeModal, toText } from '../ui.js?v=202611051418';
import { DASH_MODULES, moduleName, moduleFields, COMPONENT_TYPES, CHART_TYPES, VISIBILITY, WIDTHS, HEIGHTS, BUCKETS, NUMERIC, isDateType, DATE_PRESETS } from '../data/crm-analytics.js?v=202611051418';
import { tabs, head } from './crm-kit.js?v=202611051418';
import { chartSvg, kpiHtml, targetHtml, funnelHtml } from './crm-charts.js?v=202611051418';
import { criteriaEditor } from './crm-criteria.js?v=202611051418';

const H = { s: 180, m: 260, l: 380 };
const opts = (list, cur) => list.map(([k, l]) => html`<option value="${k}" ${String(k) === String(cur) ? raw('selected') : ''}>${l}</option>`);

function componentBody(c) {
  if (c.error) return html`<p class="err-text" data-comp-error>${c.error}</p>`;
  const d = c.data; const cur = !!d.currency;
  if (c.type === 'kpi') return raw(kpiHtml(d, cur)); if (c.type === 'target') return raw(targetHtml(d, cur)); if (c.type === 'funnel') return raw(funnelHtml(d, cur));
  return raw(chartSvg(d, c.config.chartType, { currency: cur, height: H[c.height] || 260 }));
}
// Download (CSV of the component's numbers) is an export, so Admin / Super admin only, like report Export (video 10)
const compMenu = (c, canEdit, canExport) => (canEdit || canExport ? html`<select data-comp-menu="${c.id}" aria-label="Component menu" style="width:auto;min-width:0"><option value="">&#8942;</option>${canEdit ? html`<option value="edit">Edit</option><option value="clone">Clone</option><option value="move">Move to another dashboard</option><option value="retire">Retire (hide)</option>` : ''}${canExport ? html`<option value="download">Download (CSV)</option>` : ''}</select>` : '');
const csvCell = (v) => { const s = String(v == null ? '' : v); return /^[=+\-@]/.test(s) ? `"'${s.replace(/"/g, '""')}"` : /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function downloadComponent(c) {
  const d = c.data || {}; const lines = [];
  if (Array.isArray(d.groups)) { const parts = d.series && d.series.length ? d.series : null; lines.push(['Group', d.measureLabel || 'Value', ...(parts ? parts.map((p) => p.label) : [])].map(csvCell).join(','));
    d.groups.forEach((g) => lines.push([g.label, g.value, ...(parts ? parts.map((p) => ((g.parts || []).find((z) => z.key === p.key) || {}).value ?? '') : [])].map(csvCell).join(','))); }
  else lines.push([d.measureLabel || 'Value'].map(csvCell).join(','), [d.value ?? d.total ?? ''].map(csvCell).join(','));
  const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(lines.join('\r\n')); a.download = `${String(c.name).replace(/[^\w .-]+/g, '_').slice(0, 80)}.csv`; a.setAttribute('data-comp-download', c.id); document.body.appendChild(a); a.click(); a.remove();
}
const compCard = (c, canEdit, canExport = false) => html`<div class="card" data-component="${c.id}" data-comp-type="${c.type}" style="display:inline-block;vertical-align:top;box-sizing:border-box;width:calc(${(c.width || 1) * 33.3}% - 12px);margin:4px">
  <h3 style="display:flex;justify-content:space-between"><span data-comp-name>${c.name}</span>${compMenu(c, canEdit, canExport)}</h3>
  ${c.data && c.data.criteriaText ? html`<p class="muted small" data-comp-criteria>${c.data.criteriaText}</p>` : ''}<div data-comp-body>${componentBody(c)}</div></div>`;

export async function dashboardsPage(c) {
  const { api, params, me, refresh, owners } = c; const list = await api.listCrmDashboards({ includeRetired: true }); const active = list.filter((d) => !d.retired);
  const id = params.id || (active[0] || {}).id; const dash = id ? await api.getCrmDashboard(id) : null;
  const canCreate = me.canEdit; const others = active.filter((d) => d.canEdit && d.id !== (dash || {}).id);
  const menu = dash ? html`<select data-dash-menu aria-label="Dashboard menu" style="width:auto;min-width:0"><option value="">Dashboard &#9662;</option><option value="filters">Filters</option><option value="clone">Clone</option>
    ${dash.canEdit ? html`<option value="details">Edit name and sharing</option><option value="reorder">Reorder and resize</option>` : ''}${dash.canEdit || dash.mine ? html`<option value="${dash.retired ? 'restore' : 'retire'}">${dash.retired ? 'Restore' : 'Retire (hide)'}</option>` : ''}</select>` : '';
  const body = html`${tabs('dashboards')}${head('Dashboards', me, canCreate ? html`<button class="m-btn right" data-new-dash>Create Dashboard</button>` : '')}
    <div style="display:flex;gap:12px"><div style="min-width:220px" data-dash-list><strong>Dashboards</strong><ul>${active.map((d) => html`<li><a href="#/crm/dashboards/${d.id}" data-dash-link="${d.id}" ${d.id === (dash || {}).id ? raw('aria-current="page"') : ''}>${d.name}</a>${d.builtin ? html` <span class="muted small">(built-in)</span>` : d.visibility === 'me' ? html` <span class="muted small">(only me)</span>` : ''}</li>`)}</ul>
      ${list.some((d) => d.retired) ? html`<details data-retired-dashes><summary class="small">Retired (${list.filter((d) => d.retired).length})</summary><ul>${list.filter((d) => d.retired).map((d) => html`<li><a href="#/crm/dashboards/${d.id}">${d.name}</a></li>`)}</ul></details>` : ''}</div>
    <div style="flex:1" data-dash="${(dash || {}).id || ''}">${dash ? html`<div style="display:flex;justify-content:space-between;align-items:center"><h3 data-dash-title>${dash.name}${dash.retired ? html` <span class="pill">Retired</span>` : ''}</h3><span data-dash-tools>${dash.canEdit && !dash.retired ? html`<button class="ghost" data-add-comp>Add Component</button> ${dash.list.length ? html`<button class="ghost" type="button" data-layout-edit>Edit layout</button> ` : ''}` : ''}${menu}</span></div>
      <div class="notice info" data-layout-bar hidden><strong>Edit layout:</strong> drag a component, or use its arrows and size buttons. <button class="ghost small" type="button" data-layout-cancel>Cancel</button> <button class="m-btn small" type="button" data-layout-save>Save layout</button></div>
      <p class="muted small" data-dash-meta>${dash.description || ''} ${dash.builtin ? 'Built in; shared with everyone with the CRM.' : `Owner ${dash.ownerName} · ${(VISIBILITY.find(([k]) => k === dash.visibility) || [, ''])[1]}${dash.locked ? ' · locked for shared users' : ''}`}
        ${dash.filters && (dash.filters.ownerId || dash.filters.period) ? html` · <strong data-dash-filters>Filtered: ${[dash.filters.ownerId ? `owner ${(owners.find((o) => o.id === dash.filters.ownerId) || { name: dash.filters.ownerId }).name}` : '', dash.filters.period ? `created ${(DATE_PRESETS.find(([k]) => k === dash.filters.period) || [, ''])[1]}` : ''].filter(Boolean).join(', ')}</strong>` : ''}</p>
      <div data-components>${dash.list.length ? dash.list.map((x) => compCard(x, dash.canEdit && !dash.retired, !!me.canConfigure)) : html`<p class="muted" data-no-components>No components yet.${dash.canEdit ? ' Use Add Component.' : ''}</p>`}</div>
      ${dash.retiredComponents.length ? html`<details data-retired-comps><summary class="small">Retired components (${dash.retiredComponents.length})</summary><ul>${dash.retiredComponents.map((x) => html`<li>${x.name} <button class="linkish" data-restore-comp="${x.id}">Restore</button></li>`)}</ul></details>` : ''}`
      : html`<p class="muted">No dashboards yet.</p>`}</div></div>`;
  function mount(root) {
    const nd = $('[data-new-dash]', root); if (nd) nd.addEventListener('click', () => dashDialog(c, null));
    if (!dash) return;
    const ac = $('[data-add-comp]', root); if (ac) ac.addEventListener('click', () => pickType(c, dash));
    const dm = $('[data-dash-menu]', root); if (dm) dm.addEventListener('change', guard(async () => { const v = dm.value; dm.value = '';
      if (v === 'filters') return filterDialog(c, dash);
      if (v === 'clone') { const n = prompt('Name of the copy', `Copy of ${dash.name}`); if (n == null) return; const r = await api.cloneCrmDashboard(dash.id, { name: n }); toast('Dashboard cloned'); location.hash = `#/crm/dashboards/${r.id}`; return; }
      if (v === 'details') return dashDialog(c, dash);
      if (v === 'reorder') return reorderDialog(c, dash);
      if (v === 'retire') { if (!confirm('Retire this dashboard? It is hidden, never deleted; you can restore it.')) return; await api.retireCrmDashboard(dash.id, true); toast('Dashboard retired'); location.hash = '#/crm/dashboards'; refresh(); return; }
      if (v === 'restore') { await api.retireCrmDashboard(dash.id, false); toast('Dashboard restored'); refresh(); } }));
    $$('[data-comp-menu]', root).forEach((s) => s.addEventListener('change', guard(async () => { const v = s.value; s.value = ''; const comp = dash.list.find((z) => z.id === s.dataset.compMenu);
      if (v === 'download') { downloadComponent(comp); toast('Downloaded (CSV)'); return; }
      if (v === 'edit') return builder(c, dash, comp.type, comp);
      if (v === 'clone') { await api.cloneCrmComponent(comp.id); toast('Component cloned'); refresh(); return; }
      if (v === 'retire') { if (!confirm('Retire this component? It is hidden, never deleted; you can restore it.')) return; await api.retireCrmComponent(comp.id, true); toast('Component retired'); refresh(); return; }
      if (v === 'move') { if (!others.length) { toast('You have no other dashboard you can change. Create one first.', 'err'); return; }
        const m = modal('Move to another dashboard', html`<form data-move-form><label>Dashboard<select name="to">${others.map((d) => html`<option value="${d.id}">${d.name}</option>`)}</select></label><p><button class="ghost" type="button" data-close>Cancel</button> <button class="m-btn">Move</button></p></form>`);
        $('[data-move-form]', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); await api.moveCrmComponent(comp.id, e.target.to.value); closeModal(); toast('Component moved'); refresh(); })); } })));
    $$('[data-restore-comp]', root).forEach((b) => b.addEventListener('click', guard(async () => { await api.retireCrmComponent(b.dataset.restoreComp, false); toast('Component restored'); refresh(); })));
    // Janine, Nov 4 (Aesthetics video 5:41-6:20): resize / reorder ON the dashboard (like Zoho), not only in the Reorder and resize dialog
    const le = $('[data-layout-edit]', root); if (le) wireLayout(c, dash, root);
    // drill-down: click a bar / slice / point / row / KPI
    $$('[data-component]', root).forEach((card) => $('[data-comp-body]', card).addEventListener('click', guard(async (e) => { const t = e.target.closest('[data-key]'); if (!t) return;
      const r = await api.crmDrillDown(card.dataset.component, t.dataset.key, t.dataset.key2 != null ? t.dataset.key2 : null); drillDialog(r); })));
  }
  return { title: 'Dashboards', crumbs: [['CRM', '#/crm'], ['Dashboards', '#/crm/dashboards'], ...(dash ? [[dash.name]] : [])], body, mount };
}
function drillDialog(r) {
  modal(r.title, html`<div data-drill><p data-drill-filter><strong>${r.filter}</strong>${r.criteria && r.criteria !== r.filter ? html`<br><span class="muted small">${r.criteria}</span>` : ''}</p><p data-drill-total>Total Records: <strong>${r.total}</strong></p>
    <table class="tbl"><thead><tr>${r.columns.map((l) => html`<th>${l}</th>`)}</tr></thead><tbody>${r.records.map((x) => html`<tr data-drill-row="${x.id}"><td><a href="${x.link}" data-drill-link>${x.name}</a></td>${x.cells.map((v) => html`<td>${v}</td>`)}</tr>`)}</tbody></table></div>`, { wide: true });
}
async function dashDialog(c, dash) {
  const { api } = c; const t = await api.listCrmShareTargets(); const d = dash || { visibility: 'me', shareUsers: [], shareRoles: [], shareDepts: [], locked: false };
  const canShare = !dash || (!dash.builtin && dash.mine);
  const m = modal(dash ? 'Edit dashboard' : 'Create Dashboard', html`<form data-dash-form class="form-grid">
    <label class="span2">Dashboard Name<input name="name" maxlength="120" required value="${d.name || ''}"></label>
    <label class="span2">Description<textarea name="description" maxlength="500" rows="2">${d.description || ''}</textarea></label>
    ${canShare ? html`<fieldset class="span2" data-visibility><legend>Who can see it</legend>${VISIBILITY.map(([k, l]) => html`<label><input type="radio" name="visibility" value="${k}" ${d.visibility === k ? raw('checked') : ''}> ${l}</label> `)}
      <div data-custom-share ${d.visibility === 'custom' ? '' : raw('hidden')}><label>Users<select name="shareUsers" multiple size="5">${t.users.map((u) => html`<option value="${u.id}" ${d.shareUsers.includes(u.id) ? raw('selected') : ''}>${u.name} (${u.role})</option>`)}</select></label>
        <label>Roles<select name="shareRoles" multiple size="5">${t.roles.map((r) => html`<option value="${r}" ${d.shareRoles.includes(r) ? raw('selected') : ''}>${r}</option>`)}</select></label>
        <label>Departments<select name="shareDepts" multiple size="3">${t.departments.map((x) => html`<option value="${x.id}" ${d.shareDepts.includes(x.id) ? raw('selected') : ''}>${x.name}</option>`)}</select></label></div>
      <label data-lock-row><input type="checkbox" name="locked" ${d.locked ? raw('checked') : ''}> Lock this dashboard for shared users</label></fieldset>` : ''}
    <div class="span2"><button class="ghost" type="button" data-close>Cancel</button> <button class="m-btn" data-dash-save>${dash ? 'Save' : 'Create'}</button></div></form>`, { wide: true });
  const f = $('[data-dash-form]', m);
  $$('[name=visibility]', f).forEach((r) => r.addEventListener('change', () => { $('[data-custom-share]', f).hidden = f.visibility.value !== 'custom'; }));
  f.addEventListener('submit', guard(async (e) => { e.preventDefault(); const multi = (n) => (f[n] ? [...f[n].selectedOptions].map((o) => o.value) : undefined);
    const input = { name: f.name.value, description: f.description.value, ...(canShare ? { visibility: f.visibility.value, shareUsers: multi('shareUsers'), shareRoles: multi('shareRoles'), shareDepts: multi('shareDepts'), locked: f.locked.checked } : {}) };
    const r = dash ? await api.updateCrmDashboard(dash.id, input) : await api.createCrmDashboard(input); closeModal(); toast(dash ? 'Dashboard saved' : 'Dashboard created');
    if (dash) c.refresh(); else location.hash = `#/crm/dashboards/${r.id}`; }));
}
function filterDialog(c, dash) {
  const f0 = dash.filters || {};
  const m = modal('Dashboard filters', html`<form data-dash-filter-form class="form-grid"><p class="span2 muted small">Applies to every component: the owner (Client / Lead / Deal / Task Owner) and when the record was created.${dash.canEdit ? '' : ' You cannot change this dashboard; ask its owner.'}</p>
    <label>Owner<select name="ownerId"><option value="">Everyone</option>${c.owners.map((o) => html`<option value="${o.id}" ${o.id === f0.ownerId ? raw('selected') : ''}>${o.name}</option>`)}</select></label>
    <label>Created<select name="period"><option value="">Any time</option>${opts(DATE_PRESETS.filter(([k]) => k !== 'yesterday'), f0.period)}</select></label>
    <div class="span2"><button class="ghost" type="button" data-close>Cancel</button> ${dash.canEdit ? html`<button class="m-btn">Apply</button>` : ''}</div></form>`);
  $('[data-dash-filter-form]', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); await c.api.updateCrmDashboard(dash.id, { filters: { ownerId: e.target.ownerId.value, period: e.target.period.value } }); closeModal(); toast('Filters applied'); c.refresh(); }));
}
function reorderDialog(c, dash) {
  const items = dash.list.map((x) => ({ id: x.id, name: x.name, width: x.width || 1, height: x.height || 'm' }));
  const m = modal('Reorder and resize', html`<div data-reorder><table class="tbl"><thead><tr><th>Component</th><th>Width</th><th>Height</th><th>Move</th></tr></thead><tbody data-reorder-rows></tbody></table>
    <p><button class="ghost" type="button" data-close>Cancel</button> <button class="m-btn" type="button" data-reorder-save>Save layout</button></p></div>`, { wide: true });
  const tb = $('[data-reorder-rows]', m);
  const draw = () => { tb.innerHTML = toText(items.map((x, i) => html`<tr data-reorder-row="${x.id}" draggable="true"><td>${x.name}</td><td><select data-w="${i}">${opts(WIDTHS, x.width)}</select></td><td><select data-h="${i}">${opts(HEIGHTS, x.height)}</select></td>
    <td><button type="button" class="ghost small" data-up="${i}" ${i === 0 ? raw('disabled') : ''}>&uarr;</button> <button type="button" class="ghost small" data-down="${i}" ${i === items.length - 1 ? raw('disabled') : ''}>&darr;</button></td></tr>`)); };
  draw(); let dragFrom = null;
  tb.addEventListener('change', (e) => { if (e.target.dataset.w != null) items[+e.target.dataset.w].width = +e.target.value; if (e.target.dataset.h != null) items[+e.target.dataset.h].height = e.target.value; });
  tb.addEventListener('click', (e) => { const up = e.target.dataset.up, dn = e.target.dataset.down; const i = up != null ? +up : dn != null ? +dn : null; if (i == null) return; const j = up != null ? i - 1 : i + 1; [items[i], items[j]] = [items[j], items[i]]; draw(); });
  tb.addEventListener('dragstart', (e) => { const r = e.target.closest('[data-reorder-row]'); dragFrom = items.findIndex((x) => x.id === r.dataset.reorderRow); });
  tb.addEventListener('dragover', (e) => e.preventDefault());
  tb.addEventListener('drop', (e) => { e.preventDefault(); const r = e.target.closest('[data-reorder-row]'); if (!r || dragFrom == null) return; const to = items.findIndex((x) => x.id === r.dataset.reorderRow); const [it] = items.splice(dragFrom, 1); items.splice(to, 0, it); dragFrom = null; draw(); });
  $('[data-reorder-save]', m).addEventListener('click', guard(async () => { await c.api.reorderCrmDashboard(dash.id, items.map(({ id, width, height }) => ({ id, width, height }))); closeModal(); toast('Layout saved'); c.refresh(); }));
}
function pickType(c, dash) {
  const m = modal('Add Component', html`<div data-comp-types><p>Pick a component type.</p>${COMPONENT_TYPES.map(([k, l, on]) => html`<button type="button" class="${on ? 'ghost' : 'ghost'}" data-comp-type-pick="${k}" ${on ? '' : raw('disabled title="Coming soon"')}>${l}${on ? '' : ' (coming soon)'}</button> `)}</div>`, { wide: true });
  $$('[data-comp-type-pick]', m).forEach((b) => b.addEventListener('click', () => builder(c, dash, b.dataset.compTypePick, null)));
}
// Quick Chart / KPI / Target Meter / Funnel builder
function builder(c, dash, type, comp) {
  const { api, cfg, owners } = c; const cf0 = comp ? comp.config : { module: 'leads', measure: { fn: 'count' }, grouping: null, criteria: [], chartType: 'column' };
  const label = (COMPONENT_TYPES.find(([k]) => k === type) || [, type])[1];
  const m = modal(`${comp ? 'Edit' : 'Add'} ${label}${type === 'chart' ? ' (Quick Chart)' : ''}`, html`<form data-builder="${type}" class="form-grid" onsubmit="return false">
    <label class="span2">Component Name<input name="name" maxlength="120" value="${comp ? comp.name : ''}" required></label>
    <label>Module<select name="module" data-b-module>${opts(DASH_MODULES.map((k) => [k, moduleName(k)]), cf0.module)}</select></label>
    ${type === 'chart' ? html`<label>Chart type<select name="chartType">${opts(CHART_TYPES, cf0.chartType || 'column')}</select></label>` : html`<span></span>`}
    <div class="span2" data-b-fields></div>
    ${type === 'target' ? html`<label>Target<input name="target" type="number" min="0" step="any" value="${cf0.target || ''}"></label>` : ''}
    <div class="span2"><strong>Criteria Filter</strong><div data-b-criteria></div></div>
    <div class="span2" data-b-preview></div>
    <div class="span2"><button class="ghost" type="button" data-close>Cancel</button> <button class="ghost" type="button" data-b-preview-btn>Preview</button> <button class="m-btn" type="button" data-b-save>Save</button></div></form>`, { wide: true });
  const f = $('[data-builder]', m); let crit = null; let cf = cf0;
  const drawFields = () => { const module = f.module.value; const fields = moduleFields(module, cfg); const nums = fields.filter((x) => NUMERIC.includes(x.type));
    const keep = module === cf.module; const g = keep && cf.grouping ? cf.grouping : { field: '' }; const g2 = keep && cf.grouping2 ? cf.grouping2 : { field: '' }; const ms = keep ? cf.measure : { fn: 'count' };
    const grp = (n, cur, blank) => html`<select name="${n}" data-b-${n}>${blank ? html`<option value="">${blank}</option>` : ''}${fields.map((x) => html`<option value="${x.key}" data-type="${x.type}" ${x.key === cur.field ? raw('selected') : ''}>${x.label}</option>`)}</select>
      <select name="${n}Bucket" data-b-bucket="${n}">${opts(BUCKETS, cur.bucket || 'day')}</select>`;
    $('[data-b-fields]', f).innerHTML = toText(html`<label>Measure<select name="fn">${opts([['count', 'Record Count'], ...(nums.length ? [['sum', 'Sum of'], ['avg', 'Average of']] : [])], ms.fn)}</select>
      <select name="measureField" data-b-mfield>${nums.map((x) => html`<option value="${x.key}" ${x.key === ms.field ? raw('selected') : ''}>${x.label}</option>`)}</select></label>
      ${['chart', 'funnel'].includes(type) ? html` <label>Grouping ${grp('grouping', g)}</label>` : ''}
      ${type === 'chart' ? html` <label data-b-g2>Stack by (Stacked Column) ${grp('grouping2', g2, '(none)')}</label>` : ''}`);
    const sync = () => { $('[data-b-mfield]', f).hidden = f.fn.value === 'count'; $$('[data-b-bucket]', f).forEach((b) => { const s = f[b.dataset.bBucket]; const o = s && s.selectedOptions[0]; b.hidden = !o || !isDateType(o.dataset.type); });
      const g2r = $('[data-b-g2]', f); if (g2r) g2r.hidden = f.chartType.value !== 'stacked'; };
    $('[data-b-fields]', f).addEventListener('change', sync); if (f.chartType) f.chartType.addEventListener('change', sync); sync();
    const ce = criteriaEditor('b', fields, keep ? cf.criteria : [], { cfg, users: owners }); $('[data-b-criteria]', f).innerHTML = toText(ce.body); crit = ce.mount(f); };
  f.module.addEventListener('change', () => { drawFields(); cf = { module: f.module.value }; }); drawFields();
  const read = () => { const module = f.module.value; const config = { module, measure: f.fn.value === 'count' ? { fn: 'count' } : { fn: f.fn.value, field: f.measureField.value }, criteria: crit.get().criteria };
    if (f.grouping) config.grouping = { field: f.grouping.value, bucket: f.groupingBucket.value }; if (f.chartType) config.chartType = f.chartType.value;
    if (f.grouping2 && f.grouping2.value && f.chartType.value === 'stacked') config.grouping2 = { field: f.grouping2.value, bucket: f.grouping2Bucket.value };
    if (f.target) config.target = f.target.value; return { name: f.name.value, type, config }; };
  $('[data-b-preview-btn]', f).addEventListener('click', guard(async () => { const p = await api.previewCrmComponent({ ...read(), name: f.name.value || 'Preview' });
    $('[data-b-preview]', f).innerHTML = toText(html`<div data-preview>${componentBody({ ...p, height: 'm' })}</div>`); }));
  $('[data-b-save]', f).addEventListener('click', guard(async () => { const v = read(); if (comp) await api.updateCrmComponent(comp.id, v); else await api.addCrmComponent(dash.id, v); closeModal(); toast(comp ? 'Component saved' : 'Component added'); c.refresh(); }));
}

// in-place layout editing: each card gets move / width / height buttons and is draggable; Save layout stores it (same adapter call as the dialog)
function wireLayout(c, dash, root) {
  const box = $('[data-components]', root); const bar = $('[data-layout-bar]', root); let items = null;
  const W = WIDTHS.map(([k]) => k); const H = HEIGHTS.map(([k]) => k);
  const tools = (x, i, n) => html`<div class="layout-tools" data-layout-tools="${x.id}" style="display:flex;gap:4px;flex-wrap:wrap;margin:4px 0">
    <button type="button" class="ghost small" data-lay-move="-1" ${i === 0 ? raw('disabled') : ''} aria-label="Move ${x.name} earlier">&larr;</button><button type="button" class="ghost small" data-lay-move="1" ${i === n - 1 ? raw('disabled') : ''} aria-label="Move ${x.name} later">&rarr;</button>
    <button type="button" class="ghost small" data-lay-w="-1" ${x.width <= W[0] ? raw('disabled') : ''} aria-label="Narrower">Narrower</button><button type="button" class="ghost small" data-lay-w="1" ${x.width >= W[W.length - 1] ? raw('disabled') : ''} aria-label="Wider">Wider</button>
    <select data-lay-h aria-label="Height of ${x.name}" style="width:auto;min-width:0">${HEIGHTS.map(([k, l]) => html`<option value="${k}" ${k === x.height ? raw('selected') : ''}>${l}</option>`)}</select>
    <span class="muted small" data-lay-size>${(WIDTHS.find(([k]) => k === x.width) || [, ''])[1]}</span></div>`;
  const draw = () => { const cards = Object.fromEntries($$('[data-component]', box).map((el) => [el.dataset.component, el]));
    items.forEach((x, i) => { const el = cards[x.id]; box.appendChild(el); el.style.width = `calc(${x.width * 33.3}% - 12px)`; el.draggable = true; el.style.outline = '2px dashed var(--line, #9ab)';
      const old = $('[data-layout-tools]', el); if (old) old.remove(); el.insertAdjacentHTML('afterbegin', toText(tools(x, i, items.length))); }); };
  const stop = () => { items = null; bar.hidden = true; $$('[data-layout-tools]', box).forEach((t) => t.remove()); $$('[data-component]', box).forEach((el) => { el.draggable = false; el.style.outline = ''; }); };
  $('[data-layout-edit]', root).addEventListener('click', () => { items = dash.list.map((x) => ({ id: x.id, name: x.name, width: x.width || 1, height: x.height || 'm' })); bar.hidden = false; draw(); });
  box.addEventListener('click', (e) => { if (!items) return; const t = e.target.closest('[data-lay-move],[data-lay-w]'); if (!t) return; e.stopPropagation();
    const id = t.closest('[data-layout-tools]').dataset.layoutTools; const i = items.findIndex((x) => x.id === id);
    if (t.dataset.layMove) { const j = i + Number(t.dataset.layMove); if (j < 0 || j >= items.length) return; [items[i], items[j]] = [items[j], items[i]]; }
    if (t.dataset.layW) { const k = W.indexOf(items[i].width) + Number(t.dataset.layW); if (k < 0 || k >= W.length) return; items[i].width = W[k]; }
    draw(); }, true);
  box.addEventListener('change', (e) => { if (!items || !e.target.matches('[data-lay-h]')) return; const id = e.target.closest('[data-layout-tools]').dataset.layoutTools; const x = items.find((z) => z.id === id); if (H.includes(e.target.value)) x.height = e.target.value; });
  let dragId = null;
  box.addEventListener('dragstart', (e) => { if (!items) return; const el = e.target.closest('[data-component]'); dragId = el ? el.dataset.component : null; });
  box.addEventListener('dragover', (e) => { if (items) e.preventDefault(); });
  box.addEventListener('drop', (e) => { if (!items || !dragId) return; e.preventDefault(); const el = e.target.closest('[data-component]'); if (!el || el.dataset.component === dragId) return;
    const from = items.findIndex((x) => x.id === dragId); const [it] = items.splice(from, 1); items.splice(items.findIndex((x) => x.id === el.dataset.component), 0, it); dragId = null; draw(); });
  $('[data-layout-cancel]', root).addEventListener('click', () => { stop(); c.refresh(); });
  $('[data-layout-save]', root).addEventListener('click', guard(async () => { await c.api.reorderCrmDashboard(dash.id, items.map(({ id, width, height }) => ({ id, width, height }))); stop(); toast('Layout saved'); c.refresh(); }));
}
