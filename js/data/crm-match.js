/* Select every record that matches the current CRM list filter (JN-47).
 * The screen asks for a count, then confirms that count, then asks the server to write.
 * Callers get counts only. Full rows stay in the database.
 * EMAIL_DRAFT_BATCH is how many drafts one insert statement writes. It is not a limit
 * on how many addresses one send may include. */
import { fieldPatch } from './crm-bulk.js?v=202611141100';

export const EMAIL_DRAFT_BATCH = 500;
export const CRM_ZONE = 'America/New_York';

const DATE_PAIRS = [
  ['createdAt', 'createdFrom', 'createdTo'],
  ['modifiedAt', 'modifiedFrom', 'modifiedTo'],
  ['lastActivityAt', 'activityFrom', 'activityTo'],
  ['openDate', 'openFrom', 'openTo'],
  ['closingDate', 'closingFrom', 'closingTo'],
  ['expectedClose', 'extraFrom', 'extraTo'],
];
const EQ_KEYS = ['ownerId', 'archived', 'converted', 'status', 'source', 'kind', 'stage', 'relationshipStatus', 'leadSource', 'roleInCompany', 'state', 'county', 'contactType', 'tag', 'clientId'];

export function nyDay(value) {
  const s = String(value || '');
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: CRM_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const bit = (t) => parts.find((p) => p.type === t).value;
  return `${bit('year')}-${bit('month')}-${bit('day')}`;
}

/* Inclusive civil dates in America/New_York. A blank stored value does not match a bounded filter. */
export function inNyRange(value, from, to) {
  if (!from && !to) return true;
  const day = nyDay(value);
  if (!day) return false;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

export function filterFromValues(values = {}) {
  const dates = [];
  DATE_PAIRS.forEach(([field, fromKey, toKey]) => {
    const from = values[fromKey] || '';
    const to = values[toKey] || '';
    if (from || to) dates.push({ field, from, to });
  });
  const out = { dates };
  const q = String(values.q || '').trim();
  if (q) out.q = q;
  EQ_KEYS.forEach((k) => { if (values[k]) out[k] = values[k]; });
  const custom = {};
  Object.entries(values).forEach(([k, v]) => { if (k.startsWith('cf_') && v) custom[k.slice(3)] = v; });
  if (Object.keys(custom).length) out.custom = custom;
  return out;
}

function haystack(row) {
  return ['name', 'email', 'company', 'companyName', 'phone', 'notes', 'county', 'city', 'fileNumber', 'propertyAddress', 'clientName', 'ownerName', 'sourceText'].map((k) => (Array.isArray(row[k]) ? row[k].join(' ') : row[k] || '')).join(' ').toLowerCase();
}

function same(want, have) {
  if (!want) return true;
  if (want === 'none') return !have;
  return String(have || '') === String(want);
}

export function rowMatches(row, filter = {}) {
  const words = String(filter.q || '').toLowerCase().split(/\s+/).filter(Boolean);
  const hay = haystack(row);
  if (!words.every((w) => hay.includes(w))) return false;
  if (!same(filter.ownerId, row.ownerId)) return false;
  if (!same(filter.status, row.status)) return false;
  if (!same(filter.source, row.source || row.leadSource)) return false;
  if (!same(filter.kind, row.kind)) return false;
  if (!same(filter.stage, row.stage)) return false;
  if (!same(filter.relationshipStatus, row.relationshipStatus || row.status)) return false;
  if (!same(filter.leadSource, row.leadSource || row.source)) return false;
  if (!same(filter.roleInCompany, row.roleInCompany)) return false;
  if (!same(filter.state, row.state)) return false;
  if (!same(filter.contactType, row.contactType)) return false;
  if (filter.county && (filter.county === 'none' ? !!row.county : String(row.county || '').toLowerCase() !== String(filter.county).toLowerCase())) return false;
  if (filter.tag && !(row.tags || []).map((t) => String(t).toLowerCase()).includes(String(filter.tag).toLowerCase())) return false;
  if (filter.clientId && !(row.clientIds || []).includes(filter.clientId) && row.clientId !== filter.clientId) return false;
  const arch = filter.archived || '';
  if (arch === '' && row.archived) return false;
  if (arch === 'only' && !row.archived) return false;
  if ('converted' in row || filter.converted) {
    const cv = filter.converted || '';
    if (cv === '' && row.converted) return false;
    if (cv === 'only' && !row.converted) return false;
  }
  const custom = filter.custom || {};
  if (Object.entries(custom).some(([k, v]) => {
    const have = (row.custom || {})[k];
    if (v === 'none') return !(have == null || have === '');
    return String(have ?? '') !== String(v);
  })) return false;
  const dates = Array.isArray(filter.dates) ? filter.dates : [];
  if (dates.some((d) => d && d.field && !inNyRange(row[d.field], d.from, d.to))) return false;
  return true;
}

export function matchBannerState({ allOnPage, pageCount, matchCount, allMatching }) {
  const n = Number(matchCount) || 0;
  const pageN = Number(pageCount) || 0;
  if (allMatching && n > 0) return { mode: 'all', matchCount: n, pageCount: pageN };
  if (allOnPage && n > pageN) return { mode: 'offer', matchCount: n, pageCount: pageN };
  return null;
}

export function applyFieldPatch(module, field, value) {
  return fieldPatch(module, field, value);
}

export function emailPlan(people) {
  const seen = new Map();
  let skipped = 0;
  (people || []).forEach((r) => {
    const email = String(r.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) { skipped += 1; return; }
    if (seen.has(email)) { skipped += 1; return; }
    seen.set(email, { id: r.storeId || r.id, entity: r.storeEntity || r.entity, email });
  });
  return { recipients: seen.size, skipped, records: (people || []).length, drafts: [...seen.values()] };
}
