// CONNECT-6 (checklist 9.3): show Gmail on a file in Messages / Inbox, including replies
// already stored on deal_emails. The Email tab is unchanged. Visibility is decided by
// list_deal_emails (staff: every email on a file they can open; parties: mail they are on).
import { isUnreadFileEmail } from './file-email-unread.js?v=202611140900';

const val = (e, a, b) => (e && (e[a] != null && e[a] !== '' ? e[a] : e[b])) || '';
const addrs = (e, a, b) => {
  const v = (e && (e[a] || e[b])) || [];
  return Array.isArray(v) ? v.map((x) => String(x || '').trim()).filter(Boolean) : [];
};

export function gmailThreadKey(email) {
  return `${val(email, 'mailboxEmail', 'mailbox_email')}|${val(email, 'gmailThreadId', 'gmail_thread_id')}`;
}

export function gmailThreadId(email) {
  const k = gmailThreadKey(email);
  return k && k !== '|' ? 'gmail:' + encodeURIComponent(k) : '';
}

export function parseGmailThreadParam(sub) {
  const s = String(sub || '');
  if (!s.startsWith('gmail:')) return null;
  let raw = s.slice(6);
  try { raw = decodeURIComponent(raw); } catch (e) { /* keep the raw slice */ }
  const i = raw.indexOf('|');
  if (i <= 0) return null;
  return { mailboxEmail: raw.slice(0, i), gmailThreadId: raw.slice(i + 1) };
}

export function isGmailThread(thread) {
  return !!(thread && (thread.kind === 'gmail' || String(thread.id || '').startsWith('gmail:')));
}

export function groupDealEmails(emails = []) {
  const map = new Map();
  for (const e of emails || []) {
    const k = gmailThreadKey(e);
    if (!k || k === '|') continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(e);
  }
  for (const ms of map.values()) {
    ms.sort((a, b) => String(val(a, 'sentAt', 'sent_at')).localeCompare(String(val(b, 'sentAt', 'sent_at'))));
  }
  return [...map.values()];
}

export function shapeGmailThreads(emails = [], { userId = '', readAt = '' } = {}) {
  return groupDealEmails(emails).map((ms) => {
    const first = ms[0];
    const last = ms[ms.length - 1];
    const messages = ms.map((e) => ({
      id: e.id,
      createdAt: val(e, 'sentAt', 'sent_at') || e.createdAt || e.created_at || '',
      authorName: val(e, 'fromName', 'from_name') || val(e, 'fromEmail', 'from_email') || '',
      authorId: val(e, 'sentBy', 'sent_by') || (e.direction === 'out' ? val(e, 'mailboxProfileId', 'mailbox_profile_id') : ''),
      body: e.snippet || '',
      bodyHtml: val(e, 'bodyHtml', 'body_html'),
      attachments: e.attachmentNames || e.attachment_names || [],
      email: e,
    }));
    const people = [];
    const seen = new Set();
    const add = (name, email) => {
      const addr = String(email || '').trim();
      const label = String(name || '').trim() || addr;
      const key = (addr || label).toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      people.push({ id: addr || label, name: label, role: '' });
    };
    for (const e of ms) {
      add(val(e, 'fromName', 'from_name'), val(e, 'fromEmail', 'from_email'));
      for (const a of addrs(e, 'toEmails', 'to_emails')) add('', a);
      for (const a of addrs(e, 'ccEmails', 'cc_emails')) add('', a);
    }
    return {
      id: gmailThreadId(first),
      kind: 'gmail',
      subject: String(last.subject || first.subject || '').replace(/\s+/g, ' ').trim(),
      gmailThreadId: val(first, 'gmailThreadId', 'gmail_thread_id'),
      mailboxEmail: val(first, 'mailboxEmail', 'mailbox_email'),
      emails: ms,
      messages,
      participantIds: [],
      participants: people,
      count: ms.length,
      lastAt: val(last, 'sentAt', 'sent_at'),
      lastBody: last.snippet || '',
      lastFrom: val(last, 'fromName', 'from_name') || val(last, 'fromEmail', 'from_email'),
      unread: ms.filter((e) => isUnreadFileEmail(e, { userId, readAt })).length,
      hasFiles: ms.some((e) => (e.attachmentNames || e.attachment_names || []).length),
      staffCoordinated: false,
    };
  });
}

export function mergeConversationLists(portal = [], gmail = []) {
  return [...(portal || []), ...(gmail || [])].sort((a, b) => String(b.lastAt || '').localeCompare(String(a.lastAt || '')));
}
