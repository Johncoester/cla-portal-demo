/* payoffs.js : Qualia "Mortgage Payoffs", Other Contacts (HOA / HOA Management Co. / Utility Co. / Ground Rent Leaseholder), order info
 * (ground rent, SDAT), the H "HOA / Condo / Ground Rent / Payoffs" presets, payoff tasks + note helpers. PURE: no storage, no network.
 * Source: Francis Santos's Qualia training video (Nov 4 2026); spec /workspace/francis-videos/payoff-hoa-ffb-gr/PAYOFF-HOA-FFB-GR-SPEC.md.
 * John, Nov 4 2026: "mimic Qualia exactly for now". FAKE DATA ONLY. Staff only: agents and clients never see payoffs (amounts, lenders,
 * loan numbers). WIRE INSTRUCTIONS are never stored: a payoff has no bank / routing / account field and unknown keys are refused.
 * A MORTGAGOR SSN is never stored either (Qualia has the field; the test portal shows it disabled). */
export const PAYOFF_TABS = ['First Payoff', 'Second Payoff', 'Third Payoff', 'Fourth Payoff'];
export const MAX_PAYOFFS = 4;
// Qualia Line Items, in order. Each is an amount; INTEREST also has a date (Interest Calculated "to" / "through").
export const PAYOFF_LINES = [['principal', 'PRINCIPAL'], ['interest', 'INTEREST'], ['additionalInterest', 'ADDITIONAL INTEREST'], ['escrow', 'ESCROW'],
  ['prepayPenalty', 'PREPAY PENALTY'], ['releaseCharge', 'RELEASE CHARGE'], ['lateCharge', 'LATE CHARGE']];
// the label rows under LATE CHARGE (free text labels in Qualia; these are the ones in the video, in its order)
export const PAYOFF_ITEM_SUGGESTIONS = ['Accrued/Unpaid Interest', 'Late Fees Unpaid/Due', 'Unpaid Loan Charges', 'Estimated Payoff Charges', 'Suspense Balance'];
export const MAX_ITEMS = 12;
export const DAYS_PER_YEAR = ['360', '365', '366'];
export const INTEREST_MODES = [['to', 'to'], ['through', 'through']];
export const TOTAL_DUE_HELP = "Total payment due for payoff to be paid up through 'Good thru' date";
export const TOTAL_DUE_FROM = ['Payoff Principal', 'Payoff Interest', 'Payoff Additional Interest', 'Payoff Penalty Amount', 'Payoff Release Amount', 'Payoff Late Charge Amount', 'Payoff Escrow', 'Payoff Additional Line Items'];
export const PER_DIEM_FROM = ['Payoff Days Per Year', 'Payoff Principal', 'Payoff Interest Rate'];
export const RECORDING_FIELDS = [['originalMortgagee', 'ORIGINAL MORTGAGEE'], ['originalTrustee', 'ORIGINAL TRUSTEE'], ['originalAmount', 'ORIGINAL MORTGAGE AMOUNT'], ['dotDate', 'DEED OF TRUST DATE'],
  ['dateRecorded', 'DATE RECORDED'], ['instrument', 'INSTRUMENT #'], ['book', 'BOOK'], ['page', 'PAGE'], ['certOfTitle', 'CERT OF TITLE #'], ['docNo', 'DOC #']];
const REC_DATES = ['dotDate', 'dateRecorded'];
const LENDER_KEYS = ['name', 'phone', 'address', 'otherContactId'];
const PAYOFF_KEYS = ['position', 'lender', 'loanNumber', 'lienHolder', 'trustee', 'isMortgage', 'recording', ...PAYOFF_LINES.map(([k]) => k), 'interestTo', 'interestMode', 'calc', 'items', 'goodThrough', 'note'];
const CALC_KEYS = ['daysPerYear', 'from', 'to', 'rate', 'perDiem'];

