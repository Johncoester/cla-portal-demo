/* crm-config.js : CRM SETTINGS (Janine / John, Nov 2). Admins and Super admins customise the CRM themselves:
 *   1. editable PICKLISTS (add, rename, reorder, retire / restore an option),
 *   2. CUSTOM FIELDS on Leads, Clients, Companies and Opportunities (11 types), "deleted" = archived (hidden, values kept, restorable),
 *   3. hiding optional BUILT-IN fields and un-requiring the Zoho-required ones (Role in Company, Relationship Status, State).
 * Pure helpers shared by the mock adapter, the screens and the unit tests. Mirrored in SQL by migration 25 (crm_picklist_options,
 * crm_custom_fields, crm_field_settings, custom jsonb on the records). FAKE DATA ONLY. See docs/CRM.md "CRM Settings".
 *
 * STABLE VALUES: every option has a stable `value` (stored on records) and a `label` (shown). Built-in options keep their original
 * text as the value, so no stored record had to change. Renaming changes only the label, so every record, filter and report shows the
 * new name at once. Retiring hides the option from new entries; records that already use it keep it and show "(retired)". */
import { RELATIONSHIP_STATUSES, LEAD_RELATIONSHIP_STATUSES, CONVERTED_STATUS, LEAD_SOURCES, ROLES_IN_COMPANY, TASK_SUBJECTS, TASK_STATUSES, TASK_CLOSED, TASK_PRIORITIES, MEETING_TYPES, OPP_STAGES,
  ACCOUNT_KINDS, LINK_FIELDS, cleanUrl } from './crm.js?v=202611050803';
import { CALL_OUTCOMES } from './crm-calls.js?v=202611050803';
import { ZOHO_FIELD_TYPES, ensureSections, sectionsOf, cleanNewValue, checkMaxChars, newDisplay, addressText, COMPUTED_TYPES, FILE_TYPES } from './crm-fields.js?v=202611050803';

// ---------- picklists ----------
// locked = cannot be retired (the CRM itself depends on it); it can still be renamed and moved.
export const PICKLISTS = [
  { key: 'relationshipStatus', label: 'Relationship Status (Clients)', where: 'Clients (and the referral-partner board)', defaults: RELATIONSHIP_STATUSES, locked: [CONVERTED_STATUS], why: 'used when a lead is converted' },
  // Janine, Nov 3: Leads have their own list (a lead's older value stays on the record, shown as stored). Converting a lead still marks it Converted/Current Client.
  { key: 'leadRelationshipStatus', label: 'Relationship Status (Leads)', where: 'Leads', defaults: LEAD_RELATIONSHIP_STATUSES },
  { key: 'leadSource', label: 'Lead Source', where: 'Leads and Clients', defaults: LEAD_SOURCES },
  { key: 'roleInCompany', label: 'Role in Company', where: 'Leads and Clients', defaults: ROLES_IN_COMPANY },
  { key: 'accountKind', label: 'Company Type', where: 'Companies', defaults: ACCOUNT_KINDS, locked: ['other'], why: 'the default type' },
  { key: 'oppStage', label: 'Pipeline Stage', where: 'Opportunities (Pipeline board, Amount by Stage)', defaults: OPP_STAGES, locked: ['New'], why: 'new opportunities start here' },
  { key: 'taskSubject', label: 'Task Subject', where: 'Tasks (suggestions: any text can still be typed)', defaults: TASK_SUBJECTS, freeText: true },
  { key: 'taskStatus', label: 'Task Status', where: 'Tasks', defaults: TASK_STATUSES, locked: ['Not Started', TASK_CLOSED], why: 'new / repeating tasks start Not Started; Close Task sets Completed' },
  { key: 'taskPriority', label: 'Task Priority', where: 'Tasks', defaults: TASK_PRIORITIES },
  { key: 'meetingType', label: 'Meeting Type', where: 'Meetings', defaults: MEETING_TYPES },
  { key: 'callOutcome', label: 'Outbound Call Outcome', where: 'Calls (Log a call > Outcome Of Outgoing Call; blank = -None-)', defaults: CALL_OUTCOMES },   // Zoho video 11
];
export const PICKLIST_KEYS = PICKLISTS.map((p) => p.key);
export const picklistDef = (key) => PICKLISTS.find((p) => p.key === key) || null;
export const MAX_OPTIONS = 100;
export const OPTION_MAX = 60;

