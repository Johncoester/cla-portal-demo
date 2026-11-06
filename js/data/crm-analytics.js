/* crm-analytics.js : GLOBAL SEARCH, REPORTS and DASHBOARDS engine (Janine / John, Nov 3; Zoho videos 7, 9, 10). PURE (no storage, no DOM), so the
 * mock adapter, the Supabase adapter, the screens and the unit tests share it. FAKE DATA ONLY.
 *  * MODULES: the CRM modules as flat rows (Clients, Leads, Companies, Deals = the portal's orders, Tasks, Meetings, Calls, Opportunities). The adapter
 *    builds the rows from the records the viewer may see; this file only filters, groups, counts and sums them.
 *  * FILTERS (criteria): [{ field, op, value, value2 }] combined with AND or OR. Date presets (Previous / Current / Next FY, Month, Year...).
 *  * GROUPING with date buckets (By Day, By Calendar Week, By Month, By Quarter, By Year) and measures (Record Count, Sum / Avg of a number field).
 *  * REPORTS: columns, row groups ("Owner (count)"), aggregate columns (sum, avg, min, max, count), CSV.
 *  * SEARCH: words in name / email, phone by digits only. */
import { optLabel, activeFields, customDisplay, cfKey } from './crm-config.js?v=202611060013';

// ---------- modules ----------
export const MODULES = [['contacts', 'Clients'], ['leads', 'Leads'], ['accounts', 'Companies'], ['deals', 'Deals'], ['tasks', 'Tasks'], ['meetings', 'Meetings'], ['calls', 'Calls'], ['opportunities', 'Opportunities']];
export const MODULE_CODES = MODULES.map(([c]) => c);
export const moduleName = (m) => (MODULES.find(([c]) => c === m) || [null, m])[1];
export const SEARCH_MODULES = ['contacts', 'leads', 'accounts', 'deals', 'tasks', 'meetings', 'calls'];   // video 7 groups, in this order
export const REPORT_MODULES = ['contacts', 'leads', 'accounts', 'deals', 'tasks', 'meetings', 'calls'];   // video 10 "Select Primary Module"
export const DASH_MODULES = MODULE_CODES;   // video 9: every module
// the custom-field entity behind a module (CRM Settings)
export const CF_ENTITY_OF = { contacts: 'contact', leads: 'lead', accounts: 'account', opportunities: 'opportunity' };
// Deals = the portal's orders. Zoho's deal stages seen in video 10 were Active, Closed, Won, Lost, Cancelled, On Hold; an order is Open (= Active), Closed, On Hold or Cancelled.
export const DEAL_STAGES = [['Active', 'Active'], ['Closed', 'Closed'], ['On Hold', 'On Hold'], ['Cancelled', 'Cancelled']];
export const dealStageOf = (status) => (status === 'Open' ? 'Active' : status || '');
export const CALL_TYPES = [['Outbound', 'Outbound'], ['Inbound', 'Inbound'], ['Missed', 'Missed']];

