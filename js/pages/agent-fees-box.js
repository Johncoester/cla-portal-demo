/* AGENT FEES box on a file's overview (AF-2; John, Nov 12 2026; spec docs/specs/agent-fees-flow.md).
 * CLA staff who run the file see and edit both agent sides; other staff read them. An agent sees and edits only their own side.
 * Buyers and sellers never get this box (they have their own overview, and the database gives them nothing).
 * Commission: type a % or a $ and the other one fills in from the sales price (they are always in step). Admin fee with who pays it.
 * Up to 5 other fees (description, amount, paid to). Staff changing a fee the agent confirmed must give a reason. Nothing is sent. */
import { html, raw, $, $$, modal, closeModal, toast, fmtMoney, fmtDateTime, pill } from '../ui.js?v=202611161500';
import { isRefi } from '../data/constants.js?v=202611245600';
import { AGENT_FEE_SIDES, SIDE_LABEL, PANEL_TITLE, AGENT_ROLE_SIDE, PAYERS, COMMISSION_PAYERS, ADMIN_PAYERS, PAYER_LABEL, MAX_OTHER_FEES, defaultPayer, readAgentFees, syncCommission, sideStatus, agentFeeError, feeChanges, adminHalves, feeNumber } from '../data/agent-fees.js?v=202611243061';

const pct = (n) => (n == null ? '' : `${Number(n).toLocaleString('en-US', { maximumFractionDigits: 4 })}%`);
const payerText = (p, f) => (f && f.payer === 'split' ? ` (split: buyer ${fmtMoney(f.splitBuyer)}, seller ${fmtMoney(f.splitSeller)})` : (p ? ` (paid by ${PAYER_LABEL[p] || p})` : ''));

export function viewerOf(user) {
  if (!user) return null;
  const roles = user.roles || [user.role];
  const agentSides = roles.map((r) => AGENT_ROLE_SIDE[r]).filter(Boolean);
  if (agentSides.length) return { kind: 'agent', sides: agentSides };
  if (!user.accountRole && user.role === 'Transaction Coordinator') return { kind: 'tc' };   // AF-3: confirms for the agents they work for
  if (!user.accountRole && user.role !== 'Outside user') return { kind: 'staff' };
  return null;   // buyers, sellers, other outside users
}

export function sideHtml(side, s, access) {
  const st = sideStatus(s);
  const c = s && s.commission; const a = s && s.admin; const others = (s && s.other) || [];
  return html`<div class="af-side" data-agent-fee-side="${side}">
    <div class="af-side-head"><strong>${PANEL_TITLE[side]}</strong> ${pill(st.text, st.cls)}${access === 'edit' ? html` <button type="button" class="ghost af-edit" data-af-edit="${side}">Edit</button>` : ''}</div>
    <dl class="af-list">
      <dt>Commission base</dt><dd data-af-base>${c ? (c.base ? fmtMoney(c.base) : 'Sales price') : html`<span class="muted">Sales price</span>`}</dd>
      <dt>Commission %</dt><dd data-af-percent>${c ? html`<b>${pct(c.percent)}</b>` : html`<span class="muted">Not entered</span>`}</dd>
      <dt>Additional amount</dt><dd data-af-additional>${c && c.additional ? fmtMoney(c.additional) : html`<span class="muted">None</span>`}</dd>
      <dt>Commission amount</dt><dd data-af-commission>${c ? html`<b>${fmtMoney(c.amount)}</b>${payerText(c.payer, c)}` : html`<span class="muted">Not entered</span>`}</dd>
      <dt>Admin fee</dt><dd data-af-admin>${a ? html`<b>${fmtMoney(a.amount)}</b>${payerText(a.payer, a)}` : html`<span class="muted">None</span>`}</dd>
      <dt>Other fees</dt><dd data-af-other>${others.length ? others.map((o) => html`<div data-af-other-row="${o.slot}">${o.description} <b>${fmtMoney(o.amount)}</b> to ${o.paidTo}${payerText(o.payer)}</div>`) : html`<span class="muted">None</span>`}</dd>
    </dl>
    ${st.by || st.at ? html`<p class="muted small" data-af-confirmed>Confirmed by ${st.by || (s.confirmed.role === 'tc' ? 'the TC' : 'the agent')}${st.at ? ` on ${new Date(st.at).toLocaleDateString('en-US')}` : ''}</p>` : ''}
  </div>`;
}

