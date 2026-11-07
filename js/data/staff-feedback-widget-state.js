/* Launcher rules and unsent-draft storage. A draft is keyed by the signed-in person.
 * Reading one person's draft never returns another person's text. */
import { isFeedbackPilot } from './staff-feedback.js?v=202611080100';

export const DRAFT_PREFIX = 'cla-staff-feedback-draft:';

export function emptyDraft() {
  return { title: '', body: '', reply: '', includePage: false, includeOrder: false, page: '', fileNumber: '', reportId: '' };
}

export function draftKey(userId) {
  return DRAFT_PREFIX + String(userId || '');
}

export function launcherAllowed(user, opts = {}) {
  return isFeedbackPilot(user, opts);
}

export function saveDraft(storage, userId, draft) {
  if (!storage || !userId) return;
  const next = { ...emptyDraft(), ...(draft || {}) };
  next.title = String(next.title || '').slice(0, 140);
  next.body = String(next.body || '').slice(0, 4000);
  next.reply = String(next.reply || '').slice(0, 4000);
  next.page = String(next.page || '').slice(0, 200);
  next.fileNumber = String(next.fileNumber || '').slice(0, 40);
  next.reportId = String(next.reportId || '').slice(0, 80);
  next.includePage = !!next.includePage;
  next.includeOrder = !!next.includeOrder;
  const blank = !next.title && !next.body && !next.reply && !next.page && !next.fileNumber && !next.includePage && !next.includeOrder && !next.reportId;
  if (blank) storage.removeItem(draftKey(userId));
  else storage.setItem(draftKey(userId), JSON.stringify(next));
}

export function loadDraft(storage, userId) {
  const blank = emptyDraft();
  if (!storage || !userId) return blank;
  let raw = '';
  try { raw = storage.getItem(draftKey(userId)) || ''; } catch (e) { return blank; }
  if (!raw) return blank;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return blank;
    return { ...blank, title: String(parsed.title || '').slice(0, 140), body: String(parsed.body || '').slice(0, 4000), reply: String(parsed.reply || '').slice(0, 4000), includePage: !!parsed.includePage, includeOrder: !!parsed.includeOrder, page: String(parsed.page || '').slice(0, 200), fileNumber: String(parsed.fileNumber || '').slice(0, 40), reportId: String(parsed.reportId || '').slice(0, 80) };
  } catch (e) { return blank; }
}

/* open and the selected report survive a file-tab change. A different person starts closed. */
export function nextWidgetState(state, action) {
  const cur = state || { userId: null, open: false, reportId: '' };
  if (!action) return cur;
  if (action.type === 'sync') {
    if (!action.allowed) return { userId: null, open: false, reportId: '', unmount: true };
    if (cur.userId && cur.userId !== action.userId) return { userId: action.userId, open: false, reportId: '', unmount: true, switched: true };
    return { userId: action.userId, open: !!cur.open, reportId: cur.reportId || '', unmount: false };
  }
  if (action.type === 'navigate') return { ...cur, open: !!cur.open, reportId: cur.reportId || '' };
  if (action.type === 'open') return { ...cur, open: true };
  if (action.type === 'close') return { ...cur, open: false };
  if (action.type === 'toggle') return { ...cur, open: !cur.open };
  if (action.type === 'select') return { ...cur, open: true, reportId: action.reportId || '' };
  return cur;
}
