// ACCOUNTING tab (John, Nov 3: "an accounting tab that will allow fees to be added to an ALTA and CD"). CLA staff only, behind the `accounting`
// feature flag (app.js never loads this module when it is off). ONE fee ledger feeds the ALTA Settlement Statement and the Closing Disclosure fee
// view. Processor / Admin / Super admin edit; Sales Person / Sales Team read only. TEST ONLY: "TEST - not a legal disclosure" on every page and print.
import { html, raw, $, $$, guard, formData, toast, toText, fmtDate, fmtDateTime } from '../ui.js?v=202611100245';
import { themeOn } from '../theme.js?v=202611100245';
import { modOn } from '../data/modules.js?v=202611100700';
import { isTitlePremium, splitAmount, splitFor, UNSET_NOTE } from '../data/underwriter.js?v=202611100700';
import { prorationsView } from './dealaccounting-prorations.js?v=202611100700';   // Caroline Kim, Nov 4 2026: prorations from the settlement date
import { cdPagesView, cdDetailsView } from './dealaccounting-cd.js?v=202611100700'; // Caroline, Nov 4: CD pages 1-5, CD details, prepaids F + escrow G
import { render as postClosingRender } from './dealpostclosing.js?v=202611100700';
import { payoffsView, taxesView, otherContactsView } from './dealpayoffs.js?v=202611100700';   // John, Nov 4 2026: Qualia payoffs / HOA / FFB / ground rent   // John, Nov 4 2026: Qualia's Closing › Charges workflow
import { ALTA_SECTIONS, CD_SECTIONS, CD_FEE_SECTIONS, PAYERS, FROM_KEYS, FROM_LABEL, TO_KEYS, PRESET_STATES, TEST_MARK, CALC_TAG, altaLabel, cdLabel, DEFAULT_CD, cdDescription, acctCanRead } from '../data/accounting.js?v=202611100100';
import { canReachPayoffs, PAYOFF_VIEWS } from '../data/locked-links.js?v=202611100700';
import { qcNav, chargesView, paymentSummaryView } from './dealaccounting-charges.js?v=202611100700';   // John, Nov 4 2026: Qualia's Closing › Charges workflow
import { contractView } from './dealaccounting-contract.js?v=202611100700';

