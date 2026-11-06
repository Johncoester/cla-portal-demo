// Deal detail: File Overview + dispatcher to the other file tabs (tasks, inbox, documents, contacts, activity).
import { html, raw, toText, $, $$, guard, formData, modal, closeModal, options, fmtDate, fmtMoney, pill, toast } from '../ui.js?v=202611060404';
import { GMAIL_OFF } from '../data/automation.js?v=202611060404';
import { occSelects, yesNo } from './occ-fields.js?v=202611060404';
import { runsOrders, STAGES, DEAL_STATUSES, isProcessor, fmtPhone, localDate, US_STATE_NAMES, US_STATES, isRefi } from '../data/constants.js?v=202611060404';
import { modOn } from '../data/modules.js?v=202611060404';
import { slotText } from './dealclosing.js?v=202611060404';
import { pickerHtml, mountPicker } from './person-picker.js?v=202611060404';
import { composeModal } from './compose.js?v=202611060404';
import { moneyShow, moneyClean } from './money-input.js?v=202611060404';
import { sampleFacts, SAMPLE } from './theme-cards.js?v=202611060404';
import { themeOn } from '../theme.js?v=202611060404';
import { renderClientOverview, clientSide, isPureClient, clientTabChrome } from './client-overview.js?v=202611060404';
import { renderTcOverview, tcTabChrome } from './tc-overview.js?v=202611060404';

const TABS = { tasks: './dealtasks.js?v=202611060404', inbox: './dealmsgs.js?v=202611060404', documents: './dealdocs.js?v=202611060404', contacts: './dealcontacts.js?v=202611060404', activity: './dealactivity.js?v=202611060404', closing: './dealclosing.js?v=202611060404', agreements: './dealagreements.js?v=202611060404', accounting: './dealaccounting.js?v=202611060404', title: './dealtitle.js?v=202611060404', funding: './dealfwp.js?v=202611060404', wires: './dealfwp.js?v=202611060404', policy: './dealfwp.js?v=202611060404' };   // accounting: behind the `accounting` flag (app.js + the page refuse when off)
import { placeText } from '../data/cla-offices.js?v=202611060404';

export async function render(ctx) {
  const { api, params } = ctx; const tab = params.tab;
  const deal = await api.getDeal(params.id);
  // per-file roles: on this order an outside user acts as their role HERE (deal.myRole), e.g. Buyer Agent here, Client-Buyer elsewhere
  const user = ctx.user.role === 'Outside user' && deal.myRole ? { ...ctx.user, role: deal.myRole, roles: deal.myRoles || [deal.myRole], selfRep: !!deal.selfRep, accountRole: ctx.user.role } : ctx.user; ctx = { ...ctx, user };
  const here = [['Orders', '#/orders'], [deal.fileNumber, `#/deals/${deal.id}`]];
  if (tab === 'accounting' && !(api.features || {}).accounting) throw new Error('That page does not exist.');
  if (tab === 'title' && !(api.features || {}).title) throw new Error('That page does not exist.');   // John, Nov 4: order > Title behind the `title` flag
  if (tab === 'contacts' && user.accountRole && isPureClient(user)) throw new Error('Your closing team is on the Overview.');   // buyer (Nov 4 call) and seller (mirror): no Contacts tab. Accounting stays behind its module switch on CLA Portal Live Test.
  // CLIENT TABS (John, Nov 4: every buyer tab in the light client layout; same for the seller): the tab's own content, under the client file line +
  // pill tabs, drawn in the client shell (app.js: white top bar, CLA logo, no sidebar). The content and its rules are unchanged.
  if (tab !== 'overview' && TABS[tab] && user.role === 'Transaction Coordinator' && !user.accountRole) {
    const mod = await import(tab === 'tasks' && params.sub ? './dealtaskform.js?v=202611060404' : TABS[tab]); const v = await mod.render({ ...ctx, deal });
    const top = await tcTabChrome(ctx, deal, tab);
    return { ...v, crumbs: [...here, ...(v.crumbs || [])], tcPage: true, body: html`<div class="co-page tc-page" data-tc-tabpage="${tab}">${top}<section class="co-card co-tabcard"><div class="co-cb">${v.body}</div></section></div>` };
  }
  if (tab !== 'overview' && TABS[tab] && user.accountRole && clientSide(user)) {
    const mod = await import(tab === 'tasks' && params.sub ? './dealtaskform.js?v=202611060404' : TABS[tab]); const v = await mod.render({ ...ctx, deal });
    const top = await clientTabChrome(ctx, deal, tab);
    return { ...v, crumbs: [...here, ...(v.crumbs || [])], clientPage: { deal, side: clientSide(user), tab }, body: html`<div class="co-page co-tabpage" data-client-tab="${tab}">${top}<section class="co-card co-tabcard"><div class="co-cb">${v.body}</div></section></div>` };
  }
  if (tab !== 'overview' && TABS[tab]) { const mod = await import(tab === 'tasks' && params.sub ? './dealtaskform.js?v=202611060404' : TABS[tab]); const v = await mod.render({ ...ctx, deal }); return { ...v, crumbs: [...here, ...(v.crumbs || [])] }; }
  if (tab !== 'overview') throw new Error('That page does not exist.');
  if (user.role === 'Transaction Coordinator' && !user.accountRole) { return renderTcOverview(ctx, deal); }
  // CLIENT OVERVIEW (John, Nov 4): the buyer / seller get the redesigned overview (client-overview.js) in place of the old overview + card summary (no Cash to Close / payoff mockup figures for clients).
  if (user.accountRole && clientSide(user)) {
    const ov0 = await ctx.api.getOrderOverview(deal.id);
    { const co = await renderClientOverview({ ...ctx, wireModal, shareModal: (o) => shareModal(ctx, deal, ov0, o) }, deal, here); const lp = await locPromptHtml(ctx, deal); return lp ? { ...co, body: html`${lp}${co.body}` } : co; }   // John, Nov 4: the buyer / seller closing-location to-do also shows on the client overview
  }
  const ag = await ctx.api.listAgreements(deal.id).catch(() => ({ pending: 0 }));
  deal.staffOrderNotes = !user.accountRole && api.listOrderNotes ? await ctx.api.listOrderNotes(deal.id).catch(() => []) : [];   // John, Nov 4: staff-only order notes (Title module sticky notes; never clients / agents)
  const salesStaff = runsOrders(user) ? await ctx.api.listSalesStaff().catch(() => []) : [];   // add-salesperson picker (Processor / Admins)
  // Francis, Nov 3 (Qualia Connect agent portal): outstanding-task alert, 4-step progress, Order Details, Parties, Activity, Conversations,
  // Request Update / Share Access (agents) and, for staff, the update requests to answer + shared access + the portal invite email
  const ov = await ctx.api.getOrderOverview(deal.id); const ur = await ctx.api.listUpdateRequests(deal.id); const inv = await ctx.api.listSharedAccess(deal.id);
  // John, Nov 4: a party who will not be in the property's state at closing is flagged to CLA staff on the order page (RON / embassy / out-of-state notary)
  const locFlags = await ctx.api.closingLocationFlags(deal.id).catch(() => []);
  const flagHtml = locFlags.length ? html`<div class="notice warn" data-location-flags>${locFlags.map((f) => html`<div data-location-flag="${f.participantId}"><strong>${f.text}</strong> &middot; signing method: ${f.signingLabel} <a href="#/deals/${deal.id}/closing">scheduling</a></div>`)}</div>` : '';
  // John, Nov 4: a buyer / seller who has not said where they will be at closing (and the closing is not scheduled) gets a to-do card here
  const promptHtml = await locPromptHtml(ctx, deal);
  // ORDER PAGE REDESIGN (John, Nov 4 meeting; mockups 01-order-page / -mobile): one status bar (the Overview milestones) with the at-a-glance line under
  // it, a bigger address + order number, one Parties list (Call / Email / Copy per person), Notes, Order contacts. The Summary cards, the card-theme
  // Order Summary and the buyer / seller summary block are gone. Same page for every role; the role rules (adapter + canWire) are unchanged.
  const splits = !user.accountRole && user.role !== 'Outside user' && ctx.api.listUnderwriterSplits ? await ctx.api.listUnderwriterSplits().then((r) => (r && r.rows) || []).catch(() => []) : [];   // the state's underwriter (Underwriter row)
  const v = overview(ctx, deal, here, ag, salesStaff, ov, splits); const extra = agentPanels(ctx, deal, ov, ur, inv); const done = placedPanel(deal);
  return { ...v, noOrderHeader: true, body: html`${done.html}${promptHtml}${flagHtml}${v.head}${extra.top}${v.body}${extra.bottom}`, mount(root) { done.mount(root); v.mount(root); extra.mount(root); } };
}

