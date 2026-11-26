// Contacts tab: everyone on this file. Processor can add people (existing or new), edit them, and unlink them from the order.
import { html, raw, $, $$, guard, formData, modal, closeModal, options, toast, pill, toText } from '../ui.js?v=202611161500';
import { runsOrders, PARTICIPANT_ROLES, CLA_TEAM_ROLES, isRefi, REFI_BLOCKED_ROLES, isProcessor, fmtPhone, CONTACT_TYPES, contactTypeLabel, contactTypeForRole, AGENT_TC_TYPE, AGENT_TC_TYPE_NOTE } from '../data/constants.js?v=202611302300';
import { pickerHtml, mountPicker, splitPersonName } from './person-picker.js?v=202611247700';
import { directoryModel, directoryChoice, directoryGroups } from '../data/file-party.js?v=202611247700';
import { canInviteToPortal, inviteKindForRole } from '../data/agent-profile.js?v=202611302000';
import { canEditAgentProfiles, agentProfileHref, AGENT_FILE_ROLES } from '../data/agent-profile-admin.js?v=202611310600';
import { autoSendInvite, inviteSendNotice, inviteToast, inviteAfterEmailChange, inviteAfterEmailChangeToast, shouldInviteAfterEmailChange } from '../data/invite-send.js?v=202611302000';
import { copyPlainText } from './deal.js?v=202611312500';
import { assertContactSaved, contactWritePatch, sameParty } from '../data/contact-save.js?v=202611101130';
import { lenderSectionHtml, mountLenderSection } from './lender-section.js?v=202611247700';
import { LENDER_CONTACT_ROLES, MORTGAGE_BROKER_ROLE, lenderRoleLabel, lenderCompanyContact, contactDisplayName } from '../data/lender-file.js?v=202611247700';
import { partyDisplayName } from '../data/party-name.js?v=202611102000';
import { existingContactByEmail, reuseContactMessage } from '../data/contact-reuse.js?v=202611249950';
import { TC_ONLY_LABEL, canReadTcOnly, canSetTcOnly, isTcOnlyRole, tcOnlyBox, tcOnlyMap } from '../data/tc-only.js?v=202611301500';
import { agentTcChoiceLabel, agentTcLabel, coordinatorContactType, fileAgents, isAgentTcPick, isAgentTcRole, linkedAgentIdsFor, rolesForNewContact, selfTcOnOrderProblem, sideAgentName, tcRolesFromLinks } from '../data/agent-tc.js?v=202611301500';
import { CLIENT_ROLES, personalInfoTaskFor, answerDetails, spouseDetails, contactProposal, proposalPatch } from '../data/personal-info-contact.js?v=202611311300';
import { ASSIGNED_TO_LABEL, TC_ASSIGN_CHOICES, knownTcAssignedRole, moveAssignedTcOnFile, tcAssignedProblem, tcAssignedRole } from '../data/tc-assigned.js?v=202611302200';

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
const STAFF_ROLES = CLA_TEAM_ROLES;
const ctypeSelect = (sel = '', name = 'contactType') => html`<label>Contact type<select name="${name}" aria-label="Contact type"><option value="">(not set)</option>${CONTACT_TYPES.map(([v, l]) => html`<option value="${v}" ${v === sel ? raw('selected') : ''}>${l}</option>`)}</select><span class="field-hint">${AGENT_TC_TYPE_NOTE}</span></label>`;
// FF-108b: required Assigned to (Buyer's Agent TC / Listing Agent TC). Always shown for a Transaction coordinator, including an existing one with a prior link.
const assignedToField = (selected = '', { hidden = true } = {}) => html`<label class="span2" data-tc-assigned ${hidden ? raw('hidden') : ''}>${ASSIGNED_TO_LABEL} <span class="req">*</span><select name="assignedTo" data-tc-assigned-sel aria-label="${ASSIGNED_TO_LABEL}"><option value="">Select...</option>${TC_ASSIGN_CHOICES.map((c) => html`<option value="${c.value}" ${c.value === selected ? raw('selected') : ''}>${c.label}</option>`)}</select></label>`;
const GROUPS = [['ALL', null], ['BUYER', ['Client-Buyer', 'Buyer Agent', 'Buyer Agent TC']], ['SELLER', ['Client-Seller', 'Listing Agent', 'Listing Agent TC']], ['REALTOR', ['Buyer Agent', 'Listing Agent', 'Buyer Agent TC', 'Listing Agent TC']], ['CLIENT', ['Client-Buyer', 'Client-Seller']], ['CLA TEAM', CLA_TEAM_ROLES]];
const contactRoleChoices = (deal) => rolesForNewContact(PARTICIPANT_ROLES, { refinance: isRefi(deal), blocked: REFI_BLOCKED_ROLES });

