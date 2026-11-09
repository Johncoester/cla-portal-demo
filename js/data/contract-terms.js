/* contract-terms.js : TEST contract figures for one order. PURE. No storage and no network.
 * These figures are estimates. They are not a fee-ledger line, not funds received, not a payoff, and not a Closing Disclosure.
 * A blank amount stays null. Zero is stored only when someone typed zero. A percent never fills a dollar field. */
const fail = (m) => { throw new Error(m); };
const roundTo = (n, places) => { const p = 10 ** places; return Math.round((Number(n) + Number.EPSILON) * p) / p; };
export const ESTIMATE_POSTURE = 'estimate';
export const CONTRACT_NOT_SAVED = 'Contract figures were not saved.';
export const EMD_METHODS = [['', 'Unknown'], ['check', 'Check'], ['wire', 'Wire'], ['other', 'Other']];
export const EMD_RECEIPTS = [['unknown', 'Unknown'], ['promised', 'Promised, not received'], ['pending', 'Pending'], ['unverified', 'Unverified']];
const RECEIPT_KEYS = EMD_RECEIPTS.map(([k]) => k);
const METHOD_KEYS = EMD_METHODS.map(([k]) => k).filter(Boolean);

export const CONTRACT_FIELDS = [
  { key: 'salePrice', column: 'sale_price', group: 'price', kind: 'money', label: 'Sale price', basis: ['explicit', 'derived', 'calculated'], hint: 'Contract sale price. Not a Closing Disclosure line.' },
  { key: 'listingPrice', column: 'listing_price', group: 'price', kind: 'money', label: 'Listing / asking price', basis: ['explicit', 'derived', 'calculated'], hint: 'Separate from the sale price. Blank if it was not established.' },
  { key: 'loanAmount', column: 'loan_amount', group: 'price', kind: 'money', label: 'Loan dollars', basis: ['explicit', 'derived', 'calculated'], hint: 'Blank when the contract states a percent, or a preapproval, and not final dollars.' },
  { key: 'loanPercent', column: 'loan_percent', group: 'price', kind: 'percent', places: 4, label: 'Loan percent of price', hint: 'Does not fill loan dollars.' },
  { key: 'loanRate', column: 'loan_rate', group: 'price', kind: 'percent', places: 5, label: 'Interest rate %', basis: ['quoted', 'locked'], hint: 'Quoted or locked is still not funded proof.' },
  { key: 'downPayment', column: 'down_payment', group: 'price', kind: 'money', label: 'Down payment', basis: ['explicit', 'derived', 'calculated'], hint: 'Blank if it was only derived and not written down.' },
  { key: 'sellerCreditPercent', column: 'seller_credit_percent', group: 'credit', kind: 'percent', places: 4, label: 'Seller credit %', hint: 'Does not fill the credit dollars.' },
  { key: 'sellerCreditAmount', column: 'seller_credit_amount', group: 'credit', kind: 'money', label: 'Seller credit $', basis: ['explicit', 'derived', 'calculated'], hint: 'Blank if no amount is selected. Do not type 0 for unknown.' },
  { key: 'buyerBrokerPercent', column: 'buyer_broker_percent', group: 'credit', kind: 'percent', places: 4, label: 'Buyer broker %', hint: 'Cooperative compensation percent. Not a payable.' },
  { key: 'buyerBrokerAmount', column: 'buyer_broker_amount', group: 'credit', kind: 'money', label: 'Buyer broker $', basis: ['explicit', 'derived', 'calculated'], hint: 'Blank if the dollars are not written down.' },
  { key: 'listingCommissionPercent', column: 'listing_commission_percent', group: 'credit', kind: 'percent', places: 4, label: 'Listing commission %' },
  { key: 'listingCommissionAmount', column: 'listing_commission_amount', group: 'credit', kind: 'money', label: 'Listing commission $', basis: ['explicit', 'derived', 'calculated'], hint: 'Blank if the listing side was not established.' },
  { key: 'warrantyCap', column: 'warranty_cap', group: 'warranty', kind: 'money', label: 'Warranty cap', basis: ['explicit', 'derived', 'calculated'], hint: 'A cap or "up to" figure. Not an amount paid.' },
  { key: 'warrantyPayer', column: 'warranty_payer', group: 'warranty', kind: 'text', max: 120, label: 'Warranty payer', hint: 'Blank if a warranty was not selected.' },
  { key: 'hoaName', column: 'hoa_name', group: 'hoa', kind: 'text', max: 200, label: 'HOA name' },
  { key: 'hoaMonthly', column: 'hoa_monthly', group: 'hoa', kind: 'money', label: 'HOA dues / month', basis: ['explicit', 'historical'], hint: 'A stated monthly amount. Not a balance due.' },
  { key: 'hoaCertificateBalance', column: 'hoa_certificate_balance', group: 'hoa', kind: 'money', label: 'HOA certificate balance', basis: ['historical', 'explicit'], hint: 'Certificate snapshot only. Not a current payoff.' },
  { key: 'hoaCertificateAsOf', column: 'hoa_certificate_as_of', group: 'hoa', kind: 'date', label: 'HOA certificate date' },
  { key: 'condoName', column: 'condo_name', group: 'hoa', kind: 'text', max: 200, label: 'Condo association' },
  { key: 'condoMonthly', column: 'condo_monthly', group: 'hoa', kind: 'money', label: 'Condo dues / month', basis: ['explicit', 'historical'] },
  { key: 'condoCertificateBalance', column: 'condo_certificate_balance', group: 'hoa', kind: 'money', label: 'Condo certificate balance', basis: ['historical', 'explicit'], hint: 'Certificate snapshot only. Not a current payoff.' },
  { key: 'condoCertificateAsOf', column: 'condo_certificate_as_of', group: 'hoa', kind: 'date', label: 'Condo certificate date' },
  { key: 'transferFeeEach', column: 'transfer_fee_each', group: 'hoa', kind: 'money', label: 'Transfer fee (each)', basis: ['explicit', 'historical'], hint: 'Per association, if stated. Not a disbursement.' },
  { key: 'deferredAmount', column: 'deferred_amount', group: 'deferred', kind: 'money', label: 'Deferred charge amount', basis: ['explicit', 'derived', 'calculated'], hint: 'Blank if no balance was established. Not a payoff.' },
  { key: 'deferredSchedule', column: 'deferred_schedule', group: 'deferred', kind: 'text', max: 200, label: 'Deferred schedule', hint: 'For example, per year. Blank if unknown.' },
  { key: 'deferredPayee', column: 'deferred_payee', group: 'deferred', kind: 'text', max: 200, label: 'Deferred payee' },
  { key: 'taxPeriod', column: 'tax_period', group: 'tax', kind: 'text', max: 80, label: 'Tax period' },
  { key: 'taxLevy', column: 'tax_levy', group: 'tax', kind: 'money', label: 'Historical tax levy', basis: ['historical', 'explicit'], hint: 'A levy snapshot. Not the amount due.' },
  { key: 'taxAssessment', column: 'tax_assessment', group: 'tax', kind: 'money', label: 'Taxable assessment', basis: ['historical', 'explicit'] },
  { key: 'taxPayable', column: 'tax_payable', group: 'tax', kind: 'money', label: 'Current tax payable', basis: ['explicit'], hint: 'Only when a bill states a current payable. Never copy the levy here. Blank if unknown.' },
  { key: 'emdAmount', column: 'emd_amount', group: 'emd', kind: 'money', label: 'EMD amount', basis: ['explicit', 'derived', 'calculated'], hint: 'The contract deposit. Not money received.' },
  { key: 'emdMethod', column: 'emd_method', group: 'emd', kind: 'select', options: EMD_METHODS, label: 'EMD method', hint: 'Blank means the method is unknown.' },
  { key: 'emdHolder', column: 'emd_holder', group: 'emd', kind: 'text', max: 200, label: 'EMD holder' },
  { key: 'emdDueOn', column: 'emd_due_on', group: 'emd', kind: 'date', label: 'EMD due date' },
  { key: 'emdReceipt', column: 'emd_receipt', group: 'emd', kind: 'select', options: EMD_RECEIPTS, label: 'EMD receipt status', hint: 'Unknown, promised, pending, or unverified. This sheet cannot mark funds received.' },
  { key: 'sourceNote', column: 'source_note', group: 'notes', kind: 'note', max: 2000, label: 'Source evidence', hint: 'Where the figures came from. This does not upload a document.' },
  { key: 'internalNote', column: 'internal_note', group: 'notes', kind: 'note', max: 2000, label: 'Internal accounting note', hint: 'Separate from the order review notes. Nothing here is cut short to make room.' },
];
export const CONTRACT_GROUPS = [
  ['price', 'Price and loan'], ['credit', 'Credits and commissions'], ['warranty', 'Warranty'], ['hoa', 'HOA and condo'],
  ['deferred', 'Deferred charges'], ['tax', 'Historical tax'], ['emd', 'Earnest money'], ['notes', 'Evidence and internal note'],
];
const FIELD = Object.fromEntries(CONTRACT_FIELDS.map((f) => [f.key, f]));
const HISTORICAL = new Set(['hoaCertificateBalance', 'condoCertificateBalance', 'taxLevy', 'taxAssessment']);