// REDESIGN (John, Nov 3): the confirmation after Place Order. ordernew.js leaves a note in sessionStorage (key below) and opens the new order; the
// panel is shown once, at the top of that order's overview: file number, what was created, what was not, and the next things to do.
const PLACED_KEY = 'cla-portal-new:placed';
function placedPanel(d) {
  let p = null; try { p = JSON.parse(sessionStorage.getItem(PLACED_KEY) || 'null'); } catch (e) { p = null; }
  if (!p || p.dealId !== d.id) return { html: '', mount() {} };
  sessionStorage.removeItem(PLACED_KEY);
  const refi = isRefi(p.transactionType); const a = p.added || {};
  const LBL = { 'Client-Buyer': refi ? ['borrower', 'borrowers'] : ['buyer', 'buyers'], 'Client-Seller': ['seller', 'sellers'], 'Buyer Agent': ['buyer agent', 'buyer agents'], 'Listing Agent': ['listing agent', 'listing agents'], Lender: ['lender', 'lenders'], 'Transaction Coordinator': ['transaction coordinator', 'transaction coordinators'], 'Sales Team': ['sales team member', 'sales team members'] };
  const who = Object.keys(LBL).filter((r) => a[r]).map((r) => `${a[r]} ${LBL[r][a[r] === 1 ? 0 : 1]}`);
  const body = html`<section class="placed-confirm" data-placed-confirm role="status" aria-live="polite">
    <div class="placed-icon" aria-hidden="true">&#10003;</div>
    <div class="placed-main"><p class="eyebrow">Order placed</p><h2>Order <span data-placed-file>${p.fileNumber}</span> is open</h2>
      <p class="muted">${p.address} &middot; ${p.transactionType}</p>
      <ul class="checklist">
        <li>${who.length ? html`Added ${who.join(', ')}` : 'No people added yet (add them on the Contacts tab)'}${p.tasks ? html`; <strong>${p.tasks}</strong> intake task(s) created for them` : ''}.</li>
        <li>${p.docs ? html`${p.docs} document(s) saved to the Documents tab.` : 'No documents attached yet.'}</li>
        <li>No emails, texts or portal invites were sent.</li>
        ${(p.skipped || []).length ? html`<li class="warn-text">Not added (nobody picked from the list): ${p.skipped.join(', ').toLowerCase()}.</li>` : ''}
        ${(p.problems || []).length ? html`<li class="err-text">Not added: ${p.problems.join(' | ')}</li>` : ''}
      </ul>
      <div class="placed-actions"><a class="m-btn" href="#/deals/${d.id}/tasks">View tasks</a><a class="ghost" href="#/deals/${d.id}/contacts">Contacts &amp; invites</a><a class="ghost" href="#/deals/${d.id}/documents">Documents</a><a class="ghost" href="#/orders/new">Place another order</a><a class="ghost" href="#/orders">Open Orders</a></div></div>
    <button type="button" class="placed-x" data-placed-close aria-label="Close the confirmation">&times;</button></section>`;
  return { html: body, mount(root) { window.scrollTo(0, 0); const x = $('[data-placed-close]', root); if (x) x.addEventListener('click', () => { const s = $('[data-placed-confirm]', root); if (s) s.remove(); }); } };
}

// opposing side (outside viewers): the adapter sends no phone/email; say where to go instead
export const HIDDEN_CONTACT = 'Contact through CLA Title';
// Matt, Nov 3 (b): a buyer / seller who is an entity shows the entity and its Entity Representative (rep phone / email follow the same opposing-side rule)
export const entityLine = (e) => (e ? html`<div class="entity-line small" data-entity="${e.name}">Entity: <strong>${e.name}</strong>${e.type ? ` (${e.type})` : ''}${e.repName || e.repTitle || e.repPhone || e.repEmail ? html`<br>Entity Representative: ${[e.repName, e.repTitle].filter(Boolean).join(', ') || '\u2014'}${e.repPhone || e.repEmail ? html`<br><span class="muted">${[fmtPhone(e.repPhone), e.repEmail].filter(Boolean).join(' \u00b7 ')}</span>` : ''}` : ''}</div>` : '');
const person = (p) => (p ? html`<div class="person" data-person="${p.contactId}">${entityLine(p.entity)}<strong>${p.contact.firstName} ${p.contact.lastName}${p.removed ? ' (removed)' : ''}</strong>${p.contact.contactHidden ? html`<br><span class="muted contact-hidden">${HIDDEN_CONTACT}</span>` : html`<br><span class="muted">${p.contact.email}</span><br><span class="muted">${fmtPhone(p.contact.phone)}</span>`}${p.contact.company ? html`<br><span class="muted">${p.contact.company}</span>` : ''}</div>` : html`<div class="muted">Not specified</div>`);

