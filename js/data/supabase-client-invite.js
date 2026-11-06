// Buyer / seller invites for Supabase mode. The RPCs live in the unapplied migration
// 20261106190000_client_portal_invites.sql. This file does not connect by itself and does not send email.
import { canInviteClients, CLIENT_INVITE_GENERIC } from './client-invite.js?v=202611061842';
import { acceptInviteRemote } from './accept-invite-client.js?v=202611061842';

const shape = (r) => ({
  id: r.id, contactId: r.contact_id, dealId: r.deal_id, role: r.role, email: r.email, firstName: r.first_name, lastName: r.last_name,
  status: r.accepted_at ? 'accepted' : r.revoked_at ? 'revoked' : (r.expires_at && r.expires_at < new Date().toISOString() ? 'expired' : 'pending'),
  expiresAt: r.expires_at, acceptedAt: r.accepted_at, revokedAt: r.revoked_at, sent: false,
});

export function clientInviteSupabase({ sb, ok, me }) {
  return {
    async listClientInvites(dealId) {
      const u = await me();
      if (!canInviteClients(u)) throw new Error('Only a processor or admin on this file can invite a buyer or seller.');
      return (ok(await sb.from('client_invites').select('id,contact_id,deal_id,role,email,first_name,last_name,expires_at,accepted_at,revoked_at,created_at').eq('deal_id', dealId)) || []).map(shape);
    },
    async createClientInvite({ dealId, contactId } = {}) {
      const r = (ok(await sb.rpc('create_client_invite', { p_deal: dealId, p_contact: contactId })) || [])[0] || {};
      return { id: r.invite_id, link: '#/client-invite/' + r.token, expiresAt: r.expires_at, sent: false };
    },
    async revokeClientInvite(id) {
      ok(await sb.rpc('revoke_client_invite', { p_invite: id }));
      return { id, status: 'revoked', sent: false };
    },
    async regenerateClientInvite(id) {
      const r = (ok(await sb.rpc('regenerate_client_invite', { p_invite: id })) || [])[0] || {};
      return { id, link: '#/client-invite/' + r.token, expiresAt: r.expires_at, sent: false };
    },
    async getClientInvite(token) {
      const r = (ok(await sb.rpc('client_invite_lookup', { p_token: token })) || [])[0] || { status: 'invalid' };
      return { status: r.status || 'invalid', firstName: r.first_name || '', lastName: r.last_name || '', email: r.email || '', role: r.role || '', expiresAt: r.expires_at || null, hasAccount: !!r.has_account };
    },
    async acceptClientInvite(token, opts = {}) {
      const looked = await this.getClientInvite(token);
      if (looked.status !== 'pending') throw new Error(CLIENT_INVITE_GENERIC);
      if (opts.existing) {
        const { data } = await sb.auth.getSession();
        const jwt = data && data.session && data.session.access_token;
        if (!jwt) throw new Error('Sign in with the invited email first.');
        await acceptInviteRemote(sb, { kind: 'client', token, existing: true }, { userJwt: jwt });
        return me();
      }
      if (opts.email && looked.email && String(opts.email).trim().toLowerCase() !== String(looked.email).toLowerCase()) throw new Error('Use the invited email.');
      const password = String(opts.password || '');
      if (password.length < 8) throw new Error('Password must be at least 8 characters.');
      await acceptInviteRemote(sb, { kind: 'client', token, password });
      const signed = await sb.auth.signInWithPassword({ email: looked.email, password });
      if (signed.error) throw new Error('Your login was created. Sign in with the invited email and the password you just chose.');
      return me();
    },
  };
}
