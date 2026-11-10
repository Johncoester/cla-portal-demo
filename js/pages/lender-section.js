/* Lender block shared by Place Order and the file Parties / Contacts lender section.
 * Loss-payee suggestions come from clauses already saved for that lender company. The box stays editable.
 * CPL address can follow the lender address. Lender contacts are Loan Officer or Lender TC, and a company can have none. */
import { html, raw, $, guard, formData, toast, toText } from '../ui.js?v=202611070139';
import { fmtPhone } from '../data/constants.js?v=202611101015';
import {
  LENDER_CONTACT_ROLES, lenderRoleLabel, lenderExtras, filterClauses, normLenderName,
  lenderCompanyContact, contactDisplayName,
} from '../data/lender-file.js?v=202611101200';
import { CPL_CLAUSES, CPL_OTHER, clauseChoice } from '../data/cpl-clauses.js?v=202611120500';

export function lenderFieldsHtml(d = {}) {
  const extras = lenderExtras(d);
  const same = extras.cplSameAsLender;
  return html`<label class="span2">Lender address<input name="lenderAddress" maxlength="300" value="${extras.lenderAddress}" aria-label="Lender address" data-lender-address autocomplete="off"></label>
    <label class="span2">Mortgage broker / brokerage<input name="mortgageBrokerName" maxlength="200" value="${extras.mortgageBrokerName}" aria-label="Mortgage broker" placeholder="Brokerage or mortgage broker name"></label>
    <label class="span2 clause-field">CPL lender clause
      <select data-cpl-clause aria-label="CPL lender clause"><option value="">Choose a clause&hellip;</option>${CPL_CLAUSES.map((c) => html`<option value="${c}" ${clauseChoice(d.lossPayeeName) === c ? raw('selected') : ''}>${c}</option>`)}<option value="${CPL_OTHER}" ${clauseChoice(d.lossPayeeName) === CPL_OTHER ? raw('selected') : ''}>${CPL_OTHER}</option></select>
      <input name="lossPayeeName" maxlength="800" value="${d.lossPayeeName || ''}" aria-label="Loss payee clause" data-loss-payee autocomplete="off" placeholder="The clause fills this box. You can still edit it."></label>
    <label class="check span2"><input type="checkbox" name="cplSameAsLender" value="1" data-cpl-same ${same ? raw('checked') : ''}> CPL address same as lender</label>
    <label class="span2">CPL address <span class="muted small">(closing protection letter)</span><input name="cplAddress" maxlength="300" value="${extras.cplAddress}" aria-label="CPL address" data-cpl-address autocomplete="off" ${same ? raw('readonly') : ''}></label>`;
}

export function lenderContactRowHtml(i) {
  return html`<div class="form-grid lender-contact-row" data-lender-contact-row>
    <label>First name<input name="lcFirst:${i}" data-lc="first" maxlength="80" aria-label="Lender contact first name"></label>
    <label>Last name<input name="lcLast:${i}" data-lc="last" maxlength="80" aria-label="Lender contact last name"></label>
    <label>Contact type<select name="lcRole:${i}" data-lc="role" aria-label="Lender contact type"><option value="">Choose&hellip;</option>${LENDER_CONTACT_ROLES.map(([v, l]) => html`<option value="${v}">${l}</option>`)}</select></label>
    <label>Phone<input name="lcPhone:${i}" data-lc="phone" type="tel" inputmode="tel" placeholder="xxx-xxx-xxxx" data-phone maxlength="40" aria-label="Lender contact phone"></label>
    <label>Email<input name="lcEmail:${i}" data-lc="email" type="email" maxlength="200" aria-label="Lender contact email"></label>
    <button type="button" class="ghost" data-rm-lender-contact>Remove</button>
  </div>`;
}

const lenderPeople = (deal) => (deal.participants || []).filter((p) => p && p.role === 'Lender' && !p.removed && p.contact);

function peopleHtml(deal) {
  const people = lenderPeople(deal);
  if (!people.length) {
    const legacy = String(deal.lenderContact || '').trim();
    return html`<p class="muted small" data-lender-people-empty>No lender contacts on this order yet.${legacy ? html` Saved contact: <strong>${legacy}</strong>.` : ' A company can be saved with no contact person.'}</p>`;
  }
  return html`<ul class="lender-people" data-lender-people>${people.map((p) => {
    const role = lenderRoleLabel(p.contact.lenderRole);
    const who = contactDisplayName(p.contact);
    return html`<li data-lender-person="${p.contactId}"><strong>${who}</strong>${role ? html` <span class="pill">${role}</span>` : ''}${p.contact.company && p.contact.company !== who ? html` <span class="muted small">${p.contact.company}</span>` : ''}<br><span class="muted small">${[fmtPhone(p.contact.phone), p.contact.email].filter(Boolean).join(' · ') || 'No phone or email'}</span></li>`;
  })}</ul>`;
}

