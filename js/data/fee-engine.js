/* fee-engine.js : CLA RATES for the Accounting tab (John, Nov 3: "start working on having our fees recording fees into the system").
 * Turns an order (state, county, price, loan, purchase / cash / refinance) into PROPOSED fee lines for the Accounting fee ledger, using the
 * CLA quote calculator's OWN calculation code and rate tables, VENDORED read-only into ./vendor/cla-calculator/ (see docs/CALCULATOR-FEES.md):
 *   calc-core.js     index.html of cla-calculator @ CALC_SOURCE.commit, the pure part of its <script> (calc, premiums, taxAmount, pick, ...)
 *   fee-snapshot.js  the calculator's embedded snapshot of the "CLA Fee Tables (Live - Calculator)" sheet (CLA_Fees, Recording_Fees,
 *                    Transfer_Taxes, Premium_Tiers, Premium_Rules, Endorsements, Jurisdictions)
 * Every AMOUNT comes from the calculator's calc() (so the portal and a CLA quote always agree; test/test-fee-engine.js checks this against
 * fixtures produced by the calculator itself). This file only adds: the order -> calculator inputs mapping, the ALTA / CD section mapping,
 * payee, paid-by split, the rate-source / calculation text, and the preview diff (new / changed / unchanged / overridden / retire).
 * PURE: no storage, no network. Loaded lazily (dynamic import) by the accounting adapters, so with the `accounting` flag off it is never loaded.
 *
 * RATE SOURCE SEAM (adapter interface, documented in docs/CALCULATOR-FEES.md):
 *   { id, label, version, loadTables(): Promise<raw tabs> }   raw tabs = { CLA_Fees: [[header...], [row...]], Recording_Fees: [...], ... }
 *   vendoredRateSource          the built-in snapshot above (the only one used today)
 *   calculatorSupabaseRateSource NOT CONNECTED: a placeholder showing where a reader of the calculator's tables would plug in. It refuses. */
import * as C from './vendor/cla-calculator/calc-core.js?v=202611050803';
import { CALC_SOURCE_ID, CALC_TAG, CALC_FIELDS, calcFields, isCalculated, isOverridden } from './accounting.js?v=202611050803';
export { CALC_SOURCE_ID, CALC_TAG, CALC_FIELDS, calcFields, isCalculated, isOverridden };

export const CALC_SOURCE = { repo: 'github.com/Johncoester/cla-closing-cost-calculator', commit: '69568a9', snapshot: '2026-11-02', files: 'index.html (calc code), fee-snapshot.js (rate tables)' };
export const CALC_STATES = ['MD', 'VA', 'DC', 'FL'];
export const UNDERWRITER = 'Fidelity National Title';     // the only underwriter in the calculator's Premium_Tiers / Rules / Endorsements
const fail = (m) => { throw new Error(m); };
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const usd = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd0 = (n) => '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const SRC = `CLA calculator ${CALC_SOURCE.commit}`;

// ---------------- rate sources ----------------
export const vendoredRateSource = { id: 'vendored-snapshot', label: `${SRC} built-in fee snapshot (${CALC_SOURCE.snapshot})`, version: `${CALC_SOURCE.commit}/${CALC_SOURCE.snapshot}`,
  async loadTables() { return C.SNAP; }, tablesSync() { return C.SNAP; } };
// NOT CONNECTED (documented seam). The calculator's Supabase project today holds quotes and rep pricing (pricing_tables / pricing_table_fees:
// the per-rep SETTLEMENT fee only), not the rate tables, which live in the Google Sheet + the snapshot. If CLA moves the tables into Supabase,
// a reader returns the same raw-tab shape (one array per TABS name, header row first) and everything below works unchanged.
export function calculatorSupabaseRateSource() {
  return { id: 'calculator-supabase', label: 'CLA calculator Supabase tables (NOT CONNECTED)', version: null,
    async loadTables() { fail('The calculator database is not connected to the portal. The portal uses the built-in CLA rate snapshot.'); } };
}
const cache = new Map();
export async function loadRateTables(source = vendoredRateSource) {
  if (!cache.has(source.id)) cache.set(source.id, C.normalize(await source.loadTables()));
  return { tables: cache.get(source.id), source: { id: source.id, label: source.label, version: source.version } };
}
export function vendoredTables() { if (!cache.has(vendoredRateSource.id)) cache.set(vendoredRateSource.id, C.normalize(C.SNAP)); return cache.get(vendoredRateSource.id); }