// FF-108: put Buyer Agent TC / Listing Agent TC rows right after the last row of their agent (same role side); others unchanged
export function tcUnderAgents(rows) {
  const AGENT = { 'Buyer Agent TC': 'Buyer Agent', 'Listing Agent TC': 'Listing Agent' };
  const out = rows.filter((p) => !(AGENT[p.role] && rows.some((q) => q.role === AGENT[p.role])));
  for (const tcRole of ['Buyer Agent TC', 'Listing Agent TC']) {
    const tcs = rows.filter((p) => p.role === tcRole && rows.some((q) => q.role === AGENT[tcRole]));
    if (!tcs.length) continue;
    let at = -1; out.forEach((p, i) => { if (p.role === AGENT[tcRole]) at = i; });
    out.splice(at + 1, 0, ...tcs);
  }
  return out;
}

export async function render({ api, user, deal, refresh }) {
  const repaint = () => { if (api.dropFileReads) api.dropFileReads(); refresh(); };
  const edit = runsOrders(user); const staffView = !user.accountRole && user.role !== 'Outside user'; const g = new URLSearchParams(location.hash.split('?')[1] || '').get('g') || 'ALL'; const grp = (GROUPS.find((x) => x[0] === g) || GROUPS[0])[1];
  // FF-108 (Francis, Nov 23 2026): each agent's coordinator sits directly under that agent (Buyer Agent TC under the Buyer Agent,
  // Listing Agent TC under the Listing Agent). Everyone else keeps their order. A TC whose agent is not in this view stays where it was.
  const list = tcUnderAgents(deal.participants.filter((p) => !grp || grp.includes(p.role)));
  // TC-ONLY-2 (John, Nov 22 2026): "Only communicate with TC" on each buyer's agent / listing agent. CLA staff only; one read, only when the file has an agent.
  const tcEdit = canSetTcOnly(user);   // TC-ONLY-2b: read only for roles the server allows (canReadTcOnly), so sales staff make no refused call
  let tcRows = new Map();
  if (staffView && canReadTcOnly(user) && api.tcOnlyStatus && deal.participants.some((p) => isTcOnlyRole(p.role) && !p.removed)) {
    try { tcRows = tcOnlyMap(await api.tcOnlyStatus(deal.id)); } catch (e) { tcRows = new Map(); }   // the box stays hidden; emails are still routed by the database
  }
  const tcBox = (p) => {
    // FF-108: the greyed-out text names the agent, and says when that side's coordinator is on the file but not linked to them
    const sideTcRole = p.role === 'Listing Agent' ? 'Listing Agent TC' : 'Buyer Agent TC';
    const unlinked = deal.participants.filter((q) => q.role === sideTcRole && !q.removed).map((q) => contactDisplayName(q.contact)).filter(Boolean);
    const b = staffView && !p.removed ? tcOnlyBox(tcRows.get(p.id), p.role, { canEdit: tcEdit, agentName: contactDisplayName(p.contact), sideTcNames: unlinked }) : null;
    if (!b) return '';
    return html`<div class="small tc-only-box" data-tc-only-row="${p.id}"><label class="check small" title="${b.title}"><input type="checkbox" data-tc-only="${p.id}" ${b.checked ? raw('checked') : ''} ${b.disabled ? raw('disabled') : ''}> ${TC_ONLY_LABEL}</label><div class="muted small" data-tc-only-hint>${b.hint}</div></div>`;
  };
  // CONNECT-3 (John, Nov 25 2026, rows 7.3 / 7.7): each buyer's and seller's saved Personal Information answers, and their spouse, show here.
  // Staff copy name or phone onto the contact with Review answers; a client's save never overwrites the contact (row 7.7).
  const piParties = staffView && edit ? list.filter((p) => CLIENT_ROLES.includes(p.role) && !p.removed && p.contact && p.contact.id) : [];
  const pi = await loadPersonalInfo(api, deal.id, piParties);
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
    // TC-BTN-REMOVE (John, Nov 19 2026, screenshot of MD-26-97260): no Transaction coordinators button on this list.
    return html`<tr data-contact-row="${p.contactId}" data-participant="${p.id}" data-row-ctype="${p.contact.contactType || 'none'}"><td>${who}${p.removed ? html` ${pill('removed', 'bad')}` : ''}${party.has(p.contactId) ? html` <span class="pill warn agent-party" title="Client and their own agent on this file">Agent is a party</span>` : ''}${dup}${p.contact.profileId ? '' : html` <span class="muted small">(no portal login)</span>`}</td><td>${agentTcLabel(p.role, sideAgentName(deal.participants, p.role))}${tcBox(p)}</td><td data-ctype="${p.contact.contactType || ''}">${contactTypeLabel(p.contact.contactType) || html`<span class="muted">&mdash;</span>`}${roleBit ? html` · ${roleBit}` : ''}</td><td>${p.contact.company}</td>${contactCells}
    <td class="nowrap">${canInviteToPortal(user, p.role) && !p.contact.profileId && !p.removed ? html`<button type="button" class="ghost" data-invite-portal="${p.contactId}" data-invite-role="${p.role}">Invite to portal</button> ` : ''}${canEditAgentProfiles(user) && AGENT_FILE_ROLES.includes(p.role) && p.contact.profileId && !p.removed ? html`<a class="ghost" href="${agentProfileHref(p.contact.profileId)}?back=${encodeURIComponent('#/deals/' + deal.id + '/contacts')}" data-edit-agent-profile="${p.contact.profileId}">Edit agent profile</a> ` : ''}${edit ? html`<button type="button" class="ghost" data-edit="${p.id}">Edit</button> <button type="button" class="ghost" data-unlink="${p.id}" title="Removes this person from the order only">Remove from order</button>` : ''}</td></tr>`;
  });
  const body = html`${staffView ? lenderSectionHtml(deal, { canEdit: edit }) : ''}<div class="box-title"><h2><span class="h-ico"></span>Order Contacts</h2>${edit ? html`<button class="m-btn right" id="addp">+ Add contact</button>` : ''}</div>
    <ul class="nav-tabs">${GROUPS.map(([k]) => html`<li><a class="${k === g ? 'active' : ''}" href="#/deals/${deal.id}/contacts?g=${k}">${k}</a></li>`)}</ul>
    <form class="filter-bar" id="ctfilter"><label>Contact type<select name="ctype" aria-label="Filter by contact type"><option value="">Any</option>${CONTACT_TYPES.map(([v, l]) => html`<option value="${v}">${l}</option>`)}<option value="none">Not set</option></select></label></form>
    <table class="tbl striped" data-contacts-table><thead><tr><th>Name</th><th>Role</th><th>Contact type</th><th>Company</th><th>Phone</th><th>Email</th><th></th></tr></thead><tbody>${rows}</tbody></table>${personalInfoHtml(piParties, pi)}`;
  return { title: 'Contacts', crumbs: [['Contacts']], body, mount(root) {
    $$('[data-copy-field]', root).forEach((b) => b.addEventListener('click', guard(async () => {
      const outcome = await contactCopyOutcome(b.dataset.copyField, b.dataset.copyKind);
      const note = b.nextElementSibling;
      if (note && note.hasAttribute('data-copy-confirm')) { note.hidden = !outcome.ok; if (outcome.ok) setTimeout(() => { if (note.isConnected) note.hidden = true; }, 1600); }
      toast(outcome.message, outcome.level);
    })));
    $$('[data-unlink]', root).forEach((b) => b.addEventListener('click', guard(async () => { if (!confirm('Remove this person from the order? (Their contact record, documents and messages are kept.)')) return; await api.removeParticipant(deal.id, b.dataset.unlink); toast('Removed from order'); repaint(); })));
    $$('[data-edit]', root).forEach((b) => b.addEventListener('click', () => { const row = deal.participants.find((p) => p.id === b.dataset.edit); if (!row || !row.contact || !row.contact.id) { toast('This contact cannot be edited from this row.', 'err'); return; } const same = deal.participants.filter((p) => p.contactId === row.contactId); editContact(row.contact, same.some((p) => STAFF_ROLES.includes(p.role)), same, row.role); }));
    const ab = $('#addp', root); if (ab) ab.addEventListener('click', guard(addPerson));
    $$('[data-tc-only]', root).forEach((cb) => cb.addEventListener('change', async () => {
      const on = cb.checked; cb.disabled = true;
      try {
        const r = await api.setParticipantTcOnly(cb.dataset.tcOnly, on);
        toast(on ? `Only communicate with TC is on. Emails and alerts for this agent now go to ${(r.tcs || []).join(', ') || 'their TC'}.` : 'Only communicate with TC is off. The agent gets emails again.');
        repaint();
      } catch (e) {
        cb.checked = !on; cb.disabled = false;
        toast(`${(e && e.message) || 'That did not save.'} Nothing was changed.`, 'err');
      }
    }));
    $$('[data-pi-review]', root).forEach((b) => b.addEventListener('click', () => reviewAnswers(b.dataset.piReview)));
    $$('[data-invite-portal]', root).forEach((b) => b.addEventListener('click', () => invitePortal(b.dataset.invitePortal, b.dataset.inviteRole)));
    const cf = $('#ctfilter [name=ctype]', root); cf.addEventListener('change', () => { $$('[data-contact-row]', root).forEach((tr) => { tr.hidden = !!cf.value && tr.dataset.rowCtype !== cf.value; }); });
    if (staffView) mountLenderSection(root, { api, deal, refresh: repaint });
  } };

  // CONNECT-3: tick what to copy from the Personal Information answers onto the contact. Blank contact fields start ticked.
  function reviewAnswers(participantId) {
    const p = piParties.find((x) => x.id === participantId); const got = pi.get(participantId);
    if (!p || !got) { toast('Those answers are no longer available. Reload the page.', 'err'); return; }
    const prop = contactProposal(p.contact, got.answers);
    const m = modal('Review Personal Information answers', html`<form id="pirf" class="form-grid"><p class="span2 muted small">${partyDisplayName(p)} (${p.role === 'Client-Buyer' ? 'Buyer' : 'Seller'}) saved these answers. Tick what should replace the contact. Nothing changes until you save.</p>
      ${prop.fields.length ? html`<table class="tbl span2" data-pi-fields><thead><tr><th></th><th>Field</th><th>On the contact now</th><th>From the form</th></tr></thead><tbody>${prop.fields.map((f) => html`<tr><td><input type="checkbox" name="pi" value="${f.key}" aria-label="${'Use the form ' + f.label.toLowerCase()}" ${f.blank ? raw('checked') : ''}></td><td>${f.label}</td><td>${f.current || html`<span class="muted">(blank)</span>`}</td><td>${f.answered}</td></tr>`)}</tbody></table>` : html`<p class="span2" data-pi-same>The contact's name and phone already match the form.</p>`}
      ${prop.emailNote ? html`<p class="notice warn small span2" data-pi-email>${prop.emailNote}</p>` : ''}
      <div class="span2">${prop.fields.length ? html`<button class="m-btn" type="submit">Save to contact</button> ` : ''}<button type="button" class="ghost" data-close>${prop.fields.length ? 'Cancel' : 'Close'}</button></div></form>`);
    $('#pirf', m).addEventListener('submit', guard(async (e) => {
      e.preventDefault();
      const patch = proposalPatch(prop, $$('[name=pi]:checked', m).map((x) => x.value));
      if (!patch) throw new Error('Tick at least one field to copy, or choose Cancel.');
      const saved = await api.updateContact(p.contact.id, patch);
      assertContactSaved(patch, saved);
      closeModal(); toast('Contact updated from the Personal Information answers'); repaint();
    }));
  }

  // John, Nov 2: type-to-search picker (name / email / phone / brokerage).
  // TC-5: one role, Transaction coordinator. FF-108b: a required Assigned to dropdown picks the side
  // (Buyer's Agent TC or Listing Agent TC). It stays visible for an existing coordinator, with the known side pre-selected.
  // Francis, Nov 9: same Place Order inline "Add … as a new person" when there is no match,
  // so adding a party on an already-opened file no longer dead-ends on "clear the search box".
  async function addPerson() {
    const people = await api.listContacts();
    const typeFor = (r) => contactTypeForRole(r) || coordinatorContactType(r);
    const m = modal('Add contact to this order', html`<form id="apf" class="form-grid"><label class="span2">Role on this order<select name="role">${options(contactRoleChoices(deal), 'Other', (r) => agentTcChoiceLabel(r))}</select></label>${isRefi(deal) ? html`<p class="muted small span2" data-refi-roles>Refinance: no seller, realtor or transaction coordinator roles. Add the borrower as Client-Buyer.</p>` : ''}
      <p class="muted small span2">One person can hold two roles on an order only when an agent is buying or selling for themselves: add them once as Client-Buyer and once as Buyer Agent (or Client-Seller and Listing Agent).</p>
      <p class="muted small span2">Type a name, email and phone in the fields below. You do not have to pick an existing contact, and no portal login or invite is created. If that email is already on a contact, that person is added to this file and a second record is not created. Invite them later with Invite to portal. The search box and, for an agent or lender, the company list are optional.</p>
      <label class="span2" data-dir-wrap hidden>Existing company or person<select data-dir-select aria-label="Existing company or person"><option value="">Not listed — type them below</option></select></label>
      <div class="span2">${pickerHtml('contactId', 'Contact')}</div>
      <div class="span2 form-grid" data-newperson><h4 class="span2">&mdash; or enter full details &mdash;</h4><label data-fn>First name<input name="firstName"></label><label>Last name<input name="lastName"></label><label>Email<input name="email" type="email"></label><label>Phone<input name="phone" type="tel" inputmode="tel" placeholder="xxx-xxx-xxxx" data-phone></label><label data-co>Company / brokerage<input name="company"></label>${ctypeSelect('')}<label data-lrole hidden>Lender contact type<select name="lenderRole" aria-label="Lender contact type"><option value="">No contact person</option>${LENDER_CONTACT_ROLES.map(([v, l]) => html`<option value="${v}">${l}</option>`)}</select></label></div>
      ${assignedToField("")}
      <div class="span2"><button class="m-btn" type="submit">Add</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`, { wide: true });
    const roleSel = $('[name=role]', m);
    const dirWrap = $('[data-dir-wrap]', m); const dirSel = $('[data-dir-select]', m);
    const paintDir = () => {
      const role = roleSel.value;
      const show = role === 'Buyer Agent' || role === 'Listing Agent' || role === 'Lender' || isAgentTcRole(role) || isAgentTcPick(role);
      dirWrap.hidden = !show;
      if (!show) { dirSel.value = ''; return; }
      const model = directoryModel(people, role === 'Lender' ? 'lender' : (isAgentTcRole(role) || isAgentTcPick(role)) ? 'tc' : 'agent');
      const group = (label, options) => (options.length ? html`<optgroup label="${label}">${options.map((o) => html`<option value="${o.value}">${o.label}</option>`)}</optgroup>` : '');
      dirSel.innerHTML = toText(html`<option value="">Not listed — type them below</option>${directoryGroups(model).map(([label, options]) => group(label, options))}`);
    };
    dirSel.addEventListener('change', () => {
      const choice = directoryChoice(dirSel.value);
      if (choice.kind === 'person') { const c = people.find((p) => p.id === choice.contactId); if (c) pk.set(c); paintTc(); }
      else if (choice.kind === 'company') { const co = $('[name=company]', m); if (co) co.value = choice.company; }
    });
    // Same quick-create rules as Place Order (ordernew.js): split the typed name; lender company-ish strings become company-only.
    const quickCreate = async (typed) => {
      const name = String(typed || '').trim(); if (!name) throw new Error('Type a name first.');
      const role = roleSel.value;
      const { firstName, lastName } = splitPersonName(name);
      const contactType = typeFor(role) || '';
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
    let tcGen = 0;
    const chosenContactId = () => (pk && pk.value) || (directoryChoice(dirSel.value).kind === 'person' ? directoryChoice(dirSel.value).contactId : '');
    const resolveTc = async (contactId) => {
      const agents = fileAgents(deal.participants);
      let linkedRoles = [];
      if (contactId) linkedRoles = tcRolesFromLinks(agents, await linkedAgentIdsFor(api, contactId, agents));
      return { agents, linkedRoles };
    };
    let tcPickFor = '';
    const paintTc = async () => {
      const gen = ++tcGen;
      const wrap = $('[data-tc-assigned]', m);
      const sel = $('[data-tc-assigned-sel]', m);
      if (!wrap || !sel) return;
      if (!isAgentTcPick(roleSel.value)) { wrap.hidden = true; return; }
      const contactId = chosenContactId();
      const { linkedRoles } = await resolveTc(contactId);
      if (gen !== tcGen) return;
      const keep = sel.value;
      const known = knownTcAssignedRole({ linkedRoles });
      if (contactId !== tcPickFor) {
        sel.value = known || '';
        tcPickFor = contactId;
      } else if (keep && [...sel.options].some((o) => o.value === keep)) sel.value = keep;
      else if (!keep && known) sel.value = known;
      wrap.hidden = false;
    };
    const pk = mountPicker($('[data-picker=contactId]', m), () => people, {
      createVerb: () => (roleSel.value === 'Lender' ? 'lender' : 'person'),
      onCreate: quickCreate,
      onSet: () => { paintTc(); },
    });
    const q = $('.picker-q', $('[data-picker=contactId]', m));
    if (q) q.addEventListener('input', () => { paintTc(); });
    const ctSel = $('[data-newperson] [name=contactType]', m); let ctTouched = false; ctSel.addEventListener('change', () => { ctTouched = true; });
    const paintRole = () => { const r = roleSel.value; const lender = r === 'Lender'; const person = r === 'Client-Buyer' || r === 'Client-Seller';
      $('[data-fn]', m).firstChild.textContent = lender ? 'Contact first name (optional)' : person ? 'First name (leave blank for an entity)' : 'First name';
      $('[data-co]', m).firstChild.textContent = lender ? 'Lender company name' : person ? 'Entity or company name' : 'Company / brokerage';
      const lrole = $('[data-lrole]', m); if (lrole) lrole.hidden = !lender; };
    roleSel.addEventListener('change', () => { const r = roleSel.value; if (!ctTouched) ctSel.value = typeFor(r); paintRole(); paintDir(); paintTc(); });
    paintRole(); paintDir(); paintTc();
    $('#apf', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); const f = formData(e.target); let id = f.contactId || (pk && pk.value) || '';
      const choice = directoryChoice(dirSel.value);
      if (!id && choice.kind === 'person') id = choice.contactId;
      if (!id && pk.typed && !String(f.firstName || '').trim() && !String(f.company || '').trim()) { const split = splitPersonName(pk.typed); f.firstName = split.firstName; f.lastName = f.lastName || split.lastName; }
      let reused = id ? null : existingContactByEmail(people, f.email);
      if (!id && reused) id = reused.id;
      if (!id && f.role === 'Lender') { const built = lenderCompanyContact({ company: f.company, firstName: f.firstName, lastName: f.lastName, email: f.email, phone: f.phone, lenderRole: f.lenderRole }); if (!built.ok) throw new Error(built.error); const c = await api.createContact(built.contact); id = c.id; if (!reused) reused = people.find((p) => p.id === c.id) || null; }
      if (!id && (f.role === 'Client-Buyer' || f.role === 'Client-Seller') && !String(f.firstName || '').trim() && String(f.company || '').trim()) { const c = await api.createContact({ firstName: '', lastName: f.lastName, email: f.email, phone: f.phone, company: f.company, contactType: f.contactType || 'buyer_seller' }); id = c.id; if (!reused) reused = people.find((p) => p.id === c.id) || null; }
      if (!id && !String(f.firstName || '').trim() && !String(f.company || '').trim()) throw new Error('Enter a first name, or a company or entity name.');
      if (isAgentTcPick(f.role)) {
        const known = id ? people.find((p) => p.id === id) : null;
        const person = { contactId: id || '', email: (known && known.email) || f.email || '' };
        const { agents } = await resolveTc(id);
        const assigned = (($('[data-tc-assigned-sel]', m) || {}).value) || '';
        const side = tcAssignedProblem({ hasPerson: true, choice: assigned, agents });
        if (side) throw new Error(side);
        const self = selfTcOnOrderProblem(person, agents, assigned ? [assigned] : []);
        if (self) throw new Error(self);
      }
      if (!id) { const c = await api.createContact({ firstName: f.firstName, lastName: f.lastName, email: f.email, phone: f.phone, company: f.company, contactType: f.contactType || typeFor(f.role) }); id = c.id; if (!reused) reused = people.find((p) => p.id === c.id) || null; }
      if (isAgentTcPick(f.role)) {
        const { agents } = await resolveTc(id);
        const assigned = (($('[data-tc-assigned-sel]', m) || {}).value) || '';
        const problem = tcAssignedProblem({ hasPerson: true, choice: assigned, agents });
        if (problem) throw new Error(problem);
        // FF-108b: the Assigned to choice is the stored side. If this person was already on the other
        // side (for example an earlier agent_tc_links auto-place), move them so they list only under the chosen agent.
        const current = ((await api.getDeal(deal.id)) || deal).participants || [];
        await moveAssignedTcOnFile(api, deal.id, id, assigned, current);
      } else await api.addParticipant(deal.id, id, f.role);
      closeModal(); toast(reused && String(f.email || '').trim() ? reuseContactMessage(reused) : 'Contact added'); repaint(); }));
  }
  // Nov 9 (Francis: "can't invite buyers and sellers"; John: "a processor needs to be able to invite"): Invite to portal for a buyer, seller or agent
  // row with no login, right here on the file. A contact with no email gets one typed here (saved on the contact). The one-time link is shown to
  // copy. Since Nov 11 the portal emails it from testportal@clatitle.com (invite-send.js), never from the inviter's Gmail. Agents land on the agent account form, buyers / sellers on a short login form.
  function invitePortal(contactId, role) {
    const p = deal.participants.find((x) => x.contactId === contactId && x.role === role); if (!p) return; const c = p.contact; const hasEmail = !!String(c.email || '').trim();
    const who = inviteKindForRole(role) === 'agent' ? 'agent account' : 'portal login';
    const m = modal('Invite to portal', html`<form id="ipf" class="form-grid" data-invite-portal-form><p class="span2"><strong>${partyDisplayName(p)}</strong> (${agentTcLabel(role, sideAgentName(deal.participants, role))}) gets a one-time link to set up their ${who} for this file.</p>
      <label class="span2">Email<input name="email" type="email" maxlength="160" value="${c.email || ''}" ${hasEmail ? raw('readonly') : raw('required placeholder="name@example.com"')} data-invite-email></label>
      ${hasEmail ? '' : html`<p class="muted small span2" data-invite-email-note>This contact has no email yet. The email you enter is saved on the contact.</p>`}
      <div class="span2"><button class="m-btn" type="submit" data-invite-create>Create invite link</button> <button type="button" class="ghost" data-close>Close</button></div>
      <p class="muted small span2">The portal emails the invite from testportal@clatitle.com. The link is also shown here to copy. You do not need to connect Gmail.</p>
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
  async function editContact(c, staff, same = [], openedRole = '') {
    const opened = { firstName: c.firstName || '', lastName: c.lastName || '', email: c.email || '', phone: c.phone || '', company: c.company || '', contactType: c.contactType || '', lenderRole: c.lenderRole || '' };
    const tcRows = same.filter((p) => isAgentTcRole(p.role) && !p.removed);
    const agents = fileAgents(deal.participants);
    let linkedRoles = [];
    if (!staff && (opened.contactType === AGENT_TC_TYPE || tcRows.length)) {
      try { linkedRoles = tcRolesFromLinks(agents, await linkedAgentIdsFor(api, c.id, agents)); } catch (e) { linkedRoles = []; }
    }
    const initialAssigned = knownTcAssignedRole({ fileRoles: tcRows.map((p) => p.role), linkedRoles, preferredRole: openedRole });
    const showAssigned = !staff && (opened.contactType === AGENT_TC_TYPE || tcRows.length);
    const m = modal('Edit contact', html`<form id="ecf" class="form-grid"><label>First name<input name="firstName" value="${opened.firstName}"></label><label>Last name<input name="lastName" value="${opened.lastName}"></label>
      <label>Email<input name="email" type="email" autocomplete="off" value="${opened.email}"></label><label>Phone<input name="phone" type="tel" inputmode="tel" placeholder="xxx-xxx-xxxx" data-phone value="${opened.phone}"></label><label>Company<input name="company" value="${opened.company}"></label>${staff ? html`<p class="muted small">CLA staff have no contact type.</p>` : ctypeSelect(opened.contactType || '')}${!staff && (c.contactType === 'lender' || c.lenderRole) ? html`<label>Lender contact type<select name="lenderRole" aria-label="Lender contact type"><option value="">Not set</option>${[...LENDER_CONTACT_ROLES, [MORTGAGE_BROKER_ROLE, 'Mortgage Broker']].map(([v, l]) => html`<option value="${v}" ${v === (c.lenderRole || '') ? raw('selected') : ''}>${l}</option>`)}</select></label>` : ''}
      ${staff ? '' : assignedToField(initialAssigned, { hidden: !showAssigned })}
      <div class="span2"><button class="m-btn" type="submit">Save</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`);
    const paintEditAssigned = () => {
      const wrap = $('[data-tc-assigned]', m);
      if (!wrap) return;
      const type = (($('[name=contactType]', m) || {}).value) || '';
      wrap.hidden = !(type === AGENT_TC_TYPE || tcRows.length);
    };
    const typeSel = $('[name=contactType]', m);
    if (typeSel) typeSel.addEventListener('change', paintEditAssigned);
    $('#ecf', m).addEventListener('submit', guard(async (e) => {
      e.preventDefault();
      const form = $('#ecf', m);
      const read = (name) => { const el = (form.elements && form.elements[name]) || form.querySelector(`[name="${name}"]`); return el ? String(el.value) : ''; };
      const submitted = { firstName: read('firstName'), lastName: read('lastName'), email: read('email').trim(), phone: read('phone'), company: read('company') };
      if (!staff) submitted.contactType = read('contactType');
      if (!submitted.firstName.trim() && !submitted.company.trim()) throw new Error('Enter a first name, or a company or entity name.');
      if (submitted.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submitted.email)) throw new Error('Enter a valid email for this person.');
      const wrap = $('[data-tc-assigned]', m);
      const assignedSel = $('[data-tc-assigned-sel]', m);
      const assignedShown = !!(wrap && !wrap.hidden);
      const assigned = assignedShown ? String((assignedSel && assignedSel.value) || '') : '';
      if (assignedShown) {
        const alreadyOnSide = tcRows.some((p) => p.role === assigned);
        const side = tcAssignedProblem({ hasPerson: true, choice: assigned, agents, alreadyOnSide });
        if (side) throw new Error(side);
        const self = selfTcOnOrderProblem({ contactId: c.id, email: submitted.email || c.email || '' }, agents, assigned ? [assigned] : []);
        if (self) throw new Error(self);
      }
      const patch = contactWritePatch(opened, submitted);
      const lenderEl = !staff && form.querySelector('[name="lenderRole"]');
      if (lenderEl) {
        const lenderRole = String(lenderEl.value || '');
        if (submitted.contactType && submitted.contactType !== 'lender' && lenderRole) throw new Error('Loan Officer, Lender TC, and Mortgage Broker are lender contacts only.');
        if (lenderRole !== (opened.lenderRole || '')) patch.lenderRole = lenderRole;
      }
      const assignedChanged = assignedShown && tcAssignedRole(assigned) && (tcRows.some((p) => p.role !== assigned) || !tcRows.some((p) => p.role === assigned));
      if (!Object.keys(patch).length && !assignedChanged) { closeModal(); toast('No changes to save'); return; }
      if (Object.keys(patch).length) {
        const saved = await api.updateContact(c.id, patch);
        assertContactSaved(patch, saved);
      }
      if (assignedChanged) await moveAssignedTcOnFile(api, deal.id, c.id, assigned, same);
      // Prefer an agent role when the same person is both agent and client on this file,
      // so the automatic invite matches that role (FF-073e / John, 1:30 PM ET Nov 13).
      const inviteRole = (same.find((p) => inviteKindForRole(p.role) === 'agent') || same.find((p) => shouldInviteAfterEmailChange(p.role, opened.email, submitted.email)) || {}).role || '';
      let note = 'Contact saved';
      if (shouldInviteAfterEmailChange(inviteRole, opened.email, submitted.email)) {
        const sendR = await inviteAfterEmailChange(api, { dealId: deal.id, contactId: c.id, role: inviteRole, previousEmail: opened.email, newEmail: submitted.email });
        note = [note, inviteAfterEmailChangeToast(sendR)].filter(Boolean).join('. ');
      }
      closeModal(); toast(note); repaint();
    }));
  }
}