export function boxHtml(data, viewer) {
  const sides = AGENT_FEE_SIDES.map(([k]) => k).filter((k) => data.sides[k]);
  if (!sides.length) return '';
  const intro = viewer.kind === 'agent' ? 'Your commission and fees on this file. Check them and click Edit to change or confirm them.'
    : viewer.kind === 'tc' ? 'The commission and fees of the agents you work for. You can confirm or change them for the agent; the agent is told.' : 'Each agent\'s commission, admin fee and other fees. Agents see only their own side. Buyers and sellers never see these.';
  return html`<section class="card agent-fees" data-agent-fees aria-label="Agent fees"><h3>Agent fees</h3><p class="muted small">${intro}</p>
    <div class="af-sides">${sides.map((k) => sideHtml(k, data.fees[k], data.sides[k]))}</div>
    <p class="af-foot"><button type="button" class="ghost" data-af-history-btn aria-expanded="false">Change history</button></p>
    <div data-af-history hidden></div></section>`;
}

const otherRow = (o, i, side) => html`<div class="af-other form-grid" data-af-other-edit="${i}">
  <label>Description<input name="other.${i}.description" maxlength="120" autocomplete="off" value="${o.description || ''}"></label>
  <label>Amount<input name="other.${i}.amount" inputmode="decimal" data-money autocomplete="off" value="${o.amount == null ? '' : o.amount}"></label>
  <label>Paid to<input name="other.${i}.paidTo" maxlength="120" autocomplete="off" value="${o.paidTo || ''}"></label>
  <label>Paid by<select name="other.${i}.payer">${PAYERS.map(([k, l]) => html`<option value="${k}" ${k === (o.payer || defaultPayer(side)) ? raw('selected') : ''}>${l}</option>`)}</select></label>
  <p class="span2"><button type="button" class="ghost" data-af-remove="${i}">Remove this fee</button></p></div>`;