// ---------- Other Contacts (Contacts › + › Select Contact Type) ----------
// Qualia's list is long (Appraisal Company, Builder, Credit Card Co., ... HOA, HOA Management Co., ... Utility Co.); the portal adds the four the
// video uses for HOA / FFB / ground rent, plus Payoff Lender (Payoffs › New Payoff Lender) and Other Company (the GR leaseholder in the video).
export const OTHER_CONTACT_TYPES = [['hoa', 'HOA'], ['hoaMgmt', 'HOA Management Co.'], ['utility', 'Utility Co.'], ['grLeaseholder', 'Ground Rent Leaseholder'], ['payoffLender', 'Payoff Lender'], ['otherCompany', 'Other Company']];
export const otherTypeLabel = (k) => (OTHER_CONTACT_TYPES.find(([x]) => x === k) || [k, k])[1];
// a type that has a management company (Qualia: "Switch HOA Management Co." on an HOA; the FFB Utility Co. is run by a management group)
export const MANAGED_TYPES = { hoa: 'hoaMgmt', utility: 'hoaMgmt' };

// ---------- order info (ORDER INFO note in the video: "GROUND RENT - YES - SEE CONTRACT PAGE 30", "Property Type: Leasehold", SDAT) ----------
export const YES_NO_VERIFY = [['', 'Not set'], ['yes', 'Yes'], ['no', 'No'], ['verify', 'Verify']];
export const PROPERTY_TYPES = [['', 'Not set'], ['feeSimple', 'Fee Simple'], ['leasehold', 'Leasehold (ground rent)']];
export const REDEMPTION = [['', 'Not set'], ['none', 'No redemption'], ['considering', 'Seller considering redemption'], ['requested', 'Redemption requested'], ['redeemed', 'Redeemed']];
const INFO_KEYS = ['propertyType', 'groundRent', 'grContractPage', 'sdatGrRegistration', 'sdatGrRedemption', 'redemption', 'redemptionNote', 'hoa', 'condo', 'ffb', 'needPayoff', 'deedsOfTrust'];

// ---------- H "HOA / Condo / Ground Rent / Payoffs" presets (Other Charges rows in the video) ----------
//   payeeType: the Other Contact type whose company is the payee (CLA = CLA Title & Escrow); side: who pays at closing
export const HOA_GR_PRESETS = [
  ['hoaReimb', 'HOA Request Reimbursement', 'cla', 'seller'],
  ['hoaTransfer', 'HOA Transfer Fee', 'hoaMgmt', 'buyer'],
  ['hoaPrepaid', 'HOA Prepaid Assessment', 'hoa', 'buyer'],
  ['ffbBalance', 'Front Foot Benefit Owner Current Balance', 'utility', 'seller'],
  ['ffbFee', 'Front Foot Benefit Statement of Account Fee', 'utilityMgmt', 'seller'],
  ['groundRent', 'Ground Rent Due', 'grLeaseholder', 'seller']].map(([key, description, payeeType, side]) => ({ key, description, payeeType, side }));
export const HOA_GR_GROUP_TITLE = 'HOA / Condo / Ground Rent / Payoffs';
export const PAID_TO_SUGGESTIONS = ['In Escrow', 'At Closing', 'Outside Closing'];

// ---------- Pre-Closing payoff tasks (Purchase Standard › Pre-Closing in the video; nothing is sent) ----------
//   due: 'goodThrough' = the first payoff's good-through date; a number = days from today
export const PAYOFF_TASKS = [
  ['Order 1st payoffs', 3], ['Order 2nd Payoff', 3], ['Confirm receipt of payoffs', 7], ['Receive 2nd Payoff', 7], ['Update Payoff', 'goodThrough'],
  ['Request HOA/Condo/Estoppels Docs', 3], ['Confirm receipt of HOA/Condo/Estoppels Docs', 10], ['Receive Homeowners Association (HOA) Information', 10],
  ['Order FFB Payoff', 3], ['FFB Payoff Received', 10], ['Order Ground Rent Payoff', 3], ['Ground Rent Payoff Received', 10]].map(([title, due]) => ({ title, due }));
export const TASK_GROUP = 'Pre-Closing';

