/* crm-disbursement.js : DISBURSEMENT DETAILS on a CRM deal (Janine, Nov 4 video "Disbursement Details - Deals": Zoho's Deals record has a
 * "Disbursement Details" section with these ten fields; she asked for them in the portal's Deals module). One row per deal (deal_disbursements,
 * migration 56), every amount a typed numeric(12,2) >= 0 and the date a real date, so Reports, Dashboards and Custom Views can use them.
 * Who edits: Admin / Super admin (open question for John: should the Processor / accounting enter them, or should they fill from the Accounting
 * tab / Qualia once those are live?). Everyone who can see the deal in the CRM can read them. Pure (tests import it). FAKE DATA ONLY. */
export const DISBURSEMENT_FIELDS = [['disbursementDate', 'Disbursement Date', 'date'], ['actualRevenue', 'Actual Revenue', 'money'], ['netTitleInsurance', 'Net Title Insurance', 'money'],
  ['settlementFee', 'Settlement Fee', 'money'], ['netEndorsementFee', 'Net Endorsement Fee', 'money'], ['qualiaFee', 'Qualia Fee', 'money'], ['shippingFee', 'Shipping Fee', 'money'],
  ['nationalTitleResource', 'National Title Resource', 'money'], ['notaryFee', 'Notary Fee', 'money'], ['searchesFee', 'Searches', 'money']];
export const DISBURSEMENT_KEYS = DISBURSEMENT_FIELDS.map(([k]) => k);
export const MONEY_MAX = 99999999.99;
// input -> a clean row ({ key: number | 'YYYY-MM-DD' | null }); throws a plain-English message on a bad value
export function cleanDisbursement(input = {}) {
  const out = {};
  Object.keys(input || {}).forEach((k) => { if (!DISBURSEMENT_KEYS.includes(k)) throw new Error(`"${k}" is not a Disbursement Details field.`); });
  DISBURSEMENT_FIELDS.forEach(([k, label, type]) => {
    if (!(k in (input || {}))) return; const raw = input[k]; const s = raw == null ? '' : String(raw).trim();
    if (s === '') { out[k] = null; return; }
    if (type === 'date') { if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(Date.parse(s + 'T00:00:00Z'))) throw new Error(`${label} needs a date (YYYY-MM-DD).`); out[k] = s; return; }
    const n = Number(s.replace(/[$,\s]/g, '')); if (!isFinite(n)) throw new Error(`${label} must be an amount.`);
    if (n < 0) throw new Error(`${label} cannot be negative.`); if (n > MONEY_MAX) throw new Error(`${label} is too large.`);
    out[k] = Math.round(n * 100) / 100; });
  return out;
}
export const emptyDisbursement = () => Object.fromEntries(DISBURSEMENT_KEYS.map((k) => [k, null]));
