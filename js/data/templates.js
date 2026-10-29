/* Task templates = DEFINITIONS (versioned). Each participant gets their own task COPY that records templateId + templateVersion.
 * Publishing a new version never changes existing copies. Mirrored in SQL table public.task_templates (fields as jsonb).
 * Intake forms follow the old portal's task pages (Tasks.php): ID upload, personal info, title vesting, lender, HOA, outstanding mortgage, home warranty, commissions.
 * Deliberately NOT collected: SSNs (the old portal asked for them; that needs a separate secure decision).
 * DELEGATION: agentRoles = which agent roles may fill a CLIENT's copy for them (only the agent on the client's own side, on that order).
 * Admin / processor change it on the Task Templates page (setTemplateAgentRoles). Personal items can never be delegated: see delegationLocked(). */
import { isRealDate } from './constants.js';
const yn = ['Yes', 'No'];
const F = (k, label, type, req = false, extra = {}) => ({ k, label, type, req, ...extra });
const none = (label) => F('none', label, 'checkbox');
const PERSONAL_V1 = [F('full_name', 'Full legal name', 'text', true), F('email', 'Email', 'email', true), F('cell_phone', 'Cell phone', 'phone', true),
  F('current_address', 'Current address', 'text', true), F('marital_status', 'Marital status', 'select', true, { opts: ['Single', 'Married', 'Divorced', 'Widowed'] }),
  F('attending_closing', 'Will you attend the closing?', 'select', true, { opts: yn })];
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
];

// Personal items stay client-only whatever the setting says: ID / identity, signatures, banking / wire / payment-account details, SSN.
// A template is locked if it is marked clientOnly, has a file field (IDs), or a field whose key/label looks like one of those. Mirrored in SQL (migration 9).
export const SENSITIVE_FIELD = /ssn|social.?security|bank|wire|routing|account|signature|identity|passport|license/i;
export const delegationLocked = (tp) => !!(tp && (tp.clientOnly || (tp.fields || []).some((f) => f.type === 'doc' || SENSITIVE_FIELD.test(`${f.k} ${f.label}`))));
export const AGENT_ROLES = ['Buyer Agent', 'Listing Agent'];

const CHECK = {
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), phone: (v) => /^[0-9()+\-.\s]{7,20}$/.test(v), date: (v) => isRealDate(v),
  money: (v) => isFinite(Number(String(v).replace(/[$,]/g, ''))) && Number(String(v).replace(/[$,]/g, '')) >= 0, digits4: (v) => /^\d{4}$/.test(v),
};
const MSG = { email: 'must be a valid email', phone: 'must be a phone number', date: 'must be a date', money: 'must be a positive amount', digits4: 'must be exactly 4 digits' };
export const fieldActive = (f, data) => !(f.k !== 'none' && data.none) && (!f.when || data[f.when[0]] === f.when[1]);
/* Clean + validate a form. complete=false (save partial work): only checks values that are filled in. complete=true: required fields must be filled.
 * Returns { data, errors: [{k, msg}] }. Unknown keys are dropped. */
export function validateForm(fields, input, complete) {
  const data = {}; const errors = [];
  for (const f of fields) {
    let v = input[f.k];
    if (f.type === 'checkbox') { if (v === true || v === 'on' || v === 'true') data[f.k] = true; continue; }
    v = v == null ? '' : String(v).trim().slice(0, f.type === 'textarea' ? 2000 : 300);
    if (v === '') continue;
    data[f.k] = v;
  }
  for (const f of fields) {
    if (f.type === 'checkbox' || !fieldActive(f, data)) { if (f.type !== 'checkbox' && !fieldActive(f, data)) delete data[f.k]; continue; }
    const v = data[f.k];
    if (v === undefined) { if (complete && f.req) errors.push({ k: f.k, msg: `${f.label} is required.` }); continue; }
    if (f.type === 'select' && !f.opts.includes(v)) errors.push({ k: f.k, msg: `${f.label}: pick one of the options.` });
    else if (CHECK[f.type] && !CHECK[f.type](v)) errors.push({ k: f.k, msg: `${f.label} ${MSG[f.type]}.` });
  }
  return { data, errors };
}