// ---------- custom fields ----------
// Nov 3 (b), Zoho video 8: the 24 Zoho field types (crm-fields.js). The first 11 are the Nov 2 types; their stored values are unchanged.
export const FIELD_TYPES = ZOHO_FIELD_TYPES;
export const FIELD_TYPE_CODES = FIELD_TYPES.map(([c]) => c);
export const fieldTypeLabel = (t) => (FIELD_TYPES.find(([c]) => c === t) || [null, t])[1];
export const CF_ENTITIES = [['lead', 'Leads'], ['contact', 'Clients'], ['account', 'Companies'], ['opportunity', 'Opportunities']];
export const CF_ENTITY_CODES = CF_ENTITIES.map(([c]) => c);
// sections a field can show in (the record page and the form use the same sections)
const PERSON_SECTIONS = [['info', 'Information (top)'], ['address', 'Address Information'], ['description', 'Description'], ['additional', 'Additional Information']];   // Janine, Nov 3: "Description" (no "Information")
export const SECTIONS_FOR = { lead: PERSON_SECTIONS, contact: PERSON_SECTIONS, account: [['info', 'Company details'], ['additional', 'Additional Information']], opportunity: [['info', 'Opportunity details']] };
export const sectionLabel = (entity, s, cfg = null) => { const l = sectionsOf(cfg, entity).find((z) => z.key === s); return l ? l.label : ((SECTIONS_FOR[entity] || []).find(([k]) => k === s) || [null, s])[1]; };
export const MAX_FIELDS = 50;
export const cfKey = (id) => 'cf_' + String(id).replace(/[^a-z0-9]/gi, '_');   // list column / filter name for a custom field

// ---------- built-in fields that can be hidden / un-required ----------
// PROTECTED (never hidden, never un-required): Owner, Last Name, First Name, Email, Phone, Company (the system matches people by email,
// shows them by name and checks access by owner). Leads and clients share one setting ("person") so a lead converts into the same fields.
export const PERSON_FIELDS = [
  ['roleInCompany', 'Role in Company', { requirable: true }], ['relationshipStatus', 'Relationship Status', { requirable: true }], ['state', 'State', { requirable: true }],
  ['title', 'Title'], ['mobile', 'Mobile'], ['assistant', 'Assistant'], ['asstPhone', 'Asst Phone'], ['leadSource', 'Lead Source'], ['agentSplit', 'Agent Split (%)'],
  ['licenseNo', 'Real Estate License #'], ['salesVolumeLastYear', 'Sales Volume (Last Year)'], ['dealsClosedLastYear', 'Deals Closed (Last Year)'],   // Janine, Nov 3: 'Zillow URL' retired (its values moved into Zillow Profile; the stored value is kept, hidden)
  ['contactType', 'Contact type (portal)'], ['tags', 'Tags (clients)'], ...LINK_FIELDS.map(([k, l]) => ['links.' + k, l]),
  ['street', 'Street'], ['city', 'City'], ['zip', 'Zip Code'], ['county', 'County'], ['description', 'Description'],
];
export const ACCOUNT_FIELDS = [['phone', 'Phone'], ['website', 'Website'], ['city', 'City'], ['state', 'State'], ['notes', 'Description']];
export const PROTECTED_FIELDS = { person: ['Owner', 'First Name', 'Last Name', 'Company', 'Email', 'Phone'], account: ['Company Name', 'Type', 'Company Owner'] };
export const BUILTIN_SCOPES = { person: PERSON_FIELDS, account: ACCOUNT_FIELDS };
export const REQUIRED_DEFAULT = ['roleInCompany', 'relationshipStatus', 'state'];

