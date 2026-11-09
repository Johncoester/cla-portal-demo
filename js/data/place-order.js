/* Place Order helpers (John, Nov 6; party referral Nov 7). No network. Used by the wizard and by tests.
 * One order has one source-of-business text. A person on the file is "<code>:<contact id>".
 * Buyer and seller are separate codes. "homeowner" stays a legacy value and is never rewritten into either.
 * Older marketing values (Google Ads, and so on) stay valid and are not a party selection. */
export const REFERRAL_PARTIES = [
  { code: 'buyer', label: 'Buyer', role: 'Client-Buyer', rowLabels: ['Buyer', 'Borrower'] },
  { code: 'seller', label: 'Seller', role: 'Client-Seller', rowLabels: ['Seller'] },
  { code: 'buyer_agent', label: "Buyer's agent", role: 'Buyer Agent', rowLabels: ['Buyer Agent'] },
  { code: 'listing_agent', label: 'Listing agent', role: 'Listing Agent', rowLabels: ['Listing Agent'] },
  { code: 'lender', label: 'Lender', role: 'Lender', rowLabels: ['Lender'] },
];
export const REFERRALS = [
  ...REFERRAL_PARTIES.map((p) => [p.code, p.label]),
  ['homeowner', 'Homeowner'],
];
export const REFERRAL_ROLE = { buyer: 'Client-Buyer', seller: 'Client-Seller', buyer_agent: 'Buyer Agent', listing_agent: 'Listing Agent', lender: 'Lender' };
export const ROLE_OF_CODE = { ...REFERRAL_ROLE };
const CODES = new Set(REFERRALS.map(([c]) => c));
const PARTY_CODES = new Set(REFERRAL_PARTIES.map((p) => p.code));