const blankValue = (f) => (f.kind === 'text' || f.kind === 'note' ? '' : f.key === 'emdReceipt' ? 'unknown' : null);
export function blankContract(dealId, canEdit = false) {
  const fields = { posture: ESTIMATE_POSTURE };
  for (const f of CONTRACT_FIELDS) fields[f.key] = blankValue(f);
  return { dealId, saved: false, canEdit: !!canEdit, posture: ESTIMATE_POSTURE, blocked: '', fields, flags: {}, updatedAt: null };
}

function moneyOrNull(v, label) {
  if (v == null) return null;
  const t = String(v).trim();
  if (!t) return null;
  const x = t.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(x)) fail(`${label} must be blank or an amount like 1,250.00. Blank means unknown. Do not type 0 for unknown.`);
  const n = Number(x);
  if (!isFinite(n) || n > 100000000) fail(`${label} is too large.`);
  return roundTo(n, 2);
}
function percentOrNull(v, label, places) {
  if (v == null) return null;
  const t = String(v).trim().replace(/%$/, '');
  if (!t) return null;
  if (!new RegExp(`^\\d{1,3}(\\.\\d{1,${places}})?$`).test(t)) fail(`${label} must be blank or a percent with at most ${places} decimals.`);
  const n = Number(t);
  if (n > 100) fail(`${label} cannot be more than 100.`);
  return n;
}
function dateOrNull(v, label) {
  if (v == null || !String(v).trim()) return null;
  const t = String(v).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) fail(`${label} must be blank or a date (YYYY-MM-DD).`);
  const [y, m, d] = t.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) fail(`${label} is not a real date.`);
  return t;
}
function textOrEmpty(v, max, label) {
  const t = String(v == null ? '' : v).trim();
  if (t.length > max) fail(`${label} is limited to ${max} characters. It was not shortened.`);
  return t;
}
function flagText(v, label) {
  const t = String(v == null ? '' : v).trim();
  if (t.length > 500) fail(`${label} source is limited to 500 characters. It was not shortened.`);
  return t;
}

