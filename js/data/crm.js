/* crm.js : shared CRM constants and pure helpers (John, Nov 2). Used by the screens, the mock adapter and the unit tests;
 * the same lists are CHECK constraints in SQL (migration 22). FAKE DATA ONLY in this build. See docs/CRM.md. */
export const LEAD_STATUSES = ['New', 'Contacted', 'Qualified', 'Unqualified'];
export const LEAD_SOURCES = ['Referral', 'Website', 'Open house', 'Event', 'Cold call', 'Past client', 'Social media', 'Other'];
export const CRM_STAGES = [['prospect', 'Prospect'], ['active_partner', 'Active Partner'], ['inactive', 'Inactive']];
export const CRM_STAGE_CODES = CRM_STAGES.map(([c]) => c);
export const crmStageLabel = (c) => (CRM_STAGES.find(([k]) => k === c) || [null, ''])[1];
// pipeline of referral-partner opportunities (one opportunity = winning a realtor / brokerage / lender as a source of orders)
export const OPP_STAGES = ['New', 'Meeting set', 'Proposal', 'Won', 'Lost'];
export const ACTIVITY_KINDS = [['call', 'Call'], ['email', 'Email (logged only, nothing is sent)'], ['meeting', 'Meeting'], ['note', 'Note'], ['task', 'Follow-up task']];
export const ACTIVITY_KIND_CODES = ACTIVITY_KINDS.map(([c]) => c);
export const activityKindLabel = (c) => ({ call: 'Call', email: 'Email', meeting: 'Meeting', note: 'Note', task: 'Follow-up' })[c] || c;
export const TASK_STATES = ['open', 'done', 'cancelled'];
export const ACCOUNT_KINDS = [['brokerage', 'Brokerage'], ['lender', 'Lender'], ['other', 'Other']];
export const ACCOUNT_KIND_CODES = ACCOUNT_KINDS.map(([c]) => c);
export const accountKindLabel = (c) => (ACCOUNT_KINDS.find(([k]) => k === c) || [null, ''])[1];
export const CRM_ENTITIES = ['lead', 'contact', 'account', 'opportunity'];
export const accountKindForType = (t) => ({ realtor: 'brokerage', lender: 'lender' })[t] || 'other';

// ACCESS (mirrored by private.crm_* in SQL). Staff only: Admin / Super admin (all, edit), Sales Person (own + linked, edit),
// Sales Team (the sales team's records: owned by any salesperson or unowned, plus linked; edit), Processor (everything, READ-ONLY).
// Transaction Coordinators and outside users (agents, clients) have no CRM.
export const CRM_ROLES = ['Processor', 'Sales Person', 'Sales Team'];
export const canUseCrm = (u) => !!u && (!!u.isAdmin || CRM_ROLES.includes(u.role));
export const crmReadOnly = (u) => !!u && !u.isAdmin && u.role === 'Processor';
export const CRM_OWNER_ROLES = ['Sales Person', 'Sales Team'];   // who can own a lead / contact / account / opportunity / follow-up

// tags: comma list or array -> trimmed, lower-case, unique, max 10 x 30 chars
export const normTags = (v) => [...new Set((Array.isArray(v) ? v : String(v == null ? '' : v).split(','))
  .map((t) => String(t).trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 30)).filter(Boolean))].slice(0, 10);

// LIST VIEWS: search (words across the given fields), filters, sort. Pure, so the unit tests cover it.
// filters: { q, ownerId ('' any, 'none' unassigned), contactType ('' any, 'none', code), stage, status, source, kind, archived ('' hide, 'only', 'all'), converted ('' hide, 'all', 'only') }
export function crmFilter(rows, f = {}, fields = ['name', 'email', 'company', 'phone']) {
  const words = String(f.q || '').toLowerCase().split(/\s+/).filter(Boolean);
  const eq = (want, have) => !want || (want === 'none' ? !have : have === want);
  return rows.filter((r) => {
    const hay = fields.map((k) => (Array.isArray(r[k]) ? r[k].join(' ') : r[k] || '')).join(' ').toLowerCase();
    if (!words.every((w) => hay.includes(w))) return false;
    if (!eq(f.ownerId, r.ownerId) || !eq(f.contactType, r.contactType) || !eq(f.stage, r.stage) || !eq(f.status, r.status) || !eq(f.source, r.source) || !eq(f.kind, r.kind)) return false;
    if (f.tag && !(r.tags || []).includes(String(f.tag).toLowerCase())) return false;
    const arch = f.archived || ''; if (arch === '' && r.archived) return false; if (arch === 'only' && !r.archived) return false;
    if ('converted' in r || f.converted) { const cv = f.converted || ''; if (cv === '' && r.converted) return false; if (cv === 'only' && !r.converted) return false; }
    return true;
  });
}
export function crmSort(rows, key = 'name', dir = 'asc') {
  const m = dir === 'desc' ? -1 : 1;
  const val = (r) => { const v = r[key]; return v == null || v === '' ? null : v; };
  return [...rows].sort((a, b) => { const x = val(a), y = val(b);
    if (x === null && y === null) return String(a.name || '').localeCompare(String(b.name || ''));
    if (x === null) return 1; if (y === null) return -1;   // blanks last either way
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'en', { numeric: true, sensitivity: 'base' });
    return c * m || String(a.name || '').localeCompare(String(b.name || '')); });
}
// CSV (RFC 4180 quoting; cells starting with = + - @ are prefixed with ' so a spreadsheet never runs them as formulas)
export function toCsv(cols, rows) {
  const cell = (v) => { let s = v == null ? '' : String(v); if (/^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s; return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.map(([, label]) => cell(label)).join(','), ...rows.map((r) => cols.map(([k]) => cell(r[k])).join(','))].join('\r\n') + '\r\n';
}
// order totals for a list of { status, purchasePrice } (volume = purchase price of every order that is not Cancelled)
export function orderTotals(orders) {
  const t = { orders: 0, open: 0, closed: 0, cancelled: 0, volume: 0 };
  orders.forEach((o) => { t.orders += 1; if (o.status === 'Closed') t.closed += 1; else if (o.status === 'Cancelled') t.cancelled += 1; else t.open += 1;
    if (o.status !== 'Cancelled') t.volume += Number(o.purchasePrice) || 0; });
  return t;
}
