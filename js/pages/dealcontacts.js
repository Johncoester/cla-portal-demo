// Contacts tab: everyone on this file. Processor can add people (existing or new), edit them, and unlink them from the order.
import { html, $, $$, guard, formData, modal, closeModal, options, toast, pill } from '../ui.js';
import { PARTICIPANT_ROLES, isProcessor, fmtPhone } from '../data/constants.js';

const GROUPS = [['ALL', null], ['BUYER', ['Client-Buyer', 'Buyer Agent']], ['SELLER', ['Client-Seller', 'Listing Agent']], ['REALTOR', ['Buyer Agent', 'Listing Agent']], ['CLIENT', ['Client-Buyer', 'Client-Seller']], ['CLA TEAM', ['Sales Processor', 'Sales Person', 'Sales Team', 'Transaction Coordinator']]];

export async function render({ api, user, deal, refresh }) {
  const edit = isProcessor(user.role); const g = new URLSearchParams(location.hash.split('?')[1] || '').get('g') || 'ALL'; const grp = (GROUPS.find((x) => x[0] === g) || GROUPS[0])[1];
  const list = deal.participants.filter((p) => !grp || grp.includes(p.role));
  const party = new Set((deal.agentParties || []).map((p) => p.contactId));
  const rows = list.map((p) => html`<tr><td>${p.contact.firstName} ${p.contact.lastName}${p.removed ? html` ${pill('removed', 'bad')}` : ''}${party.has(p.contactId) ? html` <span class="pill warn agent-party" title="Client and their own agent on this file">Agent is a party</span>` : ''}${p.contact.profileId ? '' : html` <span class="muted small">(no portal login)</span>`}</td><td>${p.role}</td><td>${p.contact.company}</td>${p.contact.contactHidden ? html`<td colspan="2" class="muted contact-hidden">Contact through CLA Title</td>` : html`<td>${fmtPhone(p.contact.phone)}</td><td>${p.contact.email}</td>`}
    <td class="nowrap">${edit ? html`<button class="ghost" data-edit="${p.contactId}">Edit</button> <button class="ghost" data-unlink="${p.id}" title="Removes this person from the order only">Remove from order</button>` : ''}</td></tr>`);
  const body = html`<div class="box-title"><h2><span class="h-ico"></span>Order Contacts</h2>${edit ? html`<button class="m-btn right" id="addp">+ Add contact</button>` : ''}</div>
    <ul class="nav-tabs">${GROUPS.map(([k]) => html`<li><a class="${k === g ? 'active' : ''}" href="#/deals/${deal.id}/contacts?g=${k}">${k}</a></li>`)}</ul>
    <table class="tbl striped"><thead><tr><th>Name</th><th>Role</th><th>Company</th><th>Phone</th><th>Email</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
  return { title: 'Contacts', crumbs: [['Contacts']], body, mount(root) {
    $$('[data-unlink]', root).forEach((b) => b.addEventListener('click', guard(async () => { if (!confirm('Remove this person from the order? (Their contact record, documents and messages are kept.)')) return; await api.removeParticipant(deal.id, b.dataset.unlink); toast('Removed from order'); refresh(); })));
    $$('[data-edit]', root).forEach((b) => b.addEventListener('click', () => editContact(deal.participants.find((p) => p.contactId === b.dataset.edit).contact)));
    const ab = $('#addp', root); if (ab) ab.addEventListener('click', guard(addPerson));
  } };

  async function addPerson() {
    const all = await api.listContacts(); const have = new Set(deal.participants.map((p) => p.contactId));
    const m = modal('Add contact to this order', html`<form id="apf" class="form-grid"><label class="span2">Role on this order<select name="role">${options(PARTICIPANT_ROLES, 'Other')}</select></label>
      <p class="muted small span2">One person can hold two roles on an order only when an agent is buying or selling for themselves: add them once as Client-Buyer and once as Buyer Agent (or Client-Seller and Listing Agent).</p>
      <label class="span2">Existing contact<select name="contactId"><option value="">&mdash; or enter a new person below &mdash;</option>${options(all.filter((c) => !have.has(c.id) || true), '', (c) => `${c.firstName} ${c.lastName} \u2014 ${c.email || c.company || ''}`, (c) => c.id)}</select></label>
      <h4 class="span2">New person</h4><label>First name<input name="firstName"></label><label>Last name<input name="lastName"></label><label>Email<input name="email" type="email"></label><label>Phone<input name="phone" type="tel" inputmode="tel" placeholder="xxx-xxx-xxxx" data-phone></label><label class="span2">Company<input name="company"></label>
      <div class="span2"><button class="m-btn" type="submit">Add</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`, { wide: true });
    $('#apf', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); const f = formData(e.target); let id = f.contactId;
      if (!id) id = (await api.createContact({ firstName: f.firstName, lastName: f.lastName, email: f.email, phone: f.phone, company: f.company })).id;
      await api.addParticipant(deal.id, id, f.role); closeModal(); toast('Contact added'); refresh(); }));
  }
  function editContact(c) {
    const m = modal('Edit contact', html`<form id="ecf" class="form-grid"><label>First name<input name="firstName" required value="${c.firstName}"></label><label>Last name<input name="lastName" value="${c.lastName}"></label>
      <label>Email<input name="email" type="email" value="${c.email}"></label><label>Phone<input name="phone" type="tel" inputmode="tel" placeholder="xxx-xxx-xxxx" data-phone value="${c.phone}"></label><label class="span2">Company<input name="company" value="${c.company}"></label>
      <div class="span2"><button class="m-btn" type="submit">Save</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`);
    $('#ecf', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); await api.updateContact(c.id, formData(e.target)); closeModal(); toast('Contact saved'); refresh(); }));
  }
}
