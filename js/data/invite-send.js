/* Portal invites email themselves (John, Nov 9: "I want the portal to send it ... just like what staff gets / agents gets").
 * After staff create or Resend an invite (agent, buyer / seller, or HR staff), the page asks gmail-send to email it from the inviter's own
 * connected @clatitle.com Gmail. If it was not sent (Gmail not connected, Live Test address rule, Google error) the copy link stays on screen
 * with the reason. Nothing here sends by itself; api.sendInviteEmail does, and it never throws. */
import { html } from '../ui.js?v=202611070139';
export const tokenOfLink = (link) => { const m = /#\/(?:agent-invite|hr-invite)\/([0-9a-f]{64})$/.exec(String(link || '')); return m ? m[1] : ''; };
/* The hosted role check answers gmail-send with this and never reaches Google. The dialog has to show this reason. */
export const E2E_INVITE_HOLD = { sent: false, error: 'E2E checked the copy link only.' };
// where a staff member makes a fresh link for each kind of invite (used in the reasons below)
const REMAKE = { agent: 'use Resend on Agent Invites', hr: "use Make a new invite link on the employee's HR page" };
// Nov 9 6:04 PM (John's first live try): a tab opened BEFORE the update had the old data layer (no sendInviteEmail) but loaded the new page,
// so nothing was even tried and the page said only "could not be emailed". Each case now says what happened and what to do.
export async function autoSendInvite(api, kind, link) {
  const again = REMAKE[kind] || REMAKE.agent;
  if (!api || typeof api.sendInviteEmail !== 'function') {
    return { sent: false, stale: true, error: `The portal was updated while this page was open, so this invite was not emailed. Reload the page (Ctrl+Shift+R), then ${again} to email it` };
  }
  const token = tokenOfLink(link);
  if (!token) return { sent: false, error: `The invite link was not in the expected form, so it was not emailed. ${again[0].toUpperCase()}${again.slice(1)} to make a new link` };
  return api.sendInviteEmail({ kind, token });
}
// one sentence, one period (the server's reasons already end in one)
const reason = (e) => String(e || '').trim().replace(/[.\s]+$/, '');
// the line shown above the copy link
export function inviteSendNotice(r = {}) {
  if (r.sent) return html`<p class="notice ok" data-invite-sent="yes">Emailed to <strong>${r.to}</strong> from your Gmail${r.from ? html` (${r.from})` : ''}. You can still copy the link below.</p>`;
  if (r.connectGmail) return html`<p class="notice warn" data-invite-sent="connect">Not emailed. <a href="#/profile">Connect Gmail to send automatically</a> (Profile Setting &gt; Gmail).${reason(r.error) ? html` ${reason(r.error)}.` : ''} Copy the link below and send it yourself for now.</p>`;
  const why = reason(r.error);
  return html`<p class="notice warn" data-invite-sent="${r.stale ? 'stale' : 'no'}">Not emailed${why ? html`: ${why}` : ''}.${r.noLink ? '' : ' Until then you can copy the link below and send it yourself.'}</p>`;
}
export const inviteToast = (r = {}) => (r.sent ? `Invite emailed to ${r.to}` : 'Invite link made (not emailed)');
