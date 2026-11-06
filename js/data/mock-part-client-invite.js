// Mock buyer / seller invites. The raw token is returned once and is not stored.
// Nothing is emailed. Accepting never changes a staff role or isAdmin.
import { LOCK_KEY } from './locked-links.js?v=202611061842';
import { canInviteClients, clientInviteStatus, sha256Hex, newInviteToken, CLIENT_PORTAL_ROLES, CLIENT_INVITE_DAYS, CLIENT_INVITE_GENERIC } from './client-invite.js?v=202611061842';

const plusDays = (iso, n) => new Date(Date.parse(iso) + n * 864e5).toISOString();
const claimed = new Set();

export function ensureClientInvites(d) {
  if (!Array.isArray(d.clientInvites)) d.clientInvites = [];
  return d;
}

export function clientInvitePart(x) {
  const { load, save, nid, needUser, fail, dealsFor, now, sess, log } = x;
  const db = () => ensureClientInvites(load());
  const blocked = () => {
    try { if (sess.getItem(LOCK_KEY)) return true; } catch (e) { /* storage off */ }
    return false;
  };
  const actor = (dealId) => {
    const u = needUser();
    if (blocked() || u.isDemo) fail('A demo or view-as session cannot invite a real person.');
    if (!canInviteClients(u)) fail('Only a processor or admin on this file can invite a buyer or seller.');
    if (!dealsFor(u).some((d) => d.id === dealId)) fail('Order not found.');
    return u;
  };
  const party = (dealId, contactId) => db().participants.find((p) => p.dealId === dealId && p.contactId === contactId && CLIENT_PORTAL_ROLES.includes(p.role) && !p.removed);
  const contact = (id) => db().contacts.find((c) => c.id === id);
  const statusOf = (inv) => clientInviteStatus(inv, now());
  const row = (inv) => ({ id: inv.id, contactId: inv.contactId, dealId: inv.dealId, role: inv.role, email: inv.email, firstName: inv.firstName, lastName: inv.lastName, status: statusOf(inv), expiresAt: inv.expiresAt, acceptedAt: inv.acceptedAt, revokedAt: inv.revokedAt, sent: false });
  const byHash = async (token) => {
    const hash = await sha256Hex(String(token || '').trim().toLowerCase());
    return db().clientInvites.find((i) => i.tokenHash && i.tokenHash === hash) || null;
  };
  const staffEmail = (email) => db().profiles.some((p) => p.status === 'active' && p.email === email && (p.role !== 'Outside user' || p.isAdmin));
  const outsideEmail = (email) => db().profiles.find((p) => p.status === 'active' && p.email === email && p.role === 'Outside user' && !p.isAdmin) || null;

  return {
    async listClientInvites(dealId) {
      const u = actor(dealId);
      return db().clientInvites.filter((i) => i.dealId === dealId).map(row).sort((a, b) => String(b.expiresAt).localeCompare(String(a.expiresAt)));
    },
    async createClientInvite({ dealId, contactId } = {}) {
      const u = actor(dealId);
      const c = contact(contactId) || fail('Contact not found.');
      const p = party(dealId, contactId) || fail('This contact is not a buyer or seller on this file.');
      const email = String(c.email || '').trim().toLowerCase();
      if (!email) fail('Add an email on the contact before inviting them.');
      if (c.profileId) fail('This person already has a portal login.');
      if (staffEmail(email)) fail('This email belongs to a staff login and cannot be invited as a buyer or seller.');
      if (db().clientInvites.some((i) => i.contactId === contactId && statusOf(i) === 'pending')) fail('An invite is already waiting. Create a new link to retire the old one, or revoke it.');
      const token = newInviteToken();
      const tokenHash = await sha256Hex(token);
      const inv = { id: nid('ci'), tokenHash, contactId, dealId, role: p.role, email, firstName: c.firstName, lastName: c.lastName, phone: c.phone || '', expiresAt: plusDays(now(), CLIENT_INVITE_DAYS), createdBy: u.id, createdAt: now(), acceptedAt: null, acceptedProfileId: null, revokedAt: null, revokedBy: null };
      db().clientInvites.push(inv);
      log(dealId, u.id, 'client_invite.created', 'contact', contactId, p.role === 'Client-Seller' ? 'Seller invited to the portal. The link is shown once. Nothing is emailed.' : 'Buyer invited to the portal. The link is shown once. Nothing is emailed.');
      save();
      return { id: inv.id, link: '#/client-invite/' + token, expiresAt: inv.expiresAt, sent: false };
    },
    async revokeClientInvite(id) {
      const inv = db().clientInvites.find((i) => i.id === id) || fail(CLIENT_INVITE_GENERIC);
      const u = actor(inv.dealId);
      if (statusOf(inv) !== 'pending') fail(CLIENT_INVITE_GENERIC);
      inv.revokedAt = now(); inv.revokedBy = u.id; inv.tokenHash = null;
      log(inv.dealId, u.id, 'client_invite.revoked', 'contact', inv.contactId, 'Portal invite revoked. Nothing is emailed.');
      save();
      return { id, status: 'revoked', sent: false };
    },
    async regenerateClientInvite(id) {
      const inv = db().clientInvites.find((i) => i.id === id) || fail(CLIENT_INVITE_GENERIC);
      const u = actor(inv.dealId);
      if (statusOf(inv) !== 'pending') fail(CLIENT_INVITE_GENERIC);
      const token = newInviteToken();
      inv.tokenHash = await sha256Hex(token);
      inv.expiresAt = plusDays(now(), CLIENT_INVITE_DAYS);
      log(inv.dealId, u.id, 'client_invite.regenerated', 'contact', inv.contactId, 'A new portal link replaced the old one. Nothing is emailed.');
      save();
      return { id, link: '#/client-invite/' + token, expiresAt: inv.expiresAt, sent: false };
    },
    async getClientInvite(token) {
      const inv = await byHash(token);
      const st = inv ? statusOf(inv) : 'invalid';
      if (!inv || st === 'invalid') return { status: 'invalid', firstName: '', lastName: '', email: '', role: '', expiresAt: null, hasAccount: false };
      const hasAccount = st === 'pending' && !!outsideEmail(inv.email);
      return { status: st, firstName: inv.firstName, lastName: inv.lastName, email: inv.email, role: inv.role, expiresAt: inv.expiresAt, hasAccount };
    },
    async acceptClientInvite(token, opts = {}) {
      const inv = await byHash(token);
      if (!inv || statusOf(inv) !== 'pending') fail(CLIENT_INVITE_GENERIC);
      if (opts.email && String(opts.email).trim().toLowerCase() !== inv.email) fail('Use the invited email.');
      if (claimed.has(inv.id)) fail(CLIENT_INVITE_GENERIC);
      claimed.add(inv.id);
      try {
        const d = db();
        const c = contact(inv.contactId) || fail(CLIENT_INVITE_GENERIC);
        if (String(c.email || '').trim().toLowerCase() !== inv.email) fail(CLIENT_INVITE_GENERIC);
        if (c.profileId && (!opts.existing || c.profileId !== (needUser() || {}).id)) fail(CLIENT_INVITE_GENERIC);
        let profileId;
        if (opts.existing) {
          const u = needUser();
          if (u.role !== 'Outside user' || u.isAdmin || (u.status || 'active') !== 'active' || String(u.email || '').toLowerCase() !== inv.email) fail(CLIENT_INVITE_GENERIC);
          profileId = u.id;
        } else {
          if (d.profiles.some((p) => p.email === inv.email && p.status !== 'removed')) fail(CLIENT_INVITE_GENERIC);
          profileId = nid('u');
          d.profiles.push({ id: profileId, email: inv.email, firstName: inv.firstName, lastName: inv.lastName, phone: '', role: 'Outside user', isAdmin: false, isDemo: false, status: 'active', createdAt: now() });
          sess.setItem(x.SESSION_KEY, profileId);
        }
        c.profileId = profileId;
        inv.acceptedAt = now();
        inv.acceptedProfileId = profileId;
        inv.tokenHash = null;
        log(inv.dealId, profileId, 'client_invite.accepted', 'contact', inv.contactId, 'Portal login linked for this buyer or seller. Nothing was emailed.');
        save();
        return x.me ? x.me() : d.profiles.find((p) => p.id === profileId);
      } finally {
        claimed.delete(inv.id);
      }
    },
  };
}
