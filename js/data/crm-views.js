/* crm-views.js : CUSTOM VIEWS, SAVED FILTERS and SEARCH COLUMNS for the CRM lists (Janine, Nov 4 videos "Custom View / Filters" and
 * "Aesthetics - Buttons and Options"). Pure helpers + constants shared by the mock adapter, the pages and the tests. Mirrored by migration 56:
 *   crm_views (+ crm_view_criteria, crm_view_columns, crm_view_shares, crm_view_pins) and crm_saved_filters (+ crm_saved_filter_values),
 *   crm_search_columns. Every part is a typed row (no JSON blobs), so "which views use field X" or "who pinned what" is a plain query. */
import { moduleFields } from './crm-analytics.js?v=202611301000';
export const VIEW_MODULES = ['contacts', 'leads', 'accounts', 'deals'];
export const VIEW_MODULE_LABEL = { contacts: 'Clients', leads: 'Leads', accounts: 'Companies', deals: 'Deals' };
export const VIEW_VISIBILITY = [['me', 'Only me'], ['all', 'Everyone with the CRM'], ['custom', 'Selected users']];
export const VIEW_MAX_COLUMNS = 25;
export const VIEW_MAX_CRITERIA = 20;
export const PINS_MAX = 12;
// the name column stays selected (it opens the record) but it can sit anywhere in the list
export const VIEW_NAME_KEY = { contacts: 'name', leads: 'name', accounts: 'name', deals: 'name' };
// a new view starts with the module list's usual columns
export const VIEW_DEFAULT_COLUMNS = { contacts: ['name', 'companyName', 'email', 'phone', 'relationshipStatus', 'ownerId'], leads: ['name', 'company', 'email', 'phone', 'leadSource', 'relationshipStatus', 'ownerId'],
  accounts: ['name', 'kind', 'phone', 'city', 'state', 'ownerId'], deals: ['name', 'amount', 'stage', 'closingDate', 'clientName', 'ownerId'] };
export const nameOk = (s, max = 60) => { const v = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); if (!v) throw new Error('Give it a name.'); if (v.length > max) throw new Error(`At most ${max} characters.`);
  if (/[\u0000-\u001f]/.test(v)) throw new Error('No control characters.'); return v; };
// A saved order that already includes the name column is kept. A list with no name column
// (an older view that never stored a position for it) puts the name first. The name stays selected.
export function placeNameColumn(module, keys) {
  const nk = VIEW_NAME_KEY[module];
  const list = [];
  (Array.isArray(keys) ? keys : []).forEach((k) => { const s = String(k); if (s && !list.includes(s)) list.push(s); });
  if (!nk || list.includes(nk)) return list;
  return [nk, ...list];
}
// columns: known keys only, no repeats, name required, order kept
export function cleanColumns(module, keys, fields) {
  const known = new Set(fields.map((f) => f.key));
  const list = [...new Set((Array.isArray(keys) ? keys : []).map((k) => String(k)))];
  list.forEach((k) => { if (!known.has(k)) throw new Error(`"${k}" is not a column of ${VIEW_MODULE_LABEL[module] || module}.`); });
  const out = placeNameColumn(module, list);
  if (out.length > VIEW_MAX_COLUMNS) throw new Error(`At most ${VIEW_MAX_COLUMNS} columns.`);
  return out;
}
// SAVED FILTERS = the values of a list's filter bar (search box + each drop-down), saved under a name for one person
export const FILTER_MAX_VALUES = 30;
export function cleanFilterValues(values) {
  const list = Array.isArray(values) ? values : Object.entries(values || {}).map(([name, value]) => ({ name, value }));
  const out = list.map((z) => ({ name: String(z.name || '').slice(0, 60), value: String(z.value == null ? '' : z.value).slice(0, 200) })).filter((z) => z.name && z.value !== '' && z.name !== 'sort');
  out.forEach((z) => { if (!/^[A-Za-z][\w.:-]*$/.test(z.name)) throw new Error('A filter name is not valid.'); });
  if (!out.length) throw new Error('Set at least one filter (or a search) before saving it.'); if (out.length > FILTER_MAX_VALUES) throw new Error('Too many filters.');
  return out;
}
// SEARCH RESULT COLUMNS (Aesthetics video 2:20-3:00): per person, per module; '' list = the module's usual columns (SEARCH_COLUMNS)
export const SEARCH_COL_MAX = 12;