// ---------- defaults ----------
const optsFrom = (list) => list.map((o) => (Array.isArray(o) ? { value: o[0], label: o[1], retired: false } : { value: o, label: o, retired: false }));
export function defaultSettings() {
  const picklists = {}; PICKLISTS.forEach((p) => { picklists[p.key] = optsFrom(p.defaults); });
  const fields = { person: {}, account: {} };
  PERSON_FIELDS.forEach(([k, , o]) => { fields.person[k] = { hidden: false, required: !!(o && o.requirable && REQUIRED_DEFAULT.includes(k)) }; });
  ACCOUNT_FIELDS.forEach(([k]) => { fields.account[k] = { hidden: false, required: false }; });
  return { version: 1, picklists, customFields: [], fields, sections: ensureSections(null), dupRules: { email: true, phone: true }, modifiedAt: null, modifiedBy: null };
}
// fills anything missing (older stored settings, a new built-in list) without touching what an Admin changed
export function ensureSettings(s) {
  const d = defaultSettings(); if (!s || typeof s !== 'object') return d;
  s.picklists ||= {}; PICKLISTS.forEach((p) => { if (!Array.isArray(s.picklists[p.key]) || !s.picklists[p.key].length) s.picklists[p.key] = d.picklists[p.key]; });
  s.customFields = Array.isArray(s.customFields) ? s.customFields : [];
  s.fields ||= {}; ['person', 'account'].forEach((sc) => { s.fields[sc] ||= {}; Object.entries(d.fields[sc]).forEach(([k, v]) => { if (!s.fields[sc][k]) s.fields[sc][k] = { ...v }; }); });
  s.sections = ensureSections(s.sections);   // Nov 3 (b): layout sections (video 8)
  if (!s.dupRules || typeof s.dupRules !== 'object') s.dupRules = { email: true, phone: true };   // Clients & Leads: no duplicate email / phone across both modules
  s.dupRules.email = true;
  s.version ||= 1; return s;
}

// ---------- reading options ----------
// options of a list: a built-in key or 'cf:<fieldId>' (a dropdown custom field's own options)
export function optionsOf(cfg, key) {
  if (!cfg) return [];
  if (String(key).startsWith('cf:')) { const f = (cfg.customFields || []).find((z) => z.id === key.slice(3)); return f ? f.options || [] : []; }
  return (cfg.picklists || {})[key] || [];
}
export const findOption = (cfg, key, v) => { const s = String(v == null ? '' : v); const l = optionsOf(cfg, key);
  return l.find((o) => o.value === s) || l.find((o) => o.label.toLowerCase() === s.trim().toLowerCase()) || null; };
export const activeOptions = (cfg, key) => optionsOf(cfg, key).filter((o) => !o.retired);
// label to show for a stored value: the current label; a retired option is marked; an unknown (older) value is shown as stored
export function optLabel(cfg, key, v, { mark = true } = {}) {
  if (v == null || v === '') return ''; const o = optionsOf(cfg, key).find((z) => z.value === String(v));
  if (!o) return String(v); return o.retired && mark ? `${o.label} (retired)` : o.label;
}
// [value, label] pairs for a form select: active options, plus the record's current value if it is retired / unknown (so it never blanks)
export function selectOptions(cfg, key, current) {
  const out = activeOptions(cfg, key).map((o) => [o.value, o.label]);
  if (current != null && current !== '' && !out.some(([v]) => v === String(current))) out.push([String(current), optLabel(cfg, key, current)]);
  return out;
}
// [value, label] pairs for a list filter / board: every option (retired marked), so old records can still be found
export const filterOptions = (cfg, key) => optionsOf(cfg, key).map((o) => [o.value, o.retired ? `${o.label} (retired)` : o.label]);
// default for a new entry: the preferred value if still active, else the first active option
export const defaultOption = (cfg, key, preferred) => { const a = activeOptions(cfg, key); return (a.find((o) => o.value === preferred) || a[0] || { value: preferred }).value; };

