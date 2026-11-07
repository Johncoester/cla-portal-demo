/* Reviewable agent-invite draft. Nothing here sends mail or turns sending on. */
export const INVITE_DELIVERY = 'Email delivery is paused. This draft is for review only and was not sent.';

export function agentInviteDraft({ firstName = '', lastName = '', email = '', link = '', expiresAt = '', fileNumber = '' } = {}) {
  const to = String(email || '').trim();
  const name = [firstName, lastName].filter(Boolean).join(' ') || 'there';
  const file = fileNumber ? ` for file ${fileNumber}` : '';
  const when = expiresAt ? ` The link stops working after ${expiresAt}.` : '';
  return {
    to,
    subject: 'Your CLA portal invite',
    body: `Hi ${name}, CLA Title & Escrow invited you to the portal${file}. Open this one-time link to set up your login: ${link || '(link not ready)'}.${when} This message was not sent.`,
    link: link || '',
    status: 'draft',
    sent: false,
    delivery: INVITE_DELIVERY,
  };
}
