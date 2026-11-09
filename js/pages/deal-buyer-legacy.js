// BUYER VIEW, UNCHANGED (John, Nov 4: buyer-specific items are on feature/buyer-overview). A verbatim copy of the live28 File Overview, used ONLY for a
// Client-Buyer viewing their own order (not an agent there). The order page redesign (deal.js) is for staff / agents / sellers. Delete once buyer overview lands.
// Deal detail: File Overview + dispatcher to the other file tabs (tasks, inbox, documents, contacts, activity).
import { html, raw, toText, $, $$, guard, formData, modal, closeModal, options, fmtDate, fmtMoney, pill, toast } from '../ui.js?v=202611070139';
import { GMAIL_OFF } from '../data/automation.js?v=202611091345';
import { occSelects, yesNo } from './occ-fields.js?v=202611070139';
import { runsOrders, STAGES, DEAL_STATUSES, isProcessor, fmtPhone, localDate, US_STATE_NAMES, US_STATES, isRefi, moneyShow, moneyAmount } from '../data/constants.js?v=202611090935';
import { slotText } from './dealclosing.js?v=202611090935';
import { pickerHtml, mountPicker } from './person-picker.js?v=202611092350';
import { composeModal } from './compose.js?v=202611090935';
import { sourceChoices } from '../data/place-order.js?v=202611092320';
import { themeOn } from '../theme.js?v=202611070139';

const TABS = { tasks: './dealtasks.js?v=202611100100', inbox: './dealmsgs.js?v=202611091030', documents: './dealdocs.js?v=202611091030', contacts: './dealcontacts.js?v=202611100100', activity: './dealactivity.js?v=202611070139', closing: './dealclosing.js?v=202611090935', agreements: './dealagreements.js?v=202611070139', accounting: './dealaccounting.js?v=202611100005' };   // accounting: behind the `accounting` flag (app.js + the page refuse when off)