function overview({ api, user, refresh }, d, crumbs, ag, salesStaff = [], ov = null, splits = []) {
  const staffView = !user.accountRole && user.role !== 'Outside user';
  const canWire = staffView || (user.roles || [user.role]).includes('Client-Buyer');   // Matt, Oct 31: buyer only (plus CLA staff)
  const sc = d.scheduledClosing;
  const by = (role) => d.participants.find((p) => p.role === role); const all = (role) => d.participants.filter((p) => p.role === role); const edit = runsOrders(user);
  // REFINANCE (John, Nov 3): no purchase price, EMD, sellers or realtors; the borrower(s) are the Client-Buyer rows. An older refinance that still has a
  // seller / agent / price keeps showing it (nothing is hidden that is on the file), but nothing new can be added.
  const refi = isRefi(d); const B = refi ? 'Borrower' : 'Buyer';
  const showSellers = !refi || all('Client-Seller').length; const showAgents = (r) => !refi || all(r).length; const showPrice = !refi || d.purchasePrice != null; const showEmd = !refi || d.emdAmount != null || d.emdDueDate;
  const tracker = STAGES.map((s, i) => html`<li class="${i < d.stage ? 'done' : i === d.stage ? 'current' : ''}"><button type="button" class="step" ${edit ? '' : raw('disabled')} data-stage="${i}" title="${edit ? 'Set stage' : s}"></button><span>${s}</span></li>`);
  const stage = Math.max(0, Math.min(STAGES.length - 1, Number(d.stage) || 0)); const today = localDate();
  const toGo = d.closingDate ? Math.round((Date.parse(d.closingDate + 'T12:00:00') - Date.parse(today + 'T12:00:00')) / 864e5) : null;
  const openN = ov ? (staffView ? ov.counts.tasks : ov.outstanding) : d.openTasks;
  const glance = html`<div class="op-glance" data-glance><span class="muted">At a glance:</span>
    ${showPrice ? html`<span data-purchase-price>Purchase <b>${fmtMoney(d.purchasePrice) || '\u2014'}</b></span>` : ''}<span data-loan-amount>Loan <b>${fmtMoney(d.loanAmount) || '\u2014'}</b></span>
    ${showEmd ? html`<span data-emd-amount>EMD <b>${d.emdAmount == null || d.emdAmount === '' ? '\u2014' : fmtMoney(d.emdAmount)}</b></span><span data-emd-due>EMD due <b>${fmtDate(d.emdDueDate) || '\u2014'}</b></span>` : ''}
    <span data-settlement>Settlement <b>${fmtDate(d.closingDate) || 'not set'}</b>${toGo != null && toGo >= 0 ? ` (${toGo === 0 ? 'today' : `${toGo} day${toGo === 1 ? '' : 's'}`})` : ''}</span>
    ${openN != null ? html`<span data-open-tasks><a href="#/deals/${d.id}/tasks"><b>${openN}</b> ${staffView ? 'open task' : 'task'}${openN === 1 ? '' : 's'}${staffView ? '' : ' for you'}</a></span>` : ''}
    ${edit && !refi ? html`<span data-occ-primary>Primary residence <b>${yesNo(d.primaryResidence)}</b></span><span data-occ-fthb>First-time buyer <b>${yesNo(d.firstTimeBuyer)}</b></span>` : ''}
    ${edit ? html`<button class="icon-edit" id="editdeal" title="Edit order details" aria-label="Edit order details">&#9998;</button>` : ''}</div>`;
  const head = html`<section class="op-status" data-status-bar aria-label="Order status">
      <div class="op-status-top"><span class="op-status-label">ORDER STATUS &middot; <b data-status-step>Step ${stage + 1} of ${STAGES.length} &mdash; ${STAGES[stage]}</b>${ov && !staffView ? html` &middot; <span class="muted">your closing progress: <strong data-progress-step>${ov.progress.phaseName}</strong></span>` : ''}</span>
        <span class="op-status-right">${edit ? html`<select id="statussel" aria-label="Order status">${options(DEAL_STATUSES, d.status)}</select>` : pill(d.status, d.status === 'Open' ? 'ok' : '')}</span></div>
      <ol class="tracker op-steps" data-milestones>${tracker}</ol>${edit ? html`<p class="muted small op-hint">Click a step to set the stage. The last step closes the order.</p>` : ''}
      ${glance}</section>
    <div class="op-title deal-head"><h1 class="op-address" data-op-address>${d.street}, ${d.city}, ${d.state} ${d.zip}</h1><span class="op-order-no order-no" data-op-order-no>Order # ${d.fileNumber}</span>${d.fileTitle ? html` <span class="file-title" data-file-title>${d.fileTitle}</span>` : ''}${d.agentParties && d.agentParties.length ? html` <span class="pill warn agent-party">Agent is a party</span>` : ''}</div>
    <p class="op-sub muted" data-op-sub>${d.transactionType || 'Purchase'}${d.county ? html` &middot; <span data-county-head>${d.county} County</span>` : ''}<span data-county hidden>${d.county || '\u2014'}</span> &middot; Opened ${fmtDate(d.openDate)} &middot; Processor ${d.processorName || 'not set'}${d.preprocessorName ? html` &middot; Preprocessor ${d.preprocessorName}` : ''}${staffView ? html` &middot; <span data-source-of-business>Source of business: ${d.sourceOfBusinessLabel || 'Not set'}</span>` : ''}${ov && ov.orderDetails.agencyLicenseId ? html` &middot; Agency License ID <span data-license>${ov.orderDetails.agencyLicenseId}</span>` : ''}</p>
    ${moneyRow(d, { canWire, staffView, showEmd })}
    ${d.unread ? html`<div class="op-actions"><a class="new-msg" href="#/deals/${d.id}/inbox">${d.unread} new message(s)</a></div>` : ''}
    ${d.agentParties && d.agentParties.length ? html`<div class="notice warn" data-agent-party><strong>Agent is a party.</strong> ${d.agentParties.map((p) => `${p.name} is the ${p.label}`).join('; ')} on this file (a licensee buying or selling for themselves). Make sure the licensee disclosure is on file.</div>` : ''}
    ${d.selfRep ? html`<div class="notice info" data-self-rep>You are the <strong>${d.myRoleLabel}</strong> on this file. Your tasks as the client and as the agent are in one list; the history records which capacity you acted in.</div>` : ''}
    ${sc ? html`<div class="notice info" data-scheduled-closing><strong>Closing scheduled:</strong> ${slotText(sc.at)} &middot; ${placeText(sc.location, sc.officeId, sc.officeName)}${sc.note ? html` &middot; ${sc.note}` : ''} <a href="#/deals/${d.id}/closing">details</a></div>` : ''}
    ${ag && ag.pending ? html`<div class="notice warn" data-agreements-pending>You have <strong>${ag.pending}</strong> agreement(s) to read and acknowledge (including the Wire Fraud Warning). <a href="#/deals/${d.id}/agreements">Open Agreements</a></div>` : ''}
    ${refi ? html`<p class="notice info" data-refi-note><strong>Refinance.</strong> No purchase price, EMD, sellers or realtors on this order: the people are the borrower(s), salespeople, the Processor and the Lender.</p>` : ''}`;
  const lenderLine = d.lenderName || d.lenderContact || d.lenderEmail || d.lenderPhone ? html`<b>${d.lenderName || d.lenderContact}</b>${d.lenderName && d.lenderContact ? html` &middot; ${d.lenderContact}` : ''}${d.lenderEmail || d.lenderPhone ? html`<br><span class="muted small">${[d.lenderEmail, fmtPhone(d.lenderPhone)].filter(Boolean).join(' \u00b7 ')}</span>` : ''}`
    : by('Lender') ? html`<b>${by('Lender').contact.firstName} ${by('Lender').contact.lastName}</b>${by('Lender').contact.company ? html`<br><span class="muted small">${by('Lender').contact.company}</span>` : ''}` : Number(d.loanAmount) ? html`<b>Not yet entered</b>` : html`<b>None (cash)</b>`;
  const body = html`
    <div class="box-title"><h2><span class="h-ico"></span>Parties</h2><a class="ghost right" href="#/deals/${d.id}/contacts">All contacts</a></div>
    ${partiesList(d, ov, staffView, { splits, edit })}
    ${staffView ? html`<div class="op-party-tools" data-party-tools>${edit ? html`<button type="button" class="ghost" data-add-party="Client-Buyer">+ Add ${B.toLowerCase()}</button>${!refi ? html` <button type="button" class="ghost" data-add-party="Client-Seller">+ Add seller</button>` : ''}` : ''}
      <span class="op-sales">Salespeople: ${(d.salesPeople || []).length ? (d.salesPeople || []).map((s, i) => html`${i ? ', ' : ''}<span class="nowrap" data-sales-person="${s.id}">${s.name}${edit ? html` <button class="ghost" data-rm-sales="${s.id}" title="Remove from this order" aria-label="Remove ${s.name}">&times;</button>` : ''}</span>`) : 'Not specified'}
      ${edit && salesStaff.filter((s) => !(d.salesPersonIds || []).includes(s.id)).length ? html` <select id="addsales" aria-label="Add a salesperson"><option value="">+ Add salesperson&hellip;</option>${options(salesStaff.filter((s) => !(d.salesPersonIds || []).includes(s.id)), '', (s) => `${s.firstName} ${s.lastName} (${s.role})`, (s) => s.id)}</select>` : ''}</span></div>` : ''}
    <div class="box-title"><h2><span class="h-ico"></span>Notes</h2></div>
    <div class="op-notes" data-notes>${d.notes ? html`<div class="op-note">${d.notes}</div>` : html`<p class="muted">No notes on this order.</p>`}${(d.staffOrderNotes || []).length ? html`<ul class="tt-notes" data-order-notes>${d.staffOrderNotes.slice(0, 5).map((n) => html`<li data-onote="${n.category}"><span class="pill">${n.category}</span> ${n.body.length > 220 ? n.body.slice(0, 220) + '…' : n.body} <span class="muted small">${n.byName}${n.issueResolved ? ' · resolved' : ''}</span></li>`)}</ul>${modOn('title') ? html`<a class="small" href="#/deals/${d.id}/title?v=notes" data-title-notes>All order notes (Title)</a>` : ''}` : ''}${edit ? html`<button type="button" class="ghost" data-edit-notes>${d.notes ? 'Edit note' : '+ Add note'}</button>` : ''}</div>
    ${edit ? automationSection(d, refi) : ''}
    <div class="box-title"><h2><span class="h-ico"></span>Order Contacts</h2><a class="ghost right" href="#/deals/${d.id}/contacts">All contacts</a></div>
    <div class="card op-contacts-card" data-order-contacts><div><div class="muted small">Lender</div><div data-lender>${lenderLine}</div></div>
      <div><div class="muted small">HOA</div><div>${by('HOA') ? html`<b>${by('HOA').contact.firstName} ${by('HOA').contact.lastName}</b>` : html`<b>&mdash;</b>`}</div></div>
      <div><div class="muted small">Closing location</div><div><b>${sc && sc.location ? sc.location : 'CLA Title office (to be confirmed)'}</b></div></div></div>
    <table class="tbl striped op-contacts-tbl" data-all-order-contacts hidden><thead><tr><th>Name</th><th>Role</th><th>Phone</th><th>Email</th></tr></thead><tbody>${d.participants.map((p) => html`<tr><td>${p.contact.firstName} ${p.contact.lastName}${p.removed ? html` ${pill('removed', 'bad')}` : ''}</td><td>${p.role}</td>${p.contact.contactHidden ? html`<td colspan="2" class="muted contact-hidden">${HIDDEN_CONTACT}</td>` : html`<td>${fmtPhone(p.contact.phone)} <button type="button" class="op-act" data-copy-field="${fmtPhone(p.contact.phone)}" aria-label="Copy phone">Copy</button></td><td>${p.contact.email} <button type="button" class="op-act" data-copy-field="${p.contact.email}" aria-label="Copy email">Copy</button></td>`}</tr>`)}</tbody></table>`;
  return { title: d.fileNumber, crumbs: [...crumbs, ['Order Details']], head, body, mount(root) {
    $$('.step', root).forEach((b) => b.addEventListener('click', guard(async () => { await api.setStage(d.id, b.dataset.stage); toast('Stage updated'); refresh(); })));
    const ss = $('#statussel', root); if (ss) ss.addEventListener('change', guard(async () => { await api.setDealStatus(d.id, ss.value); toast('Status updated'); refresh(); }));
    const eb = $('#editdeal', root); if (eb) eb.addEventListener('click', guard(() => editModal(api, d, refresh)));
    const as = $('#addsales', root); if (as) as.addEventListener('change', guard(async () => { if (!as.value) return; await api.addDealSalesPerson(d.id, as.value); toast('Salesperson added'); refresh(); }));
    $$('[data-rm-sales]', root).forEach((b) => b.addEventListener('click', guard(async () => { await api.removeDealSalesPerson(d.id, b.dataset.rmSales); toast('Salesperson removed'); refresh(); })));
    const ab = $('[data-email-sellers-agents]', root); if (ab) ab.addEventListener('click', guard(() => automationModal(api, d)));
    const wb = $('#wirebtn', root); if (wb) wb.addEventListener('click', guard(() => wireModal(api, d)));
    $$('[data-add-party]', root).forEach((b) => b.addEventListener('click', guard(() => addPartyModal(api, d, b.dataset.addParty, refresh))));
    const en = $('[data-edit-notes]', root); if (en) en.addEventListener('click', guard(() => editModal(api, d, refresh)));
    mountParties(root);
  } };
}

