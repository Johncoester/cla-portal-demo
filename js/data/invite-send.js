/* Portal invites email themselves (John, Nov 9: "I want the portal to send it ... just like what staff gets / agents gets").
 * After staff create or Resend an invite (agent, buyer / seller, or HR staff), the page asks gmail-send to email it from the inviter's own
 * connected @clatitle.com Gmail. If it was not sent (Gmail not connected, Live Test address rule, Google error) the copy link stays on screen
 * with the reason. Nothing here sends by itself; api.sendInviteEmail does, and it never throws. */
import { html } from '../ui.js?v=202611070139';
export const tokenOfLink = (link) => { const m = /#\/(?:agent-invite|hr-invite)\/([0-9a-f]{64})$/.exec(String(link || '')); return m ? m[1] : ''; };
export async function autoSendInvite(api, kind, link) {
  const token = tokenOfLink(link);
  if (!token || typeof api.sendInviteEmail !== 'function') return { sent: false, error: 'This invite could not be emailed. Copy the link instead.' };
  return api.sendInviteEmail({ kind, token });
}
// the line shown above the copy link
export function inviteSendNotice(r = {}) {
  if (r.sent) return html`<p class="notice ok" data-invite-sent="yes">Emailed to <strong>${r.to}</strong> from your Gmail${r.from ? html` (${r.from})` : ''}. You can still copy the link below.</p>`;
  if (r.connectGmail) return html`<p class="notice warn" data-invite-sent="connect">Not emailed. <a href="#/profile">Connect Gmail to send automatically</a> (Profile Setting &gt; Gmail). ${r.error} Copy the link below and send it yourself for now.</p>`;
  return html`<p class="notice warn" data-invite-sent="no">Not emailed${r.error ? html`: ${r.error}` : ''}. Copy the link below and send it yourself.</p>`;
}
export const inviteToast = (r = {}) => (r.sent ? `Invite emailed to ${r.to}` : 'Invite link made (not emailed)');
