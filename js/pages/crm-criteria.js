/* crm-criteria.js : the filter rows used by dashboard components (Criteria) and reports (Filters): field, operator, value (date presets for date fields,
 * the picklist values for picklists, users for user fields). Rows are ANDed (dashboards) or AND / OR (reports). Function only. */
import { html, raw, $, $$, toText } from '../ui.js?v=202611041856';
import { opsFor, DATE_PRESETS, isDateType, NUMERIC } from '../data/crm-analytics.js?v=202611041856';

const optList = (f, cfg, users) => (f.type === 'boolean' ? [['yes', 'Yes'], ['no', 'No']] : f.type === 'user' ? users.map((u) => [u.id, u.name])
  : f.list ? ((cfg.picklists || {})[f.list] || []).map((o) => [o.value, o.retired ? `${o.label} (retired)` : o.label]) : f.options || []);
function valueHtml(f, c, cfg, users, which) {
  const v = which === 2 ? c.value2 || '' : c.value || ''; const name = which === 2 ? 'value2' : 'value';
  if (['empty', 'not_empty'].includes(c.op)) return '';
  if (which === 2 && !['between', 'not_between'].includes(c.op)) return '';
  if (['picklist', 'user', 'boolean'].includes(f.type)) return html`<select data-crit-${name}>${optList(f, cfg, users).map(([k, l]) => html`<option value="${k}" ${String(k) === String(v) ? raw('selected') : ''}>${l}</option>`)}</select>`;
  if (isDateType(f.type)) { const preset = DATE_PRESETS.some(([k]) => k === v);
    return html`<select data-crit-${name}-preset><option value="">(a date)</option>${DATE_PRESETS.map(([k, l]) => html`<option value="${k}" ${k === v ? raw('selected') : ''}>${l}</option>`)}</select><input type="date" data-crit-${name} value="${preset ? '' : String(v).slice(0, 10)}" ${preset ? raw('hidden') : ''}>`; }
  return html`<input type="${NUMERIC.includes(f.type) ? 'number' : 'text'}" step="any" data-crit-${name} value="${v}" maxlength="200">`;
}
function rowHtml(fields, c, cfg, users, i) {
  const f = fields.find((z) => z.key === c.field) || fields[0]; const ops = opsFor(f.type); if (!ops.some(([k]) => k === c.op)) c.op = ops[0][0];
  return html`<div data-crit-row="${i}"><span class="muted small">${i + 1}.</span> <select data-crit-field aria-label="Field">${fields.map((z) => html`<option value="${z.key}" ${z.key === f.key ? raw('selected') : ''}>${z.label}</option>`)}</select>
    <select data-crit-op aria-label="Operator">${ops.map(([k, l]) => html`<option value="${k}" ${k === c.op ? raw('selected') : ''}>${l}</option>`)}</select>
    ${valueHtml(f, c, cfg, users, 1)} ${['between', 'not_between'].includes(c.op) ? html`and ${valueHtml(f, c, cfg, users, 2)}` : ''} <button type="button" class="linkish" data-crit-x aria-label="Remove filter">&times;</button></div>`;
}
// opts: { logic: 'and' | 'or' | null (null = always AND, no choice), users, cfg }
export function criteriaEditor(key, fields, criteria0, opts = {}) {
  let rows = (criteria0 || []).map((c) => ({ ...c })); let logic = opts.logic || 'and'; const users = opts.users || []; const cfg = opts.cfg || {};
  const body = html`<div data-criteria="${key}"><div data-crit-rows></div><p><button type="button" class="ghost small" data-crit-add>+ Add filter</button>
    ${opts.logic ? html` <label>Match <select data-crit-logic><option value="and" ${logic === 'and' ? raw('selected') : ''}>All (AND)</option><option value="or" ${logic === 'or' ? raw('selected') : ''}>Any (OR)</option></select></label>` : html` <span class="muted small">All filters must match (AND).</span>`}</p></div>`;
  function mount(root) {
    const wrap = $(`[data-criteria="${key}"]`, root); const box = $('[data-crit-rows]', wrap);
    const read = () => { rows = $$('[data-crit-row]', box).map((r) => { const val = (n) => { const p = $(`[data-crit-${n}-preset]`, r); if (p && p.value) return p.value; const e = $(`[data-crit-${n}]`, r); return e ? e.value : ''; };
      return { field: $('[data-crit-field]', r).value, op: $('[data-crit-op]', r).value, value: val('value'), value2: val('value2') }; }); };
    const draw = () => { box.innerHTML = toText(rows.length ? rows.map((c, i) => rowHtml(fields, c, cfg, users, i)) : html`<p class="muted small" data-crit-none>No filters.</p>`); };
    box.addEventListener('change', (e) => { const r = e.target.closest('[data-crit-row]'); if (!r) return;
      if (e.target.matches('[data-crit-field]')) { read(); const i = +r.dataset.critRow; rows[i] = { field: rows[i].field, op: '', value: '' }; draw(); return; }
      if (e.target.matches('[data-crit-op]')) { read(); draw(); return; }
      if (e.target.matches('[data-crit-value-preset],[data-crit-value2-preset]')) { const n = e.target.matches('[data-crit-value-preset]') ? 'value' : 'value2'; const inp = $(`[data-crit-${n}]`, r); if (inp) inp.hidden = !!e.target.value; } });
    box.addEventListener('click', (e) => { if (!e.target.matches('[data-crit-x]')) return; read(); rows.splice(+e.target.closest('[data-crit-row]').dataset.critRow, 1); draw(); });
    $('[data-crit-add]', wrap).addEventListener('click', () => { read(); rows.push({ field: fields[0].key, op: '', value: '' }); draw(); });
    const lg = $('[data-crit-logic]', wrap); if (lg) lg.addEventListener('change', () => { logic = lg.value; });
    draw();
    return { get: () => { read(); return { criteria: rows.map((c) => ({ field: c.field, op: c.op, value: c.value, ...(['between', 'not_between'].includes(c.op) ? { value2: c.value2 } : {}) })), logic }; } };
  }
  return { body, mount };
}