// WIRE INSTRUCTIONS (Matt, Oct 31): buyer only. FAKE sample + the fraud warning first.
async function wireModal(api, d) {
  const w = await api.getWireInstructions(d.id);
  modal('Wire instructions', html`<div class="notice warn" data-wire-warning><strong>STOP - wire fraud warning.</strong> ${w.warning}</div>
    ${w.sample ? html`<p class="pill warn" data-wire-sample>TEST &middot; SAMPLE ONLY - FAKE INSTRUCTIONS FOR THIS DEMO. DO NOT SEND MONEY.</p>` : ''}
    <table class="tbl" id="wire-table"><tbody><tr><th>Bank</th><td>${w.bankName}<br><span class="muted small">${w.bankAddress}</span></td></tr><tr><th>Routing number</th><td>${w.routing}</td></tr>
      <tr><th>Account number</th><td>${w.account}</td></tr><tr><th>Account name</th><td>${w.accountName}</td></tr><tr><th>Reference</th><td>${w.reference}</td></tr></tbody></table>
    <p class="muted small">${w.amountNote}</p><p><strong>Questions? Call CLA Title at ${w.claPhone}</strong> (use the number you already have, not one from an email).</p>
    <div><button type="button" class="ghost" data-close>Close</button></div>`, { wide: true });
}

