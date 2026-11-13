/* AGENT FEES box on a file's overview (AF-2; John, Nov 12 2026; spec docs/specs/agent-fees-flow.md).
 * CLA staff who run the file see and edit both agent sides; other staff read them. An agent sees and edits only their own side.
 * Buyers and sellers never get this box (they have their own overview, and the database gives them nothing).
 * Commission: type a % or a $ and the other one fills in from the sales price (they are always in step). Admin fee with who pays it.
 * Up to 5 other fees (description, amount, paid to). Staff changing a fee the agent confirmed must give a reason. Nothing is sent. */
import { html, raw, $, $$, modal, closeModal, toast, fmtMoney, fmtDateTime, pill } from '../ui.js?v=202611161500';
import { isRefi } from '../data/constants.js?v=202611101015';
import { AGENT_FEE_SIDES, SIDE_LABEL, AGENT_ROLE_SIDE, PAYERS, PAYER_LABEL, MAX_OTHER_FEES, defaultPayer, readAgentFees, syncCommission, sideStatus, agentFeeError, feeChanges } from '../data/agent-fees.js?v=202611171010';

const pct = (n) => (n == null ? '' : `${Number(n).toLocaleString('en-US', { maximumFractionDigits: 4 })}%`);
const payerText = (p) => (p ? ` (paid by ${PAYER_LABEL[p] || p})` : '');

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
    <div class="af-side-head"><strong>${SIDE_LABEL[side]}</strong> ${pill(st.text, st.cls)}${access === 'edit' ? html` <button type="button" class="ghost af-edit" data-af-edit="${side}">Edit</button>` : ''}</div>
    <dl class="af-list">
      <dt>Commission</dt><dd data-af-commission>${c ? html`<b>${pct(c.percent)}</b> &middot; <b>${fmtMoney(c.amount)}</b>${payerText(c.payer)}` : html`<span class="muted">Not entered</span>`}</dd>
      <dt>Admin fee</dt><dd data-af-admin>${a ? html`<b>${fmtMoney(a.amount)}</b>${payerText(a.payer)}` : html`<span class="muted">None</span>`}</dd>
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
  const payerSel = (name, val) => html`<select name="${name}">${PAYERS.map(([k, l]) => html`<option value="${k}" ${k === (val || defaultPayer(side)) ? raw('selected') : ''}>${l}</option>`)}</select>`;
  return html`<form class="af-form" data-af-form="${side}" novalidate>
    <p class="muted small">Sales price on this file: <b data-af-price>${Number(price) > 0 ? fmtMoney(price) : 'not entered yet'}</b>. Type the commission as a % or a $ amount; the other one fills in.</p>
    <input type="hidden" name="commissionBasis" value="${c.basis || 'percent'}">
    <fieldset class="form-grid"><legend>Commission</legend>
      <label>Commission %<input name="commissionPercent" inputmode="decimal" autocomplete="off" value="${c.percent == null ? '' : Number(c.percent).toLocaleString('en-US', { maximumFractionDigits: 4, useGrouping: false })}"></label>
      <label>Commission $<input name="commissionAmount" inputmode="decimal" data-money autocomplete="off" value="${c.amount == null ? '' : Number(c.amount).toFixed(2)}"></label>
      <label>Paid by${payerSel('commissionPayer', c.payer)}</label>
    </fieldset>
    <fieldset class="form-grid"><legend>Admin fee</legend>
      <label>Admin fee $<input name="adminAmount" inputmode="decimal" data-money autocomplete="off" value="${a.amount == null ? '' : Number(a.amount).toFixed(2)}"></label>
      <label>Paid by${payerSel('adminPayer', a.payer)}</label>
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
    adminAmount: v('adminAmount'), adminPayer: v('adminPayer'), other, reason: v('reason') };
}

function mountForm(form, side, price) {
  const basis = form.elements.commissionBasis; const pctIn = form.elements.commissionPercent; const amtIn = form.elements.commissionAmount;
  const fill = (from) => {
    basis.value = from; const typed = from === 'percent' ? pctIn.value : amtIn.value; const other = from === 'percent' ? amtIn : pctIn;
    if (!String(typed).trim()) { other.value = ''; return; }
    try { const r = syncCommission(price, from, typed); other.value = from === 'percent' ? r.amount.toFixed(2) : String(Math.round(r.percent * 10000) / 10000); } catch (e) { other.value = ''; }
  };
  pctIn.addEventListener('input', () => fill('percent'));
  amtIn.addEventListener('input', () => fill('amount'));
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
  if (v.kind === 'commission') return `${pct(v.percent)} / ${fmtMoney(v.amount)}${payerText(v.payer)}`;
  if (v.kind === 'other') return `${v.description} ${fmtMoney(v.amount)} to ${v.paidTo}${payerText(v.payer)}`;
  return `${fmtMoney(v.amount)}${payerText(v.payer)}`;
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
