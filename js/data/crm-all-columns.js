/* The columns All Leads, All Clients, All Companies, and All Deals show, in that order.
 * The list pages and New Custom View both ask here, so a new view starts from the same columns.
 * A saved column choice on that login replaces the usual columns. This browser's copy is used when
 * the login has none, or when the read fails. Deal's older hide-list is still that browser copy.
 * Chosen columns use the list's own keys (ownerName, place). A view stores the field key (ownerId, city). */
import { activeFields, cfKey } from './crm-config.js?v=202611247700';
import { moduleFields } from './crm-analytics.js?v=202611301000';
import { DEAL_COLS, DEFAULT_HIDDEN, loadHidden } from './crm-deal-cols.js?v=202611070139';
import { COLUMN_CAP, columnKey, loadColumns, normalizeColumns } from './crm-columns.js?v=202611160300';
import { placeNameColumn } from './crm-views.js?v=202611301000';

const hiddenBuiltin = (cfg, scope, key) => !!(cfg && cfg.fields && cfg.fields[scope] && cfg.fields[scope][key] && cfg.fields[scope][key].hidden);
const listedCustom = (cfg, entity) => activeFields(cfg, entity).filter((f) => f.showInList).map((f) => cfKey(f.id));

// Keys of the columns the list builds before Manage columns adds the rest. Hidden built-ins drop out.
export function allListBuiltInKeys(module, cfg) {
  if (module === 'leads') {
    const keys = ['name', 'company', 'email', 'phone'];
    if (!hiddenBuiltin(cfg, 'person', 'leadSource')) keys.push('leadSource');
    if (!hiddenBuiltin(cfg, 'person', 'relationshipStatus')) keys.push('relationshipStatus');
    if (!hiddenBuiltin(cfg, 'person', 'roleInCompany')) keys.push('roleInCompany');
    if (!hiddenBuiltin(cfg, 'person', 'county')) keys.push('county');
    keys.push('ownerName', 'createdAt', 'modifiedAt', 'lastActivityAt', ...listedCustom(cfg, 'lead'));
    return keys;
  }
  if (module === 'contacts') {
    const keys = ['name', 'companyName'];
    if (!hiddenBuiltin(cfg, 'person', 'roleInCompany')) keys.push('roleInCompany');
    keys.push('email');
    if (!hiddenBuiltin(cfg, 'person', 'mobile')) keys.push('mobile');
    if (!hiddenBuiltin(cfg, 'person', 'leadSource')) keys.push('leadSource');
    if (!hiddenBuiltin(cfg, 'person', 'relationshipStatus')) keys.push('relationshipStatus');
    keys.push('ownerName', 'createdAt', 'modifiedAt', 'lastActivityAt');
    if (!hiddenBuiltin(cfg, 'person', 'county')) keys.push('county');
    if (!hiddenBuiltin(cfg, 'person', 'contactType')) keys.push('contactType');
    keys.push('orders', 'volume', ...listedCustom(cfg, 'contact'));
    return keys;
  }
  if (module === 'accounts') {
    const keys = ['name', 'kind'];
    if (!hiddenBuiltin(cfg, 'account', 'city')) keys.push('place');
    keys.push('ownerName', 'contacts', 'orders', 'volume', 'createdAt', 'modifiedAt', 'lastActivityAt', ...listedCustom(cfg, 'account'));
    return keys;
  }
  if (module === 'deals') return DEAL_COLS.map(([k]) => k);
  return [];
}

// Every key Manage columns can turn on, in the list's order.
export function allListCatalogKeys(module, cfg) {
  const primary = allListBuiltInKeys(module, cfg);
  const have = new Set(primary);
  if (module === 'deals') {
    const extra = moduleFields('deals', cfg).filter((f) => !have.has(f.key) && !(f.labelKey && have.has(f.labelKey))).map((f) => f.key);
    return [...primary, ...extra];
  }
  const scope = module === 'accounts' ? 'account' : 'person';
  const extra = moduleFields(module, cfg).filter((f) => !have.has(f.key) && !(hiddenBuiltin(cfg, scope, f.key) && !f.custom)).map((f) => f.key);
  return [...primary, ...extra];
}

// The columns on screen before anyone changes them. At most COLUMN_CAP, same as the list.
export function allListDefaultKeys(module, cfg) {
  const known = allListCatalogKeys(module, cfg);
  if (module === 'deals') return normalizeColumns(DEAL_COLS.map(([k]) => k).filter((k) => !DEFAULT_HIDDEN.includes(k)), known, known);
  return allListBuiltInKeys(module, cfg).slice(0, COLUMN_CAP).filter((k) => known.includes(k));
}

function browserStorage(storage) {
  if (storage) return storage;
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; }
}

// What this browser paints before the login row arrives. Deals still honor the older hide-list.
export function allListFirstPaint(module, cfg, storage, userId) {
  const store = browserStorage(storage);
  const known = allListCatalogKeys(module, cfg);
  if (module === 'deals') {
    try {
      if (store && store.getItem(columnKey(userId, 'deals'))) return loadColumns(store, userId, 'deals', { known, defaults: known });
    } catch (e) { /* the older hide-list */ }
    const hidden = new Set(loadHidden(store, userId));
    const legacy = DEAL_COLS.map(([k]) => k).filter((k) => known.includes(k) && !hidden.has(k));
    return normalizeColumns(legacy.length ? legacy : known.filter((k) => !DEFAULT_HIDDEN.includes(k)), known, known);
  }
  return loadColumns(store, userId, module, { known, defaults: allListDefaultKeys(module, cfg) });
}

// The order the All list settles on: the login's columns when that read works, otherwise this browser's.
export async function allListColumnKeys({ api, storage, userId, module, cfg } = {}) {
  const known = allListCatalogKeys(module, cfg);
  const local = allListFirstPaint(module, cfg, storage, userId);
  if (!api || typeof api.getUserUiPrefs !== 'function') return local;
  try {
    const row = await api.getUserUiPrefs(module);
    const raw = row && row.prefs && Array.isArray(row.prefs.order) ? row.prefs.order : null;
    if (!raw || !raw.length) return local;
    return normalizeColumns(raw, known, []);
  } catch (e) { return local; }
}

// The list says ownerName and place. A view stores ownerId and city. Anything a view cannot show is left out.
const VIEW_KEY = { ownerName: 'ownerId', place: 'city' };
export function viewColumnsFromList(module, listKeys, fields) {
  const known = new Set((fields || []).map((f) => f && f.key).filter(Boolean));
  const out = [];
  (Array.isArray(listKeys) ? listKeys : []).forEach((key) => {
    const direct = known.has(key) ? key : '';
    const mapped = !direct && VIEW_KEY[key] && known.has(VIEW_KEY[key]) ? VIEW_KEY[key] : '';
    const next = direct || mapped;
    if (!next || out.includes(next)) return;
    out.push(next);
  });
  return placeNameColumn(module, out);
}

export async function startingViewColumns({ api, storage, userId, module, cfg, fields } = {}) {
  const listKeys = await allListColumnKeys({ api, storage, userId, module, cfg });
  return viewColumnsFromList(module, listKeys, fields);
}