// field: { key, label, type, list (picklist key in CRM Settings) | options ([[v, l]]), labelKey (user / lookup display), link (row key holding a link) }
// types: text, email, phone, number, currency, percent, date, datetime, picklist, user, boolean
const F = (key, label, type = 'text', extra = {}) => ({ key, label, type, ...extra });
const BASE = {
  contacts: [F('name', 'Client Name', 'text', { link: '_link' }), F('firstName', 'First Name'), F('lastName', 'Last Name'), F('email', 'Email', 'email'), F('phone', 'Phone', 'phone'), F('mobile', 'Mobile', 'phone'),
    F('companyName', 'Company Name', 'text', { link: '_companyLink' }), F('roleInCompany', 'Role in Company', 'picklist', { list: 'roleInCompany' }), F('relationshipStatus', 'Relationship Status', 'picklist', { list: 'relationshipStatus' }),
    F('leadSource', 'Lead Source', 'picklist', { list: 'leadSource' }), F('ownerId', 'Client Owner', 'user', { labelKey: 'ownerName' }), F('title', 'Title'), F('city', 'Mailing City'), F('state', 'Mailing State'), F('zip', 'Zip Code'),
    F('county', 'County'), F('tags', 'Tag'), F('lastContactedOn', 'Last Contacted', 'date'), F('orders', 'Total Orders', 'number'), F('volume', 'Order Volume', 'currency'),
    F('salesVolumeLastYear', 'Sales Volume (Last Year)', 'currency'), F('dealsClosedLastYear', 'Deals Closed (Last Year)', 'number'), F('agentSplit', 'Agent Split (%)', 'percent'),
    F('archived', 'Archived', 'boolean'), F('createdBy', 'Created By', 'user', { labelKey: 'createdByName' }), F('createdAt', 'Created Time', 'datetime'), F('modifiedAt', 'Modified Time', 'datetime')],
  leads: [F('name', 'Lead Name', 'text', { link: '_link' }), F('firstName', 'First Name'), F('lastName', 'Last Name'), F('company', 'Company'), F('email', 'Email', 'email'), F('phone', 'Phone', 'phone'), F('mobile', 'Mobile', 'phone'),
    F('leadSource', 'Lead Source', 'picklist', { list: 'leadSource' }), F('relationshipStatus', 'Relationship Status', 'picklist', { list: 'leadRelationshipStatus' }), F('roleInCompany', 'Role in Company', 'picklist', { list: 'roleInCompany' }),
    F('ownerId', 'Lead Owner', 'user', { labelKey: 'ownerName' }), F('city', 'City'), F('state', 'State'), F('county', 'County'), F('converted', 'Converted', 'boolean'), F('archived', 'Archived', 'boolean'),
    F('createdBy', 'Created By', 'user', { labelKey: 'createdByName' }), F('createdAt', 'Created Time', 'datetime'), F('modifiedAt', 'Modified Time', 'datetime')],
  accounts: [F('name', 'Company Name', 'text', { link: '_link' }), F('kind', 'Type', 'picklist', { list: 'accountKind' }), F('phone', 'Phone', 'phone'), F('website', 'Website'), F('city', 'City'), F('state', 'State'),
    F('ownerId', 'Company Owner', 'user', { labelKey: 'ownerName' }), F('contacts', 'Clients', 'number'), F('orders', 'Total Orders', 'number'), F('volume', 'Order Volume', 'currency'), F('archived', 'Archived', 'boolean'),
    F('createdBy', 'Created By', 'user', { labelKey: 'createdByName' }), F('createdAt', 'Created Time', 'datetime')],
  deals: [F('name', 'Deal Name', 'text', { link: '_link' }), F('fileNumber', 'File Number', 'text', { link: '_link' }), F('propertyAddress', 'Property Address', 'text', { link: '_link' }), F('amount', 'Amount', 'currency'),
    F('loanAmount', 'Loan Amount', 'currency'), F('stage', 'Stage', 'picklist', { options: DEAL_STAGES }), F('closingDate', 'Closing Date', 'date'), F('openDate', 'Open Date', 'date'),
    F('clientName', "Client's Name", 'text', { link: '_clientLink' }), F('contactName', 'Contact Name'), F('ownerId', 'Deal Owner', 'user', { labelKey: 'ownerName' }), F('salesReps', 'Sales Reps'),
    F('county', 'County'), F('city', 'City'), F('transactionType', 'Transaction Type'), F('lenderName', 'Lender'), F('createdAt', 'Created Time', 'datetime'),
    // Janine, Nov 4 (video "Disbursement Details - Deals"): the Disbursement Details section of a deal (crm-disbursement.js; table deal_disbursements)
    F('disbursementDate', 'Disbursement Date', 'date'), F('actualRevenue', 'Actual Revenue', 'currency'), F('netTitleInsurance', 'Net Title Insurance', 'currency'),
    F('settlementFee', 'Settlement Fee', 'currency'), F('netEndorsementFee', 'Net Endorsement Fee', 'currency'), F('qualiaFee', 'Qualia Fee', 'currency'), F('shippingFee', 'Shipping Fee', 'currency'),
    F('nationalTitleResource', 'National Title Resource', 'currency'), F('notaryFee', 'Notary Fee', 'currency'), F('searchesFee', 'Searches', 'currency')],
  tasks: [F('subject', 'Subject', 'text', { link: '_link' }), F('dueDate', 'Due Date', 'date'), F('status', 'Status', 'picklist', { list: 'taskStatus' }), F('priority', 'Priority', 'picklist', { list: 'taskPriority' }),
    F('relatedTo', 'Related To', 'text', { link: '_relatedLink' }), F('contactName', 'Contact Name', 'text', { link: '_contactLink' }), F('ownerId', 'Task Owner', 'user', { labelKey: 'ownerName' }),
    F('closedAt', 'Closed Time', 'datetime'), F('createdBy', 'Created By', 'user', { labelKey: 'createdByName' }), F('createdAt', 'Created Time', 'datetime'), F('modifiedAt', 'Modified Time', 'datetime')],
  meetings: [F('subject', 'Title', 'text', { link: '_link' }), F('startsAt', 'From', 'datetime'), F('endsAt', 'To', 'datetime'), F('relatedTo', 'Related To', 'text', { link: '_relatedLink' }),
    F('contactName', 'Contact Name', 'text', { link: '_contactLink' }), F('meetingType', 'Type', 'picklist', { list: 'meetingType' }), F('location', 'Location'), F('hostId', 'Host', 'user', { labelKey: 'hostName' }),
    F('createdBy', 'Created By', 'user', { labelKey: 'createdByName' }), F('createdAt', 'Created Time', 'datetime')],
  calls: [F('subject', 'Subject', 'text', { link: '_link' }), F('callType', 'Call Type', 'picklist', { options: CALL_TYPES }), F('callStart', 'Call Start Time', 'datetime'), F('callDuration', 'Call Duration (minutes)', 'number'),
    F('relatedTo', 'Related To', 'text', { link: '_relatedLink' }), F('contactName', 'Contact Name', 'text', { link: '_contactLink' }), F('ownerId', 'Call Owner', 'user', { labelKey: 'ownerName' }), F('createdAt', 'Created Time', 'datetime')],
  opportunities: [F('name', 'Opportunity Name', 'text', { link: '_link' }), F('stage', 'Stage', 'picklist', { list: 'oppStage' }), F('estVolume', 'Estimated yearly volume', 'currency'), F('expectedClose', 'Expected close', 'date'),
    F('contactName', 'Client', 'text', { link: '_contactLink' }), F('accountName', 'Company', 'text', { link: '_accountLink' }), F('ownerId', 'Owner', 'user', { labelKey: 'ownerName' }), F('archived', 'Archived', 'boolean'), F('createdAt', 'Created Time', 'datetime')],
};
// custom field type -> analytics type (encrypted fields and computed-only ones are still listed; encrypted values are masked)
const CF_TYPE = { text: 'text', textarea: 'text', email: 'email', phone: 'phone', url: 'text', number: 'number', decimal: 'number', longint: 'number', autonumber: 'text', currency: 'currency', percent: 'percent',
  date: 'date', datetime: 'datetime', checkbox: 'boolean', dropdown: 'picklist', radio: 'picklist', multiselect: 'text', user: 'user', lookup: 'text', formula: 'number', rollup: 'number', address: 'text', file: 'text', image: 'text' };
