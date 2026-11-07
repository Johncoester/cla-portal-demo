// AGENT INVITE + ACCOUNT SETUP + "Your agent" card, mock adapter (John, Nov 4). FAKE DATA ONLY. Mirrored by migration 41 (SQL).
//  d.agentInvites  [{id, token, contactId, dealId, firstName, lastName, email, status: pending|accepted|revoked, expiresAt, resentCount, createdBy, createdAt,
//                    acceptedAt, acceptedProfileId, revokedAt, revokedBy}]   (no deletes: Revoke retires the row; Resend swaps the token)
//  d.agentProfiles {profileId: {cellPhone, officePhone, brokerage, licenseNumber, street, city, state, zip, otherContact, photo (data URL), photoShape, updatedAt}}
//  d.agentBirthMD  {profileId: 'MM-DD'}  (month / day only; kept apart like d.agentBirthdates, the existing optional birthdate it reuses)
// NOTHING IS SENT. createAgentInvite / resendAgentInvite return the one-time link path; the page shows it for staff to copy.
import { canInviteAgents, inviteStatus, INVITE_DAYS, cleanAgentProfile, monthDayFromBirthdate, initialsAvatar, cardOf } from './agent-profile.js?v=202611070139';
import { isClient, isAgent, isOutside, sideOf } from './constants.js?v=202611070139';
const rnd = () => { const a = new Uint8Array(16); (globalThis.crypto || { getRandomValues: (x) => x.map(() => Math.floor(Math.random() * 256)) }).getRandomValues(a); return [...a].map((b) => b.toString(16).padStart(2, '0')).join(''); };
const plusDays = (iso, n) => new Date(Date.parse(iso) + n * 864e5).toISOString();
// demo data (fake, lazily added once): Bianca + Larry accepted (placeholder initials avatars), Lena (deal-4 listing agent, no login yet) pending, one expired
export function ensureAgentInvites(d) {
  if (Array.isArray(d.agentInvites)) return d;
  d.agentInvites = []; d.agentProfiles = d.agentProfiles || {}; d.agentBirthMD = d.agentBirthMD || {};
  const base = { resentCount: 0, createdBy: 'u-proc', dealId: null, revokedAt: null, revokedBy: null };
  const acc = (id, pid, cid, dealId, extra) => { const p = d.profiles.find((x) => x.id === pid); if (!p) return;
    d.agentInvites.push({ ...base, id, token: 'demo-used-' + id, contactId: cid, dealId, firstName: p.firstName, lastName: p.lastName, email: p.email, status: 'accepted', createdAt: '2026-10-20T14:00:00Z', expiresAt: '2026-11-03T14:00:00Z', acceptedAt: '2026-10-21T16:30:00Z', acceptedProfileId: pid });
    d.agentProfiles[pid] = { cellPhone: p.phone, officePhone: '', brokerage: '', licenseNumber: '', street: '', city: '', state: '', zip: '', otherContact: '', photo: null, photoShape: 'circle', updatedAt: '2026-10-21T16:30:00Z', ...extra }; };
  acc('ai-1', 'u-bagent', 'c-bagent', 'deal-1', { brokerage: 'Harbor Realty (fake)', licenseNumber: 'FAKE-MD-0505', officePhone: '410-555-0150', city: 'Annapolis', state: 'MD', photo: initialsAvatar('Bianca', 'Buyer-Agent', '#89cff0'), photoShape: 'circle' });
  acc('ai-2', 'u-lagent', 'c-lagent', 'deal-1', { brokerage: 'Oak Street Realty (fake)', licenseNumber: 'FAKE-MD-0606', city: 'Rockville', state: 'MD', photo: initialsAvatar('Larry', 'Listing-Agent', '#bfe6f8'), photoShape: 'square' });
  const lena = d.contacts.find((c) => c.id === 'c-lena');
  if (lena) d.agentInvites.push({ ...base, id: 'ai-3', token: 'demo-lena-pending-0001', contactId: 'c-lena', dealId: 'deal-4', firstName: lena.firstName, lastName: lena.lastName, email: lena.email, status: 'pending', createdAt: '2026-11-03T15:00:00Z', expiresAt: '2026-11-17T15:00:00Z', acceptedAt: null, acceptedProfileId: null });
  d.agentInvites.push({ ...base, id: 'ai-4', token: 'demo-expired-0001', contactId: null, firstName: 'Evan', lastName: 'Example', email: 'evan.example@example.test', status: 'pending', createdAt: '2026-10-01T15:00:00Z', expiresAt: '2026-10-15T15:00:00Z', acceptedAt: null, acceptedProfileId: null });
  return d;
}
export function agentInvitePart(x) {
  const { load, save, nid, needUser, fail, prof, contactOf, dealsFor, clone, now, sess, SESSION_KEY, log } = x;
  const db = () => ensureAgentInvites(load());
  const needInviter = () => { const u = needUser(); if (!canInviteAgents(u)) fail('Only CLA staff (Processor, Sales Person, Sales Team, Admin) can invite agents.'); return u; };
  const linkOf = (inv) => '#/agent-invite/' + inv.token;
  const row = (inv, withLink) => { const st = inviteStatus(inv, now()); return { id: inv.id, contactId: inv.contactId, dealId: inv.dealId, fileNumber: ((db().deals.find((z) => z.id === inv.dealId) || {}).fileNumber) || '',
    firstName: inv.firstName, lastName: inv.lastName, email: inv.email, status: st, createdAt: inv.createdAt, createdByName: x.nameOf(inv.createdBy), expiresAt: inv.expiresAt, acceptedAt: inv.acceptedAt,
    revokedAt: inv.revokedAt, resentCount: inv.resentCount || 0, ...(withLink && st === 'pending' ? { link: linkOf(inv) } : {}) }; };
  const tcScope = () => true;   // TCs cannot invite at all (needInviter refuses them), so every inviter sees every invite
  const byToken = (t) => db().agentInvites.find((i) => i.token && i.token === String(t || ''));
  const mdOf = (pid) => { const d = db(); const v = d.agentBirthMD[pid]; if (v) { const [m, dd] = v.split('-').map(Number); return { birthMonth: m, birthDay: dd }; } return monthDayFromBirthdate((d.agentBirthdates || {})[pid]); };
  const fullProfile = (pid) => { const d = db(); const p = prof(pid); const a = d.agentProfiles[pid]; if (!p || !a) return null;
    return { profileId: pid, firstName: p.firstName, lastName: p.lastName, email: p.email, ...clone(a), ...mdOf(pid) }; };
  function writeProfile(pid, v) {
    const d = db(); const p = prof(pid); const a = d.agentProfiles[pid] || (d.agentProfiles[pid] = { cellPhone: '', officePhone: '', brokerage: '', licenseNumber: '', street: '', city: '', state: '', zip: '', otherContact: '', photo: null, photoShape: 'circle' });
    if (v.firstName != null) p.firstName = v.firstName; if (v.lastName != null) p.lastName = v.lastName; if (v.cellPhone != null) p.phone = v.cellPhone;
    for (const k of ['cellPhone', 'officePhone', 'brokerage', 'licenseNumber', 'street', 'city', 'state', 'zip', 'otherContact', 'photo', 'photoShape']) if (k in v) a[k] = v[k];
    a.updatedAt = now();
    if ('birthMonth' in v) { if (v.birthMonth) d.agentBirthMD[pid] = String(v.birthMonth).padStart(2, '0') + '-' + String(v.birthDay).padStart(2, '0'); else delete d.agentBirthMD[pid]; }
    const c = contactOf(pid); if (c) { c.firstName = p.firstName; c.lastName = p.lastName; c.phone = p.phone; if (a.brokerage) c.company = a.brokerage; if (!c.contactType) c.contactType = 'realtor'; }
  }
  return {
    // ---------- staff ----------
    async listAgentInvites({ status = '' } = {}) { const u = needInviter(); return db().agentInvites.filter((i) => tcScope(u, i)).map((i) => row(i, true)).filter((r) => !status || r.status === status)
      .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1)); },
    // contacts staff may invite (realtors, or anyone who is an agent on a file), each with their portal status
    async listAgentInviteCandidates() { const u = needInviter(); const d = db(); const seen = new Set(dealsFor(u).map((z) => z.id));
      const agentOn = (cid) => d.participants.filter((p) => p.contactId === cid && isAgent(p.role) && seen.has(p.dealId));
      return d.contacts.filter((c) => c.contactType === 'realtor' || agentOn(c.id).length).map((c) => {
        const p = c.profileId && prof(c.profileId); const pend = d.agentInvites.find((i) => i.contactId === c.id && inviteStatus(i, now()) === 'pending');
        return { contactId: c.id, firstName: c.firstName, lastName: c.lastName, email: c.email, company: c.company, hasLogin: !!(p && p.status === 'active'), pendingInviteId: pend ? pend.id : null,
          files: agentOn(c.id).map((q) => ({ dealId: q.dealId, role: q.role, fileNumber: (d.deals.find((z) => z.id === q.dealId) || {}).fileNumber })) }; }); },
    async createAgentInvite(input = {}) { const u = needInviter(); const d = db(); let { contactId = null, dealId = null } = input; let first, last, email;
      if (contactId) { const c = d.contacts.find((z) => z.id === contactId) || fail('Contact not found.');
        if (c.profileId && (prof(c.profileId) || {}).status === 'active') fail(`${c.firstName} ${c.lastName} already has a portal login.`);
        first = c.firstName; last = c.lastName; email = c.email; }
      else { first = String(input.firstName || '').trim(); last = String(input.lastName || '').trim(); email = String(input.email || '').trim(); }
      const v = cleanAgentProfile({ firstName: first, lastName: last, email, cellPhone: '301-555-0000' });   // name + email checked like the sign-up form (the agent adds the cell)
      if (d.profiles.some((p) => p.email.toLowerCase() === v.email && p.status === 'active')) fail('Someone with that email already has a portal login.');
      if (d.agentInvites.some((i) => i.email.toLowerCase() === v.email && inviteStatus(i, now()) === 'pending')) fail('There is already a pending invite for that email. Use Resend to make a new link.');
      if (dealId) { if (!dealsFor(u).some((z) => z.id === dealId)) fail('Order not found.'); } else dealId = null;
      const at = now(); const inv = { id: nid('inv'), token: rnd() + rnd(), contactId, dealId, firstName: v.firstName, lastName: v.lastName, email: v.email, status: 'pending', expiresAt: plusDays(at, INVITE_DAYS),
        resentCount: 0, createdBy: u.id, createdAt: at, acceptedAt: null, acceptedProfileId: null, revokedAt: null, revokedBy: null };
      d.agentInvites.push(inv); if (dealId) log(dealId, u.id, 'agent.invited', 'agent_invite', inv.id, `${v.firstName} ${v.lastName} invited to the portal (link shown, nothing sent)`); save();
      return { ...row(inv, true), sent: false }; },
    async resendAgentInvite(id) { const u = needInviter(); const inv = db().agentInvites.find((i) => i.id === id && tcScope(u, i)) || fail('Invite not found.');
      if (inv.status === 'accepted') fail('This invite was already accepted.'); if (inv.status === 'revoked') fail('This invite was revoked. Make a new invite instead.');
      if (db().profiles.some((p) => p.email.toLowerCase() === inv.email.toLowerCase() && p.status === 'active')) fail('Someone with that email already has a portal login.');
      inv.token = rnd() + rnd(); inv.expiresAt = plusDays(now(), INVITE_DAYS); inv.resentCount = (inv.resentCount || 0) + 1; save(); return { ...row(inv, true), sent: false }; },
    async revokeAgentInvite(id) { const u = needInviter(); const inv = db().agentInvites.find((i) => i.id === id && tcScope(u, i)) || fail('Invite not found.');
      if (inv.status === 'accepted') fail('This invite was already accepted. Disable the user instead (Admin).'); if (inv.status === 'revoked') fail('Already revoked.');
      inv.status = 'revoked'; inv.revokedAt = now(); inv.revokedBy = u.id; inv.token = null; save(); return row(inv, false); },
    async getAgentProfile(userId) { const u = needUser(); if (!(u.id === userId || canInviteAgents(u))) fail('Only the agent and CLA staff can see an agent profile.'); return fullProfile(userId); },
    // ---------- the agent (no sign-in needed to open the link) ----------
    async getAgentInvite(token) { const inv = byToken(token); const st = inviteStatus(inv, now());
      if (!inv) return { status: 'invalid' }; if (st !== 'pending') return { status: st };
      const c = inv.contactId && db().contacts.find((z) => z.id === inv.contactId);
      return { status: 'pending', firstName: inv.firstName, lastName: inv.lastName, email: inv.email, cellPhone: (c && c.phone) || '', brokerage: (c && c.company) || '', expiresAt: inv.expiresAt }; },
    async acceptAgentInvite(token, form = {}) { const d = db(); const inv = byToken(token); const st = inviteStatus(inv, now());
      if (st !== 'pending') fail(st === 'expired' ? 'This invite link has expired. Ask CLA Title for a new one.' : st === 'accepted' ? 'This invite was already used. Sign in instead.' : 'This invite link is not valid.');
      const v = cleanAgentProfile(form);
      if (d.profiles.some((p) => p.email.toLowerCase() === v.email && p.status !== 'removed')) fail('Someone with that email already has a portal login.');
      let c = inv.contactId && d.contacts.find((z) => z.id === inv.contactId);
      if (!c) { c = d.contacts.find((z) => !z.profileId && z.email && z.email.toLowerCase() === v.email); }
      if (!c) { c = { id: nid('c'), profileId: null, contactType: 'realtor', firstName: v.firstName, lastName: v.lastName, email: v.email, phone: v.cellPhone, company: v.brokerage || '', createdBy: inv.createdBy, createdAt: now() }; d.contacts.push(c); }
      const pid = nid('u'); d.profiles.push({ id: pid, email: v.email, firstName: v.firstName, lastName: v.lastName, phone: v.cellPhone, role: 'Outside user', isAdmin: false, status: 'active', createdAt: now(), createdBy: inv.createdBy });
      c.profileId = pid; c.email = v.email; writeProfile(pid, v);
      inv.status = 'accepted'; inv.acceptedAt = now(); inv.acceptedProfileId = pid; inv.token = null;
      if (inv.dealId) log(inv.dealId, pid, 'agent.joined', 'agent_invite', inv.id, `${v.firstName} ${v.lastName} set up their portal account`);
      save(); sess.setItem(SESSION_KEY, pid); return fullProfile(pid); },
    async getMyAgentProfile() { const u = needUser(); return fullProfile(u.id); },
    async updateMyAgentProfile(patch = {}) { const u = needUser(); if (!isOutside(u.role)) fail('Only agents have an agent profile.');
      const p = { ...patch }; delete p.email;   // the login email is changed by CLA Title (auth provider), not here
      const v = cleanAgentProfile(p, { partial: true }); writeProfile(u.id, v); save(); return fullProfile(u.id); },
    // ---------- the client: "Your agent" card ----------
    // A Client-Buyer gets the Buyer Agent(s) on their file, a Client-Seller the Listing Agent(s). Only the card fields (agent-profile.js CARD_FIELDS).
    async listMyAgents({ dealId = null } = {}) { const u = needUser(); if (!isOutside(u.role)) return []; const d = db(); const me = contactOf(u.id); if (!me) return [];
      const out = new Map();
      for (const deal of dealsFor(u)) { if (dealId && deal.id !== dealId) continue;
        const mine = d.participants.filter((p) => p.dealId === deal.id && p.contactId === me.id && isClient(p.role)).map((p) => p.role);
        for (const role of mine) { const want = role === 'Client-Buyer' ? 'Buyer Agent' : 'Listing Agent';
          for (const ap of d.participants.filter((p) => p.dealId === deal.id && p.role === want && p.contactId !== me.id)) {
            const c = d.contacts.find((z) => z.id === ap.contactId); if (!c) continue; const p = c.profileId && prof(c.profileId); if (p && p.status !== 'active') continue;
            const a = (p && d.agentProfiles[p.id]) || {}; const key = c.id; const prev = out.get(key);
            if (prev) { if (!prev.dealIds.includes(deal.id)) prev.dealIds.push(deal.id); continue; }
            out.set(key, cardOf({ agentId: c.id, firstName: p ? p.firstName : c.firstName, lastName: p ? p.lastName : c.lastName, brokerage: a.brokerage || c.company || '', cellPhone: a.cellPhone || c.phone || '',
              email: (p && p.email) || c.email || '', officePhone: a.officePhone || '', photo: a.photo || '', photoShape: a.photoShape || 'circle', side: sideOf(want), dealIds: [deal.id] })); } } }
      return [...out.values()]; },
  };
}
