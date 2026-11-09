/* crm.js : shared CRM constants and pure helpers (John, Nov 2). Used by the screens, the mock adapter and the unit tests;
 * the same lists are CHECK constraints in SQL (migrations 22 + 24). FAKE DATA ONLY in this build. See docs/CRM.md.
 * Nov 2 (Zoho match, migration 24 / mock v17): picklists, labels and task / meeting fields copied from John's Zoho training videos
 * (Zoho modules renamed there: Clients = Contacts, Companies = Accounts). */
// ---- Zoho picklists (exact labels from the videos) ----
export const ROLES_IN_COMPANY = ['Realtor', 'Real Estate Broker', 'Transaction Coordinator', 'Loan Officer', 'Mortgage Broker', 'Team Lead'];
export const LEAD_SOURCES = ['Business Group', 'Call in/Walk in', 'Direct Mail', 'Door Knocking', 'Email Campaign', 'Existing Client or Agent', 'Facebook/IG Ads', 'Facebook Group',
  'FB/IG Organic', 'Google Ads', 'Other Agent (Our Team)', 'Partnering w/ Other Agents', 'Personal Network', 'Re-assigned', 'Search Engine', 'Social Media', 'Warm Call'];
export const RELATIONSHIP_STATUSES = ['Potential/Warm', 'Prospecting', 'Not Interested', 'Unresponsive', 'Converted/Current Client', 'Churn'];   // CLIENTS (unchanged)
// Janine, Nov 3: LEADS have their own Relationship Status list, in this order. A lead holding an older value keeps it (shown as stored, never erased).
export const LEAD_RELATIONSHIP_STATUSES = ['Met With', 'Meeting Set', 'Open to Meet', 'Hot Prospect', 'Shows Interest', 'Not Interested', 'Do NOT Contact', 'Prospecting',
  'Voicemail 1', 'Voicemail 2', 'Voicemail 3', 'Voicemail 4', 'Voicemail 5', 'Need to find contact info', 'Need to verify contact info', 'No longer in real estate', 'Out of Range'];
