/* File-level email templates (John, Nov 9): Admins build shared templates under Admin > Email Templates;
 * staff SELECT them on a file's Email tab. Separate from CRM templates. Merge tokens use {{field}}.
 * gmail-send still appends the signature and the [CLA #file - address] subject tag. */
export const FILE_TEMPLATE_FIELDS = [
  ['recipient_first_name', 'Recipient first name (from To)'],
  ['recipient_names', 'Recipient full names (from To)'],
  ['file_number', 'File number'],
  ['property_address', 'Property address'],
  ['buyer_names', 'Buyer names'],
  ['buyer_first_name', 'Buyer first name'],
  ['seller_names', 'Seller names'],
  ['seller_first_name', 'Seller first name'],
  ['closing_date', 'Closing date'],
  ['contract_price', 'Contract / purchase price'],
  ['loan_amount', 'Loan amount'],
  ['lender', 'Lender'],
  ['buyer_agent', 'Buyer agent'],
  ['buyer_agent_first_name', 'Buyer agent first name'],
  ['listing_agent', 'Listing agent'],
  ['listing_agent_first_name', 'Listing agent first name'],
  ['processor_name', 'Processor name'],
  ['processor_email', 'Processor email'],
  ['processor_line', 'Processor name (email) — omits empty parentheses'],
  ['sender_name', 'Sender name'],
  ['today', 'Today'],
];
export const FILE_TEMPLATE_FIELD_KEYS = FILE_TEMPLATE_FIELDS.map(([k]) => k);
export const NAME_MAX = 120, SUBJECT_MAX = 250, BODY_MAX = 200_000, CATEGORY_MAX = 60;
export const DEFAULT_RECIPIENT_ROLES = [
  ['Client-Buyer', 'Buyer'],
  ['Client-Seller', 'Seller'],
  ['Buyer Agent', "Buyer's agent"],
  ['Listing Agent', 'Listing agent'],
  ['Transaction Coordinator', 'TC'],
];
export const DEFAULT_RECIPIENT_ROLE_KEYS = DEFAULT_RECIPIENT_ROLES.map(([k]) => k);
export const ROLE_LABEL = Object.fromEntries(DEFAULT_RECIPIENT_ROLES);
export const ATTACH_DOC_MATCH_OPTIONS = [
  'Contract / addendum', 'Contract', 'Photo ID', 'Lender documents', 'Homeowners insurance',
  'Earnest money receipt', 'Settlement statement', 'Payoff statement', 'HOA documents', 'Deed', 'Survey', 'W-9 / 1099-S information', 'Other',
];

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (v) => { if (v == null || v === '') return ''; const n = Number(v); return Number.isFinite(n) ? '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : ''; };
const mdy = (v) => { const s = String(v || '').slice(0, 10); const m = s.split('-'); return m.length === 3 && m[0] ? `${m[1]}/${m[2]}/${m[0]}` : ''; };
const joinNames = (list) => list.length <= 2 ? list.join(' and ') : list.slice(0, -1).join(', ') + ', and ' + list[list.length - 1];
const firstOf = (list) => list[0] || '';
const addr = (deal) => {
  const street = String(deal.street || '').replace(/\s+/g, ' ').trim();
  const city = String(deal.city || '').replace(/\s+/g, ' ').trim();
  const state = String(deal.state || '').replace(/\s+/g, ' ').trim();
  const zip = String(deal.zip || '').replace(/\s+/g, ' ').trim();
  return [street, [city, state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
};

/** Normalize a deal party into first/last/email/display, matching Parties/Contacts shapes (individual, full-name-in-one-field, entity/LLC + rep). */
export function partyPerson(p) {
  if (!p || p.removed || !p.contact) return null;
  const c = p.contact;
  if (c.contactHidden) return { first: '', last: '', email: '', full: '', hidden: true, role: p.role };
  const ent = p.entity || null;
  let first = String(c.firstName || c.first_name || '').trim();
  let last = String(c.lastName || c.last_name || '').trim();
  let email = String(c.email || '').trim().toLowerCase();
  // Entity / LLC buyer or seller: prefer the representative's name + email; fall back to entity name for display
  if (ent && (ent.name || ent.repName || ent.rep_name)) {
    const rep = String(ent.repName || ent.rep_name || '').trim();
    if (rep) {
      const parts = rep.split(/\s+/).filter(Boolean);
      first = parts[0] || first;
      last = parts.slice(1).join(' ') || last;
    }
    const re = String(ent.repEmail || ent.rep_email || '').trim().toLowerCase();
    if (re) email = re;
  }
  // "Warren Spencer" stored entirely in firstName (or lastName)
  if (first && !last && /\s/.test(first)) { const parts = first.split(/\s+/).filter(Boolean); first = parts[0] || ''; last = parts.slice(1).join(' '); }
  if (!first && last && /\s/.test(last)) { const parts = last.split(/\s+/).filter(Boolean); first = parts[0] || ''; last = parts.slice(1).join(' '); }
  if (!first && last) { first = last; last = ''; }
  const entityName = ent ? String(ent.name || '').trim() : '';
  const full = `${first} ${last}`.trim() || entityName || email;
  return { first, last, email, full, entityName, role: p.role, hidden: false };
}

const partiesOf = (deal, role) => (deal.participants || []).map(partyPerson).filter((p) => p && !p.hidden && p.role === role);

export function resolveRecipients(deal = {}, toEmails = []) {
  const wanted = (toEmails || []).map((e) => String(e || '').trim().toLowerCase()).filter(Boolean);
  const byEmail = new Map();
  for (const p of (deal.participants || []).map(partyPerson).filter(Boolean)) {
    if (p.hidden || !p.email) continue;
    if (!byEmail.has(p.email)) byEmail.set(p.email, p);
  }
  const resolved = wanted.map((email) => byEmail.get(email) || { email, first: '', last: '', full: email, role: '' });
  const withFirst = resolved.filter((r) => r.first);
  const firsts = withFirst.map((r) => r.first);
  const warnings = [];
  if (wanted.length > 1) warnings.push(`To has ${wanted.length} addresses; {{recipient_first_name}} uses the first matched first name` + (firsts[0] ? ` (${firsts[0]})` : '') + '.');
  if (wanted.length && !firsts.length) warnings.push('No first name found for the To address(es) on this file; {{recipient_first_name}} is blank.');
  return {
    recipients: resolved,
    recipient_first_name: firsts[0] || '',
    recipient_names: joinNames(withFirst.map((r) => r.full).filter(Boolean) || wanted),
    warnings,
  };
}

export function processorLine(name, email) {
  const n = String(name || '').trim();
  const e = String(email || '').trim();
  if (n && e) return `${n} (${e})`;
  return n || e || '';
}

export function mergeValues(deal = {}, sender = {}, { today = null, toEmails = [], processorEmail = null } = {}) {
  const day = today || new Date().toLocaleDateString('en-CA');
  const buyers = partiesOf(deal, 'Client-Buyer');
  const sellers = partiesOf(deal, 'Client-Seller');
  const ba = partiesOf(deal, 'Buyer Agent');
  const la = partiesOf(deal, 'Listing Agent');
  const rec = resolveRecipients(deal, toEmails);
  const pName = String(deal.processorName || '').trim();
  const pEmail = String(processorEmail != null ? processorEmail : (deal.processorEmail || '')).trim();
  return {
    recipient_first_name: rec.recipient_first_name,
    recipient_names: rec.recipient_names,
    file_number: String(deal.fileNumber || ''),
    property_address: addr(deal),
    buyer_names: joinNames(buyers.map((p) => p.full).filter(Boolean)),
    buyer_first_name: firstOf(buyers.map((p) => p.first).filter(Boolean)),
    seller_names: joinNames(sellers.map((p) => p.full || p.entityName).filter(Boolean)),
    seller_first_name: firstOf(sellers.map((p) => p.first).filter(Boolean)),
    closing_date: mdy(deal.closingDate),
    contract_price: money(deal.purchasePrice),
    loan_amount: money(deal.loanAmount),
    lender: String(deal.lenderName || ''),
    buyer_agent: joinNames(ba.map((p) => p.full).filter(Boolean)),
    buyer_agent_first_name: firstOf(ba.map((p) => p.first).filter(Boolean)),
    listing_agent: joinNames(la.map((p) => p.full).filter(Boolean)),
    listing_agent_first_name: firstOf(la.map((p) => p.first).filter(Boolean)),
    processor_name: pName,
    processor_email: pEmail,
    processor_line: processorLine(pName, pEmail),
    sender_name: `${sender.firstName || ''} ${sender.lastName || ''}`.trim() || String(sender.name || ''),
    today: mdy(day),
    _recipientWarnings: rec.warnings,
  };
}

const TOKEN_RE = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;
export function renderMerge(src, values, { mode = 'html' } = {}) {
  const unknown = []; const missing = [];
  const out = String(src == null ? '' : src).replace(TOKEN_RE, (all, key) => {
    const k = String(key || '').toLowerCase();
    if (!FILE_TEMPLATE_FIELD_KEYS.includes(k)) { if (!unknown.includes(all)) unknown.push(all); return ''; }
    const v = values[k];
    if (v == null || v === '') { if (!missing.includes(k)) missing.push(k); return ''; }
    return mode === 'html' ? esc(v).replace(/\r?\n/g, '<br>') : String(v);
  });
  return { out: polishMerged(out, mode), unknown, missing };
}

/** Drop dangling "Hello ," / empty "()" left by blank merge fields. */
export function polishMerged(src, mode = 'html') {
  let s = String(src == null ? '' : src);
  // "Hello ," / "Hi ," from a blank {{*_first_name}} → "Hello there," / "Hi there,"
  s = s.replace(/\b(Hi|Hello)\s+,/gi, (_, g) => `${g} there,`);
  // empty parentheses from "Name ({{processor_email}})" when email blank
  s = s.replace(/\s*\(\s*\)/g, '');
  if (mode === 'html') s = s.replace(/([^>]) {2,}/g, '$1 ');
  else s = s.replace(/ {2,}/g, ' ');
  return s;
}

const isWireName = (n) => /\bwir(e|ed|es|ing)\b|wire[_ -]?instruction/i.test(String(n || ''));
const docKey = (d) => `${String(d.name || '').toLowerCase()}|${Number(d.size || d.sizeBytes || 0)}`;

export function matchAttachDocuments(docs = [], attachKeys = []) {
  const keys = (attachKeys || []).map((k) => String(k || '').trim()).filter(Boolean);
  if (!keys.length) return { matched: [], missingKeys: [], notices: [] };
  const matched = []; const missingKeys = [];
  const seen = new Set();
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  for (const key of keys) {
    const nk = norm(key);
    const hits = (docs || []).filter((d) => {
      if (!d || d.wireInstructions || isWireName(d.name)) return false;
      const blob = norm([d.docType, d.name, d.folderName, d.description].filter(Boolean).join(' '));
      if (!nk || !blob) return false;
      if (blob.includes(nk)) return true;
      const parts = nk.split(' ').filter(Boolean);
      return parts.length && parts.every((p) => blob.includes(p));
    });
    if (!hits.length) missingKeys.push(key);
    for (const h of hits) {
      const k = docKey(h);
      if (seen.has(k) || matched.some((m) => m.id === h.id)) continue; // dedupe identical name+size (and same id)
      seen.add(k);
      matched.push(h);
    }
  }
  const notices = [];
  if (missingKeys.length) notices.push(`No document on this file matches: ${missingKeys.join(', ')}. Attach manually if needed.`);
  if (matched.length) notices.push(`Auto-attached ${matched.length} document${matched.length === 1 ? '' : 's'} from the template (${matched.map((d) => d.name).join(', ')}). Uncheck any you do not want.`);
  return { matched, missingKeys, notices };
}

export function defaultRecipientEmails(deal = {}, roles = []) {
  const want = new Set((roles || []).filter((r) => DEFAULT_RECIPIENT_ROLE_KEYS.includes(r)));
  if (!want.size) return { emails: [], missingRoles: [], warnings: [] };
  const seen = new Set(); const emails = [];
  const found = new Set();
  for (const person of (deal.participants || []).map(partyPerson).filter(Boolean)) {
    if (person.hidden || !want.has(person.role) || !person.email) continue;
    found.add(person.role);
    if (seen.has(person.email)) continue;
    seen.add(person.email); emails.push(person.email);
  }
  const missingRoles = [...want].filter((r) => !found.has(r));
  const warnings = missingRoles.map((r) => `No ${ROLE_LABEL[r] || r} with an email on this file.`);
  return { emails, missingRoles, warnings };
}

export function applyFileTemplate(t, deal, sender, opts = {}) {
  const toEmails = opts.toEmails || [];
  const defaultRoles = t.defaultRecipientRoles || t.default_recipient_roles || [];
  const suggested = opts.applyDefaultRecipients === false ? { emails: [], warnings: [] } : defaultRecipientEmails(deal, defaultRoles);
  const toForMerge = toEmails.length ? toEmails : suggested.emails;
  const vals = mergeValues(deal, sender, { ...opts, toEmails: toForMerge, processorEmail: opts.processorEmail });
  const subj = renderMerge(t.subject || '', vals, { mode: 'text' });
  const body = renderMerge(t.bodyHtml || t.body_html || '', vals, { mode: 'html' });
  const attach = matchAttachDocuments(opts.documents || [], t.attachDocTypes || t.attach_doc_types || []);
  const warnings = [...(vals._recipientWarnings || []), ...(suggested.warnings || [])];
  if (subj.unknown.length || body.unknown.length) warnings.push('Unknown fields removed: ' + [...new Set([...subj.unknown, ...body.unknown])].join(', '));
  const missingVisible = [...new Set([...subj.missing, ...body.missing])].filter((k) => k !== 'processor_email' || !vals.processor_line);
  if (missingVisible.length) warnings.push('Blank on this file: ' + missingVisible.map((k) => '{{' + k + '}}').join(', '));
  warnings.push(...attach.notices);
  return {
    subject: subj.out.replace(/[\r\n]+/g, ' ').trim(),
    html: body.out,
    unknown: [...new Set([...subj.unknown, ...body.unknown])],
    missing: [...new Set([...subj.missing, ...body.missing])],
    templateKey: t.id ? String(t.id).slice(0, 60) : (t.key || null),
    attachDocumentIds: attach.matched.map((d) => d.id),
    suggestedTo: suggested.emails,
    warnings,
  };
}

export function cleanTemplateInput(v = {}) {
  const name = String(v.name == null ? '' : v.name).replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  if (!name) throw new Error('Give the template a name.');
  if (name.length > NAME_MAX) throw new Error(`A template name can be at most ${NAME_MAX} characters.`);
  const subject = String(v.subject == null ? '' : v.subject).replace(/[\r\n\t]+/g, ' ').trim();
  if (subject.length > SUBJECT_MAX) throw new Error(`A subject can be at most ${SUBJECT_MAX} characters.`);
  const bodyHtml = String(v.bodyHtml != null ? v.bodyHtml : (v.body_html || ''));
  if (bodyHtml.length > BODY_MAX) throw new Error('That message is too long for a template.');
  const category = String(v.category == null ? '' : v.category).replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, CATEGORY_MAX);
  const active = v.active === false ? false : true;
  const attachDocTypes = [].concat(v.attachDocTypes || v.attach_doc_types || []).map((x) => String(x || '').trim()).filter(Boolean).slice(0, 12);
  const defaultRecipientRoles = [].concat(v.defaultRecipientRoles || v.default_recipient_roles || [])
    .map((x) => String(x || '').trim()).filter((r) => DEFAULT_RECIPIENT_ROLE_KEYS.includes(r)).slice(0, 8);
  return { name, subject, bodyHtml, scope: 'shared', category, active, attachDocTypes, defaultRecipientRoles };
}

export function canManageFileTemplates(u) {
  return !!(u && u.isAdmin && (u.status || 'active') === 'active');
}
export function canEditFileTemplate(u, t) {
  return canManageFileTemplates(u) && t && t.scope === 'shared';
}
export function canSelectFileTemplates(u) {
  if (!u || u.accountRole || u.role === 'Outside user' || u.role === 'Employee') return false;
  return ['Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin'].includes(u.role) || !!u.isAdmin;
}

/** Shape deal_contacts + deal_entities rows the way getDeal builds participants (for Email shell deals that have participants: []). */
export function participantsFromContacts(contacts = [], entities = []) {
  const ents = new Map((entities || []).map((r) => [r.participant_id || r.participantId, {
    name: r.name, type: r.entity_type || r.entityType || '',
    repName: r.rep_name || r.repName || '', repTitle: r.rep_title || r.repTitle || '',
    repPhone: r.rep_phone || r.repPhone || '', repEmail: r.rep_email || r.repEmail || '',
  }]));
  return (contacts || []).map((r) => {
    const id = r.participant_id || r.participantId || r.id;
    return {
      id, dealId: r.deal_id || r.dealId, contactId: r.contact_id || r.contactId, role: r.role, removed: !!r.removed,
      contact: {
        id: r.contact_id || r.contactId, profileId: r.profile_id || r.profileId,
        firstName: r.first_name || r.firstName || '', lastName: r.last_name || r.lastName || '',
        company: r.company || '', email: r.email || '', phone: r.phone || '',
        contactHidden: !!(r.contact_hidden || r.contactHidden),
      },
      entity: ents.get(id) || null,
    };
  });
}

export const SEED_SHARED = [
  { key: 'processor-intro', name: 'Processor intro', category: 'Introduction',
    subject: 'Introduction for {{file_number}}',
    bodyHtml: '<p>Hi {{recipient_first_name}},</p><p>My name is {{sender_name}}, and I am your processor at CLA Title &amp; Escrow for {{property_address}} (order {{file_number}}). I will be your point of contact from now until closing.</p><p>Please reply to this email with any questions. If we have a closing date on the file, it currently shows as {{closing_date}}.</p><p><strong>Wire fraud warning:</strong> CLA Title &amp; Escrow will never email you wire instructions or ask you to change them by email.</p><p>Thank you,</p>',
    attachDocTypes: [], defaultRecipientRoles: ['Client-Buyer', 'Client-Seller', 'Buyer Agent', 'Listing Agent'] },
  { key: 'order-opened', name: 'Order opened / welcome', category: 'Opening',
    subject: 'Welcome — we opened {{file_number}}',
    bodyHtml: '<p>Hello {{buyer_first_name}},</p><p>We have opened your file <strong>{{file_number}}</strong> for {{property_address}}. Your processor is {{processor_line}}.</p><p>We will be in touch with next steps. If anything looks wrong on the order, reply here.</p><p>Thank you,</p>',
    attachDocTypes: ['Contract'], defaultRecipientRoles: ['Client-Buyer'] },
  { key: 'closing-scheduled', name: 'Closing scheduled', category: 'Closing',
    subject: 'Closing scheduled for {{file_number}}',
    bodyHtml: '<p>Hello {{recipient_first_name}},</p><p>Closing for <strong>{{file_number}}</strong> at {{property_address}} is currently set for <strong>{{closing_date}}</strong>.</p><p>Buyers: {{buyer_names}}<br>Sellers: {{seller_names}}<br>Lender: {{lender}}</p><p>Please reply if this date needs to change.</p><p>Thank you,</p>',
    attachDocTypes: [], defaultRecipientRoles: ['Client-Buyer', 'Client-Seller', 'Buyer Agent', 'Listing Agent'] },
];
