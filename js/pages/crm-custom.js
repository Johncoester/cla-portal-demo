// crm-custom.js : CRM Settings on the screens (Janine / John, Nov 2): custom field inputs, record-page values, list columns / filters / sorts,
// and pick-list selects that never blank a record holding a retired value. Everything is rendered through html`` (escaped; never raw HTML).
import { html, raw, fmtDate, fmtMoney, fmtDateTime, $$, guard, toast } from '../ui.js?v=202611041951';
import { COMPUTED_TYPES, FILE_TYPES, ADDRESS_PARTS, IMAGE_EXT, sectionsOf } from '../data/crm-fields.js?v=202611041951';
import { maskValue } from '../data/crm-analytics.js?v=202611041951';
import { safeHref } from '../data/crm.js?v=202611041951';
import { activeFields, fieldsInSection, customDisplay, selectOptions, filterOptions, optLabel, cfKey, builtinHidden } from '../data/crm-config.js?v=202611041951';

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

// one custom field on a create / edit form (name "cf.<id>"; the adapter validates the value again).
// Nov 3 (b): the 24 Zoho types, tooltips, "Number of characters allowed", per-field Edit permission (disabled = not sent, so never changed).
const tip = (f) => (f.tooltip ? html` <span class="cf-tip" title="${f.tooltip}" data-cf-tip="${f.id}">${f.showTooltip ? html`(${f.tooltip})` : raw('&#9432;')}</span>` : '');
export function cfInput(cfg, f, value) {
  const n = 'cf.' + f.id; const L = html`${f.label}${f.required ? ' *' : ''}${tip(f)}`; const attrs = raw(`data-cf="${f.id}" data-cf-type="${f.type}"`);
  const dis = f.canEdit === false ? raw('disabled') : ''; const ml = (d) => raw(`maxlength="${Number(f.maxChars) || d}"`);
  if (COMPUTED_TYPES.includes(f.type)) return html`<label ${attrs}>${L}<input value="${value == null ? '' : customDisplay(f, value) || value}" disabled data-cf-computed> <span class="muted small">(${f.type === 'autonumber' ? 'assigned on save' : 'calculated'})</span></label>`;
  if (FILE_TYPES.includes(f.type)) return html`<label ${attrs}>${L}<span class="muted small"> Upload on the record page (after saving).</span></label>`;
  switch (f.type) {
    case 'textarea': return html`<label class="span2" ${attrs}>${L}<textarea name="${n}" rows="2" ${ml(4000)} ${dis}>${v0(value)}</textarea></label>`;
    case 'number': case 'currency': case 'percent': case 'decimal': case 'longint': return html`<label ${attrs}>${L}${f.type === 'currency' ? ' ($)' : f.type === 'percent' ? ' (%)' : ''}<input name="${n}" inputmode="decimal" value="${v0(value)}" ${dis}></label>`;
    case 'date': return html`<label ${attrs}>${L}<input name="${n}" type="date" value="${v0(value)}" ${dis}></label>`;
    case 'datetime': return html`<label ${attrs}>${L}<input name="${n}" type="datetime-local" value="${v0(value)}" ${dis}></label>`;
    case 'checkbox': return html`<label class="check" ${attrs}><input type="hidden" name="${n}" value="" ${dis}><input type="checkbox" name="${n}" value="1" ${value ? raw('checked') : ''} ${dis}> ${L}</label>`;
    case 'dropdown': return html`<label ${attrs}>${L}${dis ? html`<select disabled><option>${customDisplay(f, value) || '-None-'}</option></select>` : optSel(cfg, 'cf:' + f.id, n, value)}</label>`;
    case 'radio': { const list = selectOptions(cfg, 'cf:' + f.id, value); return html`<fieldset ${attrs}><legend>${L}</legend><label class="check"><input type="radio" name="${n}" value="" ${value ? '' : raw('checked')} ${dis}> -None-</label>${list.map(([v, l]) => html`<label class="check"><input type="radio" name="${n}" value="${v}" ${String(v) === String(value ?? '') ? raw('checked') : ''} ${dis}> ${l}</label>`)}</fieldset>`; }
    case 'multiselect': { const cur = Array.isArray(value) ? value : []; const list = selectOptions(cfg, 'cf:' + f.id, null); cur.forEach((v) => { if (!list.some(([x]) => x === v)) list.push([v, customDisplay(f, [v])]); });
      return html`<fieldset class="span2" ${attrs}><legend>${L}</legend><input type="hidden" name="${n}.ms" value="" ${dis}>${list.map(([v, l]) => html`<label class="check"><input type="checkbox" name="${n}.ms.${v}" value="1" ${cur.includes(v) ? raw('checked') : ''} ${dis}> ${l}</label>`)}</fieldset>`; }
    case 'address': { const a = value && typeof value === 'object' ? value : {}; return html`<fieldset class="span2" ${attrs}><legend>${L}</legend>${ADDRESS_PARTS.map(([k, l]) => html`<label>${l}<input name="${n}.a.${k}" maxlength="120" value="${v0(a[k])}" ${dis}></label>`)}</fieldset>`; }
    case 'user': return html`<label ${attrs}>${L}<select name="${n}" ${dis}><option value="">-None-</option>${((cfg && cfg.userOptions) || []).map(([v, l]) => html`<option value="${v}" ${v === value ? raw('selected') : ''}>${l}</option>`)}</select></label>`;
    case 'lookup': { const t = (f.config || {}).target; const list = ((cfg && cfg.lookupOptions) || {})[t] || []; return html`<label ${attrs}>${L}<select name="${n}" ${dis}><option value="">-None-</option>${list.map(([v, l]) => html`<option value="${v}" ${v === value ? raw('selected') : ''}>${l}</option>`)}${value && !list.some(([v]) => v === value) ? html`<option value="${value}" selected>${value}</option>` : ''}</select></label>`; }
    case 'email': return html`<label ${attrs}>${L}<input name="${n}" type="email" ${ml(200)} value="${v0(value)}" ${dis}></label>`;
    case 'phone': return html`<label ${attrs}>${L}<input name="${n}" type="tel" data-phone placeholder="xxx-xxx-xxxx" ${ml(30)} value="${v0(value)}" ${dis}></label>`;
    case 'url': return html`<label ${attrs}>${L}<input name="${n}" inputmode="url" ${ml(500)} placeholder="https://" value="${v0(value)}" ${dis}></label>`;
    default: return html`<label ${attrs}>${L}<input name="${n}" ${ml(255)} value="${v0(value)}" ${dis}></label>`;
  }
}
// a NEW record (no id) starts with each field's default value (Set Default Values, video 8)
export const cfInputs = (cfg, entity, section, rec) => fieldsInSection(cfg, entity, section).map((f) => { const v = ((rec && rec.custom) || {})[f.id];
  return cfInput(cfg, f, v === undefined && !(rec && rec.id) && f.defaultValue != null ? f.defaultValue : v); });
