// TC-ONLY-2 (John, Nov 22 2026, 3:12-4:09 PM ET): the "Only communicate with TC" box on a file's buyer's agent / listing agent, and the
// "goes to the TC" notes in the email compose and the Email sellers and agents preview. The database decides who really gets each email
// (TC-ONLY-1, private.resolve_recipients). These helpers only explain it on screen. Staff only: outside users never see the box or the notes.
export const TC_ONLY_LABEL = 'Only communicate with TC';
export const isTcOnlyRole = (role) => role === 'Buyer Agent' || role === 'Listing Agent';
const SIDE = { 'Buyer Agent': "buyer's agent", 'Listing Agent': 'listing agent' };
const TC_ROLE = { 'Buyer Agent': 'Buyer Agent TC', 'Listing Agent': 'Listing Agent TC' };
export const tcNames = (tcs) => (tcs || []).map((t) => String((t && (t.name || t.email)) || '').trim()).filter(Boolean);
export const joinNames = (a) => (a.length <= 1 ? (a[0] || '') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
// who can tick it: CLA staff who run the file (processor, pre-processor, CLA TC, Admin). The server checks the same (is_manager + file access).
export const canSetTcOnly = (u) => !!u && !u.accountRole && u.role !== 'Outside user' && !u.viewOnly
  && (!!u.isAdmin || ['Processor', 'Preprocessor', 'Transaction Coordinator', 'Admin', 'Super admin'].includes(u.role));
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
  else hint = row.tcOnly ? `Emails and alerts for this agent go to ${joinNames(names)} instead.` : `When ticked, emails and alerts for this agent go to ${joinNames(names)} instead.`;
  return { checked: !!row.tcOnly, disabled, hasTc, hint, title: !canEdit ? 'Only the processor, pre-processor, CLA TC or an Admin can change this.' : (disabled ? hint : '') };
}
// notes for a list of addresses (compose To / Cc / Bcc), using the file's participants (id, role, contact.email)
export function tcOnlyNotes(rows, participants, emails) {
  const map = rows instanceof Map ? rows : tcOnlyMap(rows);
  const want = new Set((emails || []).map((e) => String(e || '').trim().toLowerCase()).filter(Boolean));
  const out = []; const seen = new Set();
  for (const p of participants || []) {
    const r = map.get(p.id); const email = String((p.contact && p.contact.email) || '').trim().toLowerCase();
    if (!r || !r.tcOnly || !email || !want.has(email) || seen.has(email)) continue;
    seen.add(email);
    const who = `${String(((p.contact && `${p.contact.firstName || ''} ${p.contact.lastName || ''}`) || '')).trim() || email} (${SIDE[p.role] || p.role})`;
    const names = tcNames(r.tcs);
    out.push(names.length ? { kind: 'redirect', email, text: `${who} has ${TC_ONLY_LABEL} on. This email goes to their TC, ${joinNames(names)}, instead.` }
      : { kind: 'held', email, text: `${who} has ${TC_ONLY_LABEL} on, but no TC is linked on that side. The email can't be sent to them: remove them, or add their TC on Contacts.` });
  }
  return out;
}
// one note for one Email sellers and agents preview message
export function tcOnlyPreviewNote(rows, participantId) {
  const r = (rows instanceof Map ? rows : tcOnlyMap(rows)).get(participantId);
  if (!r || !r.tcOnly) return '';
  const names = tcNames(r.tcs);
  return names.length ? `${TC_ONLY_LABEL} is on for this agent: this email goes to their TC, ${joinNames(names)}, instead.`
    : `${TC_ONLY_LABEL} is on for this agent, but no TC is linked on that side, so this email is held and not sent.`;
}
