/* CONNECT-3 (John Coester, Nov 25 2026, 7:49 PM ET, t2081u; Connect Live Test Checklist rows 7.3 and 7.7, Francis Nov 25 2026).
 * When a buyer or seller saves their Personal Information task, their answers and their spouse's answers show on the
 * order's Contacts tab next to their contact. Row 7.7 says a client's edit "goes to staff for approval; doesn't quietly
 * overwrite the record", so nothing is written by the client's save. Staff open "Review answers" and choose what to copy:
 * a blank contact field is ticked for them, a different value is shown side by side and left unticked.
 * Only name and phone are copied. The email is never copied from here: it is where portal emails and the login go,
 * so a different email is shown with a note to use Edit. Pure functions; the page does the reads and the save. */

const s = (v) => (v == null ? '' : String(v)).trim();
const digits = (v) => s(v).replace(/\D/g, '');
const words = (v) => s(v).toLowerCase().replace(/\s+/g, ' ');
export const PERSONAL_INFO_CODE = 'personal_info';
export const CLIENT_ROLES = ['Client-Buyer', 'Client-Seller'];

export function splitFullName(full) {
  const parts = s(full).split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

/* the party's Personal Information copy (not cancelled) that has saved answers; the newest one if there are several */
export function personalInfoTaskFor(tasks, participantId) {
  const mine = (tasks || []).filter((t) => t && t.participantId === participantId && t.templateCode === PERSONAL_INFO_CODE
    && t.status !== 'cancelled' && (t.savedAt || t.status === 'done'));
  mine.sort((a, b) => String(b.savedAt || b.completedAt || '').localeCompare(String(a.savedAt || a.completedAt || '')));
  return mine[0] || null;
}

const yes = (v) => v === true || v === 'true' || v === 'Yes' || v === 'yes' || v === 'on';

/* The answers that are details of the person (shown read only), in the order the form asks them. */
export function answerDetails(answers) {
  const a = answers || {};
  const out = [];
  const add = (label, v) => { if (s(v)) out.push({ label, value: s(v) }); };
  if (yes(a.is_entity)) { add('Entity', a.entity_name); add('Entity type', a.entity_type); add('Signer', [s(a.entity_signer_name), s(a.entity_signer_title)].filter(Boolean).join(', ')); }
  add('Current address', a.current_address);
  add('Marital status', a.marital_status);
  add('Citizenship', a.citizenship);
  add('Forwarding address', a.forwarding_address);
  add('Power of attorney', a.power_of_attorney);
  if (s(a.poa_agent_name)) add('POA agent', [s(a.poa_agent_name), s(a.poa_agent_relationship)].filter(Boolean).join(', '));
  return out;
}

export function spouseDetails(row) {
  const r = row || {};
  if (!s(r.fullName)) return null;
  const phone = s(r.cellPhone) || s(r.homePhone) || s(r.workPhone);
  return { fullName: s(r.fullName), maritalStatus: s(r.maritalStatus), citizenship: s(r.citizenship), phone, email: s(r.email) };
}

/* What could be copied onto the contact. contact = { firstName, lastName, phone, email, company }.
 * fields: [{ key, label, current, answered, blank }] only where the answer is filled in and differs.
 * blank = the contact has nothing there, so the box starts ticked. An entity's name stays with the entity (not the person's name). */
export function contactProposal(contact, answers) {
  const c = contact || {}; const a = answers || {};
  const fields = [];
  if (!yes(a.is_entity) && s(a.full_name)) {
    const now = words([c.firstName, c.lastName].filter((x) => s(x)).join(' '));
    if (words(a.full_name) !== now) {
      const nm = splitFullName(a.full_name);
      const curName = [s(c.firstName), s(c.lastName)].filter(Boolean).join(' ');
      fields.push({ key: 'name', label: 'Name', current: curName, answered: s(a.full_name), blank: !curName, patch: { firstName: nm.firstName, lastName: nm.lastName } });
    }
  }
  if (digits(a.cell_phone) && digits(a.cell_phone) !== digits(c.phone)) {
    fields.push({ key: 'phone', label: 'Phone', current: s(c.phone), answered: s(a.cell_phone), blank: !digits(c.phone), patch: { phone: s(a.cell_phone) } });
  }
  const formEmail = s(a.email).toLowerCase();
  const emailNote = formEmail && formEmail !== s(c.email).toLowerCase()
    ? `The form says ${formEmail}. The contact's email (${s(c.email) || 'none'}) is where portal emails and the sign-in go, so it is not copied from here. Use Edit to change it.`
    : '';
  return { fields, emailNote };
}

/* the contact patch for the ticked keys; nothing ticked -> null */
export function proposalPatch(proposal, tickedKeys) {
  const keys = new Set(tickedKeys || []);
  const patch = {};
  for (const f of (proposal && proposal.fields) || []) if (keys.has(f.key)) Object.assign(patch, f.patch);
  return Object.keys(patch).length ? patch : null;
}