export function formHtml(side, s, { price, needReason, asAgent = false }) {
  const c = (s && s.commission) || {}; const a = (s && s.admin) || {}; const others = (s && s.other) || [];
  const payerSel = (name, val, list = PAYERS) => html`<select name="${name}">${list.map(([k, l]) => html`<option value="${k}" ${k === (val || defaultPayer(side)) ? raw('selected') : ''}>${l}</option>`)}</select>`;
  const splitOn = c.payer === 'split';
  return html`<form class="af-form" data-af-form="${side}" novalidate>
    <p class="muted small">Sales price on this file: <b data-af-price>${Number(price) > 0 ? fmtMoney(price) : 'not entered yet'}</b>. Commission amount = commission base × commission % + additional amount. Leave the base blank to use the sales price. Type the % or the amount; the other one fills in.</p>
    <input type="hidden" name="commissionBasis" value="${c.basis || 'percent'}">
    <fieldset class="form-grid"><legend>${PANEL_TITLE[side]}</legend>
      <label>Commission base<input name="commissionBase" inputmode="decimal" data-money autocomplete="off" placeholder="Sales price" aria-label="Commission base" value="${c.base == null ? '' : Number(c.base).toFixed(2)}"></label>
      <label>Commission %<input name="commissionPercent" inputmode="decimal" autocomplete="off" value="${c.percent == null ? '' : Number(c.percent).toLocaleString('en-US', { maximumFractionDigits: 4, useGrouping: false })}"></label>
      <label>Additional amount<input name="additionalAmount" inputmode="decimal" data-money autocomplete="off" aria-label="Additional amount" value="${c.additional ? Number(c.additional).toFixed(2) : ''}"></label>
      <label>Commission amount<input name="commissionAmount" inputmode="decimal" data-money autocomplete="off" aria-label="Commission amount" value="${c.amount == null ? '' : Number(c.amount).toFixed(2)}"></label>
      <label>Commission Paid By${payerSel('commissionPayer', c.payer, COMMISSION_PAYERS)}</label>
      <label data-af-split="buyer" ${splitOn ? '' : raw('hidden')}>Buyer amount<input name="splitBuyer" inputmode="decimal" data-money autocomplete="off" aria-label="Buyer amount" value="${c.splitBuyer == null ? '' : Number(c.splitBuyer).toFixed(2)}"></label>
      <label data-af-split="seller" ${splitOn ? '' : raw('hidden')}>Seller amount<input name="splitSeller" inputmode="decimal" data-money autocomplete="off" aria-label="Seller amount" value="${c.splitSeller == null ? '' : Number(c.splitSeller).toFixed(2)}"></label>
    </fieldset>
    <fieldset class="form-grid" data-af-admin-section><legend>Admin fee</legend>
      <label>Admin fee $<input name="adminAmount" inputmode="decimal" data-money autocomplete="off" value="${a.amount == null ? '' : Number(a.amount).toFixed(2)}"></label>
      <label>Payable by${payerSel('adminPayer', a.payer, ADMIN_PAYERS)}</label>
      <p class="muted small span2" data-af-admin-split ${a.payer === 'split' ? '' : raw('hidden')}>Split means the buyer and the seller each pay half. An odd cent goes to the seller. <span data-af-admin-halves></span></p>
    </fieldset>
    <fieldset><legend>Other fees (up to ${MAX_OTHER_FEES})</legend><div data-af-others>${others.map((o, i) => otherRow(o, i, side))}</div>
      <p><button type="button" class="ghost" data-af-add ${others.length >= MAX_OTHER_FEES ? raw('hidden') : ''}>+ Add other fee</button></p></fieldset>
    ${needReason ? html`<label class="af-reason">Reason for the change (required: the agent confirmed these fees, and they will see it)<textarea name="reason" rows="2" maxlength="500" required></textarea></label>` : ''}
    <p class="err-text small" data-af-err role="alert"></p>
    <p class="acct-form-actions"><button type="submit" class="m-btn" data-af-save>${asAgent ? 'Save and confirm' : 'Save agent fees'}</button> <button type="button" class="ghost" data-close>Cancel</button></p>
  </form>`;
}

/* read the edit form into readAgentFees' input */
export function readForm(form) {
  const v = (n) => (form.elements[n] ? form.elements[n].value : '');
  const other = $$('[data-af-other-edit]', form).map((row) => { const i = row.getAttribute('data-af-other-edit');
    return { description: v(`other.${i}.description`), amount: v(`other.${i}.amount`), paidTo: v(`other.${i}.paidTo`), payer: v(`other.${i}.payer`) }; });
  return { commissionBasis: v('commissionBasis'), commissionPercent: v('commissionPercent'), commissionAmount: v('commissionAmount'), commissionPayer: v('commissionPayer'),
    commissionBase: v('commissionBase'), additionalAmount: v('additionalAmount'), splitBuyer: v('splitBuyer'), splitSeller: v('splitSeller'),
    adminAmount: v('adminAmount'), adminPayer: v('adminPayer'), other, reason: v('reason') };
}

