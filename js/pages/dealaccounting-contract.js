// TEST contract figures. Estimates only. Blank stays blank. Nothing here is a receipt, payoff, or Closing Disclosure.
import { html, raw, $, $$, guard, formData, toast } from '../ui.js?v=202611071751';
import { CONTRACT_FIELDS, CONTRACT_GROUPS, illustrative } from '../data/contract-terms.js?v=202611091140';

const moneyValue = (n) => (n == null || n === '' ? '' : Number(n).toFixed(2));
const numValue = (n) => (n == null || n === '' ? '' : String(n));
const READ_ONLY_NOTE = 'Read only for your role (Sales Person, Sales Team, Transaction Coordinator). A Processor, Admin, or Super admin enters contract figures.';

function fieldHtml(f, terms, locked) {
  const v = terms.fields[f.key];
  const flag = (terms.flags || {})[f.key] || {};
  const dis = locked ? raw('disabled') : '';
  let control;
  if (f.kind === 'money') control = html`<input name="${f.key}" data-money inputmode="decimal" placeholder="Unknown" autocomplete="off" value="${moneyValue(v)}" ${dis}>`;
  else if (f.kind === 'percent') control = html`<input name="${f.key}" inputmode="decimal" placeholder="Unknown" autocomplete="off" value="${numValue(v)}" ${dis}>`;
  else if (f.kind === 'date') control = html`<input type="date" name="${f.key}" value="${v || ''}" ${dis}>`;
  else if (f.kind === 'select') control = html`<select name="${f.key}" ${dis}>${(f.options || []).map(([k, l]) => html`<option value="${k}" ${String(k) === String(v ?? '') ? raw('selected') : ''}>${l}</option>`)}</select>`;
  else if (f.kind === 'note') control = html`<textarea name="${f.key}" rows="3" maxlength="${f.max || 2000}" ${dis}>${v || ''}</textarea>`;
  else control = html`<input name="${f.key}" maxlength="${f.max || 200}" autocomplete="off" placeholder="Unknown" value="${v || ''}" ${dis}>`;
  const basis = f.basis ? html`<label>How it was obtained<select name="${f.key}Basis" data-basis-for="${f.key}" ${dis}><option value="">Not set</option>${f.basis.map((k) => html`<option value="${k}" ${flag.basis === k ? raw('selected') : ''}>${k}</option>`)}</select><span class="field-hint">Provisional. Not a verified ledger entry.</span></label>` : '';
  const source = f.basis ? html`<label class="wide">Source for this figure<input name="${f.key}Source" maxlength="500" autocomplete="off" placeholder="Page, form, or email. Blank if not recorded." value="${flag.source || ''}" ${dis}></label>` : '';
  const wide = f.kind === 'note' || f.kind === 'text' || (f.kind === 'percent' && !f.basis) ? 'contract-alone' : '';
  return html`<label class="${wide}" data-contract-field="${f.key}">${f.label}${control}${f.hint ? html`<span class="field-hint">${f.hint}</span>` : ''}</label>${basis}${source}`;
}

export async function contractView(api, deal) {
  const terms = api.getContractTerms ? await api.getContractTerms(deal.id) : null;
  if (!terms) return { body: html`<p class="notice warn" data-contract-missing>Contract figures are not available from this connection. Nothing was saved.</p>`, mount() {} };
  const locked = !terms.canEdit || !!terms.blocked;
  const groups = CONTRACT_GROUPS.map(([id, label]) => {
    const fields = CONTRACT_FIELDS.filter((f) => f.group === id);
    return html`<fieldset class="card acct-form" data-contract-group="${id}"><legend>${label}</legend><div class="form-grid">${fields.map((f) => fieldHtml(f, terms, locked))}</div>
      ${id === 'price' ? html`<p class="small muted" data-illustrative="loan" hidden></p>` : ''}
      ${id === 'credit' ? html`<p class="small muted" data-illustrative="credit" hidden></p><p class="small muted" data-illustrative="broker" hidden></p>` : ''}</fieldset>`;
  });
  const body = html`<div data-contract-sheet data-contract-posture="estimate" data-contract-saved="${terms.saved ? 'yes' : 'no'}">
    <div class="notice warn" data-contract-banner>TEST contract figures only. An empty box is unknown, not zero. These figures are not funds received, not a payoff, and not a Closing Disclosure. The fee ledger does not import them.</div>
    ${terms.blocked ? html`<p class="notice warn" data-contract-blocked>${terms.blocked}</p>` : ''}
    ${terms.canEdit ? '' : html`<p class="notice info" data-readonly-note>${READ_ONLY_NOTE}</p>`}
    <form id="acct-contract-form" data-contract-form novalidate>
      ${groups}
      <p class="err-text small" data-form-err></p>
      ${terms.canEdit ? html`<div class="acct-form-actions"><button class="m-btn" type="submit" data-save-contract ${terms.blocked ? raw('disabled') : ''}>Save contract figures</button><span class="muted small">${terms.saved ? 'Saved on this order as an estimate.' : 'Nothing is saved until this succeeds.'}</span></div>` : ''}
    </form></div>`;
  return { body, mount: (root, c = {}) => mountContract(root, api, deal, terms, c.refresh) };
}

function readNum(form, name) {
  const el = form.elements[name];
  if (!el) return null;
  const t = String(el.value || '').trim().replace(/[$,%\s]/g, '');
  if (!t || !/^\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}
function showMath(form, hook, amount, percent, sentence) {
  const node = $(`[data-illustrative="${hook}"]`, form);
  if (!node) return;
  const n = illustrative(amount, percent);
  if (n == null) { node.hidden = true; node.textContent = ''; return; }
  node.hidden = false;
  node.textContent = `${sentence} ${n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}. Not saved unless you type that dollar figure yourself.`;
}
function mountContract(root, api, deal, terms, refresh) {
  const form = $('#acct-contract-form', root);
  if (!form) return;
  const paint = () => {
    const price = readNum(form, 'salePrice');
    showMath(form, 'loan', price, readNum(form, 'loanPercent'), 'Illustrative contract math only, not a loan amount:');
    showMath(form, 'credit', price, readNum(form, 'sellerCreditPercent'), 'Illustrative contract math only, not a seller credit:');
    showMath(form, 'broker', price, readNum(form, 'buyerBrokerPercent'), 'Illustrative contract math only, not a buyer-broker payable:');
  };
  $$('input', form).forEach((el) => el.addEventListener('input', paint));
  paint();
  if (!terms.canEdit) return;
  form.addEventListener('submit', guard(async (e) => {
    e.preventDefault();
    const err = $('[data-form-err]', form);
    err.textContent = '';
    if (terms.blocked) { err.textContent = terms.blocked; toast(terms.blocked, 'err'); return; }
    try {
      const saved = await api.saveContractTerms(deal.id, formData(form));
      if (!saved || saved.saved !== true) throw new Error('Contract figures were not saved.');
      toast('Contract figures saved. They remain an estimate, not a receipt, payoff, or Closing Disclosure.');
      if (refresh) refresh(); else location.reload();
    } catch (x) { err.textContent = x.message; toast(x.message, 'err'); }
  }));
}
