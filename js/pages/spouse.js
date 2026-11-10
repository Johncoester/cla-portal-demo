/* Spouse tab. Loaded only when this tab opens. One getSpouse call, which includes the SSN display. */
import { html, raw, $, guard, toast } from '../ui.js?v=202611070139';
import { ssnStaff } from '../data/buyer-ssn.js?v=202611120200';

const yn = (name, value) => ['Yes', 'No'].map((o) => html`<option ${o === value ? raw('selected') : ''}>${o}</option>`).join('');

function card(row, staff) {
  const ssn = row.ssn || '';
  return html`<form class="form-grid" data-spouse="${row.participantId}" data-task="${row.taskId || ''}">
    <p class="span2 muted">${row.role === 'Client-Seller' ? 'Seller' : 'Buyer'} spouse. This is separate from the primary person's information.</p>
    <label>Full name<input name="fullName" value="${row.fullName || ''}" maxlength="200"></label>
    <label>Citizenship<input name="citizenship" value="${row.citizenship || ''}" maxlength="80"></label>
    <label>Gender<select name="gender"><option value="">Choose&hellip;</option>${['Female', 'Male', 'Nonbinary', 'Prefer not to say'].map((o) => html`<option ${o === row.gender ? raw('selected') : ''}>${o}</option>`)}</select></label>
    <label>Marital status<select name="maritalStatus"><option value="">Choose&hellip;</option>${['Single', 'Married', 'Divorced', 'Widowed'].map((o) => html`<option ${o === row.maritalStatus ? raw('selected') : ''}>${o}</option>`)}</select></label>
    <label>Cell phone<input name="cellPhone" value="${row.cellPhone || ''}" maxlength="40"></label>
    <label>Home phone<input name="homePhone" value="${row.homePhone || ''}" maxlength="40"></label>
    <label>Work phone<input name="workPhone" value="${row.workPhone || ''}" maxlength="40"></label>
    <label>Email<input name="email" value="${row.email || ''}" maxlength="200"></label>
    <label>Date of birth<input type="date" name="dateOfBirth" value="${row.dateOfBirth || ''}"></label>
    <label>POA given<select name="poaGiven"><option value="">Choose&hellip;</option>${yn('poaGiven', row.poaGiven)}</select></label>
    <div class="span2" data-spouse-ssn><span>Social Security number</span>
      ${staff && ssn ? html`<output data-ssn-staff>${ssn}</output>` : ssn ? html`<span data-ssn-mask>${ssn}</span>` : ''}
      <input data-buyer-ssn type="password" inputmode="numeric" autocomplete="off" spellcheck="false" maxlength="11" aria-label="Spouse Social Security number" placeholder="***-**-****">
    </div>
    <div class="span2"><button class="m-btn" type="submit">Save spouse</button></div>
  </form>`;
}

export async function render({ api, deal, user }) {
  const rows = await api.getSpouse(deal.id);
  const staff = ssnStaff(user);
  const body = html`<div class="box-title"><h2>Spouse</h2></div>
    ${rows.length ? rows.map((row) => html`<section class="card" data-spouse-card="${row.participantId}">${card(row, staff)}</section>`) : html`<p class="muted" data-spouse-empty>No spouse section for you on this file.</p>`}`;
  return { title: 'Spouse', crumbs: [['Spouse']], queries: 1, body, mount(root) {
    $$forms(root).forEach((form) => form.addEventListener('submit', guard(async (e) => {
      e.preventDefault();
      const data = {}; new FormData(form).forEach((v, k) => { data[k] = v; });
      await api.saveSpouse(deal.id, form.dataset.spouse, data);
      const box = $('[data-buyer-ssn]', form);
      if (box && box.value && form.dataset.task) {
        await api.savePartySsn(form.dataset.task, 'spouse', box.value);
        box.value = '';
      }
      toast('Spouse information saved');
    })));
  } };
}
function $$forms(root) { return [...root.querySelectorAll('form[data-spouse]')]; }
