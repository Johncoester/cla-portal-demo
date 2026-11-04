/* Task templates = DEFINITIONS (versioned). Each participant gets their own task COPY that records templateId + templateVersion.
 * Publishing a new version never changes existing copies. Mirrored in SQL table public.task_templates (fields as jsonb).
 * Intake forms follow the old portal's task pages (Tasks.php): ID upload, personal info, title vesting, lender, HOA, outstanding mortgage, home warranty, commissions.
 * Deliberately NOT collected: SSNs (the old portal asked for them; that needs a separate secure decision).
 * DELEGATION: agentRoles = which agent roles may fill a CLIENT's copy for them (only the agent on the client's own side, on that order).
 * Admin / processor change it on the Task Templates page (setTemplateAgentRoles). Personal items can never be delegated: see delegationLocked(). */
import { isRealDate, phoneOk, fmtPhone, PHONE_MSG, routingOk, accountOk } from './constants.js?v=202611041817';
const yn = ['Yes', 'No'];
const F = (k, label, type, req = false, extra = {}) => ({ k, label, type, req, ...extra });
const none = (label) => F('none', label, 'checkbox');
const PERSONAL_V1 = [F('full_name', 'Full legal name', 'text', true), F('email', 'Email', 'email', true), F('cell_phone', 'Cell phone', 'phone', true),
  F('current_address', 'Current address', 'text', true), F('marital_status', 'Marital status', 'select', true, { opts: ['Single', 'Married', 'Divorced', 'Widowed'] }),
  F('attending_closing', 'Will you attend the closing?', 'select', true, { opts: yn })];
// ---- Matt, Nov 3 (migration 26) ----
// Field option `roles`: the field is only on copies for those roles (settlement type is a SELLER-only choice; buyers always settle in person).
// fieldsForRole() is applied wherever a copy's fields are shown or validated (mock getTask / saveTaskForm / updateTask; SQL private.fields_for_role).
export const fieldsForRole = (fields, role) => (fields || []).filter((f) => !f.roles || f.roles.includes(role));
// Power of attorney (buyers and sellers): who the attorney-in-fact ("your Agent") is, how they are related, how to reach them, and why a POA is needed.
const POA_YES = ['power_of_attorney', 'Yes'];
export const POA_FIELDS = [F('power_of_attorney', 'Will you use a power of attorney?', 'select', false, { opts: yn }),
  F('poa_agent_name', 'Who is your Agent? (the person who will sign for you under the power of attorney)', 'text', true, { when: POA_YES }),
  F('poa_agent_relationship', 'Relationship to you', 'text', true, { when: POA_YES }),
  F('poa_agent_phone', "Agent's phone", 'phone', true, { when: POA_YES }), F('poa_agent_email', "Agent's email", 'email', false, { when: POA_YES }),
  F('poa_reason', 'Why is a power of attorney needed?', 'textarea', true, { when: POA_YES })];
// "+ Add entity": a checkbox shown as a + button (plus: true). When ticked, the entity questions and the entity documents are asked for.
// The documents are optional on the form (not every entity has all three, e.g. a trust); staff see which are still missing (listEntityDocRequests).
const ENT = ['is_entity', true];
export const ENTITY_TYPES = ['LLC', 'Corporation', 'Partnership', 'Trust', 'Other'];
export const ENTITY_DOCS = [['entity_doc_operating', 'Operating Agreement', 'Operating agreement / amendments'], ['entity_doc_amendments', 'Amendments to the Operating Agreement (if any)', 'Operating agreement / amendments'],
  ['entity_doc_good_standing', 'Certificate of Good Standing', 'Certificate of good standing'], ['entity_doc_articles', 'Articles of Organization', 'Articles of organization']];