// ---------- notes (Qualia Notes: markdown, "# PAYOFF TEAM", dated lines "11.04 Cassey - RECEIVED - GT 11.0…") ----------
export const NOTE_SECTIONS = [['payoff', 'PAYOFF TEAM'], ['hoa', 'HOA'], ['ffb', 'FFB'], ['gr', 'GROUND RENT'], ['orderInfo', 'ORDER INFO']];
export const QUICK_NOTES = [['received', 'Received payoff GDTH {gt}'], ['ordered', 'Ordered Payoff via email'], ['followUp', 'sent a follow up'], ['auth', 'Requested auth from the seller'],
  ['updated', 'Ordered Updated Payoff via email'], ['zero', 'RECEIVED - GT {gt} - ZERO BALANCE'], ['ffbOrdered', 'Ordered FFB via email'], ['ffbReceived', 'RECEIVED - ANNUALLY - PAST DUE'],
  ['noGr', 'NO GR on SDAT'], ['grReceived', 'Ground rent Payoff Received']];
// ---------- documents: Qualia "300 Payoffs and Invoices" with PAYOFF FORMS and PAYOFF FOLDER inside ----------
export const PAYOFF_FOLDER_ROOT = '300 Payoffs and Invoices';
export const PAYOFF_FOLDERS = [PAYOFF_FOLDER_ROOT, `${PAYOFF_FOLDER_ROOT} › PAYOFF FORMS`, `${PAYOFF_FOLDER_ROOT} › PAYOFF FOLDER`];

const fail = (m) => { throw new Error(m); };
const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
export const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v + 'T00:00:00Z')) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
const r2 = (n) => Math.round(Number(n) * 100) / 100;
// an amount: '' / null = not set; may be negative only where `neg` (Suspense Balance is entered as a negative)
export function amt(v, label, { neg = false } = {}) {
  if (v == null || v === '') return null; const t = String(v).replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1');
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) fail(`${label} must be an amount like 1,250.00 (at most 2 decimals).`);
  const n = Number(t); if (n < 0 && !neg) fail(`${label} cannot be negative.`); if (Math.abs(n) > 100000000) fail(`${label} is too large.`); return r2(n);
}
const date = (v, label) => { if (v == null || v === '') return null; if (!isDate(v)) fail(`${label} must be a date (YYYY-MM-DD).`); return v; };
const days = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
export const mdy = (s) => (s ? `${s.slice(5, 7)}/${s.slice(8, 10)}/${s.slice(0, 4)}` : '');
export const usd = (n, dp = 2) => (Number(n) < 0 ? '-' : '') + '$' + Math.abs(Number(n || 0)).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
// "No bank details": any key that looks like one is refused with the same words the Charges payments use
const BANKISH = /(routing|aba|account|acct|bank|wire|iban|swift|ssn|social)/i;
const noUnknown = (o, keys, what) => { for (const k of Object.keys(o)) { if (BANKISH.test(k) && !keys.includes(k)) fail(`${what}: ${k} is never stored in the test portal (no wire instructions, bank details or SSNs).`); if (!keys.includes(k)) fail(`${what}: unknown field ${k}.`); } };

