/* [SUPABASE] Agent invites, agent profiles and the "Your agent" card (migration 41). Same names / shapes as mock-part-agent-invite.js.
 * NOT run against a hosted project (best effort; the mock adapter is the tested one). NOTHING IS SENT: the invite RPC returns the token and the page
 * shows the link. Photos go to the private 'agent-photos' bucket at <uid>/avatar.jpg and are shown through short-lived signed URLs. */
import { cleanAgentProfile, canInviteAgents, cardOf } from './agent-profile.js?v=202611140100';
import { acceptInviteRemote } from './accept-invite-client.js?v=202611070139';
const inv = (r) => ({ id: r.id, contactId: r.contact_id, dealId: r.deal_id, firstName: r.first_name, lastName: r.last_name, email: r.email, status: r.status === 'pending' && r.expires_at < new Date().toISOString() ? 'expired' : r.status,
  createdAt: r.created_at, expiresAt: r.expires_at, acceptedAt: r.accepted_at, revokedAt: r.revoked_at, resentCount: r.resent_count || 0, inviteKind: r.invite_kind || 'agent', sentAt: r.sent_at || null, sentTo: r.sent_to || '', sendCount: r.send_count || 0, sendError: r.send_error || '', createdByName: '' });
export function agentInviteSupabase({ sb, ok, me }) {
  const signed = async (path) => { if (!path) return ''; const r = await sb.storage.from('agent-photos').createSignedUrl(path, 3600); return (r.data && r.data.signedUrl) || ''; };
  const upload = async (uid, dataUrl) => { if (!dataUrl || !/^data:image\/jpeg/.test(dataUrl)) return undefined; const blob = await (await fetch(dataUrl)).blob(); const path = `${uid}/avatar.jpg`;
    ok(await sb.storage.from('agent-photos').upload(path, blob, { upsert: true, contentType: 'image/jpeg' })); return path; };
  const toJson = (v, photoPath) => { const o = { ...v }; delete o.photo; if (photoPath !== undefined) o.photoPath = photoPath; return o; };
  return {
    async listAgentInvites({ status = '' } = {}) { const u = await me(); if (!canInviteAgents(u)) throw new Error('Only CLA staff can invite people to the portal.');
      return (ok(await sb.from('agent_invites').select('*').order('created_at', { ascending: false })) || []).map(inv).filter((r) => !status || r.status === status); },
    async listAgentInviteCandidates() { const rows = ok(await sb.from('contacts').select('id,first_name,last_name,email,company,profile_id,contact_type').eq('contact_type', 'realtor')) || [];
      return rows.map((c) => ({ contactId: c.id, firstName: c.first_name, lastName: c.last_name, email: c.email, company: c.company, hasLogin: !!c.profile_id, pendingInviteId: null, files: [] })); },
    async createAgentInvite(i = {}) { const r = (ok(await sb.rpc('create_agent_invite', { p_contact: i.contactId || null, p_first: i.firstName || null, p_last: i.lastName || null, p_email: i.email || null, p_deal: i.dealId || null })) || [])[0];
      return { id: r.invite_id, status: 'pending', firstName: i.firstName || '', lastName: i.lastName || '', email: i.email || '', expiresAt: r.expires_at, link: '#/agent-invite/' + r.token, sent: false }; },
    // File Contacts tab (Nov 9): buyers, sellers and agents on a file (migration 20261109233000_portal_invite_clients). Nothing is sent.
    async createPortalInvite({ dealId = null, contactId = null, email = '' } = {}) {
      const r = (ok(await sb.rpc('create_portal_invite', { p_deal: dealId, p_contact: contactId, p_email: String(email || '').trim() || null })) || [])[0];
      if (!r) throw new Error('The invite was not created. Try again.');
      return { id: r.invite_id, status: 'pending', inviteKind: r.invite_kind, firstName: r.first_name, lastName: r.last_name, email: r.email, expiresAt: r.expires_at, link: '#/agent-invite/' + r.token, sent: false }; },
    async inviteAfterEmailChange({ dealId = null, contactId = null } = {}) {
      const r = (ok(await sb.rpc('invite_after_email_change', { p_deal: dealId, p_contact: contactId })) || [])[0];
      if (!r) throw new Error('The invite was not created. Try again.');
      return { id: r.invite_id, status: 'pending', inviteKind: r.invite_kind, firstName: r.first_name, lastName: r.last_name, email: r.email, expiresAt: r.expires_at, link: '#/agent-invite/' + r.token, sent: false }; },
    async resendAgentInvite(id) { const r = (ok(await sb.rpc('resend_agent_invite', { p_invite: id })) || [])[0]; return { id, status: 'pending', expiresAt: r.expires_at, link: '#/agent-invite/' + r.token, resentCount: 1, sent: false }; },
    async revokeAgentInvite(id) { ok(await sb.rpc('revoke_agent_invite', { p_invite: id })); return { id, status: 'revoked' }; },
    async getAgentInvite(token) { let res = await sb.rpc('portal_invite_lookup', { p_token: token });
      if (res.error && /portal_invite_lookup|PGRST202|42883/i.test(String(res.error.code || '') + ' ' + String(res.error.message || ''))) res = await sb.rpc('agent_invite_lookup', { p_token: token });   // before the Nov 9 migration
      const r = (ok(res) || [])[0] || { status: 'invalid' };
      return { status: r.status, inviteKind: r.invite_kind || 'agent', firstName: r.first_name || '', lastName: r.last_name || '', email: r.email || '', expiresAt: r.expires_at, cellPhone: '', brokerage: '' }; },
    // Public sign-up stays off. The edge function creates the login from the invite email, then this signs in and stores the picture.
    async acceptAgentInvite(token, form) { const v = cleanAgentProfile(form); const password = String((form && form.password) || ''); if (password.length < 8) throw new Error('Password must be at least 8 characters.');
      const profile = { ...v }; delete profile.photo; await acceptInviteRemote(sb, { kind: 'agent', token, password, profile });
      const signed = await sb.auth.signInWithPassword({ email: v.email, password }); if (signed.error) throw new Error('Your login was created. Sign in with the invited email and the password you just chose.');
      const uid = signed.data && signed.data.user && signed.data.user.id; const path = uid ? await upload(uid, v.photo) : undefined; if (path) ok(await sb.rpc('update_my_agent_profile', { p: { photoPath: path } })); return this.getMyAgentProfile(); },
    async getMyAgentProfile() { const u = await me(); const a = ok(await sb.from('agent_profiles').select('*').eq('profile_id', u.id).maybeSingle()); if (!a) return null;
      const b = ok(await sb.from('agent_private').select('birth_month,birth_day,birthdate').eq('profile_id', u.id).maybeSingle()) || {};
      return { profileId: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email, cellPhone: a.cell_phone, officePhone: a.office_phone, brokerage: a.brokerage, licenseNumber: a.license_number, street: a.street, city: a.city, state: a.state, zip: a.zip,
        otherContact: a.other_contact, photo: await signed(a.photo_path), photoShape: a.photo_shape, birthMonth: b.birth_month || (b.birthdate ? Number(b.birthdate.slice(5, 7)) : null), birthDay: b.birth_day || (b.birthdate ? Number(b.birthdate.slice(8, 10)) : null) }; },
    async updateMyAgentProfile(patch = {}) { const u = await me(); const p = { ...patch }; delete p.email; const v = cleanAgentProfile(p, { partial: true });
      const keep = typeof v.photo === 'string' && !/^data:image\/jpeg/.test(v.photo); const path = v.photo === null ? '' : keep ? undefined : await upload(u.id, v.photo);
      ok(await sb.rpc('update_my_agent_profile', { p: toJson(v, path) })); return this.getMyAgentProfile(); },
    async listMyAgents({ dealId = null } = {}) { const rows = ok(await sb.rpc('my_agents', { p_deal: dealId })) || [];
      return Promise.all(rows.map(async (r) => cardOf({ agentId: r.agent_contact, firstName: r.first_name, lastName: r.last_name, brokerage: r.brokerage, cellPhone: r.cell_phone, email: r.email, officePhone: r.office_phone, photo: await signed(r.photo_path), photoShape: r.photo_shape, side: r.side, dealIds: r.deal_ids || [] }))); },
  };
}