export const ENTITY_FIELDS = [F('is_entity', 'Add entity (I am buying / selling as an LLC, corporation, partnership or trust)', 'checkbox', false, { plus: true }),
  F('entity_name', 'Entity name (exactly as registered)', 'text', true, { when: ENT }), F('entity_type', 'Entity type', 'select', true, { when: ENT, opts: ENTITY_TYPES }),
  F('entity_state', 'State where the entity was formed', 'state', true, { when: ENT }), F('entity_signer_name', 'Authorized signer (full name)', 'text', true, { when: ENT }),
  F('entity_signer_title', "Signer's title (e.g. Managing Member, President, Trustee)", 'text', true, { when: ENT }),
  F('entity_docs_note', 'Entity documents we need', 'info', false, { when: ENT, text: 'Please attach the Operating Agreement and any amendments, a Certificate of Good Standing, and the Articles of Organization. If you do not have one yet, save your progress and add it later, or upload it on the Documents tab.' }),
  ...ENTITY_DOCS.map(([k, label, docType]) => F(k, label, 'doc', false, { when: ENT, docType }))];
const PERSONAL_V3 = [...PERSONAL_V1, F('settlement_type', 'In-person or online settlement?', 'select', true, { opts: ['In person', 'Online'], roles: ['Client-Seller'] }),
  ...POA_FIELDS, ...ENTITY_FIELDS, F('notes', 'Anything else we should know?', 'textarea')];
// ---- Matt, Nov 3 (b) (migration 31, storage v23): "Entity Representative" when a buyer / seller is an entity: the person CLA deals with for the entity
// (name, title or role, phone, email). Optional: often the same person as the authorized signer. Asked inside "+ Add entity", before the documents.
// Place Order can record it too (per buyer / seller row); it is then pre-filled on that person's Personal information copy.
export const ENTITY_REP_FIELDS = [F('entity_rep_name', 'Entity Representative (full name; leave blank if it is the authorized signer)', 'text', false, { when: ENT }),
  F('entity_rep_title', "Representative's title or role", 'text', false, { when: ENT }), F('entity_rep_phone', "Representative's phone", 'phone', false, { when: ENT }),
  F('entity_rep_email', "Representative's email", 'email', false, { when: ENT })];
const ENTITY_FIELDS_V4 = (() => { const i = ENTITY_FIELDS.findIndex((f) => f.k === 'entity_docs_note'); return [...ENTITY_FIELDS.slice(0, i), ...ENTITY_REP_FIELDS, ...ENTITY_FIELDS.slice(i)]; })();
const PERSONAL_V4 = [...PERSONAL_V1, F('settlement_type', 'In-person or online settlement?', 'select', true, { opts: ['In person', 'Online'], roles: ['Client-Seller'] }),
  ...POA_FIELDS, ...ENTITY_FIELDS_V4, F('notes', 'Anything else we should know?', 'textarea')];
// Plain-English vesting explanations ("What do these mean?" button on Title vesting). General information only, not legal advice.
export const VESTING_TYPES = [
  ['Sole owner', 'One person owns the property alone. Only that person signs to sell or borrow against it, and when they die it passes under their will (or state law if there is no will).'],
  ['Tenants by the entirety', 'For married couples only. The two spouses own the whole property together as one unit. If one dies, the survivor automatically owns all of it without going through the will. Neither spouse can sell or mortgage it alone.'],
  ['Joint tenants', 'Two or more people own equal shares with a "right of survivorship": when one owner dies, their share passes automatically to the surviving owner(s), not through their will.'],
  ['Tenants in common', 'Two or more people each own a share, which can be unequal (for example 60/40). There is no survivorship: when an owner dies, their share goes to their heirs or under their will, not to the other owners.'],
  ['Entity (LLC/trust)', 'The property is owned by a company (such as an LLC) or a trust instead of by you personally. The entity\'s own documents decide who can sign, and we will ask for extra documents.']];
export const VESTING_HELP = { button: 'What do these mean?', title: 'Ways to hold title (plain English)', items: VESTING_TYPES,
  note: 'This is general information only, not legal advice. The right choice depends on your situation (marriage, estate plans, taxes, lender rules). Please ask CLA Title or your own attorney before you choose.' };
