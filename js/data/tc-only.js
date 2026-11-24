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
// TC-ONLY-2c (CRM Bot review of PR 415, Nov 23): what a TC with no portal login still gets, per TC. The database (resolve_recipients)
// holds portal alerts and most automatic emails (reminders, portal notices) for a TC with no login; emails staff type, and title package,
// post-closing, scheduling and Task Builder emails, still go to the TC's email. With two TCs, the one with a login gets the alerts.
const nameOf = (t) => String((t && (t.name || t.email)) || '').trim();
const STILL_SENT = 'title package, post-closing, scheduling and Task Builder emails';
const loginSplit = (tcs) => { const u = usableTcs(tcs); return { noLogin: u.filter((t) => t.hasLogin === false).map(nameOf).filter(Boolean), withLogin: u.filter((t) => t.hasLogin !== false).map(nameOf).filter(Boolean) }; };
const allNoLogin = (tcs) => { const { noLogin, withLogin } = loginSplit(tcs); return noLogin.length > 0 && withLogin.length === 0; };
// kind 'box' (the Contacts hint) or 'typed' (a compose / Email sellers and agents note: that email is typed, so it does go to the TC)
const noLoginLine = (tcs, kind = 'box') => {
  const { noLogin, withLogin } = loginSplit(tcs); if (!noLogin.length) return '';
  const n = joinNames(noLogin); const has = noLogin.length > 1 ? 'have' : 'has'; const get = noLogin.length > 1 ? 'get' : 'gets';
  if (withLogin.length) {
    const w = joinNames(withLogin);
    return kind === 'typed' ? ` ${n} ${has} no portal login yet, so portal alerts and most automatic emails for this agent go only to ${w}.`
      : ` ${n} ${has} no portal login yet, so portal alerts and most automatic emails go only to ${w}. ${n} still ${get} emails staff type, and ${STILL_SENT}.`;
  }
  // every TC lacks a login: the opening line already says which emails go to them (box) or this typed email does (notes)
  return ` ${n} ${has} no portal login yet, so portal alerts and most automatic emails (reminders and portal notices) for this agent are held until they're invited${kind === 'typed' ? ` (${STILL_SENT} still go to them)` : ''}.`;
};
export const joinNames = (a) => (a.length <= 1 ? (a[0] || '') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
// who can read and tick it: the same rule as the server's private.is_manager(): role Processor, Preprocessor or Transaction Coordinator,
// or the admin flag (TC-ONLY-2b: the role name 'Admin' / 'Super admin' alone is not enough; the server checks profiles.is_admin). Plus file access.
// Sales staff and outside users are refused by the server, so the screens do not even ask (no refused status call).
export const canReadTcOnly = (u) => !!u && !u.accountRole && u.role !== 'Outside user'
  && (!!u.isAdmin || ['Processor', 'Preprocessor', 'Transaction Coordinator'].includes(u.role));
export const canSetTcOnly = (u) => canReadTcOnly(u) && !u.viewOnly;
export const tcOnlyMap = (rows) => new Map((rows || []).map((r) => [r.participantId, { tcOnly: !!r.tcOnly, tcs: Array.isArray(r.tcs) ? r.tcs : [], role: r.role }]));
// the box on one agent row. Disabled until a TC is linked on that side; a box already ticked can always be unticked.
export function tcOnlyBox(row, role, { canEdit = false, agentName = '', sideTcNames = [] } = {}) {
  if (!row || !isTcOnlyRole(role)) return null;
  const names = tcNames(row.tcs);
  const hasTc = names.length > 0;
  const disabled = !canEdit || (!hasTc && !row.tcOnly);
  let hint;
  // TC-ONLY-2c: one clear message per case (no "No TC is linked" next to "has no email address")
  const noEmail = (row.tcs || []).map(nameOf).filter(Boolean);
  if (!hasTc && noEmail.length) {
    const who = `Their linked TC, ${joinNames(noEmail)}, ${noEmail.length > 1 ? 'have' : 'has'} no email address`;
    hint = row.tcOnly ? `${who}, so emails and alerts for this agent are held. Add the TC's email on Contacts, or untick the box.` : `${who}. Add the TC's email on Contacts first.`;
  } else if (!hasTc) {
    // FF-108 (Francis, Nov 23 2026): plainer greyed-out text that names the agent. When that side's coordinator is on the file
    // but not linked to this agent, say so (linking is what lets the box be ticked).
    const agent = String(agentName || '').trim() || 'this agent';
    const onFile = (sideTcNames || []).map((x) => String(x || '').trim()).filter(Boolean);
    if (row.tcOnly) hint = `No TC is linked on this side now, so emails to this agent are held. Add a ${TC_ROLE[role]} for ${agent} on Contacts, or untick the box.`;
    else if (onFile.length) hint = `${joinNames(onFile)} ${onFile.length > 1 ? 'are' : 'is'} on this file as ${TC_ROLE[role]} but not linked to ${agent}. Link them as ${agent}'s transaction coordinator on ${agent}'s contact record first to use this.`;
    else hint = `Add a ${TC_ROLE[role]} for ${agent} first to use this.`;
  } else {
    // TC-ONLY-2c: when no TC has a login, only typed emails (and the few automatic ones) reach them, so the opening line says so
    const what = allNoLogin(row.tcs) ? `emails staff type, and ${STILL_SENT},` : 'emails and alerts';
    hint = (row.tcOnly ? `${what[0].toUpperCase()}${what.slice(1)} for this agent go to ${joinNames(names)} instead.` : `When ticked, ${what} for this agent go to ${joinNames(names)} instead.`) + noLoginLine(row.tcs, 'box')
    // TC-ONLY-3 (Francis, Nov 23 2026): fee change and title commitment notices go to both
    hint += ` Fee change and title commitment notices go to both ${agentName ? String(agentName).trim() : 'the agent'} and the TC.`;
  }
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
    out.push(names.length ? { kind: 'redirect', email, text: `${who} has ${TC_ONLY_LABEL} on. This email goes to their TC, ${joinNames(names)}, instead.${noLoginLine(r.tcs, 'typed')}` }
      : { kind: 'held', email, text: `${who} has ${TC_ONLY_LABEL} on, but ${(r.tcs || []).length ? 'their linked TC has no email address' : 'no TC is linked on that side'}. The email can't be sent to them: remove them, or ${(r.tcs || []).length ? "add the TC's email" : 'add their TC'} on Contacts.` });
  }
  return out;
}
// one note for one Email sellers and agents preview message
export function tcOnlyPreviewNote(rows, participantId) {
  const r = (rows instanceof Map ? rows : tcOnlyMap(rows)).get(participantId);
  if (!r || !r.tcOnly) return '';
  const names = tcNames(r.tcs);
  return names.length ? `${TC_ONLY_LABEL} is on for this agent: this email goes to their TC, ${joinNames(names)}, instead.${noLoginLine(r.tcs, 'typed')}`
    : `${TC_ONLY_LABEL} is on for this agent, but ${(r.tcs || []).length ? 'their linked TC has no email address' : 'no TC is linked on that side'}, so this email is held and not sent.`;
}
