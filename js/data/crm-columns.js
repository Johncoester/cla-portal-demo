/* Per-user CRM list columns (Janine, Nov 5, item 29; saved on the login Nov 10).
 * This browser paints first. The signed-in row in public.user_ui_prefs wins when it loads.
 * A list asks once per module for this page session, and only once that list is open.
 * At most COLUMN_CAP columns stay visible.
 * The same row also remembers records per page (pageSize). A column save keeps pageSize,
 * and a page-size save keeps the column order. */
import { PAGE_SIZE_OPTIONS, normalizePageSize, loadPageSize, savePageSize } from './crm-bulk.js?v=202611130300';
export const COLUMN_CAP = 10;
export const COLUMN_PREF_SAVE_MS = 400;
export const UI_PREF_MODULES = ['leads', 'contacts', 'accounts', 'deals'];
export const columnKey = (userId, module) => `cla-portal-new:crm-cols:v1:${userId || 'anon'}:${module}`;

export function normalizeColumns(order, known, defaults) {
  const allowed = new Set(known || []);
  const picked = [];
  (order || []).forEach((k) => { if (allowed.has(k) && !picked.includes(k) && picked.length < COLUMN_CAP) picked.push(k); });
  if (picked.length) return picked;
  const fallback = [];
  (defaults || known || []).forEach((k) => { if (allowed.has(k) && !fallback.includes(k) && fallback.length < COLUMN_CAP) fallback.push(k); });
  return fallback.length ? fallback : (known || []).slice(0, COLUMN_CAP);
}

export function loadColumns(storage, userId, module, { known, defaults }) {
  try {
    const raw = storage && storage.getItem(columnKey(userId, module));
    if (!raw) return normalizeColumns(null, known, defaults);
    const v = JSON.parse(raw);
    return normalizeColumns(Array.isArray(v.order) ? v.order : null, known, defaults);
  } catch (e) { return normalizeColumns(null, known, defaults); }
}

export function saveColumns(storage, userId, module, order, known) {
  const list = normalizeColumns(order, known, []);
  try { if (storage) storage.setItem(columnKey(userId, module), JSON.stringify({ order: list })); } catch (e) { /* private mode: this visit only */ }
  return list;
}

export function cleanUiModule(module) {
  const name = String(module || '');
  if (!UI_PREF_MODULES.includes(name)) throw new Error('Unknown list.');
  return name;
}

export function cleanUiPrefs(prefs) {
  const out = {};
  const raw = prefs && Array.isArray(prefs.order) ? prefs.order : null;
  if (raw) {
    const order = [];
    raw.forEach((k) => {
      const s = String(k == null ? '' : k).trim();
      if (!s || s.length > 80 || order.includes(s) || order.length >= COLUMN_CAP) return;
      order.push(s);
    });
    if (!order.length) throw new Error('Keep at least one column.');
    out.order = order;
  }
  if (prefs && prefs.pageSize != null && prefs.pageSize !== '') {
    const n = Number(prefs.pageSize);
    if (!PAGE_SIZE_OPTIONS.includes(n)) throw new Error('Choose 10, 20, 30, 40, 50, or 100 records per page.');
    out.pageSize = n;
  }
  if (!out.order && out.pageSize == null) throw new Error('Column preferences need an order.');
  return out;
}

const prefSlots = new Map();
const prefKey = (userId, module) => `${userId || 'anon'}:${module}`;

function columnStorage(storage) {
  if (storage) return storage;
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; }
}

export function resetColumnPrefSession() {
  for (const slot of prefSlots.values()) { if (slot.timer) clearTimeout(slot.timer); }
  prefSlots.clear();
}

/* First paint stays on `local` (already on screen). `ready` is that same list, or the server
 * list once the single read for this module finishes. A later edit wins over that read.
 * A failed read leaves the browser copy and is not tried again this session. */