export const TEMPLATE_DEFS = [
  { code: 'id_upload', version: 1, title: 'Upload photo ID', roles: ['Client-Buyer', 'Client-Seller'], dueDays: 7, clientOnly: true, agentRoles: [], description: 'A clear photo or scan of a government ID.',
    fields: [F('id_type', 'ID type', 'select', true, { opts: ["Driver's license", 'Passport', 'State ID', 'Military ID'] }), F('id_expires', 'Expiration date', 'date', true), F('id_document', 'ID document', 'doc', true)] },
  { code: 'personal_info', version: 1, title: 'Personal information', roles: ['Client-Buyer', 'Client-Seller'], dueDays: 7, clientOnly: true, agentRoles: [], description: 'Contact details and closing preferences.', fields: PERSONAL_V1 },
  { code: 'personal_info', version: 2, title: 'Personal information', roles: ['Client-Buyer', 'Client-Seller'], dueDays: 7, clientOnly: true, agentRoles: [], description: 'Contact details and closing preferences (v2 adds settlement type and power of attorney).',
    fields: [...PERSONAL_V1, F('settlement_type', 'In-person or online settlement?', 'select', true, { opts: ['In person', 'Online'] }),
      F('power_of_attorney', 'Will you use a power of attorney?', 'select', false, { opts: yn }), F('notes', 'Anything else we should know?', 'textarea')] },
  { code: 'title_vesting', version: 1, title: 'Title vesting', roles: ['Client-Buyer'], dueDays: 10, agentRoles: [], description: 'How the buyer(s) will hold title.',
    fields: [F('vesting_names', 'Name(s) exactly as they should appear on the deed', 'textarea', true),
      F('vesting_type', 'Manner of holding title', 'select', true, { opts: ['Sole owner', 'Tenants by the entirety', 'Joint tenants', 'Tenants in common', 'Entity (LLC/trust)'] }),
      F('entity_name', 'Entity name', 'text', true, { when: ['vesting_type', 'Entity (LLC/trust)'] })] },
  // ---- Matt, Nov 3 (migration 26): settlement type for SELLERS only (field roles), power-of-attorney follow-ups, "+ Add entity" with entity questions and
  // the entity documents to attach (Operating Agreement + amendments, Certificate of Good Standing, Articles of Organization). Both buyers and sellers.
  { code: 'personal_info', version: 3, title: 'Personal information', roles: ['Client-Buyer', 'Client-Seller'], dueDays: 7, clientOnly: true, agentRoles: [], migration: 26,
    description: 'Contact details and closing preferences, power of attorney, and whether you are buying or selling as an entity (LLC, corporation, partnership or trust).',
    fields: PERSONAL_V3 },
  // ---- Matt, Nov 3 (b) (migration 31): + Entity Representative inside "+ Add entity" ----
  { code: 'personal_info', version: 4, title: 'Personal information', roles: ['Client-Buyer', 'Client-Seller'], dueDays: 7, clientOnly: true, agentRoles: [], migration: 31,
    description: 'Contact details and closing preferences, power of attorney, and whether you are buying or selling as an entity (LLC, corporation, partnership or trust) and who represents it.',
    fields: PERSONAL_V4 },
  { code: 'title_vesting', version: 2, title: 'Title vesting', roles: ['Client-Buyer'], dueDays: 10, agentRoles: [], migration: 26, description: 'How the buyer(s) will hold title.',
    fields: [F('vesting_names', 'Name(s) exactly as they should appear on the deed', 'textarea', true),
      F('vesting_type', 'Manner of holding title', 'select', true, { opts: VESTING_TYPES.map(([o]) => o), help: VESTING_HELP }),
      F('entity_name', 'Entity name', 'text', true, { when: ['vesting_type', 'Entity (LLC/trust)'] })] },
  { code: 'lender_info', version: 1, title: 'Lender information', roles: ['Client-Buyer'], dueDays: 7, agentRoles: ['Buyer Agent'], description: 'Who is financing the purchase.',
    fields: [none('Cash purchase - no lender'), F('company', 'Lender company', 'text', true), F('officer_name', 'Loan officer', 'text', true), F('officer_email', 'Loan officer email', 'email', true),
      F('officer_phone', 'Loan officer phone', 'phone', true), F('loan_type', 'Loan type', 'select', false, { opts: ['Conventional', 'FHA', 'VA', 'USDA', 'Other'] })] },
  { code: 'hoa_info', version: 1, title: 'HOA / condo association', roles: ['Client-Seller'], dueDays: 7, agentRoles: ['Listing Agent'], description: 'Homeowner or condominium association details.',
    fields: [none('No HOA or condo association'), F('association_name', 'Association name', 'text', true), F('assoc_type', 'Type', 'select', true, { opts: ['HOA', 'Condo'] }),
      F('contact_name', 'Management contact', 'text'), F('contact_email', 'Management email', 'email'), F('dues_amount', 'Dues amount ($)', 'money', true),
      F('payment_schedule', 'Payment schedule', 'select', true, { opts: ['Monthly', 'Quarterly', 'Annually'] })] },
  { code: 'mortgage_info', version: 1, title: 'Outstanding mortgage', roles: ['Client-Seller'], dueDays: 7, agentRoles: ['Listing Agent'], description: 'Loans to be paid off at closing.',
    fields: [none('No mortgage on this property'), F('lender_name', 'Mortgage lender', 'text', true), F('lender_phone', 'Lender phone', 'phone', true),
      F('loan_last4', 'Last 4 digits of loan number', 'digits4', true), F('loan_type', 'Loan type', 'select', false, { opts: ['First mortgage', 'Second mortgage', 'HELOC'] })] },
  { code: 'home_warranty', version: 1, title: 'Home warranty', roles: ['Client-Buyer'], dueDays: 14, agentRoles: ['Buyer Agent', 'Listing Agent'], description: 'Home warranty purchased with the property, if any.',
    fields: [none('No home warranty'), F('company', 'Warranty company', 'text', true), F('price', 'Price ($)', 'money', true),
      F('paid_by', 'Paid by', 'select', true, { opts: ['Buyer', 'Seller', 'Buyer Agent', 'Listing Agent'] })] },
  // v2 (migration 9): the SELLER side gets a copy too, because sellers often buy the buyer's home warranty. 'Who is paying' + 'Other'.
  { code: 'home_warranty', version: 2, title: 'Home warranty', roles: ['Client-Buyer', 'Client-Seller'], dueDays: 14, agentRoles: ['Buyer Agent', 'Listing Agent'], migration: 9,
    description: 'A home warranty for the buyer, if this side is arranging or paying for one (sellers often buy it for the buyer).',
    fields: [none('No home warranty from this side'), F('company', 'Warranty company', 'text', true), F('plan', 'Plan / coverage', 'text'), F('price', 'Price ($)', 'money', true),
      F('paid_by', 'Who is paying', 'select', true, { opts: ['Buyer', 'Seller', "Buyer's agent", 'Listing agent', 'Other'] }),
      F('paid_by_other', 'Paid by (other)', 'text', true, { when: ['paid_by', 'Other'] }), F('notes', 'Notes', 'textarea')] },
  { code: 'commissions', version: 1, title: 'Commission information', roles: ['Buyer Agent', 'Listing Agent'], dueDays: 10, agentRoles: [], description: 'Confirm your commission for the settlement statement.',
    fields: [F('brokerage', 'Brokerage', 'text', true), F('license_id', 'License ID', 'text', true), F('commission_amount', 'Commission ($)', 'money', true),
      F('paid_by', 'Paid by', 'select', true, { opts: ['Seller', 'Buyer', 'Split'] }), F('notes', 'Notes', 'textarea')] },
  // ---- Matt, Oct 31 (migration 14): seller forwarding address + how the seller gets their proceeds ----
  { code: 'forwarding_address', version: 1, title: 'Forwarding address', roles: ['Client-Seller'], dueDays: 10, agentRoles: [], migration: 14,
    description: 'Where should we send your mail after closing (the recorded deed, any escrow refund, your 1099-S and other closing papers)?',
    fields: [F('street', 'Forwarding street address', 'text', true), F('unit', 'Apt / unit', 'text'), F('city', 'City', 'text', true), F('state', 'State', 'state', true),
      F('zip', 'ZIP', 'zip', true), F('effective', 'Mail should go there from (date)', 'date'), F('phone_after', 'Best phone after closing', 'phone')] },
  { code: 'seller_proceeds', version: 1, title: 'How you want your proceeds', roles: ['Client-Seller'], dueDays: 10, clientOnly: true, agentRoles: [], migration: 14,
    description: 'How you want to receive the money from your sale. Bank details are seen only by you and the CLA processor (others see the last 4 digits).',
    fields: [F('method', 'How do you want to receive your proceeds?', 'select', true, { opts: ['Wire transfer', 'Check sent by FedEx', 'Check at settlement'] }),
      F('bank_name', 'Bank name', 'text', true, { when: ['method', 'Wire transfer'] }), F('routing', 'Routing number (9 digits)', 'routing', true, { when: ['method', 'Wire transfer'] }),
      F('account', 'Account number', 'account', true, { when: ['method', 'Wire transfer'], mask: true }), F('account_name', 'Name on the account', 'text', true, { when: ['method', 'Wire transfer'] }),
      F('mail_street', 'Mail the check to: street address', 'text', true, { when: ['method', 'Check sent by FedEx'] }), F('mail_unit', 'Apt / unit', 'text', false, { when: ['method', 'Check sent by FedEx'] }),
      F('mail_city', 'City', 'text', true, { when: ['method', 'Check sent by FedEx'] }), F('mail_state', 'State', 'state', true, { when: ['method', 'Check sent by FedEx'] }),
      F('mail_zip', 'ZIP', 'zip', true, { when: ['method', 'Check sent by FedEx'] }),
      F('settlement_conditions', 'Conditions for a check at settlement', 'info', false, { when: ['method', 'Check at settlement'],
        text: 'PLACEHOLDER - CLA Title to supply the real conditions before go-live. Example only: the check is made out to the seller(s) on title, is handed over only after the buyer\'s funds are confirmed, and you must show photo ID to receive it.' }),
      F('settlement_ack', 'I understand the conditions for receiving a check at settlement', 'checkbox', true, { when: ['method', 'Check at settlement'] }),
      F('notes', 'Anything else we should know?', 'textarea')] },
];

