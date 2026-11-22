/* FF-049 / MF-046 (Francis, option 3, confirmed Nov 13 2026 9:14 AM ET).
 * Staff can type a buyer, seller, agent or lender straight onto a file.
 * A typed person is saved as a contact with no portal login and no invite.
 * Picking an existing contact still uses that contact and does not rewrite it.
 * Who can see a file is unchanged: a contact with no login cannot open the file. */
import { phoneOk, PHONE_MSG, AGENT_TC_TYPE } from './constants.js?v=202611247700';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function splitName(q) {
  const parts = String(q || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export function partyFieldError(label, { email, phone } = {}) {
  const who = label || 'This person';
  const em = String(email || '').trim();
  if (em && !EMAIL_RE.test(em)) return `${who}: enter a valid email, or leave email blank.`;
  const ph = String(phone || '').trim();
  if (ph && !phoneOk(ph)) return `${who}: phone ${PHONE_MSG}, or leave it blank.`;
  return '';
}

/* Buyer or seller. contactId wins (an existing contact). Otherwise a typed name,
 * email or phone is saved as a new contact. An empty row is skipped. invite is always false. */
export function buyerSellerEntry({ label, contactId, typedName, firstName, lastName, email, phone, company } = {}) {
  const who = label || 'This person';
  const error = partyFieldError(who, { email, phone });
  if (error) return { ok: false, error };
  const id = String(contactId || '').trim();
  if (id) return { ok: true, action: 'existing', contactId: id, invite: false };
  const typed = splitName(typedName);
  const explicit = [firstName, lastName, email, phone, company].some((v) => String(v || '').trim());
  const first = String(firstName || '').trim() || (explicit ? '' : typed.firstName);
  const last = String(lastName || '').trim() || (explicit ? '' : typed.lastName);
  const em = String(email || '').trim();
  const ph = String(phone || '').trim();
  const co = String(company || '').trim();
  if (!first && !last && !em && !ph && !co && !String(typedName || '').trim()) return { ok: true, action: 'skip', invite: false };
  if (!first && !co) return { ok: false, error: `${who}: enter a first name, or a company or entity name. You do not have to pick someone from the list.` };
  return {
    ok: true,
    action: 'create',
    invite: false,
    contact: { firstName: first, lastName: last, email: em, phone: ph, company: co, contactType: 'buyer_seller' },
  };
}

function personName(c) {
  return `${(c && c.firstName) || ''} ${(c && c.lastName) || ''}`.trim();
}

function optionLabel(c) {
  const name = personName(c);
  const bits = [];
  if (name && c.company) bits.push(String(c.company).trim());
  if (c.lenderRole === 'loan_officer') bits.push('Loan Officer');
  else if (c.lenderRole === 'lender_tc') bits.push('Lender TC');
  if (name && bits.length) return `${name} — ${bits.join(' — ')}`;
  return name || String(c.company || '').trim() || 'Unnamed contact';
}

function bucket(list) {
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
  const people = list.filter((c) => personName(c)).map((c) => ({ value: c.id, label: optionLabel(c) }));
  people.sort((a, b) => a.label.localeCompare(b.label));
  return { companies, people };
}

function visibleContacts(contacts) {
  return (contacts || []).filter((c) => c && c.id && !String(c.id).startsWith('staff:'));
}

/* Dropdown of existing companies plus agents (realtors), loan officers (lender contacts),
 * or transaction coordinators (outside assistants who work for agents) with agents still listed. */
export function directoryModel(contacts, kind) {
  const base = visibleContacts(contacts);
  if (kind === 'tc') {
    const coordinators = bucket(base.filter((c) => c.contactType === AGENT_TC_TYPE));
    const agents = bucket(base.filter((c) => c.contactType === 'realtor'));
    const companySeen = new Set();
    const companies = [];
    for (const row of [...coordinators.companies, ...agents.companies]) {
      const key = row.label.toLowerCase();
      if (companySeen.has(key)) continue;
      companySeen.add(key);
      companies.push(row);
    }
    companies.sort((a, b) => a.label.localeCompare(b.label));
    return {
      companyLabel: 'Companies',
      peopleLabel: 'Transaction coordinators',
      companies,
      people: coordinators.people,
      extraLabel: 'Agents',
      extraPeople: agents.people,
    };
  }
  const want = kind === 'lender' ? 'lender' : 'realtor';
  const one = bucket(base.filter((c) => c.contactType === want));
  return {
    companyLabel: 'Companies',
    peopleLabel: kind === 'lender' ? 'Loan officers' : 'Agents',
    companies: one.companies,
    people: one.people,
  };
}

export function directoryGroups(model) {
  const groups = [];
  if (model && model.companies && model.companies.length) groups.push([model.companyLabel || 'Companies', model.companies]);
  if (model && model.people && model.people.length) groups.push([model.peopleLabel || 'People', model.people]);
  if (model && model.extraPeople && model.extraPeople.length) groups.push([model.extraLabel || 'Agents', model.extraPeople]);
  return groups;
}

export function directoryChoice(value) {
  const v = String(value || '');
  if (!v) return { kind: 'manual' };
  if (v.startsWith('company:')) return { kind: 'company', company: v.slice('company:'.length) };
  return { kind: 'person', contactId: v };
}

/* Agent or lender. An existing contact id is used as-is. Otherwise the typed person
 * and company become a new contact. Email is optional. invite is always false. */
export function manualPartyEntry({ label, contactId, person, company, email, phone, contactType, lenderRole } = {}) {
  const who = label || 'This person';
  const error = partyFieldError(who, { email, phone });
  if (error) return { ok: false, error };
  const id = String(contactId || '').trim();
  if (id && !id.startsWith('company:')) return { ok: true, action: 'existing', contactId: id, invite: false };
  const name = splitName(person);
  const fromList = id.startsWith('company:') ? id.slice('company:'.length) : '';
  const co = String(company || '').trim() || fromList;
  const em = String(email || '').trim();
  const ph = String(phone || '').trim();
  const type = contactType === 'lender' || contactType === AGENT_TC_TYPE || contactType === 'realtor' ? contactType : 'realtor';
  if (!name.firstName && !name.lastName && !co && !em && !ph) return { ok: true, action: 'skip', invite: false };
  if (!name.firstName && !name.lastName && !co) return { ok: false, error: `${who}: enter the person or the company, or choose one from the list.` };
  const named = !!(name.firstName || name.lastName);
  const role = String(lenderRole || '').trim();
  if (type === 'lender' && named && role !== 'loan_officer' && role !== 'lender_tc') {
    return { ok: false, error: `${who}: choose Loan Officer or Lender TC for this person, or clear the name to save the company only.` };
  }
  const contact = { firstName: name.firstName, lastName: name.lastName, email: em, phone: ph, company: co, contactType: type };
  if (type === 'lender' && named) contact.lenderRole = role;
  return { ok: true, action: 'create', invite: false, contact };
}

/* A company-only contact already on the list, so a typed company is not saved twice. */
export function companyOnlyContact(contacts, company, contactType) {
  const key = String(company || '').trim().toLowerCase();
  if (!key) return null;
  return (contacts || []).find((c) => c && String(c.company || '').trim().toLowerCase() === key
    && !String(c.firstName || '').trim() && !String(c.lastName || '').trim()
    && (!contactType || c.contactType === contactType)) || null;
}
