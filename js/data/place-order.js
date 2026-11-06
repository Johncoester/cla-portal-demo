/* Place Order helpers (John, Nov 6). No network. Used by the wizard and by tests.
 * Referral codes are stored in the existing source-of-business text. A linked contact is
 * "buyer_agent:<contact id>". Older marketing values (Google Ads, and so on) stay valid. */
export const REFERRALS = [
  ['buyer_agent', "Buyer's agent"],
  ['listing_agent', 'Listing agent'],
  ['lender', 'Lender'],
  ['homeowner', 'Homeowner'],
];
export const REFERRAL_ROLE = { buyer_agent: 'Buyer Agent', listing_agent: 'Listing Agent', lender: 'Lender' };
const CODES = new Set(REFERRALS.map(([c]) => c));

export function parseReferral(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return null;
  const cut = raw.indexOf(':');
  const code = cut === -1 ? raw : raw.slice(0, cut);
  if (!CODES.has(code)) return null;
  const contactId = cut === -1 ? '' : raw.slice(cut + 1);
  return { code, contactId, raw };
}
export function referralLabel(value, nameOf) {
  const r = parseReferral(value);
  if (!r) return '';
  const base = REFERRALS.find(([c]) => c === r.code)[1];
  const who = r.contactId && nameOf ? nameOf(r.contactId) : '';
  return who ? `${base} — ${who}` : base;
}
export function encodeReferral(code, contactId) {
  if (!CODES.has(code)) return '';
  return contactId ? `${code}:${contactId}` : code;
}
/* First-time buyer and primary residence are Maryland purchase questions only. */
export function showMdQuestions(state, refinance) {
  return String(state || '').toUpperCase() === 'MD' && !refinance;
}
/* A real session must not offer a contact whose login is a demo persona. Contacts with no login stay. */
export function withoutHiddenProfiles(contacts, visibleProfileIds) {
  const ids = visibleProfileIds instanceof Set ? visibleProfileIds : new Set(visibleProfileIds || []);
  return (contacts || []).filter((c) => !c.profileId || ids.has(c.profileId));
}
export const PROCESSOR_PICK_ROLES = ['Processor', 'Preprocessor', 'Admin', 'Super admin'];
/* Unassigned is a real choice. A blank id is not filled with the person who is signed in. */
export function processorChoices(procs, keepId, meId) {
  const options = [{ value: '', label: 'Unassigned' }];
  for (const p of procs || []) {
    if (!p || !p.id) continue;
    const role = p.role && p.role !== 'Processor' ? ` (${p.role})` : '';
    const you = meId && p.id === meId ? ' (you)' : '';
    options.push({ value: p.id, label: `${p.firstName || ''} ${p.lastName || ''}`.trim() + role + you });
  }
  const value = keepId && options.some((o) => o.value === keepId) ? keepId : '';
  return { options, value, dropped: !!(keepId && value !== keepId) };
}
export const SALES_PICK_ROLES = ['Sales Person', 'Sales Team'];
/* Edit order: the four referral choices, plus a value already stored that is not one of them (an older marketing source, or a referral tied to a contact). */
export function sourceChoices(current, label, refinance) {
  const opts = REFERRALS.filter(([code]) => !refinance || code === 'lender').map(([value, name]) => ({ value, label: name }));
  if (current && !opts.some((o) => o.value === current)) opts.push({ value: current, label: label || referralLabel(current) || current });
  return opts;
}
