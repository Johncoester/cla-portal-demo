// Contacts tab: everyone on this file. Processor can add people (existing or new), edit them, and unlink them from the order.
import { html, raw, $, $$, guard, formData, modal, closeModal, options, toast, pill } from '../ui.js?v=202611161500';
import { runsOrders, PARTICIPANT_ROLES, isRefi, REFI_BLOCKED_ROLES, isProcessor, fmtPhone, CONTACT_TYPES, contactTypeLabel, contactTypeForRole } from '../data/constants.js?v=202611101015';
import { pickerHtml, mountPicker, splitPersonName } from './person-picker.js?v=202611161500';
import { canInviteToPortal, inviteKindForRole } from '../data/agent-profile.js?v=202611140100';
import { autoSendInvite, inviteSendNotice, inviteToast } from '../data/invite-send.js?v=202611161500';
import { copyPlainText } from './deal.js?v=202611182110';
import { assertContactSaved, contactWritePatch, sameParty } from '../data/contact-save.js?v=202611101130';
import { lenderSectionHtml, mountLenderSection } from './lender-section.js?v=202611161500';
import { LENDER_CONTACT_ROLES, lenderRoleLabel, lenderCompanyContact, contactDisplayName } from '../data/lender-file.js?v=202611101200';
import { partyDisplayName } from '../data/party-name.js?v=202611102000';

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
  const repaint = () => { if (api.dropFileReads) api.dropFileReads(); refresh(); };
  const edit = runsOrders(user); const staffView = !user.accountRole && user.role !== 'Outside user'; const g = new URLSearchParams(location.hash.split('?')[1] || '').get('g') || 'ALL'; const grp = (GROUPS.find((x) => x[0] === g) || GROUPS[0])[1];
  const list = deal.participants.filter((p) => !grp || grp.includes(p.role));
  const party = new Set((deal.agentParties || []).map((p) => p.contactId));
  const separate = (p) => list.some((q) => q.id !== p.id && q.contactId !== p.contactId && sameParty([q], p.contact, p.role));
  const rows = list.map((p) => {
    const who = (p.role === 'Client-Buyer' || p.role === 'Client-Seller') ? partyDisplayName(p) : contactDisplayName(p.contact);
    const roleBit = lenderRoleLabel(p.contact.lenderRole);
    const phoneBtn = p.contact.phone ? html`<button type="button" class="ghost" data-copy-field="${fmtPhone(p.contact.phone)}" data-copy-kind="phone" aria-label="${'Copy ' + who + ' phone'}">Copy</button><span class="copy-confirm" data-copy-confirm hidden>Copied</span>` : '';
    const emailBtn = p.contact.email ? html`<button type="button" class="ghost" data-copy-field="${p.contact.email}" data-copy-kind="email" aria-label="${'Copy ' + who + ' email'}">Copy</button><span class="copy-confirm" data-copy-confirm hidden>Copied</span>` : '';
    const contactCells = p.contact.contactHidden
      ? html`<td colspan="2" class="muted contact-hidden">Contact through CLA Title</td>`
      : html`<td>${fmtPhone(p.contact.phone)} ${phoneBtn}</td><td>${p.contact.email} ${emailBtn}</td>`;
    const dup = separate(p) ? html` <span class="pill warn" data-duplicate-party title="Another ${p.role} row has the same name. Edit saves only this contact.">Separate contact</span>` : '';
    return html`<tr data-contact-row="${p.contactId}" data-participant="${p.id}" data-row-ctype="${p.contact.contactType || 'none'}"><td>${who}${p.removed ? html` ${pill('removed', 'bad')}` : ''}${party.has(p.contactId) ? html` <span class="pill warn agent-party" title="Client and their own agent on this file">Agent is a party</span>` : ''}${dup}${p.contact.profileId ? '' : html` <span class="muted small">(no portal login)</span>`}</td><td>${p.role}</td><td data-ctype="${p.contact.contactType || ''}">${contactTypeLabel(p.contact.contactType) || html`<span class="muted">&mdash;</span>`}${roleBit ? html` · ${roleBit}` : ''}</td><td>${p.contact.company}</td>${contactCells}
    <td class="nowrap">${canInviteToPortal(user, p.role) && !p.contact.profileId && !p.removed ? html`<button type="button" class="ghost" data-invite-portal="${p.contactId}" data-invite-role="${p.role}">Invite to portal</button> ` : ''}${edit ? html`<button type="button" class="ghost" data-edit="${p.id}">Edit</button> <button type="button" class="ghost" data-unlink="${p.id}" title="Removes this person from the order only">Remove from order</button>` : ''}</td></tr>`;
  });
  const body = html`${staffView ? lenderSectionHtml(deal, { canEdit: edit }) : ''}<div class="box-title"><h2><span class="h-ico"></span>Order Contacts</h2>${edit ? html`<button class="m-btn right" id="addp">+ Add contact</button>` : ''}</div>
    <ul class="nav-tabs">${GROUPS.map(([k]) => html`<li><a class="${k === g ? 'active' : ''}" href="#/deals/${deal.id}/contacts?g=${k}">${k}</a></li>`)}</ul>
    <form class="filter-bar" id="ctfilter"><label>Contact type<select name="ctype" aria-label="Filter by contact type"><option value="">Any</option>${CONTACT_TYPES.map(([v, l]) => html`<option value="${v}">${l}</option>`)}<option value="none">Not set</option></select></label></form>
    <table class="tbl striped" data-contacts-table><thead><tr><th>Name</th><th>Role</th><th>Contact type</th><th>Company</th><th>Phone</th><th>Email</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
  return { title: 'Contacts', crumbs: [['Contacts']], body, mount(root) {
    $$('[data-copy-field]', root).forEach((b) => b.addEventListener('click', guard(async () => {
      const outcome = await contactCopyOutcome(b.dataset.copyField, b.dataset.copyKind);
      const note = b.nextElementSibling;
      if (note && note.hasAttribute('data-copy-confirm')) { note.hidden = !outcome.ok; if (outcome.ok) setTimeout(() => { if (note.isConnected) note.hidden = true; }, 1600); }
      toast(outcome.message, outcome.level);
    })));
    $$('[data-unlink]', root).forEach((b) => b.addEventListener('click', guard(async () => { if (!confirm('Remove this person from the order? (Their contact record, documents and messages are kept.)')) return; await api.removeParticipant(deal.id, b.dataset.unlink); toast('Removed from order'); repaint(); })));
    $$('[data-edit]', root).forEach((b) => b.addEventListener('click', () => { const row = deal.participants.find((p) => p.id === b.dataset.edit); if (!row || !row.contact || !row.contact.id) { toast('This contact cannot be edited from this row.', 'err'); return; } const same = deal.participants.filter((p) => p.contactId === row.contactId); editContact(row.contact, same.some((p) => STAFF_ROLES.includes(p.role))); }));
    const ab = $('#addp', root); if (ab) ab.addEventListener('click', guard(addPerson));
    $$('[data-invite-portal]', root).forEach((b) => b.addEventListener('click', () => invitePortal(b.dataset.invitePortal, b.dataset.inviteRole)));
    const cf = $('#ctfilter [name=ctype]', root); cf.addEventListener('change', () => { $$('[data-contact-row]', root).forEach((tr) => { tr.hidden = !!cf.value && tr.dataset.rowCtype !== cf.value; }); });
    if (staffView) mountLenderSection(root, { api, deal, refresh: repaint });
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
      <div class="span2 form-grid" data-newperson><h4 class="span2">&mdash; or enter full details &mdash;</h4><label data-fn>First name<input name="firstName"></label><label>Last name<input name="lastName"></label><label>Email<input name="email" type="email"></label><label>Phone<input name="phone" type="tel" inputmode="tel" placeholder="xxx-xxx-xxxx" data-phone></label><label data-co>Company / brokerage<input name="company"></label>${ctypeSelect('')}<label data-lrole hidden>Lender contact type<select name="lenderRole" aria-label="Lender contact type"><option value="">No contact person</option>${LENDER_CONTACT_ROLES.map(([v, l]) => html`<option value="${v}">${l}</option>`)}</select></label></div>
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
      $('[data-co]', m).firstChild.textContent = lender ? 'Lender company name' : person ? 'Entity or company name' : 'Company / brokerage';
      const lrole = $('[data-lrole]', m); if (lrole) lrole.hidden = !lender; };
    roleSel.addEventListener('change', () => { if (!ctTouched) ctSel.value = contactTypeForRole(roleSel.value); const tc = isTc(); $('[data-tc-note]', m).hidden = !tc; $('[data-newperson]', m).hidden = tc; if (tc && pk.value && !tcIds.has(pk.value)) pk.set(null); paintRole(); });
    paintRole();
    $('#apf', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); const f = formData(e.target); let id = f.contactId;
      if (!id && pk.typed) throw new Error('Pick a person from the list, choose Add as a new person, or clear the search box and enter full details below.');
      if (!id && isTc()) throw new Error('Pick a Transaction Coordinator from the list.');
      if (!id && f.role === 'Lender') { const built = lenderCompanyContact({ company: f.company, firstName: f.firstName, lastName: f.lastName, email: f.email, phone: f.phone, lenderRole: f.lenderRole }); if (!built.ok) throw new Error(built.error); id = (await api.createContact(built.contact)).id; }
      if (!id && (f.role === 'Client-Buyer' || f.role === 'Client-Seller') && !String(f.firstName || '').trim() && String(f.company || '').trim()) id = (await api.createContact({ firstName: '', lastName: f.lastName, email: f.email, phone: f.phone, company: f.company, contactType: f.contactType || 'buyer_seller' })).id;
      if (!id && !String(f.firstName || '').trim() && !String(f.company || '').trim()) throw new Error('Enter a first name, or a company or entity name.');
      if (!id) id = (await api.createContact({ firstName: f.firstName, lastName: f.lastName, email: f.email, phone: f.phone, company: f.company, contactType: f.contactType })).id;
      await api.addParticipant(deal.id, id, f.role); closeModal(); toast('Contact added'); repaint(); }));
  }
  // Nov 9 (Francis: "can't invite buyers and sellers"; John: "a processor needs to be able to invite"): Invite to portal for a buyer, seller or agent
  // row with no login, right here on the file. A contact with no email gets one typed here (saved on the contact). The one-time link is shown to
  // copy, and (Nov 9, later) the portal emails it from the inviter's own Gmail (invite-send.js). Agents land on the agent account form, buyers / sellers on a short login form.
  function invitePortal(contactId, role) {
    const p = deal.participants.find((x) => x.contactId === contactId && x.role === role); if (!p) return; const c = p.contact; const hasEmail = !!String(c.email || '').trim();
    const who = inviteKindForRole(role) === 'agent' ? 'agent account' : 'portal login';
    const m = modal('Invite to portal', html`<form id="ipf" class="form-grid" data-invite-portal-form><p class="span2"><strong>${partyDisplayName(p)}</strong> (${role}) gets a one-time link to set up their ${who} for this file.</p>
      <label class="span2">Email<input name="email" type="email" maxlength="160" value="${c.email || ''}" ${hasEmail ? raw('readonly') : raw('required placeholder="name@example.com"')} data-invite-email></label>
      ${hasEmail ? '' : html`<p class="muted small span2" data-invite-email-note>This contact has no email yet. The email you enter is saved on the contact.</p>`}
      <div class="span2"><button class="m-btn" type="submit" data-invite-create>Create invite link</button> <button type="button" class="ghost" data-close>Close</button></div>
      <p class="muted small span2">The portal emails the invite from your connected Gmail. The link is also shown here to copy.</p>
      <div class="span2" data-invite-result hidden></div></form>`, { wide: true });
    let made = false;
    const showResult = (sendR, link, person) => {
      const res = $('[data-invite-result]', m); res.hidden = false;
      const linkRow = link ? html`<p><strong>Invite link</strong> for ${person.firstName} ${person.lastName} (${person.email}).</p>
        <div class="ai-link-row"><input readonly value="${link}" data-invite-link aria-label="One-time invite link"><button type="button" class="m-btn" data-copy-link>Copy</button></div>` : '';
      res.innerHTML = html`${inviteSendNotice(sendR)}${linkRow}`.toString();
      const copy = $('[data-copy-link]', res);
      if (copy && link) copy.addEventListener('click', guard(async () => { const outcome = await contactCopyOutcome(link, 'link'); toast(outcome.ok ? 'Link copied' : 'Select the link and copy it', outcome.level); }));
    };
    $('#ipf', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); if (made) return; const email = $('[data-invite-email]', m).value.trim();
      // No address on the row and none typed: say why, and do not call gmail-send. There is no link until an email is saved.
      if (!hasEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showResult({ sent: false, noLink: true, error: 'This contact has no email address, so nothing was emailed. Enter an email above.' }, '', { firstName: c.firstName || '', lastName: c.lastName || '', email: '' });
        return;
      }
      // create_portal_invite raises P0001 when agent_invites_one_pending already holds this email.
      // Resend makes a new link for that same invite, then gmail-send emails it. The copy link stays either way.
      let r;
      try { r = await api.createPortalInvite({ dealId: deal.id, contactId, email: hasEmail ? '' : email }); }
      catch (err) {
        const msg = String((err && err.message) || err || '');
        if (!/pending invite/i.test(msg)) throw err;
        const want = String(hasEmail ? c.email : email).trim().toLowerCase();
        const pending = (await api.listAgentInvites({ status: 'pending' }) || []).find((i) => String(i.email || '').trim().toLowerCase() === want);
        if (!pending) throw err;
        const again = await api.resendAgentInvite(pending.id);
        r = { ...again, firstName: again.firstName || c.firstName || '', lastName: again.lastName || c.lastName || '', email: again.email || (hasEmail ? c.email : email) };
      }
      made = true;
      const link = location.href.split('#')[0] + r.link; const sendR = await autoSendInvite(api, 'agent', r.link);
      $('[data-invite-create]', m).disabled = true;
      showResult(sendR, link, r);
      toast(inviteToast(sendR)); }));
    $$('[data-close]', m).forEach((b) => b.addEventListener('click', () => { if (made) repaint(); }));   // repaint the tab; Resend / Revoke stay on Agent Invites
  }
  function editContact(c, staff) {
    const opened = { firstName: c.firstName || '', lastName: c.lastName || '', email: c.email || '', phone: c.phone || '', company: c.company || '', contactType: c.contactType || '', lenderRole: c.lenderRole || '' };
    const m = modal('Edit contact', html`<form id="ecf" class="form-grid"><label>First name<input name="firstName" value="${opened.firstName}"></label><label>Last name<input name="lastName" value="${opened.lastName}"></label>
      <label>Email<input name="email" type="email" autocomplete="off" value="${opened.email}"></label><label>Phone<input name="phone" type="tel" inputmode="tel" placeholder="xxx-xxx-xxxx" data-phone value="${opened.phone}"></label><label>Company<input name="company" value="${opened.company}"></label>${staff ? html`<p class="muted small">CLA staff have no contact type.</p>` : ctypeSelect(opened.contactType || '')}${!staff && (c.contactType === 'lender' || c.lenderRole) ? html`<label>Lender contact type<select name="lenderRole" aria-label="Lender contact type"><option value="">Not set</option>${LENDER_CONTACT_ROLES.map(([v, l]) => html`<option value="${v}" ${v === (c.lenderRole || '') ? raw('selected') : ''}>${l}</option>`)}</select></label>` : ''}
      <div class="span2"><button class="m-btn" type="submit">Save</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`);
    $('#ecf', m).addEventListener('submit', guard(async (e) => {
      e.preventDefault();
      const form = $('#ecf', m);
      const read = (name) => { const el = (form.elements && form.elements[name]) || form.querySelector(`[name="${name}"]`); return el ? String(el.value) : ''; };
      const submitted = { firstName: read('firstName'), lastName: read('lastName'), email: read('email').trim(), phone: read('phone'), company: read('company') };
      if (!staff) submitted.contactType = read('contactType');
      if (!submitted.firstName.trim() && !submitted.company.trim()) throw new Error('Enter a first name, or a company or entity name.');
      if (submitted.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submitted.email)) throw new Error('Enter a valid email for this person.');
      const patch = contactWritePatch(opened, submitted);
      const lenderEl = !staff && form.querySelector('[name="lenderRole"]');
      if (lenderEl) {
        const lenderRole = String(lenderEl.value || '');
        if (submitted.contactType && submitted.contactType !== 'lender' && lenderRole) throw new Error('Loan Officer and Lender TC are lender contacts only.');
        if (lenderRole !== (opened.lenderRole || '')) patch.lenderRole = lenderRole;
      }
      if (!Object.keys(patch).length) { closeModal(); toast('No changes to save'); return; }
      const saved = await api.updateContact(c.id, patch);
      assertContactSaved(patch, saved);
      closeModal(); toast('Contact saved'); repaint();
    }));
  }
}