// all fields of a module (built-in + the active custom fields the viewer may see; cfg = getCrmSettings() for this viewer)
export function moduleFields(module, cfg) {
  const base = (BASE[module] || []).map((f) => ({ ...f }));
  const ent = CF_ENTITY_OF[module]; if (!ent || !cfg) return base;
  return [...base, ...activeFields(cfg, ent).filter((f) => f.canView !== false).map((f) => ({ key: cfKey(f.id), label: f.label, type: f.type === 'formula' && (f.config || {}).returnType === 'currency' ? 'currency' : CF_TYPE[f.type] || 'text',
    custom: f.id, cfType: f.type, encrypted: !!f.encrypted, ...(['dropdown', 'radio'].includes(f.type) ? { options: (f.options || []).map((o) => [o.value, o.retired ? `${o.label} (retired)` : o.label]) } : {}), ...(f.type === 'user' ? { labelKey: cfKey(f.id) + '_text' } : {}) }))];
}
export const fieldOf = (module, cfg, key) => moduleFields(module, cfg).find((f) => f.key === key) || null;
export const NUMERIC = ['number', 'currency', 'percent'];
export const isDateType = (t) => t === 'date' || t === 'datetime';

// ---------- values ----------
const p2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
// a stored date / time / ISO stamp -> 'YYYY-MM-DD' in local time ('' when blank)
export function dayOf(v) { if (v == null || v === '') return ''; const s = String(v); if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return s.slice(0, 10);
  const d = new Date(s); return isNaN(d) ? '' : ymd(d); }
const money = (v) => '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 });
const mdy = (s) => { const m = String(s).slice(0, 10).split('-'); return m.length === 3 ? `${m[1]}/${m[2]}/${m[0]}` : String(s); };
export const maskValue = (v) => { const s = String(v == null ? '' : v); if (!s) return ''; return '••••' + (s.length > 4 ? s.slice(-2) : ''); };
// the text shown for a field value (labels for pick lists / users, $ for currency, MM/DD/YYYY dates)
export function display(field, row, cfg) {
  if (!field) return ''; const v = row[field.key];
  if (field.encrypted) return maskValue(v);
  if (field.labelKey) return row[field.labelKey] || (v ? String(v) : '');
  if (row[field.key + '_text'] != null && field.custom) return row[field.key + '_text'];
  if (v == null || v === '') return '';
  switch (field.type) {
    case 'picklist': if (field.list) return optLabel(cfg, field.list, v); return ((field.options || []).find(([k]) => k === String(v)) || [null, String(v)])[1];
    case 'currency': return money(v);
    case 'percent': return `${v}%`;
    case 'boolean': return v === true || v === 'yes' ? 'Yes' : 'No';
    case 'date': return mdy(v);
    case 'datetime': { const s = String(v); if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return `${mdy(s)} ${s.slice(11, 16)}`; const d = new Date(s); return isNaN(d) ? s : `${mdy(ymd(d))} ${p2(d.getHours())}:${p2(d.getMinutes())}`; }
    default: return Array.isArray(v) ? v.join(', ') : String(v);
  }
}

// ---------- date presets (video 10) ----------
// Fiscal year = calendar year (CLA's fiscal year was not given; FY_START_MONTH would move it).
export const FY_START_MONTH = 1;
export const DATE_PRESETS = [['today', 'Today'], ['yesterday', 'Yesterday'], ['prev_fy', 'Previous FY'], ['cur_fy', 'Current FY'], ['next_fy', 'Next FY'], ['prev_month', 'Previous Month'], ['cur_month', 'Current Month'],
  ['next_month', 'Next Month'], ['this_year', 'This Year'], ['prev_year', 'Previous Year'], ['next_year', 'Next Year']];
export const presetLabel = (k) => (DATE_PRESETS.find(([c]) => c === k) || [null, k])[1];
// [from, to] inclusive 'YYYY-MM-DD' for a preset, relative to today ('YYYY-MM-DD')
export function presetRange(key, today) {
  const [y, m] = today.split('-').map(Number); const D = (yy, mm, dd) => ymd(new Date(yy, mm - 1, dd));
  const month = (off) => [D(y, m + off, 1), D(y, m + off + 1, 0)];
  const fyStartYear = m >= FY_START_MONTH ? y : y - 1; const fy = (off) => [D(fyStartYear + off, FY_START_MONTH, 1), D(fyStartYear + off + 1, FY_START_MONTH, 0)];
  const year = (off) => [D(y + off, 1, 1), D(y + off, 12, 31)];
  switch (key) {
    case 'today': return [today, today];
    case 'yesterday': { const t = D(y, m, Number(today.slice(8)) - 1); return [t, t]; }
    case 'prev_fy': return fy(-1); case 'cur_fy': return fy(0); case 'next_fy': return fy(1);
    case 'prev_month': return month(-1); case 'cur_month': return month(0); case 'next_month': return month(1);
    case 'this_year': return year(0); case 'prev_year': return year(-1); case 'next_year': return year(1);
    default: return null;
  }
}

