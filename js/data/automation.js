// AUTOMATION (John, Nov 3 call): "Email sellers and agents" on the order page. Gmail is not connected, so NOTHING IS SENT: this builds a
// preview of one message per seller / agent on the order, from a CRM email template when one fits, else a built-in default.
// RULE: real estate agents NEVER receive wire instructions (and wire details go to the buyer only, so sellers do not get them here either).
// No template text and no merge field can put wire / bank details into these messages: wire-ish merge fields resolve to nothing, any line
// that mentions wires / routing / account numbers is dropped, and a final check replaces the whole body if anything wire-like survived.
import { WIRE_BUYER_ONLY, looksLikeWireDetails, isWireDocName } from './constants.js?v=202611060250';
export const GMAIL_OFF = 'Sending turns on once Gmail is connected.';
export const AUTOMATION_ROLES = ['Client-Seller', 'Listing Agent', 'Buyer Agent'];
export const isAgentRole = (r) => r === 'Buyer Agent' || r === 'Listing Agent';
const WIRE_WORDS = /\bwir(?:e|ed|es|ing)\b|\brouting\b|\baba\b|\bswift\b|\biban\b|\bbeneficiary\b|\baccount\s*(?:no\.?|number|num|#)|\bbank\s+(?:name|account|details|info)|\bescrow\s+account\b/i;
export const hasWireInfo = (t) => { const s = String(t == null ? '' : t); return WIRE_WORDS.test(s) || looksLikeWireDetails(s) || isWireDocName(s); };
const plain = (h) => String(h == null ? '' : h).replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const money = (n) => (n == null || n === '' ? '' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }));
const fmtD = (d) => { if (!d) return 'not set yet'; const [y, m, x] = String(d).slice(0, 10).split('-'); return `${m}/${x}/${y}`; };
const roleWord = { 'Client-Seller': 'Seller', 'Listing Agent': 'Listing agent', 'Buyer Agent': "Buyer's agent" };
export const DEFAULTS = {
  seller: { name: 'Built-in: seller update', subject: 'Order ${Order.File Number}: update on your sale of ${Order.Address}',
    body: 'Hi ${Recipient.First Name},\n\nThis is an update from CLA Title & Escrow on order ${Order.File Number} (${Order.Address}).\nClosing date: ${Order.Closing Date}.\n\nIf you have questions, reply to this email or call our office.\n\n${User Signature}' },
  agent: { name: 'Built-in: agent update', subject: 'Order ${Order.File Number}: update for ${Order.Address}',
    body: 'Hi ${Recipient.First Name},\n\nAn update from CLA Title & Escrow on order ${Order.File Number} (${Order.Address}), where you are the ${Recipient.Role}.\nClosing date: ${Order.Closing Date}.\n\nPlease let us know if anything changes on your side.\n\n${User Signature}' },
};
// which CRM template fits: active, not retired, plain-text / HTML kind, name or subject says seller (sellers) or agent / realtor (agents), and no wire text
export function pickTemplate(templates, kind) {
  const re = kind === 'seller' ? /\bsellers?\b/i : /\b(agents?|realtors?)\b/i;
  return (templates || []).filter((t) => t && !t.retiredAt && (t.status || 'active') === 'active' && (t.kind || 'html') === 'html' && re.test(`${t.name} ${t.subject}`) && !hasWireInfo(`${t.name}`))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))[0] || null;
}
function values(deal, p, sender) {
  const c = p.contact || {}; const first = c.firstName || ''; const last = c.lastName || '';
  return { 'Order.File Number': deal.fileNumber || '', 'Order.Address': deal.address || [deal.street, deal.city, deal.state].filter(Boolean).join(', '),
    'Order.Closing Date': fmtD(deal.closingDate), 'Order.Purchase Price': money(deal.purchasePrice), 'Order.Transaction Type': deal.transactionType || '',
    'Recipient.First Name': first, 'Recipient.Last Name': last, 'Recipient.Full Name': `${first} ${last}`.trim(), 'Recipient.Role': (roleWord[p.role] || p.role).toLowerCase(),
    'Contacts.First Name': first, 'Contacts.Last Name': last, 'Contacts.Full Name': `${first} ${last}`.trim(), 'Contacts.Email': c.email || '',
    'User.Full Name': sender || 'CLA Title & Escrow', 'User Signature': `${sender || 'CLA Title & Escrow'}\nCLA Title & Escrow` };
}
// merge: known fields only; a field whose NAME is wire-ish never resolves (blocked), unknown fields are removed (reported)
export function mergeSafe(src, vals) {
  const blocked = [], unknown = [];
  const out = String(src == null ? '' : src).replace(/\$\{([^}]{1,80})\}/g, (m, k) => { const key = k.trim();
    if (hasWireInfo(key) || /bank|routing|account/i.test(key)) { blocked.push(m); return ''; }
    if (Object.prototype.hasOwnProperty.call(vals, key)) { const v = String(vals[key]); if (hasWireInfo(v)) { blocked.push(m); return ''; } return v; }
    unknown.push(m); return ''; });
  return { text: out, blocked, unknown };
}
const dropWireLines = (t) => { const lines = String(t).split('\n'); const kept = lines.filter((l) => !hasWireInfo(l)); return { text: kept.join('\n').replace(/\n{3,}/g, '\n\n').trim(), dropped: lines.length - kept.length }; };
export function buildMessage(deal, p, template, sender) {
  const kind = p.role === 'Client-Seller' ? 'seller' : 'agent'; const t = template || DEFAULTS[kind]; const vals = values(deal, p, sender);
  const s = mergeSafe(plain(t.subject), vals); const b = mergeSafe(plain(t.body != null ? t.body : t.html), vals);
  const subj = dropWireLines(s.text.replace(/\n/g, ' ')); const body = dropWireLines(b.text);
  let subject = subj.text || `Order ${deal.fileNumber}`; let text = body.text; const notes = [];
  if (s.blocked.length + b.blocked.length) notes.push(`Removed wire / bank merge field${s.blocked.length + b.blocked.length === 1 ? '' : 's'}: ${[...s.blocked, ...b.blocked].join(', ')}`);
  if (subj.dropped + body.dropped) notes.push(`Removed ${subj.dropped + body.dropped} line${subj.dropped + body.dropped === 1 ? '' : 's'} mentioning wires / bank details. ${WIRE_BUYER_ONLY}`);
  if (s.unknown.length + b.unknown.length) notes.push(`Merge field${s.unknown.length + b.unknown.length === 1 ? '' : 's'} with no value on an order removed: ${[...s.unknown, ...b.unknown].join(', ')}`);
  if (hasWireInfo(subject) || hasWireInfo(text)) { const d = mergeSafe(DEFAULTS[kind].body, vals); text = d.text; subject = mergeSafe(DEFAULTS[kind].subject, vals).text; notes.push('The template still read like wire instructions, so the built-in message is used instead.'); }
  const c = p.contact || {};
  return { participantId: p.id, role: p.role, roleLabel: roleWord[p.role] || p.role, agent: isAgentRole(p.role), name: `${c.firstName || ''} ${c.lastName || ''}`.trim(), email: c.email || '',
    template: template ? template.name : DEFAULTS[kind].name, fromCrm: !!template, subject, body: text, notes, noEmail: !c.email };
}
// one message per seller / agent on the order (removed participants skipped; a self-represented seller + listing agent gets one message)
export function buildSellerAgentPreview({ deal, templates = [], sender = '' }) {
  const seen = new Set(); const msgs = [];
  const parts = (deal.participants || []).filter((p) => !p.removed && AUTOMATION_ROLES.includes(p.role))
    .sort((a, b) => AUTOMATION_ROLES.indexOf(a.role) - AUTOMATION_ROLES.indexOf(b.role));
  const tpl = { seller: pickTemplate(templates, 'seller'), agent: pickTemplate(templates, 'agent') };
  for (const p of parts) { const key = p.contactId || p.id; if (seen.has(key)) continue; seen.add(key); msgs.push(buildMessage(deal, p, p.role === 'Client-Seller' ? tpl.seller : tpl.agent, sender)); }
  return { dealId: deal.id, fileNumber: deal.fileNumber, messages: msgs, sent: 0, note: GMAIL_OFF, wireRule: WIRE_BUYER_ONLY,
    templatesUsed: [...new Set(msgs.filter((m) => m.fromCrm).map((m) => m.template))] };
}
// adapter method shared by the mock and Supabase adapters (reads only; sends nothing). Processor / Admin (whoever runs orders) only.
export function automationPart(api, { runsOrders, me }) {
  return { async previewSellerAgentEmails(dealId) {
    const u = await me(); if (!u || !runsOrders(u)) throw new Error('Only the Processor or an Admin can prepare emails to sellers and agents.');
    const deal = await api.getDeal(dealId); let templates = []; try { templates = await api.listCrmEmailTemplates(); } catch (e) { templates = []; }
    return buildSellerAgentPreview({ deal, templates, sender: `${u.firstName || ''} ${u.lastName || ''}`.trim() });
  } };
}
