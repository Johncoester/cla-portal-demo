/* MF-045 (Matt, "Processor User-Documents" notes; confirmed Nov 11 2:33 PM ET): the Documents From column shows the name and role
 * of whoever shared each document. The demo data always had this; the hosted rows only carried the sender's id, so From was blank.
 * Pure helper: fills uploadedByName / uploadedByRole on rows the caller was already allowed to read. It never adds a row. */
const FILE_ROLE = { 'Client-Buyer': 'Buyer', 'Client-Seller': 'Seller', 'Buyer Agent': "Buyer's agent", 'Listing Agent': 'Listing agent' };
const roleText = (r) => (Object.prototype.hasOwnProperty.call(FILE_ROLE, String(r || '')) ? FILE_ROLE[r] : String(r || ''));
const full = (a, b) => `${a || ''} ${b || ''}`.trim();
export const CLA_SENDER = 'CLA Title & Escrow';
export const CLA_SHARED = 'Shared with you by CLA Title';

// file roles of one login on this file, agents first (the same order the file uses elsewhere)
const ORDER = ['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'];
function fileRoles(participants, profileId) {
  const roles = [...new Set((participants || []).filter((p) => p && !p.removed && ((p.contact && p.contact.profileId) || p.profileId) === profileId).map((p) => p.role).filter(Boolean))];
  return roles.sort((a, b) => ((ORDER.indexOf(a) + 1) || 99) - ((ORDER.indexOf(b) + 1) || 99));
}

/* rows: document rows (uploadedBy = the sender's login id). user: the person looking. participants: the file's parties.
 * profiles: logins the viewer can read ({ id, firstName, lastName, role }), usually CLA staff for a staff viewer. */
export function nameDocSenders(rows, { user = null, participants = [], profiles = [] } = {}) {
  const me = (user && user.id) || '';
  const mine = me ? fileRoles(participants, me) : [];
  // a buyer or seller (not an agent) is not shown who on the file uploaded something that CLA shared with them; same as the demo data
  const client = !!user && user.role === 'Outside user' && mine.length > 0 && mine.every((r) => r === 'Client-Buyer' || r === 'Client-Seller');
  const byId = new Map((profiles || []).filter((p) => p && p.id).map((p) => [p.id, p]));
  const cache = new Map();
  const who = (id) => {
    if (cache.has(id)) return cache.get(id);
    let out;
    const roles = fileRoles(participants, id);
    const party = (participants || []).find((p) => p && !p.removed && ((p.contact && p.contact.profileId) || p.profileId) === id);
    const prof = byId.get(id);
    if (id === me) out = { name: full(user.firstName, user.lastName) || 'You', role: roles.length ? roles.map(roleText).join(', ') : roleText(user.role === 'Outside user' ? '' : user.role) };
    else if (party && client) out = { name: CLA_SENDER, role: CLA_SHARED };
    else if (party) out = { name: full((party.contact || {}).firstName || party.firstName, (party.contact || {}).lastName || party.lastName) || 'Unnamed contact', role: roles.map(roleText).join(', ') };
    else if (prof) out = { name: full(prof.firstName, prof.lastName) || roleText(prof.role) || CLA_SENDER, role: prof.role === 'Outside user' ? '' : roleText(prof.role) };
    else out = { name: CLA_SENDER, role: 'CLA Title' };   // a login this viewer cannot read (CLA staff, for an outside viewer)
    cache.set(id, out); return out;
  };
  return (rows || []).map((d) => {
    if (!d || d.uploadedByName || !d.uploadedBy) return d && !d.uploadedByName ? { ...d, uploadedByName: '', uploadedByRole: d.uploadedByRole || '' } : d;
    const w = who(d.uploadedBy);
    return { ...d, uploadedByName: w.name, uploadedByRole: d.uploadedByRole || w.role };
  });
}