// ---------- criteria (filters) ----------
export const OPERATORS = {
  text: [['is', 'is'], ['isnt', "isn't"], ['contains', 'contains'], ['not_contains', "doesn't contain"], ['starts', 'starts with'], ['ends', 'ends with'], ['empty', 'is empty'], ['not_empty', 'is not empty']],
  number: [['eq', '='], ['neq', '!='], ['lt', '<'], ['lte', '<='], ['gt', '>'], ['gte', '>='], ['between', 'between'], ['not_between', 'not between'], ['empty', 'is empty'], ['not_empty', 'is not empty']],
  date: [['is', 'is'], ['isnt', "isn't"], ['before', 'is before'], ['after', 'is after'], ['between', 'between'], ['not_between', 'not between'], ['empty', 'is empty'], ['not_empty', 'is not empty']],
  picklist: [['is', 'is'], ['isnt', "isn't"], ['empty', 'is empty'], ['not_empty', 'is not empty']],
};
export const opsFor = (type) => (NUMERIC.includes(type) ? OPERATORS.number : isDateType(type) ? OPERATORS.date : ['picklist', 'user', 'boolean'].includes(type) ? OPERATORS.picklist : OPERATORS.text);
export const opLabel = (type, op) => (opsFor(type).find(([k]) => k === op) || [null, op])[1];
const NO_VALUE = ['empty', 'not_empty'];
const blank = (v) => v == null || v === '' || (Array.isArray(v) && !v.length);
const lc = (v) => String(v == null ? '' : v).toLowerCase();
const digits = (v) => String(v == null ? '' : v).replace(/\D/g, '');
// one criterion against one row. today = 'YYYY-MM-DD'.
export function matchOne(field, c, row, today) {
  if (!field) return false; const v = row[field.key]; const op = c.op;
  if (op === 'empty') return blank(v) || (field.type === 'boolean' && !v);
  if (op === 'not_empty') return !(blank(v) || (field.type === 'boolean' && !v));
  if (NUMERIC.includes(field.type)) {
    if (blank(v)) return op === 'neq' || op === 'not_between'; const n = Number(v), a = Number(c.value), b = Number(c.value2);
    switch (op) { case 'eq': return n === a; case 'neq': return n !== a; case 'lt': return n < a; case 'lte': return n <= a; case 'gt': return n > a; case 'gte': return n >= a;
      case 'between': return n >= Math.min(a, b) && n <= Math.max(a, b); case 'not_between': return n < Math.min(a, b) || n > Math.max(a, b); default: return false; }
  }
  if (isDateType(field.type)) {
    const d = dayOf(v); const range = (val) => { const r = presetRange(String(val || ''), today); if (r) return r; const s = String(val || '').slice(0, 10); return s ? [s, s] : null; };
    const r1 = range(c.value); if (!d) return op === 'isnt' || op === 'not_between';
    switch (op) {
      case 'is': return !!r1 && d >= r1[0] && d <= r1[1];
      case 'isnt': return !r1 || d < r1[0] || d > r1[1];
      case 'before': return !!r1 && d < r1[0];
      case 'after': return !!r1 && d > r1[1];
      case 'between': case 'not_between': { const r2 = range(c.value2) || r1; if (!r1) return op === 'not_between'; const lo = [r1[0], r2[0]].sort()[0], hi = [r1[1], r2[1]].sort()[1]; const inside = d >= lo && d <= hi; return op === 'between' ? inside : !inside; }
      default: return false;
    }
  }
  if (['picklist', 'user', 'boolean'].includes(field.type)) {
    const want = (Array.isArray(c.value) ? c.value : String(c.value == null ? '' : c.value).split('|')).map(String).filter((x) => x !== '');
    const have = field.type === 'boolean' ? (v === true || v === 'yes' ? 'yes' : 'no') : String(v == null ? '' : v);
    const hit = want.includes(have); return op === 'isnt' ? !hit : op === 'is' ? hit : false;
  }
  // text / email / phone (phone compares digits when the value is all digits / punctuation)
  const s = field.type === 'phone' && /^[\d\s().+-]+$/.test(String(c.value || '')) ? digits(v) : lc(Array.isArray(v) ? v.join(', ') : v);
  const q = field.type === 'phone' && /^[\d\s().+-]+$/.test(String(c.value || '')) ? digits(c.value) : lc(c.value).trim();
  switch (op) { case 'is': return s === q; case 'isnt': return s !== q; case 'contains': return s.includes(q); case 'not_contains': return !s.includes(q);
    case 'starts': return s.startsWith(q); case 'ends': return s.endsWith(q); default: return false; }
}
// criteria: [{ field, op, value, value2 }], logic 'and' | 'or'. Rows of a related module are matched on their prefixed keys (e.g. 'deals.amount').
export function cleanCriteria(list, fields) {
  return (Array.isArray(list) ? list : []).filter((c) => c && c.field).slice(0, 20).map((c) => { const f = fields.find((z) => z.key === c.field);
    if (!f) throw new Error('A filter uses a field that is not in this module.');
    const ops = opsFor(f.type).map(([k]) => k); if (!ops.includes(c.op)) throw new Error(`Pick an operator for "${f.label}".`);
    const value = NO_VALUE.includes(c.op) ? '' : Array.isArray(c.value) ? c.value.map((x) => String(x).slice(0, 200)) : String(c.value == null ? '' : c.value).slice(0, 200);
    if (!NO_VALUE.includes(c.op) && blank(value)) throw new Error(`Enter a value for "${f.label}".`);
    const out = { field: f.key, op: c.op, value }; if (['between', 'not_between'].includes(c.op)) { out.value2 = String(c.value2 == null ? '' : c.value2).slice(0, 200); if (!out.value2) throw new Error(`Enter both values for "${f.label}".`); }
    return out; });
}
export function applyCriteria(rows, criteria, fields, { logic = 'and', today }) {
  const list = (criteria || []).filter((c) => c && c.field); if (!list.length) return rows;
  return rows.filter((r) => { const hits = list.map((c) => matchOne(fields.find((f) => f.key === c.field), c, r, today)); return logic === 'or' ? hits.some(Boolean) : hits.every(Boolean); });
}
export function criteriaText(criteria, fields, cfg, logic = 'and', users = []) {
  return (criteria || []).map((c) => { const f = fields.find((z) => z.key === c.field) || { label: c.field, type: 'text' };
    const val = (x) => (DATE_PRESETS.some(([k]) => k === x) ? presetLabel(x) : f.type === 'picklist' || f.type === 'user' || f.type === 'boolean' ? String(x).split('|').map((v) => valueLabel(f, v, cfg, users)).join(', ') : x);
    return `${f.label} ${opLabel(f.type, c.op)}${NO_VALUE.includes(c.op) ? '' : ' ' + val(Array.isArray(c.value) ? c.value.join('|') : c.value)}${c.value2 ? ' and ' + val(c.value2) : ''}`; }).join(logic === 'or' ? ' OR ' : ' AND ');
}
export function valueLabel(f, v, cfg, users = []) {
  if (f.type === 'boolean') return v === 'yes' || v === true ? 'Yes' : 'No';
  if (f.type === 'user') { const u = users.find((z) => z.id === v); return u ? u.name : v; }
  if (f.type === 'picklist') return f.list ? optLabel(cfg, f.list, v) : ((f.options || []).find(([k]) => k === v) || [null, v])[1];
  return v;
}