export async function render(ctx) {
  const { api, params } = ctx; const tab = params.tab;
  const deal = await api.getDeal(params.id);
  // per-file roles: on this order an outside user acts as their role HERE (deal.myRole), e.g. Buyer Agent here, Client-Buyer elsewhere
  const user = ctx.user.role === 'Outside user' && deal.myRole ? { ...ctx.user, role: deal.myRole, roles: deal.myRoles || [deal.myRole], selfRep: !!deal.selfRep, accountRole: ctx.user.role } : ctx.user; ctx = { ...ctx, user };
  const here = [['Orders', '#/orders'], [deal.fileNumber, `#/deals/${deal.id}`]];
  if (tab === 'accounting' && !(api.features || {}).accounting) throw new Error('That page does not exist.');   // John, Nov 3: the Accounting tab follows the module switch on CLA Portal Live Test.
  if (tab !== 'overview' && TABS[tab]) { const mod = await import(tab === 'tasks' && params.sub ? './dealtaskform.js?v=202611100100' : TABS[tab]); const v = await mod.render({ ...ctx, deal }); return { ...v, crumbs: [...here, ...(v.crumbs || [])] }; }
  if (tab !== 'overview') throw new Error('That page does not exist.');
  const ag = await ctx.api.listAgreements(deal.id).catch(() => ({ pending: 0 }));
  const salesStaff = runsOrders(user) ? await ctx.api.listSalesStaff().catch(() => []) : [];   // add-salesperson picker (Processor / Admins)
  // Francis, Nov 3 (Qualia Connect agent portal): outstanding-task alert, 4-step progress, Order Details, Parties, Activity, Conversations,
  // Request Update / Share Access (agents) and, for staff, the update requests to answer + shared access + the portal invite email
  const ov = await ctx.api.getOrderOverview(deal.id); const ur = await ctx.api.listUpdateRequests(deal.id); const inv = await ctx.api.listSharedAccess(deal.id);
  const v = overview(ctx, deal, here, ag, salesStaff); const extra = agentPanels(ctx, deal, ov, ur, inv); const done = placedPanel(deal);
  // CARD THEME MOCKUP (opt-in): the Order Summary cards go on top; the existing overview follows unchanged under "Order details"
  const cards = themeOn() ? await themedSummary(ctx, deal, ov, inv) : '';
  return { ...v, body: html`${done.html}${cards}${extra.top}${v.body}`, mount(root) { done.mount(root); v.mount(root); extra.mount(root); } };
}
async function themedSummary({ api, user }, d, ov, inv) {
  const { orderSummary } = await import('./theme-cards.js?v=202611090935');
  const staffView = !user.accountRole && user.role !== 'Outside user';
  const canWire = staffView || (user.roles || [user.role]).includes('Client-Buyer');   // SAME rule as the Wire instructions button: CLA staff + the buyer, never an agent
  const tasks = await api.listTasks(d.id).catch(() => []);
  return orderSummary({ d, user, ov, inv, tasks, canWire, staffView });
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
// John, Nov 2: several buyers / sellers. Each is listed; the Processor / Admins can add another one here (removing stays on the Contacts tab, as before).
const people = (ps) => (ps.length ? html`${ps.map((p) => person(p))}` : person(null));
const card = (title, inner) => html`<fieldset class="sum-card"><legend>${title}</legend>${inner}</fieldset>`;

function overview({ api, user, refresh }, d, crumbs, ag, salesStaff = []) {
  const staffView = !user.accountRole && user.role !== 'Outside user';
  const canWire = staffView || (user.roles || [user.role]).includes('Client-Buyer');   // Matt, Oct 31: buyer only (plus CLA staff)
  const sc = d.scheduledClosing;
  const by = (role) => d.participants.find((p) => p.role === role); const all = (role) => d.participants.filter((p) => p.role === role); const edit = runsOrders(user);
  // REFINANCE (John, Nov 3): no purchase price, EMD, sellers or realtors; the borrower(s) are the Client-Buyer rows. An older refinance that still has a
  // seller / agent / price keeps showing it (nothing is hidden that is on the file), but nothing new can be added.
  const refi = isRefi(d); const B = refi ? 'Borrower' : 'Buyer';
  const showSellers = !refi || all('Client-Seller').length; const showAgents = (r) => !refi || all(r).length; const showPrice = !refi || d.purchasePrice != null; const showEmd = !refi || d.emdAmount != null || d.emdDueDate;
  const tracker = STAGES.map((s, i) => html`<li class="${i < d.stage ? 'done' : i === d.stage ? 'current' : ''}"><button type="button" class="step" ${edit ? '' : raw('disabled')} data-stage="${i}" title="${edit ? 'Set stage' : s}"></button><span>${s}</span></li>`);
  const team = d.participants.filter((p) => ['Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator'].includes(p.role));
  // John, Nov 2: when the lender fields are empty, show the order's Lender contact (e.g. added through Place Order's Add new user)
  const lender = d.lenderName || d.lenderContact || d.lenderEmail || d.lenderPhone ? html`<div><strong>${d.lenderName}</strong><br>${d.lenderContact}<br><span class="muted">${d.lenderEmail} ${fmtPhone(d.lenderPhone)}</span></div>` : by('Lender') ? person(by('Lender')) : html`<div class="muted">Not specified</div>`;
  const body = html`
    <div class="deal-head"><img class="home-flag" src="assets/img/order-new-icon.png" alt=""><h2>${d.street} ${d.city} ${d.state} ${d.zip}${d.county ? html` <span class="muted small" data-county-head>(${d.county} County)</span>` : ''}</h2><span class="order-no">Order # ${d.fileNumber}</span>${d.fileTitle ? html` <span class="file-title" data-file-title>${d.fileTitle}</span>` : ''}${d.agentParties && d.agentParties.length ? html` <span class="pill warn agent-party">Agent is a party</span>` : ''}
      <span class="spacer"></span>${edit ? html`<select id="statussel" aria-label="Order status">${options(DEAL_STATUSES, d.status)}</select>` : pill(d.status, d.status === 'Open' ? 'ok' : '')}</div>
    ${d.agentParties && d.agentParties.length ? html`<div class="notice warn" data-agent-party><strong>Agent is a party.</strong> ${d.agentParties.map((p) => `${p.name} is the ${p.label}`).join('; ')} on this file (a licensee buying or selling for themselves). Make sure the licensee disclosure is on file.</div>` : ''}
    ${d.selfRep ? html`<div class="notice info" data-self-rep>You are the <strong>${d.myRoleLabel}</strong> on this file. Your tasks as the client and as the agent are in one list; the history records which capacity you acted in.</div>` : ''}
    ${sc ? html`<div class="notice info" data-scheduled-closing><strong>Closing scheduled:</strong> ${slotText(sc.at)} &middot; ${sc.location}${sc.note ? html` &middot; ${sc.note}` : ''} <a href="#/deals/${d.id}/closing">details</a></div>` : ''}
    ${ag && ag.pending ? html`<div class="notice warn" data-agreements-pending>You have <strong>${ag.pending}</strong> agreement(s) to read and acknowledge (including the Wire Fraud Warning). <a href="#/deals/${d.id}/agreements">Open Agreements</a></div>` : ''}
    <div class="box-title"><h2><span class="h-ico"></span>Overview</h2>${canWire ? html`<button class="m-btn right" id="wirebtn">Wire instructions</button>` : ''}${d.unread ? html`<a class="new-msg" href="#/deals/${d.id}/inbox">${d.unread} new message(s)</a>` : ''}</div>
    <ol class="tracker">${tracker}</ol>${edit ? html`<p class="muted small">Click a step to set the stage. The last step closes the order.</p>` : ''}
    ${refi ? html`<p class="notice info" data-refi-note><strong>Refinance.</strong> No purchase price, EMD, sellers or realtors on this order: the people are the borrower(s), salespeople, the Processor and the Lender.</p>` : ''}
    <div class="keybar"><div><strong>${fmtDate(d.openDate)}</strong><span>Open Date</span></div>${showPrice ? html`<div data-purchase-price><strong>${fmtMoney(d.purchasePrice) || '\u2014'}</strong><span>Purchase Price</span></div>` : ''}
      <div><strong>${fmtMoney(d.loanAmount) || '\u2014'}</strong><span>Loan Amount</span></div><div><strong>${fmtDate(d.closingDate) || '\u2014'}</strong><span>Settlement Date</span></div>
      ${showEmd ? html`<div data-emd-amount><strong>${d.emdAmount == null || d.emdAmount === '' ? '\u2014' : fmtMoney(d.emdAmount)}</strong><span>EMD Amount</span></div><div data-emd-due><strong>${fmtDate(d.emdDueDate) || '\u2014'}</strong><span>EMD Due Date</span></div>` : ''}
      <div data-county><strong>${d.county || '\u2014'}</strong><span>County</span></div>
      ${edit && !refi ? html`<div data-occ-primary><strong>${yesNo(d.primaryResidence)}</strong><span>Primary residence</span></div><div data-occ-fthb><strong>${yesNo(d.firstTimeBuyer)}</strong><span>First-time buyer</span></div>` : ''}
      ${edit ? html`<button class="icon-edit" id="editdeal" title="Edit order details">&#9998;</button>` : ''}</div>
    <div class="box-title"><h2><span class="h-ico"></span>Summary</h2></div>
    <div class="sum-grid">${card(all('Client-Buyer').length > 1 ? `${B} Information (${all('Client-Buyer').length} ${B.toLowerCase()}s)` : `${B} Information`, html`<div data-party-list="Client-Buyer">${people(all('Client-Buyer'))}</div>${edit ? html`<button type="button" class="ghost" data-add-party="Client-Buyer">+ Add ${B.toLowerCase()}</button>` : ''}`)}${showSellers ? card(all('Client-Seller').length > 1 ? `Seller Information (${all('Client-Seller').length} sellers)` : 'Seller Information', html`<div data-party-list="Client-Seller">${people(all('Client-Seller'))}</div>${edit && !refi ? html`<button type="button" class="ghost" data-add-party="Client-Seller">+ Add seller</button>` : ''}`) : ''}
      ${showAgents('Buyer Agent') ? card('Buyer Agent Representation', person(by('Buyer Agent'))) : ''}${showAgents('Listing Agent') ? card('Listing Agent Representation', person(by('Listing Agent'))) : ''}
      ${card('Lender Information', lender)}${card('CLA Title Information', html`<div>Processor: <strong>${d.processorName}</strong><br>Preprocessor: <strong>${d.preprocessorName || 'Not assigned'}</strong><br>Salespeople: ${(d.salesPeople || []).length ? (d.salesPeople || []).map((s, i) => html`${i ? ', ' : ''}<span class="nowrap" data-sales-person="${s.id}">${s.name}${edit ? html` <button class="ghost" data-rm-sales="${s.id}" title="Remove from this order" aria-label="Remove ${s.name}">&times;</button>` : ''}</span>`) : 'Not specified'}${edit && salesStaff.filter((s) => !(d.salesPersonIds || []).includes(s.id)).length ? html`<br><select id="addsales" aria-label="Add a salesperson"><option value="">+ Add salesperson&hellip;</option>${options(salesStaff.filter((s) => !(d.salesPersonIds || []).includes(s.id)), '', (s) => `${s.firstName} ${s.lastName} (${s.role})`, (s) => s.id)}</select>` : ''}<br>${team.filter((p) => p.role === 'Transaction Coordinator').map((p) => html`Transaction coordinator: ${p.contact.firstName} ${p.contact.lastName}<br>`)}${staffView ? html`<span data-source-of-business>Source of business: <strong>${d.sourceOfBusinessLabel || 'Not set'}</strong></span>` : ''}</div>`)}</div>
    ${d.notes ? html`<div class="card"><h3>Notes</h3><p>${d.notes}</p></div>` : ''}
    ${edit ? automationSection(d, refi) : ''}
    <div class="box-title"><h2><span class="h-ico"></span>Order Contacts</h2><a class="ghost right" href="#/deals/${d.id}/contacts">All contacts</a></div>
    <table class="tbl striped"><thead><tr><th>Name</th><th>Role</th><th>Phone</th><th>Email</th></tr></thead><tbody>${d.participants.map((p) => html`<tr><td>${p.contact.firstName} ${p.contact.lastName}${p.removed ? html` ${pill('removed', 'bad')}` : ''}</td><td>${p.role}</td>${p.contact.contactHidden ? html`<td colspan="2" class="muted contact-hidden">${HIDDEN_CONTACT}</td>` : html`<td>${fmtPhone(p.contact.phone)}</td><td>${p.contact.email}</td>`}</tr>`)}</tbody></table>`;
  return { title: d.fileNumber, crumbs: [...crumbs, ['Order Details']], body, mount(root) {
    $$('.step', root).forEach((b) => b.addEventListener('click', guard(async () => { await api.setStage(d.id, b.dataset.stage); toast('Stage updated'); refresh(); })));
    const ss = $('#statussel', root); if (ss) ss.addEventListener('change', guard(async () => { await api.setDealStatus(d.id, ss.value); toast('Status updated'); refresh(); }));
    const eb = $('#editdeal', root); if (eb) eb.addEventListener('click', guard(() => editModal(api, d, refresh)));
    const as = $('#addsales', root); if (as) as.addEventListener('change', guard(async () => { if (!as.value) return; await api.addDealSalesPerson(d.id, as.value); toast('Salesperson added'); refresh(); }));
    $$('[data-rm-sales]', root).forEach((b) => b.addEventListener('click', guard(async () => { await api.removeDealSalesPerson(d.id, b.dataset.rmSales); toast('Salesperson removed'); refresh(); })));
    const ab = $('[data-email-sellers-agents]', root); if (ab) ab.addEventListener('click', guard(() => automationModal(api, d)));
    const wb = $('#wirebtn', root); if (wb) wb.addEventListener('click', guard(() => wireModal(api, d)));
    $$('[data-add-party]', root).forEach((b) => b.addEventListener('click', guard(() => addPartyModal(api, d, b.dataset.addParty, refresh))));
  } };
}

// WIRE INSTRUCTIONS (Matt, Oct 31): buyer only. FAKE sample + the fraud warning first.
async function wireModal(api, d) {
  const w = await api.getWireInstructions(d.id);
  modal('Wire instructions', html`<div class="notice warn" data-wire-warning><strong>STOP - wire fraud warning.</strong> ${w.warning}</div>
    ${w.sample ? html`<p class="pill warn" data-wire-sample>SAMPLE ONLY - FAKE INSTRUCTIONS FOR THIS DEMO. DO NOT SEND MONEY.</p>` : ''}
    <table class="tbl" id="wire-table"><tbody><tr><th>Bank</th><td>${w.bankName}<br><span class="muted small">${w.bankAddress}</span></td></tr><tr><th>Routing number</th><td>${w.routing}</td></tr>
      <tr><th>Account number</th><td>${w.account}</td></tr><tr><th>Account name</th><td>${w.accountName}</td></tr><tr><th>Reference</th><td>${w.reference}</td></tr></tbody></table>
    <p class="muted small">${w.amountNote}</p><p><strong>Questions? Call CLA Title at ${w.claPhone}</strong> (use the number you already have, not one from an email).</p>
    <div><button type="button" class="ghost" data-close>Close</button></div>`, { wide: true });
}

async function editModal(api, d, refresh) {
  const v = (k) => d[k] == null ? '' : d[k]; const refi = isRefi(d);
  // Matt, Nov 3 (b): source of business (CRM Settings Lead Source list; a retired / renamed value already on the order stays selectable) + money with commas
  const preprocs = await api.listPreprocessors();
  const srcOpts = sourceChoices(d.sourceOfBusiness, d.sourceOfBusinessLabel, refi);
  const m = modal('Edit order details', html`<form id="edf" class="form-grid">
    <label class="span2">Street<input name="street" required value="${v('street')}"></label><label>City<input name="city" required value="${v('city')}"></label>
    <label>State<select name="state" required><option value="">Select state</option>${US_STATE_NAMES.map(([c, n]) => html`<option value="${c}" ${c === d.state ? raw('selected') : ''}>${n} (${c})</option>`)}${d.state && !US_STATES.includes(d.state) ? html`<option value="${d.state}" selected>${d.state}</option>` : ''}</select></label><label>ZIP<input name="zip" value="${v('zip')}"></label><label>County<input name="county" maxlength="100" value="${v('county')}" aria-label="County"></label>
    <label>Open date<input type="date" name="openDate" required value="${v('openDate')}" max="${localDate()}"></label>    <label>Closing date<input type="date" name="closingDate" value="${v('closingDate')}"></label>
    ${refi ? html`<p class="span2 muted small" data-refi-edit>Refinance: no purchase price or EMD.${d.purchasePrice != null || d.emdAmount != null || d.emdDueDate ? ' This older order still has one; saving clears it.' : ''}</p><label>Loan amount<input name="loanAmount" inputmode="decimal" data-money autocomplete="off" value="${moneyShow(d.loanAmount)}"></label>`
      : html`<label>Purchase price<input name="purchasePrice" inputmode="decimal" data-money autocomplete="off" value="${moneyShow(d.purchasePrice)}"></label><label>Loan amount<input name="loanAmount" inputmode="decimal" data-money autocomplete="off" value="${moneyShow(d.loanAmount)}"></label>
    <label>EMD amount<input name="emdAmount" inputmode="decimal" data-money autocomplete="off" value="${moneyShow(d.emdAmount)}"></label><label>EMD due date<input type="date" name="emdDueDate" value="${v('emdDueDate')}"></label>`}
    ${refi ? '' : html`<div class="span2" data-md-occ ${d.state === 'MD' ? '' : raw('hidden')}>${occSelects(d)}</div>`}
    <h4 class="span2">CLA Title team</h4><label class="span2">Preprocessor<select name="preprocessorUserId"><option value="">(none)</option>${options(preprocs, d.preprocessorUserId || '', (p) => `${p.firstName} ${p.lastName}`, (p) => p.id)}</select></label>
    <h4 class="span2">Lender</h4><label>Company<input name="lenderName" value="${v('lenderName')}"></label><label>Contact<input name="lenderContact" value="${v('lenderContact')}"></label>
    <label>Email<input name="lenderEmail" value="${v('lenderEmail')}"></label><label>Phone<input name="lenderPhone" type="tel" inputmode="tel" placeholder="xxx-xxx-xxxx" data-phone value="${v('lenderPhone')}"></label>
    <label class="span2">Source of business<select name="sourceOfBusiness" aria-label="Source of business"><option value="">(not set)</option>${options(srcOpts, d.sourceOfBusiness || '', (o) => o.label, (o) => o.value)}</select></label>
    <label class="span2">Notes<textarea name="notes" rows="3">${v('notes')}</textarea></label>
    <div class="span2"><button class="m-btn" type="submit">Save</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`, { wide: true });
  $('#edf', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); const f = formData(e.target); ['purchasePrice', 'loanAmount', 'emdAmount'].forEach((k) => { if (f[k] !== undefined) f[k] = moneyAmount(f[k]); });
    if (refi) { f.purchasePrice = ''; f.emdAmount = ''; f.emdDueDate = ''; }   // a refinance saves no purchase price / EMD (clears what an older order had)
    if (refi || String(f.state || '').toUpperCase() !== 'MD') { f.primaryResidence = ''; f.firstTimeBuyer = ''; }
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

// ---------------- Francis, Nov 3: the Qualia-style overview panels ----------------
function agentPanels(ctx, d, ov, ur, inv) {
  const { api, user, refresh, go } = ctx; const staffView = !user.accountRole && user.role !== 'Outside user'; const od = ov.orderDetails;
  const steps = html`<ol class="phase-tracker" data-phase-tracker aria-label="Closing progress">${ov.progress.steps.map((st) => html`<li class="${st.state}" data-phase="${st.name}" data-state="${st.state}">${st.name}</li>`)}</ol>`;
  const avatar = (p) => (p.salesRep && p.profileId ? (p.photo ? html`<img class="party-avatar" src="${p.photo}" alt="" data-sales-photo>` : html`<span class="party-avatar" aria-hidden="true" data-sales-initials>${p.initials}</span>`) : '');
  const party = (p) => html`<div class="person${p.salesRep ? ' sales-rep-party' : ''}" data-party="${p.label}"${p.salesRep ? html` data-sales-rep="${p.profileId || ''}"` : ''}>${avatar(p)}<span class="muted small">${p.label}</span><br><strong>${p.name}</strong>${p.company ? html`<br><span class="muted small">${p.company}</span>` : ''}
    ${p.contactHidden ? html`<br><span class="muted small contact-hidden">${HIDDEN_CONTACT}</span>` : p.email ? html`<br><span class="muted small">${p.email}</span>` : ''}
    <div>${p.canMessage ? html`<button type="button" class="ghost" data-message-to="${p.profileId}">Message</button>` : ''} ${p.phone && !p.contactHidden ? html`<a class="ghost" href="tel:${p.phone.replace(/[^0-9+]/g, '')}" data-call>Call ${fmtPhone(p.phone)}</a>` : ''}</div></div>`;
  const urRow = (r) => html`<tr data-ur="${r.id}" data-ur-status="${r.status}"><td>${fmtDate(r.createdAt)}</td><td><strong>${r.topic}</strong>${r.note ? html`<br><span class="muted small">${r.note}</span>` : ''}${staffView ? html`<br><span class="muted small">from ${r.requestedByName} (${r.requestedRole})</span>` : ''}</td>
    <td>${r.status === 'answered' ? html`${pill('answered', 'ok')}<br>${r.response}<br><span class="muted small">${r.respondedByName}, ${fmtDate(r.respondedAt)}</span>` : ov.canAnswerUpdates ? html`<form class="inline-form" data-answer="${r.id}"><textarea name="response" rows="2" maxlength="2000" placeholder="Write the update" aria-label="Update for ${r.topic}"></textarea> <button class="m-btn" type="submit">Send update</button></form>` : pill('waiting for CLA Title', 'warn')}</td></tr>`;
  const top = html`<div class="agent-overview" data-agent-overview>
    ${ov.outstanding ? html`<div class="notice warn" data-outstanding>You have <strong>${ov.outstanding}</strong> outstanding task${ov.outstanding === 1 ? '' : 's'}. <a class="m-btn" href="#/deals/${d.id}/tasks" data-view-tasks>View Tasks</a></div>` : html`<div class="notice info" data-outstanding="0">No outstanding tasks for you on this order.</div>`}
    <div class="box-title"><h2><span class="h-ico"></span>Closing progress</h2>${ov.canShareAccess ? html`<button class="m-btn right" id="shareaccess">Share Access</button>` : ''}</div>
    ${steps}<p class="muted small">Current step: <strong data-progress-step>${ov.progress.phaseName}</strong> (order stage: ${ov.progress.stageName}${ov.progress.status !== 'Open' ? `, status ${ov.progress.status}` : ''}). The badge at the top comes from the same stage, so they always agree.</p>
    ${ov.canRequestUpdate ? html`<form id="requpdate" class="filter-bar" data-request-update><label>Request Update<select name="topic" required><option value="">Choose&hellip;</option>${options(ov.updateTopics, '')}</select></label>
      <label>Note (optional)<input name="note" maxlength="1000"></label><button class="m-btn" type="submit">Submit Request</button></form>` : ''}
    <div class="ap-grid sum-grid-ap"><fieldset class="sum-card" data-order-details><legend>Order Details</legend><dl class="answers">
      <dt>Property Address</dt><dd>${od.propertyAddress}</dd><dt>Order ID</dt><dd>${od.orderId}</dd><dt>Order Type</dt><dd>${od.orderType}</dd>
      ${od.refinance ? '' : html`<dt>Purchase Price</dt><dd>${fmtMoney(od.purchasePrice) || '\u2014'}</dd>`}<dt>Loan Amount</dt><dd>${fmtMoney(od.loanAmount) || '\u2014'}</dd><dt>File Number</dt><dd>${od.fileNumber}</dd>
      ${od.refinance && !od.agencyLicenseId ? '' : html`<dt>Agency License ID</dt><dd data-license>${od.agencyLicenseId || html`<span class="muted">not given yet${staffView ? '' : ' (Confirm Your Transaction Information)'}</span>`}</dd>`}</dl></fieldset>
    <fieldset class="sum-card" data-parties><legend>Parties</legend>${ov.parties.map(party)}</fieldset></div>
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
    const sa = $('#shareaccess', root); if (sa) sa.addEventListener('click', () => { const m = modal('Share Access', html`<form id="saf" class="form-grid" novalidate>
      <label>First Name<input name="firstName" required maxlength="80"></label><label>Last Name<input name="lastName" required maxlength="80"></label>
      <label class="span2">Email<input name="email" type="email" required maxlength="200"></label>
      <label class="span2">Organization Permissions<select name="permission" required><option value="">Choose&hellip;</option>${options(ov.permissions, '')}</select></label>
      <p class="muted small span2">Demo build: the share is recorded on this order and shown to CLA Title. No email is sent and no login is created.</p>
      <div class="span2"><button type="button" class="ghost" data-close>Cancel</button> <button class="m-btn" type="submit">Share</button></div></form>`);
      $('#saf', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); await api.shareAccess(d.id, formData(e.target)); closeModal(); toast('Access shared (recorded; no email sent)'); refresh(); })); });
    const ip = $('#invitepreview', root); if (ip) ip.addEventListener('click', guard(async () => {
      const outside = d.participants.filter((p) => p.contact && p.contact.profileId && ['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'].includes(p.role));
      const m = modal('Portal invite email', html`<form id="ipf" class="form-grid"><label class="span2">Invite<select name="pid">${outside.map((p) => html`<option value="${p.contact.profileId}">${p.contact.firstName} ${p.contact.lastName} (${p.role})</option>`)}</select></label>
        <div class="span2" id="ip-preview"></div><div class="span2"><button class="m-btn" type="submit">Queue in the outbox (not sent)</button> <button type="button" class="ghost" data-close>Close</button></div></form>`, { wide: true });
      const show = async () => { const e = await api.getPortalWelcomeEmail(d.id, $('[name=pid]', m).value);
        $('#ip-preview', m).innerHTML = toText(html`<div class="card" data-invite-preview><p><strong>To:</strong> ${e.toName} &lt;${e.to}&gt;<br><strong>Subject:</strong> ${e.subject}</p><p>${e.body}</p><p><a class="m-btn" href="${e.link}" data-complete-requests>${e.buttonLabel}</a></p><p class="muted small">The button opens ${e.link} (sign-in first if needed, then straight to this order's tasks).</p></div>`); };
      $('[name=pid]', m).addEventListener('change', guard(show)); await show();
      $('#ipf', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); await api.queuePortalWelcomeEmail(d.id, $('[name=pid]', m).value); closeModal(); toast('Invite queued in the outbox (not sent)'); })); }));
  }
  return { top, mount };
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