// Personal items stay client-only whatever the setting says: ID / identity, signatures, banking / wire / payment-account details, SSN.
// A template is locked if it is marked clientOnly, has a file field (IDs), or a field whose key/label looks like one of those. Mirrored in SQL (migration 9).
export const SENSITIVE_FIELD = /ssn|social.?security|bank|wire|routing|account|signature|identity|passport|license/i;
export const delegationLocked = (tp) => !!(tp && (tp.clientOnly || (tp.fields || []).some((f) => f.type === 'doc' || SENSITIVE_FIELD.test(`${f.k} ${f.label}`))));
export const AGENT_ROLES = ['Buyer Agent', 'Listing Agent'];

const CHECK = {
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), phone: phoneOk, date: (v) => isRealDate(v), routing: routingOk, account: accountOk,
  state: (v) => /^[A-Z]{2}$/.test(v), zip: (v) => /^\d{5}(-\d{4})?$/.test(v),
  money: (v) => isFinite(Number(String(v).replace(/[$,]/g, ''))) && Number(String(v).replace(/[$,]/g, '')) >= 0, digits4: (v) => /^\d{4}$/.test(v),
};
const MSG = { email: 'must be a valid email', phone: PHONE_MSG, routing: 'must be a valid 9-digit routing number', account: 'must be 4 to 17 digits', state: 'must be a 2-letter code (e.g. MD)', zip: 'must be a 5-digit ZIP', date: 'must be a date', money: 'must be a positive amount', digits4: 'must be exactly 4 digits' };
export const fieldActive = (f, data) => !(f.k !== 'none' && data.none) && (!f.when || data[f.when[0]] === f.when[1]);
/* Clean + validate a form. complete=false (save partial work): only checks values that are filled in. complete=true: required fields must be filled.
 * Returns { data, errors: [{k, msg}] }. Unknown keys are dropped. */