// ---------- grouping ----------
// video 9 list: By Day, By Calendar Week, By Fiscal Week, By Month, By Fiscal Quarter, By Fiscal Year (+ calendar quarter / year). CLA's fiscal year
// starts in January (FY_START_MONTH), so fiscal week / quarter / year group exactly like the calendar ones; the label says "FY".
export const BUCKETS = [['day', 'By Day'], ['week', 'By Calendar Week'], ['fweek', 'By Fiscal Week'], ['month', 'By Month'], ['quarter', 'By Quarter'], ['fquarter', 'By Fiscal Quarter'], ['year', 'By Year'], ['fyear', 'By Fiscal Year']];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// [key, label] of a date in a bucket (keys sort in time order)
export function bucketOf(day, bucket = 'day') {
  if (!day) return ['', '(no date)']; const [y, m, d] = day.split('-').map(Number);
  switch (bucket) {
    case 'week': { const t = new Date(y, m - 1, d - new Date(y, m - 1, d).getDay()); const k = ymd(t); return [k, `Week of ${MONTHS[t.getMonth()]} ${t.getDate()}, ${t.getFullYear()}`]; }
    case 'month': return [`${y}-${p2(m)}`, `${MONTHS[m - 1]} ${y}`];
    case 'quarter': { const q = Math.floor((m - 1) / 3) + 1; return [`${y}-Q${q}`, `Q${q} ${y}`]; }
    case 'year': return [String(y), String(y)];
    case 'fweek': { const [k, l] = bucketOf(day, 'week'); return [k, `FY${y} ${l}`]; }
    case 'fquarter': { const q = Math.floor((m - 1) / 3) + 1; return [`${y}-Q${q}`, `FY${y} Q${q}`]; }
    case 'fyear': return [String(y), `FY${y}`];
    default: return [day, `${MONTHS[m - 1]} ${d}, ${y}`];
  }
}
// group key + label of a row for a grouping { field, bucket }
export function groupOf(field, row, cfg, bucket) {
  if (!field) return ['', '(all)']; const v = row[field.key];
  if (isDateType(field.type)) return bucketOf(dayOf(v), bucket || 'day');
  if (field.type === 'boolean') return v === true || v === 'yes' ? ['yes', 'Yes'] : ['no', 'No'];
  if (blank(v)) return ['', field.type === 'user' ? '(none)' : '(blank)'];
  if (field.encrypted) return [String(v), maskValue(v)];
  return [String(Array.isArray(v) ? v.join(', ') : v), display(field, row, cfg) || String(v)];
}
// measure: { fn: 'count' } | { fn: 'sum' | 'avg' | 'min' | 'max', field }
export function measureOf(rows, measure, fields) {
  const fn = (measure && measure.fn) || 'count'; if (fn === 'count') return rows.length;
  const f = fields.find((z) => z.key === measure.field); if (!f) return 0; const nums = rows.map((r) => r[f.key]).filter((v) => !blank(v) && isFinite(Number(v))).map(Number);
  if (!nums.length) return fn === 'sum' ? 0 : null;
  const v = fn === 'sum' ? nums.reduce((a, b) => a + b, 0) : fn === 'avg' ? nums.reduce((a, b) => a + b, 0) / nums.length : fn === 'min' ? Math.min(...nums) : Math.max(...nums);
  return Math.round(v * 100) / 100;
}
export const measureLabel = (measure, fields) => { const fn = (measure && measure.fn) || 'count'; if (fn === 'count') return 'Record Count'; const f = fields.find((z) => z.key === measure.field); return `${{ sum: 'Sum', avg: 'Average', min: 'Minimum', max: 'Maximum' }[fn] || fn} of ${f ? f.label : measure.field}`; };
// chart data: groups (x axis) with a value, optional second grouping (stacked / series), record ids for the drill-down
export function chartData(rows, { grouping, grouping2, measure }, fields, cfg) {
  const g1 = grouping && fields.find((f) => f.key === grouping.field); const g2 = grouping2 && grouping2.field && fields.find((f) => f.key === grouping2.field);
  const by = new Map(); const series = new Map();
  rows.forEach((r) => { const [k, l] = groupOf(g1, r, cfg, grouping && grouping.bucket); const e = by.get(k) || { key: k, label: l, rows: [] }; e.rows.push(r); by.set(k, e);
    if (g2) { const [k2, l2] = groupOf(g2, r, cfg, grouping2.bucket); if (!series.has(k2)) series.set(k2, l2); } });
  const order = (a, b) => (g1 && (isDateType(g1.type)) ? String(a.key).localeCompare(String(b.key)) : g1 && g1.type === 'picklist' ? pickOrder(g1, cfg, a.key) - pickOrder(g1, cfg, b.key) || a.label.localeCompare(b.label) : a.key === '' ? 1 : b.key === '' ? -1 : a.label.localeCompare(b.label, 'en', { numeric: true }));
  const groups = [...by.values()].sort(order).map((e) => { const out = { key: e.key, label: e.label, value: measureOf(e.rows, measure, fields), count: e.rows.length, ids: e.rows.map((r) => r.id) };
    if (g2) out.parts = [...series.keys()].map((k2) => { const sub = e.rows.filter((r) => groupOf(g2, r, cfg, grouping2.bucket)[0] === k2); return { key: k2, label: series.get(k2), value: measureOf(sub, measure, fields), count: sub.length, ids: sub.map((r) => r.id) }; });
    return out; });
  return { groups, series: [...series.entries()].map(([key, label]) => ({ key, label })), total: measureOf(rows, measure, fields), count: rows.length, measureLabel: measureLabel(measure, fields),
    groupLabel: g1 ? `${g1.label}${isDateType(g1.type) ? ` (${(BUCKETS.find(([b]) => b === (grouping.bucket || 'day')) || [, ''])[1]})` : ''}` : '' };
}
function pickOrder(f, cfg, key) { if (key === '') return 9999; const list = f.list ? ((cfg && cfg.picklists && cfg.picklists[f.list]) || []).map((o) => o.value) : (f.options || []).map(([k]) => k); const i = list.indexOf(key); return i < 0 ? 999 : i; }