export function beginColumnPrefs({ api, storage, userId, module, known, defaults, local } = {}) {
  const store = columnStorage(storage);
  const instant = Array.isArray(local) && local.length
    ? normalizeColumns(local, known, defaults)
    : loadColumns(store, userId, module, { known, defaults });
  const key = prefKey(userId, module);
  let slot = prefSlots.get(key);
  if (!slot) {
    slot = { gen: 0, order: instant.slice(), pageSize: loadPageSize(store, userId, module), pageSizeLoaded: false, pageTimer: null, timer: null, fetched: false, edited: false, pageEdited: false, promise: null };
    prefSlots.set(key, slot);
  }
  if (slot.pageSize == null) slot.pageSize = loadPageSize(store, userId, module);
  if (!slot.fetched) {
    slot.fetched = true;
    const started = slot.gen;
    slot.promise = (async () => {
      try {
        if (!api || typeof api.getUserUiPrefs !== 'function') return slot.order.slice();
        const row = await api.getUserUiPrefs(module);
        if (!(slot.pageEdited || slot.gen !== started)) {
          const n = Number(row && row.prefs ? row.prefs.pageSize : NaN);
          if (PAGE_SIZE_OPTIONS.includes(n)) {
            slot.pageSize = savePageSize(store, userId, module, n);
            slot.pageSizeLoaded = true;
          }
        }
        if (slot.edited || slot.gen !== started) return slot.order.slice();
        const raw = row && row.prefs && Array.isArray(row.prefs.order) ? row.prefs.order : null;
        if (!raw || !raw.length) return slot.order.slice();
        slot.order = saveColumns(store, userId, module, raw, known);
        return slot.order.slice();
      } catch (e) { return slot.order.slice(); }
    })();
  }
  const ready = (slot.promise || Promise.resolve(slot.order)).then(() => slot.order.slice());
  const pageSizeReady = (slot.promise || Promise.resolve(slot.pageSize)).then(() => normalizePageSize(slot.pageSize));
  return { local: instant, ready, pageSize: normalizePageSize(slot.pageSize), pageSizeReady };
}

/* The browser copy is written now. The login row is written once, after the pause, with the last order. */
export function scheduleColumnSave({ api, storage, userId, module, order, known, delay = COLUMN_PREF_SAVE_MS } = {}) {
  const store = columnStorage(storage);
  const list = saveColumns(store, userId, module, order, known);
  const key = prefKey(userId, module);
  let slot = prefSlots.get(key);
  if (!slot) {
    slot = { gen: 0, order: list.slice(), pageSize: null, pageSizeLoaded: false, pageTimer: null, timer: null, fetched: false, edited: false, pageEdited: false, promise: null };
    prefSlots.set(key, slot);
  }
  slot.gen += 1;
  slot.edited = true;
  slot.order = list.slice();
  if (slot.timer) clearTimeout(slot.timer);
  if (api && typeof api.saveUserUiPrefs === 'function') {
    const wait = Number.isFinite(delay) ? delay : COLUMN_PREF_SAVE_MS;
    slot.timer = setTimeout(() => {
      slot.timer = null;
      const prefs = { order: slot.order.slice() };
      if ((slot.pageEdited || slot.pageSizeLoaded) && PAGE_SIZE_OPTIONS.includes(slot.pageSize)) prefs.pageSize = slot.pageSize;
      Promise.resolve().then(() => api.saveUserUiPrefs(module, prefs)).catch(() => {});
    }, wait);
  }
  return list;
}

/* The browser copy is written now. The login row is written once, after the pause, and keeps the column order. */
export function schedulePageSizeSave({ api, storage, userId, module, pageSize, delay = COLUMN_PREF_SAVE_MS } = {}) {
  const store = columnStorage(storage);
  const n = savePageSize(store, userId, module, pageSize);
  const allowed = UI_PREF_MODULES.includes(String(module || ''));
  const key = prefKey(userId, module);
  let slot = prefSlots.get(key);
  if (!slot) {
    slot = { gen: 0, order: null, pageSize: n, pageSizeLoaded: false, pageTimer: null, timer: null, fetched: false, edited: false, pageEdited: false, promise: null };
    prefSlots.set(key, slot);
  }
  slot.pageSize = n;
  slot.pageEdited = true;
  if (slot.pageTimer) clearTimeout(slot.pageTimer);
  if (allowed && api && typeof api.saveUserUiPrefs === 'function') {
    const wait = Number.isFinite(delay) ? delay : COLUMN_PREF_SAVE_MS;
    slot.pageTimer = setTimeout(() => {
      slot.pageTimer = null;
      const prefs = { pageSize: slot.pageSize };
      Promise.resolve().then(() => api.saveUserUiPrefs(module, prefs)).catch(() => {});
    }, wait);
  }
  return n;
}

/* CRM deal name is the property address. The file number stays in its own field.
 * Nothing here writes a deal. A stored name is left in the database; callers replace the
 * display value. When the address is missing, a leading file number is dropped from the label. */
export function crmDealName(row) {
  if (!row || typeof row !== 'object') return '';
  const addr = String(row.propertyAddress || '').trim();
  if (addr) return addr;
  const name = String(row.name || '').trim();
  const file = String(row.fileNumber || '').trim();
  if (file && name.toLowerCase().startsWith(`${file.toLowerCase()} `)) return name.slice(file.length).trim();
  return name;
}

export function withDealName(row) {
  if (!row || typeof row !== 'object') return row;
  return { ...row, name: crmDealName(row) };
}