function mountForm(form, side, price) {
  const field = (n) => form.querySelector(`[name="${n}"]`);
  const basis = field('commissionBasis'); const pctIn = field('commissionPercent'); const amtIn = field('commissionAmount');
  const baseIn = field('commissionBase'); const addIn = field('additionalAmount');   const payer = field('commissionPayer');
  const adminAmt = field('adminAmount'); const adminPayer = field('adminPayer');
  const adminNote = form.querySelector('[data-af-admin-split]'); const adminHalf = form.querySelector('[data-af-admin-halves]');
  const showAdminSplit = () => {
    const on = !!(adminPayer && adminPayer.value === 'split');
    if (adminNote) adminNote.hidden = !on;
    if (!on || !adminHalf) return;
    const rawAmt = String(adminAmt.value || '').trim();
    if (!rawAmt) { adminHalf.textContent = 'Enter the admin fee to see each half.'; return; }
    try {
      const n = feeNumber(rawAmt, 'Admin fee');
      if (n == null || n < 0) throw new Error('bad');
      const h = adminHalves(n);
      adminHalf.textContent = `Buyer pays ${fmtMoney(h.splitBuyer)}. Seller pays ${fmtMoney(h.splitSeller)}.`;
    } catch (e) { adminHalf.textContent = 'Enter the admin fee as a dollar amount.'; }
  };
  const fill = (from) => {
    basis.value = from; const typed = from === 'percent' ? pctIn.value : amtIn.value; const other = from === 'percent' ? amtIn : pctIn;
    if (!String(typed).trim()) { other.value = ''; return; }
    try {
      const r = syncCommission(price, from, typed, { base: baseIn.value, additional: addIn.value });
      other.value = from === 'percent' ? r.amount.toFixed(2) : String(Math.round(r.percent * 10000) / 10000);
    } catch (e) { other.value = ''; }
  };
  pctIn.addEventListener('input', () => fill('percent'));
  amtIn.addEventListener('input', () => fill('amount'));
  baseIn.addEventListener('input', () => fill(basis.value === 'amount' ? 'amount' : 'percent'));
  addIn.addEventListener('input', () => fill(basis.value === 'amount' ? 'amount' : 'percent'));
  const showSplit = () => { const on = payer.value === 'split'; form.querySelectorAll('[data-af-split]').forEach((el) => { el.hidden = !on; }); };
  payer.addEventListener('change', showSplit); showSplit();
  if (adminAmt) adminAmt.addEventListener('input', showAdminSplit);
  if (adminPayer) adminPayer.addEventListener('change', showAdminSplit);
  showAdminSplit();
  const list = $('[data-af-others]', form); const add = $('[data-af-add]', form);
  const count = () => $$('[data-af-other-edit]', form).length;
  add.addEventListener('click', () => {
    if (count() >= MAX_OTHER_FEES) return;
    const ids = $$('[data-af-other-edit]', form).map((r) => Number(r.getAttribute('data-af-other-edit')));
    const i = ids.length ? Math.max(...ids) + 1 : 0;
    list.insertAdjacentHTML('beforeend', String(otherRow({}, i, side)));
    add.hidden = count() >= MAX_OTHER_FEES; const first = $(`[name="other.${i}.description"]`, form); if (first) first.focus();
  });
  form.addEventListener('click', (e) => { const b = e.target.closest('[data-af-remove]'); if (!b) return; const row = b.closest('[data-af-other-edit]'); if (row) row.remove(); add.hidden = count() >= MAX_OTHER_FEES; });
}