export function validateForm(fields, input, complete) {
  const data = {}; const errors = [];
  for (const f of fields) {
    let v = input[f.k];
    if (f.type === 'checkbox') { if (v === true || v === 'on' || v === 'true') data[f.k] = true; continue; }
    if (f.type === 'info') continue;   // text shown on the form, never an answer
    v = v == null ? '' : String(v).trim().slice(0, f.type === 'textarea' ? 2000 : 300);
    if (v === '') continue;
    if (f.type === 'phone' && phoneOk(v)) v = fmtPhone(v);   // stored as xxx-xxx-xxxx
    if (f.type === 'state') v = v.toUpperCase();
    if (f.type === 'routing' || f.type === 'account') v = v.replace(/[\s-]/g, '');
    data[f.k] = v;
  }
  for (const f of fields) {
    if (f.type === 'checkbox') { if (!fieldActive(f, data)) delete data[f.k]; else if (complete && f.req && !data[f.k]) errors.push({ k: f.k, msg: `Please tick: ${f.label}.` }); continue; }
    if (f.type === 'info') continue;
    if (!fieldActive(f, data)) { delete data[f.k]; continue; }
    const v = data[f.k];
    if (v === undefined) { if (complete && f.req) errors.push({ k: f.k, msg: `${f.label} is required.` }); continue; }
    if (f.type === 'select' && !f.opts.includes(v)) errors.push({ k: f.k, msg: `${f.label}: pick one of the options.` });
    else if (CHECK[f.type] && !CHECK[f.type](v)) errors.push({ k: f.k, msg: `${f.label} ${MSG[f.type]}.` });
  }
  return { data, errors };
}

