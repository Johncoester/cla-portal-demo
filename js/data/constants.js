// Shared constants: roles, stages, statuses. Used by the UI, the mock adapter and mirrored in SQL (supabase/migrations).
// The 8 roles people play on an order (deal participants, task assignees).
export const DEAL_ROLES = [
  'Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator',
  'Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller',
];
// 'Admin' is a real login role (shown as "Admin"). Picking it always grants Admin access (isAdmin), which stays THE permission check.
export const ADMIN_ROLE = 'Admin';
// SUPER ADMIN (John, Nov 2; migration 18): the top role. Same powers as Admin, plus: only a Super admin can grant or remove the Super admin
// role, and only a Super admin can delete, suspend or change the role of a Super admin. There must always be at least one active Super admin.
// BOTH elevated roles now do full order work on ANY file (like a Processor: tasks, uploads, messages, settings). Documents stay undeletable.
export const SUPER_ADMIN_ROLE = 'Super admin';
export const ADMIN_ROLES = [SUPER_ADMIN_ROLE, ADMIN_ROLE];
export const isAdminRole = (role) => ADMIN_ROLES.includes(role);
export const isSuperAdmin = (u) => !!(u && u.role === SUPER_ADMIN_ROLE && u.isAdmin && (u.status || 'active') === 'active');
// PER-FILE ROLES (migration 10): a login is either STAFF (one fixed role) or an OUTSIDE USER. An outside user has no fixed role:
// on each order they act as whatever deal_participants says (Buyer Agent on one file, Client-Buyer on another). One email = one login.
export const OUTSIDE = 'Outside user';
export const OUTSIDE_FILE_ROLES = ['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'];   // roles an outside user can hold on a file
export const STAFF_ACCOUNT_ROLES = ['Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', ADMIN_ROLE, SUPER_ADMIN_ROLE];
export const ROLES = [...STAFF_ACCOUNT_ROLES, OUTSIDE];   // account types a login can have (user admin picker)
// HR WORKSPACE (John + Francis, Nov 4; migration 47): a CLA employee who has NO order / CRM work (e.g. most of the Philippines team, an HR-only manager)
// signs in with the 'Employee' account role. It is NOT staff (isStaff false: no orders, CRM, invites) and NOT an outside user. Such a login is
// created only by accepting an HR invite link; it reaches the HR workspace only (My profile, or the HR directory for an HR manager).
export const EMPLOYEE_ROLE = 'Employee';
export const isEmployeeOnly = (u) => !!u && u.role === EMPLOYEE_ROLE;
export const isOutside = (role) => role === OUTSIDE;
// SELF-REPRESENTATION (migration 11): an outside user may hold a client role AND their own side's agent role on the same order
// (an agent buying or selling for themselves). These are the only two allowed pairs; cross-side pairs and both agent roles are refused.
export const SELF_REP_PAIRS = [['Client-Buyer', 'Buyer Agent'], ['Client-Seller', 'Listing Agent']];
export const pairAllowed = (a, b) => SELF_REP_PAIRS.some(([c, g]) => (a === c && b === g) || (a === g && b === c));
// 'Buyer + Buyer's Agent' / 'Seller + Listing Agent' for a self-represented person, else their single role on the file
export const fileRoleLabel = (roles, role) => { const r = roles && roles.length ? roles : role ? [role] : [];
  if (r.includes('Client-Buyer') && r.includes('Buyer Agent')) return "Buyer + Buyer's Agent";
  if (r.includes('Client-Seller') && r.includes('Listing Agent')) return 'Seller + Listing Agent';
  return r[0] || OUTSIDE; };