// ---------- writing options (pure; the adapter checks who may call them) ----------
const fail = (m) => { throw new Error(m); };
export function cleanLabel(v, what = 'An option') {
  const s = String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) fail(`${what} needs a name.`); if (s.length > OPTION_MAX) fail(`${what} can be at most ${OPTION_MAX} characters.`); return s;
}
const lockedOf = (key) => (picklistDef(key) || {}).locked || [];
export const isLocked = (key, value) => lockedOf(key).includes(value);
// add: label must be new in the list (a retired one with that name is restored instead of duplicated)
export function addOption(list, label, key = '') {
  const l = cleanLabel(label); if (list.length >= MAX_OPTIONS) fail(`A list can have at most ${MAX_OPTIONS} options.`);
  const same = list.find((o) => o.label.toLowerCase() === l.toLowerCase());
  if (same && !same.retired) fail(`"${same.label}" is already in the list.`);
  if (same) { same.retired = false; return same; }
  let value = l; let n = 2; while (list.some((o) => o.value.toLowerCase() === value.toLowerCase())) value = `${l} #${n++}`;   // the stable value stays unique even after renames
  const o = { value, label: l, retired: false }; list.push(o); return o;
}
export function renameOption(list, value, label) {
  const o = list.find((z) => z.value === value) || fail('That option is not in the list.'); const l = cleanLabel(label);
  if (list.some((z) => z !== o && z.label.toLowerCase() === l.toLowerCase())) fail(`"${l}" is already in the list.`);
  o.label = l; return o;
}
export function retireOption(list, value, retired, key = '') {
  const o = list.find((z) => z.value === value) || fail('That option is not in the list.');
  if (retired) { if (isLocked(key, value)) fail(`"${o.label}" cannot be retired: ${(picklistDef(key) || {}).why || 'the CRM depends on it'}. You can rename it.`);
    if (!o.retired && list.filter((z) => !z.retired).length <= 1) fail('Keep at least one active option in the list.'); }
  o.retired = !!retired; return o;
}
export function moveOption(list, value, to) {
  const i = list.findIndex((z) => z.value === value); if (i < 0) fail('That option is not in the list.');
  const j = to === 'up' ? i - 1 : to === 'down' ? i + 1 : Number(to); if (!Number.isInteger(j) || j < 0 || j >= list.length) return list;
  const [o] = list.splice(i, 1); list.splice(j, 0, o); return list;
}

