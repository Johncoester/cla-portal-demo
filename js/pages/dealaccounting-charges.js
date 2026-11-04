// ACCOUNTING › CHARGES: the Qualia "Closing › Charges" workflow (John, Nov 4 2026: "mimic everything that you see in the accounting tab video ...
// This is exactly how Qualia works ... keep everything the same for now"). Source of truth: Francis Santos's Qualia screen recording, written up in
// /workspace/francis-videos/fees-cd/QUALIA-FEES-SPEC.md. Layout and labels follow Qualia (section nav A-N, the CD's columns and line numbers,
// click a line -> "Settings · Line NN" + "Payments · <line>", six payment methods, help rail); colours stay ours (baby-blue cards), no Qualia branding.
// Every line is still ONE fee on the same ledger (accounting.js), so the ALTA, the CD pages, prorations and CLA rates keep working.
// TEST ONLY. Wire instructions (bank routing / account numbers) are NEVER stored: the Wire block is a reminder only.
import { html, raw, $, $$, guard, toast, toText, fmtDate } from '../ui.js?v=202611041802';
import { splitFor } from '../data/underwriter.js?v=202611041802';
import { cdDescription } from '../data/accounting.js?v=202611041802';
import { hoaGrPanel, mountHoaGr } from './dealpayoffs.js?v=202611041802';   // John, Nov 4: H "HOA / Condo / Ground Rent / Payoffs"
import * as Q from '../data/qualia-charges.js?v=202611041802';

