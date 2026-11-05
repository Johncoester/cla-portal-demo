// CRM Deals list columns (John, Nov 3): which columns a user has hidden, remembered PER USER in this browser's local storage. Screen preference only
// (no data, no access rule): the adapter decides WHICH deals a user sees. Deal Name always stays (it opens the deal). Pure, so tests can pass a Map storage.
export const DEAL_COLS = [['name', 'Deal Name'], ['fileNumber', 'File Number'], ['amount', 'Amount'], ['loanAmount', 'Loan Amount'], ['stage', 'Stage'], ['closingDate', 'Closing Date'],
  ['openDate', 'Open Date'], ['clientName', 'Client Name'], ['contactName', 'Contact Name'], ['ownerName', 'Deal Owner'], ['salesReps', 'Sales Reps'], ['sourceText', 'Source'],
  ['transactionType', 'Transaction Type'], ['county', 'County'],
  // Janine, Nov 4: Disbursement Details (hidden until a person turns them on)
  ['disbursementDate', 'Disbursement Date'], ['actualRevenue', 'Actual Revenue']];
export const LOCKED_COLS = ['name'];
// shown until the user changes it (the old list's 7 columns + Source)
export const DEFAULT_HIDDEN = ['fileNumber', 'loanAmount', 'openDate', 'salesReps', 'transactionType', 'county', 'disbursementDate', 'actualRevenue'];
export const colsKey = (userId) => `cla-portal-new:crm-deals-cols:v1:${userId || 'anon'}`;
const KNOWN = new Set(DEAL_COLS.map(([k]) => k));
export function loadHidden(storage, userId) {
  try { const raw = storage && storage.getItem(colsKey(userId)); if (!raw) return [...DEFAULT_HIDDEN]; const v = JSON.parse(raw);
    return Array.isArray(v.hidden) ? v.hidden.filter((k) => KNOWN.has(k) && !LOCKED_COLS.includes(k)) : [...DEFAULT_HIDDEN]; } catch (e) { return [...DEFAULT_HIDDEN]; }
}
export function saveHidden(storage, userId, hidden) {
  const list = [...new Set((hidden || []).filter((k) => KNOWN.has(k) && !LOCKED_COLS.includes(k)))];
  try { if (storage) storage.setItem(colsKey(userId), JSON.stringify({ hidden: list, savedAt: new Date().toISOString() })); } catch (e) { /* storage full / private mode: the choice lasts for this visit only */ }
  return list;
}