const VIEWS = [['contract', 'Contract figures'], ['postclosing', 'Post-Closing'], ['payoffs', 'Payoffs'], ['taxes', 'Taxes & Prorations'], ['othercontacts', 'Other Contacts'], ['charges', 'Charges'], ['payments', 'Payment summary'], ['ledger', 'Fee ledger'], ['prorations', 'Prorations'], ['alta', 'ALTA Settlement Statement'], ['cd', 'Closing Disclosure'], ['cddetails', 'CD details & escrow'], ['history', 'Edit history']];
// negative amounts (the escrow aggregate adjustment) show as -$x.xx
const m2 = (n) => (n == null || Number(n) === 0 ? '' : (Number(n) < 0 ? '-' : '') + '$' + Math.abs(Number(n)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const m2z = (n) => (Number(n) < 0 ? '-' : '') + '$' + Math.abs(Number(n || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const READ_ONLY_NOTE = 'Read only for your role (Sales Person, Sales Team, Transaction Coordinator): you can read the ledger, prorations and statements; only a Processor, Admin or Super admin can add or change them.';
const opt = (v, l, sel) => html`<option value="${v}" ${String(v) === String(sel ?? '') ? raw('selected') : ''}>${l}</option>`;
const names = (deal, role) => deal.participants.filter((p) => p.role === role && p.contact).map((p) => (p.entity && p.entity.name) || `${p.contact.firstName} ${p.contact.lastName}`).join(', ');

export async function render({ api, deal, user }) {
  if (!(api.features || {}).accounting || !modOn('accounting')) throw new Error('That page does not exist.');   // config flag off, or not Live (beta) for this user
  if (!acctCanRead(user) || user.accountRole) throw new Error('Accounting is for CLA staff only.');
  const q = new URLSearchParams(location.hash.split('?')[1] || ''); const view = VIEWS.some(([k]) => k === q.get('v')) ? q.get('v') : q.get('calc') === '1' || q.get('retired') === '1' ? 'ledger' : 'contract';
  if (PAYOFF_VIEWS.includes(view) && !canReachPayoffs(user)) throw new Error('That section is not available for your account.');   // live28: same rule as the route guard
  const showRetired = q.get('retired') === '1'; const base = `#/deals/${deal.id}/accounting`;
  const acc = await api.getAccounting(deal.id, { includeRetired: showRetired });
  const T = acc.totals; const B = acc.refi ? 'Borrower' : 'Buyer / borrower';
  const nav = qcNav(deal, view, q.get('s') || 'A', base, canReachPayoffs(user));   // live28: Payoffs / Taxes / Other Contacts links for Processors + admins only   // Qualia-style left nav: General · Closing › Charges A-N · Preview · CLA tools
  const noLines = !acc.entries.length;
  const head = html`<div class="acct-head acct-noprint"><div><p class="eyebrow">Accounting</p><h2 class="page-title">Contract figures</h2>
      <p class="muted small">TEST contract figures are estimates. They are not funds received, not a payoff, and not a Closing Disclosure. The fee ledger is a separate worksheet and does not copy the order price, deposit, or loan.</p></div>
    <div class="acct-head-side"><span class="pill warn" data-test-mark>${TEST_MARK}</span>${acc.canEdit ? '' : html`<span class="pill" data-acct-readonly>Read only</span>`}</div></div>`;
  // summary tiles: the classic stat cards, or (card theme, the default look) Loan-Summary style cards: grey card, white inset head with one big baby-blue value.
  // Same data-* hooks either way (data-acct-totals, data-due-buyer, data-due-seller, data-balance, data-balance-diff).
  const tc = themeOn();
  const tile = (label, value, sub, attrs = '', cls = '', valCls = '') => (tc
    ? html`<div class="tc-card acct-tile ${cls}"${raw(attrs)}><div class="tc-head"><div class="tc-big acct-tile-big ${valCls}">${value}</div><div class="tc-sub">${label}</div></div><div class="acct-tile-foot">${sub}</div></div>`
    : html`<div class="stat-card ${cls}"${raw(attrs)}><div class="stat-label">${label}</div><div class="stat-value ${valCls}">${value}</div><div class="stat-sub">${sub}</div></div>`);
  const val = (hook, v) => html`<span ${raw(hook)}>${v}</span>`;
  const balance = noLines
    ? html`<p class="notice info acct-noprint" data-acct-totals data-balance="none">No verified ledger lines. Contract figures are not posted here, and a blank is not zero.</p>`
    : html`<div class="${tc ? 'acct-tiles' : 'stat-row acct-stats'} acct-noprint" data-acct-totals>
      ${tile(`${B} ${T.dueToBuyer > 0 ? 'refund' : 'due at closing'}`, val('data-due-buyer', m2z(T.dueToBuyer > 0 ? T.dueToBuyer : T.dueFromBuyer)), html`Debits ${m2z(T.buyerDebits)} &middot; credits ${m2z(T.buyerCredits)}`)}
      ${acc.refi ? '' : tile(`Seller ${T.dueFromSeller > 0 ? 'owes at closing' : 'proceeds'}`, val('data-due-seller', m2z(T.dueFromSeller > 0 ? T.dueFromSeller : T.dueToSeller)), html`Debits ${m2z(T.sellerDebits)} &middot; credits ${m2z(T.sellerCredits)}`)}
      ${tile('Paid by others / outside closing', m2z(T.paidByLender + T.paidByOther), html`POC / before closing ${m2z(T.paidOutsideClosing)}`)}
      ${tile('Balance check', T.balanced ? 'Balanced' : 'OUT OF BALANCE', html`Funds in ${m2z(T.receipts)} &middot; out ${m2z(T.disbursements)}${T.balanced ? '' : html` &middot; difference <strong data-balance-diff>${m2z(Math.abs(T.difference))}</strong>`}`,
        ` data-balance="${T.balanced ? 'ok' : 'out'}"`, `acct-balance ${T.balanced ? 'is-ok' : 'is-bad'}`, T.balanced ? '' : 'bad')}</div>
    ${T.issues.length ? html`<div class="notice warn acct-noprint" data-balance-issues><strong>Out of balance.</strong><ul>${T.issues.map((i) => html`<li>${i}</li>`)}</ul></div>` : ''}
    ${(T.warnings || []).length ? html`<div class="notice info acct-noprint" data-acct-warnings><ul>${T.warnings.map((i) => html`<li>${i}</li>`)}</ul></div>` : ''}`;
  let v;
  if (view === 'contract') v = await contractView(api, deal);
  else if (view === 'postclosing') v = await postClosingRender({ api, deal, user, refresh: () => location.reload() });
  else if (view === 'charges') v = await chargesView(api, deal, acc, q, base);
  else if (view === 'payoffs') v = await payoffsView(api, deal, acc, q, base, user);
  else if (view === 'taxes') v = await taxesView(api, deal, acc, q, base);
  else if (view === 'othercontacts') v = await otherContactsView(api, deal, acc, q, base);
  else if (view === 'payments') v = await paymentSummaryView(api, deal, acc, base);
  else if (view === 'alta') v = await altaView(api, deal, acc, q, base);
  else if (view === 'cd') v = viewerChrome(await cdPagesView(api, deal, acc, docHead, printBtn, mountPrint), base);
  else if (view === 'cddetails') v = await cdDetailsView(api, deal, acc);
  else if (view === 'prorations') v = await prorationsView(api, deal, acc, base);
  else if (view === 'history') v = await historyView(api, deal);
  else v = await ledgerView(api, deal, acc, showRetired, base);
  return { title: 'Accounting', crumbs: [['Accounting']], body: html`<section class="acct qc-shell-wrap" data-accounting data-acct-view="${view}">${head}${view === 'postclosing' ? html`<nav class="tt-tabs"><a href="${base}" class="active">Accounting</a><a href="${base}?v=postclosing" class="active">Post-Closing Scanbacks &amp; E-Recording</a></nav>` : ''}<div class="qc-shell">${nav}<div class="qc-body">${view === 'postclosing' ? '' : view === 'ledger' || view === 'prorations' ? balance : ''}${v.body}</div></div></section>`, mount: v.mount || (() => {}) };
}

// ---------------- ledger + add / edit form ----------------
async function ledgerView(api, deal, acc, showRetired, base) {
  // John, Nov 3 call: the state's underwriter split, shown on title premium lines (CLA portion vs underwriter portion)
  const uw = api.listUnderwriterSplits ? await api.listUnderwriterSplits().then((r) => splitFor(r.rows, deal.state), () => 'hidden') : null;   // TCs: no underwriter split (Caroline, Nov 4: TCs read-only)
  const presets = acc.canEdit ? await api.listAccountingPresets(deal.id) : [];
  const groups = [['CLA rates for this order', presets.filter((p) => p.calculated)], ...PRESET_STATES.filter(([k]) => k === 'ALL' || k === deal.state).map(([k, l]) => [l, presets.filter((p) => !p.calculated && p.state === k)])].filter(([, l]) => l.length);
  const bySec = ALTA_SECTIONS.map(([k, l]) => [k, l, acc.entries.filter((e) => e.altaSection === k)]).filter(([, , l]) => l.length);
  const who = (e) => { if (e.kind === 'credit') return html`<span class="small acct-flow">${FROM_LABEL[e.from]} &rarr; ${e.to === 'buyer' ? (acc.refi ? 'Borrower' : 'Buyer') : 'Seller'}</span>`; return ''; };
  const cell = (n) => html`<td class="num">${m2(n)}</td>`;
  const row = (e) => { const sp = e.split || {}; const cr = e.kind === 'credit';
    const bD = cr ? (e.from === 'buyer' ? e.amount : 0) : (e.reduces ? -1 : 1) * (sp.buyer || 0); const bC = cr && e.to === 'buyer' ? e.amount : 0; const sD = cr ? (e.from === 'seller' ? e.amount : 0) : sp.seller; const sC = cr && e.to === 'seller' ? e.amount : 0;
    return html`<tr data-fee-row="${e.id}" class="${e.retired ? 'is-done acct-retired' : ''} ${e.auto ? 'acct-auto' : ''}">
      <td><strong>${e.kind === 'charge' ? cdDescription(e) : e.description}</strong>${e.auto ? html` <span class="pill" data-auto>From the order</span>` : ''}${calcTags(e)}${e.retired ? html` <span class="pill warn">Retired</span>` : ''}${e.proration ? html` <a class="pill acct-calc-pill" data-proration-pill href="#/deals/${deal.id}/accounting?v=prorations">Proration${e.prorationStale ? ' · date changed' : ''}</a>` : ''}${e.lenderCredit ? html` <span class="pill acct-calc-pill" data-lender-credit>Lender credit · CD J</span>` : ''}${e.reduces ? html` <span class="pill" data-reduces>Aggregate adjustment</span>` : ''}${String(e.presetKey || '').startsWith('cdcalc:') ? html` <span class="pill acct-calc-pill" data-cdcalc-tag>Prepaids / escrow calculator</span>` : ''}
        ${e.poc ? html` <span class="pill" data-poc>POC</span>` : e.timing === 'before' ? html` <span class="pill">Before closing</span>` : ''}
        ${e.auto ? '' : e.calc ? calcDetail(e) : html`<div class="small muted">${e.payee ? `to ${e.payee}` : ''}${e.payee && e.note ? ' · ' : ''}${e.note || ''}</div>`}${who(e)}${uwSplit(e, uw, deal.state)}</td>
      <td class="small">${e.cdSection ? html`<span title="${cdLabel(e.cdSection)}">${e.cdSection}${e.cdLine ? '.' + e.cdLine : ''}</span>` : html`<span class="muted">&mdash;</span>`}</td>
      <td class="num"><strong>${m2z(e.reduces ? -e.amount : e.amount)}</strong></td>${cell(bD)}${cell(bC)}${acc.refi ? '' : html`${cell(sD)}${cell(sC)}`}${cell(cr ? 0 : (Number(sp.lender) || 0) + (Number(sp.other) || 0))}
      <td class="nowrap acct-noprint">${acc.canEdit && !e.auto ? (e.proration && !e.retired ? html`<a class="ghost small" href="#/deals/${deal.id}/accounting?v=prorations" data-edit-in-prorations>Edit in Prorations</a> <button class="ghost small danger" type="button" data-retire="${e.id}">Retire</button>` : e.retired ? html`<button class="ghost small" type="button" data-restore="${e.id}">Restore</button>` : html`<button class="ghost small" type="button" data-edit-fee="${e.id}">Edit</button> <button class="ghost small danger" type="button" data-retire="${e.id}">Retire</button>`) : ''}</td></tr>`; };
  const cols = acc.refi ? 7 : 9;
  const table = html`<table class="tbl acct-ledger" data-ledger><thead><tr><th>Description</th><th>CD</th><th class="num">Amount</th><th class="num">${acc.refi ? 'Borrower' : 'Buyer'} debit</th><th class="num">${acc.refi ? 'Borrower' : 'Buyer'} credit</th>${acc.refi ? '' : html`<th class="num">Seller debit</th><th class="num">Seller credit</th>`}<th class="num">Lender / other</th><th class="acct-noprint"></th></tr></thead>
    <tbody>${bySec.length ? bySec.map(([k, l, list]) => html`<tr class="acct-sec" data-sec="${k}"><th colspan="${cols}">${l}</th></tr>${list.map(row)}`) : html`<tr><td colspan="${cols}" class="muted">No fees yet.</td></tr>`}
      <tr class="acct-total" data-running-totals><td><strong>Totals (at closing)</strong></td><td></td><td></td><td class="num">${m2z(acc.totals.buyerDebits)}</td><td class="num">${m2z(acc.totals.buyerCredits)}</td>${acc.refi ? '' : html`<td class="num">${m2z(acc.totals.sellerDebits)}</td><td class="num">${m2z(acc.totals.sellerCredits)}</td>`}<td class="num">${m2z(acc.totals.paidByLender + acc.totals.paidByOther)}</td><td class="acct-noprint"></td></tr></tbody></table>`;
  const form = acc.canEdit ? feeForm(acc, groups) : html`<p class="notice info" data-readonly-note>${READ_ONLY_NOTE}</p>`;
  const nCalc = acc.entries.filter((e) => e.calc && !e.retired); const nOver = nCalc.filter((e) => e.overridden).length;
  const calcCard = acc.canEdit ? html`<div class="card acct-calc acct-noprint" data-calc-card><div class="acct-card-head"><h3>CLA rates</h3><span class="muted small" data-calc-status>${nCalc.length ? `${nCalc.length} line${nCalc.length === 1 ? '' : 's'} from CLA rates${nOver ? ` · ${nOver} overridden` : ''}` : 'No fees from CLA rates yet'}</span></div>
      <p class="small muted">Title premiums, endorsements, CLA settlement fees, recording fees and transfer / recordation taxes from the CLA quote calculator's rates for this order. You see a preview first; nothing changes until you apply. Lines you changed by hand are kept.</p>
      <button class="m-btn" type="button" data-calc-open>Calculate fees from CLA rates</button><div class="acct-calc-panel" data-calc-panel hidden></div></div>` : '';
  const body = html`<div class="acct-grid">${calcCard}${form}
    <div class="card acct-ledger-card"><div class="acct-card-head"><h3>Fee ledger</h3><a class="linkish acct-noprint" data-toggle-retired href="${base}?v=ledger${showRetired ? '' : '&retired=1'}">${showRetired ? 'Hide retired' : `Show retired (${acc.retiredCount})`}</a></div>${table}
      <p class="muted small">Fees are never deleted: retire one to take it off the statements (the edit history keeps every change). POC = paid outside of closing: shown on the ALTA as a memo, in the Before Closing column on the CD.</p></div></div>`;
  return { body, mount: (root, c = {}) => { mountCalc(root, api, deal, acc, c.refresh); mountLedger(root, api, deal, acc, c.refresh); } };
}

function feeForm(acc, groups) {
  const payers = PAYERS.filter(([k]) => !(acc.refi && k === 'seller'));
  return html`<form class="card acct-form" id="acct-fee-form" data-fee-form novalidate><div class="acct-card-head"><h3 data-form-title>Add a fee</h3><button type="button" class="linkish" data-cancel-edit hidden>Cancel edit</button></div>
    <div class="acct-preset"><label>Start from a preset
      <select data-preset aria-label="Fee preset"><option value="">Choose a common fee&hellip;</option>${groups.map(([l, list]) => html`<optgroup label="${l}">${list.map((p) => html`<option value="${p.key}" ${p.calculated ? raw('data-calculated') : ''}>${p.label}${p.exampleAmount ? (p.calculated ? ` (${m2z(p.exampleAmount)})` : ` (EXAMPLE ${m2z(p.exampleAmount)})`) : ''}</option>`)}</optgroup>`)}</select></label>
      <p class="field-hint">"CLA rates for this order" fills the form from the CLA quote calculator's rates (saved tagged ${CALC_TAG}). The other presets are <strong>EXAMPLE</strong> amounts only (never a real rate): check and replace before using.</p></div>
    <input type="hidden" name="presetKey"><input type="hidden" name="editId">
    <div class="form-grid">
      <label>Type<select name="kind" data-kind><option value="charge">Charge (a fee someone pays)</option><option value="credit">Credit / adjustment / proration</option></select></label>
      <label>Amount *<input name="amount" inputmode="decimal" placeholder="0.00" autocomplete="off"></label>
      <label class="wide">Description *<input name="description" maxlength="200" autocomplete="off"></label>
      <label>ALTA section<select name="altaSection" data-alta>${ALTA_SECTIONS.map(([k, l]) => opt(k, l, 'title'))}</select></label>
      <label>CD section<select name="cdSection" data-cd>${CD_SECTIONS.map(([k, l]) => opt(k, k ? `${k}. ${l}` : l, 'C'))}</select></label>
      <label>CD line <span class="muted">(optional, 01-99)</span><input name="cdLine" maxlength="2" inputmode="numeric" placeholder="auto"></label>
      <label>Payee<input name="payee" maxlength="120" autocomplete="off"></label>
      <div class="span2 acct-charge-only" data-charge-only><div class="form-grid">
        <label>Paid by<select name="paidBy" data-paidby>${payers.map(([k, l]) => opt(k, l, 'buyer'))}${opt('split', 'Split between payers', '')}</select></label>
        <label>Paid<select name="timing"><option value="at">At closing</option><option value="before">Before closing</option></select></label>
        <div class="span2 acct-split" data-split hidden><span class="small muted">Split amounts (they should add up to the amount)</span><div class="acct-split-grid">
          ${payers.map(([k, l]) => html`<label>${l}<input name="split_${k}" inputmode="decimal" placeholder="0.00"></label>`)}</div><p class="small" data-split-left></p></div>
        <label class="check"><input type="checkbox" name="poc" value="1"> POC (paid outside of closing)</label>
        <label class="check" data-title-prefix-wrap><input type="checkbox" name="titlePrefix" value="1"> Show as "Title - &hellip;" on the CD</label></div></div>
      <div class="span2 acct-credit-only" data-credit-only hidden><div class="form-grid">
        <label>Credit from<select name="from">${FROM_KEYS.filter((k) => !(acc.refi && k === 'seller')).map((k) => opt(k, FROM_LABEL[k], 'seller'))}</select></label>
        <label>Credit to<select name="to">${TO_KEYS.filter((k) => !(acc.refi && k === 'seller')).map((k) => opt(k, k === 'buyer' ? (acc.refi ? 'Borrower' : 'Buyer / borrower') : 'Seller', 'buyer'))}</select></label>
        <label class="check span2" data-lender-credit-wrap><input type="checkbox" name="lenderCredit" value="1"> Lender credit (lender pays toward the borrower's closing costs: CD section J "Lender Credits")</label>
        ${acc.refi ? '' : html`<p class="span2 small muted" data-proration-help>Taxes, HOA dues and other prorations are <a href="#/deals/${acc.dealId}/accounting?v=prorations" data-goto-prorations>calculated on the Prorations tab</a> from the settlement date. A hand-entered adjustment: <button type="button" class="linkish" data-prorate="advance">seller paid in advance</button> (buyer pays seller back) or <button type="button" class="linkish" data-prorate="unpaid">unpaid by seller</button> (seller credits the buyer).</p>`}</div></div>
      <label class="span2">Note<textarea name="note" rows="2" maxlength="1000"></textarea></label>
    </div>
    <p class="err-text small" data-form-err></p>
    <div class="acct-form-actions"><button class="m-btn" type="submit" data-save-fee>Add fee</button><span class="muted small">Logged with your name and the time.</span></div></form>`;
}

function mountLedger(root, api, deal, acc, refresh) {
  const go = () => (refresh ? refresh() : location.reload());
  $$('[data-retire]', root).forEach((b) => b.addEventListener('click', guard(async () => { if (!confirm('Retire this fee? It comes off the ALTA and CD; it is kept in the history and can be restored.')) return; await api.retireAccountingFee(b.dataset.retire, true); toast('Fee retired (kept in the history).'); go(); })));
  $$('[data-restore]', root).forEach((b) => b.addEventListener('click', guard(async () => { await api.retireAccountingFee(b.dataset.restore, false); toast('Fee restored.'); go(); })));
  const f = $('#acct-fee-form', root); if (!f) return;
  const el = (n) => f.elements[n];
  const sync = () => { const credit = el('kind').value === 'credit'; $('[data-charge-only]', f).hidden = credit; $('[data-credit-only]', f).hidden = !credit;
    $('[data-split]', f).hidden = credit || el('paidBy').value !== 'split'; $('[data-title-prefix-wrap]', f).hidden = credit || el('altaSection').value !== 'title'; if ($('[data-title-prefix-wrap]', f).hidden) el('titlePrefix').checked = false;
    if (el('poc').checked) el('timing').value = 'before'; el('timing').disabled = el('poc').checked; left(); };
  const left = () => { const p = $('[data-split-left]', f); if (!p || $('[data-split]', f).hidden) return; const amt = Number(String(el('amount').value).replace(/[$,]/g, '')) || 0;
    const sum = PAYERS.filter(([k]) => el('split_' + k)).reduce((t, [k]) => t + (Number(String(el('split_' + k).value).replace(/[$,]/g, '')) || 0), 0); const d = Math.round((amt - sum) * 100) / 100;
    p.textContent = d === 0 ? 'Split adds up to the amount.' : d > 0 ? `${m2z(d)} not assigned yet (the ledger will show out of balance).` : `Split is ${m2z(-d)} more than the amount.`; p.className = 'small ' + (d === 0 ? 'ok-text' : 'warn-text'); };
  el('altaSection').addEventListener('change', () => { const k = el('altaSection').value; el('cdSection').value = el('kind').value === 'credit' ? '' : DEFAULT_CD[k] ?? ''; if (k === 'prorations' && el('kind').value !== 'credit') { el('kind').value = 'credit'; el('cdSection').value = ''; } sync(); });
  el('kind').addEventListener('change', () => { if (el('kind').value === 'credit') { el('cdSection').value = ''; if (!['prorations', 'financial', 'misc'].includes(el('altaSection').value)) el('altaSection').value = 'prorations'; } else { el('cdSection').value = DEFAULT_CD[el('altaSection').value] ?? ''; } sync(); });
  ['paidBy', 'poc', 'amount'].forEach((n) => el(n).addEventListener(n === 'amount' ? 'input' : 'change', sync)); $$('[data-split] input', f).forEach((i) => i.addEventListener('input', left));
  $$('[data-prorate]', f).forEach((b) => b.addEventListener('click', () => { el('altaSection').value = 'prorations'; el('cdSection').value = ''; if (b.dataset.prorate === 'advance') { el('from').value = 'buyer'; el('to').value = 'seller'; } else { el('from').value = 'seller'; el('to').value = 'buyer'; } sync(); }));
  if (el('lenderCredit')) el('lenderCredit').addEventListener('change', () => { if (el('lenderCredit').checked) { el('from').value = 'lender'; el('to').value = 'buyer'; el('cdSection').value = ''; if (el('altaSection').value === 'prorations') el('altaSection').value = 'loanCharges'; } });
  const fill = (fee) => { el('kind').value = fee.kind || 'charge'; if (el('lenderCredit')) el('lenderCredit').checked = !!fee.lenderCredit; for (const n of ['description', 'altaSection', 'cdSection', 'cdLine', 'payee', 'note', 'presetKey']) el(n).value = fee[n] ?? '';
    el('amount').value = fee.amount != null ? Number(fee.amount).toFixed(2) : ''; el('paidBy').value = fee.paidBy || 'buyer'; el('timing').value = fee.timing || 'at'; el('poc').checked = !!fee.poc; el('titlePrefix').checked = !!fee.titlePrefix;
    PAYERS.forEach(([k]) => { if (el('split_' + k)) el('split_' + k).value = fee.split && Number(fee.split[k]) ? Number(fee.split[k]).toFixed(2) : ''; });
    if (fee.kind === 'credit') { el('from').value = fee.from || 'seller'; el('to').value = fee.to || 'buyer'; } sync(); };
  $('[data-preset]', f).addEventListener('change', guard(async (e) => { const key = e.target.value; if (!key) return; const p = (await api.listAccountingPresets(deal.id)).find((x) => x.key === key); fill({ ...p.fee }); el('editId').value = ''; toast(p.calculated ? `Filled from CLA rates. It is saved tagged ${CALC_TAG}; changing it before saving marks it overridden.` : 'Preset filled with an EXAMPLE amount. Check it before saving.'); }));
  const reset = () => { f.reset(); el('editId').value = ''; el('presetKey').value = ''; $('[data-form-title]', f).textContent = 'Add a fee'; $('[data-save-fee]', f).textContent = 'Add fee'; $('[data-cancel-edit]', f).hidden = true; $('[data-form-err]', f).textContent = ''; sync(); };
  $('[data-cancel-edit]', f).addEventListener('click', reset);
  $$('[data-edit-fee]', root).forEach((b) => b.addEventListener('click', () => { const fee = acc.entries.find((x) => x.id === b.dataset.editFee); fill(fee); el('editId').value = fee.id;
    $('[data-form-title]', f).textContent = fee.calc ? `Edit fee (${CALC_TAG}: a change to the amount, payer or sections marks it overridden)` : 'Edit fee'; $('[data-save-fee]', f).textContent = 'Save changes'; $('[data-cancel-edit]', f).hidden = false; f.scrollIntoView({ block: 'start' }); el('description').focus(); }));
  f.addEventListener('submit', async (e) => { e.preventDefault(); const v = formData(f); const err = $('[data-form-err]', f); err.textContent = '';
    const input = { kind: v.kind, description: v.description, altaSection: v.altaSection, cdSection: v.cdSection, cdLine: v.cdLine, payee: v.payee, amount: v.amount, note: v.note, presetKey: v.presetKey || null };
    if (v.kind === 'credit') Object.assign(input, { from: v.from, to: v.to, lenderCredit: !!(el('lenderCredit') && el('lenderCredit').checked) });
    else Object.assign(input, { paidBy: v.paidBy, timing: el('poc').checked ? 'before' : v.timing, poc: el('poc').checked, titlePrefix: el('titlePrefix').checked,
      split: v.paidBy === 'split' ? Object.fromEntries(PAYERS.filter(([k]) => el('split_' + k)).map(([k]) => [k, v['split_' + k]])) : null });
    try { if (v.editId) { await api.updateAccountingFee(v.editId, input); toast('Fee updated (logged).'); } else { await api.addAccountingFee(deal.id, input); toast('Fee added (logged).'); } go(); }
    catch (x) { err.textContent = x.message; toast(x.message, 'err'); } });
  sync();
}

// ---------------- CLA rates (fee engine; the module is only loaded by the adapter when the flag is on and an editor asks) ----------------
const calcTags = (e) => (e.calc ? html` <span class="pill acct-calc-pill" data-calc-tag title="${e.calc.rateSource}">${CALC_TAG}</span>${e.overridden ? html` <span class="pill warn" data-overridden title="Changed by hand; a re-run keeps it">Overridden</span>` : ''}` : '');
const calcDetail = (e) => html`<div class="small muted">${e.payee ? `to ${e.payee}` : ''}${e.note && !String(e.note).startsWith(CALC_TAG) ? ` · ${e.note}` : ''}</div>
  <details class="acct-calc-detail" data-calc-detail><summary class="small">Rate source &amp; calculation${e.overridden ? html` · calculated ${m2z(e.calc.fields && e.calc.fields.amount)}` : ''}</summary>
    <div class="small"><strong>Source:</strong> ${e.calc.rateSource}</div><div class="small"><strong>Calculation:</strong> ${e.calc.calculation}</div>${e.overridden ? html`<div class="small" data-calc-amount><strong>Calculated amount:</strong> ${m2z(e.calc.fields && e.calc.fields.amount)} (this line was changed by hand, so a re-run leaves it alone)</div>` : ''}</details>`;
const STATUS = { new: ['New', 'ok'], changed: ['Changed', 'info'], unchanged: ['Unchanged', ''], overridden: ['Overridden, kept', 'warn'], 'stale-overridden': ['Overridden, no longer calculated, kept', 'warn'], retire: ['Will be retired', 'bad'], retired: ['Retired by you, skipped', ''] };
const payText = (l, refi) => { if (!l) return ''; const B = refi ? 'Borrower' : 'Buyer'; if (l.paidBy !== 'split') return { buyer: B, seller: 'Seller', lender: 'Lender', other: 'Other' }[l.paidBy] || l.paidBy;
  return 'Split: ' + Object.entries(l.split || {}).filter(([, x]) => Number(x)).map(([k, x]) => `${k === 'buyer' ? B : k[0].toUpperCase() + k.slice(1)} ${m2z(x)}`).join(' / '); };
function calcOptionsForm(S) {
  const o = S.options || {}; const ends = o.ends; const sel = (n, list, v) => html`<select name="${n}">${list.map(([k, l]) => opt(k, l, v))}</select>`;
  const ownL = { Buyer: 'Buyer', Seller: 'Seller', MDB: 'Miami-Dade / Broward custom', CHA: 'Charlotte custom' };
  return html`<form class="acct-calc-form" data-calc-form novalidate>
    <p class="small" data-calc-source>Rates: <strong>CLA quote calculator ${S.source.commit}</strong> (rate snapshot ${S.source.snapshot}, ${S.source.label || 'vendored'}), underwriter Fidelity National Title. Order: <strong>${S.county ? S.county + ', ' : ''}${S.state} ${S.type === 'refi' ? 'refinance' : S.type}</strong>${S.usesStateDefaults ? ' (no county rates: state defaults used)' : ''}.</p>
    <div class="form-grid">
      ${S.asks.occ ? html`<label class="check"><input type="checkbox" name="occ" value="1" ${o.occ !== false ? raw('checked') : ''}> Principal residence</label>` : ''}
      ${S.asks.fthb ? html`<label class="check"><input type="checkbox" name="fthb" value="1" ${o.fthb ? raw('checked') : ''}> First-time buyer</label>` : ''}
      ${S.ownerPolicy && S.ownerPolicy.removable ? html`<label>Owner's policy${sel('owner', [['true', "Include owner's policy"], ['false', "Remove owner's policy"]], String(o.owner !== false))}</label>` : ''}
      ${S.asks.ownPay ? html`<label data-pol-wrap>Owner's policy type${sel('pol', [['standard', 'Basic (standard)'], ['enhanced', S.enhanced && S.enhanced.supported ? "Enhanced (ALTA Homeowner's)" : 'Enhanced - PLACEHOLDER (no rate in the data)']], o.pol)}
        <span class="field-hint small ${S.enhanced && !S.enhanced.supported ? 'warn-text' : 'muted'}" data-enhanced-note>${S.enhanced ? S.enhanced.note : ''}</span></label>` : ''}
      <label>Rate${sel('rate', [['basic', 'Basic'], ['reissue', 'Reissue']], o.rate)}</label>
      ${S.type === 'cash' ? '' : html`<label>Premium presentation${sel('pres', [['trid', 'TRID disclosure (CLA default): full lender\'s premium in C, owner\'s in H = the difference'], ['actual', 'Actual (simultaneous price)']], o.pres)}</label>`}
      ${S.asks.ownPay ? html`<label>${S.asks.flTitle ? 'Title / owner\'s policy paid by' : 'Owner\'s policy paid by'}${sel('ownPay', [['', `Local custom (${S.asks.flTitle ? S.flTitleDefault : S.ownerPayDefault || 'Buyer'})`], ...(S.asks.flTitle ? ['Seller', 'Buyer', 'MDB', 'CHA'] : ['Buyer', 'Seller']).map((k) => [k, ownL[k]])], o.ownPay)}</label>` : ''}
      ${S.asks.payoff ? html`<label>Payoff of the existing loan<input name="payoff" inputmode="decimal" value="${o.payoff || ''}" placeholder="0.00"></label>` : ''}
      ${S.asks.assessed ? html`<label>Assessed value <span class="muted">(if higher than the price)</span><input name="assessed" inputmode="decimal" value="${o.assessed || ''}" placeholder="0.00"></label>` : ''}
    </div>
    ${S.endorsements.length ? html`<fieldset class="acct-calc-ends" data-calc-ends><legend class="small">Endorsements</legend>${S.endorsements.map((e) => html`<label class="check small"><input type="checkbox" name="end" value="${e.code}" ${(ends ? ends.includes(e.code) : e.defaultOn) ? raw('checked') : ''}> ${e.code} <span class="muted">${e.name}</span></label>`)}</fieldset>` : html`<p class="small muted" data-calc-no-ends>No endorsements in the calculator for ${S.state}.</p>`}
    <div class="acct-form-actions"><button class="m-btn" type="submit" data-calc-preview>Preview changes</button><span class="muted small">Nothing changes until you apply.</span></div></form><div data-calc-result></div>`;
}
function calcPreview(P, refi) {
  const shown = P.rows; const n = P.counts;
  const amt = (l) => (l ? m2z(l.amount) : '—');
  return html`<div class="acct-calc-preview" data-calc-preview-table>
    <div class="acct-calc-counts small" data-calc-counts><span class="pill ok">${n.new} new</span> <span class="pill info">${n.changed} changed</span> <span class="pill">${n.unchanged} unchanged</span>${n.overridden ? html` <span class="pill warn">${n.overridden} overridden (kept)</span>` : ''}${n.retire ? html` <span class="pill bad">${n.retire} to retire</span>` : ''}${n.retired ? html` <span class="pill">${n.retired} retired by you (skipped)</span>` : ''}
      <span class="muted">· ${P.summary}</span></div>
    ${P.warnings.length ? html`<div class="notice warn small" data-calc-warnings>${P.warnings.map((w) => html`<div>${w}</div>`)}</div>` : ''}
    <table class="tbl acct-calc-diff" data-calc-diff><thead><tr><th>Status</th><th>Fee</th><th>CD</th><th>Paid by</th><th class="num">Now</th><th class="num">CLA rates</th></tr></thead><tbody>
    ${shown.map((r) => { const [lab, cls] = STATUS[r.status] || [r.status, '']; const l = r.proposed || r.current; return html`<tr data-calc-row="${r.key}" data-calc-status="${r.status}" class="${r.status === 'unchanged' || r.status === 'retired' ? 'acct-calc-quiet' : ''}">
      <td><span class="pill ${cls}">${lab}</span></td>
      <td><strong>${l.description}</strong>${r.proposed ? html`<details class="acct-calc-detail"><summary class="small">Rate source &amp; calculation</summary><div class="small"><strong>Source:</strong> ${r.proposed.rateSource}</div><div class="small"><strong>Calculation:</strong> ${r.proposed.calculation}</div></details>` : ''}
        ${r.changes && r.changes.length && r.status !== 'unchanged' ? html`<div class="small muted">${r.changes.map((c) => html`<span>${LABELS[c.field] || c.field}: ${showVal(c.field, c.old)} &rarr; ${showVal(c.field, c.new)}</span> `)}</div>` : ''}</td>
      <td class="small">${r.proposed ? html`${r.proposed.cdSection}${r.proposed.cdLine ? '.' + r.proposed.cdLine : ''} <span class="muted">· ${altaLabel(r.proposed.altaSection)}</span>` : ''}</td>
      <td class="small">${payText(r.proposed || r.current, refi)}</td>
      <td class="num">${r.current ? m2z(r.current.amount) : '—'}</td><td class="num"><strong>${r.status === 'retire' ? '—' : amt(r.proposed)}</strong></td></tr>`; })}</tbody>
      <tfoot><tr class="acct-total"><td colspan="4">CLA-rate total (${refi ? 'borrower' : `buyer ${m2z(P.totals.buyer)} · seller ${m2z(P.totals.seller)}`})</td><td></td><td class="num">${m2z(P.totals.buyer + P.totals.seller)}</td></tr></tfoot></table>
    ${P.examples.length ? html`<label class="check small acct-calc-examples" data-calc-examples-wrap><input type="checkbox" data-calc-examples checked> Also retire ${P.examples.length} EXAMPLE fee${P.examples.length === 1 ? '' : 's'} these replace: ${P.examples.map((x) => `${x.description} (${m2z(x.amount)})`).join(', ')}</label>` : ''}
    <div class="acct-form-actions"><button class="m-btn" type="button" data-calc-apply>Apply changes</button><span class="muted small" data-calc-apply-note>New and changed lines are tagged ${CALC_TAG}; retired lines are kept in the history. Every change is logged.</span></div></div>`;
}
function mountCalc(root, api, deal, acc, refresh) {
  const card = $('[data-calc-card]', root); if (!card) return; const panel = $('[data-calc-panel]', card); const go = () => (refresh ? refresh() : location.reload());
  const refi = acc.refi; let setup = null;
  const read = (f) => { const v = (n) => (f.elements[n] ? f.elements[n].value : undefined); const o = { rate: v('rate') };
    if (f.elements.occ) o.occ = f.elements.occ.checked; else o.occ = true; if (f.elements.fthb) o.fthb = f.elements.fthb.checked;
    if (f.elements.pol) o.pol = v('pol'); if (f.elements.owner) o.owner = v('owner') !== 'false'; if (f.elements.pres) o.pres = v('pres'); if (f.elements.ownPay) o.ownPay = v('ownPay'); if (f.elements.payoff) o.payoff = v('payoff') || 0; if (f.elements.assessed) o.assessed = v('assessed') || 0;
    if (setup.endorsements.length) o.ends = $$('input[name=end]', f).filter((x) => x.checked).map((x) => x.value); return o; };
  const open = guard(async () => { setup = await api.getCalculatorSetup(deal.id); panel.hidden = false; $('[data-calc-open]', card).hidden = true;
    if (!setup.covered) { panel.innerHTML = toText(html`<p class="notice warn" data-calc-not-ready>${setup.reason}</p>`); return; }
    panel.innerHTML = toText(calcOptionsForm(setup)); const f = $('[data-calc-form]', panel); const out = $('[data-calc-result]', panel);
    f.addEventListener('submit', guard(async (e) => { e.preventDefault(); const opts = read(f); const P = await api.previewCalculatedFees(deal.id, opts);
      out.innerHTML = toText(calcPreview(P, refi)); const btn = $('[data-calc-apply]', out); const ex = $('[data-calc-examples]', out);
      const count = () => { const n = P.applicable + (ex && ex.checked ? P.examples.length : 0); btn.textContent = n ? `Apply ${n} change${n === 1 ? '' : 's'}` : 'Nothing to apply'; btn.disabled = !n; };
      if (ex) ex.addEventListener('change', count); count(); out.scrollIntoView({ block: 'nearest' });
      btn.addEventListener('click', guard(async () => { btn.disabled = true; try { const r = await api.applyCalculatedFees(deal.id, opts, { token: P.token, retireExamples: !!(ex && ex.checked) });
        toast(`CLA rates applied: ${r.added} added, ${r.updated} updated, ${r.retired + r.examplesRetired} retired${r.kept ? `, ${r.kept} overridden kept` : ''} (logged).`); go(); } finally { btn.disabled = false; } })); }));
  });
  $('[data-calc-open]', card).addEventListener('click', open);
  if (new URLSearchParams(location.hash.split('?')[1] || '').get('calc') === '1') open();
}

// ---------------- ALTA Settlement Statement ----------------
const printBtn = (what) => html`<button type="button" class="ghost acct-noprint" data-print="${what}">Print ${what === 'alta' ? 'ALTA statement' : 'CD fee pages'}</button>`;
const mountPrint = (root) => $$('[data-print]', root).forEach((b) => b.addEventListener('click', () => { document.body.classList.add('acct-printing'); setTimeout(() => { window.print(); document.body.classList.remove('acct-printing'); }, 30); }));
const docHead = (deal, title, sub) => html`<header class="acct-doc-head"><div class="acct-mark" data-print-mark>${TEST_MARK}</div>
  <h2>${title}</h2>${sub ? html`<p class="muted">${sub}</p>` : ''}
  <dl class="acct-doc-meta"><div><dt>File #</dt><dd>${deal.fileNumber}</dd></div><div><dt>Property</dt><dd>${deal.street}, ${deal.city}, ${deal.state} ${deal.zip}</dd></div>
    <div><dt>Settlement date</dt><dd>${fmtDate(deal.closingDate) || 'Not set'}</dd></div><div><dt>${deal.transactionType === 'Refinance' ? 'Borrower' : 'Buyer / borrower'}</dt><dd>${names(deal, 'Client-Buyer') || '—'}</dd></div>
    ${deal.transactionType === 'Refinance' ? '' : html`<div><dt>Seller</dt><dd>${names(deal, 'Client-Seller') || '—'}</dd></div>`}<div><dt>Lender</dt><dd>${deal.lenderName || names(deal, 'Lender') || '—'}</dd></div>
    <div><dt>Settlement agent</dt><dd>CLA Title &amp; Escrow (test portal)</dd></div></dl></header>`;

async function altaView(api, deal, acc, q, base) {
  const view = ['combined', 'buyer', 'seller'].includes(q.get('view')) ? q.get('view') : 'combined';
  const st = await api.getAltaStatement(deal.id, view); const V = st.view; const combined = V === 'combined';
  const choices = (acc.refi ? [['buyer', 'Borrower']] : [['combined', 'Combined'], ['buyer', 'Buyer / borrower'], ['seller', 'Seller']]);
  const seg = html`<div class="acct-toolbar acct-noprint"><div class="seg" data-alta-views>${choices.map(([k, l]) => html`<a class="seg-btn ${k === V ? 'on' : ''}" href="${base}?v=alta&view=${k}" data-alta-view="${k}">${l}</a>`)}</div><span class="spacer"></span>${printBtn('alta')}</div>`;
  const cols = combined ? 5 : 3;
  const amt = (n) => html`<td class="num">${m2(n)}</td>`;
  const line = (r) => combined ? html`<tr data-alta-row="${r.id}">${amt(r.sellerDebit)}${amt(r.sellerCredit)}<td>${r.description}${r.memo ? html`<div class="small muted">${r.memo}</div>` : ''}</td>${amt(r.buyerDebit)}${amt(r.buyerCredit)}</tr>`
    : html`<tr data-alta-row="${r.id}"><td>${r.description}${r.memo ? html`<div class="small muted">${r.memo}</div>` : ''}</td>${amt(V === 'buyer' ? r.buyerDebit : r.sellerDebit)}${amt(V === 'buyer' ? r.buyerCredit : r.sellerCredit)}</tr>`;
  const S = st.subtotals, D = st.due, TT = st.totals;
  const tri = (label, sd, sc, bd, bc, cls = '') => combined ? html`<tr class="${cls}"><td class="num">${m2(sd)}</td><td class="num">${m2(sc)}</td><td><strong>${label}</strong></td><td class="num">${m2(bd)}</td><td class="num">${m2(bc)}</td></tr>`
    : html`<tr class="${cls}"><td><strong>${label}</strong></td><td class="num">${m2(V === 'buyer' ? bd : sd)}</td><td class="num">${m2(V === 'buyer' ? bc : sc)}</td></tr>`;
  const B = acc.refi ? 'Borrower' : 'Borrower / Buyer';
  const dueRows = html`${V !== 'seller' ? tri(D.toBuyer > 0 ? `Due to ${B}` : `Due from ${B}`, null, null, D.toBuyer || null, D.fromBuyer || null, 'acct-due') : ''}
    ${V !== 'buyer' && !acc.refi ? tri(D.fromSeller > 0 ? 'Due from Seller' : 'Due to Seller', D.toSeller || null, D.fromSeller || null, null, null, 'acct-due') : ''}`;
  const title = `ALTA Settlement Statement - ${V === 'combined' ? 'Combined' : V === 'buyer' ? (acc.refi ? 'Borrower' : 'Buyer / Borrower') : 'Seller'}`;
  const body = html`${seg}<div class="card acct-doc" data-print-area="alta" data-alta="${V}">${docHead(deal, title, 'Built from the Accounting fee ledger. For testing the portal only.')}
    <table class="tbl acct-statement" data-alta-table><thead>${combined ? html`<tr><th colspan="2" class="center">Seller</th><th></th><th colspan="2" class="center">${B}</th></tr><tr><th class="num">Debit</th><th class="num">Credit</th><th>Description</th><th class="num">Debit</th><th class="num">Credit</th></tr>`
      : html`<tr><th>Description</th><th class="num">Debit</th><th class="num">Credit</th></tr>`}</thead>
    <tbody>${st.sections.map((s) => html`<tr class="acct-sec" data-alta-sec="${s.key}"><th colspan="${cols}">${s.label}</th></tr>${s.rows.length ? s.rows.map(line) : html`<tr class="acct-empty"><td colspan="${cols}" class="muted small">None</td></tr>`}`)}
      ${tri('Subtotals', S.sellerDebit, S.sellerCredit, S.buyerDebit, S.buyerCredit, 'acct-subtotal')}${dueRows}${tri('Totals', TT.sellerDebit, TT.sellerCredit, TT.buyerDebit, TT.buyerCredit, 'acct-total')}</tbody></table>
    <p class="small muted acct-foot">${st.balance.balanced ? 'Balance check: balanced (debits = credits on each side; funds in = funds out).' : html`<span class="bad-text" data-alta-out>OUT OF BALANCE by ${m2z(Math.abs(st.balance.difference))}.</span> Fix the fee ledger before relying on these figures.`}</p>
    <div class="acct-mark acct-mark-foot">${TEST_MARK}</div></div>`;
  return { body, mount: mountPrint };
}

// ---------------- Closing Disclosure: pages 1-5 are built in dealaccounting-cd.js (Caroline Kim, Nov 4 2026) ----------------

// ---------------- edit history ----------------
const LABELS = { meta: 'Line settings / payments', reduces: 'Reduces the total (aggregate adjustment)', lenderCredit: 'Lender credit', proration: 'Proration', kind: 'Type', description: 'Description', altaSection: 'ALTA section', cdSection: 'CD section', cdLine: 'CD line', payee: 'Payee', amount: 'Amount', paidBy: 'Paid by', split: 'Split', timing: 'Paid', poc: 'POC', titlePrefix: '"Title -" prefix', from: 'Credit from', to: 'Credit to', note: 'Note', retired: 'Retired' };
const showVal = (k, v) => { if (v == null || v === '') return '—'; if (k === 'meta') return metaText(v); if (k === 'proration') return v.calc ? `${v.cycle} ${m2z(v.cycleAmount)} from ${v.periodStart}, ${v.basis === 'installment' ? 'installment' : v.basis + '-day'}, ${v.status}; settlement ${v.calc.settlementDate}: ${m2z(v.calc.amount)}` : 'proration'; if (k === 'amount') return m2z(v); if (k === 'altaSection') return altaLabel(v); if (k === 'split') return Object.entries(v).filter(([, x]) => Number(x)).map(([p, x]) => `${p} ${m2z(x)}`).join(', ') || '—'; if (typeof v === 'boolean') return v ? 'yes' : 'no'; return String(v); };
async function historyView(api, deal) {
  const log = await api.listAccountingLog(deal.id);
  const body = html`<div class="card"><h3>Edit history</h3><p class="muted small">Every add, edit, retire and restore: who, when, the old value and the new one. Read only.</p>
    <table class="tbl striped" data-acct-log><thead><tr><th>When</th><th>Who</th><th>Fee</th><th>Action</th><th>Changes</th></tr></thead><tbody>
    ${log.length ? log.map((l) => html`<tr data-log-row="${l.id}" data-log-action="${l.action}"><td class="nowrap">${fmtDateTime(l.at)}</td><td>${l.byName}</td><td>${l.description}</td><td>${l.action}${l.via ? html`<div class="small muted" data-log-via>via ${l.via}</div>` : ''}</td>
      <td class="small">${l.cd ? (l.changes || []).map((c) => html`<div><strong>${c.label || c.field}</strong>: ${c.old == null ? '—' : String(c.old)} &rarr; ${c.new == null ? '—' : String(c.new)}</div>`) : l.action === 'added' ? html`Added at ${showVal('amount', (l.changes.find((c) => c.field === 'amount') || {}).new)}` : (l.changes || []).map((c) => html`<div><strong>${LABELS[c.field] || c.field}</strong>: ${showVal(c.field, c.old)} &rarr; ${showVal(c.field, c.new)}</div>`)}</td></tr>`) : html`<tr><td colspan="5" class="muted">No changes yet.</td></tr>`}</tbody></table></div>`;
  return { body };
}

// UNDERWRITER SPLIT on a title premium line (owner's / lender's policy): CLA portion vs underwriter portion, from the Admin's per-state %
function uwSplit(e, uw, state) {
  if (e.retired || !isTitlePremium(e) || uw === 'hidden') return '';
  if (!uw || uw.pct === null || uw.pct === undefined) return html`<div class="small muted acct-uw" data-uw-line="${e.id}" data-uw-unset>Underwriter split for ${state || 'this state'}: not set. ${UNSET_NOTE}</div>`;
  const sp = splitAmount(e.amount, uw.pct);
  return html`<div class="small acct-uw" data-uw-line="${e.id}" data-uw-cla="${sp.cla}" data-uw-amount="${sp.underwriter}">Split: <strong>CLA ${m2z(sp.cla)}</strong> (${sp.claPct}%) &middot; <strong>${uw.underwriter} ${m2z(sp.underwriter)}</strong> (${sp.pct}%)</div>`;
}

// meta (Qualia line settings + payments) in the edit history, in words
const PAYM = { check: 'Check', wire: 'Wire', netFunded: 'Net Funded', aggregate: 'Aggregate', transfer: 'Transfer', holdback: 'Holdback' };
function metaText(m) {
  const out = []; if (m.loanPct != null) out.push(`Loan Amount ${m.loanPct}%`); if (m.months != null) out.push(`${m.months} months`); if (m.perMonth != null) out.push(`${m2z(m.perMonth)} per month`);
  if (m.recType) out.push(`recording type ${m.recType}`); if (m.paidTo) out.push(`paid to ${m.paidTo}`); if (m.group === 'hoaGr') out.push('HOA / Condo / Ground Rent / Payoffs'); if (m.perDiem) out.push(`per diem ${m.perDiem.perDiem ?? 'calculated'}${m.perDiem.rate != null ? ` @ ${m.perDiem.rate}%` : ''}${m.perDiem.from ? ` from ${m.perDiem.from}` : ''}${m.perDiem.to ? ` to ${m.perDiem.to}` : ''}`);
  if (m.payments) out.push('payments: ' + m.payments.map((p) => `${p.payee || 'no payee'} (${PAYM[p.method] || p.method}${p.label && p.label !== 'Unclassified' ? ', ' + p.label : ''}${p.amount != null ? ', ' + m2z(p.amount) : ''})`).join('; '));
  return out.join(' · ') || '—';
}

// ---------------- Qualia-style document viewer chrome around the CD pages: title dropdown, Page x of 5, print, zoom, fit ----------------
function viewerChrome(v, base) {
  const bar = html`<div class="qc-viewer-bar acct-noprint" data-qc-viewer><select data-qc-doc aria-label="Document"><option value="cd" selected>Closing Disclosure</option><option value="alta">Settlement Statement</option></select>
    <button type="button" class="ghost small qc-sq" data-qc-page-prev aria-label="Previous page">&lsaquo;</button><span data-qc-pageof>Page 1 of 5</span><button type="button" class="ghost small qc-sq" data-qc-page-next aria-label="Next page">&rsaquo;</button><span class="spacer"></span>
    <button type="button" class="ghost small" data-qc-print>Print</button><button type="button" class="ghost small" disabled title="The test portal does not store generated documents">Save</button><button type="button" class="ghost small" disabled title="The test portal does not store generated documents">Download</button>
    <button type="button" class="ghost small" data-qc-fit>Fit</button><button type="button" class="ghost small qc-sq" data-qc-zoom="1" aria-label="Zoom in">+</button><button type="button" class="ghost small qc-sq" data-qc-zoom="-1" aria-label="Zoom out">&minus;</button><span class="small muted" data-qc-zoom-pct>100%</span></div>`;
  return { body: html`${bar}<div class="qc-viewer" data-qc-viewer-body><div class="qc-viewer-inner" data-qc-viewer-inner>${v.body}</div></div>`, mount: (root, c) => { if (v.mount) v.mount(root, c);
    const inner = $('[data-qc-viewer-inner]', root); let z = 1; const pages = () => $$('[data-cd-page]', root); let cur = 1;
    const setZ = (n) => { z = Math.min(2, Math.max(0.5, Math.round(n * 10) / 10)); inner.style.zoom = String(z); $('[data-qc-zoom-pct]', root).textContent = Math.round(z * 100) + '%'; };
    const show = () => { $('[data-qc-pageof]', root).textContent = `Page ${cur} of ${pages().length || 5}`; };
    const go = (n) => { const list = pages(); if (!list.length) return; cur = Math.min(list.length, Math.max(1, n)); list[cur - 1].scrollIntoView({ block: 'start' }); show(); };
    $('[data-qc-doc]', root).addEventListener('change', (e) => { if (e.target.value === 'alta') location.hash = `${base}?v=alta`; });
    $('[data-qc-page-prev]', root).addEventListener('click', () => go(cur - 1)); $('[data-qc-page-next]', root).addEventListener('click', () => go(cur + 1));
    $('[data-qc-print]', root).addEventListener('click', () => { const b = $('[data-print]', root); if (b) b.click(); });
    $$('[data-qc-zoom]', root).forEach((b) => b.addEventListener('click', () => setZ(z + 0.1 * Number(b.dataset.qcZoom))));
    $('[data-qc-fit]', root).addEventListener('click', () => { const pg = pages()[0]; const box = $('[data-qc-viewer-body]', root); if (!pg || !box) return; inner.style.zoom = '1'; setZ(Math.min(1.5, (box.clientWidth - 24) / Math.max(1, pg.scrollWidth))); });
    show(); } };
}