// Janine, Feedback 30 item 1: a user criterion (Created By, Modified By, Last Activity By, Owner, and any other user field)
// offers the same people as "Share this with > Selected users", not only the sales reps who can own a record.
// The stored value stays the user id, which is what a saved view already keeps.
export function criteriaUserList(users) {
  const seen = new Set();
  const out = [];
  (Array.isArray(users) ? users : []).forEach((u) => {
    const id = u && u.id != null ? String(u.id) : '';
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push({ id, name: String(u.name || '').trim() || id, role: String(u.role || '') });
  });
  out.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return out;
}
const userField = (key, label, labelKey) => ({ key, label, type: 'user', labelKey });
const EXTRA_USER_FIELDS = {
  contacts: [userField('modifiedBy', 'Modified By', 'modifiedByName'), userField('lastActivityBy', 'Last Activity By', 'lastActivityByName')],
  leads: [userField('modifiedBy', 'Modified By', 'modifiedByName'), userField('lastActivityBy', 'Last Activity By', 'lastActivityByName')],
  accounts: [userField('modifiedBy', 'Modified By', 'modifiedByName'), userField('lastActivityBy', 'Last Activity By', 'lastActivityByName')],
  deals: [userField('createdBy', 'Created By', 'createdByName'), userField('lastActivityBy', 'Last Activity By', 'lastActivityByName')],
};
const INSERT_BEFORE = { modifiedBy: 'modifiedAt', lastActivityBy: 'lastActivityAt', createdBy: 'createdAt' };
// Custom views add the user fields the four modules filter on. Reports and dashboards keep their own field list.
export function viewModuleFields(module, cfg) {
  const base = moduleFields(module, cfg).map((f) => ({ ...f }));
  const have = new Set(base.map((f) => f.key));
  (EXTRA_USER_FIELDS[module] || []).forEach((f) => {
    if (have.has(f.key)) return;
    const at = base.findIndex((z) => z.key === INSERT_BEFORE[f.key]);
    if (at >= 0) base.splice(at, 0, f); else base.push(f);
    have.add(f.key);
  });
  return base;
}
const firstId = (row, keys) => {
  for (const k of keys) { const v = row[k]; if (v != null && v !== '') return v; }
  return null;
};
// One row's user ids, under the field keys the criterion stores. created_by / modified_by / owner_id count as the same value.
export function withViewUserIds(row) {
  if (!row || typeof row !== 'object') return row;
  return {
    ...row,
    createdBy: firstId(row, ['createdBy', 'created_by']),
    modifiedBy: firstId(row, ['modifiedBy', 'modified_by']),
    ownerId: firstId(row, ['ownerId', 'owner_id', 'crmOwnerId', 'crm_owner_id']),
    lastActivityBy: firstId(row, ['lastActivityBy', 'last_activity_by']),
  };
}
// Names for a user column come from the one CRM user list. A name already on the row is left as it is.
export function applyUserNames(rows, fields, users) {
  const named = new Map((users || []).map((u) => [String(u.id), u.name || '']));
  const cols = (fields || []).filter((f) => f && f.type === 'user' && f.labelKey);
  if (!cols.length) return rows;
  return (rows || []).map((r) => {
    const add = {};
    cols.forEach((f) => {
      if (r[f.labelKey]) return;
      const id = r[f.key];
      if (id != null && id !== '' && named.has(String(id))) add[f.labelKey] = named.get(String(id));
    });
    return Object.keys(add).length ? { ...r, ...add } : r;
  });
}