// a stored value on a record page (links only when http(s); everything else as plain text)
const lookupLabel = (f, v, cfg) => { const t = (f.config || {}).target; const o = (((cfg && cfg.lookupOptions) || {})[t] || []).find(([id]) => id === v); return o ? o[1] : String(v); };
const LOOKUP_HREF = { contacts: '#/crm/contacts/', leads: '#/crm/leads/', accounts: '#/crm/accounts/', deals: '#/crm/deals/', opportunities: '#/crm/pipeline' };
export function cfValue(f, v, cfg = null) {
  if (f.type !== 'checkbox' && (v == null || v === '' || (Array.isArray(v) && !v.length))) return dash();
  if (f.encrypted) return html`<span data-cf-masked title="Encrypted field: shown masked">${maskValue(v)}</span>`;   // encryption = masking in the UI (see docs)
  if (f.type === 'user') { const o = ((cfg && cfg.userOptions) || []).find(([id]) => id === v); return o ? o[1] : String(v); }
  if (f.type === 'lookup') { const t = (f.config || {}).target; return html`<a href="${(LOOKUP_HREF[t] || '#/crm/') + (t === 'opportunities' ? '' : v)}" data-cf-lookup>${lookupLabel(f, v, cfg)}</a>`; }
  if (FILE_TYPES.includes(f.type)) return html`${(Array.isArray(v) ? v : [v]).map((id) => html`${f.type === 'image' ? html`<img alt="${f.label}" data-cf-img="${id}" style="max-width:160px;max-height:120px;display:block">` : ''}<a href="#" data-cf-file="${id}">download</a>`)}`;
  if (f.type === 'datetime') return fmtDateTime(v);
  if (f.type === 'url') { const h = safeHref(v); return h ? html`<a href="${h}" target="_blank" rel="noopener noreferrer" data-ext-link>${h}</a>` : String(v); }
  return customDisplay(f, v, { money: fmtMoney, date: fmtDate });
}
export const cfRows = (cfg, entity, section, rec) => fieldsInSection(cfg, entity, section).map((f) => html`<dt>${f.label}${tip(f)}</dt><dd data-cf-val="${f.id}">${cfValue(f, ((rec && rec.custom) || {})[f.id], cfg)}${FILE_TYPES.includes(f.type) && f.canEdit !== false && rec && rec.id ? html` <label class="small">Upload ${f.type === 'image' ? 'image' : 'file'} <input type="file" data-cf-upload="${entity}:${rec.id}:${f.id}" ${f.type === 'image' ? raw(`accept="${IMAGE_EXT.map((e) => '.' + e).join(',')}"`) : ''}></label>` : ''}</dd>`);
// record pages: file / image fields (download, image preview, upload). A new upload replaces the field value; the earlier file stays in Attachments (nothing deleted).
export function wireCfFiles(root, api, refresh) {
  const read = (file) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(new Error('Could not read the file.')); r.readAsDataURL(file); });
  $$('[data-cf-img]', root).forEach((img) => { api.getCrmAttachmentContent(img.dataset.cfImg).then((c) => { if (c && c.dataUrl && /^data:image\//.test(c.dataUrl)) img.src = c.dataUrl; }).catch(() => {}); });
  $$('[data-cf-file]', root).forEach((a) => a.addEventListener('click', guard(async (e) => { e.preventDefault(); const c = await api.getCrmAttachmentContent(a.dataset.cfFile);
    const l = document.createElement('a'); l.href = c.dataUrl; l.download = c.name; document.body.appendChild(l); l.click(); l.remove(); })));
  $$('[data-cf-upload]', root).forEach((inp) => inp.addEventListener('change', guard(async () => { const file = inp.files[0]; if (!file) return; const [entity, id, fieldId] = inp.dataset.cfUpload.split(':');
    await api.uploadCrmFieldFile(entity, id, fieldId, { name: file.name, mimeType: file.type, size: file.size, dataUrl: await read(file) }); toast('File uploaded'); refresh(); })));
}
// list view pieces for the custom fields marked "show as a list column"
export const cfCols = (cfg, entity) => activeFields(cfg, entity).filter((f) => f.showInList).map((f) => [cfKey(f.id), f.label, (r) => cfValue(f, (r.custom || {})[f.id], cfg), (r) => (f.encrypted ? maskValue((r.custom || {})[f.id]) : customDisplay(f, (r.custom || {})[f.id]))]);
export const cfFilters = (cfg, entity) => activeFields(cfg, entity).filter((f) => f.type === 'dropdown' || f.type === 'radio' || f.type === 'checkbox').map((f) => [cfKey(f.id), f.label,
  f.type === 'checkbox' ? [['yes', 'Yes'], ['no', 'No']] : [...filterOptions(cfg, 'cf:' + f.id), ['none', '(blank)']], 'Any']);
export const cfSorts = (cfg, entity) => activeFields(cfg, entity).filter((f) => f.showInList && f.type !== 'textarea').map((f) => [cfKey(f.id), f.label]);
export const cfSearch = (cfg, entity) => activeFields(cfg, entity).filter((f) => !f.encrypted && ['text', 'textarea', 'email', 'phone', 'url'].includes(f.type)).map((f) => cfKey(f.id));

// Nov 3 (b), video 8 layout editor: sections other than the built-in blocks (Links and Socials, Sales Info Needed, ... and Admin-added ones), in their order.
// mode 'form' (inputs) or 'view' (values). Hidden sections and empty sections are left out.
const BLOCK_KEYS = ['info', 'address', 'description', 'additional'];
export function cfExtraSections(cfg, entity, mode, rec) {
  return sectionsOf(cfg, entity).filter((sec) => !sec.hidden && !BLOCK_KEYS.includes(sec.key) && fieldsInSection(cfg, entity, sec.key).length).map((sec) => (mode === 'form'
    ? html`<h4 class="span2" data-cf-section="${sec.key}">${sec.label}</h4>${cfInputs(cfg, entity, sec.key, rec)}`
    : html`<h3 data-cf-section="${sec.key}">${sec.label}</h3><dl class="kv">${cfRows(cfg, entity, sec.key, rec)}</dl>`));
}
