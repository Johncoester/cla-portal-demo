/* In-portal message. The caller must already be allowed on the file.
 * This does not send email and does not add a recipient who is not on the allowed list. */
import { sanitizeMessageHtml, htmlToText } from './agent-portal.js?v=202611191300';

export function messageText(html) {
  const clean = sanitizeMessageHtml(html || '');
  const text = htmlToText(clean).slice(0, 4000);
  return { clean, text };
}

export function assertRecipients(to, allowedIds) {
  const ids = [...new Set((to || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!ids.length) throw new Error('Pick who to send it to.');
  const allowed = new Set(allowedIds || []);
  if (ids.some((id) => !allowed.has(id))) throw new Error('You can message CLA Title staff and people on your own side of this order only.');
  return ids;
}
