/* crm-views.js : CUSTOM VIEWS, SAVED FILTERS and SEARCH COLUMNS for the CRM lists (Janine, Nov 4 videos "Custom View / Filters" and
 * "Aesthetics - Buttons and Options"). Pure helpers + constants shared by the mock adapter, the pages and the tests. Mirrored by migration 56:
 *   crm_views (+ crm_view_criteria, crm_view_columns, crm_view_shares, crm_view_pins) and crm_saved_filters (+ crm_saved_filter_values),
 *   crm_search_columns. Every part is a typed row (no JSON blobs), so "which views use field X" or "who pinned what" is a plain query. */
export const VIEW_MODULES = ['contacts', 'leads', 'accounts', 'deals'];
export const VIEW_MODULE_LABEL = { contacts: 'Clients', leads: 'Leads', accounts: 'Companies', deals: 'Deals' };
export const VIEW_VISIBILITY = [['me', 'Only me'], ['all', 'Everyone with the CRM'], ['custom', 'Selected users']];
export const VIEW_MAX_COLUMNS = 25;
export const VIEW_MAX_CRITERIA = 20;
export const PINS_MAX = 12;
// the name column of each module always stays first (it opens the record)
export const VIEW_NAME_KEY = { contacts: 'name', leads: 'name', accounts: 'name', deals: 'name' };
// a new view starts with the module list's usual columns
export const VIEW_DEFAULT_COLUMNS = { contacts: ['name', 'companyName', 'email', 'phone', 'relationshipStatus', 'ownerId'], leads: ['name', 'company', 'email', 'phone', 'leadSource', 'relationshipStatus', 'ownerId'],
  accounts: ['name', 'kind', 'phone', 'city', 'state', 'ownerId'], deals: ['name', 'amount', 'stage', 'closingDate', 'clientName', 'ownerId'] };
export const nameOk = (s, max = 60) => { const v = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); if (!v) throw new Error('Give it a name.'); if (v.length > max) throw new Error(`At most ${max} characters.`);
  if (/[\u0000-\u001f]/.test(v)) throw new Error('No control characters.'); return v; };
// columns: known keys only, no repeats, name first
export function cleanColumns(module, keys, fields) {
  const known = new Set(fields.map((f) => f.key)); const nk = VIEW_NAME_KEY[module];
  const list = [...new Set((Array.isArray(keys) ? keys : []).map((k) => String(k)))];
  list.forEach((k) => { if (!known.has(k)) throw new Error(`"${k}" is not a column of ${VIEW_MODULE_LABEL[module] || module}.`); });
  const out = [nk, ...list.filter((k) => k !== nk)]; if (out.length > VIEW_MAX_COLUMNS) throw new Error(`At most ${VIEW_MAX_COLUMNS} columns.`); return out;
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
