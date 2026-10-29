// Shared constants: roles, stages, statuses. Used by the UI, the mock adapter and mirrored in SQL (supabase/migrations).
export const ROLES = [
  'Sales Processor', 'Sales Person', 'Sales Team', 'Transaction Coordinator',
  'Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller',
];
export const STAFF_ROLES = ['Sales Processor', 'Sales Person', 'Sales Team'];
// Back-office user who runs the deal workflow. NOT an admin: user/team admin is the separate isAdmin flag on an account (as in the old portal).
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
// Participant roles on a deal = the 8 portal roles plus non-login parties
export const PARTICIPANT_ROLES = [...ROLES, 'Lender', 'HOA', 'Other'];
export const MAX_UPLOAD_BYTES = 1_500_000;   // demo limit only (mock stores files in localStorage)
export const ALLOWED_UPLOAD_EXT = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'png', 'jpg', 'jpeg'];
