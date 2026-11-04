// ACCOUNTING tab (John, Nov 3: "an accounting tab that will allow fees to be added to an ALTA and CD"). CLA staff only, behind the `accounting`
// feature flag (app.js never loads this module when it is off). ONE fee ledger feeds the ALTA Settlement Statement and the Closing Disclosure fee
// view. Processor / Admin / Super admin edit; Sales Person / Sales Team read only. TEST ONLY: "TEST - not a legal disclosure" on every page and print.
import { html, raw, $, $$, guard, formData, toast, fmtDate, fmtDateTime } from '../ui.js?v=202611032037';
import { themeOn } from '../theme.js?v=202611032037';
import { modOn } from '../data/modules.js?v=202611032037';
import { ALTA_SECTIONS, CD_SECTIONS, CD_FEE_SECTIONS, PAYERS, FROM_KEYS, FROM_LABEL, TO_KEYS, PRESET_STATES, TEST_MARK, altaLabel, cdLabel, DEFAULT_CD, cdDescription, acctCanRead } from '../data/accounting.js?v=202611032037';

const VIEWS = [['ledger', 'Fee ledger'], ['alta', 'ALTA Settlement Statement'], ['cd', 'Closing Disclosure'], ['history', 'Edit history']];
const m2 = (n) => (n == null || Number(n) === 0 ? '' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const m2z = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const opt = (v, l, sel) => html`<option value="${v}" ${String(v) === String(sel ?? '') ? raw('selected') : ''}>${l}</option>`;
const names = (deal, role) => deal.participants.filter((p) => p.role === role && p.contact).map((p) => (p.entity && p.entity.name) || `${p.contact.firstName} ${p.contact.lastName}`).join(', ');

export async function render({ api, deal, user }) {
  if (!(api.features || {}).accounting || !modOn('accounting')) throw new Error('That page does not exist.');   // config flag off, or not Live (beta) for this user
  if (!acctCanRead(user) || user.accountRole) throw new Error('Accounting is for CLA staff only.');
  const q = new URLSearchParams(location.hash.split('?')[1] || ''); const view = VIEWS.some(([k]) => k === q.get('v')) ? q.get('v') : 'ledger';
  const showRetired = q.get('retired') === '1'; const base = `#/deals/${deal.id}/accounting`;
  const acc = await api.getAccounting(deal.id, { includeRetired: showRetired });
  const T = acc.totals; const B = acc.refi ? 'Borrower' : 'Buyer / borrower';
  const tabs = html`<ul class="nav-tabs acct-noprint" data-acct-tabs>${VIEWS.map(([k, l]) => html`<li><a class="${k === view ? 'active' : ''}" href="${base}?v=${k}" data-acct-tab="${k}">${l}</a></li>`)}</ul>`;
  const head = html`<div class="acct-head acct-noprint"><div><p class="eyebrow">Accounting</p><h2 class="page-title">Fees, ALTA &amp; Closing Disclosure</h2>
      <p class="muted small">One fee ledger for this order. The ALTA Settlement Statement and the Closing Disclosure fee pages are built from it. Sales price, deposit and loan amount come from the order.</p></div>
    <div class="acct-head-side"><span class="pill warn" data-test-mark>${TEST_MARK}</span>${acc.canEdit ? '' : html`<span class="pill" data-acct-readonly>Read only</span>`}</div></div>`;
  // summary tiles: the classic stat cards, or (card theme, the default look) Loan-Summary style cards: grey card, white inset head with one big baby-blue value.
  // Same data-* hooks either way (data-acct-totals, data-due-buyer, data-due-seller, data-balance, data-balance-diff).
  const tc = themeOn();
  const tile = (label, value, sub, attrs = '', cls = '', valCls = '') => (tc
    ? html`<div class="tc-card acct-tile ${cls}"${raw(attrs)}><div class="tc-head"><div class="tc-big acct-tile-big ${valCls}">${value}</div><div class="tc-sub">${label}</div></div><div class="acct-tile-foot">${sub}</div></div>`
    : html`<div class="stat-card ${cls}"${raw(attrs)}><div class="stat-label">${label}</div><div class="stat-value ${valCls}">${value}</div><div class="stat-sub">${sub}</div></div>`);
  const val = (hook, v) => html`<span ${raw(hook)}>${v}</span>`;
  const balance = html`<div class="${tc ? 'acct-tiles' : 'stat-row acct-stats'} acct-noprint" data-acct-totals>
      ${tile(`${B} ${T.dueToBuyer > 0 ? 'refund' : 'due at closing'}`, val('data-due-buyer', m2z(T.dueToBuyer > 0 ? T.dueToBuyer : T.dueFromBuyer)), html`Debits ${m2z(T.buyerDebits)} &middot; credits ${m2z(T.buyerCredits)}`)}
      ${acc.refi ? '' : tile(`Seller ${T.dueFromSeller > 0 ? 'owes at closing' : 'proceeds'}`, val('data-due-seller', m2z(T.dueFromSeller > 0 ? T.dueFromSeller : T.dueToSeller)), html`Debits ${m2z(T.sellerDebits)} &middot; credits ${m2z(T.sellerCredits)}`)}
      ${tile('Paid by others / outside closing', m2z(T.paidByLender + T.paidByOther), html`POC / before closing ${m2z(T.paidOutsideClosing)}`)}
      ${tile('Balance check', T.balanced ? 'Balanced' : 'OUT OF BALANCE', html`Funds in ${m2z(T.receipts)} &middot; out ${m2z(T.disbursements)}${T.balanced ? '' : html` &middot; difference <strong data-balance-diff>${m2z(Math.abs(T.difference))}</strong>`}`,
        ` data-balance="${T.balanced ? 'ok' : 'out'}"`, `acct-balance ${T.balanced ? 'is-ok' : 'is-bad'}`, T.balanced ? '' : 'bad')}</div>
    ${T.issues.length ? html`<div class="notice warn acct-noprint" data-balance-issues><strong>Out of balance.</strong><ul>${T.issues.map((i) => html`<li>${i}</li>`)}</ul></div>` : ''}`;
  let v;
  if (view === 'alta') v = await altaView(api, deal, acc, q, base);
  else if (view === 'cd') v = await cdView(api, deal, acc);
  else if (view === 'history') v = await historyView(api, deal);
  else v = await ledgerView(api, deal, acc, showRetired, base);
  return { title: 'Accounting', crumbs: [['Accounting']], body: html`<section class="acct" data-accounting data-acct-view="${view}">${head}${tabs}${view === 'ledger' ? balance : ''}${v.body}</section>`, mount: v.mount || (() => {}) };
}

// ---------------- ledger + add / edit form ----------------
async function ledgerView(api, deal, acc, showRetired, base) {
  const presets = acc.canEdit ? await api.listAccountingPresets(deal.id) : [];
  const groups = PRESET_STATES.filter(([k]) => k === 'ALL' || k === deal.state).map(([k, l]) => [l, presets.filter((p) => p.state === k)]).filter(([, l]) => l.length);
  const bySec = ALTA_SECTIONS.map(([k, l]) => [k, l, acc.entries.filter((e) => e.altaSection === k)]).filter(([, , l]) => l.length);
  const who = (e) => { if (e.kind === 'credit') return html`<span class="small acct-flow">${FROM_LABEL[e.from]} &rarr; ${e.to === 'buyer' ? (acc.refi ? 'Borrower' : 'Buyer') : 'Seller'}</span>`; return ''; };
  const cell = (n) => html`<td class="num">${m2(n)}</td>`;
  const row = (e) => { const sp = e.split || {}; const cr = e.kind === 'credit';
    const bD = cr ? (e.from === 'buyer' ? e.amount : 0) : sp.buyer; const bC = cr && e.to === 'buyer' ? e.amount : 0; const sD = cr ? (e.from === 'seller' ? e.amount : 0) : sp.seller; const sC = cr && e.to === 'seller' ? e.amount : 0;
    return html`<tr data-fee-row="${e.id}" class="${e.retired ? 'is-done acct-retired' : ''} ${e.auto ? 'acct-auto' : ''}">
      <td><strong>${e.kind === 'charge' ? cdDescription(e) : e.description}</strong>${e.auto ? html` <span class="pill" data-auto>From the order</span>` : ''}${e.retired ? html` <span class="pill warn">Retired</span>` : ''}
        ${e.poc ? html` <span class="pill" data-poc>POC</span>` : e.timing === 'before' ? html` <span class="pill">Before closing</span>` : ''}
        ${e.auto ? '' : html`<div class="small muted">${e.payee ? `to ${e.payee}` : ''}${e.payee && e.note ? ' · ' : ''}${e.note || ''}</div>`}${who(e)}</td>
      <td class="small">${e.cdSection ? html`<span title="${cdLabel(e.cdSection)}">${e.cdSection}${e.cdLine ? '.' + e.cdLine : ''}</span>` : html`<span class="muted">&mdash;</span>`}</td>
      <td class="num"><strong>${m2z(e.amount)}</strong></td>${cell(bD)}${cell(bC)}${acc.refi ? '' : html`${cell(sD)}${cell(sC)}`}${cell(cr ? 0 : (Number(sp.lender) || 0) + (Number(sp.other) || 0))}
      <td class="nowrap acct-noprint">${acc.canEdit && !e.auto ? (e.retired ? html`<button class="ghost small" type="button" data-restore="${e.id}">Restore</button>` : html`<button class="ghost small" type="button" data-edit-fee="${e.id}">Edit</button> <button class="ghost small danger" type="button" data-retire="${e.id}">Retire</button>`) : ''}</td></tr>`; };
  const cols = acc.refi ? 7 : 9;
  const table = html`<table class="tbl acct-ledger" data-ledger><thead><tr><th>Description</th><th>CD</th><th class="num">Amount</th><th class="num">${acc.refi ? 'Borrower' : 'Buyer'} debit</th><th class="num">${acc.refi ? 'Borrower' : 'Buyer'} credit</th>${acc.refi ? '' : html`<th class="num">Seller debit</th><th class="num">Seller credit</th>`}<th class="num">Lender / other</th><th class="acct-noprint"></th></tr></thead>
    <tbody>${bySec.length ? bySec.map(([k, l, list]) => html`<tr class="acct-sec" data-sec="${k}"><th colspan="${cols}">${l}</th></tr>${list.map(row)}`) : html`<tr><td colspan="${cols}" class="muted">No fees yet.</td></tr>`}
      <tr class="acct-total" data-running-totals><td><strong>Totals (at closing)</strong></td><td></td><td></td><td class="num">${m2z(acc.totals.buyerDebits)}</td><td class="num">${m2z(acc.totals.buyerCredits)}</td>${acc.refi ? '' : html`<td class="num">${m2z(acc.totals.sellerDebits)}</td><td class="num">${m2z(acc.totals.sellerCredits)}</td>`}<td class="num">${m2z(acc.totals.paidByLender + acc.totals.paidByOther)}</td><td class="acct-noprint"></td></tr></tbody></table>`;
  const form = acc.canEdit ? feeForm(acc, groups) : html`<p class="notice info" data-readonly-note>Sales roles can read the ledger and statements; only a Processor, Admin or Super admin can add or change fees.</p>`;
  const body = html`<div class="acct-grid">${form}
    <div class="card acct-ledger-card"><div class="acct-card-head"><h3>Fee ledger</h3><a class="linkish acct-noprint" data-toggle-retired href="${base}?v=ledger${showRetired ? '' : '&retired=1'}">${showRetired ? 'Hide retired' : `Show retired (${acc.retiredCount})`}</a></div>${table}
      <p class="muted small">Fees are never deleted: retire one to take it off the statements (the edit history keeps every change). POC = paid outside of closing: shown on the ALTA as a memo, in the Before Closing column on the CD.</p></div></div>`;
  return { body, mount: (root, c = {}) => mountLedger(root, api, deal, acc, c.refresh) };
}

function feeForm(acc, groups) {
  const payers = PAYERS.filter(([k]) => !(acc.refi && k === 'seller'));
  return html`<form class="card acct-form" id="acct-fee-form" data-fee-form novalidate><div class="acct-card-head"><h3 data-form-title>Add a fee</h3><button type="button" class="linkish" data-cancel-edit hidden>Cancel edit</button></div>
    <div class="acct-preset"><label>Start from a preset <span class="muted">(EXAMPLE amounts only)</span>
      <select data-preset aria-label="Fee preset"><option value="">Choose a common fee&hellip;</option>${groups.map(([l, list]) => html`<optgroup label="${l}">${list.map((p) => html`<option value="${p.key}">${p.label}${p.exampleAmount ? ` (EXAMPLE ${m2z(p.exampleAmount)})` : ''}</option>`)}</optgroup>`)}</select></label>
      <p class="field-hint">A preset fills the form with an <strong>EXAMPLE</strong> amount (never a real rate). Amounts marked "per $1,000" use this order's ${acc.refi ? 'loan amount' : 'purchase price or loan amount'}. Check and replace before using.</p></div>
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
        ${acc.refi ? '' : html`<p class="span2 small muted" data-proration-help>Proration: <button type="button" class="linkish" data-prorate="advance">seller paid in advance</button> (buyer pays seller back) or <button type="button" class="linkish" data-prorate="unpaid">unpaid by seller</button> (seller credits the buyer). Enter the prorated amount you worked out.</p>`}</div></div>
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
  const fill = (fee) => { el('kind').value = fee.kind || 'charge'; for (const n of ['description', 'altaSection', 'cdSection', 'cdLine', 'payee', 'note', 'presetKey']) el(n).value = fee[n] ?? '';
    el('amount').value = fee.amount != null ? Number(fee.amount).toFixed(2) : ''; el('paidBy').value = fee.paidBy || 'buyer'; el('timing').value = fee.timing || 'at'; el('poc').checked = !!fee.poc; el('titlePrefix').checked = !!fee.titlePrefix;
    PAYERS.forEach(([k]) => { if (el('split_' + k)) el('split_' + k).value = fee.split && Number(fee.split[k]) ? Number(fee.split[k]).toFixed(2) : ''; });
    if (fee.kind === 'credit') { el('from').value = fee.from || 'seller'; el('to').value = fee.to || 'buyer'; } sync(); };
  $('[data-preset]', f).addEventListener('change', guard(async (e) => { const key = e.target.value; if (!key) return; const p = (await api.listAccountingPresets(deal.id)).find((x) => x.key === key); fill({ ...p.fee }); el('editId').value = ''; toast('Preset filled with an EXAMPLE amount. Check it before saving.'); }));
  const reset = () => { f.reset(); el('editId').value = ''; el('presetKey').value = ''; $('[data-form-title]', f).textContent = 'Add a fee'; $('[data-save-fee]', f).textContent = 'Add fee'; $('[data-cancel-edit]', f).hidden = true; $('[data-form-err]', f).textContent = ''; sync(); };
  $('[data-cancel-edit]', f).addEventListener('click', reset);
  $$('[data-edit-fee]', root).forEach((b) => b.addEventListener('click', () => { const fee = acc.entries.find((x) => x.id === b.dataset.editFee); fill(fee); el('editId').value = fee.id;
    $('[data-form-title]', f).textContent = 'Edit fee'; $('[data-save-fee]', f).textContent = 'Save changes'; $('[data-cancel-edit]', f).hidden = false; f.scrollIntoView({ block: 'start' }); el('description').focus(); }));
  f.addEventListener('submit', async (e) => { e.preventDefault(); const v = formData(f); const err = $('[data-form-err]', f); err.textContent = '';
    const input = { kind: v.kind, description: v.description, altaSection: v.altaSection, cdSection: v.cdSection, cdLine: v.cdLine, payee: v.payee, amount: v.amount, note: v.note, presetKey: v.presetKey || null };
    if (v.kind === 'credit') Object.assign(input, { from: v.from, to: v.to });
    else Object.assign(input, { paidBy: v.paidBy, timing: el('poc').checked ? 'before' : v.timing, poc: el('poc').checked, titlePrefix: el('titlePrefix').checked,
      split: v.paidBy === 'split' ? Object.fromEntries(PAYERS.filter(([k]) => el('split_' + k)).map(([k]) => [k, v['split_' + k]])) : null });
    try { if (v.editId) { await api.updateAccountingFee(v.editId, input); toast('Fee updated (logged).'); } else { await api.addAccountingFee(deal.id, input); toast('Fee added (logged).'); } go(); }
    catch (x) { err.textContent = x.message; toast(x.message, 'err'); } });
  sync();
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

// ---------------- Closing Disclosure fee view ----------------
async function cdView(api, deal, acc) {
  const cd = await api.getClosingDisclosure(deal.id); const refi = cd.refi;
  const n = (v) => html`<td class="num">${m2(v)}</td>`;
  const secRows = (S) => html`<tr class="acct-sec" data-cd-sec="${S.key}"><th>${S.key}. ${S.label}</th>${n(S.borrowerAt + S.borrowerBefore)}<td></td>${refi ? '' : html`<td></td><td></td>`}<td></td></tr>
    ${S.rows.length ? S.rows.map((r) => html`<tr data-cd-row="${r.id}"><td><span class="cd-line">${r.line}</span> ${r.description}${r.payee ? html` <span class="muted small">to ${r.payee}</span>` : ''}</td>${n(r.borrowerAt)}${n(r.borrowerBefore)}${refi ? '' : html`${n(r.sellerAt)}${n(r.sellerBefore)}`}<td class="num">${r.others ? html`${r.othersWho ? html`<span class="muted small">(${r.othersWho})</span> ` : ''}${m2(r.others)}` : ''}</td></tr>`)
      : html`<tr class="acct-empty"><td colspan="${refi ? 4 : 6}" class="muted small">None</td></tr>`}`;
  const totRow = (label, Tt, key) => html`<tr class="acct-subtotal" data-cd-total="${key}"><td><strong>${label}</strong></td>${n(Tt.borrowerAt)}${n(Tt.borrowerBefore)}${refi ? '' : html`${n(Tt.sellerAt)}${n(Tt.sellerBefore)}`}${n(Tt.others)}</tr>`;
  const head = html`<thead><tr><th rowspan="2"></th><th colspan="2" class="center">Borrower-Paid</th>${refi ? '' : html`<th colspan="2" class="center">Seller-Paid</th>`}<th rowspan="2" class="center">Paid by Others</th></tr>
    <tr><th class="num">At Closing</th><th class="num">Before Closing</th>${refi ? '' : html`<th class="num">At Closing</th><th class="num">Before Closing</th>`}</tr></thead>`;
  const loan = cd.sections.filter((s) => ['A', 'B', 'C'].includes(s.key)); const other = cd.sections.filter((s) => ['E', 'F', 'G', 'H'].includes(s.key));
  const summ = (k) => { const S = cd.summaries[k]; if (!S) return ''; return html`<div class="acct-summ" data-cd-summary="${k}"><h4>${k}. ${S.label}</h4><table class="tbl"><tbody>${S.rows.length ? S.rows.map((r, i) => html`<tr><td><span class="cd-line">${String(i + 1).padStart(2, '0')}</span> ${r.label}</td>${n(r.amount)}</tr>`) : html`<tr><td class="muted small">None</td><td></td></tr>`}
    <tr class="acct-subtotal"><td><strong>Total ${k}</strong></td><td class="num"><strong data-summary-total="${k}">${m2z(S.total)}</strong></td></tr></tbody></table></div>`; };
  const body = html`<div class="acct-toolbar acct-noprint"><span class="muted small">Closing Disclosure pages 2-3 layout (fees + Summaries of Transactions). Lender credits, Projected Payments and the rest of the CD are not built here.</span><span class="spacer"></span>${printBtn('cd')}</div>
    <div class="card acct-doc" data-print-area="cd">${docHead(deal, 'Closing Disclosure - Closing Cost Details', 'Fee pages built from the Accounting fee ledger. For testing the portal only.')}
      <h3 class="acct-h">Loan Costs</h3><table class="tbl acct-cd" data-cd-loan>${head}<tbody>${loan.map(secRows)}${totRow('D. TOTAL LOAN COSTS (Borrower-Paid)', cd.D, 'D')}</tbody></table>
      <h3 class="acct-h">Other Costs</h3><table class="tbl acct-cd" data-cd-other>${head}<tbody>${other.map(secRows)}${totRow('I. TOTAL OTHER COSTS (Borrower-Paid)', cd.I, 'I')}
        ${totRow('J. TOTAL CLOSING COSTS (Borrower-Paid)', cd.J, 'J')}<tr class="acct-total"><td>Closing Costs Subtotals (D + I)</td><td class="num" colspan="2" data-j-borrower>${m2z(cd.J.borrower)}</td>${refi ? '' : html`<td class="num" colspan="2">${m2z(cd.J.sellerAt + cd.J.sellerBefore)}</td>`}<td class="num">${m2z(cd.J.others)}</td></tr></tbody></table>
      <h3 class="acct-h">Summaries of Transactions</h3>
      <div class="acct-summaries"><div><h4 class="acct-side">Borrower's Transaction</h4>${summ('K')}${summ('L')}<p class="acct-cash" data-cash-to-close>Cash to close ${cd.cashToClose >= 0 ? 'from' : 'to'} borrower: <strong>${m2z(Math.abs(cd.cashToClose))}</strong> <span class="muted small">(K - L)</span></p></div>
        ${refi ? '' : html`<div><h4 class="acct-side">Seller's Transaction</h4>${summ('M')}${summ('N')}<p class="acct-cash" data-cash-to-seller>Cash ${cd.cashToSeller >= 0 ? 'to' : 'from'} seller: <strong>${m2z(Math.abs(cd.cashToSeller))}</strong> <span class="muted small">(M - N)</span></p></div>`}</div>
      <div class="acct-mark acct-mark-foot">${TEST_MARK}</div></div>`;
  return { body, mount: mountPrint };
}

// ---------------- edit history ----------------
const LABELS = { kind: 'Type', description: 'Description', altaSection: 'ALTA section', cdSection: 'CD section', cdLine: 'CD line', payee: 'Payee', amount: 'Amount', paidBy: 'Paid by', split: 'Split', timing: 'Paid', poc: 'POC', titlePrefix: '"Title -" prefix', from: 'Credit from', to: 'Credit to', note: 'Note', retired: 'Retired' };
const showVal = (k, v) => { if (v == null || v === '') return '—'; if (k === 'amount') return m2z(v); if (k === 'altaSection') return altaLabel(v); if (k === 'split') return Object.entries(v).filter(([, x]) => Number(x)).map(([p, x]) => `${p} ${m2z(x)}`).join(', ') || '—'; if (typeof v === 'boolean') return v ? 'yes' : 'no'; return String(v); };
async function historyView(api, deal) {
  const log = await api.listAccountingLog(deal.id);
  const body = html`<div class="card"><h3>Edit history</h3><p class="muted small">Every add, edit, retire and restore: who, when, the old value and the new one. Read only.</p>
    <table class="tbl striped" data-acct-log><thead><tr><th>When</th><th>Who</th><th>Fee</th><th>Action</th><th>Changes</th></tr></thead><tbody>
    ${log.length ? log.map((l) => html`<tr data-log-row="${l.id}" data-log-action="${l.action}"><td class="nowrap">${fmtDateTime(l.at)}</td><td>${l.byName}</td><td>${l.description}</td><td>${l.action}</td>
      <td class="small">${l.action === 'added' ? html`Added at ${showVal('amount', (l.changes.find((c) => c.field === 'amount') || {}).new)}` : (l.changes || []).map((c) => html`<div><strong>${LABELS[c.field] || c.field}</strong>: ${showVal(c.field, c.old)} &rarr; ${showVal(c.field, c.new)}</div>`)}</td></tr>`) : html`<tr><td colspan="5" class="muted">No changes yet.</td></tr>`}</tbody></table></div>`;
  return { body };
}
