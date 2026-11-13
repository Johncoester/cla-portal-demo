/* Spouse tab. Loaded only when this tab opens. One getSpouse call, which includes the SSN display. */
import { html, raw, $, guard, toast } from '../ui.js?v=202611161500';
import { ssnStaff } from '../data/buyer-ssn.js?v=202611120200';
import { phoneOk, PHONE_MSG } from '../data/constants.js?v=202611101015';

/* FF-068 #9 (Janine's Nov 12 video; Francis confirm-back Nov 12 6:14 PM ET): the Social Security number is visible while it is typed and
 * gets its dashes automatically (xxx-xx-xxxx). After saving, only the masked last 4 is shown (the input is cleared). */
export const ssnDash = (v) => { const d = String(v || '').replace(/\D/g, '').slice(0, 9); return d.length > 5 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : d.length > 3 ? `${d.slice(0, 3)}-${d.slice(3)}` : d; };
export function bindSsnDash(root) {
  if (!root || !root.querySelectorAll) return;
  root.querySelectorAll('[data-ssn-dash]').forEach((el) => { if (el.dataset.ssnDashBound) return; el.dataset.ssnDashBound = '1';
    el.addEventListener('input', () => { const next = ssnDash(el.value); if (next !== el.value) el.value = next; }); });
}

// After a save the typed number is cleared and only ***-**-last4 is shown next to the input.
export function showSsnMask(input) {
  if (!input) return; const d = String(input.value || '').replace(/\D/g, ''); input.value = '';
  if (d.length !== 9 || !input.parentNode || input.parentNode.querySelector('[data-ssn-staff]')) return;
  let mask = input.parentNode.querySelector('[data-ssn-mask]');
  if (!mask) { mask = input.ownerDocument.createElement('span'); mask.setAttribute('data-ssn-mask', ''); input.parentNode.insertBefore(mask, input); }
  mask.textContent = `***-**-${d.slice(5)}`;
}

export async function loadSpouseRows(api, dealId) {
  if (!api || !api.getSpouse || !dealId) return [];
  try { return (await api.getSpouse(dealId)) || []; } catch (e) { return []; }
}

export function applySpouse(task, rows, user) {
  if (!task || task.templateCode !== 'personal_info') return task;
  task.spouseRow = (rows || []).find((r) => r.participantId === task.participantId) || null;
  task.spouseStaff = ssnStaff(user);
  return task;
}

const yn = (name, value) => ['Yes', 'No'].map((o) => html`<option ${o === value ? raw('selected') : ''}>${o}</option>`).join('');

/* FF-069 #14 (Francis confirm-back Nov 12 6:14 PM ET): every phone field takes exactly 10 digits. A blank phone is fine; anything else must be 10 digits. */
const SPOUSE_PHONES = [['cellPhone', 'Spouse cell phone'], ['homePhone', 'Spouse home phone'], ['workPhone', 'Spouse work phone']];
export function spousePhoneError(data) {
  for (const [k, label] of SPOUSE_PHONES) { const v = String((data && data[k]) || '').trim(); if (v && !phoneOk(v)) return `${label} ${PHONE_MSG}.`; }
  return '';
}
const PHONE_ATTRS = 'type="tel" inputmode="tel" placeholder="xxx-xxx-xxxx" data-phone maxlength="12"';
const SPOUSE_FIELDS = [['spouseFullName', 'fullName', 'Full name'], ['spouseCitizenship', 'citizenship', 'Citizenship'], ['spouseCellPhone', 'cellPhone', 'Cell phone'], ['spouseHomePhone', 'homePhone', 'Home phone'], ['spouseWorkPhone', 'workPhone', 'Work phone'], ['spouseEmail', 'email', 'Email']];