async function editModal(api, d, refresh) {
  const v = (k) => d[k] == null ? '' : d[k]; const refi = isRefi(d);
  // Matt, Nov 3 (b): source of business (CRM Settings Lead Source list; a retired / renamed value already on the order stays selectable) + money with commas
  const preprocs = await api.listPreprocessors();
  const src = api.listSourceOptions ? await api.listSourceOptions().catch(() => []) : []; const srcOpts = [...src];
  if (d.sourceOfBusiness && !srcOpts.some((o) => o.value === d.sourceOfBusiness)) srcOpts.push({ value: d.sourceOfBusiness, label: d.sourceOfBusinessLabel || d.sourceOfBusiness });
  const m = modal('Edit order details', html`<form id="edf" class="form-grid">
    <label class="span2">Street<input name="street" required value="${v('street')}"></label><label>City<input name="city" required value="${v('city')}"></label>
    <label>State<select name="state" required><option value="">Select state</option>${US_STATE_NAMES.map(([c, n]) => html`<option value="${c}" ${c === d.state ? raw('selected') : ''}>${n} (${c})</option>`)}${d.state && !US_STATES.includes(d.state) ? html`<option value="${d.state}" selected>${d.state}</option>` : ''}</select></label><label>ZIP<input name="zip" value="${v('zip')}"></label><label>County<input name="county" maxlength="100" value="${v('county')}" aria-label="County"></label>
    <label>Open date<input type="date" name="openDate" required value="${v('openDate')}" max="${localDate()}"></label>    <label>Closing date<input type="date" name="closingDate" value="${v('closingDate')}"></label>
    ${refi ? html`<p class="span2 muted small" data-refi-edit>Refinance: no purchase price or EMD.${d.purchasePrice != null || d.emdAmount != null || d.emdDueDate ? ' This older order still has one; saving clears it.' : ''}</p><label>Loan amount<input name="loanAmount" inputmode="decimal" data-money autocomplete="off" value="${moneyShow(d.loanAmount)}"></label>`
      : html`<label>Purchase price<input name="purchasePrice" inputmode="decimal" data-money autocomplete="off" value="${moneyShow(d.purchasePrice)}"></label><label>Loan amount<input name="loanAmount" inputmode="decimal" data-money autocomplete="off" value="${moneyShow(d.loanAmount)}"></label>
    <label>EMD amount<input name="emdAmount" inputmode="decimal" data-money autocomplete="off" value="${moneyShow(d.emdAmount)}"></label><label>EMD due date<input type="date" name="emdDueDate" value="${v('emdDueDate')}"></label>`}
    ${refi ? '' : occSelects(d)}
    <h4 class="span2">CLA Title team</h4><label class="span2">Preprocessor<select name="preprocessorUserId"><option value="">(none)</option>${options(preprocs, d.preprocessorUserId || '', (p) => `${p.firstName} ${p.lastName}`, (p) => p.id)}</select></label>
    <h4 class="span2">Lender</h4><label>Company<input name="lenderName" value="${v('lenderName')}"></label><label>Contact<input name="lenderContact" value="${v('lenderContact')}"></label>
    <label>Email<input name="lenderEmail" value="${v('lenderEmail')}"></label><label>Phone<input name="lenderPhone" type="tel" inputmode="tel" placeholder="xxx-xxx-xxxx" data-phone value="${v('lenderPhone')}"></label>
    <label class="span2">Source of business<select name="sourceOfBusiness" aria-label="Source of business"><option value="">(not set)</option>${options(srcOpts, d.sourceOfBusiness || '', (o) => o.label, (o) => o.value)}</select></label>
    <label class="span2">Notes<textarea name="notes" rows="3">${v('notes')}</textarea></label>
    <div class="span2"><button class="m-btn" type="submit">Save</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`, { wide: true });
  $('#edf', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); const f = formData(e.target); ['purchasePrice', 'loanAmount', 'emdAmount'].forEach((k) => { if (f[k] !== undefined) f[k] = moneyClean(f[k]); });
    if (refi) { f.purchasePrice = ''; f.emdAmount = ''; f.emdDueDate = ''; }   // a refinance saves no purchase price / EMD (clears what an older order had)
    await api.updateDeal(d.id, f); closeModal(); toast('Order saved'); refresh(); }));
}

// John, Nov 2: add another buyer / seller to an existing order (Edit order flow). Same type-to-search picker; a new person is added on the Contacts tab.
async function addPartyModal(api, d, role, refresh) {
  const label = role === 'Client-Buyer' ? (isRefi(d) ? 'borrower' : 'buyer') : 'seller'; const all = await api.listContacts(); const on = new Set(d.participants.filter((p) => p.role === role).map((p) => p.contactId));
  const m = modal(`Add a ${label}`, html`<form id="apty" class="form-grid">${pickerHtml('contactId', `Another ${label}`)}
    <p class="muted small span2">They get their own copy of the ${label}'s intake tasks. Someone new? Use <a href="#/deals/${d.id}/contacts">Contacts &rarr; Add contact</a>. To take someone off the order use Contacts &rarr; Remove from order (their documents are kept).</p>
    <div class="span2"><button class="m-btn" type="submit">Add ${label}</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`);
  const pk = mountPicker($('[data-picker=contactId]', m), () => all.filter((c) => !on.has(c.id)));
  $('#apty', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); if (!pk.value) throw new Error('Pick a person from the list.');
    await api.addParticipant(d.id, pk.value, role); closeModal(); toast(`${label[0].toUpperCase() + label.slice(1)} added`); refresh(); }));
}