// ---------- reports ----------
export const AGG_FNS = [['sum', 'Sum'], ['avg', 'Average'], ['min', 'Minimum'], ['max', 'Maximum'], ['count', 'Count']];
// related (child) modules a report can add (video 10 "+ Choose Child Module"); their columns are prefixed '<module>.'
export const RELATED = { contacts: ['deals', 'tasks', 'meetings', 'calls', 'opportunities'], leads: ['tasks', 'meetings', 'calls'], accounts: ['contacts', 'deals', 'opportunities', 'tasks'],
  deals: ['contacts'], tasks: [], meetings: [], calls: [] };
// the fields of a report: the primary module's, then each related module's with a prefix
export function reportFields(module, related, cfg) {
  return [...moduleFields(module, cfg), ...(related || []).filter((m) => (RELATED[module] || []).includes(m)).flatMap((m) => moduleFields(m, cfg).map((f) => ({ ...f, key: `${m}.${f.key}`, label: `${moduleName(m)}: ${f.label}`,
    labelKey: f.labelKey ? `${m}.${f.labelKey}` : undefined, link: f.link ? `${m}.${f.link}` : undefined, module: m })))];
}
// joined rows: one row per (record, related record); a record with no related record stays (left join)
export function joinRows(rows, related, relMap) {
  let out = rows; (related || []).forEach((m) => { const kids = relMap[m] || {}; out = out.flatMap((r) => { const list = kids[r.id] || []; if (!list.length) return [r];
    return list.map((k) => { const x = { ...r, _rowId: `${r._rowId || r.id}+${k.id}` }; Object.entries(k).forEach(([key, v]) => { x[`${m}.${key}`] = v; }); return x; }); }); });
  return out;
}
// the default columns of a new report (video 10 shows Zoho's defaults per module)
export const DEFAULT_COLUMNS = { contacts: ['name', 'companyName', 'email', 'phone', 'relationshipStatus', 'ownerId'], leads: ['name', 'company', 'email', 'phone', 'leadSource', 'ownerId'],
  accounts: ['name', 'kind', 'phone', 'city', 'ownerId'], deals: ['fileNumber', 'name', 'clientName', 'contactName', 'amount', 'stage', 'closingDate', 'ownerId'],
  tasks: ['subject', 'dueDate', 'status', 'priority', 'relatedTo', 'contactName', 'ownerId'], meetings: ['subject', 'startsAt', 'endsAt', 'relatedTo', 'contactName', 'hostId'],
  calls: ['subject', 'callType', 'callStart', 'callDuration', 'relatedTo', 'contactName', 'ownerId'] };
