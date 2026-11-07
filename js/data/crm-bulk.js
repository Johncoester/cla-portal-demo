/* crm-bulk.js : mass actions on the rows currently shown. Nothing is deleted. Email is a draft only.
 * Each write still goes through the existing record method, so a refused row is reported and the rest continue. */
export const BULK_PAGE_SIZE = 25;

export const BULK_FIELDS = {
  lead: [['notes', 'Notes'], ['relationshipStatus', 'Relationship status'], ['leadSource', 'Lead source']],
  contact: [['notes', 'Notes']],
  account: [['notes', 'Notes'], ['kind', 'Company type']],
  opportunity: [['notes', 'Notes'], ['stage', 'Stage']],
  deal: [],
};

export const BULK_TASK_ENTITIES = ['lead', 'contact', 'account', 'opportunity'];

export function pageOf(rows, page, size = BULK_PAGE_SIZE) {
  const list = rows || [];
  const pages = Math.max(1, Math.ceil(list.length / size));
  const n = Math.min(Math.max(1, Number(page) || 1), pages);
  const start = (n - 1) * size;
  return { page: n, pages, rows: list.slice(start, start + size), start, total: list.length };
}

export function selectPage(selected, pageRows, on) {
  const next = new Set(selected || []);
  (pageRows || []).forEach((r) => { if (on) next.add(r.id); else next.delete(r.id); });
  return next;
}

export function selectionState(selected, pageRows) {
  const ids = (pageRows || []).map((r) => r.id);
  const on = ids.filter((id) => selected && selected.has(id));
  return { count: selected ? selected.size : 0, pageCount: ids.length, pageOn: on.length, allOnPage: ids.length > 0 && on.length === ids.length, someOnPage: on.length > 0 && on.length < ids.length };
}

export function dedupeRecipients(rows) {
  const seen = new Map();
  const skipped = [];
  (rows || []).forEach((r) => {
    const email = String(r.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) { skipped.push({ id: r.id, name: r.name || r.id, reason: 'No email address on this record.' }); return; }
    if (seen.has(email)) { skipped.push({ id: r.id, name: r.name || r.id, reason: `Same address as another selected record (${email}). One draft only.` }); return; }
    seen.set(email, { id: r.id, name: r.name || r.id, email });
  });
  return { recipients: [...seen.values()], skipped };
}

export function ownerAllowed(ownerId, owners) {
  return (owners || []).some((o) => o.id === ownerId);
}

export function fieldPatch(module, field, value) {
  const allowed = (BULK_FIELDS[module] || []).map(([k]) => k);
  if (!allowed.includes(field)) throw new Error('That field cannot be changed for every selected record.');
  const v = String(value == null ? '' : value).trim();
  if (!v) throw new Error('Enter the new value.');
  if (field === 'leadSource') return { source: v, leadSource: v };
  return { [field]: v };
}

export async function runEach(rows, fn) {
  const ok = []; const failed = [];
  for (const r of rows || []) {
    try { await fn(r); ok.push({ id: r.id, name: r.name || r.id }); }
    catch (e) { failed.push({ id: r.id, name: r.name || r.id, reason: e && e.message ? e.message : 'Could not update this record.' }); }
  }
  return { ok, failed };
}