// ---------------- ORDER PAGE REDESIGN (John, Nov 4): a SMALL EMD box + the Wire instructions box ----------------
// EMD: one compact box (amount, due date, received or not; received = past the EMD Receipt step). Wire instructions: ONLY where the existing wire
// rule allows it (canWire = CLA staff + the buyer, never an agent); it holds the button and the sample Cash to Close / wire status (payoffs: staff only).
function moneyRow(d, { canWire, staffView, showEmd }) {
  const emdIn = Number(d.stage) >= 2 || d.status === 'Closed'; const s = canWire ? sampleFacts(d) : null;
  const emd = showEmd ? html`<section class="op-emd" data-emd-box aria-label="Earnest money deposit"><span class="op-box-label">EMD</span>
      <b data-emd-box-amount>${d.emdAmount == null || d.emdAmount === '' ? '\u2014' : fmtMoney(d.emdAmount)}</b>
      <span class="muted small" data-emd-box-due>due ${fmtDate(d.emdDueDate) || '\u2014'}</span>${pill(emdIn ? 'received' : 'not received yet', emdIn ? 'ok' : 'warn')}</section>` : '';
  const wire = canWire ? html`<section class="op-wire" data-wire-box aria-label="Wire instructions"><div class="op-wire-head"><span class="op-box-label">Wire instructions</span><button class="m-btn" id="wirebtn">Wire instructions</button></div>
      <div class="op-wire-facts"><span data-wire-cash>Cash to Close <b>${fmtMoney(s.cash)}</b> ${SAMPLE}</span><span data-wire-status>Wire status <b>${s.wire}</b> ${SAMPLE}</span>${staffView ? html`<span data-wire-payoffs>Payoffs <b>${s.payoffs}</b> ${SAMPLE}</span>` : ''}</div>
      <p class="muted small">Buyer funds only. Agents never see this box. Call CLA Title to confirm any wire (use a number you already have).</p></section>` : '';
  return emd || wire ? html`<div class="op-money" data-money-row>${emd}${wire}</div>` : '';
}