// fields whose answer only the owner and the processor see in full (bank account numbers); everyone else gets the last 4 digits
export const maskedFields = (tp) => (tp && tp.fields ? tp.fields.filter((f) => f.mask).map((f) => f.k) : []);

/* Matt, Nov 3 (storage v18 / migration 26): add the built-in template versions tagged `migration: 26` to stored data that lacks them, and move UNTOUCHED copies
 * (status todo, no answers ever saved) of older versions of those templates onto the new version so open intake items show the new questions.
 * A copy with any saved answer, or in progress / done / blocked / cancelled, keeps the version it was made from (copies with answers never change).
 * Idempotent: a template is recognised by its marker field, so running it again (or after an Admin published a later version) adds nothing. Mirrored in SQL. */
export const NOV3_MARKERS = { personal_info: 'poa_agent_name', title_vesting: 'vesting_type:help' };
const hasMarker = (t, m) => (t.fields || []).some((f) => (m.includes(':') ? f.k === m.split(':')[0] && !!f[m.split(':')[1]] : f.k === m));
export function applyNov3Templates(d, { at = new Date().toISOString(), by = null } = {}) {
  const added = []; let moved = 0;
  for (const def of TEMPLATE_DEFS.filter((t) => t.migration === 26)) {
    const vs = d.taskTemplates.filter((t) => t.code === def.code); let nt = vs.find((t) => hasMarker(t, NOV3_MARKERS[def.code]));
    if (!nt) {
      const top = vs.slice().sort((a, b) => b.version - a.version)[0]; const version = top ? Math.max(top.version + 1, def.version) : def.version;
      nt = { ...JSON.parse(JSON.stringify(def)), id: `tt-${def.code}-v${version}`, version, agentRoles: top ? [...(top.agentRoles || [])] : [...def.agentRoles], active: true, publishedBy: by, publishedAt: at };
      vs.forEach((t) => { t.active = false; }); d.taskTemplates.push(nt); added.push(nt.id);
    }
    if (!nt.active) continue;   // an Admin published a later version since: leave copies alone
    d.tasks.filter((t) => t.templateCode === def.code && t.templateId !== nt.id && t.kind === 'form' && t.status === 'todo' && !t.savedAt && !Object.keys(t.formData || {}).length
      && (d.taskTemplates.find((z) => z.id === t.templateId) || { version: 0 }).version < nt.version)
      .forEach((t) => { t.templateId = nt.id; t.templateVersion = nt.version; t.title = nt.title; t.description = nt.description; moved++; });
  }
  return { added, moved };
}