export function lenderSectionHtml(deal, { canEdit } = {}) {
  const d = deal || {};
  if (!canEdit) {
    const extras = lenderExtras(d);
    return html`<section class="lender-file" data-lender-file><h3>Lender</h3>
      <p data-lender-summary><strong>${d.lenderName || 'Not entered'}</strong>${d.lenderContact ? html` · ${d.lenderContact}` : ''}</p>
      ${d.mortgageBrokerName ? html`<p class="small" data-broker>Mortgage broker: ${d.mortgageBrokerName}</p>` : ''}
      ${d.lossPayeeName ? html`<p class="small" data-loss-payee-read>Loss payee: ${d.lossPayeeName}</p>` : ''}
      ${extras.cplAddress ? html`<p class="small" data-cpl-read>CPL address: ${extras.cplAddress}${extras.cplSameAsLender ? ' (same as lender)' : ''}</p>` : ''}
      ${peopleHtml(d)}</section>`;
  }
  return html`<section class="lender-file card" data-lender-file><h3>Lender</h3>
    <p data-lender-summary><strong>${d.lenderName || 'Not entered'}</strong>${d.lenderContact ? html` · ${d.lenderContact}` : ''}</p>
    <p><button type="button" class="m-btn" data-edit-lender>Edit Lender</button> <button type="button" class="ghost" data-switch-lender>Switch Lender</button></p>
    <form class="form-grid" data-lender-form hidden>
      <label class="span2">Lender company name<input name="lenderName" maxlength="200" value="${d.lenderName || ''}" aria-label="Lender company name" data-lender-company></label>
      <label>Contact<input name="lenderContact" maxlength="200" value="${d.lenderContact || ''}" aria-label="Lender contact"></label>
      <label>Phone<input name="lenderPhone" type="tel" inputmode="tel" placeholder="xxx-xxx-xxxx" data-phone value="${d.lenderPhone || ''}" aria-label="Lender phone"></label>
      <label class="span2">Email<input name="lenderEmail" type="email" maxlength="200" value="${d.lenderEmail || ''}" aria-label="Lender email"></label>
      ${lenderFieldsHtml(d)}
      <div class="span2"><button class="m-btn" type="submit">Save lender</button></div>
    </form>
    <h4>Lender contacts</h4>
    <p class="muted small">Loan Officer and Lender TC (the lender's processor). More than one contact is allowed. The company can stay with none.</p>
    ${peopleHtml(d)}
    <form class="form-grid" data-add-lender-person>
      <label>First name<input name="firstName" maxlength="80" aria-label="New lender contact first name"></label>
      <label>Last name<input name="lastName" maxlength="80" aria-label="New lender contact last name"></label>
      <label>Contact type<select name="lenderRole" aria-label="New lender contact type"><option value="">Choose&hellip;</option>${LENDER_CONTACT_ROLES.map(([v, l]) => html`<option value="${v}">${l}</option>`)}</select></label>
      <label>Phone<input name="phone" type="tel" inputmode="tel" placeholder="xxx-xxx-xxxx" data-phone maxlength="40"></label>
      <label>Email<input name="email" type="email" maxlength="200"></label>
      <div class="span2"><button class="m-btn" type="submit">Add lender contact</button> <button type="button" class="ghost" data-add-lender-company>Add company with no contact person</button></div>
    </form></section>`;
}

export function mountLossPayee(root, api) {
  const pick = $('[data-cpl-clause]', root);
  const input = $('[data-loss-payee]', root);
  if (pick && input) pick.addEventListener('change', () => { if (pick.value && pick.value !== CPL_OTHER) input.value = pick.value; if (pick.value === CPL_OTHER) { input.value = ''; input.focus(); } });
  const list = $('[data-loss-payee-list]', root);
  if (!input || !list || !api || !api.listLossPayeeClauses) return;
  let rows = [];
  const lenderName = () => { const el = $('[data-lender-company]', root) || $('[name=lenderName]', root); return el ? el.value : ''; };
  const paint = (q) => {
    const hits = filterClauses(rows, q).slice(0, 8);
    if (!hits.length) { list.hidden = true; list.innerHTML = ''; return; }
    list.hidden = false;
    list.innerHTML = toText(html`${hits.map((c, i) => html`<li role="option"><button type="button" data-clause-i="${i}">${c}</button></li>`)}`);
    list._clauses = hits;
  };
  const load = async () => { rows = await api.listLossPayeeClauses(lenderName()); paint(input.value); };
  input.addEventListener('focus', () => { load().catch(() => { rows = []; paint(''); }); });
  input.addEventListener('input', () => paint(input.value));
  list.addEventListener('click', (e) => {
    const b = e.target.closest('[data-clause-i]');
    if (!b) return;
    const clause = (list._clauses || [])[Number(b.dataset.clauseI)];
    if (!clause) return;
    input.value = clause;
    input.focus();
    const pos = input.value.length;
    if (input.setSelectionRange) input.setSelectionRange(pos, pos);
    list.hidden = true;
  });
}

