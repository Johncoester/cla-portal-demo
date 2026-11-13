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
