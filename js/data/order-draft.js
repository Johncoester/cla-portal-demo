// Place Order draft. This browser only. It is not an order, it assigns nobody, and it never stores a file's contents.
export const ORDER_DRAFT_MS = 7 * 24 * 60 * 60 * 1000;
export const ORDER_DRAFT_CLAIM_MS = 20000;

export function orderDraftKey(user) {
  if (!user || !user.id) return '';
  return `cla-portal-new:order-draft:${user.isDemo ? 'demo' : 'real'}:${user.id}`;
}

export function readOrderDraft(storage, key, now = Date.now()) {
  if (!storage || !key) return null;
  let raw = null;
  try { raw = storage.getItem(key); } catch (e) { return null; }
  if (!raw) return null;
  let draft = null;
  try { draft = JSON.parse(raw); } catch (e) { return null; }
  if (!draft || typeof draft.fields !== 'object' || !draft.savedAt) return null;
  const at = Date.parse(draft.savedAt);
  if (!Number.isFinite(at) || now - at > ORDER_DRAFT_MS || now < at) return null;
  return draft;
}

export function writeOrderDraft(storage, key, draft) {
  storage.setItem(key, JSON.stringify(draft));
}

export function clearOrderDraft(storage, key) {
  try { storage.removeItem(key); } catch (e) { /* a browser that blocks storage has nothing to clear */ }
}

export function collectOrderFields(form) {
  const fields = {};
  const checks = {};
  for (const el of [...form.elements]) {
    if (!el.name || el.type === 'file' || el.type === 'button' || el.type === 'submit') continue;
    if (el.type === 'checkbox') {
      if (!checks[el.name]) checks[el.name] = [];
      if (el.checked) checks[el.name].push(el.value || 'on');
      continue;
    }
    if (el.type === 'radio') { if (el.checked) fields[el.name] = el.value; continue; }
    fields[el.name] = el.value;
  }
  return { fields, checks };
}

export function rememberedFiles(inputs) {
  return inputs.flatMap((input) => [...(input && input.files ? input.files : [])].map((f) => f.name)).filter(Boolean);
}

export function applyOrderDraft(form, draft, processors = []) {
  const fields = draft.fields || {};
  const checks = draft.checks || {};
  const allowed = new Set((processors || []).map((p) => p && p.id).filter(Boolean));
  const dropped = !!(fields.processorId && !allowed.has(fields.processorId));
  for (const el of [...form.elements]) {
    if (!el.name || el.type === 'file') continue;
    if (el.name === 'processorId') {
      el.value = !dropped && fields.processorId && allowed.has(fields.processorId) ? fields.processorId : (allowed.has(el.value) ? el.value : '');
      continue;
    }
    if (el.type === 'checkbox') { el.checked = (checks[el.name] || []).includes(el.value || 'on'); continue; }
    if (el.type === 'radio') { el.checked = fields[el.name] === el.value; continue; }
    if (Object.prototype.hasOwnProperty.call(fields, el.name) && fields[el.name] != null) el.value = String(fields[el.name]);
  }
  return { processorDropped: dropped };
}

export function claimOrderDraft(storage, key, now = Date.now()) {
  const draft = readOrderDraft(storage, key, now);
  if (!draft) return { ok: true };
  if (draft.claimAt && now - Date.parse(draft.claimAt) < ORDER_DRAFT_CLAIM_MS) {
    return { ok: false, message: 'This draft is already being placed from another tab. Wait a moment and try once. It will not create a second order by itself.' };
  }
  draft.claimAt = new Date(now).toISOString();
  writeOrderDraft(storage, key, draft);
  return { ok: true };
}

export function releaseOrderClaim(storage, key, now = Date.now()) {
  const draft = readOrderDraft(storage, key, now);
  if (!draft || !draft.claimAt) return;
  delete draft.claimAt;
  writeOrderDraft(storage, key, draft);
}
