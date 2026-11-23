/* Lender file fields (Francis, processor): loss-payee clause, CPL address, lender contact type, brokerage.
 * Existing orders keep lender name, contact, phone, email and loss payee. New fields start blank.
 * A lender company can be saved with no person. A buyer or seller entity is the entity name, not a first and last name.
 * FF-090: the mortgage brokerage on the file also keeps a contact name, phone, email and address. */
import { fmtPhone, phoneOk, PHONE_MSG } from './constants.js?v=202611302300';
export const LENDER_CONTACT_ROLES = [['loan_officer', 'Loan Officer'], ['lender_tc', 'Lender TC']];
export const MORTGAGE_BROKER_ROLE = 'mortgage_broker';
const ROLE_CODES = new Set(LENDER_CONTACT_ROLES.map(([code]) => code));
const LENDER_ROLE_CODES = new Set([...ROLE_CODES, MORTGAGE_BROKER_ROLE]);

export function lenderRoleLabel(code) {
  if (code === MORTGAGE_BROKER_ROLE) return 'Mortgage Broker';
  return (LENDER_CONTACT_ROLES.find(([c]) => c === code) || [null, ''])[1];
}

export function normLenderName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function looksLikeEntityName(name) {
  return /\b(llc|l\.l\.c\.?|inc\.?|corp\.?|corporation|trust|lp|llp|pllc|company|partnership|association)\b/i.test(String(name || ''));
}

export function cleanLenderRole(role, contactType) {
  const v = String(role || '').trim();
  if (!v) return null;
  if (!LENDER_ROLE_CODES.has(v)) throw new Error('Lender contact type must be Loan Officer or Lender TC, or Mortgage Broker.');
  if (contactType !== 'lender') throw new Error('Loan Officer, Lender TC, and Mortgage Broker are lender contacts only.');
  return v;
}

/* Company is required. A person is optional. A person needs Loan Officer or Lender TC. */
export function lenderCompanyContact({ company, firstName, lastName, email, phone, lenderRole } = {}) {
  const co = String(company || '').trim();
  const first = String(firstName || '').trim();
  const last = String(lastName || '').trim();
  const emailS = String(email || '').trim();
  const phoneS = String(phone || '').trim();
  const roleRaw = String(lenderRole || '').trim();
  if (!co) return { ok: false, error: 'Lender company name is required. A contact person is optional.' };
  if (roleRaw && !ROLE_CODES.has(roleRaw)) return { ok: false, error: 'Lender contact type must be Loan Officer or Lender TC.' };
  const person = !!(first || last || emailS || phoneS);
  if (person && !first && !last) return { ok: false, error: 'A lender contact needs a name, or leave the person blank to save the company only.' };
  if (person && !roleRaw) return { ok: false, error: 'Choose Loan Officer or Lender TC for this lender contact.' };
  if (!person && roleRaw) return { ok: false, error: 'A Loan Officer or Lender TC needs a name. Clear the type to save the company with no contact person.' };
  return {
    ok: true,
    contact: { firstName: first, lastName: last, company: co, email: emailS, phone: phoneS, contactType: 'lender', lenderRole: roleRaw || null },
  };
}

/* FF-053: a person at the mortgage brokerage. The company is the brokerage already on the file. */
export function mortgageBrokerContact({ company, firstName, lastName, email, phone } = {}) {
  const co = String(company || '').trim();
  const first = String(firstName || '').trim();
  const last = String(lastName || '').trim();
  if (!co) return { ok: false, error: 'Enter the mortgage brokerage first. Then add the broker.' };
  if (!first && !last) return { ok: false, error: 'Enter the mortgage broker\'s name.' };
  return {
    ok: true,
    contact: { firstName: first, lastName: last, company: co, email: String(email || '').trim(), phone: String(phone || '').trim(), contactType: 'lender', lenderRole: MORTGAGE_BROKER_ROLE },
  };
}

