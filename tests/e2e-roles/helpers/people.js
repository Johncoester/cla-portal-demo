import { targetMode } from './gate.js';

/* Mock sign-in ids are the built-in fake people. TEST sign-in reads env vars.
 * Passwords are never logged. */

export const FILE_MOCK = 'deal-1';
export const FILE_STREET = '100 E2E Test File';
export const SEED_FILE = 'MD-26-99001';
export const SEED_MARKER = 'E2E-ROLE-FILE';

export const PEOPLE = {
  processor: { mockId: 'u-proc', label: 'Processor', emailEnv: 'E2E_PROCESSOR_EMAIL', passwordEnv: 'E2E_PROCESSOR_PASSWORD', staff: true, placeOrder: true },
  salesPerson: { mockId: 'u-sp', label: 'Sales Person', emailEnv: 'E2E_SALES_PERSON_EMAIL', passwordEnv: 'E2E_SALES_PERSON_PASSWORD', viewOnly: true },
  salesTeam: { mockId: 'u-team', label: 'Sales Team', emailEnv: 'E2E_SALES_TEAM_EMAIL', passwordEnv: 'E2E_SALES_TEAM_PASSWORD', viewOnly: true, seesAllFiles: true },
  coordinator: { mockId: 'u-tc', label: 'Transaction Coordinator', emailEnv: 'E2E_TRANSACTION_COORDINATOR_EMAIL', passwordEnv: 'E2E_TRANSACTION_COORDINATOR_PASSWORD', shell: 'tc' },
  buyerAgent: { mockId: 'u-bagent', label: 'Buyer Agent', emailEnv: 'E2E_BUYER_AGENT_EMAIL', passwordEnv: 'E2E_BUYER_AGENT_PASSWORD', shell: 'client', side: 'buyer' },
  listingAgent: { mockId: 'u-lagent', label: 'Listing Agent', emailEnv: 'E2E_LISTING_AGENT_EMAIL', passwordEnv: 'E2E_LISTING_AGENT_PASSWORD', shell: 'client', side: 'seller' },
  buyer: { mockId: 'u-buyer', label: 'Client-Buyer', emailEnv: 'E2E_CLIENT_BUYER_EMAIL', passwordEnv: 'E2E_CLIENT_BUYER_PASSWORD', shell: 'client', side: 'buyer', pureClient: true },
  seller: { mockId: 'u-seller', label: 'Client-Seller', emailEnv: 'E2E_CLIENT_SELLER_EMAIL', passwordEnv: 'E2E_CLIENT_SELLER_PASSWORD', shell: 'client', side: 'seller', pureClient: true },
};

export const SECRET_NAMES = [
  'E2E_MAIL_TO',
  'E2E_GMAIL_CLIENT_ID',
  'E2E_GMAIL_CLIENT_SECRET',
  'E2E_GMAIL_REFRESH_TOKEN',
  'E2E_SUPER_ADMIN_EMAIL',
  'E2E_SUPER_ADMIN_PASSWORD',
  ...Object.values(PEOPLE).flatMap((p) => [p.emailEnv, p.passwordEnv]),
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
];

const FORBIDDEN = new Set(['accounting', 'title', 'funding', 'wires', 'policy', 'crm', 'hr', 'payoffs']);
/* Tabs gotoHash can tell apart from the file overview. Spouse is a real file tab. */
export const HASH_TABS = ['spouse', 'tasks', 'inbox', 'documents', 'closing', 'contacts', 'agreements', 'activity', 'email', 'accounting', 'title'];

export function tabOf(href) {
  const hash = String(href || '').split('?')[0];
  const m = hash.match(/#\/deals\/[^/]+(?:\/([^/]+))?/);
  if (!m) return '';
  const tab = m[1] || 'overview';
  if (tab === 'accounting') return 'accounting';
  return tab;
}

export function isForbiddenTab(tab) {
  return FORBIDDEN.has(tab);
}

export function requiredTabs(person) {
  if (person.pureClient) return ['overview', 'tasks', 'spouse', 'inbox', 'documents', 'closing', 'activity'];
  if (person.shell === 'client') return ['overview', 'tasks', 'inbox', 'documents', 'closing', 'agreements', 'contacts', 'activity'];
  if (person.shell === 'tc') return ['overview', 'tasks', 'spouse', 'inbox', 'documents', 'closing', 'contacts', 'activity'];
  return ['overview', 'tasks', 'spouse', 'inbox', 'documents', 'closing', 'contacts', 'agreements', 'activity'];
}

/* Share Files option text is "First Last (Role)". Expectations come from
 * listMessageRecipients in mock-part-msgs.js and visibility / side rules in constants.js.
 * The mock sample file assigns a preprocessor. The TEST seed file does not, so a
 * missing "(Preprocessor)" there is the empty assignment, not a missing recipient. */
export function assignedStaffRoles() {
  const roles = [/\(Processor\)/, /\(Transaction Coordinator\)/, /\(Sales Person\)|\(Sales Team\)/];
  if (targetMode() !== 'test') roles.splice(1, 0, /\(Preprocessor\)/);
  return roles;
}

export function recipientRules(person) {
  const staff = /Processor|Preprocessor|Transaction Coordinator|Sales Person|Sales Team|Admin|Super admin/;
  const assigned = assignedStaffRoles();
  if (person.label === 'Client-Buyer') {
    return { must: [/Buyer Agent/, ...assigned], mustNot: [/Listing Agent/, /Client-Seller/], staff: true, staffRe: staff };
  }
  if (person.label === 'Client-Seller') {
    return { must: [/Listing Agent/, ...assigned], mustNot: [/Buyer Agent/, /Client-Buyer/], staff: true, staffRe: staff };
  }
  if (person.label === 'Buyer Agent') {
    return { must: [/Client-Buyer/, ...assigned], mustNot: [/Listing Agent/, /Client-Seller/], staff: true, staffRe: staff };
  }
  if (person.label === 'Listing Agent') {
    return { must: [/Client-Seller/, ...assigned], mustNot: [/Buyer Agent/, /Client-Buyer/], staff: true, staffRe: staff };
  }
  if (person.label === 'Transaction Coordinator') {
    return { must: [/Buyer Agent/, /Listing Agent/, /Client-Buyer/, /Client-Seller/, ...assigned.filter((re) => !/Transaction Coordinator/.test(re.source))], mustNot: [], staff: false, staffRe: staff };
  }
  return { must: [], mustNot: [], staff: false, staffRe: staff };
}