// ---------------- ORDER PAGE REDESIGN (John, Nov 4): ONE Parties list ----------------
// Rows come from getOrderOverview().parties: the adapter already applies every role rule (opposing side's contact hidden for outside users,
// the CLA Title sales rep only on agent Parties, no wire / cash-to-close / payoff data at all). CLA staff also see the other people on the file
// (lender, TC, sales team, HOA, ...). Per person: Call (tel:), Email (mailto: opens the viewer's own mail app; the portal sends nothing), Copy.
const telOf = (ph) => String(ph || '').replace(/[^0-9+]/g, '');
const OVERVIEW_ROLES = ['Client-Buyer', 'Client-Seller', 'Buyer Agent', 'Listing Agent', 'Processor', 'Preprocessor'];
// John, Nov 4 meeting: CLA staff also get the ABSTRACTOR and the UNDERWRITER in the same list. Someone added on Contacts with that role shows
// with their details; otherwise the row still shows (Underwriter = the state's underwriter from Underwriter Splits, Abstractor = not assigned yet).
export const STAFF_EXTRA_ROLES = ['Abstractor', 'Underwriter'];
export function partyRows(d, ov, staffView, splits = []) {
  const rows = ov ? ov.parties.map((p) => ({ ...p })) : [];
  if (staffView) d.participants.filter((p) => !p.removed && p.contact && !OVERVIEW_ROLES.includes(p.role) && !(p.role === 'Lender' && rows.some((r) => r.label === 'Lender')))
    .forEach((p) => rows.push({ label: p.role, name: `${p.contact.firstName} ${p.contact.lastName}`.trim(), company: p.contact.company || '', email: p.contact.email || '', phone: p.contact.phone || '', contactHidden: !!p.contact.contactHidden, entity: p.entity || null, profileId: p.contact.profileId || null, canMessage: false }));
  if (staffView) for (const role of STAFF_EXTRA_ROLES) if (!rows.some((r) => r.label === role)) {
    const sp = role === 'Underwriter' ? (splits || []).find((x) => x.state === String(d.state || '').toUpperCase() && x.underwriter) : null;
    rows.push(sp ? { label: role, name: sp.underwriter, company: `${sp.state} underwriter (Underwriter Splits)`, email: '', phone: '', placeholder: true, fromSplits: true }
      : { label: role, name: 'Not specified', company: role === 'Abstractor' ? 'No abstractor on this order yet' : 'No underwriter on this order yet', email: '', phone: '', placeholder: true }); }
  return rows;
}
function partiesList(d, ov, staffView, { splits = [], edit = false } = {}) {
  const rows = partyRows(d, ov, staffView, splits);
  const avatar = (p) => (p.salesRep && p.profileId ? (p.photo ? html`<img class="party-avatar" src="${p.photo}" alt="" data-sales-photo>` : html`<span class="party-avatar" aria-hidden="true" data-sales-initials>${p.initials}</span>`) : '');
  const row = (p, i) => { const real = p.name && p.name !== 'Not specified'; const hid = p.contactHidden; const tel = hid ? '' : telOf(p.phone); const em = hid ? '' : p.email || '';
    const copy = [p.name, p.label + (p.company ? `, ${p.company}` : ''), hid ? HIDDEN_CONTACT : '', tel ? fmtPhone(p.phone) : '', em].filter(Boolean).join('\n');
    return html`<div class="op-prow${p.salesRep ? ' sales-rep-party' : ''}${p.placeholder ? ' is-placeholder' : ''}" data-party="${p.label}"${p.placeholder ? html` data-party-placeholder` : ''}${p.salesRep ? html` data-sales-rep="${p.profileId || ''}"` : ''} data-party-row="${i}">
      <span class="op-role">${p.label}</span><span class="op-nm">${avatar(p)}${entityLine(p.entity)}<strong>${p.name}</strong>${p.company ? html`<small>${p.company}</small>` : ''}</span>
      ${hid ? html`<span class="op-ph op-hidden muted small contact-hidden" data-contact-hidden>${HIDDEN_CONTACT}</span><span class="op-em"></span>` : html`<span class="op-ph">${tel ? html`${fmtPhone(p.phone)} <button type="button" class="op-act" data-copy-field="${fmtPhone(p.phone)}" aria-label="Copy ${p.name}'s phone">Copy</button>` : html`<span class="muted">&mdash;</span>`}</span><span class="op-em">${em ? html`${em} <button type="button" class="op-act" data-copy-field="${em}" aria-label="Copy ${p.name}'s email">Copy</button>` : html`<span class="muted">&mdash;</span>`}</span>`}
      <span class="op-acts">${tel ? html`<a class="op-act" href="tel:${tel}" data-call aria-label="Call ${p.name}">&#9742; Call</a>` : html`<span class="op-act is-off" aria-disabled="true">&#9742; Call</span>`}
        ${em ? html`<a class="op-act" href="mailto:${em}" data-email aria-label="Email ${p.name} (opens your mail app)">&#9993; Email</a>` : html`<span class="op-act is-off" aria-disabled="true">&#9993; Email</span>`}
        ${real ? html`<button type="button" class="op-act" data-copy="${copy}" aria-label="Copy ${p.name}'s contact details">&#10697; Copy</button>` : ''}
        ${p.canMessage ? html`<button type="button" class="op-act" data-message-to="${p.profileId}">Message</button>` : ''}
        ${p.placeholder && edit ? html`<a class="op-act" href="#/deals/${d.id}/contacts" data-add-role="${p.label}" aria-label="Add ${p.label.toLowerCase()} on Contacts">+ Add</a>` : ''}</span></div>`; };
  return html`<div class="op-plist" data-parties data-party-list-all>${rows.length ? rows.map(row) : html`<p class="muted">Nobody on this order yet.</p>`}</div>
    <p class="muted small op-pnote">Call and Email open your phone or mail app. The portal does not send anything.</p>`;
}
function mountParties(root) {
  $$('[data-copy], [data-copy-field]', root).forEach((b) => b.addEventListener('click', guard(async () => { const t = b.dataset.copyField || b.dataset.copy;
    try { await navigator.clipboard.writeText(t); } catch (e) { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } finally { ta.remove(); } }
    toast('Copied'); })));
}

// ---------------- Francis, Nov 3: the Qualia-style overview panels ----------------
function agentPanels(ctx, d, ov, ur, inv) {
  const { api, user, refresh, go } = ctx; const staffView = !user.accountRole && user.role !== 'Outside user';
  const urRow = (r) => html`<tr data-ur="${r.id}" data-ur-status="${r.status}"><td>${fmtDate(r.createdAt)}</td><td><strong>${r.topic}</strong>${r.note ? html`<br><span class="muted small">${r.note}</span>` : ''}${staffView ? html`<br><span class="muted small">from ${r.requestedByName} (${r.requestedRole})</span>` : ''}</td>
    <td>${r.status === 'answered' ? html`${pill('answered', 'ok')}<br>${r.response}<br><span class="muted small">${r.respondedByName}, ${fmtDate(r.respondedAt)}</span>` : ov.canAnswerUpdates ? html`<form class="inline-form" data-answer="${r.id}"><textarea name="response" rows="2" maxlength="2000" placeholder="Write the update" aria-label="Update for ${r.topic}"></textarea> <button class="m-btn" type="submit">Send update</button></form>` : pill('waiting for CLA Title', 'warn')}</td></tr>`;
  const top = html`<div class="agent-overview" data-agent-overview>
    ${ov.outstanding ? html`<div class="notice warn" data-outstanding>You have <strong>${ov.outstanding}</strong> outstanding task${ov.outstanding === 1 ? '' : 's'}. <a class="m-btn" href="#/deals/${d.id}/tasks" data-view-tasks>View Tasks</a></div>` : html`<div class="notice info" data-outstanding="0">No outstanding tasks for you on this order.</div>`}
    ${ov.canShareAccess ? html`<p><button class="m-btn" id="shareaccess">Share Access</button></p>` : ''}
    ${ov.canRequestUpdate ? html`<form id="requpdate" class="filter-bar" data-request-update><label>Request Update<select name="topic" required><option value="">Choose&hellip;</option>${options(ov.updateTopics, '')}</select></label>
      <label>Note (optional)<input name="note" maxlength="1000"></label><button class="m-btn" type="submit">Submit Request</button></form>` : ''}</div>`;
  const bottom = html`<div class="agent-overview-more">
    <div class="ap-grid sum-grid-ap"><fieldset class="sum-card" data-activity-panel><legend>Activity</legend>${ov.recentActivity.length ? html`<ul class="plain">${ov.recentActivity.map((a) => html`<li><span class="muted small">${fmtDate(a.createdAt)}</span> ${a.actorName}: ${a.detail}</li>`)}</ul>` : html`<p class="muted">Nothing yet.</p>`}<a href="#/deals/${d.id}/activity">All activity</a></fieldset>
      <fieldset class="sum-card" data-conversations-panel><legend>Conversations</legend>${ov.conversations.length ? html`<ul class="plain">${ov.conversations.map((t) => html`<li><a href="#/deals/${d.id}/inbox/${t.id}">${t.subject}</a>${t.unread ? html` ${pill(t.unread + ' new', 'info')}` : ''}<br><span class="muted small">${t.lastFrom} &middot; ${fmtDate(t.lastAt)}</span></li>`)}</ul>` : html`<p class="muted">No conversations yet.</p>`}<a href="#/deals/${d.id}/inbox">Inbox</a></fieldset></div>
    ${ur.length || ov.canAnswerUpdates ? html`<div class="box-title"><h2><span class="h-ico"></span>${staffView ? 'Update requests from agents and clients' : 'Your update requests'}</h2></div>
      ${ur.length ? html`<table class="tbl striped" id="update-requests"><thead><tr><th>Asked</th><th>Request</th><th>Answer</th></tr></thead><tbody>${ur.map(urRow)}</tbody></table>` : html`<p class="muted">No update requests on this order.</p>`}` : ''}
    ${inv.length ? html`<div class="box-title"><h2><span class="h-ico"></span>Shared access</h2></div><table class="tbl striped" id="shared-access"><thead><tr><th>Name</th><th>Email</th><th>Access</th><th>Shared by</th><th>Status</th></tr></thead><tbody>${inv.map((i) => html`<tr><td>${i.firstName} ${i.lastName}</td><td>${i.email}</td><td>${i.permission}</td><td>${i.invitedByName}<br><span class="muted small">${fmtDate(i.createdAt)}</span></td><td>${pill('recorded - no email sent', 'warn')}</td></tr>`)}</tbody></table>` : ''}
    ${ov.canAnswerUpdates ? html`<p><button class="ghost" id="invitepreview">Portal invite email ("Complete Requests Now")&hellip;</button></p>` : ''}</div>`;
  function mount(root) {
    const rq = $('#requpdate', root); if (rq) rq.addEventListener('submit', guard(async (e) => { e.preventDefault(); const f = formData(e.target); if (!f.topic) throw new Error('Pick what you want an update on.');
      await api.requestUpdate(d.id, f); toast('Update requested. CLA Title will answer here.'); refresh(); }));
    $$('[data-answer]', root).forEach((f) => f.addEventListener('submit', guard(async (e) => { e.preventDefault(); await api.respondUpdateRequest(f.dataset.answer, formData(f)); toast('Update sent'); refresh(); })));
    $$('[data-message-to]', root).forEach((b) => b.addEventListener('click', guard(() => composeModal({ api, deal: d, go, user }, { title: 'New Conversation', to: b.dataset.messageTo, withFiles: true }))));
    const sa = $('#shareaccess', root); if (sa) sa.addEventListener('click', () => shareModal(ctx, d, ov));
    const ip = $('#invitepreview', root); if (ip) ip.addEventListener('click', guard(async () => {
      const outside = d.participants.filter((p) => p.contact && p.contact.profileId && ['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'].includes(p.role));
      const m = modal('Portal invite email', html`<form id="ipf" class="form-grid"><label class="span2">Invite<select name="pid">${outside.map((p) => html`<option value="${p.contact.profileId}">${p.contact.firstName} ${p.contact.lastName} (${p.role})</option>`)}</select></label>
        <div class="span2" id="ip-preview"></div><div class="span2"><button class="m-btn" type="submit">Queue in the outbox (not sent)</button> <button type="button" class="ghost" data-close>Close</button></div></form>`, { wide: true });
      const show = async () => { const e = await api.getPortalWelcomeEmail(d.id, $('[name=pid]', m).value);
        $('#ip-preview', m).innerHTML = toText(html`<div class="card" data-invite-preview><p><strong>To:</strong> ${e.toName} &lt;${e.to}&gt;<br><strong>Subject:</strong> ${e.subject}</p><p>${e.body}</p><p><a class="m-btn" href="${e.link}" data-complete-requests>${e.buttonLabel}</a></p><p class="muted small">The button opens ${e.link} (sign-in first if needed, then straight to this order's tasks).</p></div>`); };
      $('[name=pid]', m).addEventListener('change', guard(show)); await show();
      $('#ipf', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); await api.queuePortalWelcomeEmail(d.id, $('[name=pid]', m).value); closeModal(); toast('Invite queued in the outbox (not sent)'); })); }));
  }
  return { top, bottom, mount };
}