export function spouseSectionHtml(row, staff) {
  if (!row) return '';
  const ssn = row.ssn || '';
  const choice = (name, value, options) => html`<label>${name === 'spouseGender' ? 'Gender' : name === 'spouseMaritalStatus' ? 'Marital status' : 'POA given'}<select name="${name}"><option value="">Choose&hellip;</option>${options.map((o) => html`<option ${o === value ? raw('selected') : ''}>${o}</option>`)}</select></label>`;
  return html`<fieldset class="span2" data-spouse-section data-spouse="${row.participantId}" data-spouse-task="${row.taskId || ''}">
    <legend>Spouse information</legend>
    <p class="span2 muted">This is separate from the primary person's information. The same record is saved for this person.</p>
    ${SPOUSE_FIELDS.map(([name, key, label]) => (/Phone$/.test(name) ? html`<label>${label}<input name="${name}" value="${row[key] || ''}" ${raw(PHONE_ATTRS)}></label>` : html`<label>${label}<input name="${name}" value="${row[key] || ''}" maxlength="${name === 'spouseEmail' || name === 'spouseFullName' ? 200 : name === 'spouseCitizenship' ? 80 : 40}"></label>`))}
    ${choice('spouseGender', row.gender, ['Female', 'Male', 'Nonbinary', 'Prefer not to say'])}
    ${choice('spouseMaritalStatus', row.maritalStatus, ['Single', 'Married', 'Divorced', 'Widowed'])}
    <label>Date of birth<input type="date" name="spouseDateOfBirth" value="${row.dateOfBirth || ''}"></label>
    ${choice('spousePoaGiven', row.poaGiven, ['Yes', 'No'])}
    <div class="span2" data-spouse-ssn><span>Social Security number</span>
      ${staff && ssn ? html`<output data-ssn-staff>${ssn}</output>` : ssn ? html`<span data-ssn-mask>${ssn}</span>` : ''}
      <input data-spouse-ssn-input type="text" inputmode="numeric" autocomplete="off" spellcheck="false" maxlength="11" data-ssn-dash aria-label="Spouse Social Security number" placeholder="***-**-****">
    </div>
  </fieldset>`;
}

export function spousePayload(form) {
  const g = (name) => { const el = form.elements[name]; return el ? el.value : ''; };
  return {
    fullName: g('spouseFullName'), citizenship: g('spouseCitizenship'), gender: g('spouseGender'), maritalStatus: g('spouseMaritalStatus'),
    cellPhone: g('spouseCellPhone'), homePhone: g('spouseHomePhone'), workPhone: g('spouseWorkPhone'), email: g('spouseEmail'),
    dateOfBirth: g('spouseDateOfBirth'), poaGiven: g('spousePoaGiven'),
  };
}

function card(row, staff) {
  const ssn = row.ssn || '';
  return html`<form class="form-grid" data-spouse="${row.participantId}" data-task="${row.taskId || ''}">
    <p class="span2 muted">${row.role === 'Client-Seller' ? 'Seller' : 'Buyer'} spouse. This is separate from the primary person's information.</p>
    <label>Full name<input name="fullName" value="${row.fullName || ''}" maxlength="200"></label>
    <label>Citizenship<input name="citizenship" value="${row.citizenship || ''}" maxlength="80"></label>
    <label>Gender<select name="gender"><option value="">Choose&hellip;</option>${['Female', 'Male', 'Nonbinary', 'Prefer not to say'].map((o) => html`<option ${o === row.gender ? raw('selected') : ''}>${o}</option>`)}</select></label>
    <label>Marital status<select name="maritalStatus"><option value="">Choose&hellip;</option>${['Single', 'Married', 'Divorced', 'Widowed'].map((o) => html`<option ${o === row.maritalStatus ? raw('selected') : ''}>${o}</option>`)}</select></label>
    <label>Cell phone<input name="cellPhone" value="${row.cellPhone || ''}" ${raw(PHONE_ATTRS)}></label>
    <label>Home phone<input name="homePhone" value="${row.homePhone || ''}" ${raw(PHONE_ATTRS)}></label>
    <label>Work phone<input name="workPhone" value="${row.workPhone || ''}" ${raw(PHONE_ATTRS)}></label>
    <label>Email<input name="email" value="${row.email || ''}" maxlength="200"></label>
    <label>Date of birth<input type="date" name="dateOfBirth" value="${row.dateOfBirth || ''}"></label>
    <label>POA given<select name="poaGiven"><option value="">Choose&hellip;</option>${yn('poaGiven', row.poaGiven)}</select></label>
    <div class="span2" data-spouse-ssn><span>Social Security number</span>
      ${staff && ssn ? html`<output data-ssn-staff>${ssn}</output>` : ssn ? html`<span data-ssn-mask>${ssn}</span>` : ''}
      <input data-buyer-ssn type="text" inputmode="numeric" autocomplete="off" spellcheck="false" maxlength="11" data-ssn-dash aria-label="Spouse Social Security number" placeholder="***-**-****">
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
    bindSsnDash(root);
    $$forms(root).forEach((form) => form.addEventListener('submit', guard(async (e) => {
      e.preventDefault();
      const data = {}; new FormData(form).forEach((v, k) => { data[k] = v; });
      const bad = spousePhoneError(data); if (bad) { toast(bad, 'err'); return; }
      await api.saveSpouse(deal.id, form.dataset.spouse, data);
      const box = $('[data-buyer-ssn]', form);
      if (box && box.value && form.dataset.task) {
        await api.savePartySsn(form.dataset.task, 'spouse', box.value);
        showSsnMask(box);
      }
      toast('Spouse information saved');
    })));
  } };
}
function $$forms(root) { return [...root.querySelectorAll('form[data-spouse]')]; }
