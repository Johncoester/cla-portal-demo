// Accounting > Basic Info (FF-094). Five order figures only. Contract-term columns stay stored and are not shown or overwritten.
import { html, raw, $, $$, guard, formData, toast, options } from '../ui.js?v=202611161500';
import { runsOrders, isRefi, moneyShow, moneyAmount } from '../data/constants.js?v=202611247700';
import { earnestView, readEarnest } from '../data/earnest-commission.js?v=202611246500';
import { agentFeesSummaryHtml } from './agent-fees-box.js?v=202611247700';
import { sourceChoices, referralContacts } from '../data/place-order.js?v=202611247700';
import { disbursementFor } from '../data/disbursement.js?v=202611190600';

function earnestAccounting(deal, user) {
  if (isRefi(deal)) return '';
  const ev = earnestView(deal);
  const edit = runsOrders(user);
  const moneyBox = (name, label, value) => html`<label>${label}<input name="${name}" inputmode="decimal" data-money value="${moneyShow(value)}" aria-label="${label}" autocomplete="off"></label>`;
  return html`<form class="card acct-form" data-earnest-accounting data-earnest-edit="${edit ? 'yes' : 'no'}"><h3>Earnest money</h3>
    <p class="muted small">Earnest money is optional. Saved on the order, the same place as Add New Order. A refinance has none.</p>
    <div class="form-grid">
      ${moneyBox('emdAmount', 'EMD amount', deal.emdAmount)}
      <label>EMD due date<input type="date" name="emdDueDate" value="${deal.emdDueDate || ''}"></label>
      <label>EMD held by<input name="emdHeldBy" maxlength="200" value="${ev.held}" aria-label="EMD held by"></label>
      ${moneyBox('emdToSeller', 'Deposit already paid to the seller', ev.toSeller)}
    </div>
    <p class="muted small" data-excess-deposit-help>Fill in "Deposit already paid to the seller" only when someone other than CLA holds the deposit and has given it to the seller. It shows as Excess Deposit on the seller's side (CD line N.01), comes off the seller's proceeds, and is not counted as money CLA receives. The buyer still gets credit for the whole deposit.</p>
    <p class="acct-form-actions">${edit ? html`<button class="m-btn" type="submit">Save earnest money</button>` : html`<span class="muted small">Read only.</span>`}</p>
  </form>`;
}

function mountEarnest(root, api, deal, user, refresh) {
  const form = $('[data-earnest-accounting]', root);
  if (!form || isRefi(deal)) return;
  if (!runsOrders(user)) { $$('input, select, button', form).forEach((el) => { el.disabled = true; }); return; }
  form.addEventListener('submit', guard(async (e) => {
    e.preventDefault();
    const f = formData(form);
    const earnest = readEarnest(f, { emdAmount: moneyAmount(f.emdAmount) });
    await api.updateDeal(deal.id, { emdAmount: moneyAmount(f.emdAmount), emdDueDate: f.emdDueDate || '', ...earnest });
    toast('Earnest money saved');
    if (refresh) refresh();
  }));
}

const READ_ONLY_NOTE = 'Read only for your role (Sales Person, Sales Team, Transaction Coordinator). A Processor, Admin, or Super admin enters basic info.';

/* The file header used on Accounting leaves the people and the source blank. Load the full order so Source of business
 * shows the person already chosen, and so a save does not clear that person. */
async function fileForBasic(api, deal) {
  const shell = !deal.participants || !deal.participants.length;
  if (!shell) return { file: deal, sourceKnown: true };
  if (!api.getDeal) return { file: deal, sourceKnown: false };
  try {
    const full = await api.getDeal(deal.id);
    if (!full) return { file: deal, sourceKnown: false };
    return { file: { ...deal, ...full, participants: full.participants || [] }, sourceKnown: true };
  } catch (e) { return { file: deal, sourceKnown: false }; }
}