export function cleanContractTerms(input) {
  const src = input || {};
  if (src.posture != null && String(src.posture).trim() && String(src.posture).trim() !== ESTIMATE_POSTURE) fail('Contract figures stay an estimate. They cannot be marked as a verified ledger, receipt, or Closing Disclosure.');
  for (const banned of ['receivedAmount', 'emdReceived', 'feeId', 'ledger', 'payoff', 'disbursement']) {
    if (src[banned] != null && src[banned] !== '' && src[banned] !== false) fail('Contract figures cannot post a receipt, ledger line, payoff, or disbursement.');
  }
  const fields = { posture: ESTIMATE_POSTURE };
  const flags = {};
  for (const f of CONTRACT_FIELDS) {
    let value;
    if (f.kind === 'money') value = moneyOrNull(src[f.key], f.label);
    else if (f.kind === 'percent') value = percentOrNull(src[f.key], f.label, f.places || 4);
    else if (f.kind === 'date') value = dateOrNull(src[f.key], f.label);
    else if (f.kind === 'select') {
      const t = String(src[f.key] == null ? '' : src[f.key]).trim();
      const allowed = (f.options || []).map(([k]) => k);
      if (f.key === 'emdReceipt') value = t || 'unknown';
      else value = t || null;
      if (f.key === 'emdMethod' && value && !METHOD_KEYS.includes(value)) fail('EMD method must be blank, check, wire, or other.');
      if (f.key === 'emdReceipt' && !RECEIPT_KEYS.includes(value)) fail('EMD receipt status cannot be marked received, cleared, or posted. This sheet does not post a receipt.');
      if (!allowed.includes(value == null ? '' : value) && !(f.key === 'emdMethod' && value == null)) fail(`${f.label}: pick one from the list.`);
    } else value = textOrEmpty(src[f.key], f.max || 200, f.label);
    fields[f.key] = value;
    if (!f.basis) continue;
    const basis = String(src[f.key + 'Basis'] == null ? '' : src[f.key + 'Basis']).trim();
    const source = flagText(src[f.key + 'Source'], f.label);
    const provisional = src[f.key + 'Provisional'];
    if (value == null || value === '') {
      if (basis || source) fail(`${f.label}: enter the figure before recording how it was obtained, or clear that marker. A blank figure is unknown, not zero.`);
      continue;
    }
    if (provisional === false || provisional === 'false' || provisional === '0') fail(`${f.label} stays provisional. Contract figures are not a verified ledger entry.`);
    const chosen = basis || (f.key === 'loanRate' ? 'quoted' : HISTORICAL.has(f.key) ? 'historical' : 'explicit');
    if (!f.basis.includes(chosen)) fail(`${f.label}: how it was obtained must be ${f.basis.join(', ')}.`);
    flags[f.key] = { basis: chosen, provisional: true, source };
  }
  return { fields, flags };
}