// the sender ids that still need a name (not the viewer, not someone on the file): the only ones worth a lookup
export function sendersToLookUp(rows, { user = null, participants = [] } = {}) {
  const me = (user && user.id) || '';
  const onFile = new Set((participants || []).map((p) => p && ((p.contact && p.contact.profileId) || p.profileId)).filter(Boolean));
  return [...new Set((rows || []).filter((d) => d && d.uploadedBy && !d.uploadedByName).map((d) => d.uploadedBy))].filter((id) => id !== me && !onFile.has(id));
}


/* FF-113 (Francis, Nov 23 meeting notes; confirmed "Both" Nov 24 6:18 PM ET):
 * Gmail-copied attachments are stored with uploaded_by = the file processor's mailbox, so the From
 * column used to show the processor. The email's From is already on deal_emails. These helpers
 * label only rows that have emailAttachmentKey (the Gmail copy). Ordinary uploads are left alone
 * so nameDocSenders can show the uploader. uploaded_by is not changed (sharing and access still
 * use it). No database file: existing attachment rows pick up the sender from the email record. */
export const EMAIL_SENDER_ROLE = 'Email sender';

export function emailFromLabel(email) {
  const name = String((email && (email.fromName || email.from_name)) || '').trim();
  const addr = String((email && (email.fromEmail || email.from_email)) || '').trim();
  if (name && addr && name.toLowerCase() !== addr.toLowerCase()) return { name, role: addr };
  if (name) return { name, role: EMAIL_SENDER_ROLE };
  if (addr) return { name: addr, role: EMAIL_SENDER_ROLE };
  return null;
}

function emailDocIds(email) {
  return (email && (email.attachmentDocumentIds || email.attachment_document_ids)) || [];
}

function sentAt(email) {
  const t = Date.parse((email && (email.sentAt || email.sent_at)) || '');
  return Number.isNaN(t) ? 0 : t;
}

// One email per document id. Prefer an inbound message (the person who sent it in), then the earliest.
export function emailSendersByDoc(emails) {
  const map = new Map();
  for (const e of emails || []) {
    if (!e) continue;
    for (const id of emailDocIds(e)) {
      if (!id) continue;
      const prev = map.get(id);
      if (!prev) { map.set(id, e); continue; }
      const betterIn = (e.direction === 'in' ? 1 : 0) - (prev.direction === 'in' ? 1 : 0);
      if (betterIn > 0) { map.set(id, e); continue; }
      if (betterIn < 0) continue;
      const at = sentAt(e); const pt = sentAt(prev);
      if (at && (!pt || at < pt)) map.set(id, e);
    }
  }
  return map;
}

function partyEmail(p) {
  return String((p && ((p.contact && (p.contact.email || p.contact.Email)) || p.email)) || '').trim().toLowerCase();
}

export function applyEmailSenders(rows, emails, { participants = [] } = {}) {
  const byDoc = emailSendersByDoc(emails);
  if (!byDoc.size) return rows || [];
  const byEmail = new Map();
  for (const p of participants || []) {
    const em = partyEmail(p);
    if (em && !byEmail.has(em)) byEmail.set(em, p);
  }
  return (rows || []).map((d) => {
    if (!d || !(d.emailAttachmentKey || d.email_attachment_key)) return d;
    const e = byDoc.get(d.id);
    if (!e) return d;
    const party = byEmail.get(String(e.fromEmail || e.from_email || '').trim().toLowerCase());
    if (party) {
      const id = (party.contact && party.contact.profileId) || party.profileId;
      const roles = id ? fileRoles(participants, id) : [party.role].filter(Boolean);
      const label = emailFromLabel(e);
      const name = full((party.contact || {}).firstName || party.firstName, (party.contact || {}).lastName || party.lastName) || (label && label.name) || 'Unnamed contact';
      return { ...d, uploadedByName: name, uploadedByRole: roles.length ? roles.map(roleText).join(', ') : ((label && label.role) || EMAIL_SENDER_ROLE) };
    }
    const label = emailFromLabel(e);
    if (!label) return d;
    return { ...d, uploadedByName: label.name, uploadedByRole: label.role };
  });
}