export function referralPartyByCode(code) { return REFERRAL_PARTIES.find((p) => p.code === code) || null; }
export function referralPartyByRole(role) { return REFERRAL_PARTIES.find((p) => p.role === role) || null; }
export function referralPartyByLabel(label) { return REFERRAL_PARTIES.find((p) => p.rowLabels.includes(label)) || null; }

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
  if (r.code === 'homeowner' || !r.contactId) return base;
  const who = nameOf ? nameOf(r.contactId) : '';
  return who ? `${base} — ${who}` : base;
}
export function encodeReferral(code, contactId) {
  if (!CODES.has(code)) return '';
  if (code === 'homeowner') return 'homeowner';
  return contactId ? `${code}:${contactId}` : code;
}
/* True only when the stored value names this code and this contact. A bare code, homeowner, or a marketing value matches nobody. */
export function referralMatchesContact(source, code, contactId) {
  const r = parseReferral(source);
  return !!(r && contactId && r.contactId && r.code === code && r.contactId === contactId);
}
export function sameReferralWorld(contact, actor, profiles) {
  if (!contact) return false;
  const profile = contact.profileId && (profiles || []).find((p) => p.id === contact.profileId);
  const flag = contact.isDemo != null ? contact.isDemo : contact.is_demo != null ? contact.is_demo : profile && (profile.isDemo != null ? profile.isDemo : profile.is_demo);
  if (flag == null || !actor) return true;
  return !!flag === !!actor.isDemo;
}
/* Empty string means the value may be stored. A message means it must be refused and the previous value kept. */
export function referralWriteError({ source, contacts, profiles, actor, participants, dealId }) {
  const raw = String(source || '').trim();
  if (!raw) return '';
  const r = parseReferral(raw);
  if (!r || r.code === 'homeowner' || !r.contactId) return '';
  const c = (contacts || []).find((z) => z.id === r.contactId);
  if (!c || !sameReferralWorld(c, actor, profiles)) return 'Source of business: pick one from the list.';
  const profile = c.profileId && (profiles || []).find((p) => p.id === c.profileId);
  if (profile && profile.status && profile.status !== 'active') return 'Source of business: pick one from the list.';
  const role = ROLE_OF_CODE[r.code];
  if (!role) return 'Source of business: pick one from the list.';
  const onFile = (participants || []).some((p) => p && p.dealId === dealId && p.role === role && !p.removed && p.contactId === r.contactId);
  if (!onFile) return 'Source of business: choose a person who is on this order in that role.';
  return '';
}
export function referralContacts(participants) {
  return (participants || []).filter((p) => p && !p.removed && referralPartyByRole(p.role) && (p.contactId || (p.contact && p.contact.id))).map((p) => {
    const meta = referralPartyByRole(p.role);
    const contact = p.contact || {};
    return { role: p.role, code: meta.code, contactId: p.contactId || contact.id, name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || contact.company || 'Unnamed contact' };
  });
}
/* Place Order saves a referral only when that person is still selected for that role. Nothing is filled in from the signer or from an assigned agent. */
export function referralFromForm({ value, picks, refinance }) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const r = parseReferral(raw);
  if (!r || !r.contactId || !PARTY_CODES.has(r.code)) return '';
  if (refinance && r.code !== 'buyer' && r.code !== 'lender') return '';
  const role = ROLE_OF_CODE[r.code];
  const hit = (picks || []).some((p) => p && p.role === role && p.contactId === r.contactId);
  return hit ? encodeReferral(r.code, r.contactId) : '';
}
/* One radio group for the file. Eligible rows are Buyer, Seller, Buyer Agent, Listing Agent, and Lender. */
export function fileReferralState({ source, sourceLabel, rows, canEdit } = {}) {
  const raw = String(source || '').trim();
  const list = (rows || []).map((row, index) => {
    const meta = referralPartyByLabel(row && row.label);
    const contactId = row && row.contactId || '';
    const eligible = !!meta && !row.salesRep && !row.fromSplits;
    const checked = !!(eligible && referralMatchesContact(raw, meta.code, contactId));
    return { index, label: row.label, code: meta ? meta.code : '', contactId, name: row.name || '', eligible, checked,
      placeholder: !!row.placeholder, control: eligible, disabled: !contactId || !!row.placeholder };
  });
  const matched = list.some((r) => r.checked);
  let unmatched = '';
  if (raw && !matched) unmatched = sourceLabel || referralLabel(raw) || raw;
  return { rows: list, clearChecked: !raw, unmatched, legacy: !!(raw && !matched), canEdit: !!canEdit };
}
/* The screen keeps the previous selection unless the write returns. A thrown write is a failure, not a saved referral. */
export async function applyReferralChange({ previous, next, write }) {
  const prior = previous == null ? '' : String(previous);
  const wanted = next == null ? '' : String(next);
  try {
    const saved = await write(wanted);
    return { ok: true, value: saved == null ? wanted : String(saved), error: '' };
  } catch (e) {
    return { ok: false, value: prior, error: (e && e.message) || 'Could not save the referral source.' };
  }
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
  // Unassigned clears the assignment (John Nov 6 / Francis Nov 9: staff must be able to remove a Processor).
  const options = [{ value: '', label: 'Unassigned' }];
  for (const p of procs || []) {
    if (!p || !p.id) continue;
    const name = `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.name || 'Processor';
    const role = p.role && p.role !== 'Processor' ? ` (${p.role})` : '';
    const you = meId && p.id === meId ? ' (you)' : '';
    const email = p.email ? ` — ${p.email}` : '';
    options.push({ value: p.id, label: name + role + you + email });
  }
  const value = keepId && options.some((o) => o.value === keepId) ? keepId : '';
  return { options, value, dropped: !!(keepId && value !== keepId) };
}
export const SALES_PICK_ROLES = ['Sales Person', 'Sales Team'];
/* Edit order. With the people on the file, one option per eligible contact (the same value as the Parties radio).
 * Without that list, the role names, and a refinance keeps the older lender-only role list.
 * A stored value that is not one of those choices stays on the list unchanged (homeowner, a marketing Lead Source, a bare code). */
export function sourceChoices(current, label, refinance, parties) {
  const cur = String(current || '').trim();
  if (Array.isArray(parties)) {
    const opts = [];
    const seen = new Set();
    for (const p of parties) {
      const meta = p && (p.code ? referralPartyByCode(p.code) : referralPartyByRole(p.role));
      if (!meta || !p.contactId) continue;
      const value = encodeReferral(meta.code, p.contactId);
      if (!value || seen.has(value)) continue;
      seen.add(value);
      opts.push({ value, label: `${meta.label} — ${p.name || 'Unnamed contact'}` });
    }
    if (cur && !seen.has(cur)) opts.push({ value: cur, label: label || referralLabel(cur) || cur });
    return opts;
  }
  const opts = REFERRALS.filter(([code]) => !refinance || code === 'lender').map(([value, name]) => ({ value, label: name }));
  if (cur && !opts.some((o) => o.value === cur)) opts.push({ value: cur, label: label || referralLabel(cur) || cur });
  return opts;
}