export const STAFF_ROLES = ['Processor', 'Preprocessor', 'Sales Person', 'Sales Team', ADMIN_ROLE, SUPER_ADMIN_ROLE];
export const VIEW_ONLY_ROLES = ['Sales Person', 'Sales Team'];   // no order edits/uploads/messages. Nov 2: Admin / Super admin are no longer view-only
export const isViewOnly = (role) => VIEW_ONLY_ROLES.includes(role);
// Label for pickers and lists: the role, plus "+ Admin" when a non-Admin role also has the Admin flag.
export const roleLabel = (u) => (isAdminRole(u.role) || !u.isAdmin ? u.role : `${u.role} + Admin`);
// Dashboard / login-picker label for an outside user: the roles they hold across their files.
export const fileRolesLabel = (roles) => (roles && roles.length ? roles.join(' + ') : 'not on any file yet');
// CLIENT-ONLY LOGIN (John, Nov 5 meeting, live40): an outside user whose roles on every file are Client-Buyer / Client-Seller (no agent role anywhere).
// They land on Open Orders (/orders); the "My files" page and menu item are not shown to them. Agents and staff are unchanged.
export const isClientOnlyUser = (u) => !!u && u.role === 'Outside user' && !u.accountRole && (u.fileRoles || []).length > 0 && u.fileRoles.every((r) => r === 'Client-Buyer' || r === 'Client-Seller');
// DISPLAY ONLY (John, Nov 5, live40: "it actually says realtor, listing agent, buyer agent"): the friendly type of an outside user. The stored account role stays 'Outside user' (OUTSIDE).
// contact type realtor -> Realtor, buyer_seller -> Client, lender -> Lender; not set: inferred from the per-file roles; nothing known -> 'Realtor / Client'
const AGENT_FILE_ROLES = ['Buyer Agent', 'Listing Agent']; const CLIENT_FILE_ROLES = ['Client-Buyer', 'Client-Seller'];
export const outsideTypeLabel = (u) => { const ct = u && u.contactType; if (ct === 'realtor') return 'Realtor'; if (ct === 'buyer_seller') return 'Client'; if (ct === 'lender') return 'Lender';
  const rs = [...((u && u.fileRoles) || []), ...((u && u.files) || []).map((f) => f.role)];
  return rs.some((r) => AGENT_FILE_ROLES.includes(r)) ? 'Realtor' : rs.some((r) => CLIENT_FILE_ROLES.includes(r)) ? 'Client' : 'Realtor / Client'; };
// "Realtor: Buyer Agent + Client-Buyer" (pickers) / staff: the role label
export const accountTypeLabel = (u) => (u && u.role === 'Outside user' ? `${outsideTypeLabel(u)}: ${fileRolesLabel(u.fileLabels || u.fileRoles)}` : roleLabel(u));
// Back-office user who runs the deal workflow. NOT an admin: user/team admin = isAdmin (role 'Admin', or the flag on another role as in the old portal).
// Sales Person / Sales Team are view-only, as in the old portal.
export const PROCESSOR = 'Processor';
export const PREPROCESSOR = 'Preprocessor';
export const isProcessor = (role) => role === PROCESSOR;
export const isPreprocessor = (role) => role === PREPROCESSOR;
// Runs order work: Processor/Admin globally; Preprocessor only on files assigned through preprocessorUserId (enforced by dealsFor/RLS).
export const runsOrders = (u) => !!u && (isProcessor(u.role) || isPreprocessor(u.role) || !!u.isAdmin);
// View-only for order work: Sales Person / Sales Team, unless they also carry Admin access.
export const viewOnly = (u) => !!u && !u.isAdmin && isViewOnly(u.role);
export const isStaff = (role) => STAFF_ROLES.includes(role);
// CLIENT <-> SALESPERSON LINKS (John, Nov 2; migration 17): an outside user who is (or will be) a client may be linked to any number of
// salespeople (Sales Person or Sales Team logins), and a salesperson to any number of clients. The link does NOT change file access.
export const SALES_ROLES = ['Sales Person', 'Sales Team'];
export const isSalesRole = (role) => SALES_ROLES.includes(role);
export const isClient = (role) => role === 'Client-Buyer' || role === 'Client-Seller';
export const isAgent = (role) => role === 'Buyer Agent' || role === 'Listing Agent';
// John, Nov 2 (multi buyer/seller): a file's short title from its clients, buyers ' / ' sellers, last names in the order they were added, e.g. 'Parker & Quinn / Walsh'.
// participants = [{ role, contact: { firstName, lastName } }] in the order they were added (only the ones this viewer may see). Mirrored by private.file_title (migration 23).
export const COUNTY_MAX = 100;
export function fileTitleOf(participants) {
  const side = (role) => [...new Set((participants || []).filter((p) => p.role === role && p.contact).map((p) => String(p.contact.lastName || '').trim() || String(p.contact.firstName || '').trim()).filter(Boolean))].join(' & ');
  return [side('Client-Buyer'), side('Client-Seller')].filter(Boolean).join(' / ');
}
// Which side of the deal a role sits on ('buyer' | 'seller' | null = neutral/staff)
export const sideOf = (role) => ({ 'Buyer Agent': 'buyer', 'Client-Buyer': 'buyer', 'Listing Agent': 'seller', 'Client-Seller': 'seller' }[role] || null);