// def: { module, related, columns, rowGroups, aggregates: [{ field, fn }], filters, logic, sort: { field, dir } }
export function runReport(rows0, def, fields, cfg, { today } = {}) {
  const rows = applyCriteria(rows0, def.filters, fields, { logic: def.logic || 'and', today });
  const cols = (def.columns || []).map((k) => fields.find((f) => f.key === k)).filter(Boolean);
  const sortF = def.sort && fields.find((f) => f.key === def.sort.field); const dir = def.sort && def.sort.dir === 'desc' ? -1 : 1;
  const sorted = sortF ? [...rows].sort((a, b) => cmp(a[sortF.key], b[sortF.key]) * dir) : rows;
  const aggs = (def.aggregates || []).map((a) => ({ ...a, f: fields.find((f) => f.key === a.field) })).filter((a) => a.f && (a.fn === 'count' || NUMERIC.includes(a.f.type)));
  const aggOf = (list) => aggs.map((a) => ({ field: a.field, fn: a.fn, label: `${(AGG_FNS.find(([k]) => k === a.fn) || [, a.fn])[1]} of ${a.f.label}`, value: a.fn === 'count' ? list.filter((r) => !blank(r[a.f.key])).length : measureOf(list, { fn: a.fn, field: a.field }, fields),
    currency: a.f.type === 'currency' && a.fn !== 'count' }));
  const cell = (r) => cols.map((f) => ({ key: f.key, text: display(f, r, cfg), link: f.link && !f.encrypted ? r[f.link] || '' : '' }));
  const groupFields = (def.rowGroups || []).map((k) => fields.find((f) => f.key === k)).filter(Boolean).slice(0, 3);
  const nest = (list, level) => { if (level >= groupFields.length) return null; const g = groupFields[level]; const by = new Map();
    list.forEach((r) => { const [k, l] = groupOf(g, r, cfg, def.bucket || 'day'); const e = by.get(k) || { key: k, label: l, rows: [] }; e.rows.push(r); by.set(k, e); });
    return [...by.values()].sort((a, b) => (a.key === '' ? 1 : b.key === '' ? -1 : a.label.localeCompare(b.label, 'en', { numeric: true })))
      .map((e) => ({ field: g.label, key: e.key, label: e.label, count: e.rows.length, header: `${e.label} (${e.rows.length})`, aggregates: aggOf(e.rows), groups: nest(e.rows, level + 1), rows: level === groupFields.length - 1 ? e.rows.map((r) => ({ id: r._rowId || r.id, cells: cell(r) })) : null })); };
  return { columns: cols.map((f) => ({ key: f.key, label: f.label, type: f.type })), total: sorted.length, aggregates: aggOf(sorted), groups: nest(sorted, 0),
    rows: groupFields.length ? null : sorted.map((r) => ({ id: r._rowId || r.id, cells: cell(r) })) };
}
const cmp = (x, y) => { if (blank(x) && blank(y)) return 0; if (blank(x)) return 1; if (blank(y)) return -1; return typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'en', { numeric: true, sensitivity: 'base' }); };
// a run report as CSV rows (group columns first, so a spreadsheet keeps the grouping)
export function reportCsvRows(out) {
  const head = [...((out.groupFields || []).map((g) => g)), ...out.columns.map((c) => c.label)]; const rows = [];
  const walk = (groups, path) => (groups || []).forEach((g) => { if (g.groups) walk(g.groups, [...path, g.label]); else (g.rows || []).forEach((r) => rows.push([...path, g.label, ...r.cells.map((c) => c.text)])); });
  if (out.groups) walk(out.groups, []); else (out.rows || []).forEach((r) => rows.push(r.cells.map((c) => c.text)));
  return { head, rows };
}
export function csvText(head, rows) {
  const cell = (v) => { let s = v == null ? '' : String(v); if (/^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s; return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
export function reportCsv(out, groupLabels = []) { const { rows } = reportCsvRows({ ...out, groupFields: groupLabels }); return csvText([...groupLabels, ...out.columns.map((c) => c.label)], rows); }

// ---------- global search (video 7) ----------
// result columns per group (exact columns from the video notes; Leads / Companies were not shown, so they follow the module lists)
export const SEARCH_COLUMNS = {
  contacts: [['name', 'Client Name'], ['email', 'Email'], ['phone', 'Phone'], ['createdByName', 'Created By'], ['ownerName', 'Client Owner']],
  leads: [['name', 'Lead Name'], ['company', 'Company'], ['email', 'Email'], ['phone', 'Phone'], ['leadSourceText', 'Lead Source'], ['ownerName', 'Lead Owner']],
  accounts: [['name', 'Company Name'], ['phone', 'Phone'], ['website', 'Website'], ['ownerName', 'Company Owner']],
  deals: [['name', 'Deal Name'], ['amountText', 'Amount'], ['stage', 'Stage'], ['closingDateText', 'Closing Date'], ['clientName', 'Client Name'], ['contactName', 'Contact Name']],
  tasks: [['subject', 'Subject'], ['dueDateText', 'Due Date'], ['statusText', 'Status'], ['priorityText', 'Priority'], ['relatedTo', 'Related To'], ['contactName', 'Contact Name']],
  meetings: [['subject', 'Title'], ['startsAtText', 'From'], ['endsAtText', 'To'], ['relatedTo', 'Related To'], ['contactName', 'Contact Name']],
  calls: [['subject', 'Subject'], ['callTypeText', 'Call Type'], ['callStartText', 'Call Start Time'], ['callDurationText', 'Call Duration'], ['relatedTo', 'Related To'], ['contactName', 'Contact Name']],
};
// which keys of a row are searched: text words in `text`, phone digits in `phones`
export const SEARCH_KEYS = {
  contacts: { text: ['name', 'email', 'companyName'], phones: ['phone', 'mobile'] }, leads: { text: ['name', 'email', 'company'], phones: ['phone', 'mobile'] },
  accounts: { text: ['name', 'website'], phones: ['phone'] }, deals: { text: ['name', 'fileNumber', 'propertyAddress', 'clientName', 'contactName', '_people'], phones: ['_phones'] },
  tasks: { text: ['subject', 'relatedTo', 'contactName', '_people'], phones: ['_phones'] }, meetings: { text: ['subject', 'relatedTo', 'contactName', '_people'], phones: ['_phones'] },
  calls: { text: ['subject', 'relatedTo', 'contactName', '_people'], phones: ['_phones'] } };
export const SEARCH_MAX = 100;
// a query: words (all must appear) or a phone number (digits only: "(301) 555-0102" finds 301-555-0102)
export function parseQuery(q) { const s = String(q == null ? '' : q).trim().slice(0, 100); const d = digits(s);
  const phone = d.length >= 3 && /^[\d\s().+\-]+$/.test(s); return { q: s, words: phone ? [] : lc(s).split(/\s+/).filter(Boolean), digits: phone ? d : '' }; }
export function searchMatch(row, pq, keys) {
  if (!pq.q) return false;
  const phones = (keys.phones || []).flatMap((k) => (Array.isArray(row[k]) ? row[k] : [row[k]])).map(digits).filter(Boolean);
  if (pq.digits) return phones.some((p) => p.includes(pq.digits));
  const hay = (keys.text || []).map((k) => (Array.isArray(row[k]) ? row[k].join(' ') : row[k] || '')).join(' ').toLowerCase();
  const emailHit = pq.words.length === 1 && pq.words[0].includes('@');
  return emailHit ? hay.includes(pq.words[0]) : pq.words.every((w) => hay.includes(w));
}
// bold the match for the quick results (returns [[text, isMatch], ...])
export function highlight(text, q) { const s = String(text == null ? '' : text); const w = parseQuery(q).words.sort((a, b) => b.length - a.length)[0]; if (!w) return [[s, false]];
  const i = s.toLowerCase().indexOf(w); return i < 0 ? [[s, false]] : [[s.slice(0, i), false], [s.slice(i, i + w.length), true], [s.slice(i + w.length), false]].filter(([t]) => t); }

// ---------- dashboards (video 9) ----------
export const COMPONENT_TYPES = [['chart', 'Chart', true], ['kpi', 'KPI', true], ['comparator', 'Comparator', false], ['anomaly', 'Anomaly Detector', false], ['target', 'Target Meter', true], ['funnel', 'Funnel', true],
  ['cohort', 'Cohort', false], ['quadrant', 'Quadrant', false], ['zone', 'Zone', false], ['stage', 'Stage', false], ['waterfall', 'Waterfall', false]];
export const COMPONENT_CODES = COMPONENT_TYPES.filter(([, , on]) => on).map(([c]) => c);
export const CHART_TYPES = [['column', 'Column'], ['bar', 'Bar'], ['stacked', 'Stacked Column'], ['pie', 'Pie'], ['doughnut', 'Doughnut'], ['table', 'Table'], ['line', 'Line'], ['area', 'Area']];
export const CHART_CODES = CHART_TYPES.map(([c]) => c);
export const VISIBILITY = [['me', 'Only me'], ['all', 'All Users'], ['custom', 'Custom']];
// "departments" for Custom sharing: CLA has no department list yet, so these group the CRM roles (ask John)
export const DEPARTMENTS = [['sales', 'CLA Sales Department', ['Sales Person', 'Sales Team']], ['processing', 'CLA Processing Department', ['Processor', 'Preprocessor']], ['admin', 'CLA Administration', ['Admin', 'Super admin']]];
export const SHARE_ROLES = ['Super admin', 'Admin', 'Sales Person', 'Sales Team', 'Processor', 'Preprocessor'];
export const WIDTHS = [[1, 'Small (1/3)'], [2, 'Medium (2/3)'], [3, 'Full width']];
export const HEIGHTS = [['s', 'Short'], ['m', 'Medium'], ['l', 'Tall']];
export const roleKeyOf = (u) => (u.role === 'Super admin' || u.role === 'Admin' ? u.role : u.isAdmin ? 'Admin' : u.role);
export function dashboardVisible(u, d) {
  if (d.builtin) return true; if (d.ownerId === u.id) return true; if (d.visibility === 'all') return true;
  if (d.visibility !== 'custom') return false; const role = roleKeyOf(u);
  return (d.shareUsers || []).includes(u.id) || (d.shareRoles || []).includes(role) || (d.shareDepts || []).some((k) => ((DEPARTMENTS.find(([c]) => c === k) || [, , []])[2]).includes(role));
}
// owner edits; shared users edit only an unlocked dashboard; built-in ones: Admins. The Processor is read-only in the CRM.
export function dashboardEditable(u, d, readOnly = false) {
  if (readOnly) return false; if (d.builtin) return !!u.isAdmin; if (d.ownerId === u.id) return true;
  return !d.locked && d.visibility !== 'me' && dashboardVisible(u, d);
}
export function reportVisible(u, r) {
  if (r.createdBy === u.id || u.isAdmin) return true; const s = r.share || { mode: 'all' }; if (s.mode !== 'custom') return true;
  return (s.users || []).includes(u.id) || (s.roles || []).includes(roleKeyOf(u));
}
