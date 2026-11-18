/* FF-091c. Admin / Super admin: the rate sheet for each state, county, and city.
 * A blank rate is Rate Not Set. Staff see that on Taxes & Fees and can type the fee. */
import { html, raw, $, $$, guard, toast } from '../ui.js?v=202611161500';
import { canEditTaxRates } from '../data/tax-rate-edit.js?v=202611245800';

const money = (n) => (n == null || n === '' ? '' : String(n));
const payerLabel = (p) => (p === 'seller' ? 'Seller pays' : p === 'split' ? '50/50 split' : 'Buyer pays');

function placeLabel(j) {
  if (j.city) return `${j.city}${j.county ? ', ' + j.county : ''}, ${j.state}`;
  if (j.county) return `${j.county}, ${j.state}`;
  return j.name || j.state;
}

export async function render({ api, user, refresh }) {
  if (!canEditTaxRates(user)) throw new Error('Only an Admin or Super admin can see the Tax rates page.');
  const data = await api.listTaxRates();
  const picked = '';
  void picked;
  const body = html`<section data-tax-rates-page>
    <div class="page-head"><p class="eyebrow">Admin</p><h2 class="page-title">Tax rates</h2>
      <p class="muted">Each state, county, and city has its own rates, exemptions, questions, and the default buyer / seller split. Taxes &amp; Fees uses the sheet for the place on the file. A blank rate shows Rate Not Set, and staff type the fee. Leave a rate blank when you do not have it. Only an Admin or Super admin can change these.</p>
      <p class="small">Calvert, Carroll, Frederick, Somerset, and Wicomico have no county transfer tax in the current sheet, so none was added. Baltimore City asks whether the mortgage is recorded with the deed, and whether another exemption applies. Those have no amount until you set one.</p></div>
    <div class="card"><label>Place <select data-tax-place aria-label="State, county, or city">${data.jurisdictions.map((j) => html`<option value="${j.id}">${placeLabel(j)}</option>`)}</select></label>
      <p class="small muted" data-tax-inherit>A county uses its own rows plus the statewide rows. Open the state to edit those.</p></div>
    <div data-tax-detail></div>
    <div class="card"><h3>Add a place</h3>
      <form class="form-grid" data-tax-add-place>
        <label>State <input name="state" maxlength="2" placeholder="MD" aria-label="New state" required></label>
        <label>County <input name="county" maxlength="80" placeholder="Leave blank for the whole state" aria-label="New county"></label>
        <label>City <input name="city" maxlength="80" placeholder="Leave blank unless the city has its own rates" aria-label="New city"></label>
        <label>Name <input name="name" maxlength="80" placeholder="Shown in the list" aria-label="New place name"></label>
        <button class="m-btn" type="submit">Add place</button>
      </form></div>
  </section>`;
  return { title: 'Tax rates', crumbs: [['Tax rates']], body, mount(root) {
    const detail = $('[data-tax-detail]', root);
    const place = () => $('[data-tax-place]', root).value;
    const show = () => { const node = document.createElement('div'); node.innerHTML = String(renderDetail(data, place())); detail.replaceChildren(node); wire(node); };
    show();
    $('[data-tax-place]', root).addEventListener('change', show);
    $('[data-tax-add-place]', root).addEventListener('submit', guard(async (e) => {
      e.preventDefault(); const f = e.target;
      await api.saveTaxJurisdiction({ state: f.elements.state.value, county: f.elements.county.value, city: f.elements.city.value, name: f.elements.name.value });
      toast('Place added'); refresh();
    }));
    function wire(node) {
      $$('[data-line-save]', node).forEach((b) => b.addEventListener('click', guard(async () => {
        const tr = b.closest('tr'); const line = data.lines.find((l) => l.id === b.dataset.lineSave);
        await api.saveTaxRateLine({ id: line.id, jurisdictionId: line.jurisdictionId, kind: line.kind, name: line.name, rate: line.kind === 'recording' ? line.rate : $('[data-line-amount]', tr).value, flatFee: line.kind === 'recording' ? $('[data-line-amount]', tr).value : line.flatFee, paidBy: $('[data-line-payer]', tr).value });
        toast('Rate saved'); refresh();
      })));
      $$('[data-ex-save]', node).forEach((b) => b.addEventListener('click', guard(async () => {
        const tr = b.closest('tr'); const row = data.exemptions.find((e) => e.id === b.dataset.exSave);
        await api.saveTaxExemption({ id: row.id, name: row.name, amount: $('[data-ex-amount]', tr).value, alternateRate: $('[data-ex-rate]', tr).value });
        toast('Exemption saved'); refresh();
      })));
      $$('[data-q-save]', node).forEach((b) => b.addEventListener('click', guard(async () => {
        const tr = b.closest('tr');
        await api.saveTaxQuestion({ id: b.dataset.qSave, label: $('[data-q-label]', tr).value });
        toast('Question saved'); refresh();
      })));
      $$('[data-alloc-save]', node).forEach((b) => b.addEventListener('click', guard(async () => {
        const tr = b.closest('tr'); const row = data.allocations.find((a) => a.id === b.dataset.allocSave);
        await api.saveTaxAllocation({ id: row.id, taxName: row.taxName, paidBy: $('[data-alloc-payer]', tr).value, lawMandated: $('[data-alloc-law]', tr).checked });
        toast('Split saved'); refresh();
      })));
      const add = $('[data-tax-add-line]', node);
      if (add) add.addEventListener('submit', guard(async (e) => {
        e.preventDefault(); const f = e.target; const kind = f.elements.kind.value; const amount = f.elements.amount.value;
        await api.saveTaxRateLine({ jurisdictionId: place(), kind, name: f.elements.name.value, paidBy: 'buyer', rate: kind === 'tax' ? amount : '', flatFee: kind === 'recording' ? amount : '' });
        toast('Rate added'); refresh();
      }));
    }
    function renderDetail(data, id) {
      const lines = data.lines.filter((l) => l.jurisdictionId === id);
      const ex = data.exemptions.filter((e) => e.jurisdictionId === id);
      const qs = data.questions.filter((q) => q.jurisdictionId === id);
      const alloc = data.allocations.filter((a) => a.jurisdictionId === id);
      return html`<div class="card"><h3>Rates</h3><div class="grid-scroll"><table class="tbl" data-tax-lines><thead><tr><th>Name</th><th>Kind</th><th>Rate or flat fee</th><th>Who pays</th><th></th></tr></thead><tbody>
        ${lines.map((l) => html`<tr data-line="${l.id}"><td>${l.name}${l.document ? html`<div class="small muted">${l.document}</div>` : ''}</td><td>${l.kind === 'recording' ? 'Recording fee' : 'Tax'}</td>
          <td><input data-line-amount inputmode="decimal" aria-label="${l.name} amount" value="${l.kind === 'recording' ? money(l.flatFee) : money(l.rate)}" placeholder="Rate Not Set"></td>
          <td><select data-line-payer aria-label="${l.name} who pays">${['buyer', 'seller', 'split'].map((p) => html`<option value="${p}" ${l.paidBy === p ? raw('selected') : ''}>${payerLabel(p)}</option>`)}</select></td>
          <td><button type="button" class="m-btn small" data-line-save="${l.id}">Save</button></td></tr>`)}
        </tbody></table></div>
        <form class="form-inline" data-tax-add-line><label>New rate <input name="name" maxlength="120" aria-label="New rate name" required></label>
          <label>Kind <select name="kind" aria-label="New rate kind"><option value="tax">Tax</option><option value="recording">Recording fee</option></select></label>
          <label>Amount <input name="amount" inputmode="decimal" placeholder="blank = Rate Not Set" aria-label="New rate amount"></label>
          <button class="m-btn" type="submit">Add rate</button></form>
        <p class="field-hint small">Leave the amount blank to show Rate Not Set. Zero is a real zero.</p></div>
      <div class="card"><h3>Exemptions</h3><div class="grid-scroll"><table class="tbl"><thead><tr><th>Name</th><th>Amount taken off</th><th>Other rate</th><th></th></tr></thead><tbody>
        ${ex.length ? ex.map((e) => html`<tr data-ex="${e.id}"><td>${e.name}</td><td><input data-ex-amount inputmode="decimal" aria-label="${e.name} amount" value="${money(e.amount)}" placeholder="not set"></td><td><input data-ex-rate inputmode="decimal" aria-label="${e.name} other rate" value="${money(e.alternateRate)}" placeholder="not set"></td><td><button type="button" class="m-btn small" data-ex-save="${e.id}">Save</button></td></tr>`) : html`<tr><td colspan="4" class="muted">No exemption is stored for this place.</td></tr>`}
      </tbody></table></div></div>
      <div class="card"><h3>Questions</h3><div class="grid-scroll"><table class="tbl"><thead><tr><th>What staff see</th><th></th></tr></thead><tbody>
        ${qs.length ? qs.map((q) => html`<tr data-q="${q.id}"><td><input data-q-label maxlength="200" aria-label="Question" value="${q.label}"></td><td><button type="button" class="m-btn small" data-q-save="${q.id}">Save</button></td></tr>`) : html`<tr><td colspan="2" class="muted">This place uses the state's questions.</td></tr>`}
      </tbody></table></div></div>
      <div class="card"><h3>Who pays</h3><p class="small muted">The default split. When Set by law is on, staff cannot move that line on the file.</p><div class="grid-scroll"><table class="tbl"><thead><tr><th>Tax or fee</th><th>When</th><th>Default</th><th>Set by law</th><th></th></tr></thead><tbody>
        ${alloc.length ? alloc.map((a) => html`<tr data-alloc="${a.id}"><td>${a.taxName}${a.document ? html`<div class="small muted">${a.document}</div>` : ''}</td><td class="small">${a.whenKey === 'first_time_buyer' ? 'First-time buyer' : (a.whenKey ? a.whenKey : 'Always')}</td>
          <td><select data-alloc-payer aria-label="Who pays ${a.taxName}">${['buyer', 'seller', 'split'].map((p) => html`<option value="${p}" ${a.paidBy === p ? raw('selected') : ''}>${payerLabel(p)}</option>`)}</select></td>
          <td><label class="check small"><input type="checkbox" data-alloc-law ${a.lawMandated ? raw('checked') : ''} aria-label="Set by law for ${a.taxName}"> Set by law</label></td>
          <td><button type="button" class="m-btn small" data-alloc-save="${a.id}">Save</button></td></tr>`) : html`<tr><td colspan="5" class="muted">No split is stored for this place.</td></tr>`}
      </tbody></table></div></div>`;
    }
  } };
}
