// Shared constants: roles, stages, statuses. Used by the UI, the mock adapter and mirrored in SQL (supabase/migrations).
// The 8 roles people play on an order (deal participants, task assignees).
export const DEAL_ROLES = [
  'Sales Processor', 'Sales Person', 'Sales Team', 'Transaction Coordinator',
  'Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller',
];
// 'Admin' is a real login role (shown as "Admin"). Picking it always grants Admin access (isAdmin), which stays THE permission check.
export const ADMIN_ROLE = 'Admin';
// PER-FILE ROLES (migration 10): a login is either STAFF (one fixed role) or an OUTSIDE USER. An outside user has no fixed role:
// on each order they act as whatever deal_participants says (Buyer Agent on one file, Client-Buyer on another). One email = one login.
export const OUTSIDE = 'Outside user';
export const OUTSIDE_FILE_ROLES = ['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'];   // roles an outside user can hold on a file
export const STAFF_ACCOUNT_ROLES = ['Sales Processor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', ADMIN_ROLE];
export const ROLES = [...STAFF_ACCOUNT_ROLES, OUTSIDE];   // account types a login can have (user admin picker)
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
export const STAFF_ROLES = ['Sales Processor', 'Sales Person', 'Sales Team', ADMIN_ROLE];
export const VIEW_ONLY_ROLES = ['Sales Person', 'Sales Team', ADMIN_ROLE];   // no order edits/uploads/messages (Admin powers come from isAdmin)
export const isViewOnly = (role) => VIEW_ONLY_ROLES.includes(role);
// Label for pickers and lists: the role, plus "+ Admin" when a non-Admin role also has the Admin flag.
export const roleLabel = (u) => (u.role === ADMIN_ROLE || !u.isAdmin ? u.role : `${u.role} + Admin`);
// Dashboard / login-picker label for an outside user: the roles they hold across their files.
export const fileRolesLabel = (roles) => (roles && roles.length ? roles.join(' + ') : 'not on any file yet');
// Back-office user who runs the deal workflow. NOT an admin: user/team admin = isAdmin (role 'Admin', or the flag on another role as in the old portal).
// Sales Person / Sales Team are view-only, as in the old portal.
export const PROCESSOR = 'Sales Processor';
export const isProcessor = (role) => role === PROCESSOR;
export const isStaff = (role) => STAFF_ROLES.includes(role);
export const isClient = (role) => role === 'Client-Buyer' || role === 'Client-Seller';
export const isAgent = (role) => role === 'Buyer Agent' || role === 'Listing Agent';
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
export const DOC_VISIBILITY = ['all', 'buyer', 'seller', 'staff'];
// 'Who can see it' choices for someone acting in `role` ON THIS FILE (deal-scoped role; Admin passes isAdmin):
// staff, TC and Admin: every option. Agents and clients (outside users): 'Everyone on the file' + their OWN side only - never
// 'CLA staff only' and never the other side's private option. An outside user with no side on the file: 'all' only.
// Mirrored by private.visibility_allowed(deal, visibility) in SQL (migration 12).
export const visibilityChoices = (role, isAdmin = false) => {
  if (isAdmin || ['Sales Processor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin'].includes(role)) return [...DOC_VISIBILITY];
  const side = ({ 'Buyer Agent': 'buyer', 'Client-Buyer': 'buyer', 'Listing Agent': 'seller', 'Client-Seller': 'seller' })[role];
  // CLIENTS (Matt, Oct 31): one choice, 'Share with CLA Title' = CLA staff + their own side (their agent), never the other side.
  // (A self-represented agent acts as the agent here, so keeps the agent choices.) Migration 13 refuses 'all' from a client.
  if (role === 'Client-Buyer' || role === 'Client-Seller') return [side];
  return side ? ['all', side] : ['all']; };
// Labels for 'Who can see it'. Clients see their own-side option as 'Share with CLA Title'.
export const VIS_LABELS = { all: 'Everyone on the file', buyer: 'Buyer side only', seller: 'Seller side only', staff: 'CLA staff only' };
export const visibilityLabel = (vis, role) => ((role === 'Client-Buyer' || role === 'Client-Seller') && vis === sideOf(role) ? 'Share with CLA Title' : VIS_LABELS[vis] || vis);
export const CLIENT_SHARE_NOTE = 'Share with CLA Title: CLA Title staff and your own agent on this file can see it. The other side (their agent and client) cannot.';
// Participant roles on a deal = the 8 order roles plus non-login parties (never 'Admin')
export const PARTICIPANT_ROLES = [...DEAL_ROLES, 'Lender', 'HOA', 'Other'];
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
export const SELLER_DOC_TYPES = ['Payoff statement', 'HOA documents', 'Deed', 'Survey', 'Tax bill', 'Power of attorney', 'Death certificate / estate documents',
  'Mortgage statement', 'W-9 / 1099-S information', 'Utility bills', 'Other'];
export const GENERAL_DOC_TYPES = ['Contract / addendum', 'Photo ID', 'Lender documents', 'Homeowners insurance', 'Earnest money receipt', 'Settlement statement', 'Other'];
export const DOC_TYPES = [...new Set([...GENERAL_DOC_TYPES, ...SELLER_DOC_TYPES])];
export const docTypeChoices = (role) => (sideOf(role) === 'seller' ? SELLER_DOC_TYPES : sideOf(role) === 'buyer' ? GENERAL_DOC_TYPES : DOC_TYPES);
// CLOSING (item 12): where the client wants to sign
export const CLOSING_LOCATIONS = ['CLA Title office', 'Mobile notary', 'Remote (online)'];
// WIRE FRAUD (item 11). PLACEHOLDER number: the real CLA office number goes here before go-live (fake 555 number in this build).
export const CLA_PHONE = '301-555-0100';
export const WIRE_FRAUD_NOTE = `Before you send any money, CALL CLA Title at ${CLA_PHONE} (a number you already know - never one from an email) to confirm these instructions. `
  + 'CLA Title will NEVER change wire instructions by email, text or phone. If you get a message saying the instructions changed, it is fraud: do not send money, call us.';