// AUTOMATION (John, Nov 3 call): on the File Overview, under the Summary, for whoever runs the order (Processor / Admins). It sits with the
// order's parties because it writes to them. "Email sellers and agents" builds a PREVIEW only: Gmail is not connected, nothing is sent.
// Agents never receive wire instructions (data/automation.js strips any wire / bank text or merge field).
function automationSection(d, refi) {
  return html`<div class="box-title"><h2><span class="h-ico"></span>Automation</h2></div>
    <div class="card automation-card" data-automation><div class="automation-row"><div><strong>Email sellers and agents</strong>
      <p class="small muted">Prepares one email per seller, listing agent and buyer's agent on this order, from a CRM email template when one fits (name or subject mentions sellers / agents), otherwise a built-in message.
      Wire instructions are never included: they go to the buyer only, and real estate agents never receive them.</p>
      <p class="small" data-gmail-off><span class="pill warn">Not sending yet</span> ${GMAIL_OFF}</p></div>
      <button type="button" class="m-btn" data-email-sellers-agents ${refi ? raw('disabled title="A refinance has no sellers or agents"') : ''}>Email sellers and agents</button></div></div>`;
}
async function automationModal(api, d) {
  const P = await api.previewSellerAgentEmails(d.id);
  modal('Email sellers and agents (preview)', html`<div class="notice warn" data-gmail-off-modal><strong>Preview only.</strong> ${P.note} Nothing has been sent.</div>
    <p class="small muted" data-wire-rule>${P.wireRule}</p>
    ${P.messages.length ? P.messages.map((m) => html`<div class="card preview-msg" data-preview-msg="${m.role}" data-preview-agent="${m.agent ? '1' : '0'}">
      <div class="small"><strong>To:</strong> ${m.name} &lt;${m.email || 'no email on file'}&gt; &middot; ${m.roleLabel}${m.noEmail ? html` <span class="pill bad">no email</span>` : ''}</div>
      <div class="small"><strong>Template:</strong> <span data-preview-template>${m.template}</span>${m.fromCrm ? html` <span class="pill info">CRM template</span>` : ''}</div>
      <div class="small"><strong>Subject:</strong> <span data-preview-subject>${m.subject}</span></div>
      <pre class="preview-body" data-preview-body>${m.body}</pre>
      ${m.notes.length ? html`<ul class="small notice info" data-preview-notes>${m.notes.map((n) => html`<li>${n}</li>`)}</ul>` : ''}</div>`)
      : html`<p class="muted" data-preview-none>No sellers or agents on this order yet.</p>`}
    <div><button type="button" class="m-btn" disabled title="${P.note}" data-send-disabled>Send (${P.messages.length})</button> <button type="button" class="ghost" data-close>Close</button>
      <span class="small muted">${P.note}</span></div>`, { wide: true });
}

// Share Access (agents on the order; recorded only, nothing is sent). Shared by the agent overview and the client overview.
// John, Nov 4: the BUYER shares access on their own file with the same form; the note says what that person could ever see (never the
// listing agent's details or anything CLA keeps staff-only) and that nothing is sent.
function shareModal({ api, refresh }, d, ov, { buyer = false, seller = false } = {}) {
  const m = modal('Share Access', html`<form id="saf" class="form-grid" novalidate>
      <label>First Name<input name="firstName" required maxlength="80"></label><label>Last Name<input name="lastName" required maxlength="80"></label>
      <label class="span2">Email<input name="email" type="email" required maxlength="200"></label>
      <label class="span2">Organization Permissions<select name="permission" required><option value="">Choose&hellip;</option>${options(ov.permissions, '')}</select></label>
      ${buyer ? html`<p class="small span2" data-buyer-share-note>They would see only what you see on this file as the buyer: never the listing agent's contact details and nothing CLA Title keeps staff-only.</p>` : ''}
      ${seller ? html`<p class="small span2" data-seller-share-note>They would see only what you see on this file as the seller: never the buyer's agent's contact details and nothing CLA Title keeps staff-only.</p>` : ''}
      <p class="muted small span2">Demo build: the share is recorded on this order and shown to CLA Title. No email is sent and no login is created.</p>
      <div class="span2"><button type="button" class="ghost" data-close>Cancel</button> <button class="m-btn" type="submit">Share</button></div></form>`);
      $('#saf', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); await api.shareAccess(d.id, formData(e.target)); closeModal(); toast('Access shared (recorded; no email sent)'); refresh(); }));
}

// John, Nov 4: a buyer / seller who has not said where they will be at closing (and the closing is not scheduled) gets a to-do card (order page + client overview)
async function locPromptHtml(ctx, deal) {
  const prompt = await ctx.api.closingLocationPrompt(deal.id).catch(() => []);
  return prompt.length ? html`<div class="notice info" data-loc-prompt><strong>To do: where will you be at closing?</strong> Please tell us whether you will be in ${(US_STATE_NAMES.find(([c]) => c === prompt[0].propertyState) || [, prompt[0].propertyState])[1]} at the time of closing, so we can plan the signing (in person, remote online notarization or embassy). <a class="m-btn" href="#/deals/${deal.id}/closing">Answer now</a></div>` : '';
}
