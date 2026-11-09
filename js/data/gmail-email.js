/* Gmail phase 1 (John, Nov 9): page-side rules for sending email from a file through the user's own @clatitle.com Gmail.
 * The server (supabase/functions/_shared/gmail-core.mjs) decides; this only mirrors it so the page can explain before you press Send. */
export const GMAIL_ROLES = ['Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin'];
export const canUseGmail = (u) => !!u && !u.accountRole && u.role !== 'Outside user' && (GMAIL_ROLES.includes(u.role) || (!!u.isAdmin && u.role !== 'Employee'));
export const TEST_ALLOWLIST_NOTE = 'CLA Portal Live Test only sends to test addresses: clatestportal@gmail.com, clatestportal+anything@gmail.com, any @clatitle.com address, and jcoester-6jkr3p@mail.grokbot.com. Every other address is refused.';
export function isAllowedTestRecipient(addr) {
  const a = String(addr || '').trim().toLowerCase();
  if (!/^[a-z0-9._%+'-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,24}$/.test(a) || a.includes('..')) return false;
  if (a === 'clatestportal@gmail.com' || a === 'jcoester-6jkr3p@mail.grokbot.com') return true;
  if (/^clatestportal\+[a-z0-9._-]{1,64}@gmail\.com$/.test(a)) return true;
  return /^[a-z0-9._%+'-]+@clatitle\.com$/.test(a);
}
// "123 Main St, Rockville MD 20850" — comma after street only; empty parts omitted (John, Nov 9)
export function formatPropertyAddress(deal = {}) {
  const street = String(deal && deal.street || '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  const city = String(deal && deal.city || '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  const state = String(deal && deal.state || '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  const zip = String(deal && deal.zip || '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  const cityStateZip = [city, state, zip].filter(Boolean).join(' ');
  return [street, cityStateZip].filter(Boolean).join(', ');
}
// [CLA #MD-26-97218] or [CLA #MD-26-97218 - 123 Main St, Rockville MD 20850]
export const fileTag = (fileNumber, address) => {
  const num = String(fileNumber || 'order').trim() || 'order';
  const addr = String(typeof address === 'string' ? address : formatPropertyAddress(address || '')).replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return addr ? `[CLA #${num} - ${addr}]` : `[CLA #${num}]`;
};
// ?gmail=... after Google sends the browser back to Profile Setting
export const GMAIL_RESULT = {
  connected: ['ok', 'Gmail connected. You can now send email from a file (Email tab).'],
  denied: ['warn', 'Gmail was not connected: Google sign-in was cancelled.'],
  expired: ['warn', 'That Gmail sign-in link expired. Press Connect Gmail again.'],
  wrong_domain: ['bad', 'Only your @clatitle.com Google account can be connected.'],
  missing_scope: ['bad', 'Gmail was not connected: please allow both "send email" and "read email" on the Google screen.'],
  in_use: ['bad', 'That Gmail account is already connected to another portal login.'],
  failed: ['bad', 'Gmail could not be connected. Nothing was saved. Try again, or tell John.'],
};
const ROLE_WORD = { Processor: 'processor', Preprocessor: 'pre-processor', 'Sales Person': 'sales representative', 'Sales Team': 'sales representative',
  'Transaction Coordinator': 'transaction coordinator', Admin: 'contact', 'Super admin': 'contact' };
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const INTRO_ROLES = ['Client-Buyer', 'Client-Seller', 'Buyer Agent', 'Listing Agent', 'Transaction Coordinator'];
// the people an introduction goes to: buyers, sellers, both agents (and a TC on the file), with an email on file
export function introRecipients(deal) {
  const seen = new Set();
  return (deal.participants || []).filter((p) => !p.removed && INTRO_ROLES.includes(p.role) && p.contact && p.contact.email && !p.contact.contactHidden)
    .map((p) => ({ name: `${p.contact.firstName || ''} ${p.contact.lastName || ''}`.trim(), email: String(p.contact.email).trim().toLowerCase(), role: p.role }))
    .filter((r) => (seen.has(r.email) ? false : seen.add(r.email)));
}
// Introduction email (John, Nov 9): the processor / salesperson introduces themselves as the point of contact. No wire details, ever.
// a portal signature counts only when it has visible text (the server appends it under the same rule)
export const hasSignature = (sigHtml) => String(sigHtml || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').trim().length > 0;
// one sign-off only (John, Nov 9): with a portal signature the body ends at "Thank you," and the signature carries the name;
// without one the body signs with the sender's name itself
export const signOffHtml = (myName, signature) => (signature ? '<p>Thank you,</p>' : `<p>Thank you,<br>${esc(myName)}<br>CLA Title &amp; Escrow</p>`);
export function introTemplate(deal, me, recipients = [], { signature = false } = {}) {
  const addr = deal.address || [deal.street, deal.city, deal.state].filter(Boolean).join(', ');
  const first = recipients.map((r) => (r.name || '').split(' ')[0]).filter(Boolean);
  const hi = first.length ? `Hi ${first.length > 2 ? 'everyone' : first.join(' and ')},` : 'Hello,';
  const myName = `${me.firstName || ''} ${me.lastName || ''}`.trim() || 'your contact';
  return { key: 'intro', subject: `Introduction: ${addr || 'your closing'} (order ${deal.fileNumber || ''})`.replace(/ \(order \)$/, ''),
    html: `<p>${esc(hi)}</p><p>My name is ${esc(myName)}, and I am your ${esc(ROLE_WORD[me.role] || 'contact')} at CLA Title &amp; Escrow for ${esc(addr || 'this transaction')} (order ${esc(deal.fileNumber || '')}). I will be your point of contact from now until closing.</p>`
      + `<p>Please reply to this email with any questions, and send any documents we ask for the same way. ${deal.closingDate ? `We currently have closing on ${esc(String(deal.closingDate).slice(5, 7))}/${esc(String(deal.closingDate).slice(8, 10))}/${esc(String(deal.closingDate).slice(0, 4))}.` : ''}</p>`
      + '<p><strong>Wire fraud warning:</strong> CLA Title &amp; Escrow will never email you wire instructions or ask you to change them by email. Before sending any money, call our office at a phone number you already know.</p>' + signOffHtml(myName, signature) };
}
export const textToHtml = (t) => esc(t).replace(/\r?\n/g, '<br>');