// ---------- custom field values ----------
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const realDate = (s) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; const [y, m, d] = s.split('-').map(Number); const t = new Date(y, m - 1, d); return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d; };
export const isBlankValue = (v) => v == null || v === '' || v === false || (Array.isArray(v) && !v.length);
// one value in -> the stored value (or throws a message naming the field). current = what the record holds now (a retired dropdown option may stay).
export function cleanCustomValue(def, v, current, opts = {}) {
  if (COMPUTED_TYPES.includes(def.type) || FILE_TYPES.includes(def.type)) return current === undefined ? null : current;   // filled by the CRM / by an upload, never typed
  const nv = cleanNewValue(def, v, current, opts); if (nv !== undefined) return nv;
  const out = cleanOldValue(def, v, current, opts); checkMaxChars(def, out); return out;
}
function cleanOldValue(def, v, current, { phone } = {}) {
  const L = def.label; const s = typeof v === 'string' ? v.trim() : v;
  if (def.type === 'checkbox') return v === true || v === 1 || ['1', 'on', 'true', 'yes'].includes(String(v).toLowerCase());
  if (s == null || s === '') return null;
  switch (def.type) {
    case 'text': if (String(s).length > 255) fail(`${L} can be at most 255 characters.`); return String(s);
    case 'textarea': if (String(s).length > 4000) fail(`${L} can be at most 4000 characters.`); return String(s);
    case 'number': case 'currency': case 'percent': {
      const n = Number(String(s).replace(def.type === 'number' ? /,/g : /[$,%\s]/g, ''));
      if (!isFinite(n) || String(s).replace(/[$,%\s]/g, '') === '') fail(`${L} must be a number.`);
      if (Math.abs(n) > 1e13) fail(`${L} is too large.`);
      return def.type === 'number' ? n : Math.round(n * 100) / 100; }
    case 'date': if (!realDate(String(s))) fail(`${L} must be a real date (YYYY-MM-DD).`); return String(s);
    case 'email': { const e = String(s).toLowerCase(); if (e.length > 200 || !emailRe.test(e)) fail(`${L} is not a valid email address.`); return e; }
    case 'phone': { if (phone) { try { return phone(String(s), L); } catch (e) { fail(e.message); } } const d = String(s).replace(/\D/g, ''); if (d.length !== 10) fail(`${L} must be a 10-digit phone number (xxx-xxx-xxxx).`); return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`; }
    case 'url': try { return cleanUrl(s); } catch (e) { return fail(`${L}: ${e.message}`); }
    case 'dropdown': { const o = (def.options || []).find((z) => z.value === String(s)) || (def.options || []).find((z) => z.label.toLowerCase() === String(s).toLowerCase());
      if (!o) fail(`Pick a ${L} from the list.`); if (o.retired && o.value !== current) fail(`"${o.label}" is retired; pick another ${L}.`); return o.value; }
    default: return fail(`Unknown field type for ${L}.`);
  }
}
// display text of a stored value (escaped by the screens' html``; never raw HTML)
export function customDisplay(def, v, fmt = {}) {
  if (def.type === 'checkbox') return v ? 'Yes' : 'No';
  const nd = newDisplay(def, v, fmt); if (nd !== undefined) return nd;
  if (v == null || v === '') return '';
  if (def.type === 'dropdown') { const o = (def.options || []).find((z) => z.value === String(v)); return o ? (o.retired ? `${o.label} (retired)` : o.label) : String(v); }
  if (def.type === 'currency') return fmt.money ? fmt.money(v) : '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (def.type === 'percent') return `${v}%`;
  if (def.type === 'date') return fmt.date ? fmt.date(v) : String(v);
  return String(v);
}
export const activeFields = (cfg, entity) => (cfg && cfg.customFields || []).filter((f) => f.entity === entity && !f.archivedAt).sort((a, b) => a.position - b.position);
export const fieldsInSection = (cfg, entity, section) => activeFields(cfg, entity).filter((f) => (f.section || 'additional') === section);
export const builtinHidden = (cfg, scope, key) => !!(cfg && cfg.fields && cfg.fields[scope] && cfg.fields[scope][key] && cfg.fields[scope][key].hidden);
export const builtinRequired = (cfg, key) => (cfg && cfg.fields && cfg.fields.person && cfg.fields.person[key] ? !!cfg.fields.person[key].required : REQUIRED_DEFAULT.includes(key));
// list rows for the screens: custom values flattened to cf_<id> (dropdown: stored value; checkbox: 'yes' / 'no'), for filters, sorting and CSV
export function flattenCustom(cfg, entity, row, fmt = {}) {
  const out = { ...row }; activeFields(cfg, entity).forEach((f) => { const v = (row.custom || {})[f.id];
    out[cfKey(f.id)] = f.type === 'checkbox' ? (v ? 'yes' : 'no') : f.type === 'address' ? addressText(v) : v == null ? '' : v; out[cfKey(f.id) + '_text'] = customDisplay(f, v, fmt); });
  return out;
}

// Nov 3 (b): custom values from a form. 'cf.<id>' = one value; 'cf.<id>.ms' (marker) + 'cf.<id>.ms.<option>' = multi select; 'cf.<id>.a.<part>' = address parts.
export function gatherCustom(input) {
  const given = { ...(input && input.custom && typeof input.custom === 'object' ? input.custom : {}) };
  Object.keys(input || {}).forEach((k) => { if (!k.startsWith('cf.')) return; const [id, kind, ...rest] = k.slice(3).split('.'); const tail = rest.join('.');
    if (!kind) given[id] = input[k];
    else if (kind === 'ms') { if (!Array.isArray(given[id])) given[id] = []; if (tail && input[k]) given[id].push(tail); }
    else if (kind === 'a') { if (!given[id] || typeof given[id] !== 'object' || Array.isArray(given[id])) given[id] = {}; given[id][tail] = input[k]; } });
  return given;
}