// Same ten steps as the existing portal's stage tracker.
export const STAGES = [
  'Opened', 'EMD Receipt', 'Buyer Info Received', 'Schedule Closing', 'Wire/Cash to Close Awareness',
  'Processing', 'Buyer Final Doc Review', 'Closing Date', 'Funding auth', 'Disbursed Funds',
];
export const DEAL_STATUSES = ['Open', 'Closed', 'On Hold', 'Cancelled'];
export const TASK_STATUSES = ['todo', 'in_progress', 'done', 'blocked', 'cancelled'];   // note: tasks are cancelled, never deleted
export const PROFILE_STATUSES = ['active', 'disabled', 'removed'];   // removed = deleted by an Admin; the row stays so documents/messages/history keep their author
export const TEAM_MEMBER_ROLES = ['coordinator', 'agent'];
export const isAdmin = (u) => !!(u && u.isAdmin);
export const TX_TYPES = ['Purchase', 'Refinance'];
// REFINANCE (John, Nov 3): a refinance has no purchase / sales price, no EMD, no sellers and no realtors. The people on it are the borrower(s) (kept as
// Client-Buyer, the party on the loan; shown as "Borrower"), the salespeople, the Processor and the Lender. Mirrored by migration 32
// (private.deal_refi_guard / private.participant_refi_guard).
export const REFI = 'Refinance';
export const isRefi = (d) => !!d && (d === REFI || d.transactionType === REFI || d.transaction_type === REFI);
export const REFI_BLOCKED_ROLES = ['Client-Seller', 'Buyer Agent', 'Listing Agent', 'Transaction Coordinator'];
export const REFI_BLOCKED_FIELDS = [['purchasePrice', 'Purchase price'], ['emdAmount', 'EMD amount'], ['emdDueDate', 'EMD due date']];
export const refiRoleMsg = (role) => `A refinance has no ${role === 'Client-Seller' ? 'seller' : role === 'Transaction Coordinator' ? 'transaction coordinator' : 'realtor (' + role + ')'}. Its people are the borrower(s), salespeople, the Processor and the Lender.`;
// CONTACT TYPE (John, Nov 2): a person-level reporting attribute that will flow into the CRM. Fixed list, stored as stable codes.
// Separate from per-file roles: a Realtor stays a Realtor even when buying a home on one file. CLA staff have none.
export const CONTACT_TYPES = [['realtor', 'Realtor'], ['lender', 'Lender'], ['buyer_seller', 'Buyer/Seller']];
export const CONTACT_TYPE_CODES = CONTACT_TYPES.map(([c]) => c);
export const contactTypeLabel = (code) => (CONTACT_TYPES.find(([c]) => c === code) || [null, ''])[1];
// default contact type for a per-file role (Add new user, Contacts tab): agents -> realtor, clients -> buyer_seller, lender -> lender
export const contactTypeForRole = (role) => ({ 'Buyer Agent': 'realtor', 'Listing Agent': 'realtor', 'Client-Buyer': 'buyer_seller', 'Client-Seller': 'buyer_seller', Lender: 'lender' })[role] || '';
// John, Nov 2: the order's State is picked from every US state + DC (alphabetical by name), no default. Any of these codes is valid on an order.
export const US_STATE_NAMES = [['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'], ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'],
  ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'], ['KY', 'Kentucky'],
  ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'],
  ['NE', 'Nebraska'], ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'], ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'],
  ['OK', 'Oklahoma'], ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'], ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'],
  ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming']];
