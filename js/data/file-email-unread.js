/* Per-user unread file mail (MF-001, MF-002, MF-003).
 * Portal threads already store last_read_at on thread_participants (one row per person).
 * Gmail mail on a file (deal_emails) has no read column. A cursor per person per file lives in
 * deal_email_reads when that table exists (migration 20261110030000). Until then the same cursor
 * is kept in this browser, keyed by the signed-in user, and the page still opens.
 * Buyers, sellers, and agents never receive deal_emails (existing staff-only policy). Their icon
 * is portal threads they already participate in. Nothing here widens that. */

export const EMAIL_READ_PREFIX = 'cla-portal-new:email-read:';

export function relationMissing(err) {
  const m = String((err && (err.message || err.code)) || err || '');
  return /schema cache|could not find the (table|function|relation|column)|does not exist|42P01|PGRST202|PGRST204|PGRST205/i.test(m);
}

export function laterIso(a, b) {
  const x = String(a || '');
  const y = String(b || '');
  return x >= y ? x : y;
}

export function emailReadKey(userId, dealId) {
  return EMAIL_READ_PREFIX + String(userId || '') + ':' + String(dealId || '');
}

export function browserStorage() {
  try { return (typeof globalThis !== 'undefined' && globalThis.localStorage) || null; } catch (e) { return null; }
}

export function readLocalCursor(storage, userId, dealId) {
  if (!storage || !userId || !dealId) return '';
  try { return storage.getItem(emailReadKey(userId, dealId)) || ''; } catch (e) { return ''; }
}

export function writeLocalCursor(storage, userId, dealId, at) {
  if (!storage || !userId || !dealId || !at) return false;
  try { storage.setItem(emailReadKey(userId, dealId), at); return true; } catch (e) { return false; }
}

export function localCursorMap(storage, userId) {
  const out = {};
  if (!storage || !userId || typeof storage.length !== 'number' || typeof storage.key !== 'function') return out;
  const prefix = EMAIL_READ_PREFIX + userId + ':';
  try {
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.indexOf(prefix) === 0) out[k.slice(prefix.length)] = storage.getItem(k) || '';
    }
  } catch (e) { /* private mode or a test double without a full Storage API */ }
  return out;
}

// A Gmail row is unread for this person until their cursor passes sent_at.
// Mail they sent (portal sent_by, or an outbound from their own mailbox) is never unread for them.
export function isUnreadFileEmail(email, { userId, readAt } = {}) {
  if (!email) return false;
  const sentBy = email.sentBy || email.sent_by || '';
  const box = email.mailboxProfileId || email.mailbox_profile_id || '';
  const dir = email.direction || '';
  if (userId && sentBy && sentBy === userId) return false;
  if (userId && dir === 'out' && box && box === userId) return false;
  const at = String(email.sentAt || email.sent_at || email.createdAt || email.created_at || '');
  if (!at) return false;
  if (!readAt) return true;
  return at > String(readAt);
}

export function countUnreadEmails(emails, opts) {
  return (emails || []).reduce((n, e) => n + (isUnreadFileEmail(e, opts) ? 1 : 0), 0);
}

export function gmailUnreadByDeal(emails, reads, { userId, localReadAt } = {}) {
  const cursor = new Map();
  for (const r of reads || []) {
    const id = r.dealId || r.deal_id;
    if (id) cursor.set(id, laterIso(cursor.get(id), r.readAt || r.read_at));
  }
  for (const [id, at] of Object.entries(localReadAt || {})) cursor.set(id, laterIso(cursor.get(id), at));
  const out = {};
  for (const e of emails || []) {
    const id = e.dealId || e.deal_id;
    if (!id) continue;
    if (isUnreadFileEmail(e, { userId, readAt: cursor.get(id) || '' })) out[id] = (out[id] || 0) + 1;
  }
  return out;
}

// Only threads this person participates in. Same rule as thread_participants.last_read_at.
export function portalUnreadByDeal({ parts, threads, messages, userId } = {}) {
  const readAt = new Map();
  for (const p of parts || []) {
    const id = p.threadId || p.thread_id;
    if (id) readAt.set(id, p.lastReadAt || p.last_read_at || '');
  }
  const dealOf = new Map();
  for (const t of threads || []) if (t && t.id) dealOf.set(t.id, t.dealId || t.deal_id);
  const out = {};
  for (const m of messages || []) {
    const tid = m.threadId || m.thread_id;
    if (!readAt.has(tid)) continue;
    const author = m.authorId || m.author_id;
    if (userId && author === userId) continue;
    const at = String(m.createdAt || m.created_at || '');
    const since = readAt.get(tid) || '';
    if (!at || (since && at <= since)) continue;
    const dealId = dealOf.get(tid);
    if (!dealId) continue;
    out[dealId] = (out[dealId] || 0) + 1;
  }
  return out;
}

export function countsFromOpenOrderMail(rows) {
  const portal = {};
  const gmail = {};
  for (const row of rows || []) {
    const dealId = row.deal_id || row.dealId;
    if (!dealId) continue;
    const p = Number(row.portal_count ?? row.portalCount) || 0;
    const g = Number(row.gmail_count ?? row.gmailCount) || 0;
    if (p) portal[dealId] = p;
    if (g) gmail[dealId] = g;
  }
  return mergeMailUnread(portal, gmail);
}

export function mergeMailUnread(portal, gmail) {
  const out = {};
  const ids = new Set([...Object.keys(portal || {}), ...Object.keys(gmail || {})]);
  for (const id of ids) {
    const p = Number((portal || {})[id]) || 0;
    const g = Number((gmail || {})[id]) || 0;
    if (p + g > 0) out[id] = { portal: p, gmail: g, total: p + g };
  }
  return out;
}

// flags is null when the unread read failed: fall back to the portal count already on the deal (mock).
export function orderMailCount(deal, flags) {
  const row = flags && deal && flags[deal.id];
  if (row && typeof row.total === 'number') return row.total;
  return Number(deal && deal.unread) || 0;
}

function plainText(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

export function emailSearchBlob(email) {
  const e = email || {};
  return [e.subject, e.fromName || e.from_name, e.fromEmail || e.from_email, e.snippet, plainText(e.bodyHtml || e.body_html)]
    .map((x) => String(x || '').toLowerCase()).join(' ');
}

// Every word must appear in subject, from, or body (this file's messages only).
export function emailMatchesQuery(email, query) {
  const words = String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const blob = emailSearchBlob(email);
  return words.every((w) => blob.includes(w));
}