/* AF-3: "You're changing X from $A to $B" before an agent or TC saves */
export function checkHtml(side, changes, viewer) {
  const who = viewer.kind === 'tc' ? 'for the agent ' : '';
  return html`<div class="af-check" data-af-check>
    ${changes.length ? html`<p><strong>You're changing ${who}the ${SIDE_LABEL[side].toLowerCase()} fees:</strong></p>
      <ul class="af-check-list">${changes.map((c) => html`<li data-af-change>${c.label}: from <b>${c.from}</b> to <b>${c.to}</b></li>`)}</ul>`
      : html`<p data-af-no-change><strong>You're confirming ${who}these fees as they are.</strong></p>`}
    <p class="muted small">Saving marks them "${viewer.kind === 'tc' ? 'Confirmed by TC' : 'Agent confirmed'}" and tells the CLA processor${viewer.kind === 'tc' ? ' and the agent' : ''}.</p>
    <p class="acct-form-actions"><button type="button" class="m-btn" data-af-confirm>Yes, save and confirm</button> <button type="button" class="ghost" data-af-back>Go back</button></p></div>`;
}

const KIND = { commission: 'Commission', admin: 'Admin fee', other: 'Other fee' };
const SOURCE = { staff: 'CLA staff', agent: 'Agent', tc: 'TC', system: 'Automatic' };
export function valueText(v) {
  if (!v) return 'None';
  if (v.kind === 'commission') return `${pct(v.percent)} / ${fmtMoney(v.amount)}${payerText(v.payer, v)}`;
  if (v.kind === 'other') return `${v.description} ${fmtMoney(v.amount)} to ${v.paidTo}${payerText(v.payer, v)}`;
  return `${fmtMoney(v.amount)}${payerText(v.payer, v)}`;
}
export function historyHtml(rows) {
  if (!rows.length) return html`<p class="muted small" data-af-history-empty>No changes yet.</p>`;
  return html`<div class="af-history-wrap"><table class="tbl" data-af-history-table><thead><tr><th>When</th><th>Who</th><th>Fee</th><th>Was</th><th>Now</th><th>Reason</th></tr></thead><tbody>
    ${rows.map((r) => html`<tr><td>${fmtDateTime(r.at)}</td><td>${r.byName || SOURCE[r.source] || ''} <span class="muted small">(${SOURCE[r.source] || r.source})</span></td>
      <td>${SIDE_LABEL[r.side] || r.side}: ${KIND[r.kind] || r.kind}${r.kind === 'other' ? ` ${r.slot}` : ''}</td><td>${valueText(r.oldValue)}</td><td>${valueText(r.newValue)}</td><td>${r.reason || ''}</td></tr>`)}
  </tbody></table></div>`;
}

/* The box for this viewer, or nothing. Returns { html, mount }. */
export async function agentFeesPanel(ctx, deal) {
  const none = { html: '', mount() {} };
  const { api } = ctx; const viewer = viewerOf(ctx.user);
  if (!viewer || !api || !api.getAgentFees || isRefi(deal)) return none;
  let data;
  try { data = await api.getAgentFees(deal.id); } catch (e) { return none; }   // not switched on, or no access: show nothing (AGENTS.md rule 13)
  if (!data || !data.sides || !Object.keys(data.sides).length) return none;
  const price = deal.purchasePrice;
  const paint = (root) => {
    const box = $('[data-agent-fees]', root); if (!box) return;
    box.addEventListener('click', async (e) => {
      const ed = e.target.closest('[data-af-edit]');
      if (ed) { openEdit(ed.getAttribute('data-af-edit')); return; }
      const hb = e.target.closest('[data-af-history-btn]');
      if (hb) {
        const slot = $('[data-af-history]', box); const open = slot.hidden;
        hb.setAttribute('aria-expanded', open ? 'true' : 'false'); slot.hidden = !open;
        if (open) { slot.innerHTML = '<p class="muted small">Loading&hellip;</p>'; try { slot.innerHTML = String(historyHtml(await api.getAgentFeeHistory(deal.id))); } catch (x) { slot.innerHTML = String(html`<p class="err-text small">${agentFeeError(x)}</p>`); } }
      }
    });
  };
  const repaint = async () => {
    const box = $('[data-agent-fees]'); if (!box) return;
    data = await api.getAgentFees(deal.id);
    const tmp = document.createElement('div'); tmp.innerHTML = String(boxHtml(data, viewer));
    const next = tmp.firstElementChild; if (next) { box.replaceWith(next); paint(next.parentNode); }
  };
  const openEdit = (side) => {
    const s = data.fees[side];
    const confirmed = !!(s && s.confirmed);
    const needReason = viewer.kind === 'staff' && confirmed;
    const confirmer = viewer.kind === 'agent' || viewer.kind === 'tc';
    const m = modal(`${SIDE_LABEL[side]} fees`, formHtml(side, s, { price, needReason, asAgent: confirmer }), { wide: true });
    const form = $('[data-af-form]', m); mountForm(form, side, price);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('[data-af-err]', form); err.textContent = '';
      const btn = $('[data-af-save]', form);
      try {
        const input = readForm(form);
        const fees = readAgentFees(input, { side, price });
        if (needReason && String(input.reason || '').trim().length < 3) throw new Error('The agent confirmed these fees. Enter a reason for the change.');
        const doSave = async () => {
          btn.disabled = true;
          await api.saveAgentFees(deal.id, side, fees, input.reason || '');
          closeModal();
          toast(viewer.kind === 'agent' ? 'Your fees are saved and confirmed.' : viewer.kind === 'tc' ? 'Fees saved and confirmed for the agent.' : 'Agent fees saved.');
          await repaint();
        };
        if (!confirmer) { await doSave(); return; }
        // AF-3: show what changes first; the form stays underneath with everything typed
        const old = $('[data-af-check]', m); if (old) old.remove();
        form.hidden = true;
        form.insertAdjacentHTML('afterend', String(checkHtml(side, feeChanges(s, fees), viewer)));
        const check = $('[data-af-check]', m);
        $('[data-af-back]', check).addEventListener('click', () => { check.remove(); form.hidden = false; });
        $('[data-af-confirm]', check).addEventListener('click', async (ev) => {
          ev.currentTarget.disabled = true;
          try { await doSave(); } catch (x) { check.remove(); form.hidden = false; err.textContent = agentFeeError(x); btn.disabled = false; }
        });
      } catch (x) { err.textContent = agentFeeError(x); btn.disabled = false; }   // the form stays open with what was typed (rule 15)
    });
  };
  return { html: boxHtml(data, viewer), mount: paint };
}

/* One place for commissions (John, Nov 13 2026): the other forms that used to take a commission now point here. */
export function agentFeesPointer(where = 'modal', dealId = '') {
  const box = where === 'link' && dealId ? html`<a href="#/deals/${dealId}" data-agent-fees-link>Agent fees</a>` : html`<strong>Agent fees</strong>`;
  return html`<p class="muted small span2" data-agent-fees-pointer>Commissions, admin fees and other agent fees are entered in the ${box} box on the file overview${where === 'modal' ? ' (close this window to get to it)' : ''}. That is the only place they are kept, so they always match Accounting, the CD and the ALTA statement.</p>`;
}

/* Read-only summary of both sides, for Accounting > Basic Info. data = api.getAgentFees(). */
export function agentFeesSummaryHtml(data, dealId) {
  const sides = AGENT_FEE_SIDES.map(([k]) => k).filter((k) => data && data.sides && data.sides[k]);
  return html`<section class="card acct-form" data-agent-fees-summary><h3>Commissions and agent fees</h3>
    ${sides.length ? html`<div class="af-sides">${sides.map((k) => sideHtml(k, data.fees[k], 'read'))}</div>` : html`<p class="muted small" data-agent-fees-none>None entered yet.</p>`}
    ${agentFeesPointer('link', dealId)}</section>`;
}

/* Place Order (before the file exists): each side's commission (% or $, kept in step with the purchase price typed on the form),
 * Commission Paid By (Buyer, Seller, or Split), and an admin fee. Saved as Agent fees once the order is created; other fees are added later in the Agent fees box.
 * FF-089: the selling agent is the buyer's agent side, the same side as Selling Agent Commission on the file. */
export function placeOrderFeesHtml() {
  const side = (k, label) => html`<fieldset class="span2 form-grid af-po-side" data-po-agent-fees="${k}"><legend>${label}</legend>
    <input type="hidden" name="af.${k}.basis" value="percent">
    <label>Commission %<input name="af.${k}.percent" inputmode="decimal" autocomplete="off" aria-label="${label} commission percent"></label>
    <label>Commission $<input name="af.${k}.amount" inputmode="decimal" data-money autocomplete="off" aria-label="${label} commission dollars"></label>
    <label>Commission Paid By<select name="af.${k}.payer" data-commission-paid-by="${k}" aria-label="${label} commission paid by">${COMMISSION_PAYERS.map(([v, l]) => html`<option value="${v}" ${v === defaultPayer(k) ? raw('selected') : ''}>${l}</option>`)}</select></label>
    <label data-af-split="buyer" hidden>Buyer amount<input name="af.${k}.splitBuyer" inputmode="decimal" data-money autocomplete="off" aria-label="${label} buyer share"></label>
    <label data-af-split="seller" hidden>Seller amount<input name="af.${k}.splitSeller" inputmode="decimal" data-money autocomplete="off" aria-label="${label} seller share"></label>
    <label>Admin fee $<input name="af.${k}.admin" inputmode="decimal" data-money autocomplete="off" aria-label="${label} admin fee"></label></fieldset>`;
  return html`${side('listing', 'Listing agent')}${side('buyer', "Buyer's agent")}
    <p class="muted small span2">Type the commission as a % or a $ amount; the other one fills in from the purchase price. Commission Paid By is Buyer, Seller, or Split. For Split, enter what the buyer pays and what the seller pays. Those two amounts must add up to the commission. The same choice is on the Agent fees box after the file is open. The admin fee starts as paid by the buyer on the buyer's agent side and by the seller on the listing side. On the file, Payable by can be Buyer, Seller, or Split (Buyer and Seller). Change that, or add other fees, in the Agent fees box. Agents see only their own side. Buyers and sellers never see these.</p>`;
}

