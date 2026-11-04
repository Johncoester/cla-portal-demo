// ACCOUNTING > CLOSING DISCLOSURE pages 1-5 and CD DETAILS & ESCROW (Caroline Kim, Nov 4 2026, item 3: "build the rest of the CD: lender
// credits, prepaids (Section F), initial escrow payment at closing (Section G, with the escrow account calculation), and whatever else is
// needed so the CD pages are complete (loan terms / projected payments can be manual entry fields). Keep everything marked TEST").
// Fees, lender credits, prorations and summaries come from the fee ledger; loan terms, projected payments, the Loan Estimate column, loan
// disclosures and loan calculations are manual entries (CD details, every save logged). Processor / Admin / Super admin edit; Sales and TCs read.
import { html, raw, $, $$, guard, toast, toText, fmtDate } from '../ui.js?v=202611041516';
import { TEST_MARK } from '../data/accounting.js?v=202611041516';
import { CD_DETAIL_GROUPS } from '../data/cd-pages.js?v=202611041516';
const m2 = (n) => (n == null || Number(n) === 0 ? '' : (Number(n) < 0 ? '-' : '') + '$' + Math.abs(Number(n)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const m2z = (n) => (Number(n) < 0 ? '-' : '') + '$' + Math.abs(Number(n || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const mv = (n) => (n == null ? html`<span class="muted">—</span>` : m2z(n));
const names = (deal, role) => deal.participants.filter((p) => p.role === role && p.contact).map((p) => (p.entity && p.entity.name) || `${p.contact.firstName} ${p.contact.lastName}`).join(', ');
const yn = (v) => (v === 'yes' ? html`<strong class="acct-yn yes">YES</strong>` : v === 'no' ? html`<strong class="acct-yn no">NO</strong>` : html`<span class="muted">—</span>`);
const pageHead = (n, title) => html`<div class="acct-cd-pagehead"><span class="acct-mark" data-print-mark>${TEST_MARK}</span><h3 class="acct-h">${title}</h3><span class="muted small">Page ${n} of 5 &middot; Closing Disclosure (TEST)</span></div>`;

// ---------------- the full CD (pages 1-5) ----------------
export async function cdPagesView(api, deal, acc, docHead, printBtn, mountPrint) {
  const X = await api.getAccountingCd(deal.id); const cd = X.cd; const refi = cd.refi; const P = X.pages; const p1 = P.page1, p4 = P.page4, p5 = P.page5;
  const n = (v) => html`<td class="num">${m2(v)}</td>`;
  // page 1
  const info = html`<div class="acct-cd-info" data-cd-info><div><h4>Closing Information</h4><dl><dt>Date Issued</dt><dd>${fmtDate(p1.issued) || '—'}</dd><dt>Closing Date</dt><dd>${fmtDate(deal.closingDate) || 'Not set'}</dd><dt>Disbursement Date</dt><dd data-cd-disbursement>${fmtDate((X.details || {})['dates.disbursement'] || deal.closingDate) || '—'}</dd>
      <dt>Settlement Agent</dt><dd>CLA Title &amp; Escrow (test portal)</dd><dt>File #</dt><dd>${deal.fileNumber}</dd><dt>Property</dt><dd>${deal.street}, ${deal.city}, ${deal.state} ${deal.zip}</dd>
      <dt>${refi ? 'Appraised Prop. Value' : 'Sale Price'}</dt><dd>${refi ? mv(p1.appraised) : m2z(deal.purchasePrice)}</dd></dl></div>
    <div><h4>Transaction Information</h4><dl><dt>Borrower</dt><dd>${names(deal, 'Client-Buyer') || '—'}</dd>${refi ? '' : html`<dt>Seller</dt><dd>${names(deal, 'Client-Seller') || '—'}</dd>`}<dt>Lender</dt><dd>${deal.lenderName || names(deal, 'Lender') || '—'}</dd></dl></div>
    <div><h4>Loan Information</h4><dl><dt>Loan Term</dt><dd>${p1.loanTerm || '—'}</dd><dt>Purpose</dt><dd>${p1.purpose}</dd><dt>Product</dt><dd>${p1.product || '—'}</dd><dt>Loan Type</dt><dd>${p1.loanType || '—'}</dd><dt>Loan ID #</dt><dd>${p1.loanId || '—'}</dd><dt>MIC #</dt><dd>${p1.mic || '—'}</dd></dl></div></div>`;
  const terms = html`<table class="tbl acct-cd" data-cd-loan-terms><thead><tr><th>Loan Terms</th><th></th><th>Can this amount increase after closing?</th></tr></thead><tbody>
    ${p1.terms.map((t) => html`<tr><td>${t.label}</td><td><strong>${t.value || html`<span class="muted">—</span>`}</strong></td><td>${yn(t.yn)}</td></tr>`)}</tbody></table>`;
  const pp = p1.projected; const proj = html`<table class="tbl acct-cd" data-cd-projected><thead><tr><th>Projected Payments</th>${pp.length ? pp.map((c) => html`<th class="num">Years ${c.years || '—'}</th>`) : html`<th class="muted">enter on CD details</th>`}</tr></thead><tbody>
    <tr><td>Principal &amp; Interest</td>${pp.map((c) => n(c.pi))}</tr><tr><td>Mortgage Insurance</td>${pp.map((c) => html`<td class="num">${c.mi ? m2(c.mi) : '—'}</td>`)}</tr><tr><td>Estimated Escrow <span class="muted small">(can increase over time)</span></td>${pp.map((c) => html`<td class="num">${c.escrow ? m2(c.escrow) : '—'}</td>`)}</tr>
    <tr class="acct-subtotal"><td><strong>Estimated Total Monthly Payment</strong></td>${pp.map((c) => html`<td class="num"><strong>${m2z(c.total)}</strong></td>`)}</tr>
    <tr><td>Estimated Taxes, Insurance &amp; Assessments <span class="muted small">(monthly)</span></td><td colspan="${Math.max(1, pp.length)}">${mv(p1.taxesIns)} &middot; In escrow: property taxes ${yn(p1.inEscrow.taxes)}, homeowner's insurance ${yn(p1.inEscrow.ins)}, other${p1.inEscrow.otherText ? ` (${p1.inEscrow.otherText})` : ''} ${yn(p1.inEscrow.other)}</td></tr></tbody></table>
    ${pp.some((c) => c.auto) ? html`<p class="small muted">Projected payments: one column built from the monthly P&amp;I, mortgage insurance and the escrow calculation (enter columns on CD details to override).</p>` : ''}`;
  const C = p1.costsAtClosing;
  const costs = html`<div class="acct-cd-costs" data-cd-costs><div><span class="muted small">Closing Costs</span><strong data-cd-costs-closing>${m2z(C.closingCosts)}</strong><span class="small">Includes ${m2z(C.loanCosts)} in Loan Costs + ${m2z(C.otherCosts)} in Other Costs &minus; ${m2z(C.lenderCredits)} in Lender Credits.</span></div>
    <div><span class="muted small">Cash to Close</span><strong data-cd-costs-cash>${m2z(C.cashToClose)}</strong><span class="small">Includes Closing Costs. See Calculating Cash to Close on page 3.</span></div></div>`;
  const page1 = html`<section class="acct-cd-page" data-cd-page="1">${pageHead(1, 'Closing Disclosure')}${info}${terms}${proj}<h4 class="acct-side">Costs at Closing</h4>${costs}</section>`;
  // page 2 (the existing fee pages + Lender Credits in J)
  const secRows = (S) => html`<tr class="acct-sec" data-cd-sec="${S.key}"><th>${S.key}. ${S.label}</th>${n(S.borrowerAt + S.borrowerBefore)}<td></td>${refi ? '' : html`<td></td><td></td>`}<td></td></tr>
    ${S.rows.length ? S.rows.map((r) => html`<tr data-cd-row="${r.id}" ${r.reduces ? raw('data-cd-reduces') : ''}><td><span class="cd-line">${r.line}</span> ${r.description}${r.payee ? html` <span class="muted small">to ${r.payee}</span>` : ''}</td>${n(r.borrowerAt)}${n(r.borrowerBefore)}${refi ? '' : html`${n(r.sellerAt)}${n(r.sellerBefore)}`}<td class="num">${r.others ? html`${r.othersWho ? html`<span class="muted small">(${r.othersWho})</span> ` : ''}${m2(r.others)}` : ''}</td></tr>`)
      : html`<tr class="acct-empty"><td colspan="${refi ? 4 : 6}" class="muted small">None</td></tr>`}`;
  const totRow = (label, Tt, key) => html`<tr class="acct-subtotal" data-cd-total="${key}"><td><strong>${label}</strong></td>${n(Tt.borrowerAt)}${n(Tt.borrowerBefore)}${refi ? '' : html`${n(Tt.sellerAt)}${n(Tt.sellerBefore)}`}${n(Tt.others)}</tr>`;
  const head = html`<thead><tr><th rowspan="2"></th><th colspan="2" class="center">Borrower-Paid</th>${refi ? '' : html`<th colspan="2" class="center">Seller-Paid</th>`}<th rowspan="2" class="center">Paid by Others</th></tr>
    <tr><th class="num">At Closing</th><th class="num">Before Closing</th>${refi ? '' : html`<th class="num">At Closing</th><th class="num">Before Closing</th>`}</tr></thead>`;
  const loan = cd.sections.filter((s) => ['A', 'B', 'C'].includes(s.key)); const other = cd.sections.filter((s) => ['E', 'F', 'G', 'H'].includes(s.key));
  const J = cd.J; const lc = html`<tr data-cd-lender-credits><td><span class="cd-line">&nbsp;</span> Lender Credits${J.lenderCreditRows.length ? html` <span class="muted small">(${J.lenderCreditRows.map((x) => x.description).join(', ')})</span>` : ''}</td><td class="num" data-cd-lc>${J.lenderCredits ? '-' + m2(J.lenderCredits).replace('-', '') : ''}</td><td></td>${refi ? '' : html`<td></td><td></td>`}<td></td></tr>`;
  const page2 = html`<section class="acct-cd-page" data-cd-page="2">${pageHead(2, 'Closing Cost Details')}
    <h4 class="acct-side">Loan Costs</h4><table class="tbl acct-cd" data-cd-loan>${head}<tbody>${loan.map(secRows)}${totRow('D. TOTAL LOAN COSTS (Borrower-Paid)', cd.D, 'D')}</tbody></table>
    <h4 class="acct-side">Other Costs</h4><table class="tbl acct-cd" data-cd-other>${head}<tbody>${other.map(secRows)}${totRow('I. TOTAL OTHER COSTS (Borrower-Paid)', cd.I, 'I')}
      <tr class="acct-sec"><th>J. TOTAL CLOSING COSTS (Borrower-Paid)</th>${n(J.borrower)}<td></td>${refi ? '' : html`<td></td><td></td>`}<td></td></tr>
      <tr><td>Closing Costs Subtotals (D + I)</td>${n(cd.D.borrowerAt + cd.I.borrowerAt)}${n(J.borrowerBefore)}${refi ? '' : html`${n(J.sellerAt)}${n(J.sellerBefore)}`}${n(J.others)}</tr>${lc}
      ${totRow('J. TOTAL CLOSING COSTS', J, 'J')}<tr class="acct-total"><td>Total Closing Costs (Borrower-Paid)</td><td class="num" colspan="2" data-j-borrower>${m2z(J.borrower)}</td>${refi ? '' : html`<td class="num" colspan="2">${m2z(J.sellerAt + J.sellerBefore)}</td>`}<td class="num">${m2z(J.others)}</td></tr></tbody></table></section>`;
  // page 3
  const cc = P.page3.cctc; const cctc = html`<table class="tbl acct-cd" data-cd-cctc><thead><tr><th>Calculating Cash to Close</th><th class="num">Loan Estimate</th><th class="num">Final</th><th>Did this change?</th></tr></thead><tbody>
    ${cc.map((r) => html`<tr data-cctc="${r.key}" class="${r.key === 'cashToClose' ? 'acct-total' : ''}"><td>${r.label}</td><td class="num">${r.le == null ? html`<span class="muted">—</span>` : m2z(r.le)}</td><td class="num"><strong data-cctc-final="${r.key}">${m2z(r.final)}</strong></td><td class="small">${r.changed == null ? html`<span class="muted">enter the LE amount</span>` : r.changed ? html`<strong>YES</strong>` : 'NO'}</td></tr>`)}</tbody></table>`;
  const GROUP = { advance: 'Adjustments for Items Paid by Seller in Advance', unpaid: 'Adjustments for Items Unpaid by Seller' };
  const summ = (k) => { const S = cd.summaries[k]; if (!S) return ''; let last = null; let i = 0;
    return html`<div class="acct-summ" data-cd-summary="${k}"><h4>${k}. ${S.label}</h4><table class="tbl"><tbody>${S.rows.length ? S.rows.map((r) => { const g = r.group && r.group !== last ? html`<tr class="acct-sec"><th colspan="2">${GROUP[r.group]}</th></tr>` : ''; last = r.group || last; i++;
      return html`${g}<tr data-summary-row="${r.id}" ${r.group ? raw(`data-summary-group="${r.group}"`) : ''}><td><span class="cd-line">${String(i).padStart(2, '0')}</span> ${r.label}</td>${n(r.amount)}</tr>`; }) : html`<tr><td class="muted small">None</td><td></td></tr>`}
    <tr class="acct-subtotal"><td><strong>Total ${k}</strong></td><td class="num"><strong data-summary-total="${k}">${m2z(S.total)}</strong></td></tr></tbody></table></div>`; };
  const page3 = html`<section class="acct-cd-page" data-cd-page="3">${pageHead(3, 'Calculating Cash to Close & Summaries of Transactions')}${cctc}
    <div class="acct-summaries"><div><h4 class="acct-side">Borrower's Transaction</h4>${summ('K')}${summ('L')}<p class="acct-cash" data-cash-to-close>Cash to close ${cd.cashToClose >= 0 ? 'from' : 'to'} borrower: <strong>${m2z(Math.abs(cd.cashToClose))}</strong> <span class="muted small">(K - L)</span></p></div>
      ${refi ? '' : html`<div><h4 class="acct-side">Seller's Transaction</h4>${summ('M')}${summ('N')}<p class="acct-cash" data-cash-to-seller>Cash ${cd.cashToSeller >= 0 ? 'to' : 'from'} seller: <strong>${m2z(Math.abs(cd.cashToSeller))}</strong> <span class="muted small">(M - N)</span></p></div>`}</div></section>`;
  // page 4
  const E = p4.escrow; const esc = p4.escrowAccount === 'will';
  const page4 = html`<section class="acct-cd-page" data-cd-page="4">${pageHead(4, 'Additional Information About This Loan')}
    <div class="acct-cd-info"><div><h4>Loan Disclosures</h4><dl><dt>Assumption</dt><dd>${p4.assumption ? `Your lender ${p4.assumption} assumption of this loan.` : '—'}</dd><dt>Demand Feature</dt><dd>${p4.demandFeature === 'yes' ? 'Has a demand feature' : p4.demandFeature === 'no' ? 'Does not have a demand feature' : '—'}</dd>
      <dt>Late Payment</dt><dd>${p4.lateDays != null ? `If a payment is more than ${p4.lateDays} days late, a late fee of ${p4.lateFee || '—'}.` : '—'}</dd><dt>Negative Amortization</dt><dd>${{ scheduled: 'Scheduled', may: 'May have', none: 'Do not have' }[p4.negAm] || '—'}</dd>
      <dt>Partial Payments</dt><dd>${{ 'may accept': 'Lender may accept partial payments', 'may hold': 'Lender may hold partial payments', 'does not accept': 'Lender does not accept partial payments' }[p4.partial] || '—'}</dd>
      <dt>Security Interest</dt><dd>${p4.securityProperty || `${deal.street}, ${deal.city}, ${deal.state} ${deal.zip}`}</dd></dl></div>
    <div data-cd-escrow-account><h4>Escrow Account</h4>${esc ? html`<p class="small">For now, your loan will have an escrow account.</p><dl>
      <dt>Escrowed Property Costs over Year 1</dt><dd data-cd-escrow-year1>${mv(p4.escrowedYear1)}</dd><dt>Non-Escrowed Property Costs over Year 1</dt><dd>${mv(p4.nonEscrowed)}</dd>
      <dt>Initial Escrow Payment</dt><dd data-cd-initial-escrow>${m2z(p4.initialEscrow)}</dd><dt>Monthly Escrow Payment</dt><dd data-cd-monthly-escrow>${mv(p4.monthlyEscrow)}</dd></dl>`
      : html`<p class="small">Your loan will not have an escrow account.</p><dl><dt>Estimated Property Costs over Year 1</dt><dd>${mv(p4.nonEscrowed)}</dd><dt>Escrow Waiver Fee</dt><dd>${mv(p4.waiverFee)}</dd></dl>`}</div></div>
    ${E ? html`<details class="acct-calc-detail" data-cd-escrow-schedule open><summary class="small">Escrow account calculation (aggregate analysis, first year)</summary>${escrowTable(E)}</details>` : ''}</section>`;
  // page 5
  const page5 = html`<section class="acct-cd-page" data-cd-page="5">${pageHead(5, 'Loan Calculations, Other Disclosures & Contact Information')}
    <div class="acct-cd-info"><div data-cd-loan-calcs><h4>Loan Calculations</h4><dl><dt>Total of Payments</dt><dd>${mv(p5.totalOfPayments)}</dd><dt>Finance Charge</dt><dd>${mv(p5.financeCharge)}</dd><dt>Amount Financed</dt><dd>${mv(p5.amountFinanced)}</dd>
      <dt>Annual Percentage Rate (APR)</dt><dd>${p5.apr != null ? p5.apr + '%' : '—'}</dd><dt>Total Interest Percentage (TIP)</dt><dd>${p5.tip != null ? p5.tip + '%' : '—'}</dd></dl></div>
    <div><h4>Other Disclosures</h4><dl><dt>Liability after Foreclosure</dt><dd>${p5.liability === 'protected' ? 'State law may protect you from liability for the unpaid balance.' : p5.liability === 'not protected' ? 'State law does not protect you from liability for the unpaid balance.' : '—'}</dd><dt>Refinance</dt><dd>${p5.refinance || 'Refinancing this loan will depend on your future financial situation, the property value, and market conditions.'}</dd></dl></div></div>
    <table class="tbl acct-cd" data-cd-contacts><thead><tr><th>Contact Information</th><th>Lender</th><th>Mortgage Broker</th>${refi ? '' : html`<th>Real Estate Broker (B)</th><th>Real Estate Broker (S)</th>`}<th>Settlement Agent</th></tr></thead><tbody>
      <tr><td>Name</td><td>${deal.lenderName || '—'}</td><td>${p5.broker || '—'}</td>${refi ? '' : html`<td>${names(deal, 'Buyer Agent') || '—'}</td><td>${names(deal, 'Listing Agent') || '—'}</td>`}<td>CLA Title &amp; Escrow (test portal)</td></tr>
      <tr><td>NMLS ID</td><td>${p5.lenderNmls || '—'}</td><td>—</td>${refi ? '' : html`<td>—</td><td>—</td>`}<td>—</td></tr><tr><td>Contact</td><td>${p5.lenderContact || deal.lenderContact || '—'}</td><td>—</td>${refi ? '' : html`<td>—</td><td>—</td>`}<td>—</td></tr>
      <tr><td>Contact NMLS ID</td><td>${p5.lenderContactNmls || '—'}</td><td>—</td>${refi ? '' : html`<td>—</td><td>—</td>`}<td>—</td></tr></tbody></table>
    <p class="small muted">Confirm Receipt: not used. This is a TEST page built by the portal, not a legal disclosure; the lender's Closing Disclosure is the real one.</p></section>`;
  const warn = X.calcWarnings && X.calcWarnings.length ? html`<div class="notice warn small acct-noprint" data-cd-calc-warnings>${X.calcWarnings.map((w) => html`<div>${w}</div>`)}</div>` : '';
  const body = html`<div class="acct-toolbar acct-noprint"><span class="muted small">Closing Disclosure pages 1-5. Fees, lender credits, prorations and the summaries come from the fee ledger; loan terms, projected payments, the Loan Estimate column and the loan disclosures are entered on <a href="#/deals/${deal.id}/accounting?v=cddetails" data-goto-cddetails>CD details &amp; escrow</a>.</span><span class="spacer"></span>${printBtn('cd')}</div>${warn}
    <div class="card acct-doc" data-print-area="cd" data-cd-full>${docHead(deal, 'Closing Disclosure', 'Built from the Accounting fee ledger and the CD details. For testing the portal only.')}${page1}${page2}${page3}${page4}${page5}<div class="acct-mark acct-mark-foot">${TEST_MARK}</div></div>`;
  return { body, mount: mountPrint };
}
function escrowTable(E) {
  return html`<p class="small">First payment month ${E.start.slice(0, 7)} &middot; monthly escrow ${m2z(E.monthlyEscrow)} &middot; cushion ${E.cushionMonths} month${E.cushionMonths === 1 ? '' : 's'} = ${m2z(E.cushion)} &middot; initial deposit ${m2z(E.initialDeposit)} &middot; itemized ${m2z(E.itemized)} &middot; aggregate adjustment <strong data-escrow-agg>${m2z(E.aggregateAdjustment)}</strong> &middot; lowest balance ${m2z(E.lowBalance)}</p>
    <table class="tbl acct-escrow" data-escrow-table><thead><tr><th>Month</th><th class="num">Deposit</th><th class="num">Paid out</th><th class="num">Balance</th></tr></thead><tbody>
    <tr><td>At closing</td><td class="num">${m2z(E.initialDeposit)}</td><td></td><td class="num">${m2z(E.initialDeposit)}</td></tr>
    ${E.schedule.map((s) => html`<tr class="${s.balance === E.lowBalance ? 'acct-escrow-low' : ''}"><td>${s.month}</td><td class="num">${m2z(s.deposit)}</td><td class="num">${s.disbursed ? m2z(s.disbursed) : ''}</td><td class="num">${m2z(s.balance)}</td></tr>`)}</tbody></table>`;
}

// ---------------- CD details & the prepaids / escrow calculator ----------------
export async function cdDetailsView(api, deal, acc) {
  const X = await api.getAccountingCd(deal.id); const v = X.details || {}; const ro = !X.canEdit;
  const field = ([k, type, label, opts]) => { const val = v[k] ?? ''; const dis = ro ? raw('disabled') : '';
    if (type === 'select' || type === 'yn') return html`<label>${label}<select name="${k}" ${dis}>${(type === 'select' && !opts.some(([o]) => o === '') && k !== 'disc.escrowAccount' && k !== 'pre.interestBasis' && k !== 'esc.cushion' && !/Cycle$/.test(k) ? [['', '—'], ...opts] : opts).map(([o, l]) => html`<option value="${o}" ${String(o) === String(val) ? raw('selected') : ''}>${l}</option>`)}</select></label>`;
    return html`<label>${label}<input name="${k}" ${type === 'date' ? raw('type="date"') : raw(type === 'text' ? 'maxlength="200"' : 'inputmode="decimal"')} value="${val}" autocomplete="off" ${dis}></label>`; };
  const groups = CD_DETAIL_GROUPS.map(([g, title, fields]) => html`<fieldset class="acct-cd-group" data-cd-group="${g}"><legend>${title}</legend><div class="form-grid">${fields.map(field)}</div></fieldset>`);
  const form = html`<form class="card acct-form acct-cd-form" id="acct-cd-form" data-cd-form novalidate><div class="acct-card-head"><h3>Closing Disclosure details</h3><span class="muted small" data-cd-saved>${X.updatedAt ? `Last saved ${new Date(X.updatedAt).toLocaleString('en-US')}${X.updatedByName ? ' by ' + X.updatedByName : ''}` : 'Nothing entered yet'}</span></div>
    <p class="small muted">Manual entries for the parts of the CD the fee ledger cannot know (loan terms, projected payments, the Loan Estimate column, loan disclosures and calculations), and the inputs of the prepaids (F) / initial escrow (G) calculator. ${ro ? html`<strong data-readonly-note>Read only for your role.</strong>` : 'Every save is logged field by field.'}</p>
    ${groups}<p class="err-text small" data-cd-err></p>${ro ? '' : html`<div class="acct-form-actions"><button class="m-btn" type="submit" data-save-cd>Save CD details</button><span class="muted small">Logged with your name and the time.</span></div>`}</form>`;
  const calc = ro ? '' : html`<div class="card acct-calc" data-prepaids-card><div class="acct-card-head"><h3>Prepaids (F) &amp; initial escrow payment (G)</h3><span class="muted small">from the saved CD details</span></div>
    <p class="small muted">Homeowner's insurance, mortgage insurance, prepaid interest and property tax lines for section F, and the initial escrow deposit for section G with the aggregate adjustment (RESPA-style aggregate analysis, cushion up to 2 months). Save the details first, preview, then apply: the lines go on the fee ledger tagged "${'Prepaids / escrow calculator'}".</p>
    <button class="m-btn" type="button" data-prepaids-preview>Preview F &amp; G lines</button><div data-prepaids-result></div></div>`;
  const escrow = X.escrow ? html`<div class="card" data-escrow-card><div class="acct-card-head"><h3>Escrow account calculation</h3></div>${escrowTable(X.escrow)}</div>` : '';
  const warn = X.calcWarnings && X.calcWarnings.length ? html`<div class="notice warn small" data-cd-calc-warnings>${X.calcWarnings.map((w) => html`<div>${w}</div>`)}</div>` : '';
  const body = html`<div class="acct-grid">${warn}${calc}${form}${escrow}</div>`;
  return { body, mount: (root, c = {}) => mountCdDetails(root, api, deal, c.refresh) };
}
const ST = { new: ['New', 'ok'], changed: ['Changed', 'info'], unchanged: ['Unchanged', ''], retire: ['Will be retired', 'bad'] };
function mountCdDetails(root, api, deal, refresh) {
  const go = () => (refresh ? refresh() : location.reload());
  const f = $('#acct-cd-form', root);
  if (f && $('[data-save-cd]', f)) f.addEventListener('submit', async (e) => { e.preventDefault(); const err = $('[data-cd-err]', f); err.textContent = '';
    const input = Object.fromEntries($$('input,select', f).map((i) => [i.name, i.value]));
    try { const r = await api.saveAccountingCd(deal.id, input); toast(r.changed === 0 ? 'Nothing changed.' : 'CD details saved (logged).'); go(); } catch (x) { err.textContent = x.message; toast(x.message, 'err'); } });
  const card = $('[data-prepaids-card]', root); if (!card) return;
  $('[data-prepaids-preview]', card).addEventListener('click', guard(async () => { const P = await api.previewAccountingPrepaids(deal.id); const out = $('[data-prepaids-result]', card);
    out.innerHTML = toText(html`${P.warnings.length ? html`<div class="notice warn small" data-prepaids-warnings>${P.warnings.map((w) => html`<div>${w}</div>`)}</div>` : ''}
      <table class="tbl acct-calc-diff" data-prepaids-diff><thead><tr><th>Status</th><th>Line</th><th>CD</th><th class="num">Now</th><th class="num">Calculated</th></tr></thead><tbody>
      ${P.rows.length ? P.rows.map((r) => { const [l, cls] = ST[r.status]; const x = r.proposed || r.current; return html`<tr data-prepaids-row="${r.key}" data-prepaids-status="${r.status}"><td><span class="pill ${cls}">${l}</span></td><td><strong>${x.description}</strong>${r.proposed ? html`<div class="small muted">${r.proposed.calculation}</div>` : ''}</td><td class="small">${r.proposed ? r.proposed.cdSection + '.' + r.proposed.cdLine : ''}</td><td class="num">${r.current ? m2z(r.current.amount) : '—'}</td><td class="num"><strong>${r.proposed ? (r.proposed.reduces ? '-' : '') + m2z(r.proposed.amount) : '—'}</strong></td></tr>`; })
        : html`<tr><td colspan="5" class="muted">Nothing to calculate yet: enter the interest rate, insurance and tax amounts on the CD details and save.</td></tr>`}</tbody></table>
      ${P.examples.length ? html`<label class="check small acct-calc-examples"><input type="checkbox" data-prepaids-examples checked> Also retire ${P.examples.length} EXAMPLE fee${P.examples.length === 1 ? '' : 's'} these replace: ${P.examples.map((x) => `${x.description} (${m2z(x.amount)})`).join(', ')}</label>` : ''}
      <div class="acct-form-actions"><button class="m-btn" type="button" data-prepaids-apply ${P.applicable || P.examples.length ? '' : raw('disabled')}>${P.applicable ? `Apply ${P.applicable} change${P.applicable === 1 ? '' : 's'}` : 'Nothing to apply'}</button><span class="muted small">Every change is logged.</span></div>`);
    const b = $('[data-prepaids-apply]', out); b.addEventListener('click', guard(async () => { const ex = $('[data-prepaids-examples]', out); const r = await api.applyAccountingPrepaids(deal.id, { retireExamples: !!(ex && ex.checked) });
      toast(`Prepaids / escrow applied: ${r.added} added, ${r.updated} updated, ${r.retired + r.examplesRetired} retired (logged).`); go(); })); }));
}