export const LEAD_STATUS_DEFAULT = 'Prospecting';
export const CONVERTED_STATUS = 'Converted/Current Client';
export const LEAD_STATUSES = RELATIONSHIP_STATUSES;   // a lead's status IS its Relationship Status (lead form ~ client form)
export const TASK_SUBJECTS = ['Email', 'Call', 'Follow-up', 'Send Quote', 'Send Letter', 'Send Email', 'Other'];   // combobox: free text allowed
export const TASK_STATUSES = ['Not Started', 'Deferred', 'In Progress', 'Completed', 'Waiting for input'];
export const TASK_CLOSED = 'Completed';
export const TASK_PRIORITIES = ['Highest', 'High', 'Normal', 'Low', 'Lowest'];
export const REPEAT_EVERY = [['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['quarterly', 'Quarterly'], ['yearly', 'Yearly']];   // Janine, Nov 3: + Quarterly, Yearly
export const REPEAT_CODES = REPEAT_EVERY.map(([c]) => c);
export const MEETING_TYPES = ['Phone Meeting', 'Virtual Meeting', 'Coffee', 'Lunch Meeting', 'Office Stop By'];
// Social Media Links & Web Addresses (+ Zillow URL in Client Information). Only http / https links are kept.
export const LINK_FIELDS = [['website', 'Website'], ['facebookProfile', 'Facebook Profile'], ['facebookGroup', 'Facebook Group'], ['facebookPage', 'Facebook Business Page'],
  ['linkedin', 'LinkedIn Profile'], ['instagram', 'Instagram Profile'], ['zillowProfile', 'Zillow Profile'], ['linktree', 'Linktree'], ['other1', 'Other Link 1'], ['other2', 'Other Link 2'], ['other3', 'Other Link 3']];
export const LINK_KEYS = LINK_FIELDS.map(([k]) => k);
// Home > task widget filter (Zoho Classic View), default My Open Tasks
export const HOME_TASK_FILTERS = ["Closed Tasks", "Next 7 Days + Overdue Tasks", "Open Tasks", "Overdue Tasks", "Today + Overdue Tasks", "Today's Tasks", "Tomorrow's Tasks", "All Tasks", "My Open Tasks", "My Tasks"];
export const HOME_TASK_DEFAULT = 'My Open Tasks';

// ---- older CRM lists (Nov 2 first cut) kept only to carry stored data forward ----
export const OLD_LEAD_SOURCES = ['Referral', 'Website', 'Open house', 'Event', 'Cold call', 'Past client', 'Social media', 'Other'];
export const SOURCE_FROM_OLD = { 'Referral': 'Existing Client or Agent', 'Website': 'Search Engine', 'Open house': 'Call in/Walk in', 'Event': 'Business Group', 'Cold call': 'Warm Call',
  'Past client': 'Existing Client or Agent', 'Social media': 'Social Media', 'Other': '' };
export const STATUS_FROM_OLD = { 'New': 'Potential/Warm', 'Contacted': 'Prospecting', 'Qualified': 'Prospecting', 'Unqualified': 'Not Interested' };
export const STAGE_TO_STATUS = { prospect: 'Prospecting', active_partner: CONVERTED_STATUS, inactive: 'Churn' };
export const TASK_STATUS_FROM_OLD = { open: 'Not Started', done: TASK_CLOSED, cancelled: TASK_CLOSED };
export const roleForContactType = (t) => ({ realtor: 'Realtor', lender: 'Loan Officer' })[t] || '';
export const CRM_STAGES = [['prospect', 'Prospect'], ['active_partner', 'Active Partner'], ['inactive', 'Inactive']];   // superseded by Relationship Status (kept for old data)
export const CRM_STAGE_CODES = CRM_STAGES.map(([c]) => c);
export const crmStageLabel = (c) => (CRM_STAGES.find(([k]) => k === c) || [null, ''])[1];
// pipeline of referral-partner opportunities (one opportunity = winning a realtor / brokerage / lender as a source of orders)
export const OPP_STAGES = ['New', 'Meeting set', 'Proposal', 'Won', 'Lost'];
// what can be LOGGED as already happened (tasks and meetings have their own forms)
export const ACTIVITY_KINDS = [['call', 'Call'], ['email', 'Email (logged only, nothing is sent)'], ['note', 'Note']];
export const ACTIVITY_KIND_CODES = ['call', 'email', 'meeting', 'note', 'task'];
export const activityKindLabel = (c) => ({ call: 'Call', email: 'Email', meeting: 'Meeting', note: 'Note', task: 'Task' })[c] || c;
export const ACCOUNT_KINDS = [['brokerage', 'Brokerage'], ['lender', 'Lender'], ['other', 'Other']];
export const ACCOUNT_KIND_CODES = ACCOUNT_KINDS.map(([c]) => c);
export const accountKindLabel = (c) => (ACCOUNT_KINDS.find(([k]) => k === c) || [null, ''])[1];
export const CRM_ENTITIES = ['lead', 'contact', 'account', 'opportunity'];
export const entityLabel = (e) => ({ lead: 'Lead', contact: 'Client', account: 'Company', opportunity: 'Opportunity' })[e] || e;
export const accountKindForType = (t) => ({ realtor: 'brokerage', lender: 'lender' })[t] || 'other';

// ---- URLs: only http(s). "www.x.com" gets https:// in front. Anything else (javascript:, data:, mailto:...) is refused. ----
export function cleanUrl(v) {
  let s = String(v == null ? '' : v).trim(); if (!s) return '';
  if (s.length > 500) throw new Error('A link can be at most 500 characters.');
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
  let u; try { u = new URL(s); } catch (e) { throw new Error(`"${String(v).trim().slice(0, 60)}" is not a valid web address.`); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Links must start with http:// or https://.');
  if (!u.hostname || !u.hostname.includes('.') || /\s/.test(s)) throw new Error(`"${String(v).trim().slice(0, 60)}" is not a valid web address.`);
  return u.href;
}
// for rendering: the link if it is http(s), else '' (data from elsewhere is checked again before it becomes an href)
export const safeHref = (v) => { try { const s = cleanUrl(v); return s; } catch (e) { return ''; } };

// ---- dates / times (local, minute precision: 'YYYY-MM-DDTHH:MM') ----
const p2 = (n) => String(n).padStart(2, '0');
export const localStamp = (d = new Date()) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
export const addDaysTo = (ymd, n) => { const [y, m, d] = ymd.split('-').map(Number); const t = new Date(y, m - 1, d + n); return `${t.getFullYear()}-${p2(t.getMonth() + 1)}-${p2(t.getDate())}`; };
// Calendar days between two YYYY-MM-DD dates. UTC date parts, so a DST change does not change the count.
export const daysBetween = (fromYmd, toYmd) => {
  if (!fromYmd || !toYmd) return null;
  const [y1, m1, d1] = fromYmd.split('-').map(Number); const [y2, m2, d2] = toYmd.split('-').map(Number);
  if (![y1, m1, d1, y2, m2, d2].every((n) => Number.isFinite(n))) return null;
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
};
// Local calendar day of a stored timestamp. A date-only value stays that date. Blank stays blank (never invented).
export function localDayOfStamp(iso) {
  const s = String(iso || ''); if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s); if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}
export function inLocalRange(iso, from, to) {
  if (!from && !to) return true;
  const day = localDayOfStamp(iso);
  if (!day) return false;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}
// Open tasks only. Undated and completed tasks have no due color.
export function dueTone(due, today, open) {
  if (!open || !due) return 'none';
  if (due < today) return 'overdue';
  if (due === today) return 'today';
  return 'future';
}
export function daysOverdue(due, today) {
  const n = daysBetween(due, today);
  return n != null && n > 0 ? n : 0;
}
// next due date of a repeating task. Monthly / quarterly / yearly step 1 / 3 / 12 calendar months and keep the ANCHOR day (the day of the
// month of the series' first due date), clamped to the month's last day: Jan 31 -> Feb 28 -> Mar 31 (not Mar 28); Feb 29 yearly -> Feb 28 -> ... -> Feb 29.
// anchorDay defaults to the day of ymd (older callers / tasks without an anchor).
export const REPEAT_MONTHS = { monthly: 1, quarterly: 3, yearly: 12 };
export function nextDue(ymd, every, anchorDay = null) {
  if (every === 'daily') return addDaysTo(ymd, 1); if (every === 'weekly') return addDaysTo(ymd, 7);
  const step = REPEAT_MONTHS[every];
  if (step) { const [y, m, d] = ymd.split('-').map(Number); const want = Math.min(31, Math.max(1, Number(anchorDay) || d));
    const mi = m - 1 + step; const ny = y + Math.floor(mi / 12), nm = mi % 12; const last = new Date(ny, nm + 1, 0).getDate();
    return `${ny}-${p2(nm + 1)}-${p2(Math.min(want, last))}`; }
  throw new Error('Repeat must be daily, weekly, monthly, quarterly or yearly.');
}
// company DUPLICATES (Janine, Nov 3): names compared case / punctuation / spacing-insensitively, "&" = "and", a leading "The" and trailing
// Inc / LLC / LLP / Ltd / Co / Corp / Corporation / Company / PLLC / PC dropped. "Harbor Realty, LLC" = "harbor realty" = "HARBOR  REALTY INC."
const CO_WORDS = new Set(['inc', 'incorporated', 'llc', 'llp', 'ltd', 'corp', 'corporation', 'pllc']);
const CO_SUFFIX = /\s+(inc|incorporated|llc|l l c|llp|ltd|limited|co|corp|corporation|company|pllc|pc|lp)$/;
export function companyKey(name) {
  let s = String(name == null ? '' : name).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().replace(/(^| )l l (c|p)(?= |$)/g, '$1ll$2').replace(/^the\s+/, '');   // "L.L.C." = "LLC"
  for (let i = 0; i < 3 && CO_SUFFIX.test(s); i++) s = s.replace(CO_SUFFIX, '').trim();
  const t = s.split(' ').filter((w) => !CO_WORDS.has(w)).join(' ');   // "Harbor Realty LLC (fake)" = "Harbor Realty (fake)"
  return t || s;
}
export const taskOpen = (t) => t.status !== TASK_CLOSED;
export const meetingEnd = (m) => (m.allDay ? String(m.endsAt || m.startsAt || '').slice(0, 10) + 'T23:59' : String(m.endsAt || ''));
export const meetingOpen = (m, nowStamp = localStamp()) => meetingEnd(m) >= nowStamp;
export const priorityRank = (p) => { const i = TASK_PRIORITIES.indexOf(p); return i < 0 ? 9 : i; };

// HOME task widget filter (pure). today = 'YYYY-MM-DD' local. "Today's / Tomorrow's Tasks" = due that day, any status; the others as named.
export function homeTaskFilter(tasks, filter, meId, today) {
  const tomorrow = addDaysTo(today, 1), week = addDaysTo(today, 7);
  const f = {
    'Closed Tasks': (t) => !taskOpen(t),
    'Next 7 Days + Overdue Tasks': (t) => taskOpen(t) && t.dueDate <= week,
    'Open Tasks': (t) => taskOpen(t),
    'Overdue Tasks': (t) => taskOpen(t) && t.dueDate < today,
    'Today + Overdue Tasks': (t) => taskOpen(t) && t.dueDate <= today,
    "Today's Tasks": (t) => t.dueDate === today,
    "Tomorrow's Tasks": (t) => t.dueDate === tomorrow,
    'All Tasks': () => true,
    'My Open Tasks': (t) => taskOpen(t) && t.ownerId === meId,
    'My Tasks': (t) => t.ownerId === meId,
  }[filter];
  if (!f) throw new Error('Unknown task filter.');
  return tasks.filter(f);
}
// sort for the widget columns (dueDate, subject, relatedTo, contactName, status, priority); blanks last; ties by due date then subject
// order = { priority: [...values], status: [...values] } from CRM Settings (defaults: the built-in lists)
export function sortTasks(rows, key = 'dueDate', dir = 'asc', order = {}) {
  const m = dir === 'desc' ? -1 : 1; const pr = order.priority || TASK_PRIORITIES, st = order.status || TASK_STATUSES;
  const rank = (list, v) => { const i = list.indexOf(v); return i < 0 ? 99 : i; };
  const val = (r) => (key === 'priority' ? rank(pr, r.priority) : key === 'status' ? rank(st, r.status) : r[key] == null || r[key] === '' ? null : String(r[key]));
  return [...rows].sort((a, b) => { const x = val(a), y = val(b);
    if (x === null && y !== null) return 1; if (y === null && x !== null) return -1;
    const c = x === null ? 0 : typeof x === 'number' ? x - y : x.localeCompare(y, 'en', { numeric: true, sensitivity: 'base' });
    return c * m || String(a.dueDate || '').localeCompare(String(b.dueDate || '')) || String(a.subject || '').localeCompare(String(b.subject || '')); });
}
// a record page's related lists (Zoho): Notes, Open Activities, Closed Activities, Invited Meetings
export function relatedLists(acts, invited = [], nowStamp = localStamp()) {
  // video 11: a scheduled call is open until it is marked completed
  const isOpen = (a) => (a.kind === 'task' ? taskOpen(a) : a.kind === 'meeting' ? meetingOpen(a, nowStamp) : a.kind === 'call' ? a.callStatus === 'Scheduled' : false);
  const when = (a) => (a.kind === 'task' ? a.dueDate || '' : a.kind === 'meeting' ? a.startsAt || '' : a.kind === 'call' && a.callStart ? a.callStart : a.occurredOn || String(a.createdAt || '').slice(0, 10));
  const acts2 = acts.filter((a) => a.kind !== 'note');
  return { notes: acts.filter((a) => a.kind === 'note'),
    open: acts2.filter(isOpen).sort((a, b) => when(a).localeCompare(when(b))),
    closed: acts2.filter((a) => !isOpen(a)).sort((a, b) => when(b).localeCompare(when(a))),
    invited: invited.filter((m) => m.kind === 'meeting').sort((a, b) => String(b.startsAt).localeCompare(String(a.startsAt))) };
}
// Amount by Stage (Home): estimated volume of the open pipeline per stage (archived opportunities left out)
// stages = the Pipeline Stage values in order (CRM Settings); a retired stage still shows while open opportunities use it
export function amountByStage(opps, stages = OPP_STAGES, retired = []) {
  const list = stages.filter((s) => !retired.includes(s) || opps.some((o) => o.stage === s && !o.archived));
  return list.map((stage) => { const l = opps.filter((o) => o.stage === stage && !o.archived); return { stage, count: l.length, amount: l.reduce((n, o) => n + (Number(o.estVolume) || 0), 0) }; });
}
// v16 -> v17 (mock data) and the fresh seed: old picklist values -> Zoho values, follow-up tasks -> Zoho tasks, logged meetings -> meetings.
// Idempotent (a row already in the new shape is left alone). Never removes a record.
export function crmZohoUpgrade(d) {
  const blankPerson = { roleInCompany: '', title: '', mobile: '', assistant: '', asstPhone: '', agentSplit: null, licenseNo: '', salesVolumeLastYear: null, dealsClosedLastYear: null,
    zillowUrl: '', street: '', city: '', state: '', zip: '', county: '', links: {}, leadSource: '' };
  (d.crmLeads || []).forEach((l) => {
    if (OLD_LEAD_SOURCES.includes(l.source)) l.source = SOURCE_FROM_OLD[l.source]; else if (l.source && !LEAD_SOURCES.includes(l.source)) l.source = '';
    if (!RELATIONSHIP_STATUSES.includes(l.status)) l.status = l.convertedAt ? CONVERTED_STATUS : STATUS_FROM_OLD[l.status] || 'Potential/Warm';
    if (l.convertedAt) l.status = CONVERTED_STATUS;
    for (const [k, v] of Object.entries(blankPerson)) if (l[k] === undefined && k !== 'leadSource') l[k] = typeof v === 'object' && v ? {} : v;
    if (!l.roleInCompany) l.roleInCompany = roleForContactType(l.contactType);
    if (l.modifiedAt === undefined) { l.modifiedAt = l.createdAt || null; l.modifiedBy = l.createdBy || null; } });
  (d.contacts || []).forEach((c) => { if (!('crmOwnerId' in c) && !('crmStage' in c) && !('relationshipStatus' in c)) return;   // never in the CRM: leave untouched
    for (const [k, v] of Object.entries(blankPerson)) if (c[k] === undefined) c[k] = typeof v === 'object' && v ? {} : v;
    if (c.relationshipStatus === undefined) c.relationshipStatus = STAGE_TO_STATUS[c.crmStage] || '';
    if (!c.roleInCompany) c.roleInCompany = roleForContactType(c.contactType); });
  (d.crmActivities || []).forEach((a) => {
    if (a.kind === 'task' && !TASK_STATUSES.includes(a.status)) { if (a.status === 'cancelled') a.cancelled = true; a.status = TASK_STATUS_FROM_OLD[a.status] || 'Not Started';
      Object.assign(a, { priority: a.priority || 'High', reminder: false, reminderAt: null, repeatEvery: null, repeatUntil: null, closedAt: a.status === TASK_CLOSED ? a.doneAt || a.createdAt : null,
        modifiedBy: a.createdBy, modifiedAt: a.doneAt || a.createdAt }); }
    if (a.kind === 'meeting' && a.startsAt === undefined) Object.assign(a, { allDay: true, startsAt: a.occurredOn, endsAt: a.occurredOn, location: '', meetingType: '', hostId: a.createdBy || a.ownerId || null, participants: [] });
  });
  d.crmAttachments ||= [];
  return d;
}

// ACCESS (mirrored by private.crm_module_user() in SQL). Admin / Super admin, Sales Person, and Sales Team.
// Processor and Preprocessor use the rest of the portal (orders, Place Order, file email) and do not open the CRM module.
// Transaction Coordinators and outside users (agents, clients) have no CRM.
export const CRM_ROLES = ['Sales Person', 'Sales Team'];
export const canUseCrm = (u) => !!u && (!!u.isAdmin || CRM_ROLES.includes(u.role));
export const crmReadOnly = (u) => !!u && !u.isAdmin && (u.role === 'Processor' || u.role === 'Preprocessor');
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
    if (['ownerId', 'contactType', 'stage', 'status', 'source', 'kind', 'roleInCompany', 'relationshipStatus', 'leadSource', 'state'].some((k) => !eq(f[k], r[k]))) return false;
    if (f.county && (f.county === 'none' ? !!r.county : String(r.county || '').toLowerCase() !== String(f.county).toLowerCase())) return false;
    if (f.tag && !(r.tags || []).includes(String(f.tag).toLowerCase())) return false;
    // custom fields (CRM Settings): filter names cf_<id>; 'none' = blank
    if (Object.keys(f).some((k) => k.startsWith('cf_') && f[k] && (f[k] === 'none' ? !(r[k] == null || r[k] === '') : String(r[k] ?? '') !== String(f[k])))) return false;
    const arch = f.archived || ''; if (arch === '' && r.archived) return false; if (arch === 'only' && !r.archived) return false;
    if ('converted' in r || f.converted) { const cv = f.converted || ''; if (cv === '' && r.converted) return false; if (cv === 'only' && !r.converted) return false; }
    if (!inLocalRange(r.createdAt, f.createdFrom, f.createdTo)) return false;
    if (!inLocalRange(r.modifiedAt, f.modifiedFrom, f.modifiedTo)) return false;
    if (!inLocalRange(r.lastActivityAt, f.activityFrom, f.activityTo)) return false;
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
