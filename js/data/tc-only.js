// TC-ONLY-2 (John, Nov 22 2026, 3:12-4:09 PM ET): the "Only communicate with TC" box on a file's buyer's agent / listing agent, and the
// "goes to the TC" notes in the email compose and the Email sellers and agents preview. The database decides who really gets each email
// (TC-ONLY-1, private.resolve_recipients). These helpers only explain it on screen. Staff only: outside users never see the box or the notes.
export const TC_ONLY_LABEL = 'Only communicate with TC';
export const isTcOnlyRole = (role) => role === 'Buyer Agent' || role === 'Listing Agent';
const SIDE = { 'Buyer Agent': "buyer's agent", 'Listing Agent': 'listing agent' };
const TC_ROLE = { 'Buyer Agent': 'Buyer Agent TC', 'Listing Agent': 'Listing Agent TC' };
// TC-ONLY-2b (CRM Bot review of PR 414, Nov 23): a TC with no email can't get anything (the database holds the message), so it does not count as linked.
export const usableTcs = (tcs) => (tcs || []).filter((t) => t && String(t.email || '').trim());
export const tcNames = (tcs) => usableTcs(tcs).map((t) => String(t.name || t.email || '').trim()).filter(Boolean);
// TCs who have an email but no portal login: their in-app alerts (and queued emails that need a login) are held
const noLoginNames = (tcs) => usableTcs(tcs).filter((t) => t.hasLogin === false).map((t) => String(t.name || t.email || '').trim()).filter(Boolean);
const noLoginLine = (tcs) => { const n = noLoginNames(tcs); return n.length ? ` ${joinNames(n)} ${n.length > 1 ? 'have' : 'has'} no portal login yet, so in-app alerts for this agent are held (not sent to the agent) until they're invited.` : ''; };
export const joinNames = (a) => (a.length <= 1 ? (a[0] || '') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
// who can read and tick it: the same rule as the server's private.is_manager(): role Processor, Preprocessor or Transaction Coordinator,
// or the admin flag (TC-ONLY-2b: the role name 'Admin' / 'Super admin' alone is not enough; the server checks profiles.is_admin). Plus file access.
// Sales staff and outside users are refused by the server, so the screens do not even ask (no refused status call).
export const canReadTcOnly = (u) => !!u && !u.accountRole && u.role !== 'Outside user'
  && (!!u.isAdmin || ['Processor', 'Preprocessor', 'Transaction Coordinator'].includes(u.role));
export const canSetTcOnly = (u) => canReadTcOnly(u) && !u.viewOnly;
export const tcOnlyMap = (rows) => new Map((rows || []).map((r) => [r.participantId, { tcOnly: !!r.tcOnly, tcs: Array.isArray(r.tcs) ? r.tcs : [], role: r.role }]));
// the box on one agent row. Disabled until a TC is linked on that side; a box already ticked can always be unticked.
export function tcOnlyBox(row, role, { canEdit = false } = {}) {
  if (!row || !isTcOnlyRole(role)) return null;
  const names = tcNames(row.tcs);
  const hasTc = names.length > 0;
  const disabled = !canEdit || (!hasTc && !row.tcOnly);
  let hint;
  if (!hasTc) hint = row.tcOnly ? `No TC is linked on this side now, so emails to this agent are held. Add their ${TC_ROLE[role]} on Contacts, or untick the box.`
    : `Add this agent's transaction coordinator as ${TC_ROLE[role]} (linked to the agent) first.`;
  else hint = (row.tcOnly ? `Emails and alerts for this agent go to ${joinNames(names)} instead.` : `When ticked, emails and alerts for this agent go to ${joinNames(names)} instead.`) + noLoginLine(row.tcs);
  if (!hasTc && (row.tcs || []).length) hint += ' Their linked TC has no email address on Contacts, so nothing can be sent to them.';
  return { checked: !!row.tcOnly, disabled, hasTc, hint, title: !canEdit ? 'Only the processor, pre-processor, CLA TC or an Admin can change this.' : (disabled ? hint : '') };
}
// notes for a list of addresses (compose To / Cc / Bcc), using the file's participants (id, role, contact.email, contact.profileId).
// TC-ONLY-2b: like the server (resolve_recipients), an agent is matched by their contact email OR their portal-login email
// (loginEmails: Map or object of profileId -> login email, from api.tcOnlyLoginEmails).
const lc = (e) => String(e || '').trim().toLowerCase();
export function tcOnlyNotes(rows, participants, emails, loginEmails) {
  const map = rows instanceof Map ? rows : tcOnlyMap(rows);
  const want = new Set((emails || []).map(lc).filter(Boolean));
  const login = (id) => (!id || !loginEmails ? '' : lc(loginEmails instanceof Map ? loginEmails.get(id) : loginEmails[id]));
  const out = []; const seen = new Set();
  for (const p of participants || []) {
    const r = map.get(p.id); if (!r || !r.tcOnly) continue;
    const email = [lc(p.contact && p.contact.email), login((p.contact && p.contact.profileId) || p.profileId)].find((e) => e && want.has(e));
    if (!email || seen.has(email)) continue;
    seen.add(email);
    const who = `${String(((p.contact && `${p.contact.firstName || ''} ${p.contact.lastName || ''}`) || '')).trim() || email} (${SIDE[p.role] || p.role})`;
    const names = tcNames(r.tcs);
    out.push(names.length ? { kind: 'redirect', email, text: `${who} has ${TC_ONLY_LABEL} on. This email goes to their TC, ${joinNames(names)}, instead.${noLoginLine(r.tcs)}` }
      : { kind: 'held', email, text: `${who} has ${TC_ONLY_LABEL} on, but ${(r.tcs || []).length ? 'their linked TC has no email address' : 'no TC is linked on that side'}. The email can't be sent to them: remove them, or ${(r.tcs || []).length ? "add the TC's email" : 'add their TC'} on Contacts.` });
  }
  return out;
}
// one note for one Email sellers and agents preview message
export function tcOnlyPreviewNote(rows, participantId) {
  const r = (rows instanceof Map ? rows : tcOnlyMap(rows)).get(participantId);
  if (!r || !r.tcOnly) return '';
  const names = tcNames(r.tcs);
  return names.length ? `${TC_ONLY_LABEL} is on for this agent: this email goes to their TC, ${joinNames(names)}, instead.${noLoginLine(r.tcs)}`
    : `${TC_ONLY_LABEL} is on for this agent, but ${(r.tcs || []).length ? 'their linked TC has no email address' : 'no TC is linked on that side'}, so this email is held and not sent.`;
}