/* CONNECT-3: one task list read and one spouse read for the file, then one answers read per saved Personal Information copy.
 * A read that fails leaves that party out; the rest of the tab still works. Map(participantId -> { task, answers, spouse }) */
export async function loadPersonalInfo(api, dealId, parties) {
  const out = new Map();
  if (!parties.length || !api || !api.listTasks || !api.getTask) return out;
  let tasks = []; let spouses = [];
  try { [tasks, spouses] = await Promise.all([api.listTasks(dealId), api.getSpouse ? api.getSpouse(dealId).catch(() => []) : []]); } catch (e) { return out; }
  await Promise.all(parties.map(async (p) => {
    const t = personalInfoTaskFor(tasks, p.id);
    if (!t) return;
    try {
      const full = await api.getTask(t.id);
      if (!full || full.formHidden || full.formError) return;
      out.set(p.id, { task: t, answers: full.formData || {}, spouse: spouseDetails((spouses || []).find((r) => r.participantId === p.id)) });
    } catch (e) { /* left out */ }
  }));
  return out;
}

export function personalInfoHtml(parties, pi) {
  const shown = parties.filter((p) => pi.has(p.id));
  if (!shown.length) return '';
  const card = (p) => {
    const got = pi.get(p.id);
    const det = answerDetails(got.answers);
    const prop = contactProposal(p.contact, got.answers);
    const todo = prop.fields.length || prop.emailNote;
    const sp = got.spouse;
    return html`<div class="card pi-card" data-pi-party="${p.id}"><h4>${partyDisplayName(p)} <span class="muted small">${p.role === 'Client-Buyer' ? 'Buyer' : 'Seller'}${got.task.status === 'done' ? '' : ' · form not finished yet'}</span></h4>
      <dl class="kv small">${det.map((d) => html`<dt>${d.label}</dt><dd>${d.value}</dd>`)}${sp ? html`<dt>Spouse</dt><dd data-pi-spouse>${[sp.fullName, sp.maritalStatus, sp.citizenship ? 'Citizenship: ' + sp.citizenship : '', fmtPhone(sp.phone), sp.email].filter(Boolean).join(' · ')}</dd>` : ''}</dl>
      ${!det.length && !sp ? html`<p class="muted small">No address, marital status or spouse answers yet.</p>` : ''}
      <p class="small">${todo ? html`<span class="pill warn" data-pi-todo>Answers differ from the contact</span> ` : html`<span class="pill ok">Contact matches the form</span> `}${todo ? html`<button type="button" class="ghost small" data-pi-review="${p.id}">Review answers</button> ` : ''}<a class="small" href="#/deals/${got.task.dealId}/tasks/${got.task.id}">Open the task</a></p></div>`;
  };
  return html`<section data-personal-info><div class="box-title"><h2><span class="h-ico"></span>From Personal Information</h2></div><p class="muted small">What each buyer and seller entered on their Personal Information task, including their spouse. A client's answers do not change the contact on their own; use Review answers to copy a name or phone.</p><div>${shown.map(card)}</div></section>`;
}