const poField = (form, n) => form.querySelector(`[name="${n}"]`);
const poVal = (form, n) => { const f = poField(form, n); return f ? f.value : ''; };
export function mountPlaceOrderFees(form, priceOf) {
  for (const [k] of AGENT_FEE_SIDES) {
    const basis = poField(form, `af.${k}.basis`); const pctIn = poField(form, `af.${k}.percent`); const amtIn = poField(form, `af.${k}.amount`);
    if (!basis || !pctIn || !amtIn) continue;
    const fill = (from) => {
      basis.value = from; const typed = from === 'percent' ? pctIn.value : amtIn.value; const other = from === 'percent' ? amtIn : pctIn;
      if (!String(typed).trim()) { other.value = ''; return; }
      try { const r = syncCommission(priceOf(), from, typed); other.value = from === 'percent' ? r.amount.toFixed(2) : String(Math.round(r.percent * 10000) / 10000); } catch (e) { other.value = ''; }
    };
    pctIn.addEventListener('input', () => fill('percent'));
    amtIn.addEventListener('input', () => fill('amount'));
    form.addEventListener('input', (e) => { if (e.target && e.target.name === 'purchasePrice' && String(basis.value === 'percent' ? pctIn.value : amtIn.value).trim()) fill(basis.value); });
    const payer = poField(form, `af.${k}.payer`);
    const showSplit = () => { const on = !!(payer && payer.value === 'split'); form.querySelectorAll(`[data-po-agent-fees="${k}"] [data-af-split]`).forEach((el) => { el.hidden = !on; }); };
    if (payer) { payer.addEventListener('change', showSplit); showSplit(); }
  }
}