export const US_STATES = US_STATE_NAMES.map(([c]) => c);
export const DOC_VISIBILITY = ['all', 'buyer', 'seller', 'staff'];
// 'Who can see it' choices for someone acting in `role` ON THIS FILE (deal-scoped role; Admin passes isAdmin):
// staff, TC and Admin: every option. Agents and clients (outside users): 'Everyone on the file' + their OWN side only - never
// 'CLA staff only' and never the other side's private option. An outside user with no side on the file: 'all' only.
// Mirrored by private.visibility_allowed(deal, visibility) in SQL (migration 12).
export const visibilityChoices = (role, isAdmin = false) => {
  if (isAdmin || ['Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin'].includes(role)) return [...DOC_VISIBILITY];
  const side = ({ 'Buyer Agent': 'buyer', 'Client-Buyer': 'buyer', 'Listing Agent': 'seller', 'Client-Seller': 'seller' })[role];
  // CLIENTS (Matt, Oct 31): one choice, 'Share with CLA Title' = CLA staff + their own side (their agent), never the other side.
  // (A self-represented agent acts as the agent here, so keeps the agent choices.) Migration 13 refuses 'all' from a client.
  // BUYER (Matt, Nov 4 call): the buyer shares documents with CLA Title ONLY ('staff'), not with their agent or anyone else
  if (role === 'Client-Buyer') return ['staff'];
  if (role === 'Client-Seller') return [side];
  return side ? ['all', side] : ['all']; };
// Labels for 'Who can see it'. Clients see their own-side option as 'Share with CLA Title'.
export const VIS_LABELS = { all: 'Everyone on the file', buyer: 'Buyer side only', seller: 'Seller side only', staff: 'CLA staff only' };
export const visibilityLabel = (vis, role) => ((role === 'Client-Buyer' && vis === 'staff') || ((role === 'Client-Buyer' || role === 'Client-Seller') && vis === sideOf(role)) ? 'Share with CLA Title' : VIS_LABELS[vis] || vis);
export const BUYER_SHARE_NOTE = 'Share with CLA Title: only CLA Title & Escrow staff can see it. Nobody else on the file (not your agent, not the other side).';
export const CLIENT_SHARE_NOTE = 'Share with CLA Title: CLA Title staff and your own agent on this file can see it. The other side (their agent and client) cannot.';
// Participant roles on a deal = the 8 order roles plus non-login parties (never 'Admin')
// John, Nov 4 meeting: abstractors and underwriters are parties too (non-login, like Lender / HOA; migration 49 allows them)
export const PARTICIPANT_ROLES = [...DEAL_ROLES, 'Lender', 'HOA', 'Abstractor', 'Underwriter', 'Other'];
// 25 MB per file (was 1.5 MB, which refused ordinary phone photos of an ID). The mock keeps file contents in IndexedDB (file-store.js);
// Supabase Storage bucket 'deal-documents' allows 25 MiB. Mirrored by migration 13 (allowed extensions).
export const MAX_UPLOAD_BYTES = 25_000_000;
// Calendar dates are LOCAL (the office's day), not UTC: after 8 PM Eastern, toISOString() is already tomorrow.
const pad2 = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const localDate = (offsetDays = 0) => { const d = new Date(); d.setDate(d.getDate() + offsetDays); return ymd(d); };
export const localDayOf = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : ymd(d); };
// A real calendar date in YYYY-MM-DD form (rejects 2026-02-30, 2026-13-01, "next week").
export const isRealDate = (v) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v)); if (!m) return false; const d = new Date(+m[1], +m[2] - 1, +m[3]); return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3]; };
// heic/heif = the iPhone camera's default photo format, webp = many Android phones (added for ID photos, migration 13)
export const ALLOWED_UPLOAD_EXT = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'png', 'jpg', 'jpeg', 'heic', 'heif', 'webp'];

// ---------- Matt's Oct 31 notes, priority 2 ----------
// PHONE NUMBERS: always xxx-xxx-xxxx (10 digits; a leading US "1" is dropped). Inputs auto-format as you type (app.js), the adapter
// validates and stores the formatted value, displays use fmtPhone. Mirrored by private.fmt_phone() + triggers in SQL (migration 14).
export const phoneDigits = (v) => { let d = String(v == null ? '' : v).replace(/\D/g, ''); if (d.length === 11 && d[0] === '1') d = d.slice(1); return d; };
export const phoneOk = (v) => phoneDigits(v).length === 10;
export const fmtPhone = (v) => { const d = phoneDigits(v); return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : String(v == null ? '' : v); };
export const phoneTyping = (v) => { let d = String(v == null ? '' : v).replace(/\D/g, ''); if (d.length > 10 && d[0] === '1') d = d.slice(1); d = d.slice(0, 10);
  return d.length > 6 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : d.length > 3 ? `${d.slice(0, 3)}-${d.slice(3)}` : d; };
