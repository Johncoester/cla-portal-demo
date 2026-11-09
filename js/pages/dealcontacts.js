// Contacts tab: everyone on this file. Processor can add people (existing or new), edit them, and unlink them from the order.
import { html, raw, $, $$, guard, formData, modal, closeModal, options, toast, pill } from '../ui.js?v=202611100245';
import { runsOrders, PARTICIPANT_ROLES, isRefi, REFI_BLOCKED_ROLES, isProcessor, fmtPhone, CONTACT_TYPES, contactTypeLabel, contactTypeForRole } from '../data/constants.js?v=202611100245';
import { pickerHtml, mountPicker, splitPersonName } from './person-picker.js?v=202611100700';
import { canInviteToPortal, inviteKindForRole } from '../data/agent-profile.js?v=202611100700';
import { autoSendInvite, inviteSendNotice, inviteToast } from '../data/invite-send.js?v=202611100700';
import { copyPlainText } from './deal.js?v=202611100700';

/* Success is reported only when the text actually landed. A denied clipboard and a failed fallback stay a failure. */
export function contactCopyMessage(copied, kind) {
  if (copied) return { ok: true, message: 'Copied' };
  const what = kind === 'email' ? 'email address' : 'phone number';
  return { ok: false, message: `Could not copy the ${what}.`, level: 'err' };
}
export async function contactCopyOutcome(value, kind, deps) {
  let copied = false;
  try { copied = await copyPlainText(value, deps); } catch (e) { copied = false; }
  return contactCopyMessage(copied, kind);
}

// contact type (John, Nov 2): CLA staff have none, so the select is not offered for them
const STAFF_ROLES = ['Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator'];
const ctypeSelect = (sel = '', name = 'contactType') => html`<label>Contact type<select name="${name}" aria-label="Contact type"><option value="">(not set)</option>${CONTACT_TYPES.map(([v, l]) => html`<option value="${v}" ${v === sel ? raw('selected') : ''}>${l}</option>`)}</select></label>`;
const GROUPS = [['ALL', null], ['BUYER', ['Client-Buyer', 'Buyer Agent']], ['SELLER', ['Client-Seller', 'Listing Agent']], ['REALTOR', ['Buyer Agent', 'Listing Agent']], ['CLIENT', ['Client-Buyer', 'Client-Seller']], ['CLA TEAM', ['Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator']]];

