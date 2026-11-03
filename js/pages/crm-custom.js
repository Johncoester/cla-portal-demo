// crm-custom.js : CRM Settings on the screens (Janine / John, Nov 2): custom field inputs, record-page values, list columns / filters / sorts,
// and pick-list selects that never blank a record holding a retired value. Everything is rendered through html`` (escaped; never raw HTML).
import { html, raw, fmtDate, fmtMoney } from '../ui.js?v=202611022207';
import { safeHref } from '../data/crm.js?v=202611022207';
import { activeFields, fieldsInSection, customDisplay, selectOptions, filterOptions, optLabel, cfKey, builtinHidden } from '../data/crm-config.js?v=202611022207';

const v0 = (v) => (v == null ? '' : v);
const dash = () => html`<span class="muted">&mdash;</span>`;
// a select for a configurable list: active options + the record's current (retired / older) value
export const optSel = (cfg, key, name, cur, blank = '-None-', filterFn = null) => {
  const list = selectOptions(cfg, key, cur).filter(([v]) => !filterFn || filterFn(v));
  return html`<select name="${name}">${blank != null ? html`<option value="">${blank}</option>` : ''}${list.map(([v, l]) => html`<option value="${v}" ${String(v) === String(cur ?? '') ? raw('selected') : ''}>${l}</option>`)}</select>`;
};
export const lbl = (cfg, key, v) => optLabel(cfg, key, v);
export const lblOrDash = (cfg, key, v) => (v == null || v === '' ? dash() : optLabel(cfg, key, v));
export const fopts = (cfg, key) => filterOptions(cfg, key);
export const hiddenField = (cfg, scope, key) => builtinHidden(cfg, scope, key);

// one custom field on a create / edit form (name "cf.<id>"; the adapter validates the value again)
export function cfInput(cfg, f, value) {
  const n = 'cf.' + f.id; const L = html`${f.label}${f.required ? ' *' : ''}`; const attrs = raw(`data-cf="${f.id}" data-cf-type="${f.type}"`);
  switch (f.type) {
    case 'textarea': return html`<label class="span2" ${attrs}>${L}<textarea name="${n}" rows="2" maxlength="4000">${v0(value)}</textarea></label>`;
    case 'number': case 'currency': case 'percent': return html`<label ${attrs}>${L}${f.type === 'currency' ? ' ($)' : f.type === 'percent' ? ' (%)' : ''}<input name="${n}" inputmode="decimal" value="${v0(value)}"></label>`;
    case 'date': return html`<label ${attrs}>${L}<input name="${n}" type="date" value="${v0(value)}"></label>`;
    case 'checkbox': return html`<label class="check" ${attrs}><input type="hidden" name="${n}" value=""><input type="checkbox" name="${n}" value="1" ${value ? raw('checked') : ''}> ${L}</label>`;
    case 'dropdown': return html`<label ${attrs}>${L}${optSel(cfg, 'cf:' + f.id, n, value)}</label>`;
    case 'email': return html`<label ${attrs}>${L}<input name="${n}" type="email" maxlength="200" value="${v0(value)}"></label>`;
    case 'phone': return html`<label ${attrs}>${L}<input name="${n}" type="tel" data-phone placeholder="xxx-xxx-xxxx" value="${v0(value)}"></label>`;
    case 'url': return html`<label ${attrs}>${L}<input name="${n}" inputmode="url" maxlength="500" placeholder="https://" value="${v0(value)}"></label>`;
    default: return html`<label ${attrs}>${L}<input name="${n}" maxlength="255" value="${v0(value)}"></label>`;
  }
}
export const cfInputs = (cfg, entity, section, rec) => fieldsInSection(cfg, entity, section).map((f) => cfInput(cfg, f, ((rec && rec.custom) || {})[f.id]));
// a stored value on a record page (links only when http(s); everything else as plain text)
export function cfValue(f, v) {
  if (f.type !== 'checkbox' && (v == null || v === '')) return dash();
  if (f.type === 'url') { const h = safeHref(v); return h ? html`<a href="${h}" target="_blank" rel="noopener noreferrer" data-ext-link>${h}</a>` : String(v); }
  return customDisplay(f, v, { money: fmtMoney, date: fmtDate });
}
export const cfRows = (cfg, entity, section, rec) => fieldsInSection(cfg, entity, section).map((f) => html`<dt>${f.label}</dt><dd data-cf-val="${f.id}">${cfValue(f, ((rec && rec.custom) || {})[f.id])}</dd>`);
// list view pieces for the custom fields marked "show as a list column"
export const cfCols = (cfg, entity) => activeFields(cfg, entity).filter((f) => f.showInList).map((f) => [cfKey(f.id), f.label, (r) => cfValue(f, (r.custom || {})[f.id]), (r) => customDisplay(f, (r.custom || {})[f.id])]);
export const cfFilters = (cfg, entity) => activeFields(cfg, entity).filter((f) => f.type === 'dropdown' || f.type === 'checkbox').map((f) => [cfKey(f.id), f.label,
  f.type === 'checkbox' ? [['yes', 'Yes'], ['no', 'No']] : [...filterOptions(cfg, 'cf:' + f.id), ['none', '(blank)']], 'Any']);
export const cfSorts = (cfg, entity) => activeFields(cfg, entity).filter((f) => f.showInList && f.type !== 'textarea').map((f) => [cfKey(f.id), f.label]);
export const cfSearch = (cfg, entity) => activeFields(cfg, entity).filter((f) => ['text', 'textarea', 'email', 'phone', 'url'].includes(f.type)).map((f) => cfKey(f.id));
