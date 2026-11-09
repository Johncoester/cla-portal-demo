/* File-level email templates (John, Nov 9): Admins build shared templates under Admin > Email Templates;
 * processors and other staff SELECT them on a file's Email tab (use, not author). Separate from CRM templates.
 * Merge tokens use {{field}}. gmail-send still appends the signature and the [CLA #file - address] subject tag. */
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
// Common document-type / name / folder match keys Admins can pick (matched loosely against docType, name, folderName)
export const ATTACH_DOC_MATCH_OPTIONS = [
  'Contract / addendum', 'Contract', 'Photo ID', 'Lender documents', 'Homeowners insurance',
  'Earnest money receipt', 'Settlement statement', 'Payoff statement', 'HOA documents', 'Deed', 'Survey', 'W-9 / 1099-S information', 'Other',
];

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (v) => { if (v == null || v === '') return ''; const n = Number(v); return Number.isFinite(n) ? '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : ''; };
const mdy = (v) => { const s = String(v || '').slice(0, 10); const m = s.split('-'); return m.length === 3 && m[0] ? `${m[1]}/${m[2]}/${m[0]}` : ''; };
const parties = (deal, role) => (deal.participants || []).filter((p) => !p.removed && p.role === role && p.contact);
const fullNames = (list) => list.map((p) => `${p.contact.firstName || ''} ${p.contact.lastName || ''}`.trim() || (p.contact.email || '')).filter(Boolean);
const firstNames = (list) => list.map((p) => String(p.contact.firstName || '').trim()).filter(Boolean);
const joinNames = (list) => list.length <= 2 ? list.join(' and ') : list.slice(0, -1).join(', ') + ', and ' + list[list.length - 1];
const firstOf = (list) => list[0] || '';
const addr = (deal) => {
  const street = String(deal.street || '').replace(/\s+/g, ' ').trim();
  const city = String(deal.city || '').replace(/\s+/g, ' ').trim();
  const state = String(deal.state || '').replace(/\s+/g, ' ').trim();
  const zip = String(deal.zip || '').replace(/\s+/g, ' ').trim();
  return [street, [city, state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
};

/** Resolve To addresses against people on the file (and free-typed names). */
export function resolveRecipients(deal = {}, toEmails = []) {
  const wanted = (toEmails || []).map((e) => String(e || '').trim().toLowerCase()).filter(Boolean);
  const byEmail = new Map();
  for (const p of (deal.participants || [])) {
    if (p.removed || !p.contact || !p.contact.email) continue;
    const email = String(p.contact.email).trim().toLowerCase();
    if (!byEmail.has(email)) byEmail.set(email, {
      email, role: p.role,
      firstName: String(p.contact.firstName || '').trim(),
      lastName: String(p.contact.lastName || '').trim(),
      name: `${p.contact.firstName || ''} ${p.contact.lastName || ''}`.trim() || email,
    });
  }
  const resolved = wanted.map((email) => byEmail.get(email) || { email, role: '', firstName: '', lastName: '', name: email });
  const known = resolved.filter((r) => r.firstName);
  const firsts = known.map((r) => r.firstName);
  const warnings = [];
  if (wanted.length > 1) warnings.push(`To has ${wanted.length} addresses; {{recipient_first_name}} uses the first matched first name` + (firsts[0] ? ` (${firsts[0]})` : '') + '.');
  if (wanted.length && !firsts.length) warnings.push('No first name found for the To address(es) on this file; {{recipient_first_name}} is blank.');
  return {
    recipients: resolved,
    recipient_first_name: firsts[0] || '',
    recipient_names: joinNames(known.map((r) => r.name).filter(Boolean) || wanted),
    warnings,
  };
}

export function mergeValues(deal = {}, sender = {}, { today = null, toEmails = [] } = {}) {
  const day = today || new Date().toLocaleDateString('en-CA');
  const buyers = parties(deal, 'Client-Buyer');
  const sellers = parties(deal, 'Client-Seller');
  const ba = parties(deal, 'Buyer Agent');
  const la = parties(deal, 'Listing Agent');
  const rec = resolveRecipients(deal, toEmails);
  return {
    recipient_first_name: rec.recipient_first_name,
    recipient_names: rec.recipient_names,
    file_number: String(deal.fileNumber || ''),
    property_address: addr(deal),
    buyer_names: joinNames(fullNames(buyers)),
    buyer_first_name: firstOf(firstNames(buyers)),
    seller_names: joinNames(fullNames(sellers)),
    seller_first_name: firstOf(firstNames(sellers)),
    closing_date: mdy(deal.closingDate),
    contract_price: money(deal.purchasePrice),
    loan_amount: money(deal.loanAmount),
    lender: String(deal.lenderName || ''),
    buyer_agent: joinNames(fullNames(ba)),
    buyer_agent_first_name: firstOf(firstNames(ba)),
    listing_agent: joinNames(fullNames(la)),
    listing_agent_first_name: firstOf(firstNames(la)),
    processor_name: String(deal.processorName || ''),
    processor_email: String(deal.processorEmail || ''),
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
  return { out, unknown, missing };
}

/** Match file documents to template attach keys (doc type, name, or folder). */
export function matchAttachDocuments(docs = [], attachKeys = []) {
  const keys = (attachKeys || []).map((k) => String(k || '').trim()).filter(Boolean);
  if (!keys.length) return { matched: [], missingKeys: [], notices: [] };
  const matched = []; const missingKeys = [];
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  for (const key of keys) {
    const nk = norm(key);
    const hits = (docs || []).filter((d) => {
      if (!d || d.wireInstructions || isWireName(d.name)) return false;
      const blob = norm([d.docType, d.name, d.folderName, d.description].filter(Boolean).join(' '));
      if (!nk || !blob) return false;
      if (blob.includes(nk)) return true;
      // "Contract" also matches "Contract / addendum"
      const parts = nk.split(' ').filter(Boolean);
      return parts.length && parts.every((p) => blob.includes(p));
    });
    if (!hits.length) missingKeys.push(key);
    for (const h of hits) if (!matched.some((m) => m.id === h.id)) matched.push(h);
  }
  const notices = [];
  if (missingKeys.length) notices.push(`No document on this file matches: ${missingKeys.join(', ')}. Attach manually if needed.`);
  if (matched.length) notices.push(`Auto-attached ${matched.length} document${matched.length === 1 ? '' : 's'} from the template (${matched.map((d) => d.name).join(', ')}). Uncheck any you do not want.`);
  return { matched, missingKeys, notices };
}
const isWireName = (n) => /\bwir(e|ed|es|ing)\b|wire[_ -]?instruction/i.test(String(n || ''));

/** Suggest To emails from template default roles on the file. */
export function defaultRecipientEmails(deal = {}, roles = []) {
  const want = new Set((roles || []).filter((r) => DEFAULT_RECIPIENT_ROLE_KEYS.includes(r)));
  if (!want.size) return [];
  const seen = new Set(); const out = [];
  for (const p of (deal.participants || [])) {
    if (p.removed || !want.has(p.role) || !p.contact || !p.contact.email || p.contact.contactHidden) continue;
    const email = String(p.contact.email).trim().toLowerCase();
    if (seen.has(email)) continue; seen.add(email); out.push(email);
  }
  return out;
}

export function applyFileTemplate(t, deal, sender, opts = {}) {
  const toEmails = opts.toEmails || [];
  const vals = mergeValues(deal, sender, { ...opts, toEmails });
  const subj = renderMerge(t.subject || '', vals, { mode: 'text' });
  const body = renderMerge(t.bodyHtml || t.body_html || '', vals, { mode: 'html' });
  const attachKeys = t.attachDocTypes || t.attach_doc_types || [];
  const attach = matchAttachDocuments(opts.documents || [], attachKeys);
  const defaultRoles = t.defaultRecipientRoles || t.default_recipient_roles || [];
  const suggestedTo = opts.applyDefaultRecipients === false ? [] : defaultRecipientEmails(deal, defaultRoles);
  const warnings = [...(vals._recipientWarnings || [])];
  if (subj.unknown.length || body.unknown.length) warnings.push('Unknown fields removed: ' + [...new Set([...subj.unknown, ...body.unknown])].join(', '));
  if (subj.missing.length || body.missing.length) warnings.push('Blank on this file: ' + [...new Set([...subj.missing, ...body.missing])].map((k) => '{{' + k + '}}').join(', '));
  warnings.push(...attach.notices);
  return {
    subject: subj.out.replace(/[\r\n]+/g, ' ').trim(),
    html: body.out,
    unknown: [...new Set([...subj.unknown, ...body.unknown])],
    missing: [...new Set([...subj.missing, ...body.missing])],
    templateKey: t.id ? String(t.id).slice(0, 60) : (t.key || null),
    attachDocumentIds: attach.matched.map((d) => d.id),
    suggestedTo,
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
  // Admins build shared templates only (John, Nov 9 2:57 PM)
  return { name, subject, bodyHtml, scope: 'shared', category, active, attachDocTypes, defaultRecipientRoles };
}

export function canManageFileTemplates(u) {
  return !!(u && u.isAdmin && (u.status || 'active') === 'active');
}
export function canEditFileTemplate(u, t) {
  return canManageFileTemplates(u) && t && t.scope === 'shared';
}
/** Staff who can send from a file may SELECT templates; only Admins author them. */
export function canSelectFileTemplates(u) {
  if (!u || u.accountRole || u.role === 'Outside user' || u.role === 'Employee') return false;
  return ['Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin'].includes(u.role) || !!u.isAdmin;
}

export const SEED_SHARED = [
  { key: 'processor-intro', name: 'Processor intro', category: 'Introduction',
    subject: 'Introduction for {{file_number}}',
    bodyHtml: '<p>Hi {{recipient_first_name}},</p><p>My name is {{sender_name}}, and I am your processor at CLA Title &amp; Escrow for {{property_address}} (order {{file_number}}). I will be your point of contact from now until closing.</p><p>Please reply to this email with any questions. If we have a closing date on the file, it currently shows as {{closing_date}}.</p><p><strong>Wire fraud warning:</strong> CLA Title &amp; Escrow will never email you wire instructions or ask you to change them by email.</p><p>Thank you,</p>',
    attachDocTypes: [], defaultRecipientRoles: ['Client-Buyer', 'Client-Seller', 'Buyer Agent', 'Listing Agent'] },
  { key: 'order-opened', name: 'Order opened / welcome', category: 'Opening',
    subject: 'Welcome — we opened {{file_number}}',
    bodyHtml: '<p>Hello {{buyer_first_name}},</p><p>We have opened your file <strong>{{file_number}}</strong> for {{property_address}}. Your processor is {{processor_name}} ({{processor_email}}).</p><p>We will be in touch with next steps. If anything looks wrong on the order, reply here.</p><p>Thank you,</p>',
    attachDocTypes: ['Contract'], defaultRecipientRoles: ['Client-Buyer'] },
  { key: 'closing-scheduled', name: 'Closing scheduled', category: 'Closing',
    subject: 'Closing scheduled for {{file_number}}',
    bodyHtml: '<p>Hello {{recipient_first_name}},</p><p>Closing for <strong>{{file_number}}</strong> at {{property_address}} is currently set for <strong>{{closing_date}}</strong>.</p><p>Buyers: {{buyer_names}}<br>Sellers: {{seller_names}}<br>Lender: {{lender}}</p><p>Please reply if this date needs to change.</p><p>Thank you,</p>',
    attachDocTypes: [], defaultRecipientRoles: ['Client-Buyer', 'Client-Seller', 'Buyer Agent', 'Listing Agent'] },
];