export async function render({ api, user, deal, refresh }) {
  const edit = runsOrders(user); const g = new URLSearchParams(location.hash.split('?')[1] || '').get('g') || 'ALL'; const grp = (GROUPS.find((x) => x[0] === g) || GROUPS[0])[1];
  const list = deal.participants.filter((p) => !grp || grp.includes(p.role));
  const party = new Set((deal.agentParties || []).map((p) => p.contactId));
  const rows = list.map((p) => html`<tr data-contact-row="${p.contactId}" data-row-ctype="${p.contact.contactType || 'none'}"><td>${p.contact.firstName} ${p.contact.lastName}${p.removed ? html` ${pill('removed', 'bad')}` : ''}${party.has(p.contactId) ? html` <span class="pill warn agent-party" title="Client and their own agent on this file">Agent is a party</span>` : ''}${p.contact.profileId ? '' : html` <span class="muted small">(no portal login)</span>`}</td><td>${p.role}</td><td data-ctype="${p.contact.contactType || ''}">${contactTypeLabel(p.contact.contactType) || html`<span class="muted">&mdash;</span>`}</td><td>${p.contact.company}</td>${p.contact.contactHidden ? html`<td colspan="2" class="muted contact-hidden">Contact through CLA Title</td>` : html`<td>${fmtPhone(p.contact.phone)} ${p.contact.phone ? html`<button type="button" class="ghost" data-copy-field="${fmtPhone(p.contact.phone)}" data-copy-kind="phone" aria-label="Copy ${p.contact.firstName}'s phone">Copy</button>` : ''}</td><td>${p.contact.email} ${p.contact.email ? html`<button type="button" class="ghost" data-copy-field="${p.contact.email}" data-copy-kind="email" aria-label="Copy ${p.contact.firstName}'s email">Copy</button>` : ''}</td>`}
    <td class="nowrap">${canInviteToPortal(user, p.role) && !p.contact.profileId && !p.removed ? html`<button type="button" class="ghost" data-invite-portal="${p.contactId}" data-invite-role="${p.role}">Invite to portal</button> ` : ''}${edit ? html`<button class="ghost" data-edit="${p.contactId}">Edit</button> <button class="ghost" data-unlink="${p.id}" title="Removes this person from the order only">Remove from order</button>` : ''}</td></tr>`);
  const body = html`<div class="box-title"><h2><span class="h-ico"></span>Order Contacts</h2>${edit ? html`<button class="m-btn right" id="addp">+ Add contact</button>` : ''}</div>
    <ul class="nav-tabs">${GROUPS.map(([k]) => html`<li><a class="${k === g ? 'active' : ''}" href="#/deals/${deal.id}/contacts?g=${k}">${k}</a></li>`)}</ul>
    <form class="filter-bar" id="ctfilter"><label>Contact type<select name="ctype" aria-label="Filter by contact type"><option value="">Any</option>${CONTACT_TYPES.map(([v, l]) => html`<option value="${v}">${l}</option>`)}<option value="none">Not set</option></select></label></form>
    <table class="tbl striped"><thead><tr><th>Name</th><th>Role</th><th>Contact type</th><th>Company</th><th>Phone</th><th>Email</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
  return { title: 'Contacts', crumbs: [['Contacts']], body, mount(root) {
    $$('[data-copy-field]', root).forEach((b) => b.addEventListener('click', guard(async () => { const outcome = await contactCopyOutcome(b.dataset.copyField, b.dataset.copyKind); toast(outcome.message, outcome.level); })));
    $$('[data-unlink]', root).forEach((b) => b.addEventListener('click', guard(async () => { if (!confirm('Remove this person from the order? (Their contact record, documents and messages are kept.)')) return; await api.removeParticipant(deal.id, b.dataset.unlink); toast('Removed from order'); refresh(); })));
    $$('[data-edit]', root).forEach((b) => b.addEventListener('click', () => { const ps = deal.participants.filter((p) => p.contactId === b.dataset.edit); editContact(ps[0].contact, ps.some((p) => STAFF_ROLES.includes(p.role))); }));
    const ab = $('#addp', root); if (ab) ab.addEventListener('click', guard(addPerson));
    $$('[data-invite-portal]', root).forEach((b) => b.addEventListener('click', () => invitePortal(b.dataset.invitePortal, b.dataset.inviteRole)));
    const cf = $('#ctfilter [name=ctype]', root); cf.addEventListener('change', () => { $$('[data-contact-row]', root).forEach((tr) => { tr.hidden = !!cf.value && tr.dataset.rowCtype !== cf.value; }); });
  } };

  // John, Nov 2: type-to-search picker (name / email / phone / brokerage). Transaction Coordinator: only active TC logins; no new person
  // (a TC needs a TC login, made by an Admin). Francis, Nov 9: same Place Order inline "Add … as a new person" when there is no match,
  // so adding a party on an already-opened file no longer dead-ends on "clear the search box".
  async function addPerson() {
    const people = await api.listContacts(); const tcs = await api.listCoordinators(); const tcIds = new Set(tcs.map((t) => t.contactId));
    const m = modal('Add contact to this order', html`<form id="apf" class="form-grid"><label class="span2">Role on this order<select name="role">${options(isRefi(deal) ? PARTICIPANT_ROLES.filter((r) => !REFI_BLOCKED_ROLES.includes(r)) : PARTICIPANT_ROLES, 'Other')}</select></label>${isRefi(deal) ? html`<p class="muted small span2" data-refi-roles>Refinance: no seller, realtor or transaction coordinator roles. Add the borrower as Client-Buyer.</p>` : ''}
      <p class="muted small span2">One person can hold two roles on an order only when an agent is buying or selling for themselves: add them once as Client-Buyer and once as Buyer Agent (or Client-Seller and Listing Agent).</p>
      <p class="muted small span2" data-tc-note hidden>Only users with the Transaction Coordinator account role can be the Transaction Coordinator. An Admin creates them under Create User.</p>
      <p class="muted small span2">Type a name and pick a match, or choose <strong>Add "…" as a new person</strong> in the list. Use the fields below when you already have email, phone or company details.</p>
      <div class="span2">${pickerHtml('contactId', 'Contact')}</div>
      <div class="span2 form-grid" data-newperson><h4 class="span2">&mdash; or enter full details &mdash;</h4><label data-fn>First name<input name="firstName"></label><label>Last name<input name="lastName"></label><label>Email<input name="email" type="email"></label><label>Phone<input name="phone" type="tel" inputmode="tel" placeholder="xxx-xxx-xxxx" data-phone></label><label data-co>Company / brokerage<input name="company"></label>${ctypeSelect('')}</div>
      <div class="span2"><button class="m-btn" type="submit">Add</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`, { wide: true });
    const roleSel = $('[name=role]', m); const isTc = () => roleSel.value === 'Transaction Coordinator';
    // Same quick-create rules as Place Order (ordernew.js): split the typed name; lender company-ish strings become company-only.
    const quickCreate = async (typed) => {
      const name = String(typed || '').trim(); if (!name) throw new Error('Type a name first.');
      const role = roleSel.value;
      const { firstName, lastName } = splitPersonName(name);
      const contactType = contactTypeForRole(role) || '';
      let input;
      if (role === 'Lender') {
        const companyish = !lastName || /\b(llc|inc|corp|bank|mortgage|lending|loan|capital|financial|credit)\b/i.test(name);
        input = companyish
          ? { firstName: '', lastName: '', company: name, email: '', phone: '', contactType: 'lender' }
          : { firstName, lastName, company: '', email: '', phone: '', contactType: 'lender' };
      } else {
        input = { firstName: firstName || name, lastName, email: '', phone: '', company: '', contactType };
      }
      const c = await api.createContact(input);
      if (!people.some((x) => x.id === c.id)) people.push(c);
      return c;
    };
    const pk = mountPicker($('[data-picker=contactId]', m), () => (isTc() ? people.filter((c) => tcIds.has(c.id)) : people), {
      createVerb: () => (roleSel.value === 'Lender' ? 'lender' : 'person'),
      allowCreate: () => !isTc(),
      onCreate: quickCreate,
    });
    const ctSel = $('[data-newperson] [name=contactType]', m); let ctTouched = false; ctSel.addEventListener('change', () => { ctTouched = true; });
    const paintRole = () => { const r = roleSel.value; const lender = r === 'Lender'; const person = r === 'Client-Buyer' || r === 'Client-Seller';
      $('[data-fn]', m).firstChild.textContent = lender ? 'Contact first name (optional)' : person ? 'First name (leave blank for an entity)' : 'First name';
      $('[data-co]', m).firstChild.textContent = lender ? 'Lender company name' : person ? 'Entity or company name' : 'Company / brokerage'; };
    roleSel.addEventListener('change', () => { if (!ctTouched) ctSel.value = contactTypeForRole(roleSel.value); const tc = isTc(); $('[data-tc-note]', m).hidden = !tc; $('[data-newperson]', m).hidden = tc; if (tc && pk.value && !tcIds.has(pk.value)) pk.set(null); paintRole(); });
    paintRole();
    $('#apf', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); const f = formData(e.target); let id = f.contactId;
      if (!id && pk.typed) throw new Error('Pick a person from the list, choose Add as a new person, or clear the search box and enter full details below.');
      if (!id && isTc()) throw new Error('Pick a Transaction Coordinator from the list.');
      if (!id && f.role === 'Lender' && !String(f.company || '').trim()) throw new Error('Lender company name is required. A contact person is optional.');
      if (!id && !String(f.firstName || '').trim() && !String(f.company || '').trim()) throw new Error('Enter a first name, or a company or entity name.');
      if (!id) id = (await api.createContact({ firstName: f.firstName, lastName: f.lastName, email: f.email, phone: f.phone, company: f.company, contactType: f.contactType })).id;
      await api.addParticipant(deal.id, id, f.role); closeModal(); toast('Contact added'); refresh(); }));
  }
  // Nov 9 (Francis: "can't invite buyers and sellers"; John: "a processor needs to be able to invite"): Invite to portal for a buyer, seller or agent
  // row with no login, right here on the file. A contact with no email gets one typed here (saved on the contact). The one-time link is shown to
  // copy, and (Nov 9, later) the portal emails it from the inviter's own Gmail (invite-send.js). Agents land on the agent account form, buyers / sellers on a short login form.
  function invitePortal(contactId, role) {
    const p = deal.participants.find((x) => x.contactId === contactId && x.role === role); if (!p) return; const c = p.contact; const hasEmail = !!String(c.email || '').trim();
    const who = inviteKindForRole(role) === 'agent' ? 'agent account' : 'portal login';
    const m = modal('Invite to portal', html`<form id="ipf" class="form-grid" data-invite-portal-form><p class="span2"><strong>${c.firstName} ${c.lastName}</strong> (${role}) gets a one-time link to set up their ${who} for this file.</p>
      <label class="span2">Email<input name="email" type="email" maxlength="160" value="${c.email || ''}" ${hasEmail ? raw('readonly') : raw('required placeholder="name@example.com"')} data-invite-email></label>
      ${hasEmail ? '' : html`<p class="muted small span2" data-invite-email-note>This contact has no email yet. The email you enter is saved on the contact.</p>`}
      <div class="span2"><button class="m-btn" type="submit" data-invite-create>Create invite link</button> <button type="button" class="ghost" data-close>Close</button></div>
      <p class="muted small span2">The portal emails the invite from your connected Gmail. The link is also shown here to copy.</p>
      <div class="span2" data-invite-result hidden></div></form>`, { wide: true });
    let made = false;
    $('#ipf', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); if (made) return; const email = $('[data-invite-email]', m).value.trim();
      if (!hasEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email for this person.');
      const r = await api.createPortalInvite({ dealId: deal.id, contactId, email: hasEmail ? '' : email }); made = true;
      const link = location.href.split('#')[0] + r.link; const sendR = await autoSendInvite(api, 'agent', r.link);
      const res = $('[data-invite-result]', m); res.hidden = false; $('[data-invite-create]', m).disabled = true;
      res.innerHTML = html`${inviteSendNotice(sendR)}<p><strong>Invite link</strong> for ${r.firstName} ${r.lastName} (${r.email}).</p>
        <div class="ai-link-row"><input readonly value="${link}" data-invite-link aria-label="One-time invite link"><button type="button" class="m-btn" data-copy-link>Copy</button></div>`.toString();
      $('[data-copy-link]', res).addEventListener('click', guard(async () => { const outcome = await contactCopyOutcome(link, 'link'); toast(outcome.ok ? 'Link copied' : 'Select the link and copy it', outcome.level); }));
      toast(inviteToast(sendR)); }));
    $$('[data-close]', m).forEach((b) => b.addEventListener('click', () => { if (made) refresh(); }));   // repaint the tab; Resend / Revoke stay on Agent Invites
  }
  function editContact(c, staff) {
    const m = modal('Edit contact', html`<form id="ecf" class="form-grid"><label>First name<input name="firstName" value="${c.firstName}"></label><label>Last name<input name="lastName" value="${c.lastName}"></label>
      <label>Email<input name="email" type="email" value="${c.email}"></label><label>Phone<input name="phone" type="tel" inputmode="tel" placeholder="xxx-xxx-xxxx" data-phone value="${c.phone}"></label><label>Company<input name="company" value="${c.company}"></label>${staff ? html`<p class="muted small">CLA staff have no contact type.</p>` : ctypeSelect(c.contactType || '')}
      <div class="span2"><button class="m-btn" type="submit">Save</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`);
    $('#ecf', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); const f = formData(e.target); if (!String(f.firstName || '').trim() && !String(f.company || '').trim()) throw new Error('Enter a first name, or a company or entity name.'); if (staff) delete f.contactType; await api.updateContact(c.id, f); closeModal(); toast('Contact saved'); refresh(); }));
  }
}