// ---------------- order -> calculator inputs ----------------
const isRefi = (d) => !!d && (d.transactionType === 'Refinance' || d.transaction_type === 'Refinance');
export const calcTypeOf = (deal) => (isRefi(deal) ? 'refi' : (Number(deal.loanAmount ?? deal.loan_amount) || 0) > 0 ? 'purchase' : 'cash');
export function countyOf(R, deal) {
  const st = String(deal.state || '').toUpperCase(); if (st === 'DC') return 'District of Columbia';
  let c = String(deal.county || '').trim().replace(/\s+county$/i, ''); if (!c) return '';
  const hit = C.allCounties(R, st).find((x) => C.eq(x, c)); return hit || c;
}
export const NO_OO = /^(FL|VA)$/;   // the calculator hides principal residence / first-time buyer in FL and VA (they change nothing there)
// options: everything the calculator asks that the order does not store. Defaults = the calculator's own defaults.
// owner (Caroline Kim, Nov 4 2026): true = an owner's policy is issued (simultaneous issue with the lender's policy on a financed purchase);
// false = the owner's policy is REMOVED: no owner's line, no owner's endorsements, and the lender's policy is priced at the full basic rate.
export const DEFAULT_OPTIONS = { occ: true, fthb: false, pol: 'enhanced', rate: 'basic', pres: 'trid', ownPay: '', payoff: 0, assessed: 0, ends: null, owner: true };
// BASIC vs ENHANCED owner's policy (Caroline, Nov 4: "in states where applicable"): what the calculator's rate data supports per state.
//   bands = Premium_Tiers has Owner / Enhanced bands; pct = Premium_Rules enhanced_owner_pct (ALTA Homeowner's = pct% of basic); none = no
//   enhanced rate in the data (FL today): the toggle is shown as a PLACEHOLDER and the basic rate is used (open question for Caroline).
export function enhancedSupport(R, state) {
  const st = String(state || '').toUpperCase(); const bands = C.uwRows(R.Premium_Tiers, UNDERWRITER, st).some((x) => C.eq(x.Policy, 'Owner') && C.eq(x['Rate Type'], 'Enhanced'));
  const pct = C.rule(R, UNDERWRITER, st, 'enhanced_owner_pct');
  if (bands) return { supported: true, how: 'bands', pct: null, note: `${st}: Enhanced owner's rate table (Premium_Tiers).` };
  if (pct) return { supported: true, how: 'pct', pct, note: `${st}: Enhanced (ALTA Homeowner's) = ${pct}% of the basic owner's premium (Premium_Rules enhanced_owner_pct).` };
  return { supported: false, how: 'none', pct: null, note: `${st}: the CLA rate data has no enhanced owner's rate for ${st} (no Enhanced bands, no enhanced_owner_pct). PLACEHOLDER: the basic owner's rate is used. Open question for Caroline.` };
}
export const ENHANCED_PLACEHOLDER = "PLACEHOLDER - no enhanced owner's rate in the CLA rate data for this state; the basic rate is shown.";
// the rate tables without any owner's premium bands (used when the owner's policy is removed, so the calculator prices the lender's policy alone)
const noOwnerCache = new WeakMap();
const tablesWithoutOwner = (R) => { if (!noOwnerCache.has(R)) noOwnerCache.set(R, { ...R, Premium_Tiers: R.Premium_Tiers.filter((x) => !C.eq(x.Policy, 'Owner')) }); return noOwnerCache.get(R); };
export function cleanOptions(o = {}) {
  const v = { ...DEFAULT_OPTIONS, ...(o || {}) }; const money = (x, l) => { const n = Number(String(x ?? 0).replace(/[$,\s]/g, '')); if (!isFinite(n) || n < 0 || n > 1e8) fail(`${l} must be an amount (0 or more).`); return r2(n); };
  if (!['enhanced', 'standard'].includes(v.pol)) fail("Owner's policy must be enhanced or standard.");
  if (!['basic', 'reissue'].includes(v.rate)) fail('Rate must be basic or reissue.');
  if (!['trid', 'actual'].includes(v.pres)) fail('Premium presentation must be TRID or actual.');
  if (!['', 'Buyer', 'Seller', 'MDB', 'CHA'].includes(v.ownPay)) fail("Owner's policy paid by must be local custom, buyer or seller (Florida: MDB / CHA too).");
  if (v.ends != null && (!Array.isArray(v.ends) || v.ends.some((x) => typeof x !== 'string' || x.length > 40))) fail('Endorsements must be a list of codes.');
  if (![true, false, 'true', 'false'].includes(v.owner)) fail("Owner's policy must be included (true) or removed (false).");
  return { occ: v.occ !== false && v.occ !== 'false', fthb: v.fthb === true || v.fthb === 'true', pol: v.pol, rate: v.rate, pres: v.pres, ownPay: v.ownPay, payoff: money(v.payoff, 'Payoff'), assessed: money(v.assessed, 'Assessed value'), ends: v.ends ? [...v.ends] : null,
    owner: v.owner !== false && v.owner !== 'false' };
}
export function endorsementChoices(R, state, type) {
  return C.uwRows(R.Endorsements, UNDERWRITER, state).filter((e) => C.txOK(e.Transaction, type) && !(type === 'cash' && C.eq(e['Applies To'], 'Lender')))
    .map((e) => ({ code: e.Code, name: e.Name, appliesTo: e['Applies To'], pricing: e.Pricing, amount: C.num(e.Amount), defaultOn: e['Default On'] === 'Y' }));
}
// the CLA fee rows the calculator includes (its fee list is fixed: every row "Default On" is ticked and locked; standard pricing, no rep special rate)
export function claFeeInputs(R, state, type) {
  return C.claFees(R, state, type).filter((f) => f['Default On'] !== 'N').map((f) => ({ name: f['Fee Name'], payer: f['Paid By'], tx: f.Transaction, sec: f['LE Section'] || 'C', amt: C.num(f.Amount) || 0 }));
}
export function calcInputs(deal, options = {}, R = vendoredTables()) {
  if (!deal) fail('Order not found.');
  const state = String(deal.state || '').toUpperCase(); if (!CALC_STATES.includes(state)) fail(`CLA rates cover MD, VA, DC and FL only (this order is in ${state || 'no state'}).`);
  const o = cleanOptions(options); const type = calcTypeOf(deal); const enh = enhancedSupport(R, state);
  const enhancedPlaceholder = !enh.supported && o.pol === 'enhanced' && !!options && options.pol === 'enhanced' && o.owner && type !== 'refi';
  const price = Number(deal.purchasePrice ?? deal.purchase_price) || 0; const loan = Number(deal.loanAmount ?? deal.loan_amount) || 0;
  if (type !== 'refi' && !(price > 0)) fail('Enter the purchase price on the order first (File Overview).');
  if (type === 'refi' && !(loan > 0)) fail('Enter the loan amount on the order first (File Overview).');
  const county = countyOf(R, deal);
  const ends = o.ends != null ? o.ends : endorsementChoices(R, state, type).filter((e) => e.defaultOn).map((e) => e.code);
  return { type, state, county, uw: UNDERWRITER, price: type === 'refi' ? 0 : price, assessed: state === 'VA' && type !== 'refi' ? o.assessed : 0, loan: type === 'cash' ? 0 : loan, payoff: type === 'refi' ? o.payoff : 0,
    pol: o.pol, rate: o.rate, fthb: o.fthb && !NO_OO.test(state) && type !== 'refi', occ: NO_OO.test(state) || o.occ, ownPay: type === 'refi' ? '' : o.ownPay, pres: o.pres, ends,
    fees: claFeeInputs(R, state, type), docs: JSON.parse(JSON.stringify(C.DOC_DEFAULTS[type])), buyerPaidComm: { mode: 'pct', val: 0 }, brokerAdminFee: 0, buyerPaysSellerTax: false, taxPayers: undefined,
    owner: type === 'refi' ? false : o.owner, enhancedPlaceholder };   // pol is passed as given: with no enhanced rate the calculator itself uses the basic rate
}