export const PHONE_MSG = 'must be a 10-digit phone number (xxx-xxx-xxxx)';
// US bank routing (ABA) number: 9 digits with the ABA checksum. Account number: 4-17 digits.
export const routingOk = (v) => { const s = String(v || ''); if (!/^\d{9}$/.test(s)) return false; const d = [...s].map(Number);
  return (3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8])) % 10 === 0; };
export const accountOk = (v) => /^\d{4,17}$/.test(String(v || ''));
export const maskAccount = (v) => (v ? '\u2022\u2022\u2022\u2022' + String(v).slice(-4) : v);
// DOCUMENT TYPES (item 9). Sellers pick from the seller list; the buyer side from the general list; staff from both.
// Matt, Nov 3: an entity buyer or seller attaches its entity documents (both sides); listed before 'Other'. Mirrored by private.doc_types (migration 26).
export const ENTITY_DOC_TYPES = ['Operating agreement / amendments', 'Certificate of good standing', 'Articles of organization'];
export const SELLER_DOC_TYPES = ['Payoff statement', 'HOA documents', 'Deed', 'Survey', 'Tax bill', 'Power of attorney', 'Death certificate / estate documents',
  'Mortgage statement', 'W-9 / 1099-S information', 'Utility bills', ...ENTITY_DOC_TYPES, 'Other'];
export const GENERAL_DOC_TYPES = ['Contract / addendum', 'Photo ID', 'Lender documents', 'Homeowners insurance', 'Earnest money receipt', 'Settlement statement', ...ENTITY_DOC_TYPES, 'Other'];
export const DOC_TYPES = [...new Set([...GENERAL_DOC_TYPES, ...SELLER_DOC_TYPES])];
export const docTypeChoices = (role) => (sideOf(role) === 'seller' ? SELLER_DOC_TYPES : sideOf(role) === 'buyer' ? GENERAL_DOC_TYPES : DOC_TYPES);
// CLOSING (item 12): where the client wants to sign
export const CLOSING_LOCATIONS = ['CLA Title office', 'Mobile notary', 'Remote (online)'];
// WIRE FRAUD (item 11). Placeholder number on CLA Portal Live Test (fake 555 number in this build).
export const CLA_PHONE = '301-555-0100';
export const WIRE_FRAUD_NOTE = `Before you send any money, CALL CLA Title at ${CLA_PHONE} (a number you already know - never one from an email) to confirm these instructions. `
  + 'CLA Title will NEVER change wire instructions by email, text or phone. If you get a message saying the instructions changed, it is fraud: do not send money, call us.';
// WIRE INSTRUCTIONS GO TO BUYER CLIENTS ONLY (Matt, Oct 31; John, Nov 3: real estate agents - Buyer Agent or Listing Agent - and anyone they
// Share Access with must NEVER receive or see them: threads, files, documents, activity, previews, counts). Allowed: CLA staff + a person who is
// a Client-Buyer ON THAT FILE (a self-represented buyer included, because they are the buyer). Mirrored by private.wire_allowed (migration 29).
// A document is "wire instructions" when staff mark it so, or when its name says so (safety net). "Wire Fraud Warning" is NOT wire instructions.
export const WIRE_DOC_RE = /\bwir(?:e|ing)[\s_.-]*(?:transfer[\s_.-]*)?(?:instruction|info(?:rmation)?\b|details\b)/i;
export const isWireDocName = (name) => WIRE_DOC_RE.test(String(name == null ? '' : name));
// message text that carries wire details (mentions wiring AND a routing / ABA / account number or a 9-digit number). Refused in any conversation
// that includes someone who may not get wire instructions. Mirrored by private.wire_text (migration 29).
export const looksLikeWireDetails = (t) => { const s = String(t == null ? '' : t); return /\bwir(?:e|ed|ing)\b/i.test(s) && (/\b(?:routing|aba)\b/i.test(s) || /\baccount\s*(?:no\.?|number|num|#)/i.test(s) || /(?<!\d)\d{9}(?!\d)/.test(s)); };
export const WIRE_BUYER_ONLY = 'Wire instructions go to the buyer only (and CLA Title staff). Real estate agents never receive them.';