/* The Place Order fields -> { listing: payload|null, buyer: payload|null } for saveAgentFees. Throws a plain message (checked before the order is placed). */
export function readPlaceOrderFees(form, price) {
  const out = {};
  for (const [k, label] of AGENT_FEE_SIDES) {
    const p = String(poVal(form, `af.${k}.percent`)).trim(); const a = String(poVal(form, `af.${k}.amount`)).trim();
    const payer = String(poVal(form, `af.${k}.payer`)).trim();
    const splitBuyer = String(poVal(form, `af.${k}.splitBuyer`)).trim(); const splitSeller = String(poVal(form, `af.${k}.splitSeller`)).trim();
    // the box last typed in wins; if only one box has a figure (a restored draft), that one
    const basis = p && a ? (poVal(form, `af.${k}.basis`) === 'amount' ? 'amount' : 'percent') : a ? 'amount' : 'percent';
    const input = { commissionBasis: basis, commissionPercent: poVal(form, `af.${k}.percent`), commissionAmount: poVal(form, `af.${k}.amount`), commissionPayer: payer, splitBuyer, splitSeller, adminAmount: poVal(form, `af.${k}.admin`) };
    const noCommission = !String(input.commissionPercent).trim() && !String(input.commissionAmount).trim();
    if (noCommission && (payer === 'split' || splitBuyer || splitSeller || (payer && payer !== defaultPayer(k)))) throw new Error(`${label}: Enter the commission % or the commission $ before choosing who pays it.`);
    if (noCommission && !String(input.adminAmount).trim()) { out[k] = null; continue; }
    try { const fees = readAgentFees(input, { side: k, price }); out[k] = fees.commission || fees.admin ? fees : null; } catch (e) { throw new Error(`${label}: ${e.message}`); }
  }
  return out;
}