export function brokersAtBrokerage(contacts, brokerage) {
  const key = normLenderName(brokerage);
  if (!key) return [];
  return (contacts || []).filter((c) => c && c.lenderRole === MORTGAGE_BROKER_ROLE && normLenderName(c.company) === key && (`${c.firstName || ''} ${c.lastName || ''}`.trim()));
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BROKER_KEYS = ['mortgageBrokerName', 'mortgageBrokerContact', 'mortgageBrokerPhone', 'mortgageBrokerEmail', 'mortgageBrokerAddress'];

function tidy(v, max) {
  return String(v == null ? '' : v).trim().replace(/\s+/g, ' ').slice(0, max);
}

function splitBrokerName(q) {
  const parts = String(q || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

/* Company, contact, phone, email and address stored on the file. A blank phone or email stays blank. */
export function brokerageContact(input = {}) {
  const phoneRaw = String(input.mortgageBrokerPhone == null ? '' : input.mortgageBrokerPhone).trim();
  return {
    mortgageBrokerName: tidy(input.mortgageBrokerName, 200),
    mortgageBrokerContact: tidy(input.mortgageBrokerContact, 200),
    mortgageBrokerPhone: phoneRaw && phoneOk(phoneRaw) ? fmtPhone(phoneRaw) : tidy(phoneRaw, 40),
    mortgageBrokerEmail: String(input.mortgageBrokerEmail == null ? '' : input.mortgageBrokerEmail).trim().toLowerCase().slice(0, 200),
    mortgageBrokerAddress: tidy(input.mortgageBrokerAddress, 300),
  };
}

/* requireCompany: the file's Save brokerage always needs the company. Place Order allows the whole block to stay blank. */
export function brokerageContactError(input = {}, { requireCompany = false } = {}) {
  const x = brokerageContact(input);
  const phoneRaw = String(input.mortgageBrokerPhone == null ? '' : input.mortgageBrokerPhone).trim();
  if (phoneRaw && !phoneOk(phoneRaw)) return `The mortgage brokerage phone ${PHONE_MSG}, or leave it blank.`;
  if (x.mortgageBrokerEmail && !EMAIL_RE.test(x.mortgageBrokerEmail)) return 'Enter a valid email for the mortgage brokerage, or leave email blank.';
  const anyContact = !!(x.mortgageBrokerContact || phoneRaw || x.mortgageBrokerEmail || x.mortgageBrokerAddress);
  if ((requireCompany || anyContact) && !x.mortgageBrokerName) return 'Enter the mortgage brokerage company name.';
  return '';
}

/* What an update should write. Null when this save does not touch the brokerage. error is plain text and nothing is written. */
export function brokerageWrite(current = {}, patch = {}) {
  if (!BROKER_KEYS.some((k) => patch[k] !== undefined)) return null;
  const merged = {
    mortgageBrokerName: patch.mortgageBrokerName !== undefined ? patch.mortgageBrokerName : (current.mortgageBrokerName || ''),
    mortgageBrokerContact: patch.mortgageBrokerContact !== undefined ? patch.mortgageBrokerContact : (current.mortgageBrokerContact || ''),
    mortgageBrokerPhone: patch.mortgageBrokerPhone !== undefined ? patch.mortgageBrokerPhone : (current.mortgageBrokerPhone || ''),
    mortgageBrokerEmail: patch.mortgageBrokerEmail !== undefined ? patch.mortgageBrokerEmail : (current.mortgageBrokerEmail || ''),
    mortgageBrokerAddress: patch.mortgageBrokerAddress !== undefined ? patch.mortgageBrokerAddress : (current.mortgageBrokerAddress || ''),
  };
  const contactTouched = ['mortgageBrokerContact', 'mortgageBrokerPhone', 'mortgageBrokerEmail', 'mortgageBrokerAddress'].some((k) => patch[k] !== undefined && String(patch[k] || '').trim());
  const err = brokerageContactError(merged, { requireCompany: contactTouched });
  if (err) return { error: err };
  const clean = brokerageContact(merged);
  const values = {};
  for (const k of BROKER_KEYS) if (patch[k] !== undefined) values[k] = clean[k];
  return { values };
}

export function brokerageOnFile(deal = {}) {
  const x = brokerageContact(deal || {});
  return { company: x.mortgageBrokerName, contact: x.mortgageBrokerContact, phone: x.mortgageBrokerPhone && phoneOk(x.mortgageBrokerPhone) ? fmtPhone(x.mortgageBrokerPhone) : x.mortgageBrokerPhone, email: x.mortgageBrokerEmail, address: x.mortgageBrokerAddress };
}

/* Closing Disclosure page 5, Mortgage Broker column. The file's company wins; a name typed only on CD details still shows when the file has none. */
export function cdBrokerCells(deal, manualName) {
  const b = brokerageOnFile(deal);
  return { name: b.company || String(manualName || '').trim(), address: b.address, contact: b.contact, email: b.email, phone: b.phone };
}

/* Saved mortgage brokers, for the same kind of company / person list the lender block uses. */
export function brokerageDirectory(contacts) {
  const list = (contacts || []).filter((c) => c && c.id && !String(c.id).startsWith('staff:') && c.lenderRole === MORTGAGE_BROKER_ROLE);
  const companySeen = new Set();
  const companies = [];
  for (const c of list) {
    const name = String(c.company || '').trim();
    const key = name.toLowerCase();
    if (!name || companySeen.has(key)) continue;
    companySeen.add(key);
    companies.push({ value: `company:${name}`, label: name });
  }
  companies.sort((a, b) => a.label.localeCompare(b.label));
  const people = list.filter((c) => `${c.firstName || ''} ${c.lastName || ''}`.trim()).map((c) => {
    const name = `${c.firstName || ''} ${c.lastName || ''}`.trim();
    return { value: c.id, label: c.company ? `${name} — ${c.company}` : name };
  });
  people.sort((a, b) => a.label.localeCompare(b.label));
  return { companies, people };
}

export function brokerMatch(contacts, company, contactName) {
  const want = String(contactName || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!want) return null;
  return (contacts || []).find((c) => c && c.lenderRole === MORTGAGE_BROKER_ROLE && normLenderName(c.company) === normLenderName(company)
    && `${c.firstName || ''} ${c.lastName || ''}`.trim().toLowerCase().replace(/\s+/g, ' ') === want) || null;
}

export function brokerPersonFromFields(company, contactName, email, phone) {
  const { firstName, lastName } = splitBrokerName(contactName);
  return mortgageBrokerContact({ company, firstName, lastName, email, phone });
}

/* A database that does not have the new columns yet should say what to do, not the column name. */
export function brokerageColumnMiss(err) {
  const msg = String((err && err.message) || err || '');
  if (/mortgage_broker_(contact|phone|email|address)/i.test(msg) && /schema cache|does not exist|could not find/i.test(msg)) {
    return new Error('The brokerage contact was not saved. The file setup is not finished yet. Leave this page open and try again after setup. What you typed is still here.');
  }
  return err instanceof Error ? err : new Error(msg || 'The brokerage contact was not saved. Try again. What you typed is still here.');
}

export function contactDisplayName(c) {
  if (!c) return 'Unnamed contact';
  const n = `${c.firstName || ''} ${c.lastName || ''}`.trim();
  return n || String(c.company || '').trim() || 'Unnamed contact';
}

/* Previously used clauses for this lender only, newest first, blanks dropped, duplicates dropped. The typed text stays editable. */
export function lossPayeeSuggestions(deals, lenderName) {
  const key = normLenderName(lenderName);
  if (!key) return [];
  const ranked = [];
  for (const d of deals || []) {
    if (!d || normLenderName(d.lenderName) !== key) continue;
    const clause = String(d.lossPayeeName || '').trim();
    if (!clause) continue;
    ranked.push({ clause, when: String(d.openDate || d.createdAt || '') });
  }
  ranked.sort((a, b) => b.when.localeCompare(a.when) || a.clause.localeCompare(b.clause));
  const seen = new Set();
  const out = [];
  for (const row of ranked) {
    const k = row.clause.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(row.clause);
  }
  return out;
}

export function filterClauses(clauses, query) {
  const q = String(query || '').trim().toLowerCase();
  const list = clauses || [];
  if (!q) return list.slice();
  return list.filter((c) => String(c).toLowerCase().includes(q));
}

export function sameAsLenderFlag(value) {
  return value === true || value === 1 || value === '1' || value === 'on' || value === 'true';
}

/* When "same as lender" is on, the stored CPL address is the lender address. Otherwise the typed CPL address is kept. */
export function lenderExtras(input = {}) {
  const lenderAddress = String(input.lenderAddress == null ? '' : input.lenderAddress).trim().slice(0, 300);
  const same = sameAsLenderFlag(input.cplSameAsLender);
  const typed = String(input.cplAddress == null ? '' : input.cplAddress).trim().slice(0, 300);
  return {
    lenderAddress,
    cplSameAsLender: same,
    cplAddress: same ? lenderAddress : typed,
    mortgageBrokerName: String(input.mortgageBrokerName == null ? '' : input.mortgageBrokerName).trim().slice(0, 200),
  };
}

export function lenderColumnsTouched(input = {}) {
  return ['lenderAddress', 'cplAddress', 'cplSameAsLender', 'mortgageBrokerName'].some((k) => input[k] !== undefined);
}
/* A new order writes these columns only when one of them has a value, so a blank lender block still inserts on the previous schema. */
export function lenderColumnWrite(input = {}) {
  const x = lenderExtras(input);
  if (!x.lenderAddress && !x.cplAddress && !x.cplSameAsLender && !x.mortgageBrokerName) return null;
  return x;
}

/* Place Order / Add new user: an entity is stored under its entity name. First and last are only a representative. */
export function entityIdentity({ entityName, entityType, repName, repTitle, repEmail, repPhone, firstName, lastName } = {}) {
  const name = String(entityName || '').trim();
  if (!name) return { ok: false, error: 'Entity name is required.' };
  const first = String(firstName || '').trim();
  const last = String(lastName || '').trim();
  let rep = String(repName || '').trim();
  if (!rep && (first || last)) rep = `${first} ${last}`.trim();
  let repFirst = first;
  let repLast = last;
  if (!repFirst && !repLast && rep) {
    const parts = rep.split(/\s+/).filter(Boolean);
    repFirst = parts[0] || '';
    repLast = parts.slice(1).join(' ');
  }
  return {
    ok: true,
    contact: {
      firstName: repFirst,
      lastName: repLast,
      company: name,
      email: String(repEmail || '').trim(),
      phone: String(repPhone || '').trim(),
      contactType: 'buyer_seller',
    },
    entity: {
      name,
      type: String(entityType || '').trim(),
      repName: rep,
      repTitle: String(repTitle || '').trim(),
      repEmail: String(repEmail || '').trim(),
      repPhone: String(repPhone || '').trim(),
    },
  };
}

export function newPartyError({ role, kind, entityName, firstName, company } = {}) {
  const entity = (role === 'Client-Buyer' || role === 'Client-Seller') && kind === 'entity';
  const lender = role === 'Lender';
  if (lender && !String(company || '').trim()) return 'Lender company name is required. A contact person is optional.';
  if (entity && !String(entityName || '').trim()) return 'Entity name is required.';
  if (!entity && !lender && !String(firstName || '').trim()) return 'First name is required.';
  return '';
}

export function newPartyContact({ role, kind, entityName, entityType, firstName, lastName, email, phone, company, contactType, lenderRole, repTitle } = {}) {
  const error = newPartyError({ role, kind, entityName, firstName, company });
  if (error) return { ok: false, error };
  if ((role === 'Client-Buyer' || role === 'Client-Seller') && kind === 'entity') {
    const built = entityIdentity({ entityName, entityType, firstName, lastName, repTitle, repEmail: email, repPhone: phone });
    return built.ok ? { ok: true, contact: built.contact, entity: built.entity } : built;
  }
  if (role === 'Lender') {
    const built = lenderCompanyContact({ company, firstName, lastName, email, phone, lenderRole });
    return built.ok ? { ok: true, contact: built.contact, entity: null } : built;
  }
  return {
    ok: true,
    contact: {
      firstName: String(firstName || '').trim(),
      lastName: String(lastName || '').trim(),
      email: String(email || '').trim(),
      phone: String(phone || '').trim(),
      company: String(company || '').trim(),
      contactType: contactType || '',
    },
    entity: null,
  };
}

export function readLenderContactRows(form) {
  if (!form || !form.querySelectorAll) return [];
  const rows = [];
  form.querySelectorAll('[data-lender-contact-row]').forEach((row) => {
    const g = (n) => { const el = row.querySelector(`[data-lc="${n}"]`); return el ? el.value : ''; };
    const firstName = g('first');
    const lastName = g('last');
    const lenderRole = g('role');
    const phone = g('phone');
    const email = g('email');
    if (![firstName, lastName, lenderRole, phone, email].some((v) => String(v || '').trim())) return;
    rows.push({ firstName, lastName, lenderRole, phone, email });
  });
  return rows;
}