const usd = (n) => (Number(n) < 0 ? '-' : '') + '$' + Math.abs(Number(n || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cell$ = (n) => (n == null || Number(n) === 0 ? '' : usd(n));
const num = (v) => Number(String(v == null ? '' : v).replace(/[$,\s]/g, '')) || 0;
const opt = (v, l, sel) => html`<option value="${v}" ${String(v) === String(sel ?? '') ? raw('selected') : ''}>${l}</option>`;
const dis = (on) => (on ? raw('disabled') : '');
const sectionHref = (base, k, line) => `${base}?v=charges&s=${k}${line ? '&l=' + line : ''}`;
const ALLOC = [['buyer', 'Buyer'], ['seller', 'Seller'], ['split', 'Split'], ['others', 'Paid By Others']];

// ---------------- left nav (Qualia: General · Closing › Charges · Preview), plus CLA's own tools ----------------
export function qcNav(deal, view, sec, base, showPayoffs = true) {
  const a = (href, label, on, attrs = '', chip = '') => html`<a class="qc-nav-link ${on ? 'on' : ''}" href="${href}"${raw(attrs)}>${chip ? html`<span class="qc-chip">${chip}</span>` : ''}<span>${label}</span></a>`;
  return html`<nav class="qc-nav acct-noprint" data-acct-tabs data-qc-nav aria-label="Accounting sections">
    <div class="qc-nav-group">General</div>
    ${a(`#/deals/${deal.id}/overview`, 'Basic Info', false, ' data-qc-nav-basic')}${a(`#/deals/${deal.id}/contacts`, 'Contacts', false, ' data-qc-nav-contacts')}
    ${showPayoffs ? html`${a(`${base}?v=othercontacts`, 'Other Contacts', view === 'othercontacts', ' data-acct-tab="othercontacts"')}
    ${a(`${base}?v=taxes`, 'Taxes & Prorations', view === 'taxes', ' data-acct-tab="taxes"')}${a(`${base}?v=payoffs`, 'Payoffs', view === 'payoffs', ' data-acct-tab="payoffs"')}` : ''}
    <div class="qc-nav-group">Closing</div><div class="qc-nav-sub">Charges</div>
    ${Q.QC_SECTIONS.map(([k, chip, label]) => a(sectionHref(base, k), label, view === 'charges' && sec === k, ` data-qc-nav-sec="${k}"${k === 'A' ? ' data-acct-tab="charges"' : ''}`, chip))}
    <div class="qc-nav-group">Preview</div>
    ${a(`${base}?v=cd`, 'Closing Disclosure', view === 'cd', ' data-acct-tab="cd"')}${a(`${base}?v=alta`, 'Settlement Statement', view === 'alta', ' data-acct-tab="alta"')}
    <div class="qc-nav-group">CLA tools</div>
    ${a(`${base}?v=prorations`, 'Prorations (CLA list)', view === 'prorations', ' data-acct-tab="prorations"')}${a(`${base}?v=cddetails`, 'CD details & escrow', view === 'cddetails', ' data-acct-tab="cddetails"')}${a(`${base}?v=ledger`, 'Fee ledger', view === 'ledger', ' data-acct-tab="ledger"')}
    ${a(`${base}?v=payments`, 'Payment summary', view === 'payments', ' data-acct-tab="payments"')}${a(`${base}?v=history`, 'Edit history', view === 'history', ' data-acct-tab="history"')}
  </nav>`;
}

// ---------------- help rail (Qualia's right-hand cards) ----------------
const HELP = {
  A: ['Origination Charges', 'Fees the lender charges to make the loan. A.01 "% of Loan Amount (Points)": the Loan Amount % is precalculated from the A.01 amount ÷ the loan amount (whole numbers show no decimals, otherwise 3).'],
  B: ['Did Not Shop For', 'Services the borrower could not shop for (picked by the lender), e.g. the flood certification. Listed alphabetically (TRID).'],
  C: ['Did Shop For', 'Services the borrower shopped for. Title lines start with "Title -" and are alphabetical. Edit Premium Line opens the CLA-rates premium options; Send Title Charges to B moves the title lines to B when the borrower used the lender\'s list.'],
  E: ['Taxes & Fees', 'E.01 is ONE line for every recording fee ("Recording fees: Deed: $60.00 Mortgage: $60.00"); recordation and transfer taxes follow as their own lines. Don\'t confuse recording fees with recordation taxes.'],
  F: ['Prepaids', 'Items paid in advance: homeowner\'s insurance (# of months), mortgage insurance, prepaid interest (per diem × days, From Date defaults to the disbursement date) and property taxes.'],
  G: ['Escrow', 'Initial escrow payment: $ per month × # of months. G.08 Aggregate adjustment is typed as a positive amount and shows negative on the CD. Compare with the lender\'s escrow analysis. Usually Net Funded.'],
  H: ['Other Charges', 'Home warranty, agent admin fees and commissions, inspections, the owner\'s title policy (optional), holdbacks such as a water escrow.'],
  J: ['Lender Credits', 'Credits from the lender toward the borrower\'s closing costs (CD section J).'],
  KM: ['Debits / Credits K/M', 'K: due from the borrower at closing. M: due to the seller at closing. Linked lines (⇄) are the same money on both sides.'],
  LN: ['Credits / Debits L/N', 'L: paid already by or on behalf of the borrower (deposit, loan amount, seller credit, unpaid-by-seller items). N: due from the seller (closing costs J, payoffs, seller credit). Linked lines (⇄) are the same money on both sides.'] };
export function helpRail(sec) {
  const [t, x] = HELP[sec] || HELP.A;
  return html`<aside class="qc-help acct-noprint" data-qc-help><div class="qc-help-card" data-qc-help-field><h5>${t} <span class="qc-q" aria-hidden="true">?</span></h5><p>${x}</p></div>
    <div class="qc-help-card qc-help-pre" data-qc-help-pre><h5><span class="qc-dot pre"></span>Precalculated Field</h5><p>Blue values are calculated for you (CLA rates, the order, the calculators). You can type over them.</p></div>
    <div class="qc-help-card qc-help-over" data-qc-help-over><h5><span class="qc-dot over"></span>User Override</h5><p>Orange values were typed over a calculated value. Clear the field (×) to go back to the calculated value. Every change is logged.</p></div></aside>`;
}

// ---------------- the Charges page ----------------
export async function chargesView(api, deal, acc, q, base) {
  const sec = Q.QC_KEYS.includes(q.get('s')) ? q.get('s') : 'A'; const [, chip, , title, kind] = Q.qcSection(sec);
  const [cd, cdRec, uwRows, extraPayees] = await Promise.all([api.getClosingDisclosure(deal.id), api.getAccountingCd ? api.getAccountingCd(deal.id).catch(() => null) : null,
    api.listUnderwriterSplits ? api.listUnderwriterSplits().then((r) => r.rows, () => null) : null, api.listPayoffPayees ? api.listPayoffPayees(deal.id).catch(() => []) : []]);
  const uw = uwRows ? splitFor(uwRows, deal.state) : null; const uwSplitPct = uw && uw.pct != null ? Number(uw.pct) : null;
  const details = (cdRec && cdRec.details) || {}; const ctx = { api, deal, acc, cd, details, base, sec, uwSplitPct, canEdit: acc.canEdit, extraPayees };
  const head = html`<div class="qc-page-head"><span class="qc-chip big">${chip}</span><h3 data-qc-title>${title}</h3><span class="spacer"></span>
    ${kind === 'fee' && acc.canEdit ? html`<div class="qc-head-btns"><button type="button" class="ghost small" disabled data-qc-extract title="Qualia reads the lender's CD with AI. Not in the test portal.">Extract From CD</button>
      <button type="button" class="ghost small" data-qc-sort>Sort Lines</button><button type="button" class="ghost small qc-sq" data-qc-minus title="Clear the selected line" aria-label="Clear the selected line">&ndash;</button><button type="button" class="ghost small qc-sq" data-qc-plus title="Add a line" aria-label="Add a line">+</button></div>` : ''}</div>`;
  const main = kind === 'fee' ? feeSection(ctx) : kind === 'credits' ? lenderCredits(ctx) : summaries(ctx, sec === 'KM' ? ['K', 'M'] : ['L', 'N']);
  const body = html`<div class="qc-wrap" data-qc-page="${sec}"><div class="qc-main">${head}${acc.canEdit ? '' : html`<p class="notice info small" data-readonly-note>Read only for your role: you can read every section; only a Processor, Admin or Super admin can change it.</p>`}${main.body}</div>${helpRail(sec)}</div>`;
  return { body, mount: (root, c = {}) => { const r = c.refresh || (() => location.reload()); main.mount(root, r); if (sec === 'H') mountHoaGr(root, api, deal, acc, r); } };
}

// ---------------- fee sections A B C E F G H ----------------
function feeSection(ctx) {
  const { deal, acc, cd, sec, base, canEdit } = ctx; const refi = acc.refi; const G = sec === 'G';
  const grid = Q.sectionGrid(deal, cd, acc.entries, sec); const rows = grid.rows; const byLine = Object.fromEntries(rows.map((r) => [r.line, r]));
  const loan = Number(deal.loanAmount) || 0;
  const banner = sec === 'E' && !(deal.street && deal.city && deal.zip && deal.county) ? html`<div class="qc-banner" data-qc-address-banner><span>You'll need to add a complete property address before we'll be able to calculate recording fees and taxes.</span> <a class="m-btn small" href="#/deals/${deal.id}/overview" data-qc-add-property>Add property</a></div>` : '';
  const amtCols = refi ? ['borrowerAt', 'borrowerBefore', 'others'] : ['borrowerAt', 'borrowerBefore', 'sellerAt', 'sellerBefore', 'others'];
  const locked = (r) => !canEdit || !!r.recording || (sec === 'E' && r.line === '01') || !!(r.fee && r.fee.proration);
  const tone = (r) => (r.fee && r.fee.overridden ? 'qc-over' : r.calculated ? 'qc-pre' : '');
  const m = (r) => (r.fee && r.fee.meta) || {};
  const amtCell = (r, f) => { const lk = locked(r) || (m(r).perDiem && f.startsWith('borrower')) || (G && m(r).perMonth != null && f.startsWith('borrower'));
    return html`<td class="num qc-amt ${r[f] ? tone(r) : ''}">${lk ? html`<span data-qc-val="${f}">${cell$(r[f])}</span>` : html`<input class="qc-cell num" data-qc-cell="${f}" value="${cell$(r[f])}" inputmode="decimal" aria-label="Line ${r.line} ${f}" autocomplete="off">`}</td>`; };
  const gCells = (r) => { if (!G) return ''; const x = m(r); const lk = !canEdit || r.line === '08';
    const tn = x.perMonth != null && r.fee && r.fee.overridden ? 'qc-over' : x.perMonth != null && String(r.fee.presetKey || '').startsWith('cdcalc:') ? 'qc-pre' : '';
    return html`<td class="num qc-g ${tn}">${lk ? html`<span>${x.perMonth != null ? usd(x.perMonth) : ''}</span>` : html`<input class="qc-cell num" data-qc-cell="perMonth" value="${x.perMonth != null ? usd(x.perMonth) : ''}" inputmode="decimal" aria-label="Line ${r.line} $ per month">`}</td>
      <td class="num qc-g">${lk ? html`<span>${x.months ?? ''}</span>` : html`<input class="qc-cell num qc-mo" data-qc-cell="months" value="${x.months ?? ''}" inputmode="numeric" aria-label="Line ${r.line} # of months">`}</td>`; };
  const rowHtml = (r) => { const lk = locked(r); const has = !!(r.fee || r.recording);
    return html`<tr class="qc-row ${has ? 'has-fee' : 'is-blank'} ${r.template && !has ? 'is-template' : ''} ${r.reduces ? 'qc-reduces' : ''}" data-qc-row="${r.line}" ${r.id ? raw(`data-qc-fee="${r.id}"`) : ''}>
      <td class="qc-num" data-qc-line>${r.line}</td>
      <td class="qc-desc">${lk ? html`<span data-qc-val="description">${r.description || (sec === 'E' && r.line === '01' ? 'Recording fees (add them in Settings)' : '')}</span>` : html`<div class="qc-desc-in">${r.fee && r.fee.titlePrefix && !/^title\s*-/i.test(r.fee.description) ? html`<span class="qc-prefix">Title -</span>` : ''}<input class="qc-cell" data-qc-cell="description" value="${r.fee ? r.fee.description : ''}" placeholder="${r.template || ''}" maxlength="200" aria-label="Line ${r.line} description" autocomplete="off"></div>${r.fee && r.description !== cdDescription(r.fee) ? html`<div class="qc-cdtext small" data-qc-cdtext>${r.description}</div>` : ''}`}
        ${r.fee && r.fee.calc ? html`<span class="pill acct-calc-pill qc-mini" data-calc-tag title="${r.fee.calc.rateSource}">CLA rates</span>` : ''}${r.fee && r.fee.overridden ? html`<span class="pill warn qc-mini" data-overridden>Overridden</span>` : ''}${r.fee && r.fee.timing === 'before' ? html`<span class="pill qc-mini">${r.fee.poc ? 'POC' : 'Before closing'}</span>` : ''}${r.parts ? html`<span class="pill qc-mini" data-qc-parts title="Two ledger fees shown on one CD line: the borrower part and the seller part">buyer + seller</span>` : ''}</td>
      ${gCells(r)}
      <td class="qc-payee ${r.calculated && r.payee ? 'qc-pre-text' : ''}">${lk ? html`<span data-qc-val="payee">${r.payee ? 'to ' + r.payee : ''}</span>` : html`<input class="qc-cell" data-qc-cell="payee" value="${r.payee || ''}" list="qc-payees" maxlength="120" aria-label="Line ${r.line} payee" autocomplete="off">`}</td>
      ${amtCols.map((f) => amtCell(r, f))}</tr>`; };
  const T = grid.totals;
  const table = html`<div class="qc-table-wrap"><table class="qc-table" data-qc-table="${sec}"><thead>
      <tr><th rowspan="2" class="qc-num">#</th><th rowspan="2">Description</th>${G ? html`<th rowspan="2" class="num">$ per Month</th><th rowspan="2" class="num"># of Mo.</th>` : ''}<th rowspan="2">Payee</th><th colspan="2" class="center">Paid by Borrower</th>${refi ? '' : html`<th colspan="2" class="center">Paid by Seller</th>`}<th rowspan="2" class="num">By Others</th></tr>
      <tr><th class="num">At Closing</th><th class="num">Before Closing</th>${refi ? '' : html`<th class="num">At Closing</th><th class="num">Before Closing</th>`}</tr></thead>
    <tbody>${rows.map(rowHtml)}</tbody>
    <tfoot><tr class="qc-totals" data-qc-totals><td></td><td><strong>TOTALS</strong></td>${G ? html`<td></td><td></td>` : ''}<td></td>${amtCols.map((f) => html`<td class="num" data-qc-total="${f}"><strong>${usd(T[f])}</strong></td>`)}</tr></tfoot></table></div>`;
  const titleBtns = canEdit && (sec === 'C' || sec === 'H') ? html`<div class="qc-under-btns acct-noprint"><a class="ghost small btn-like" href="${base}?v=ledger&calc=1" data-qc-edit-premium>Edit Premium Line</a>
    <button type="button" class="ghost small" data-qc-adjust>Adjust Allocations</button>${sec === 'C' ? html`<button type="button" class="ghost small" data-qc-send-b>Send Title Charges to B</button>` : ''}</div>` : '';
  const payees = html`<datalist id="qc-payees">${Q.standardPayees(deal, ctx.extraPayees).map((p) => html`<option value="${p.name}">${p.role}</option>`)}</datalist>`;
  const body = html`${banner}${table}${titleBtns}${payees}${sec === 'H' ? hoaGrPanel(ctx) : ''}<div class="qc-panels" data-qc-panels><div data-qc-settings></div><div data-qc-payments></div></div>
    <p class="muted small qc-foot">Click a line to see its Settings and Payments. Type in a cell and press Enter (or leave the cell) to save: every change is logged. Lines are never deleted: Clear retires a line (kept in the edit history).</p>`;
  return { body, mount: (root, refresh) => mountFees(root, refresh, { ...ctx, rows, byLine, loan }) };
}

const CELL_SIDE = { borrowerAt: 'buyer', borrowerBefore: 'buyer', sellerAt: 'seller', sellerBefore: 'seller' };
const newFeeInput = (sec, line, description, extra = {}) => ({ kind: 'charge', description, altaSection: Q.altaForLine(sec, line, description), cdSection: sec, cdLine: line, payee: '', amount: '0', paidBy: 'buyer', timing: 'at', ...extra });

function mountFees(root, refresh, ctx) {
  const { api, deal, acc, sec, rows, byLine, canEdit, loan, details, uwSplitPct } = ctx;
  const q = new URLSearchParams(location.hash.split('?')[1] || ''); let selLine = byLine[q.get('l')] ? q.get('l') : null;
  const saveFee = async (r, patch, msg = 'Saved (logged).') => { if (r.fee) await api.updateAccountingFee(r.fee.id, patch); else await api.addAccountingFee(deal.id, patch); toast(msg); refresh(); };
  const select = (line) => { selLine = line; $$('[data-qc-row]', root).forEach((tr) => tr.classList.toggle('is-sel', tr.dataset.qcRow === line));
    const [path, qs = ''] = location.hash.split('?'); const p = new URLSearchParams(qs); if (line) p.set('l', line); else p.delete('l'); history.replaceState(null, '', `${path}?${p.toString()}`);
    renderPanels(); };
  // ---- in-cell editing ----
  const cellSave = guard(async (inp) => { const tr = inp.closest('[data-qc-row]'); const r = byLine[tr.dataset.qcRow]; const f = inp.dataset.qcCell; const v = inp.value.trim();
    if (inp.dataset.orig === v) return; inp.dataset.orig = v;
    const descNow = () => { const d = $('[data-qc-cell="description"]', tr); return (d && d.value.trim()) || r.template || ''; };
    const needDesc = () => { const d = descNow(); if (!d) throw new Error('Type the description first.'); return d; };
    const all = r.parts ? r.parts.map((x) => x.fee).filter(Boolean) : r.fee ? [r.fee] : [];
    if (r.parts && (f === 'description' || f === 'payee')) { if (f === 'description' && !v) throw new Error('Description is required (use Clear to take the line off).'); for (const x of all) await api.updateAccountingFee(x.id, { [f]: v }); toast('Saved on the borrower and seller parts (logged).'); return refresh(); }
    if (r.parts && CELL_SIDE[f]) { const part = r.parts.find((x) => x.side === CELL_SIDE[f]); if (part && part.fee) return saveFee({ fee: part.fee }, Q.cellPatch(part.fee, f, v)); }
    if (f === 'description') { if (!r.fee) { if (!v) return; return saveFee(r, newFeeInput(sec, r.line, v), `Line ${sec}.${r.line} added (logged).`); } if (!v) throw new Error('Description is required (use Clear to take the line off).'); return saveFee(r, { description: v }); }
    if (f === 'payee') { if (!r.fee) return saveFee(r, { ...newFeeInput(sec, r.line, needDesc()), payee: v }, `Line ${sec}.${r.line} added (logged).`); return saveFee(r, { payee: v }); }
    if (f === 'perMonth' || f === 'months') { const x = { ...((r.fee && r.fee.meta) || {}) }; const k = f; if (v === '') delete x[k]; else x[k] = v;
      const meta = Q.cleanMeta(x); const amount = meta && meta.perMonth != null ? Q.escrowLine(meta.perMonth, meta.months ?? 0) : r.fee ? Number(r.fee.amount) : 0;
      const patch = { meta, amount: amount.toFixed(2), paidBy: 'buyer', split: null, timing: 'at', poc: false };
      if (!r.fee) return saveFee(r, { ...newFeeInput(sec, r.line, needDesc()), ...patch }, `Line ${sec}.${r.line} added (logged).`);
      return saveFee(r, patch); }
    if (!r.fee) { const d = needDesc(); const p = Q.cellPatch(null, f, v);   // amount typed on a blank / template line
      return saveFee(r, { ...newFeeInput(sec, r.line, d), ...p, ...(sec === 'G' && r.line === '08' ? { reduces: true, paidBy: 'buyer', split: null } : {}) }, `Line ${sec}.${r.line} added (logged).`); }
    return saveFee(r, Q.cellPatch(r.fee, f, v)); });
  const lit = (td) => { $('[data-qc-help-pre]', root)?.classList.toggle('lit', !!(td && td.classList.contains('qc-pre'))); $('[data-qc-help-over]', root)?.classList.toggle('lit', !!(td && td.classList.contains('qc-over'))); };
  $$('[data-qc-cell]', root).forEach((inp) => { inp.dataset.orig = inp.value.trim();
    inp.addEventListener('change', () => cellSave(inp)); inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
    inp.addEventListener('focus', () => lit(inp.closest('td'))); });
  $$('[data-qc-row]', root).forEach((tr) => { tr.addEventListener('click', () => { if (selLine !== tr.dataset.qcRow) select(tr.dataset.qcRow); }); tr.addEventListener('focusin', () => { if (selLine !== tr.dataset.qcRow) select(tr.dataset.qcRow); }); });
  // ---- header + under-table buttons ----
  const clearLine = guard(async (r) => { if (!r) throw new Error('Select a line first.'); const ids = r.recording ? r.recording.map((x) => x.id) : r.parts ? r.parts.map((x) => x.id) : r.fee ? [r.fee.id] : [];
    if (!ids.length) throw new Error('This line is empty.');
    if (!confirm(`Clear ${sec}.${r.line}? ${ids.length > 1 ? `Its ${ids.length} recording lines are` : 'The line is'} retired: it comes off the statements and stays in the edit history (restore it from the Fee ledger).`)) return;
    for (const id of ids) await api.retireAccountingFee(id, true); toast(`${sec}.${r.line} cleared (retired, logged).`); refresh(); });
  $('[data-qc-minus]', root)?.addEventListener('click', () => clearLine(byLine[selLine]));
  $('[data-qc-plus]', root)?.addEventListener('click', () => { const r = rows.find((x) => !x.fee && !x.recording && !x.template && !(sec === 'E' && x.line === '01')) || rows.find((x) => !x.fee && !x.recording);
    if (!r) return toast('No empty line left.', 'err'); select(r.line); const d = $(`[data-qc-row="${r.line}"] [data-qc-cell="description"]`, root); if (d) d.focus(); });
  // Sort Lines (guess: what the button did is not shown in the video): alphabetical by description; template lines (A.01, F.01-04, G.01-03, G.08) and E.01 stay put
  $('[data-qc-sort]', root)?.addEventListener('click', guard(async () => {
    const T = Q.TEMPLATES[sec] || {}; const fixed = (r) => !!r.recording || (sec === 'E' && r.line === '01') || (T[r.line] && r.fee && r.fee.description === T[r.line]) || (sec === 'G' && r.line === '08' && r.fee);
    const movable = rows.filter((r) => r.fee && !fixed(r)).sort((a, b) => cdDescription(a.fee).localeCompare(cdDescription(b.fee)));
    const taken = new Set(rows.filter((r) => fixed(r) || (T[r.line] && !r.fee)).map((r) => r.line)); let n = 0; const plan = [];
    for (const r of movable) { let l; do { n++; l = String(n).padStart(2, '0'); } while (taken.has(l)); for (const f of feesOfRow(r)) if (r.line !== l || f.cdLine !== l) plan.push([f.id, l]); }
    if (!plan.length) return toast('Lines are already sorted.'); for (const [id, l] of plan) await api.updateAccountingFee(id, { cdLine: l });
    toast(`Sorted: ${plan.length} line${plan.length === 1 ? '' : 's'} renumbered (logged).`); refresh(); }));
  $('[data-qc-adjust]', root)?.addEventListener('click', () => { if (!selLine || !byLine[selLine].fee) return toast('Select a line with an amount first.', 'err'); const a = $('[data-qc-alloc]', root); if (a) { a.scrollIntoView({ block: 'center' }); a.classList.add('flash'); setTimeout(() => a.classList.remove('flash'), 900); } });
  $('[data-qc-send-b]', root)?.addEventListener('click', guard(async () => { const list = rows.filter((r) => r.fee && /^Title\s*-/i.test(cdDescription(r.fee)));
    if (!list.length) throw new Error('No "Title -" lines in C.'); if (!confirm(`Move ${list.length} title line${list.length === 1 ? '' : 's'} from C (Did Shop For) to B (Did Not Shop For)? Logged; you can move them back from the Fee ledger.`)) return;
    for (const r of list) for (const f of feesOfRow(r)) await api.updateAccountingFee(f.id, { cdSection: 'B', cdLine: '' }); toast(`${list.length} title line${list.length === 1 ? '' : 's'} sent to B (logged).`); refresh(); }));

  // ---- Settings + Payments for the selected line ----
  let payState = null; let subSel = null;
  const feesOfRow = (r) => (r.parts ? r.parts.map((x) => x.fee).filter(Boolean) : r.recording ? r.recording.map((x) => x.fee).filter(Boolean) : r.fee ? [r.fee] : []);
  // a CD line that is several ledger fees: E.01 (one per recording type) or a buyer + seller line
  const subsOf = (r) => (r.recording ? r.recording.map((x) => ({ id: x.id, label: x.type, fee: x.fee })) : r.parts ? r.parts.map((x) => ({ id: x.id, label: x.side === 'buyer' ? 'Borrower part' : 'Seller part', fee: x.fee })) : null);
  function renderPanels() {
    const S = $('[data-qc-settings]', root), P = $('[data-qc-payments]', root); if (!S) return; const r = byLine[selLine];
    if (!r) { S.innerHTML = toText(html`<div class="qc-card qc-empty" data-qc-settings-empty><p class="muted small">Click a line to see its Settings and Payments.</p></div>`); P.innerHTML = ''; return; }
    const U = subsOf(r); const cur = U ? U.find((x) => x.id === subSel) || U[0] : null; subSel = cur ? cur.id : null;
    const rs = r.parts && cur ? { ...r, fee: cur.fee } : r;   // a buyer + seller line: Settings work on the chosen part
    S.innerHTML = toText(settingsCard(rs, U, cur)); mountSettings(S, rs);
    $$('[data-qc-sub]', S).forEach((b) => b.addEventListener('click', () => { subSel = b.dataset.qcSub; renderPanels(); }));
    const payFee = cur ? cur.fee : r.fee;
    payState = { line: r.line, recId: payFee ? payFee.id : null, fee: payFee || null, cur: 0,
      list: payFee ? Q.paymentsFor(payFee, { uwSplitPct }) : [{ payee: '', method: Q.defaultMethod(sec, r.line, r.template || ''), label: 'Unclassified' }] };
    renderPayments(P, r);
  }
  const segBtns = (cur, attr, list = ALLOC) => html`${list.filter(([k]) => !(acc.refi && (k === 'seller' || k === 'split'))).map(([k, l]) => html`<button type="button" class="seg-btn ${cur === k ? 'on' : ''}" ${raw(`${attr}="${k}"`)} ${dis(!canEdit)}>${l}</button>`)}`;
  const alloc = (fee) => { const a = Q.allocationOf(fee); const sp = fee.split || {};
    return html`<div class="qc-field" data-qc-alloc><span class="qc-label">Paid By</span><div class="seg qc-seg">${segBtns(a, 'data-qc-alloc-btn')}</div>
      <div class="qc-split qc-inline" data-qc-split ${a === 'split' ? '' : raw('hidden')}><label>Buyer pays <input class="qc-input num" data-qc-split-buyer inputmode="decimal" value="${a === 'split' ? usd(sp.buyer) : ''}" ${dis(!canEdit)}></label><span class="small muted">the seller pays the rest of ${usd(fee.amount)}</span><button type="button" class="ghost small" data-qc-split-save ${dis(!canEdit)}>Save split</button></div></div>`; };
  const timingField = (fee) => html`<div class="qc-field"><span class="qc-label">Paid</span><div class="qc-inline"><select data-qc-timing ${dis(!canEdit)}>${opt('at', 'At closing', fee.timing === 'before' ? 'before' : 'at')}${opt('before', 'Before closing', fee.timing === 'before' ? 'before' : 'at')}</select>
    <label class="check small"><input type="checkbox" data-qc-poc ${fee.poc ? raw('checked') : ''} ${dis(!canEdit)}> POC (paid outside of closing)</label></div></div>`;
  const rate0 = () => (details['loan.rate'] != null && details['loan.rate'] !== '' ? Number(details['loan.rate']) : null);
  const from0 = () => details['dates.disbursement'] || deal.closingDate || null;
  const isPerDiem = (r) => sec === 'F' && ((r.fee && r.fee.meta && r.fee.meta.perDiem) || (r.fee ? /prepaid interest/i.test(r.fee.description) : r.line === '03'));
  function settingsCard(r, U, cur) {
    const fee = r.fee; const T = (Q.TEMPLATES[sec] || {})[r.line]; const x = (fee && fee.meta) || {}; const lockedDesc = sec === 'F' && (['01', '02', '04'].includes(r.line) || isPerDiem(r));
    const headBtns = html`<div class="qc-card-btns"><a class="ghost small btn-like" href="#/deals/${deal.id}/contacts" data-qc-add-contact>Add Contact</a>${canEdit ? html`<button type="button" class="ghost small" data-qc-clear ${dis(!fee && !r.recording)}>Clear</button>` : ''}</div>`;
    let inner = '';
    if (sec === 'E' && r.line === '01') inner = recordingSettings(r);
    else if (sec === 'A' && r.line === '01' && (!fee || /% of Loan Amount \(Points\)$/i.test(fee.description))) {
      const pre = fee && Number(fee.amount) > 0 ? Q.loanPct(fee.amount, loan) : null; const over = x.loanPct != null;
      inner = html`<div class="qc-field"><span class="qc-label">Loan Amount %</span><div class="qc-inline"><input class="qc-input num ${over ? 'qc-over' : pre != null ? 'qc-pre' : ''}" data-qc-loanpct value="${over ? Q.fmtPct(x.loanPct) : Q.fmtPct(pre)}" inputmode="decimal" placeholder="%" ${dis(!canEdit)}> %
        ${over && canEdit ? html`<button type="button" class="linkish" data-qc-loanpct-clear title="Back to the precalculated %">×</button>` : ''}<span class="small muted">of the loan amount ${usd(loan)}${fee && Number(fee.amount) > 0 ? ` = ${usd(fee.amount)}` : ''}</span></div>
        <p class="field-hint small">Precalculated: the sum of A.01 ÷ the loan amount. Whole numbers show no decimals, otherwise 3.</p></div>`;
    } else if (isPerDiem(r)) inner = perDiemSettings(r);
    else if (sec === 'F' && (['01', '02', '04'].includes(r.line) || x.months != null)) inner = html`<div class="qc-field"><span class="qc-label">Description</span><input class="qc-input" value="${fee ? fee.description : T || ''}" disabled title="Locked (Qualia)"></div>
      <div class="qc-field"><span class="qc-label"># of Months</span><div class="qc-inline"><input class="qc-input num qc-mo" data-qc-months value="${x.months ?? ''}" inputmode="numeric" ${dis(!canEdit)}> months</div><p class="field-hint small">Shown on the CD as "${(fee ? fee.description : T) || 'Description'} (${x.months ?? 'n'} mo.)".</p></div>`;
    else if (sec === 'G') inner = html`<p class="small muted">${r.line === '08' ? 'G.08 Aggregate adjustment: type it as a positive amount in At Closing; the CD shows it negative.' : 'Type $ per Month and # of Mo. in the table: the amount is $ per month × months.'}</p>`;
    const common = fee && !r.recording ? html`${lockedDesc ? '' : html`<div class="qc-field"><span class="qc-label">Description</span><input class="qc-input" data-qc-set-desc value="${fee.description}" maxlength="200" ${dis(!canEdit)}></div>`}
      <div class="qc-field"><span class="qc-label">Payee</span><input class="qc-input" data-qc-set-payee value="${fee.payee || ''}" list="qc-payees" maxlength="120" ${dis(!canEdit)}></div>
      ${(sec === 'G' && r.line === '08') || isPerDiem(r) ? '' : html`${alloc(fee)}${timingField(fee)}`}
      ${fee.calc ? html`<p class="small muted" data-qc-calc-note>${fee.overridden ? 'Overridden: changed by hand, so a CLA-rates re-run keeps it.' : `From CLA rates: ${fee.calc.calculation}`}</p>` : ''}`
      : !fee && !r.recording && !(sec === 'E' && r.line === '01') && !isPerDiem(r) ? html`<p class="small muted">Empty line: type a description in the table to start it${T ? ` (template: ${T})` : ''}.</p>` : '';
    const subBar = r.parts && U ? html`<div class="qc-inline qc-subbar"><span class="small muted">One CD line, two ledger fees:</span><div class="seg qc-seg small" data-qc-subs>${U.map((x) => html`<button type="button" class="seg-btn ${cur && x.id === cur.id ? 'on' : ''}" data-qc-sub="${x.id}">${x.label} ${usd(x.fee ? x.fee.amount : 0)}</button>`)}</div></div>` : '';
    return html`<div class="qc-card" data-qc-settings-card="${r.line}"><div class="qc-card-head"><h4>Settings <span class="qc-chip">Line ${r.line}</span></h4>${headBtns}</div>${subBar}${inner}${common}</div>`;
  }
  function recordingSettings(r) {
    const recs = r.recording || [];
    return html`<div class="qc-field"><span class="qc-label">Recording fees</span><table class="qc-rec" data-qc-rec><thead><tr><th>Recording Type</th><th class="num">Amount</th><th>Paid By</th><th></th></tr></thead><tbody>
      ${recs.length ? recs.map((x) => { const f = x.fee || {};
        return html`<tr data-qc-rec-row="${x.id}"><td><select data-qc-rec-type ${dis(!canEdit)}>${Q.REC_TYPES.map((t) => opt(t, t, x.type))}</select></td><td class="num"><input class="qc-input num" data-qc-rec-amt value="${usd(f.amount)}" inputmode="decimal" ${dis(!canEdit)}></td>
          <td><div class="seg qc-seg small">${segBtns(Q.allocationOf(f), 'data-qc-rec-alloc')}</div></td><td>${canEdit ? html`<button type="button" class="ghost small danger" data-qc-rec-remove>Remove</button>` : ''}</td></tr>`; }) : html`<tr><td colspan="4" class="muted small">No recording fees yet.</td></tr>`}</tbody></table>
      ${canEdit ? html`<div class="qc-inline qc-rec-add"><select data-qc-rec-new aria-label="Recording type">${Q.REC_TYPES.map((t) => opt(t, t, recs.some((x) => x.type === 'Deed') ? 'Mortgage' : 'Deed'))}</select><input class="qc-input num" data-qc-rec-new-amt placeholder="0.00" inputmode="decimal" aria-label="Recording amount"><button type="button" class="ghost small" data-qc-rec-add>Add</button></div>` : ''}
      <p class="field-hint small">One CD line: "${r.description || 'Recording fees: Deed: $0.00 Mortgage: $0.00'}". Recordation / transfer taxes are separate lines (E.02+).</p></div>`;
  }
  function perDiemSettings(r) {
    const fee = r.fee; const pd = (fee && fee.meta && fee.meta.perDiem) || {}; const P = Q.prepaidInterest(pd, loan, { from: from0(), rate: rate0() }); const cls = (over, pre) => (over ? 'qc-over' : pre ? 'qc-pre' : '');
    return html`<div class="qc-field"><span class="qc-label">Description</span><input class="qc-input" value="${fee ? fee.description : 'Prepaid Interest'}" disabled title="Locked (Qualia)"></div>
      <div class="qc-field qc-pd" data-qc-perdiem><div class="qc-inline">from <input type="date" class="qc-input ${cls(pd.from && pd.from !== from0(), P.from)}" data-qc-pd="from" value="${P.from || ''}" ${dis(!canEdit)} aria-label="From date"> to <input type="date" class="qc-input ${cls(pd.to && P.from && pd.to !== Q.firstOfNextMonth(P.from), P.to)}" data-qc-pd="to" value="${P.to || ''}" ${dis(!canEdit)} aria-label="To date">
        @ <input class="qc-input num ${cls(P.overridden, P.calcPerDiem != null)}" data-qc-pd="perDiem" value="${P.perDiem ?? ''}" inputmode="decimal" placeholder="per diem" ${dis(!canEdit)} aria-label="Per diem"> /day</div>
        <p class="field-hint small" data-qc-from-help>From Date defaults to the same value as the disbursement date (${from0() ? fmtDate(from0()) : 'not set'}; set it on CD details › Basic Info dates). To Date defaults to the 1st of the next month.</p>
        <div class="qc-inline"><span class="qc-label">Paid By</span><div class="seg qc-seg">${segBtns(pd.paidBy || 'buyer', 'data-qc-pd-paid', [['buyer', 'Buyer'], ['seller', 'Seller']])}</div></div>
        <fieldset class="qc-pd-calc"><legend class="small">Per Diem Calculation</legend><div class="qc-inline">
          <label>Per Diem Decimal Places <input class="qc-input num qc-mo" data-qc-pd="decimals" value="${P.decimals}" inputmode="numeric" ${dis(!canEdit)}></label>
          <label>Loan Amount <input class="qc-input num qc-pre" value="${usd(loan)}" disabled title="From the order"></label>
          <label>Interest Rate <input class="qc-input num ${cls(pd.rate != null && rate0() != null && pd.rate !== rate0(), pd.rate != null || rate0() != null)}" data-qc-pd="rate" value="${P.rate ?? ''}" inputmode="decimal" placeholder="%" ${dis(!canEdit)}></label>
          <label>Days per Year <select data-qc-pd="daysPerYear" ${dis(!canEdit)}>${[360, 365, 366].map((d) => opt(d, d, P.daysPerYear))}</select></label></div></fieldset>
        <p class="small" data-qc-pd-result>${P.calculation}</p>${canEdit ? html`<button type="button" class="m-btn small" data-qc-pd-save>Save prepaid interest</button>` : ''}</div>`;
  }
  function mountSettings(S, r) {
    const fee = r.fee;
    $('[data-qc-clear]', S)?.addEventListener('click', () => clearLine(r));
    const up = (patch, msg) => guard(async () => { await api.updateAccountingFee(fee.id, patch); toast(msg || 'Saved (logged).'); refresh(); })();
    $('[data-qc-set-desc]', S)?.addEventListener('change', (e) => up({ description: e.target.value }));
    $('[data-qc-set-payee]', S)?.addEventListener('change', (e) => up({ payee: e.target.value }));
    $('[data-qc-timing]', S)?.addEventListener('change', (e) => up({ timing: e.target.value, poc: e.target.value === 'before' ? !!fee.poc : false }));
    $('[data-qc-poc]', S)?.addEventListener('change', (e) => up({ poc: e.target.checked, timing: e.target.checked ? 'before' : fee.timing }));
    $$('[data-qc-alloc-btn]', S).forEach((b) => b.addEventListener('click', () => { const k = b.dataset.qcAllocBtn;
      if (k === 'split') { $('[data-qc-split]', S).hidden = false; $$('[data-qc-alloc-btn]', S).forEach((x) => x.classList.toggle('on', x === b)); return; }
      up(Q.allocate(fee.amount, k), `Paid by ${b.textContent} (logged).`); }));
    $('[data-qc-split-save]', S)?.addEventListener('click', guard(async () => { const v = $('[data-qc-split-buyer]', S).value.trim(); up(Q.allocate(fee.amount, 'split', { buyer: v === '' ? null : num(v) }), 'Split saved (logged).'); }));
    // A.01 loan amount %: typing it is a user override (orange) and fills the amount = loan × %
    const lp = $('[data-qc-loanpct]', S);
    if (lp) lp.addEventListener('change', guard(async () => { const v = lp.value.trim(); if (v === '') return; const meta = Q.cleanMeta({ ...((fee && fee.meta) || {}), loanPct: v }); const amount = (Math.round(loan * meta.loanPct) / 100).toFixed(2);
      if (fee) await api.updateAccountingFee(fee.id, { meta, amount, ...(Number(fee.amount) === 0 ? { paidBy: 'buyer', split: null } : {}) });
      else await api.addAccountingFee(deal.id, { ...newFeeInput('A', '01', '% of Loan Amount (Points)'), meta, amount, payee: deal.lenderName || '' });
      toast(`Loan Amount ${Q.fmtPct(meta.loanPct)}% = ${usd(amount)} (logged).`); refresh(); }));
    $('[data-qc-loanpct-clear]', S)?.addEventListener('click', () => { const x = { ...(fee.meta || {}) }; delete x.loanPct; up({ meta: Q.cleanMeta(x) }, 'Back to the precalculated % (logged).'); });
    // F.01 / F.02 / F.04 # of months
    const mo = $('[data-qc-months]', S);
    if (mo) mo.addEventListener('change', guard(async () => { const x = { ...((fee && fee.meta) || {}) }; if (mo.value.trim() === '') delete x.months; else x.months = mo.value.trim(); const meta = Q.cleanMeta(x);
      if (fee) await api.updateAccountingFee(fee.id, { meta }); else await api.addAccountingFee(deal.id, { ...newFeeInput('F', r.line, r.template || 'Prepaid'), meta }); toast('# of months saved (logged).'); refresh(); }));
    // F.03 prepaid interest (per diem)
    const pdBox = $('[data-qc-perdiem]', S);
    if (pdBox) { let paid = ((fee && fee.meta && fee.meta.perDiem) || {}).paidBy || 'buyer';
      const read = () => { const g = (k) => { const el = $(`[data-qc-pd="${k}"]`, pdBox); return el ? el.value.trim() : ''; }; const old = (fee && fee.meta && fee.meta.perDiem) || {};
        const pd = { paidBy: paid, daysPerYear: g('daysPerYear'), decimals: g('decimals') };
        if (g('from')) pd.from = g('from'); if (g('rate') !== '') pd.rate = g('rate');   // saved as shown, so the CD text and the amount always agree
        const base0 = Q.prepaidInterest(Q.cleanMeta({ perDiem: pd }).perDiem, loan, { from: from0(), rate: rate0() });
        if (g('to')) pd.to = g('to');
        if (g('perDiem') !== '' && (old.perDiem != null || Number(g('perDiem')) !== base0.calcPerDiem)) pd.perDiem = g('perDiem');
        const clean = Q.cleanMeta({ perDiem: pd }).perDiem; return { clean, P: Q.prepaidInterest(clean, loan, { from: from0(), rate: rate0() }) }; };
      const show = () => { const o = $('[data-qc-pd-result]', pdBox); try { o.textContent = read().P.calculation; } catch (e) { o.textContent = e.message; } };
      $$('[data-qc-pd]', pdBox).forEach((el) => el.addEventListener('input', show));
      $$('[data-qc-pd-paid]', pdBox).forEach((b) => b.addEventListener('click', () => { paid = b.dataset.qcPdPaid; $$('[data-qc-pd-paid]', pdBox).forEach((x) => x.classList.toggle('on', x === b)); }));
      $('[data-qc-pd-save]', pdBox)?.addEventListener('click', guard(async () => { const { clean, P } = read(); if (P.perDiem == null) throw new Error('Enter the interest rate (or a per diem) first.'); if (!P.from || !P.to) throw new Error('Enter the from and to dates.');
        const meta = { ...((fee && fee.meta) || {}), perDiem: clean }; const patch = { meta, amount: P.amount.toFixed(2), paidBy: clean.paidBy, split: null, timing: 'at', poc: false, payee: fee && fee.payee ? fee.payee : deal.lenderName || '' };
        if (fee) await api.updateAccountingFee(fee.id, patch); else await api.addAccountingFee(deal.id, { ...newFeeInput('F', r.line, 'Prepaid Interest'), ...patch });
        toast(`Prepaid interest ${usd(P.amount)}: ${P.days} day${P.days === 1 ? '' : 's'} × ${P.perDiem} (logged).`); refresh(); })); }
    // E.01 recording rows: each row is its own fee (CLA-rate recording lines included)
    $$('[data-qc-rec-row]', S).forEach((tr) => { const f = ((r.recording || []).find((x) => x.id === tr.dataset.qcRecRow) || {}).fee; if (!f) return;
      const upd = (patch, msg) => guard(async () => { await api.updateAccountingFee(f.id, patch); toast(msg || 'Recording fee saved (logged).'); refresh(); })();
      $('[data-qc-rec-type]', tr)?.addEventListener('change', (e) => upd({ meta: Q.cleanMeta({ ...(f.meta || {}), recType: e.target.value }) }));
      $('[data-qc-rec-amt]', tr)?.addEventListener('change', (e) => { const a = num(e.target.value); const al = Q.allocationOf(f) || 'buyer'; upd({ amount: a.toFixed(2), ...Q.allocate(a, al) }); });
      $$('[data-qc-rec-alloc]', tr).forEach((b) => b.addEventListener('click', () => upd(Q.allocate(f.amount, b.dataset.qcRecAlloc), `Paid by ${b.textContent} (logged).`)));
      $('[data-qc-rec-remove]', tr)?.addEventListener('click', guard(async () => { if (!confirm('Remove this recording fee? It is retired (kept in the edit history).')) return; await api.retireAccountingFee(f.id, true); toast('Recording fee removed (retired, logged).'); refresh(); })); });
    $('[data-qc-rec-add]', S)?.addEventListener('click', guard(async () => { const type = $('[data-qc-rec-new]', S).value; const amount = num($('[data-qc-rec-new-amt]', S).value).toFixed(2);
      const office = (Q.standardPayees(deal).find((p) => p.role === 'Recording office') || {}).name || '';
      await api.addAccountingFee(deal.id, { ...newFeeInput('E', '01', `Recording Fee - ${type}`), altaSection: 'government', amount, payee: office, meta: { recType: type } }); toast(`${type} recording fee added to E.01 (logged).`); refresh(); }));
  }
  // ---- Payments card ----
  function payCard(r) {
    const st = payState; const fee = st.fee; const list = fee ? Q.paymentAmounts(fee, st.list) : st.list; const p = list[st.cur] || list[0] || { method: 'check' }; const ro = !canEdit || !fee;
    const fld = (label, inner, cls = '') => html`<label class="qc-pf ${cls}"><span class="qc-label">${label}</span>${inner}</label>`;
    const inp = (k, v, attrs = '') => html`<input class="qc-input" data-qc-pf="${k}" value="${v ?? ''}" ${raw(attrs)} ${dis(ro)}>`;
    const first3 = html`${p.method === 'aggregate' ? fld('Aggregate Payee', html`<select data-qc-pf="aggregatePayee" ${dis(ro)}>${Q.AGGREGATE_PAYEES.map((a) => opt(a, a, p.aggregatePayee || Q.SETTLEMENT_AGENT))}</select>`) : fld('Name', inp('payee', p.payee, 'list="qc-payees" maxlength="120"'))}
      ${fld('Payment Amount', html`<input class="qc-input num" data-qc-pf="amount" value="${fee ? usd(p.amount) : ''}" ${st.cur === 0 || list.length <= 1 ? raw('disabled title="Locked: the first payee gets the rest of the line amount"') : dis(ro)} inputmode="decimal">`)}
      ${fld('Label', html`<select data-qc-pf="label" ${dis(ro)}>${Q.PAY_LABELS.map((l) => opt(l, l, p.label || 'Unclassified'))}</select>`)}`;
    const memo = fld('Memo', inp('memo', p.memo, 'maxlength="200"'), 'wide');
    let extra = '';
    if (p.method === 'check') extra = html`${memo}<fieldset class="qc-pay-block"><legend>Mailing Address</legend>${fld('Address', inp('street', p.street, 'maxlength="120"'), 'wide')}${fld('Apt / Suite', inp('unit', p.unit, 'maxlength="40"'))}<label class="check small"><input type="checkbox" data-qc-pf="intl" ${p.intl ? raw('checked') : ''} ${dis(ro)}> International?</label></fieldset>`;
    else if (p.method === 'wire') extra = html`${memo}<fieldset class="qc-pay-block" data-qc-wire><legend>Wire Instructions</legend><p class="notice warn small" data-qc-wire-missing>Missing wire instructions. The funding team verifies them through the approved call-back procedure; the test portal never stores bank details.</p>
      ${fld('Routing #', html`<input class="qc-input" disabled placeholder="Not stored in the test portal">`)}${fld('Bank Name', html`<input class="qc-input" disabled placeholder="Not stored in the test portal">`)}${fld('Account #', html`<input class="qc-input" disabled placeholder="Not stored in the test portal">`)}</fieldset>`;
    else if (p.method === 'transfer') extra = html`${memo}<fieldset class="qc-pay-block" data-qc-transfer><legend>Order Transfer</legend>${fld('Order Number', inp('transferOrder', p.transferOrder, 'maxlength="40" placeholder="File #"'))}${fld('For Benefit Of', html`<select data-qc-pf="forBenefitOf" ${dis(ro)}>${Q.FOR_BENEFIT.map(([k, l]) => opt(k, l, p.forBenefitOf || ''))}</select>`)}</fieldset>`;
    else if (p.method === 'holdback') extra = html`${memo}<fieldset class="qc-pay-block" data-qc-holdback><legend>Escrow Information</legend>${fld('Release Note', html`<textarea class="qc-input" data-qc-pf="releaseNote" rows="2" maxlength="300" ${dis(ro)}>${p.releaseNote || ''}</textarea>`, 'wide')}${fld('Release Date', inp('releaseDate', p.releaseDate, 'type="date"'))}</fieldset>`;
    else if (p.method === 'aggregate') extra = html`<p class="small muted wide">Grouped into one disbursement to the aggregate payee (CLA Title &amp; Escrow, or Fidelity National Title Group for the underwriter's portion).</p>`;
    else if (p.method === 'netFunded') extra = html`<p class="small muted wide">The lender nets this from the loan proceeds: no check or wire from escrow.</p>`;
    const U = subsOf(r); const recSwitch = U && U.length > 1 ? html`<div class="seg qc-seg small" data-qc-pay-rec>${U.map((x) => html`<button type="button" class="seg-btn ${x.id === st.recId ? 'on' : ''}" data-qc-pay-rec-btn="${x.id}">${x.label}</button>`)}</div>` : '';
    return html`<div class="qc-card" data-qc-payments-card="${r.line}"><div class="qc-card-head"><h4>Payments <span class="qc-chip" data-qc-pay-chip>${fee ? cdDescription(fee) : 'New Fee'}</span></h4>${list.length > 1 ? html`<a class="linkish small" href="${ctx.base}?v=payments" data-qc-pay-summary>View Payment Summary</a>` : ''}</div>
      ${recSwitch}
      <div class="qc-paytabs" data-qc-paytabs>${list.map((y, i) => html`<button type="button" class="qc-paytab ${i === st.cur ? 'on' : ''}" data-qc-paytab="${i}">${y.payee || (y.method === 'aggregate' && y.aggregatePayee) || 'New Payee'}</button>`)}
        ${ro ? '' : html`<button type="button" class="ghost small qc-sq" data-qc-pay-minus ${dis(list.length <= 1)} aria-label="Remove this payee">&ndash;</button><button type="button" class="ghost small qc-sq" data-qc-pay-plus ${dis(list.length >= 8)} aria-label="Add a payee">+</button>`}</div>
      <div class="qc-methods" data-qc-methods role="radiogroup" aria-label="Payment method">${Q.PAY_METHODS.map(([k, l]) => html`<button type="button" class="qc-method ${p.method === k ? 'on' : ''}" data-qc-method="${k}" role="radio" aria-checked="${p.method === k}" ${dis(ro)}>${l}</button>`)}
        <button type="button" class="linkish small qc-itemize" disabled title="Itemizing one payment into several lines is not in the test portal">Itemize</button></div>
      <div class="qc-payform" data-qc-payform="${p.method}"><div class="qc-pf-grid">${first3}${extra}</div></div>
      ${!fee ? html`<p class="small muted">Type a description on the line first; then choose how it is paid.</p>` : p.defaulted ? html`<p class="small muted" data-qc-pay-default>Section default for ${sec}.${r.line} (not saved on the line yet).</p>` : ''}
      ${!ro ? html`<div class="acct-form-actions"><button type="button" class="m-btn small" data-qc-pay-save>Save payments</button><span class="small muted">Logged with your name and the time.</span></div>` : ''}</div>`;
  }
  function readPayForm(P) { const p = payState.list[payState.cur]; if (!p) return;
    $$('[data-qc-pf]', P).forEach((el) => { const k = el.dataset.qcPf; if (el.disabled) return; if (k === 'intl') p.intl = el.checked; else if (k === 'amount') p.amount = el.value === '' ? '' : num(el.value); else p[k] = el.value; }); }
  function renderPayments(P, r) {
    P.innerHTML = toText(payCard(r)); const st = payState;
    $$('[data-qc-paytab]', P).forEach((b) => b.addEventListener('click', () => { readPayForm(P); st.cur = Number(b.dataset.qcPaytab); renderPayments(P, r); }));
    $$('[data-qc-method]', P).forEach((b) => b.addEventListener('click', () => { readPayForm(P); const p = st.list[st.cur]; p.method = b.dataset.qcMethod; delete p.defaulted;
      if (p.method === 'aggregate' && !p.aggregatePayee) p.aggregatePayee = /fidelity/i.test(p.payee || '') ? 'Fidelity National Title Group' : Q.SETTLEMENT_AGENT; renderPayments(P, r); }));
    $('[data-qc-pay-plus]', P)?.addEventListener('click', () => { readPayForm(P); st.list.push({ payee: '', method: 'check', label: 'Unclassified', amount: 0 }); st.cur = st.list.length - 1; renderPayments(P, r); });
    $('[data-qc-pay-minus]', P)?.addEventListener('click', () => { if (st.list.length <= 1) return; st.list.splice(st.cur, 1); st.cur = Math.max(0, st.cur - 1); renderPayments(P, r); });
    $$('[data-qc-pay-rec-btn]', P).forEach((b) => b.addEventListener('click', () => { subSel = b.dataset.qcPayRecBtn; renderPanels(); }));
    $('[data-qc-pay-save]', P)?.addEventListener('click', guard(async () => { readPayForm(P); const fee = st.fee; if (!fee) throw new Error('Type a description on the line first.');
      const list = st.list.map((p, i) => { const y = { ...p }; delete y.defaulted; if (i === 0 || st.list.length <= 1) delete y.amount; if (y.method !== 'aggregate') delete y.aggregatePayee; if (y.method === 'aggregate' && !y.payee) y.payee = y.aggregatePayee;
        for (const k of Object.keys(y)) if (y[k] === '' || y[k] == null) delete y[k]; return y; });
      if (Q.paymentAmounts(fee, list).some((y) => Number(y.amount) < 0)) throw new Error(`The payees add up to more than the line (${usd(fee.amount)}).`);
      const meta = Q.cleanMeta({ ...(fee.meta || {}), payments: list }); await api.updateAccountingFee(fee.id, { meta }); toast(`Payments saved: ${list.length} payee${list.length === 1 ? '' : 's'} (logged).`); refresh(); }));
  }
  if (selLine) select(selLine); else renderPanels();
}

// ---------------- J: Lender Credits (in Qualia's nav but not opened in the video: a simple list, a guess) ----------------
function lenderCredits(ctx) {
  const { deal, acc, canEdit, api } = ctx; const list = acc.entries.filter((e) => e.lenderCredit && !e.retired);
  const total = list.reduce((t, e) => t + Number(e.amount || 0), 0);
  const body = html`<div class="qc-table-wrap"><table class="qc-table" data-qc-table="J"><thead><tr><th class="qc-num">#</th><th>Description</th><th class="num">Amount</th><th></th></tr></thead><tbody>
      ${list.map((e, i) => html`<tr data-qc-j="${e.id}"><td class="qc-num">${String(i + 1).padStart(2, '0')}</td><td>${e.description}</td><td class="num">${usd(e.amount)}</td><td>${canEdit ? html`<button type="button" class="ghost small" data-qc-j-clear="${e.id}">Clear</button>` : ''}</td></tr>`)}
      ${canEdit ? html`<tr class="is-blank"><td class="qc-num">${String(list.length + 1).padStart(2, '0')}</td><td><input class="qc-cell" data-qc-j-desc placeholder="Lender Credit" maxlength="200" aria-label="Lender credit description"></td><td class="num"><input class="qc-cell num" data-qc-j-amt placeholder="0.00" inputmode="decimal" aria-label="Lender credit amount"></td><td><button type="button" class="ghost small" data-qc-j-add>Add</button></td></tr>` : ''}</tbody>
    <tfoot><tr class="qc-totals"><td></td><td><strong>TOTALS</strong></td><td class="num" data-qc-total="J"><strong>${usd(total)}</strong></td><td></td></tr></tfoot></table></div>
    <p class="small muted">Lender credits reduce the borrower's closing costs (CD J = D + I - lender credits). On the ledger they are credits from the Lender to the Borrower.</p>`;
  return { body, mount: (root, refresh) => {
    $('[data-qc-j-add]', root)?.addEventListener('click', guard(async () => { const d = $('[data-qc-j-desc]', root).value.trim() || 'Lender Credit'; const a = $('[data-qc-j-amt]', root).value;
      await api.addAccountingFee(deal.id, { kind: 'credit', description: d, amount: a, from: 'lender', to: 'buyer', lenderCredit: true, altaSection: 'loanCharges', cdSection: '' }); toast('Lender credit added (logged).'); refresh(); }));
    $$('[data-qc-j-clear]', root).forEach((b) => b.addEventListener('click', guard(async () => { if (!confirm('Clear this lender credit? It is retired (kept in the edit history).')) return; await api.retireAccountingFee(b.dataset.qcJClear, true); toast('Lender credit cleared (logged).'); refresh(); }))); } };
}

// ---------------- K/M and L/N: Debits / Credits side by side, linked lines ----------------
const SIDE_TITLE = { K: 'K. Due from Borrower at Closing', L: 'L. Paid Already by or on Behalf of Borrower at Closing', M: 'M. Due to Seller at Closing', N: 'N. Due from Seller at Closing' };
function summaries(ctx, sides) {
  const { deal, acc, cd, canEdit, base, api } = ctx; const S = Q.summaryScreens(deal, cd, acc.entries); const refi = S.refi;
  const col = (side) => { const rows = S[side] || [];
    if (refi && (side === 'M' || side === 'N')) return html`<div class="qc-sum-col" data-qc-side="${side}"><h4>${SIDE_TITLE[side]}</h4><p class="muted small">A refinance has no seller side.</p></div>`;
    return html`<div class="qc-sum-col" data-qc-side="${side}"><h4>${SIDE_TITLE[side]}</h4><table class="qc-table qc-sum"><thead><tr><th class="qc-num">#</th><th>Statement Text</th><th class="num">Amount</th><th class="qc-link-col"></th></tr></thead><tbody>
      ${rows.map((r) => { const e = r.entry; const auto = !!(r.auto || r.j || (e && e.auto)); const editable = canEdit && e && !auto && !e.proration; const blankEdit = canEdit && !e && !r.j;
        return html`${r.header ? html`<tr class="qc-sum-head"><td></td><td colspan="3">${r.header}</td></tr>` : ''}<tr data-qc-sum-row="${side}${r.line}" ${e ? raw(`data-qc-fee="${e.id}"`) : ''} class="${e || r.j ? 'has-fee' : 'is-blank'}">
          <td class="qc-num">${r.line}</td>
          <td>${blankEdit ? html`<input class="qc-cell" data-qc-sum-text value="${r.text || ''}" maxlength="200" aria-label="${side}.${r.line} statement text">` : html`<span>${e ? r.label : r.text || ''}</span>`}${e && e.proration ? html` <a class="pill acct-calc-pill qc-mini" href="${base}?v=prorations" data-qc-sum-proration>Proration</a>` : ''}${e && e.auto ? html` <span class="pill qc-mini">From the order</span>` : ''}${r.j ? html` <span class="pill qc-mini">From the fee pages</span>` : ''}</td>
          <td class="num ${auto || (e && e.proration) ? 'qc-pre' : ''}">${editable ? html`<input class="qc-cell num" data-qc-sum-amt value="${usd(r.amount)}" inputmode="decimal" aria-label="${side}.${r.line} amount">` : blankEdit ? html`<input class="qc-cell num" data-qc-sum-new inputmode="decimal" aria-label="${side}.${r.line} amount">` : html`<span>${r.amount ? usd(r.amount) : ''}</span>`}</td>
          <td class="qc-link-col">${r.linked ? html`<span class="qc-link" title="Linked to ${r.linked.slice(0, 1)}.${r.linked.slice(1)}" data-qc-linked="${r.linked}">⇄ ${r.linked.slice(0, 1)}.${r.linked.slice(1)}</span>` : ''}${editable ? html` <button type="button" class="linkish small" data-qc-sum-clear="${e.id}" title="Clear (retire)">Clear</button>` : ''}</td></tr>`; })}</tbody>
      <tfoot><tr class="qc-totals"><td></td><td><strong>TOTAL</strong></td><td class="num" data-qc-total="${side}"><strong>${usd(S.totals[side])}</strong></td><td></td></tr></tfoot></table></div>`; };
  const body = html`<div class="qc-summary" data-qc-summary="${sides.join('')}">${sides.map(col)}</div>
    <p class="small muted">Linked lines (⇄) are one entry shown on both sides (e.g. a seller credit is L.05 for the borrower and N.08 for the seller). Prorations are calculated on <a href="${base}?v=prorations">Taxes &amp; Prorations</a>; sale price, deposit and loan amount come from the order.</p>`;
  return { body, mount: (root, refresh) => {
    $$('[data-qc-sum-new]', root).forEach((inp) => inp.addEventListener('change', guard(async () => { if (inp.value.trim() === '') return; const tr = inp.closest('[data-qc-sum-row]'); const k = tr.dataset.qcSumRow; const side = k[0], line = k.slice(1);
      const text = ($('[data-qc-sum-text]', tr) || {}).value || ''; await api.addAccountingFee(deal.id, Q.summaryInput(side, line, text, inp.value, deal)); toast(`${side}.${line} added (logged).`); refresh(); })));
    $$('[data-qc-sum-amt]', root).forEach((inp) => inp.addEventListener('change', guard(async () => { const id = inp.closest('[data-qc-fee]').dataset.qcFee; const e = acc.entries.find((x) => x.id === id);
      const a = num(inp.value).toFixed(2); await api.updateAccountingFee(id, e.kind === 'charge' ? { amount: a, paidBy: 'seller', split: null } : { amount: a }); toast('Saved (logged).'); refresh(); })));
    $$('[data-qc-sum-clear]', root).forEach((b) => b.addEventListener('click', guard(async () => { if (!confirm('Clear this line? It is retired (kept in the edit history); its linked line goes with it.')) return; await api.retireAccountingFee(b.dataset.qcSumClear, true); toast('Cleared (retired, logged).'); refresh(); })));
    $$('input', root).forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); i.blur(); } })); } };
}