export function mountCplSame(root) {
  const box = $('[data-cpl-same]', root);
  const lender = $('[data-lender-address]', root);
  const cpl = $('[data-cpl-address]', root);
  if (!box || !cpl) return;
  const sync = () => {
    cpl.readOnly = !!box.checked;
    if (box.checked && lender) cpl.value = lender.value;
  };
  box.addEventListener('change', sync);
  if (lender) lender.addEventListener('input', () => { if (box.checked) cpl.value = lender.value; });
  sync();
}

export function mountLenderSection(root, { api, deal, refresh } = {}) {
  const host = $('[data-lender-file]', root);
  if (!host || !api || !deal) return;
  mountLossPayee(host, api);
  mountCplSame(host);
  const form = $('[data-lender-form]', host);
  const editBtn = $('[data-edit-lender]', host);
  if (editBtn && form) editBtn.addEventListener('click', () => { form.hidden = false; const box = $('[name=lenderName]', form); if (box) box.focus(); });
  const switchBtn = $('[data-switch-lender]', host);
  if (switchBtn && form) switchBtn.addEventListener('click', guard(async () => {
    const current = { lenderName: deal.lenderName || '', lenderContact: deal.lenderContact || '', lenderPhone: deal.lenderPhone || '', lenderEmail: deal.lenderEmail || '', lossPayeeName: deal.lossPayeeName || '', at: new Date().toISOString() };
    form.hidden = false;
    ['lenderName', 'lenderContact', 'lenderPhone', 'lenderEmail', 'lossPayeeName', 'lenderAddress', 'cplAddress', 'mortgageBrokerName'].forEach((n) => { const el = form.elements[n]; if (el) el.value = ''; });
    form.dataset.switch = '1';
    form._history = [...(deal.lenderHistory || []), current];
    toast('Enter the new lender. The previous lender stays in the file history.');
  }));
  if (form) form.addEventListener('submit', guard(async (e) => {
    e.preventDefault();
    const f = formData(form);
    const box = $('[data-cpl-same]', form);
    f.cplSameAsLender = !!(box && box.checked);
    const extras = lenderExtras(f);
    await api.updateDeal(deal.id, {
      lenderName: f.lenderName || '',
      lenderContact: f.lenderContact || '',
      lenderPhone: f.lenderPhone || '',
      lenderEmail: f.lenderEmail || '',
      lossPayeeName: f.lossPayeeName || '',
      lenderAddress: extras.lenderAddress,
      cplAddress: extras.cplAddress,
      cplSameAsLender: extras.cplSameAsLender,
      mortgageBrokerName: extras.mortgageBrokerName,
      ...(form.dataset.switch === '1' ? { lenderHistory: form._history || deal.lenderHistory || [] } : {}),
    });
    toast('Lender saved');
    if (refresh) refresh();
  }));
  const add = $('[data-add-lender-person]', host);
  if (add) add.addEventListener('submit', guard(async (e) => {
    e.preventDefault();
    const company = ($('[name=lenderName]', host) || {}).value || deal.lenderName || '';
    const f = formData(add);
    const built = lenderCompanyContact({ company, firstName: f.firstName, lastName: f.lastName, email: f.email, phone: f.phone, lenderRole: f.lenderRole });
    if (!built.ok) throw new Error(built.error);
    if (!built.contact.firstName && !built.contact.lastName) throw new Error('Enter the contact name, or use Add company with no contact person.');
    const c = await api.createContact(built.contact);
    await api.addParticipant(deal.id, c.id, 'Lender');
    toast(`${contactDisplayName(c)} added as ${lenderRoleLabel(c.lenderRole) || 'lender contact'}`);
    if (refresh) refresh();
  }));
  const companyBtn = $('[data-add-lender-company]', host);
  if (companyBtn) companyBtn.addEventListener('click', guard(async () => {
    const company = (($('[name=lenderName]', host) || {}).value || '').trim();
    const built = lenderCompanyContact({ company, firstName: '', lastName: '', lenderRole: '' });
    if (!built.ok) throw new Error(built.error);
    const list = api.listContacts ? await api.listContacts() : [];
    const found = (list || []).find((c) => normLenderName(c.company) === normLenderName(company) && !String(c.firstName || '').trim() && !String(c.lastName || '').trim());
    const c = found || await api.createContact(built.contact);
    const already = lenderPeople(deal).some((p) => p.contactId === c.id);
    if (!already) await api.addParticipant(deal.id, c.id, 'Lender');
    if ((deal.lenderName || '') !== company) await api.updateDeal(deal.id, { lenderName: company });
    toast('Lender company saved with no contact person');
    if (refresh) refresh();
  }));
}
