// ACCOUNTING > PRORATIONS (Caroline Kim, Nov 4 2026, item 2): property taxes, HOA dues etc. calculated from the order's settlement date (the
// settlement day is charged to the buyer), per-diem basis 365 / 360 / 366 or Installment, payment cycles Annual / Semi-Annual / Quarterly /
// Monthly, paid in advance vs unpaid (arrears). Each proration is a credit on the fee ledger, so it flows into the ALTA (Prorations /
// Adjustments) and the CD (K / M when paid in advance, L / N when unpaid) and every add / edit / retire is in the edit history.
// Processor / Admin / Super admin edit; Sales and TCs read only. TEST ONLY.
import { html, raw, $, $$, guard, formData, toast, toText, fmtDate } from '../ui.js?v=202611041131';
import { PRORATION_CYCLES, PRORATION_BASES, PRORATION_STATUS, PRORATION_ITEMS, computeProration, prorationRange } from '../data/prorations.js?v=202611041131';
const m2z = (n) => (Number(n) < 0 ? '-' : '') + '$' + Math.abs(Number(n || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const opt = (v, l, sel) => html`<option value="${v}" ${String(v) === String(sel ?? '') ? raw('selected') : ''}>${l}</option>`;
const lab = (list, k) => (list.find(([x]) => x === k) || [k, k])[1];

export async function prorationsView(api, deal, acc, base) {
  const list = acc.entries.filter((e) => e.proration);
  const stale = list.filter((e) => !e.retired && e.prorationStale && !e.prorationError);
  const sd = acc.closingDate;
  const rows = list.map((e) => { const c = e.prorationLive || (e.proration && e.proration.calc) || {}; const p = e.proration;
    return html`<tr data-proration-row="${e.id}" class="${e.retired ? 'is-done acct-retired' : ''}">
      <td><strong>${e.description}</strong>${e.retired ? html` <span class="pill warn">Retired</span>` : ''}${e.prorationStale && !e.prorationError ? html` <span class="pill warn" data-proration-stale>Settlement date changed: was ${m2z(e.prorationStale.savedAmount)}</span>` : ''}${e.prorationError ? html` <span class="pill bad" data-proration-error>${e.prorationError}</span>` : ''}
        <div class="small muted">${lab(PRORATION_ITEMS, p.item)} &middot; ${lab(PRORATION_CYCLES, p.cycle)} ${m2z(p.cycleAmount)} &middot; ${p.basis === 'installment' ? 'Installment' : p.basis + '-day year'}</div>
        ${c.text ? html`<div class="small acct-pr-text" data-proration-text>${c.text}</div>` : ''}</td>
      <td class="small">${c.periodStart ? `${fmtDate(c.periodStart)} – ${fmtDate(c.periodEnd)}` : fmtDate(p.periodStart)}</td>
      <td class="small">${p.status === 'paid' ? 'Paid in advance' : 'Unpaid (arrears)'}</td>
      <td class="small">${c.rangeFrom ? prorationRange(c) : ''}</td>
      <td class="num small">${c.days != null ? c.days : ''}</td><td class="num small">${c.perDiem != null ? '$' + Number(c.perDiem).toFixed(5) : ''}</td>
      <td class="num"><strong data-proration-amount>${m2z(e.amount)}</strong></td>
      <td class="small" data-proration-flow>${e.from === 'buyer' ? html`Buyer &rarr; Seller<div class="muted">CD K / M</div>` : html`Seller &rarr; Buyer<div class="muted">CD L / N</div>`}</td>
      <td class="nowrap acct-noprint">${acc.canEdit ? (e.retired ? html`<button class="ghost small" type="button" data-restore="${e.id}">Restore</button>` : html`<button class="ghost small" type="button" data-edit-proration="${e.id}">Edit</button> <button class="ghost small danger" type="button" data-retire="${e.id}">Retire</button>`) : ''}</td></tr>`; });
  const table = html`<table class="tbl acct-prorations" data-prorations><thead><tr><th>Proration</th><th>Payment period</th><th>Status</th><th>Adjustment covers</th><th class="num">Days</th><th class="num">Per diem</th><th class="num">Amount</th><th>Credit</th><th class="acct-noprint"></th></tr></thead>
    <tbody>${list.length ? rows : html`<tr><td colspan="9" class="muted">No prorations yet.</td></tr>`}</tbody></table>`;
  const head = html`<div class="acct-card-head"><h3>Prorations</h3><span class="muted small" data-proration-sd>Settlement date: <strong>${sd ? fmtDate(sd) : 'not set'}</strong> (Closing Date tab). The settlement day is charged to the buyer.</span></div>`;
  const staleNote = stale.length ? html`<div class="notice warn" data-proration-stale-note>The settlement date changed since ${stale.length} proration${stale.length === 1 ? ' was' : 's were'} saved. The ALTA and CD already use the new amounts.${acc.canEdit ? html` <button class="m-btn small" type="button" data-proration-resave>Re-save ${stale.length} proration${stale.length === 1 ? '' : 's'} (logged)</button>` : ''}</div>` : '';
  const form = acc.canEdit ? prorationForm(acc) : html`<p class="notice info" data-readonly-note>Read only for your role. A Processor, Admin or Super admin adds and changes prorations.</p>`;
  const body = html`<div class="acct-grid">${acc.refi ? html`<p class="notice info" data-proration-refi>A refinance has no seller side, so there is nothing to prorate between a buyer and a seller.</p>` : form}
    <div class="card acct-ledger-card" data-prorations-card>${head}${staleNote}${table}
      <p class="muted small">Each proration is a credit on the fee ledger (ALTA Prorations / Adjustments). Paid in advance by the seller: the buyer pays the seller back for the buyer's days (CD K "Adjustments for Items Paid by Seller in Advance" and M). Unpaid / in arrears: the seller credits the buyer for the seller's days (CD L "Adjustments for Items Unpaid by Seller" and N). Never deleted: retire one to take it off the statements.</p></div></div>`;
  return { body, mount: (root, c = {}) => mountProrations(root, api, deal, acc, c.refresh) };
}

function prorationForm(acc) {
  const sel = (n, list, v) => html`<select name="${n}" data-pr-${n}>${list.map(([k, l]) => opt(k, l, v))}</select>`;
  return html`<form class="card acct-form" id="acct-proration-form" data-proration-form novalidate><div class="acct-card-head"><h3 data-pr-title>Add a proration</h3><button type="button" class="linkish" data-pr-cancel hidden>Cancel edit</button></div>
    <input type="hidden" name="editId">
    <div class="form-grid">
      <label>What is prorated${sel('item', PRORATION_ITEMS, 'countyTaxes')}</label>
      <label class="wide">Description on the ALTA / CD <span class="muted">(blank = the item)</span><input name="description" maxlength="200" autocomplete="off" placeholder="e.g. County Taxes"></label>
      <label>Payment cycle${sel('cycle', PRORATION_CYCLES.map(([k, l]) => [k, l]), 'annual')}</label>
      <label>Amount for one payment period *<input name="cycleAmount" inputmode="decimal" placeholder="0.00" autocomplete="off"></label>
      <label>Current period starts *<input name="periodStart" type="date"></label>
      <label>Per-diem basis${sel('basis', PRORATION_BASES, '365')}</label>
      <label class="wide">Paid or unpaid${sel('status', PRORATION_STATUS, 'paid')}</label>
    </div>
    <div class="acct-pr-preview small" data-proration-preview>Fill in the amount and the period to see the calculation.</div>
    <p class="err-text small" data-pr-err></p>
    <div class="acct-form-actions"><button class="m-btn" type="submit" data-save-proration>Add proration</button><span class="muted small">Calculated from the settlement date ${acc.closingDate ? fmtDate(acc.closingDate) : '(not set yet)'}. Logged with your name and the time.</span></div></form>`;
}

function mountProrations(root, api, deal, acc, refresh) {
  const go = () => (refresh ? refresh() : location.reload());
  $$('[data-retire]', root).forEach((b) => b.addEventListener('click', guard(async () => { if (!confirm('Retire this proration? It comes off the ALTA and CD; it is kept in the history and can be restored.')) return; await api.retireAccountingFee(b.dataset.retire, true); toast('Proration retired (kept in the history).'); go(); })));
  $$('[data-restore]', root).forEach((b) => b.addEventListener('click', guard(async () => { await api.retireAccountingFee(b.dataset.restore, false); toast('Proration restored.'); go(); })));
  const rs = $('[data-proration-resave]', root); if (rs) rs.addEventListener('click', guard(async () => { const r = await api.refreshAccountingProrations(deal.id); toast(`${r.updated} proration${r.updated === 1 ? '' : 's'} re-saved (logged).`); go(); }));
  const f = $('#acct-proration-form', root); if (!f) return;
  const el = (n) => f.elements[n];
  const read = () => { const v = formData(f); return { item: v.item, cycle: v.cycle, cycleAmount: v.cycleAmount, periodStart: v.periodStart, basis: v.basis, status: v.status }; };
  const preview = () => { const box = $('[data-proration-preview]', f); const p = read(); if (!p.cycleAmount || !p.periodStart) { box.textContent = 'Fill in the amount and the period to see the calculation.'; box.className = 'acct-pr-preview small'; return; }
    try { const c = computeProration(p, acc.closingDate); box.innerHTML = toText(html`<strong data-pr-amount>${m2z(c.amount)}</strong> ${c.from === 'buyer' ? 'buyer → seller' : 'seller → buyer'} &middot; ${c.text}`); box.className = 'acct-pr-preview small ok-text'; }
    catch (e) { box.textContent = e.message; box.className = 'acct-pr-preview small warn-text'; } };
  $$('input,select', f).forEach((i) => i.addEventListener(i.tagName === 'SELECT' ? 'change' : 'input', preview));
  const reset = () => { f.reset(); el('editId').value = ''; $('[data-pr-title]', f).textContent = 'Add a proration'; $('[data-save-proration]', f).textContent = 'Add proration'; $('[data-pr-cancel]', f).hidden = true; $('[data-pr-err]', f).textContent = ''; preview(); };
  $('[data-pr-cancel]', f).addEventListener('click', reset);
  $$('[data-edit-proration]', root).forEach((b) => b.addEventListener('click', () => { const e = acc.entries.find((x) => x.id === b.dataset.editProration); const p = e.proration;
    for (const k of ['item', 'cycle', 'periodStart', 'basis', 'status']) el(k).value = p[k]; el('cycleAmount').value = Number(p.cycleAmount).toFixed(2); el('description').value = e.description; el('editId').value = e.id;
    $('[data-pr-title]', f).textContent = 'Edit proration'; $('[data-save-proration]', f).textContent = 'Save changes'; $('[data-pr-cancel]', f).hidden = false; preview(); f.scrollIntoView({ block: 'start' }); }));
  f.addEventListener('submit', async (ev) => { ev.preventDefault(); const err = $('[data-pr-err]', f); err.textContent = ''; const v = formData(f);
    const input = { kind: 'credit', altaSection: 'prorations', cdSection: '', description: v.description, proration: read(), presetKey: 'proration:' + v.item, note: '' };
    try { if (v.editId) { await api.updateAccountingFee(v.editId, input); toast('Proration updated (logged).'); } else { await api.addAccountingFee(deal.id, input); toast('Proration added (logged).'); } go(); }
    catch (x) { err.textContent = x.message; toast(x.message, 'err'); } });
  preview();
}