function basicForm(file, canEdit, sourceKnown) {
  const refi = isRefi(file);
  const auto = disbursementFor({ ...file, disbursementDate: '' });
  const dis = canEdit ? '' : raw('disabled');
  const srcOpts = sourceKnown ? sourceChoices(file.sourceOfBusiness, file.sourceOfBusinessLabel, refi, referralContacts(file.participants || [])) : [];
  const sales = refi
    ? html`<p class="muted small span2" data-refi-basic>A refinance has no sales price.</p>`
    : html`<label data-basic-field="purchasePrice">Sales price<input name="purchasePrice" data-money inputmode="decimal" autocomplete="off" placeholder="Unknown" aria-label="Sales price" value="${moneyShow(file.purchasePrice)}" ${dis}></label>`;
  const source = sourceKnown
    ? html`<label class="span2" data-basic-field="sourceOfBusiness">Source of business<select name="sourceOfBusiness" aria-label="Source of business" ${dis}><option value="">(not set)</option>${options(srcOpts, file.sourceOfBusiness || '', (o) => o.label, (o) => o.value)}</select></label>`
    : html`<p class="notice warn" data-source-missing>Source of business did not load. The other fields can still be saved. Close this and open Basic Info again to change the source.</p>`;
  return html`<form id="acct-basic-form" class="card acct-form" data-basic-info data-basic-edit="${canEdit ? 'yes' : 'no'}" data-source-known="${sourceKnown ? 'yes' : 'no'}" novalidate>
    <h3>Basic info</h3>
    <p class="muted small">These are the order's figures. An empty amount is unknown, not zero. Seller credit is entered under Charges, L/N.</p>
    ${canEdit ? '' : html`<p class="notice info" data-readonly-note>${READ_ONLY_NOTE}</p>`}
    <div class="form-grid">
      ${sales}
      <label data-basic-field="loanAmount">Loan amount<input name="loanAmount" data-money inputmode="decimal" autocomplete="off" placeholder="Unknown" aria-label="Loan amount" value="${moneyShow(file.loanAmount)}" ${dis}></label>
      <label data-basic-field="closingDate">Closing date<input type="date" name="closingDate" aria-label="Closing date" value="${file.closingDate || ''}" ${dis}></label>
      <label data-basic-field="disbursementDate">Disbursement date<input type="date" name="disbursementDate" data-disbursement-input aria-label="Disbursement date" value="${file.disbursementDate || ''}" ${dis}><span class="field-hint">Leave blank for the automatic date (${auto.note}).</span></label>
      ${source}
    </div>
    <p class="err-text small" data-form-err></p>
    <p class="acct-form-actions">${canEdit ? html`<button class="m-btn" type="submit" data-save-basic>Save basic info</button>` : html`<span class="muted small">Read only.</span>`}</p>
  </form>`;
}

export async function contractView(api, deal, user) {
  const { file, sourceKnown } = await fileForBasic(api, deal);
  let terms = null;
  if (api.getContractTerms) { try { terms = await api.getContractTerms(deal.id); } catch (e) { terms = null; } }
  const canEdit = terms ? !!terms.canEdit : runsOrders(user);
  const body = basicForm(file, canEdit, sourceKnown);
  let fees = null; if (!isRefi(file) && api.getAgentFees) { try { fees = await api.getAgentFees(deal.id); } catch (e) { fees = null; } }   // one place for commissions (Nov 13)
  return { body: html`${earnestAccounting(file, user)}${fees ? agentFeesSummaryHtml(fees, deal.id) : ''}${body}`, mount: (root, c = {}) => { mountBasic(root, api, file, canEdit, sourceKnown, c.refresh); mountEarnest(root, api, file, user, c.refresh); } };
}

export function basicInfoPatch(deal, fields, sourceKnown) {
  const patch = { closingDate: fields.closingDate || '', disbursementDate: fields.disbursementDate || '' };
  patch.loanAmount = moneyAmount(fields.loanAmount);
  if (!isRefi(deal)) patch.purchasePrice = moneyAmount(fields.purchasePrice);
  if (sourceKnown) patch.sourceOfBusiness = fields.sourceOfBusiness || '';
  return patch;
}

function mountBasic(root, api, deal, canEdit, sourceKnown, refresh) {
  const form = $('#acct-basic-form', root);
  if (!form || !canEdit) return;
  form.addEventListener('submit', guard(async (e) => {
    e.preventDefault();
    const err = $('[data-form-err]', form);
    err.textContent = '';
    const f = formData(form);
    let patch;
    try { patch = basicInfoPatch(deal, f, sourceKnown); }
    catch (x) { err.textContent = x.message; toast(x.message, 'err'); return; }
    try {
      const saved = await api.updateDeal(deal.id, patch);
      if (!saved || !saved.id) throw new Error('Basic info was not saved. Check the fields and try again.');
      toast('Basic info saved.');
      if (refresh) refresh(); else location.reload();
    } catch (x) { err.textContent = x.message; toast(x.message, 'err'); }
  }));
}
