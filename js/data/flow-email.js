/* EMAIL STEP in Task Builder (TB-7, John, Nov 20 2026; spec docs/specs/task-builder.md "TB-7").
 * A flow step that emails a party on the file: a saved file email template (Admin > Email Templates) or a message written on the step,
 * with the same {{merge fields}} as file templates ({{buyer_first_name}}, {{property_address}} ...). Example (John): file closed, wait 2
 * days, "Hi {{buyer_first_name}}, thank you so much for closing on {{property_address}}. Enjoy your new home."
 * Sending: emails are queued in the outbox like every portal email; they go out once the portal's mail switch is on. Flows start Off, so
 * nothing is sent until an Admin turns the flow on (John: "I'll test it and turn it on when I feel ready").
 * TEST COPY (John): "Try on one file" fills in that file's real names and address but sends the email ONLY to the admin trying it.
 * Mirrored in SQL: migration 20261127010000_task_flow_email_step.sql. Pure: no adapter, no DOM. */
import { FILE_TEMPLATE_FIELD_KEYS, mergeValues, renderMerge } from './file-email-templates.js?v=202611247700';

export const EMAIL_ROLES = [['Client-Buyer', 'Buyer'], ['Client-Seller', 'Seller'], ['Buyer Agent', "Buyer's agent"], ['Listing Agent', 'Listing agent'],
  ['non_referring_agents', "Agents who didn't refer the file"], ['Transaction Coordinator', 'Transaction coordinator'], ['Lender', 'Lender']];
const roleName = (r) => (r === 'non_referring_agents' ? 'non-referring agent' : (EMAIL_ROLES.find(([v]) => v === r) || [r, r])[1]);
export const emailRoleName = roleName;

/* NON-REFERRING AGENTS (John, Nov 21 2026): "if a non-referring agent is on a deal, I want to introduce myself as the owner of the company".
 * The file's Source of business (the referral field) says who sent the order: e.g. "buyer_agent:<contact id>" or "listing_agent".
 * The non-referring agents are the buyer's and listing agents on the file except that one. When the source names an agent side but no
 * person, every agent on that side counts as referring. When the source is not an agent (the buyer, a lender, a lead source, or blank),
 * every agent on the file is non-referring. participants: [{ role, contactId }]. Same rule in SQL: private.task_flow_is_recipient. */
export const AGENT_ROLES = ['Buyer Agent', 'Listing Agent'];
const SIDE_ROLE = { buyer_agent: 'Buyer Agent', listing_agent: 'Listing Agent' };
export function isNonReferringAgent(p, source) {
  if (!p || !AGENT_ROLES.includes(p.role)) return false;
  const raw = String(source || '').trim(); const cut = raw.indexOf(':');
  const code = cut === -1 ? raw : raw.slice(0, cut); const who = cut === -1 ? '' : raw.slice(cut + 1);
  if (!SIDE_ROLE[code]) return true;
  if (who) return String(p.contactId || '') !== who;
  return p.role !== SIDE_ROLE[code];
}
// who an email step goes to: everyone on the file with that role, or the non-referring agents
export const emailRecipients = (participants, sendTo, source) => (participants || []).filter((p) => (sendTo === 'non_referring_agents' ? isNonReferringAgent(p, source) : p.role === sendTo));
export const EMAIL_SUBJECT_MAX = 200;
export const EMAIL_BODY_MAX = 5000;
const TOKEN_RE = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;
export const unknownTokens = (s) => [...String(s || '').matchAll(TOKEN_RE)].map((m) => m[1].toLowerCase()).filter((k) => !FILE_TEMPLATE_FIELD_KEYS.includes(k));

// Check one "Send an email" step. A saved template (templateId) or a written subject and message. Throws plain words.
export function cleanEmailStep(s = {}, n = 'Step') {
  if (!EMAIL_ROLES.some(([v]) => v === s.sendTo)) throw new Error(`${n}: choose who the email goes to.`);
  const templateId = String(s.templateId || '').trim();
  if (templateId) {
    if (!/^[A-Za-z0-9-]{1,64}$/.test(templateId)) throw new Error(`${n}: choose a saved template, or write the email.`);
    return { type: 'send_email', sendTo: s.sendTo, templateId, templateName: String(s.templateName || '').trim().slice(0, 120) };
  }
  const subject = String(s.subject == null ? '' : s.subject).replace(/\s+/g, ' ').trim();
  const body = String(s.body == null ? '' : s.body).replace(/\r\n/g, '\n').trim();
  if (subject.length < 3) throw new Error(`${n}: give the email a subject (at least 3 characters), or choose a saved template.`);
  if (subject.length > EMAIL_SUBJECT_MAX) throw new Error(`${n}: the subject is too long. Use ${EMAIL_SUBJECT_MAX} characters or fewer.`);
  if (body.length < 3) throw new Error(`${n}: write the message (at least 3 characters).`);
  if (body.length > EMAIL_BODY_MAX) throw new Error(`${n}: the message is too long. Use ${EMAIL_BODY_MAX} characters or fewer.`);
  const bad = [...new Set([...unknownTokens(subject), ...unknownTokens(body)])];
  if (bad.length) throw new Error(`${n}: {{${bad[0]}}} is not a merge field. Use one from the list, for example {{buyer_first_name}} or {{property_address}}.`);
  return { type: 'send_email', sendTo: s.sendTo, subject, body };
}

export function emailStepText(s) {
  const what = s.templateId ? `the "${s.templateName || 'saved'}" template` : `"${s.subject}"`;
  return `Email the ${roleName(s.sendTo).toLowerCase()}: ${what}`;
}

// A saved template's HTML as plain text (the outbox carries text).
export function htmlToText(h) {
  return String(h || '').replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6])\s*>/gi, '\n\n').replace(/<li[^>]*>/gi, '- ').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* The email for one person. deal: { fileNumber, street, city, state, zip, closingDate, purchasePrice, loanAmount, lenderName, processorName,
 * processorEmail, participants: [{ role, contact: { firstName, lastName, email } }] }. to: { email }. src: { subject, body } (text) or
 * { subject, bodyHtml } (a template). Returns { subject, body }. */
export function renderFlowEmail(deal, to, src, { today } = {}) {
  const values = mergeValues(deal, { name: deal.processorName || 'CLA Title & Escrow' }, { today, toEmails: [to.email] });
  const body = src.bodyHtml != null ? htmlToText(src.bodyHtml) : String(src.body || '');
  return { subject: renderMerge(src.subject, values, { mode: 'text' }).out.replace(/\s+/g, ' ').trim(), body: renderMerge(body, values, { mode: 'text' }).out };
}

// what a test copy looks like: the admin gets it, marked, and told who the real email would go to
export const testCopy = ({ subject, body }, realTo) => ({ subject: `[Test] ${subject}`,
  body: `This is a test copy from Task Builder "Try on one file". On a real run this email goes to: ${realTo}.\n\n----------\n\n${body}` });