export function illustrative(amount, percent) {
  if (amount == null || percent == null) return null;
  return roundTo(Number(amount) * Number(percent) / 100, 2);
}

const num = (v) => (v == null || v === '' ? null : Number(v));
export function fromContractRow(row) {
  const fields = { posture: ESTIMATE_POSTURE };
  for (const f of CONTRACT_FIELDS) {
    const raw = row[f.column];
    if (f.kind === 'money' || f.kind === 'percent') fields[f.key] = raw == null ? null : num(raw);
    else if (f.kind === 'date') fields[f.key] = raw ? String(raw).slice(0, 10) : null;
    else if (f.key === 'emdMethod') fields[f.key] = raw || null;
    else if (f.key === 'emdReceipt') fields[f.key] = raw || 'unknown';
    else fields[f.key] = raw == null ? '' : String(raw);
  }
  const flags = {};
  const rawFlags = row.field_flags && typeof row.field_flags === 'object' ? row.field_flags : {};
  for (const [k, v] of Object.entries(rawFlags)) {
    if (!v || typeof v !== 'object' || !FIELD[k] || !FIELD[k].basis) continue;
    flags[k] = { basis: v.basis, provisional: true, source: String(v.source || '') };
  }
  return { fields, flags, updatedAt: row.updated_at || null };
}
export function toContractRow(clean) {
  const row = { posture: ESTIMATE_POSTURE, field_flags: clean.flags || {} };
  for (const f of CONTRACT_FIELDS) row[f.column] = clean.fields[f.key];
  return row;
}
/* jsonb does not keep object key order (Postgres sorts keys by length, then bytes), so the saved field_flags come back
 * in a different order than they were sent. Compare by content, not by key order. Arrays keep their order. */
export function canonicalJson(v) {
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonicalJson(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}
export function contractMismatch(expected, actual) {
  for (const f of CONTRACT_FIELDS) {
    const a = expected.fields[f.key] ?? null;
    const b = actual.fields[f.key] ?? null;
    if (f.kind === 'money' || f.kind === 'percent') {
      if (a == null || b == null) { if (a !== b) return f.key; }
      else if (Math.abs(Number(a) - Number(b)) > 0.000001) return f.key;
    } else if (JSON.stringify(a) !== JSON.stringify(b)) return f.key;
  }
  if (canonicalJson(expected.flags || {}) !== canonicalJson(actual.flags || {})) return 'flags';
  if ((actual.fields.posture || ESTIMATE_POSTURE) !== ESTIMATE_POSTURE) return 'posture';
  return null;
}
export function assertContractPersisted(expected, actual) {
  const bad = contractMismatch(expected, actual);
  if (!actual || bad) fail(CONTRACT_NOT_SAVED);
  return actual;
}
// A save is real only when the database returns exactly one row. Zero rows and two or more rows are a failed save.
export function exactlyOneRow(wrote) {
  if (Array.isArray(wrote)) {
    if (wrote.length !== 1 || wrote[0] == null || typeof wrote[0] !== 'object') fail(CONTRACT_NOT_SAVED);
    return wrote[0];
  }
  if (wrote == null || typeof wrote !== 'object') fail(CONTRACT_NOT_SAVED);
  return wrote;
}
const flagTextOf = (v) => (v ? `${v.basis}, provisional${v.source ? ', ' + v.source : ''}` : null);
export function contractChanges(before, after) {
  const out = [];
  const prev = before || { fields: blankContract('').fields, flags: {} };
  for (const f of CONTRACT_FIELDS) {
    const a = prev.fields[f.key] ?? null;
    const b = after.fields[f.key] ?? null;
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ field: f.key, old: a, new: b });
    const fa = (prev.flags || {})[f.key] || null;
    const fb = (after.flags || {})[f.key] || null;
    if (JSON.stringify(fa) !== JSON.stringify(fb)) out.push({ field: f.key + 'Flag', old: flagTextOf(fa), new: flagTextOf(fb) });
  }
  return out;
}