/* Matt, Nov 3 (b) (storage v23 / migration 31): same rule as applyNov3Templates for the templates tagged `migration: 31` (personal_info v4 = + Entity
 * Representative). Recognised by its marker field (entity_rep_name), numbered after any later Admin version, agent-delegation policy carried over; untouched
 * copies (todo, nothing saved) of OLDER versions move onto it while it is the active version. Idempotent. Mirrored in SQL (migration 31). */
export const NOV3B_MARKERS = { personal_info: 'entity_rep_name' };
export function applyNov3bTemplates(d, { at = new Date().toISOString(), by = null } = {}) {
  const added = []; let moved = 0;
  for (const def of TEMPLATE_DEFS.filter((t) => t.migration === 31)) {
    const vs = d.taskTemplates.filter((t) => t.code === def.code); let nt = vs.find((t) => hasMarker(t, NOV3B_MARKERS[def.code]));
    if (!nt) {
      const top = vs.slice().sort((a, b) => b.version - a.version)[0]; const version = top ? Math.max(top.version + 1, def.version) : def.version;
      nt = { ...JSON.parse(JSON.stringify(def)), id: `tt-${def.code}-v${version}`, version, agentRoles: top ? [...(top.agentRoles || [])] : [...def.agentRoles], active: true, publishedBy: by, publishedAt: at };
      if (d.taskTemplates.some((t) => t.id === nt.id)) nt.id = `tt-${def.code}-v${version}-nov3b`;
      vs.forEach((t) => { t.active = false; }); d.taskTemplates.push(nt); added.push(nt.id);
    }
    if (!nt.active) continue;
    d.tasks.filter((t) => t.templateCode === def.code && t.templateId !== nt.id && t.kind === 'form' && t.status === 'todo' && !t.savedAt && !Object.keys(t.formData || {}).length
      && (d.taskTemplates.find((z) => z.id === t.templateId) || { version: 0 }).version < nt.version)
      .forEach((t) => { t.templateId = nt.id; t.templateVersion = nt.version; t.title = nt.title; t.description = nt.description; moved++; });
  }
  return { added, moved };
}
// Place Order entity (participant.entity) -> answers pre-filled on that person's Personal information copy (only when the copy has no answers yet)
export const ENTITY_TYPES_SET = new Set(ENTITY_TYPES);
export function entityPrefill(entity, fields) {
  if (!entity || !entity.name) return null; const keys = new Set((fields || []).map((f) => f.k)); if (!keys.has('is_entity')) return null;
  const out = { is_entity: true, entity_name: entity.name };
  if (entity.type && ENTITY_TYPES_SET.has(entity.type)) out.entity_type = entity.type;
  [['repName', 'entity_rep_name'], ['repTitle', 'entity_rep_title'], ['repPhone', 'entity_rep_phone'], ['repEmail', 'entity_rep_email']].forEach(([a, k]) => { if (entity[a] && keys.has(k)) out[k] = entity[a]; });
  return out;
}
