/* Per-user CRM list columns (Janine, Nov 5, item 29). Stored in this browser only, like the
 * Deals hide-list. No table and no request on list load. At most COLUMN_CAP columns stay visible. */
export const COLUMN_CAP = 10;
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
