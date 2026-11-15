/* Buyer, seller, lender and agent names on the ALTA Settlement Statement and the Closing Disclosure.
 * Staff open every file tab but Overview and Contacts from the light file header (readFileShell), which carries no people.
 * The statements need the people, so they are read once here. A typed person (no portal login) counts the same as an invited one.
 * partyNames and brokerOf are pure. withStatementParties makes one read and never fails the page: a failed read leaves the names blank. */
import { partyDisplayName } from './party-name.js?v=202611102000';

const named = (p, role) => !!p && p.role === role && (!!p.contact || !!(p.entity && String(p.entity.name || '').trim()));
const text = (v) => String(v == null ? '' : v).trim();

// "Pat Example, Lee Example" for one role on the file. An entity buyer or seller is shown by the entity name.
export function partyNames(participants, role) {
  const seen = new Set(); const out = [];
  for (const p of participants || []) {
    if (!named(p, role)) continue;
    const name = partyDisplayName(p);
    if (!name || name === 'Unnamed contact' || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase()); out.push(name);
  }
  return out.join(', ');
}

// The Closing Disclosure's Real Estate Broker columns: Name is the brokerage, Contact is the agent. An agent with no brokerage is the Name.
export function brokerOf(participants, role) {
  const p = (participants || []).find((x) => named(x, role) && x.contact);
  if (!p) return { name: '', contact: '' };
  const person = `${text(p.contact.firstName)} ${text(p.contact.lastName)}`.trim(); const company = text(p.contact.company);
  return company ? { name: company, contact: person } : { name: person, contact: '' };
}

export async function withStatementParties(api, deal) {
  if (!deal || (Array.isArray(deal.participants) && deal.participants.length)) return deal;
  const read = api && (api.readDeal || api.getDeal);
  if (typeof read !== 'function') return deal;
  try {
    const full = await read.call(api, deal.id);
    return full && Array.isArray(full.participants) && full.participants.length ? { ...deal, participants: full.participants } : deal;
  } catch (e) { return deal; }
}