// ---------- one payoff ----------
export function cleanPayoff(input) {
  const v = input || {}; if (typeof v !== 'object' || Array.isArray(v)) fail('Payoff: bad fields.');
  noUnknown(v, PAYOFF_KEYS, 'Payoff');
  const out = {};
  const pos = Number(v.position); if (!(Number.isInteger(pos) && pos >= 1 && pos <= MAX_PAYOFFS)) fail(`A file has at most ${MAX_PAYOFFS} payoffs (First to Fourth Payoff).`); out.position = pos;
  const L = v.lender || {}; if (typeof L !== 'object' || Array.isArray(L)) fail('Payoff lender: bad fields.'); noUnknown(L, LENDER_KEYS, 'Payoff lender');
  out.lender = { name: str(L.name, 120) || fail('Add the payoff lender first (Existing Payoff Lender or New Payoff Lender).'), phone: str(L.phone, 40), address: str(L.address, 200), otherContactId: str(L.otherContactId, 60) || null };
  out.loanNumber = str(v.loanNumber, 40); out.lienHolder = str(v.lienHolder, 120); out.trustee = str(v.trustee, 120);
  out.isMortgage = v.isMortgage === true || v.isMortgage === 'yes' ? true : v.isMortgage === false || v.isMortgage === 'no' ? false : null;
  const R = v.recording || {}; if (typeof R !== 'object' || Array.isArray(R)) fail('Recording info: bad fields.'); noUnknown(R, RECORDING_FIELDS.map(([k]) => k), 'Recording info');
  out.recording = {}; for (const [k, l] of RECORDING_FIELDS) { const x = REC_DATES.includes(k) ? date(R[k], l) : k === 'originalAmount' ? amt(R[k], l) : str(R[k], 60); if (x != null && x !== '') out.recording[k] = x; }
  for (const [k, l] of PAYOFF_LINES) out[k] = amt(v[k], l);
  out.interestTo = date(v.interestTo, 'Interest to date'); out.interestMode = v.interestMode === 'through' ? 'through' : 'to';
  const C = v.calc || {}; if (typeof C !== 'object' || Array.isArray(C)) fail('Calculate Additional Interest: bad fields.'); noUnknown(C, CALC_KEYS, 'Calculate Additional Interest');
  const c = { daysPerYear: C.daysPerYear == null || C.daysPerYear === '' ? '365' : String(C.daysPerYear) }; if (!DAYS_PER_YEAR.includes(c.daysPerYear)) fail('Days per year must be 360, 365 or 366.');
  c.from = date(C.from, 'Additional interest FROM date'); c.to = date(C.to, 'Additional interest TO date'); if (c.from && c.to && c.to < c.from) fail('Additional interest: the TO date is before the FROM date.');
  if (C.rate != null && C.rate !== '') { const t = String(C.rate).replace(/[%\s]/g, ''); if (!/^\d{1,2}(\.\d{1,5})?$/.test(t)) fail('Interest rate must be a percentage like 8 or 6.875.'); c.rate = Number(t); } else c.rate = null;
  if (C.perDiem != null && C.perDiem !== '') { const t = String(C.perDiem).replace(/[$,\s]/g, ''); if (!/^\d+(\.\d{1,5})?$/.test(t) || Number(t) > 1000000) fail('Per diem must be an amount like 24.71.'); c.perDiem = Number(t); } else c.perDiem = null;
  out.calc = c;
  const items = v.items == null ? [] : Array.isArray(v.items) ? v.items : fail('Payoff line items must be a list.'); if (items.length > MAX_ITEMS) fail(`At most ${MAX_ITEMS} additional payoff line items.`);
  out.items = items.map((it, i) => { if (!it || typeof it !== 'object') fail('Payoff line item: bad entry.'); noUnknown(it, ['label', 'amount'], 'Payoff line item');
    const label = str(it.label, 80); const a = amt(it.amount, `Line item ${i + 1} (${label || 'no label'})`, { neg: true }); if (a != null && !label) fail(`Line item ${i + 1}: add a label for the amount.`); return { label, amount: a }; })
    .filter((it) => it.label || it.amount != null);
  out.goodThrough = date(v.goodThrough, 'Good through date'); out.note = str(v.note, 500);
  return out;
}
// Calculate Additional Interest: FROM defaults to the interest-to date (Qualia), TO = the good-through date (else the closing date).
// Per diem is precalculated from Days Per Year, Principal and Interest Rate; a typed per diem is a User Override (orange in Qualia).
export function payoffCalc(p, { closingDate = null } = {}) {
  const c = p.calc || {}; const dpy = Number(c.daysPerYear || 365);
  const from = c.from || p.interestTo || null; const to = c.to || p.goodThrough || closingDate || null;
  const calcPerDiem = p.principal != null && c.rate != null ? Math.round((p.principal * c.rate / 100 / dpy) * 100000) / 100000 : null;
  const perDiem = c.perDiem != null ? c.perDiem : calcPerDiem; const overridden = c.perDiem != null && calcPerDiem != null && Math.abs(c.perDiem - calcPerDiem) > 0.000005;
  // "through" = interest is already paid THROUGH the from date, so the extra days start the next day; "to" = up to (not including) it
  const n = from && to && to >= from ? days(from, to) + 0 : 0;
  const calcAdditional = perDiem != null && n > 0 ? r2(perDiem * n) : null;
  const additional = p.additionalInterest != null ? p.additionalInterest : calcAdditional;
  const parts = [['Principal', p.principal], ['Interest', p.interest], ['Additional interest', additional], ['Escrow', p.escrow], ['Prepay penalty', p.prepayPenalty], ['Release charge', p.releaseCharge], ['Late charge', p.lateCharge],
    ...(p.items || []).map((it) => [it.label, it.amount])].filter(([, x]) => x != null && x !== 0);
  const total = r2(parts.reduce((t, [, x]) => t + Number(x), 0));
  return { from, to, days: n, daysPerYear: String(dpy), calcPerDiem, perDiem, perDiemOverridden: overridden, calcAdditional, additional, additionalOverridden: p.additionalInterest != null && calcAdditional != null && p.additionalInterest !== calcAdditional,
    total, parts, text: parts.map(([l, x]) => `${l} ${usd(x)}`).join(' + ') + ` = ${usd(total)}` };
}
// the fee-ledger line a payoff becomes (ALTA Payoffs; CD seller side N "Payoff of First Mortgage Loan"; a refinance = borrower, CD page 3 payoffs)
export const PAYOFF_ORDINAL = ['First', 'Second', 'Third', 'Fourth'];
export function payoffFeeInput(p, refi, total) {
  const desc = `Payoff of ${PAYOFF_ORDINAL[p.position - 1]} Mortgage Loan${p.loanNumber ? ` (Loan # ending ${String(p.loanNumber).slice(-4)})` : ''}`;
  const note = `From Mortgage Payoffs: ${PAYOFF_TABS[p.position - 1]}${p.goodThrough ? `, good through ${mdy(p.goodThrough)}` : ''}. Edit it on the Payoffs page.`;
  return refi ? { kind: 'charge', description: desc, altaSection: 'payoffs', cdSection: '', cdLine: '', payee: p.lender.name, amount: total.toFixed(2), paidBy: 'buyer', timing: 'at', note }
    : { kind: 'charge', description: desc, altaSection: 'payoffs', cdSection: 'N', cdLine: '', payee: p.lender.name, amount: total.toFixed(2), paidBy: 'seller', timing: 'at', note };
}

// ---------- other companies ----------
export function cleanCompany(input) {
  const v = input || {}; noUnknown(v, ['name', 'type', 'phone', 'fax', 'address', 'managementCompanyId'], 'Company');
  const type = OTHER_CONTACT_TYPES.some(([k]) => k === v.type) ? v.type : fail('Pick a contact type (HOA, HOA Management Co., Utility Co., Ground Rent Leaseholder ...).');
  return { name: str(v.name, 120) || fail('Company name is required.'), type, phone: str(v.phone, 40), fax: str(v.fax, 40), address: str(v.address, 200), managementCompanyId: str(v.managementCompanyId, 60) || null };
}
export const companyMatches = (c, q, type) => (!type || c.type === type) && (!q || `${c.name} ${c.address}`.toLowerCase().includes(String(q).toLowerCase().trim()));

// ---------- order info ----------
export function cleanOrderInfo(input) {
  const v = input || {}; noUnknown(v, INFO_KEYS, 'Order info'); const out = {};
  const pick = (k, list, label) => { const x = v[k] == null ? '' : String(v[k]); if (!list.some(([c]) => c === x)) fail(`${label}: pick one from the list.`); if (x) out[k] = x; };
  pick('propertyType', PROPERTY_TYPES, 'Property type'); pick('groundRent', YES_NO_VERIFY, 'Ground rent'); pick('hoa', YES_NO_VERIFY, 'HOA'); pick('condo', YES_NO_VERIFY, 'Condo'); pick('ffb', YES_NO_VERIFY, 'Deferred water / FFB');
  pick('needPayoff', YES_NO_VERIFY, 'Need payoff'); pick('redemption', REDEMPTION, 'Redemption');
  const page = str(v.grContractPage, 20); if (page) { if (!/^[0-9A-Za-z .,-]{1,20}$/.test(page)) fail('Contract page: a page number like 30.'); out.grContractPage = page; }
  for (const k of ['sdatGrRegistration', 'sdatGrRedemption']) if (v[k] === true || v[k] === 'true' || v[k] === 'on') out[k] = true;
  const rn = str(v.redemptionNote, 500); if (rn) out.redemptionNote = rn;
  if (v.deedsOfTrust != null && v.deedsOfTrust !== '') { const n = Number(v.deedsOfTrust); if (!(Number.isInteger(n) && n >= 0 && n <= 9)) fail('Total Nos. Deed of Trust: a whole number 0-9.'); out.deedsOfTrust = n; }
  if (out.grContractPage && out.groundRent !== 'yes') fail('A contract page reference is for ground rent = Yes.');
  return out;
}
// the ORDER INFO note lines, Qualia style ("GROUND RENT - YES - SEE CONTRACT PAGE 30")
export function orderInfoLines(o) {
  const yn = (x) => (x === 'yes' ? 'YES' : x === 'no' ? 'NO' : x === 'verify' ? 'VERIFY' : '');
  const out = [];
  if (o.propertyType) out.push(`Property Type: ${o.propertyType === 'leasehold' ? 'Leasehold' : 'Fee Simple'}`);
  if (o.needPayoff) out.push(`PAYOFF- ${yn(o.needPayoff)}`); if (o.hoa) out.push(`HOA - ${yn(o.hoa)}`); if (o.condo) out.push(`CONDO - ${o.condo === 'no' ? 'NONE' : yn(o.condo)}`);
  if (o.ffb) out.push(`DEFERRED WATER/FFB - ${yn(o.ffb)}`);
  if (o.groundRent) out.push(`GROUND RENT - ${yn(o.groundRent)}${o.grContractPage ? ` - SEE CONTRACT PAGE ${o.grContractPage}` : ''}`);
  if (o.sdatGrRegistration) out.push('SDAT: Ground Rent Registration on File'); if (o.sdatGrRedemption) out.push('SDAT: Ground Rent Redemption on File');
  if (o.redemption) out.push(`REDEMPTION - ${(REDEMPTION.find(([k]) => k === o.redemption) || ['', ''])[1]}${o.redemptionNote ? ` - ${o.redemptionNote}` : ''}`);
  if (o.deedsOfTrust != null) out.push(`TOTAL Nos. Deed of Trust - ${o.deedsOfTrust}`);
  return out;
}

// ---------- notes ----------
// "11.04 Cassey - RECEIVED - GT 11.07": MM.DD of today, the writer's first name, the text ({gt} = the payoff's good-through MM/DD)
export function quickNote(key, { today, firstName, goodThrough }) {
  const q = QUICK_NOTES.find(([k]) => k === key) || fail('Unknown quick note.');
  const gt = goodThrough ? `${goodThrough.slice(5, 7)}/${goodThrough.slice(8, 10)}` : 'mm/dd';
  return `${today.slice(5, 7)}.${today.slice(8, 10)} ${firstName} - ${q[1].replace('{gt}', gt)}`;
}
export function cleanNote(input) {
  const v = input || {}; noUnknown(v, ['section', 'body', 'critical'], 'Note');
  const section = NOTE_SECTIONS.some(([k]) => k === v.section) ? v.section : fail('Pick a note section (PAYOFF TEAM, HOA, FFB, GROUND RENT, ORDER INFO).');
  const body = String(v.body == null ? '' : v.body).replace(/\r/g, '').trim().slice(0, 4000) || fail('Write the note first.');
  if (/\b\d{9,17}\b/.test(body) && /(routing|aba|account|acct|wire)/i.test(body)) fail('Notes never hold wire instructions or bank account numbers.');
  return { section, body, critical: v.critical === true || v.critical === 'true' || v.critical === 'on' };
}
// the H preset -> a fee input (description-only $0.00 line on the next free H line; the payee from the file's Other Contacts)
export function hoaGrFeeInput(preset, line, payee, amount, paidTo) {
  const side = preset.side; const a = amount == null || amount === '' ? '0' : String(amount);
  return { kind: 'charge', description: preset.description, altaSection: 'misc', cdSection: 'H', cdLine: line, payee: payee || '', amount: a, paidBy: side, timing: 'at', presetKey: 'hoagr:' + preset.key,
    meta: { group: 'hoaGr', ...(paidTo ? { paidTo } : {}) } };
}