// ---------------- explanations (text only; amounts always come from calc()) ----------------
const bandText = (R, st, pol, rt, amt) => {
  const rows = C.uwRows(R.Premium_Tiers, UNDERWRITER, st).filter((x) => C.eq(x.Policy, pol) && C.eq(x['Rate Type'], rt)); if (!rows.length || !(amt > 0)) return '';
  const rnd = C.rule(R, UNDERWRITER, st, 'round_coverage_to') || 1000; const a = Math.ceil(amt / rnd - 1e-9) * rnd; const parts = [];
  for (const x of rows) { const f = C.num(x['Band From ($)']) || 0, t = C.num(x['Band To ($)']); const part = Math.min(a, t == null ? Infinity : t) - f; if (part > 0) { const rate = C.num(x['Rate per $1,000']) || 0, flat = C.num(x['Flat Amount ($)']) || 0;
    parts.push(`${usd0(f)}-${t == null ? 'up' : usd0(t)}: ${rate ? `${usd0(part)} × $${rate}/1,000 = ${usd(part / 1000 * rate)}` : ''}${flat ? `${rate ? ' + ' : ''}flat ${usd(flat)}` : ''}`); } }
  const mn = C.rule(R, UNDERWRITER, st, pol === 'Owner' ? 'min_premium_owner' : 'min_premium_lender');
  return `${pol === 'Owner' ? "owner's" : "loan"} ${rt} rate on ${usd0(amt)}${a !== amt ? ` (rounded up to ${usd0(a)})` : ''}: ${parts.join('; ')}${mn ? ` (minimum ${usd0(mn)})` : ''}`;
};
function premiumExplain(R, i, P, which) {
  const st = i.state; const trid = i.pres !== 'actual';
  if (which === 'lender') {
    if (i.type !== 'refi' && i.owner === false) { const full = bandText(R, st, 'Loan', 'Basic', i.loan);
      return { rateSource: `${SRC} · Premium_Tiers (${UNDERWRITER}, ${st}, Loan, Basic) + Premium_Rules`, calculation: `Lender's policy alone (owner's policy removed, so no simultaneous issue): full rate ${full} = ${usd(P.lenderFull)}.` }; }
    if (i.type === 'refi') { const rt = i.rate === 'reissue' ? 'Reissue' : 'Refinance'; const t = bandText(R, st, 'Loan', rt, i.loan) || bandText(R, st, 'Loan', 'Basic', i.loan);
      return { rateSource: `${SRC} · Premium_Tiers (${UNDERWRITER}, ${st}, Loan, ${rt})`, calculation: `Lender's policy, refinance: ${t} = ${usd(P.lenderFull)}.` }; }
    const full = bandText(R, st, 'Loan', 'Basic', i.loan); const sim = C.rule(R, UNDERWRITER, st, 'simultaneous_lender_flat');
    return { rateSource: `${SRC} · Premium_Tiers (${UNDERWRITER}, ${st}, Loan, Basic) + Premium_Rules`,
      calculation: trid ? `Lender's policy (TRID: the full lender's premium is shown): ${full} = ${usd(P.lenderFull)}. Simultaneous-issue price actually charged: ${usd(P.lenderActual)}${sim != null ? ` (simultaneous_lender_flat ${usd0(sim)}${i.loan > i.price ? ' + excess over the price' : ''})` : ''}.`
        : `Lender's policy at the simultaneous-issue price: ${usd(P.lenderActual)}${sim != null ? ` (Premium_Rules simultaneous_lender_flat ${usd0(sim)}${i.loan > i.price ? ' + premium on the loan amount above the price' : ''})` : ''}; full premium would be ${usd(P.lenderFull)} (${full}).` };
  }
  const rt = i.rate === 'reissue' ? 'Reissue' : 'Basic'; const base = bandText(R, st, 'Owner', rt, i.price); const pct = C.rule(R, UNDERWRITER, st, 'enhanced_owner_pct');
  const enh = i.pol === 'enhanced' && rt === 'Basic' ? (bandText(R, st, 'Owner', 'Enhanced', i.price) ? ` Enhanced rate table used.` : pct ? ` Enhanced / homeowner's policy = ${pct}% of the basic premium (Premium_Rules enhanced_owner_pct).` : '') : '';
  const pay = i.state === 'FL' ? ` Paid by: ${C.FL_TITLE[C.flTitleOpt(R, i)] || 'local custom'} (Florida AS IS contract 9(c) / county custom).` : ` Paid by: ${i.ownPay || C.ownerPayDefault(R, i.state, i.county)} (${i.ownPay ? 'chosen' : `local custom in ${i.county || i.state}, Jurisdictions sheet`}).`;
  const enhPh = i.enhancedPlaceholder ? ` ${ENHANCED_PLACEHOLDER}` : '';
  const isEnh = i.pol === 'enhanced' && enhancedSupport(R, st).supported && rt === 'Basic';
  const isPct = isEnh && !bandText(R, st, 'Owner', 'Enhanced', i.price) && !!pct && P.owner != null;   // e.g. MD / VA / DC: enhanced = pct% of the basic premium
  const basicAmt = isPct ? Math.max(C.bandPremium(R, UNDERWRITER, st, 'Owner', 'Basic', i.price) || 0, C.rule(R, UNDERWRITER, st, 'min_premium_owner') || 0) : null;
  const tridTxt = trid && P.lenderFull != null && P.lenderActual != null ? ` TRID owner's policy = owner's premium ${usd(P.owner)} + simultaneous lender's ${usd(P.lenderActual)} − full lender's ${usd(P.lenderFull)}.` : '';
  return { rateSource: `${SRC} · Premium_Tiers (${UNDERWRITER}, ${st}, Owner, ${rt}) + Premium_Rules + Jurisdictions`, calculation: `Owner's policy (${isEnh ? 'enhanced' : 'basic'}): ${base} = ${usd(isPct ? basicAmt : P.owner)}.${enh}${isPct ? ` ${usd(basicAmt)} × ${pct}% = ${usd(P.owner)}.` : ''}${enhPh}${tridTxt}${pay}` };
}
function taxExplain(R, i, t) {
  const rows = C.pick(R.Transfer_Taxes, i.state, i.county, i.type, (r) => r['Tax Name'] + '|' + r.Transaction).filter((r) => r['Tax Name'] === t.name);
  const bits = []; let where = '';
  for (const r of rows) { const x = C.taxAmount(r, i); if (!x || (!(x.amt > 0) && rows.length > 1)) continue; where = C.isAll(r['County/City']) ? `${i.state} statewide` : `${i.state} ${i.county}`;
    const base = C.basisOf(r.Basis, i); const unit = String(r['Rate Unit'] || '').toLowerCase().replace(/[\s$,]/g, ''); const fthb = !!i.fthb && i.occ !== false && i.type !== 'refi' && (C.num(r['FTHB Max Price ($)']) == null || i.price <= C.num(r['FTHB Max Price ($)']));
    let rate = fthb && C.num(r['FTHB Rate']) != null ? C.num(r['FTHB Rate']) : C.num(r.Rate) || 0; if (i.state === 'VA' && /^local\b.*recordation/i.test(String(r['Tax Name']))) rate = Math.round(rate * 300) / 300;
    const ex = (i.occ ? C.num(r['Owner-Occ Exempt ($)']) || 0 : 0) + (fthb ? C.num(r['FTHB Exempt ($)']) || 0 : 0);
    const from = C.num(r['Bracket From ($)']) || 0, to = C.num(r['Bracket To ($)']); const marg = String(r['Bracket Method']).toLowerCase().startsWith('marg');
    const taxable = marg ? Math.max(0, Math.min(to == null ? Infinity : to, base) - Math.max(from, ex)) : Math.max(0, base - ex);
    const basisName = String(r.Basis || '').toLowerCase().startsWith('new') ? 'new money (loan − payoff)' : String(r.Basis || '').toLowerCase().startsWith('loan') ? 'loan amount' : C.assessedOn(i) ? 'assessed value' : 'sale price';
    const rt = +rate.toFixed(6);
    const how = unit === 'percent' ? `${rt}% × ${usd0(taxable)}` : unit === 'per100' ? `$${rt} per $100 × ${Math.ceil(taxable / 100 - 1e-9).toLocaleString('en-US')}` : unit === 'per500' ? `$${rt} per $500 × ${Math.ceil(taxable / 500 - 1e-9).toLocaleString('en-US')}` : unit === 'per1000' ? `$${rt} per $1,000 × ${Math.ceil(taxable / 1000 - 1e-9).toLocaleString('en-US')}` : `${rt} ${unit}`;
    bits.push(`${how} = ${usd(x.amt)} (${i.state === 'VA' && /^local\b.*recordation/i.test(String(r['Tax Name'])) ? 'one-third of the state rate, Va. Code 58.1-3800; ' : ''}${basisName} ${usd0(base)}${ex ? `, less ${usd0(ex)} exemption` : ''}${marg ? `, bracket ${usd0(from)}-${to == null ? 'up' : usd0(to)}` : ''}${fthb && C.num(r['FTHB Rate']) != null ? ', first-time buyer rate' : ''})`); }
  const payer = t.fixed ? 'seller by Maryland law (first-time buyer: buyer half exempt)' : t.payer === 'split' ? 'split 50/50' : t.payer;
  return { rateSource: `${SRC} · Transfer_Taxes (${where || i.state}, "${t.name}")`, calculation: `${i.state} ${t.name}: ${bits.join(' + ')}${bits.length > 1 ? ` = ${usd(t.amt)}` : ''}. Paid by ${payer} (sheet "Paid By"${t.def && t.def !== t.payer ? `; default ${t.def}` : ''}).` };
}
function recordingExplain(R, i, doc, n, pg) {
  const rows = C.pick(R.Recording_Fees, i.state, i.county, i.type, (r) => r.Document + '|' + r['Fee Name'], null).filter((r) => C.eq(r.Document, doc) && (C.num(r['Page Tier From']) == null || pg >= C.num(r['Page Tier From'])) && (C.num(r['Page Tier To']) == null || pg <= C.num(r['Page Tier To'])) && !C.LIEN_CERT.test(r['Fee Name']));
  const parts = rows.map((r) => { const inc = C.num(r['Pages Included']); const add = inc != null ? Math.max(0, pg - inc) * (C.num(r["Per Add'l Page ($)"]) || 0) : 0; return `${r['Fee Name']} ${usd(C.num(r['Flat Fee ($)']) || 0)}${add ? ` + ${Math.max(0, pg - inc)} add'l page(s) × ${usd(C.num(r["Per Add'l Page ($)"]))}` : ''}`; });
  const big = i.state === 'MD' && i.occ === false && C.MD_BIG_INSTR[doc] ? ` Not a principal residence: Maryland records the ${doc.toLowerCase()} for ${usd0(C.MD_BIG_INSTR[doc])} (RP 3-601).` : '';
  return { rateSource: `${SRC} · Recording_Fees (${i.state}${rows.some((r) => !C.isAll(r['County/City'])) ? ' ' + i.county : ', all counties'}, ${doc})`, calculation: `${doc}: ${n} document${n === 1 ? '' : 's'}, ${pg} page${pg === 1 ? '' : 's'} (calculator default): ${parts.join(' + ')}${n > 1 ? ` × ${n}` : ''}.${big}` };
}

// ---------------- payee / sections ----------------
const recorder = (i) => (i.state === 'DC' ? 'DC Recorder of Deeds' : `Clerk of the Circuit Court, ${/\bcity$/i.test(i.county) ? i.county : (i.county || i.state) + (i.county ? ' County' : '')}`);
const feePayee = (name) => { const m = /\bto (.+)$/i.exec(name); return m ? m[1].trim() : /^survey/i.test(name) ? 'Surveyor (estimate)' : 'CLA Title & Escrow'; };
const sideOf = (p) => (String(p || '').toLowerCase() === 'seller' ? 'seller' : 'buyer');
// EXAMPLE preset keys (accounting.js FEE_PRESETS) that a calculated line replaces
const presetFor = (key, i) => {
  if (key === 'lendersPolicy' || key === 'ownersPolicy') return [key]; if (key.startsWith('end:')) return ['endorsements'];
  if (key === 'rec:Deed') return ['recordingDeed']; if (key === 'rec:Deed of Trust') return ['recordingMortgage']; if (key === 'lien') return ['md-lienCert'];
  if (key.startsWith('cla:')) { const n = key.slice(4).toLowerCase(); return /settlement fee/.test(n) ? ['settlement'] : /title search/.test(n) ? ['titleSearch'] : /^cpl/.test(n) ? ['cpl'] : /shipping/.test(n) ? ['courier'] : []; }
  if (key.startsWith('tax:')) { const n = key.slice(4).toLowerCase(); const S = i.state;
    if (S === 'MD') return /state transfer/.test(n) ? ['md-stateTransfer'] : /county transfer/.test(n) ? ['md-countyTransfer'] : /recordation/.test(n) ? ['md-recordation'] : [];
    if (S === 'VA') return /grantor/.test(n) ? ['va-grantor'] : /^state .*recordation/.test(n) ? ['va-stateRecordation'] : /^local .*recordation/.test(n) ? ['va-localRecordation'] : [];
    if (S === 'DC') return /recordation/.test(n) ? ['dc-recordation'] : /transfer/.test(n) ? ['dc-transfer'] : [];
    if (S === 'FL') return /stamps on deed/.test(n) ? ['fl-docStampsDeed'] : /stamps on note/.test(n) ? ['fl-docStampsNote'] : /intangible/.test(n) ? ['fl-intangible'] : []; }
  return [];
};
// the EXAMPLE presets the calculator does NOT cover (they stay EXAMPLE): lender charges, insurance, escrows, commission, payoffs
export const NOT_COVERED_PRESETS = ['originationFee', 'appraisal', 'homeownersIns', 'escrowTaxes', 'commission', 'payoff'];

// ---------------- the proposal ----------------
export function proposeFees(deal, options = {}, R = vendoredTables(), source = { id: vendoredRateSource.id, label: vendoredRateSource.label, version: vendoredRateSource.version }) {
  const i = calcInputs(deal, options, R); const noOwner = i.type !== 'refi' && i.owner === false; const res = C.calc(noOwner ? tablesWithoutOwner(R) : R, i); const P = res.premiums; const refi = i.type === 'refi';
  const used = new Set(); const lines = []; const warnings = res.warnings.filter((w) => !(noOwner && /owner's premium rates/.test(w)));
  if (noOwner) warnings.push("Owner's policy removed (Caroline, Nov 4 option): no owner's premium; the lender's policy is at the full rate.");
  if (i.enhancedPlaceholder) warnings.push(`Enhanced owner's policy: ${ENHANCED_PLACEHOLDER}`);
  const docs = Object.entries(i.docs).filter(([d, [n]]) => n > 0 && !(d === 'Deed of Trust' && (i.type === 'cash' || !(i.loan > 0))));
  for (const l of res.lines) {
    const letter = String(l.sec).charAt(0); const b = r2(l.b), s = refi ? 0 : r2(l.s); let key, meta;
    const title = /^Title – /.test(l.item); const item = l.item.replace(/^Title – /, '');
    if (/^Lender's Title Policy$/.test(item)) { key = 'lendersPolicy'; meta = premiumExplain(R, i, P, 'lender'); meta.payee = `${UNDERWRITER} (via CLA Title & Escrow)`; }
    else if (/^Owner's Title Policy/.test(item)) { key = 'ownersPolicy'; meta = premiumExplain(R, i, P, 'owner'); meta.payee = `${UNDERWRITER} (via CLA Title & Escrow)`; }
    else if (/^Endorsement /.test(item)) { const e = C.uwRows(R.Endorsements, UNDERWRITER, i.state).find((x) => item.startsWith(`Endorsement ${x.Code} `)); key = 'end:' + (e ? e.Code : item);
      const pct = e && String(e.Pricing).includes('%'); meta = { payee: `${UNDERWRITER} (via CLA Title & Escrow)`, rateSource: `${SRC} · Endorsements (${UNDERWRITER}, ${i.state}, ${e ? e.Code : '?'})`,
        calculation: e ? `${e.Code} ${e.Name}: ${pct ? `${e.Amount}% of the ${/combined/i.test(e.Pricing) ? `combined owner's + loan premium (${usd(P.owner)} + ${usd(P.lenderActual)})` : "lender's premium"} = ${usd(b + s)}` : `flat ${usd(C.num(e.Amount) || 0)}`}.` : item }; }
    else if (/^E-recording fee \(Simplifile\)/.test(l.item)) { const side = s > 0 && !b ? 'seller' : 'buyer'; key = `cla:E-recording Fee to Simplifile:${side}`; const f = i.fees.find((x) => C.perDoc(x) && (refi || sideOf(x.payer) === side));
      const cnt = f ? C.perDocCount(docs, f.payer, refi) : 0; meta = { payee: 'Simplifile', rateSource: `${SRC} · CLA_Fees (${i.state}, "E-recording Fee to Simplifile")`, calculation: `${usd(f ? f.amt : 0)} per recorded document × ${cnt} (${docs.filter(([d]) => refi || (side === 'seller' ? d === 'Release' : d !== 'Release')).map(([d, [n]]) => `${d}${n > 1 ? ' ×' + n : ''}`).join(', ') || 'none'}) = ${usd(b + s)}.` }; }
    else if (/^Recording fees – /.test(l.item)) { const doc = /^Recording fees – (Deed of Trust|Deed|Release|Power of Attorney)/.exec(l.item)[1]; const dd = docs.find(([d]) => d === doc) || [doc, [1, 1]]; key = 'rec:' + doc; meta = { payee: recorder(i), ...recordingExplain(R, i, doc, dd[1][0], dd[1][1]) }; }
    else if (/^Lien certificate – /.test(l.item)) { key = 'lien'; const row = C.pick(R.Recording_Fees, i.state, i.county, i.type, (r) => r.Document + '|' + r['Fee Name'], null).find((r) => C.LIEN_CERT.test(r['Fee Name']));
      meta = { payee: l.item.replace(/^Lien certificate – /, '') + ' Treasurer', rateSource: `${SRC} · Recording_Fees (${i.state} ${i.county}, lien certificate)`, calculation: `${row ? row['Fee Name'] : 'Lien certificate'}: flat ${usd(b + s)} (${row ? row['Paid By'] : ''} pays; Melissa Gamble 11/02: its own line).` }; }
    else { const t = (res.taxes || []).find((x) => x.label === l.item);
      if (t) { key = 'tax:' + t.name; meta = { payee: recorder(i), ...taxExplain(R, i, t) }; }
      else { // a CLA fee row: match by name (the calculator adds "Title – " except for a survey) and by who pays it
        const side = s > 0 && !b ? 'seller' : 'buyer';
        const f = i.fees.find((x) => !used.has(x) && !C.perDoc(x) && l.item.startsWith((C.NOT_TITLE.test(x.name) ? '' : 'Title – ') + x.name) && (refi || sideOf(x.payer) === side || (b > 0 && s > 0 && sideOf(x.payer) === 'buyer') || (i.state === 'FL' && C.FL_SEARCH.test(x.name) && sideOf(x.payer) === 'buyer')));
        if (f) { used.add(f); key = `cla:${f.name}:${refi ? 'buyer' : sideOf(f.payer)}`;
          meta = { payee: feePayee(f.name), rateSource: `${SRC} · CLA_Fees (${i.state}, ${f.tx}, "${f.name}", ${f.payer})`, calculation: `${f.name}: flat ${usd(f.amt)} (CLA fee sheet, ${f.payer} pays, LE / CD section ${String(f.sec).toUpperCase()})${b > 0 && s > 0 ? `; ${l.item.replace(/^.*\(([^)]*)\)$/, '$1')}: borrower ${usd(b)}, seller ${usd(s)}` : ''}.` }; }
        else { key = 'line:' + l.item; meta = { payee: '', rateSource: SRC, calculation: l.item }; warnings.push(`Calculator line not mapped: ${l.item}`); } } }
    const cd = ['B', 'C', 'E', 'H'].includes(letter) ? letter : 'H';
    const alta = cd === 'E' ? 'government' : C.NOT_TITLE.test(item) && !title ? 'misc' : 'title';
    const split = { buyer: b, seller: s, lender: 0, other: 0 }; const amount = r2(b + s);
    if (!(amount > 0)) continue;
    lines.push({ key, description: item, altaSection: alta, cdSection: cd, cdLine: '', payee: (meta.payee || '').slice(0, 120), amount, paidBy: b > 0 && s > 0 ? 'split' : s > 0 ? 'seller' : 'buyer', split,
      titlePrefix: title && alta === 'title', timing: 'at', poc: false, rateSource: meta.rateSource, calculation: meta.calculation, replacesPresets: presetFor(key, i), calcItem: l.item });
  }
  // CD section E line numbers: recording fees first (TRID E.01 is "Recording Fees"), then the lien certificate, then transfer taxes (E.02+)
  let n = 0; for (const x of lines.filter((y) => y.cdSection === 'E')) x.cdLine = String(++n).padStart(2, '0');
  const keys = new Set(); for (const x of lines) { if (keys.has(x.key)) fail(`Two calculated lines share the key ${x.key}.`); keys.add(x.key); }
  return { inputs: i, lines, warnings, totals: { buyer: r2(res.buyer), seller: r2(res.seller), total: r2(res.total) }, calc: res, source: { ...source, commit: CALC_SOURCE.commit },
    summary: `${i.type === 'refi' ? 'Refinance' : i.type === 'cash' ? 'Cash purchase' : 'Purchase (financed)'} · ${i.county || '(no county)'}, ${i.state} · ${i.type === 'refi' ? `loan ${usd0(i.loan)}` : `price ${usd0(i.price)}${i.loan ? ` · loan ${usd0(i.loan)}` : ''}`}` };
}

// ---------------- preview diff against the ledger ----------------
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
export const fieldDiff = (cur, next) => CALC_FIELDS.filter((k) => !same(calcFields(cur)[k], calcFields(next)[k])).map((k) => ({ field: k, old: calcFields(cur)[k], new: calcFields(next)[k] }));
export function diffProposal(proposal, fees) {
  const all = fees || []; const active = all.filter((f) => !f.retired); const out = []; const keys = new Set(proposal.lines.map((l) => l.key));
  // Caroline, Nov 4: the owner's policy was REMOVED on the last run and is now put back: its retired lines (owner's policy, owner's endorsements)
  // were retired by that run, not by a person, so they come back as new lines (the retired ones stay in the history).
  const newest = all.filter(isCalculated).sort((x, y) => String(y.calc.at || '').localeCompare(String(x.calc.at || '')))[0];
  const ownerBack = !!newest && (newest.calc.inputs || {}).owner === false && proposal.inputs.owner !== false && proposal.inputs.type !== 'refi';
  for (const l of proposal.lines) {
    const cur = active.find((f) => isCalculated(f) && f.calc.key === l.key);
    if (!cur) { const gone = all.find((f) => f.retired && isCalculated(f) && f.calc.key === l.key) && !(ownerBack && (l.key === 'ownersPolicy' || l.key.startsWith('end:')));
      out.push(gone ? { key: l.key, status: 'retired', proposed: l, current: all.find((f) => f.retired && isCalculated(f) && f.calc.key === l.key), changes: [] } : { key: l.key, status: 'new', proposed: l, current: null, changes: [] }); continue; }
    if (isOverridden(cur)) { out.push({ key: l.key, status: 'overridden', proposed: l, current: cur, changes: fieldDiff(cur, l) }); continue; }
    const ch = fieldDiff(cur, l); const textOnly = !ch.length && (cur.calc.calculation !== l.calculation || cur.calc.rateSource !== l.rateSource);
    out.push({ key: l.key, status: ch.length || textOnly ? 'changed' : 'unchanged', proposed: l, current: cur, changes: ch });
  }
  for (const f of active.filter((x) => isCalculated(x) && !keys.has(x.calc.key))) out.push({ key: f.calc.key, status: isOverridden(f) ? 'stale-overridden' : 'retire', proposed: null, current: f, changes: [] });
  // EXAMPLE preset fees still on the ledger that a calculated line replaces (offered for retirement, never deleted)
  const replaced = new Set(proposal.lines.flatMap((l) => l.replacesPresets));
  const examples = active.filter((f) => !isCalculated(f) && f.presetKey && !String(f.presetKey).startsWith('cla:') && replaced.has(f.presetKey))
    .map((f) => ({ id: f.id, description: f.description, amount: f.amount, presetKey: f.presetKey, by: proposal.lines.filter((l) => l.replacesPresets.includes(f.presetKey)).map((l) => l.description) }));
  const count = (s) => out.filter((x) => x.status === s).length;
  const counts = { new: count('new'), changed: count('changed'), unchanged: count('unchanged'), overridden: count('overridden') + count('stale-overridden'), retire: count('retire'), retired: count('retired'), examples: examples.length };
  const token = hash(JSON.stringify([out.map((x) => [x.key, x.status, x.current ? x.current.id : null, x.current ? x.current.updatedAt || '' : '', x.proposed ? x.proposed.amount : null, x.proposed ? x.proposed.split : null]), examples.map((x) => x.id)]));
  return { rows: out, examples, counts, token, applicable: counts.new + counts.changed + counts.retire };
}
const hash = (s) => { let h = 5381; for (let k = 0; k < s.length; k++) h = ((h * 33) ^ s.charCodeAt(k)) >>> 0; return h.toString(36); };
// the stored calc block for a line (what the ledger keeps next to a calculated fee)
export const calcBlock = (line, proposal, at) => ({ key: line.key, fields: calcFields(line), rateSource: line.rateSource, calculation: line.calculation, version: `${CALC_SOURCE.commit}/${CALC_SOURCE.snapshot}`, sourceId: proposal.source.id,
  inputs: { type: proposal.inputs.type, state: proposal.inputs.state, county: proposal.inputs.county, price: proposal.inputs.price, loan: proposal.inputs.loan, payoff: proposal.inputs.payoff, assessed: proposal.inputs.assessed,
    occ: proposal.inputs.occ, fthb: proposal.inputs.fthb, pol: proposal.inputs.pol, rate: proposal.inputs.rate, pres: proposal.inputs.pres, ownPay: proposal.inputs.ownPay, ends: proposal.inputs.ends,
    owner: proposal.inputs.type === 'refi' ? true : proposal.inputs.owner !== false }, at });
// fee input (for accounting.js cleanFee) from a calculated line
export const feeInput = (line) => ({ kind: 'charge', description: line.description, altaSection: line.altaSection, cdSection: line.cdSection, cdLine: line.cdLine, payee: line.payee, amount: line.amount,
  paidBy: line.paidBy === 'split' ? 'split' : line.paidBy, split: line.paidBy === 'split' ? line.split : null, titlePrefix: line.titlePrefix, timing: 'at', poc: false, note: `${CALC_TAG}: ${line.calculation}`.slice(0, 1000), presetKey: 'cla:' + line.key });
// the options a re-run should start from: the inputs stored on the newest calculated fee (the order's price / loan always come from the order)
export function lastOptions(fees, deal) {
  const f = (fees || []).filter(isCalculated).sort((a, b) => String(b.calc.at || '').localeCompare(String(a.calc.at || '')))[0]; if (!f) return { ...DEFAULT_OPTIONS, ...orderOptions(deal) };
  const x = f.calc.inputs || {}; return { ...cleanOptions({ occ: x.occ, fthb: x.fthb, pol: x.pol, rate: x.rate, pres: x.pres, ownPay: x.ownPay, payoff: x.payoff, assessed: x.assessed, ends: x.ends, owner: x.owner !== false }), ...orderOptions(deal) };
}
// John, Nov 3 call: the order's own First-time buyer / Primary residence answers (Place Order / Edit order) win over the last run's options
export const orderAnswers = (deal) => ({ occ: deal && deal.primaryResidence ? deal.primaryResidence : '', fthb: deal && deal.firstTimeBuyer ? deal.firstTimeBuyer : '' });
export function orderOptions(deal) { const a = orderAnswers(deal); const o = {}; if (a.occ) o.occ = a.occ === 'yes'; if (a.fthb) o.fthb = a.fthb === 'yes'; return o; }
export { C as calculatorCore };

// ---------------- shapes the adapters hand to the page (plain JSON) ----------------
export function calcSetup(deal, fees, R = vendoredTables()) {
  const state = String((deal && deal.state) || '').toUpperCase(); const type = calcTypeOf(deal || {}); const options = lastOptions(fees, deal);
  const base = { fromOrder: orderAnswers(deal), source: { ...vendoredRateSource, loadTables: undefined, tablesSync: undefined, commit: CALC_SOURCE.commit, snapshot: CALC_SOURCE.snapshot }, state, type, options };
  if (!CALC_STATES.includes(state)) return { ...base, covered: false, reason: `CLA rates cover MD, VA, DC and FL only (this order is in ${state || 'no state'}).` };
  const county = countyOf(R, deal); const known = state === 'DC' || C.allCounties(R, state).some((x) => C.eq(x, county));
  const enhanced = enhancedSupport(R, state); if (!enhanced.supported && base.options.pol === 'enhanced') base.options = { ...base.options, pol: 'standard' };   // no enhanced rate: the form starts on basic
  let reason = ''; try { calcInputs(deal, options, R); } catch (e) { reason = e.message; }
  return { ...base, covered: !reason, reason, county, countyKnown: known, usesStateDefaults: !!county && C.usesDefaults(R, state, county),
    enhanced, ownerPolicy: { removable: type !== 'refi', included: base.options.owner !== false },
    endorsements: endorsementChoices(R, state, type), asks: { payoff: type === 'refi', assessed: state === 'VA' && type !== 'refi', occ: !NO_OO.test(state), fthb: !NO_OO.test(state) && type !== 'refi', ownPay: type !== 'refi', flTitle: state === 'FL' && type !== 'refi' },
    flTitleDefault: state === 'FL' && type !== 'refi' ? C.FL_TITLE[C.flTitleOpt(R, { state, county, ownPay: '' })] : '', ownerPayDefault: type !== 'refi' ? C.ownerPayDefault(R, state, county) : '' };
}
const lineView = (l) => (l ? { description: l.description, altaSection: l.altaSection, cdSection: l.cdSection, cdLine: l.cdLine, payee: l.payee, amount: l.amount, paidBy: l.paidBy, split: l.split, titlePrefix: l.titlePrefix, rateSource: l.rateSource, calculation: l.calculation } : null);
export function previewView(P, D, options) {
  return { summary: P.summary, source: P.source, options, warnings: P.warnings, totals: P.totals, counts: D.counts, token: D.token, applicable: D.applicable,
    inputs: { type: P.inputs.type, state: P.inputs.state, county: P.inputs.county, price: P.inputs.price, loan: P.inputs.loan, payoff: P.inputs.payoff },
    rows: D.rows.map((r) => ({ key: r.key, status: r.status, proposed: lineView(r.proposed), changes: r.changes,
      current: r.current ? { id: r.current.id, description: r.current.description, amount: r.current.amount, split: r.current.split, paidBy: r.current.paidBy, overridden: isOverridden(r.current), retired: !!r.current.retired,
        calcAmount: r.current.calc && r.current.calc.fields ? r.current.calc.fields.amount : null } : null })),
    examples: D.examples };
}
// preset dropdown: the CLA-rate lines for this order + the EXAMPLE presets the calculator does not cover (or every EXAMPLE preset when the
// order cannot be calculated yet, e.g. no price). Returns { calculated: [...], keepExample: Set of EXAMPLE keys still offered, reason }
export function presetChoices(deal, options, R = vendoredTables()) {
  let P = null, reason = ''; try { P = proposeFees(deal, options, R); } catch (e) { reason = e.message; }
  if (!P) return { calculated: [], replaced: [], reason, proposal: null };
  return { calculated: P.lines.map((l) => ({ key: 'cla:' + l.key, state: 'CLA', calculated: true, label: `${l.description} — ${l.paidBy === 'split' ? 'split' : l.paidBy === 'seller' ? 'seller' : P.inputs.type === 'refi' ? 'borrower' : 'buyer'}`, exampleAmount: l.amount,
    fee: feeInput(l), rateSource: l.rateSource, calculation: l.calculation })), replaced: [...new Set(P.lines.flatMap((l) => l.replacesPresets))], reason: '', proposal: P };
}
