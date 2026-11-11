/* crm-bulk.js : mass actions on the rows currently shown. Nothing is deleted. Email is a draft only.
 * Each write still goes through the existing record method, so a refused row is reported and the rest continue. */
export const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50, 100];
export const DEFAULT_PAGE_SIZE = 100;
export const BULK_PAGE_SIZE = DEFAULT_PAGE_SIZE;

export function normalizePageSize(value) {
  const n = Number(value);
  return PAGE_SIZE_OPTIONS.includes(n) ? n : DEFAULT_PAGE_SIZE;
}

export const pageSizeKey = (userId, module) => `cla-portal-new:crm-pagesize:v1:${userId || 'anon'}:${module}`;

export function loadPageSize(storage, userId, module) {
  try {
    const raw = storage && storage.getItem(pageSizeKey(userId, module));
    if (raw == null || raw === '') return DEFAULT_PAGE_SIZE;
    return normalizePageSize(raw);
  } catch (e) { return DEFAULT_PAGE_SIZE; }
}

export function savePageSize(storage, userId, module, size) {
  const n = normalizePageSize(size);
  try { if (storage) storage.setItem(pageSizeKey(userId, module), String(n)); } catch (e) { /* private mode: this visit only */ }
  return n;
}

export const BULK_FIELDS = {
  lead: [['notes', 'Notes'], ['relationshipStatus', 'Relationship status'], ['leadSource', 'Lead source']],
  contact: [['notes', 'Notes']],
  account: [['notes', 'Notes'], ['kind', 'Company type']],
  opportunity: [['notes', 'Notes'], ['stage', 'Stage']],
  deal: [['notes', 'Notes']],
};

export const BULK_TASK_ENTITIES = ['lead', 'contact', 'account', 'opportunity', 'deal'];
export const EMAIL_DRAFT_ENTITIES = ['lead', 'contact', 'account', 'deal'];

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

export function planRelatedEmails(module, people) {
  const rows = people || [];
  const skipped = [];
  const ready = [];
  rows.forEach((r) => {
    const email = String(r.email || '').trim().toLowerCase();
    if (module === 'opportunity') {
      if (r.contactId && email) ready.push({ id: r.contactId, name: r.name || r.id, email, storeEntity: 'contact', storeId: r.contactId });
      else skipped.push({ id: r.id, name: r.name || r.id, reason: 'This opportunity has no client with an email.' });
      return;
    }
    if (!email) { skipped.push({ id: r.id, name: r.name || r.id, reason: module === 'deal' ? 'No person on this deal has an email you are allowed to use.' : module === 'account' ? 'No client linked to this company has an email you can use.' : 'No email address on this record.' }); return; }
    ready.push({ id: r.id, name: r.name || r.id, email, storeEntity: module, storeId: r.id });
  });
  const plan = dedupeRecipients(ready);
  plan.skipped = [...skipped, ...plan.skipped];
  plan.recipients = plan.recipients.map((r) => { const src = ready.find((z) => z.id === r.id && z.email === r.email) || {}; return { ...r, storeEntity: src.storeEntity || module, storeId: src.storeId || r.id }; });
  return plan;
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

/* Mass update appends Notes. One expression on the row already being updated: the old text stays, then a separator, the date and author, and the new text. */
export function noteStamp({ author = '', at = new Date() } = {}) {
  const when = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric' }).format(at);
  const who = String(author || '').trim() || 'CLA Title';
  return `${when} — ${who}`;
}

export function appendCrmNote(existing, addition, stamp) {
  const next = String(addition == null ? '' : addition).trim();
  if (!next) throw new Error('Enter the new value.');
  const block = `${String(stamp || '').trim()}\n${next}`.trim();
  const prev = String(existing == null ? '' : existing).trim();
  return prev ? `${prev}\n\n---\n${block}` : block;
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