// ---------------- Payment summary (Qualia "View Payment Summary") ----------------
export async function paymentSummaryView(api, deal, acc, base) {
  const uw = api.listUnderwriterSplits ? await api.listUnderwriterSplits().then((r) => splitFor(r.rows, deal.state), () => null) : null;
  const P = Q.paymentSummary(acc.entries, { uwSplitPct: uw && uw.pct != null ? Number(uw.pct) : null });
  const body = html`<div class="qc-wrap" data-qc-page="payments"><div class="qc-main"><div class="qc-page-head"><h3>Payment Summary</h3></div>
    <div class="qc-mtiles" data-qc-pay-totals>${P.byMethod.map((m) => html`<div class="qc-card qc-mtile" data-qc-pay-method="${m.method}"><div class="qc-mtile-big">${usd(m.total)}</div><div class="small">${m.label} · ${m.count}</div></div>`)}</div>
    ${P.wires ? html`<p class="notice warn small" data-qc-pay-wires>${P.wires} wire payment${P.wires === 1 ? '' : 's'}: wire instructions are verified by the funding team (call-back procedure) and are never stored in the test portal.</p>` : ''}
    ${P.missingPayee ? html`<p class="notice warn small" data-qc-pay-missing>${P.missingPayee} payment${P.missingPayee === 1 ? ' has' : 's have'} no payee yet.</p>` : ''}
    <div class="qc-table-wrap"><table class="qc-table" data-qc-pay-table><thead><tr><th>Line</th><th>Description</th><th>Payee</th><th>Method</th><th>Label</th><th class="num">Amount</th></tr></thead><tbody>
      ${P.rows.length ? P.rows.map((r) => html`<tr data-qc-pay-row="${r.feeId}" data-qc-pay-m="${r.method}"><td class="qc-num">${/^[A-H]\.\d\d$/.test(r.line) ? html`<a href="${sectionHref(base, r.line[0], r.line.slice(2))}">${r.line}</a>` : r.line}</td><td>${r.description}</td><td>${r.payee}</td><td>${Q.payLabel(r.method)}${r.defaulted ? html` <span class="pill qc-mini">default</span>` : ''}${r.holdback ? html`<div class="small muted" data-qc-pay-release>Release: ${r.holdback.releaseDate ? fmtDate(r.holdback.releaseDate) : 'date not set'}${r.holdback.releaseNote ? ' · ' + r.holdback.releaseNote : ''}</div>` : ''}</td><td>${r.label}</td><td class="num">${usd(r.amount)}</td></tr>`) : html`<tr><td colspan="6" class="muted">No charges yet.</td></tr>`}</tbody>
      <tfoot><tr class="qc-totals"><td colspan="5"><strong>TOTAL</strong></td><td class="num" data-qc-pay-total><strong>${usd(P.total)}</strong></td></tr></tfoot></table></div>
    <p class="small muted">Every charge's payees and how each is paid (Check, Wire, Net Funded, Aggregate, Transfer, Holdback). "default" = the section default, not saved on the line yet. Nothing is sent or paid from the test portal.</p></div>${helpRail('H')}</div>`;
  return { body };
}
