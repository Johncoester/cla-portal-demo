// Deal detail: File Overview + dispatcher to the other file tabs (tasks, inbox, documents, contacts, activity).
import { html, raw, toText, esc, $, $$, guard, formData, modal, closeModal, options, fmtDate, fmtMoney, pill, toast } from '../ui.js?v=202611161500';
import { TEST_ALLOWLIST_NOTE, isAllowedTestRecipient, textToHtml, hasSignature } from '../data/gmail-email.js?v=202611121900';
import { disbursementFor } from '../data/disbursement.js?v=202611170200';
import { occSelects, yesNo } from './occ-fields.js?v=202611161500';
import { runsOrders, STAGES, DEAL_STATUSES, isProcessor, fmtPhone, localDate, US_STATE_NAMES, US_STATES, isRefi, moneyShow, moneyAmount } from '../data/constants.js?v=202611101015';
import { officeDate } from '../data/office-date.js?v=202611102100';
import { modOn } from '../data/modules.js?v=202611101015';
import { slotText } from './dealclosing.js?v=202611170800';
import { pickerHtml, mountPicker } from './person-picker.js?v=202611161500';
import { composeModal } from './compose.js?v=202611161500';
import { sourceChoices, processorChoices, fileReferralState, referralContacts, referralPartyByCode, encodeReferral, applyReferralChange } from '../data/place-order.js?v=202611092320';
import { closerChoices, closerInputValue, resolveCloser } from '../data/closer.js?v=202611101015';
import { canManageClosingLocations } from '../data/closing-location.js?v=202611101015';
import { settlementSectionHtml, closingDateSectionHtml, mountSettlement } from './settlement-section.js?v=202611161500';
import { sampleFacts, SAMPLE } from './theme-cards.js?v=202611161500';
import { themeOn } from '../theme.js?v=202611070139';
import { renderClientOverview, clientSide, isPureClient, clientTabChrome } from './client-overview.js?v=202611170800';
import { renderTcOverview, tcTabChrome } from './tc-overview.js?v=202611162200';
import { gatherReads } from '../data/read-batch.js?v=202611111200';
import { prefetchDealTab } from './deal-tab.js?v=202611182130';
import { placeText } from '../data/cla-offices.js?v=202611101015';
import { CLA_REPRESENTATION, claRepresentationWritesEnabled } from '../data/cla-representation.js?v=202611090950';
import { lenderRoleLabel } from '../data/lender-file.js?v=202611101200';
import { partyDisplayName } from '../data/party-name.js?v=202611102000';
import { viewTasksHref } from '../data/task-board.js?v=202611140100';
import { earnestView, COMMISSION_PAID_BY } from '../data/earnest-commission.js?v=202611141000';
import { parcelFieldsHtml, mountParcelFields, parcelsFromForm } from './parcel-fields.js?v=202611161500';
import { bindAddressFill } from '../data/address-fill.js?v=202611141400';
import { agentFeesPanel } from './agent-fees-box.js?v=202611182130';
function staffSections(ctx, dealId) {
  const { api } = ctx;
  const user = ctx.user;
  const readOverview = (id) => (ctx.api.readOverview ? ctx.api.readOverview(id) : ctx.api.getOrderOverview(id));
  return gatherReads({
    ag: () => ctx.api.listAgreements(dealId).catch(() => ({ pending: 0 })),
    notes: () => (!user.accountRole && api.listOrderNotes ? ctx.api.listOrderNotes(dealId).catch(() => []) : Promise.resolve([])),
    salesStaff: () => (runsOrders(user) ? ctx.api.listSalesStaff().catch(() => []) : Promise.resolve([])),
    ov: () => readOverview(dealId),
    ur: () => ctx.api.listUpdateRequests(dealId),
    inv: () => ctx.api.listSharedAccess(dealId),
    locFlags: () => ctx.api.closingLocationFlags(dealId).catch(() => []),
    promptHtml: () => locPromptHtml(ctx, { id: dealId }),
    splits: () => (!user.accountRole && user.role !== 'Outside user' && ctx.api.listUnderwriterSplits ? ctx.api.listUnderwriterSplits().then((r) => (r && r.rows) || []).catch(() => []) : Promise.resolve([])),
    demoLocked: () => (ctx.api.demoViewStatus ? ctx.api.demoViewStatus().then((d) => !!((d || {}).active)).catch(() => true) : Promise.resolve(false)),
  });
}

export async function render(ctx) {
  const { api, params } = ctx; const tab = params.tab;
  const tabName = params.tab || 'overview';
  // Francis, Nov 9: Contacts (and Edit-order party lists) need deal.participants. readFileShell leaves participants [].
  // Keep the shell for tabs that only need the file header (tasks, documents, …).
  const NEEDS_PARTIES = tabName === 'overview' || tabName === 'contacts';
  const staffShell = !NEEDS_PARTIES && api.readFileShell && ctx.user && ctx.user.role !== 'Outside user';
  const staffOverview = tabName === 'overview' && ctx.user && !ctx.user.accountRole && ctx.user.role !== 'Outside user' && ctx.user.role !== 'Transaction Coordinator';
  const dealP = staffShell ? api.readFileShell(params.id) : (api.readDeal ? api.readDeal(params.id) : api.getDeal(params.id));
  const tabP = prefetchDealTab(tabName, params.sub);
  let earlySections = null;
  if (staffOverview) { try { earlySections = staffSections(ctx, params.id); } catch (e) { earlySections = Promise.reject(e); } if (earlySections) earlySections.catch(() => {}); }
  const deal = await dealP;
  // per-file roles: on this order an outside user acts as their role HERE (deal.myRole), e.g. Buyer Agent here, Client-Buyer elsewhere
  const user = ctx.user.role === 'Outside user' && deal.myRole ? { ...ctx.user, role: deal.myRole, roles: deal.myRoles || [deal.myRole], selfRep: !!deal.selfRep, accountRole: ctx.user.role } : ctx.user; ctx = { ...ctx, user };
  const here = [['Orders', '#/orders'], [deal.fileNumber, `#/deals/${deal.id}`]];
  if (tab === 'spouse') throw new Error('That page does not exist.');
  if (tab === 'accounting' && !(api.features || {}).accounting) throw new Error('That page does not exist.');
  if (tab === 'title' && !(api.features || {}).title) throw new Error('That page does not exist.');   // John, Nov 4: order > Title behind the `title` flag
  if (tab === 'contacts' && user.accountRole && isPureClient(user)) throw new Error('Your closing team is on the Overview.');   // buyer (Nov 4 call) and seller (mirror): no Contacts tab. Accounting stays behind its module switch on CLA Portal Live Test.
  // CLIENT TABS (John, Nov 4: every buyer tab in the light client layout; same for the seller): the tab's own content, under the client file line +
  // pill tabs, drawn in the client shell (app.js: white top bar, CLA logo, no sidebar). The content and its rules are unchanged.
  if (tabP && user.role === 'Transaction Coordinator' && !user.accountRole) {
    const mod = await tabP; const v = await mod.render({ ...ctx, deal });
    const top = await tcTabChrome(ctx, deal, tab);
    return { ...v, deal, crumbs: [...here, ...(v.crumbs || [])], tcPage: true, body: html`<div class="co-page tc-page" data-tc-tabpage="${tab}">${top}<section class="co-card co-tabcard"><div class="co-cb">${v.body}</div></section></div>` };
  }
  if (tabP && user.accountRole && clientSide(user)) {
    const mod = await tabP; const v = await mod.render({ ...ctx, deal });
    const top = await clientTabChrome(ctx, deal, tab);
    return { ...v, deal, crumbs: [...here, ...(v.crumbs || [])], clientPage: { deal, side: clientSide(user), tab }, body: html`<div class="co-page co-tabpage" data-client-tab="${tab}">${top}<section class="co-card co-tabcard"><div class="co-cb">${v.body}</div></section></div>` };
  }
  if (tabP) { const mod = await tabP; const v = await mod.render({ ...ctx, deal }); return { ...v, deal, crumbs: [...here, ...(v.crumbs || [])] }; }
  if (tab !== 'overview') throw new Error('That page does not exist.');
  if (user.role === 'Transaction Coordinator' && !user.accountRole) {
    // AF-3 (John, Nov 12): the TC sees the Agent fees box for the agents they work for, above their overview
    const [tc, fees] = await Promise.all([renderTcOverview(ctx, deal), agentFeesPanel(ctx, deal)]);
    if (!tc || typeof tc !== 'object') return tc;
    return { ...tc, deal, body: html`${fees.html}${tc.body}`, mount(root) { if (tc.mount) tc.mount(root); fees.mount(root); } };
  }
  // CLIENT OVERVIEW (John, Nov 4): the buyer / seller get the redesigned overview (client-overview.js) in place of the old overview + card summary (no Cash to Close / payoff mockup figures for clients).
  if (user.accountRole && clientSide(user)) {
    const ov0 = await ctx.api.getOrderOverview(deal.id);
    { const co = await renderClientOverview({ ...ctx, wireModal, shareModal: (o) => shareModal(ctx, deal, ov0, o) }, deal, here); const lp = await locPromptHtml(ctx, deal); const body = lp ? { ...co, body: html`${lp}${co.body}` } : co; return { ...body, deal }; }   // John, Nov 4: the buyer / seller closing-location to-do also shows on the client overview
  }
  // The sections need the file id, not the party rows. They run with the file read, and the page still waits for every section.
  const feesP = agentFeesPanel(ctx, deal);   // AF-2 (John, Nov 12): agent fees per side; staff and the file's agents only. Runs alongside the sections.
  const pack = await (earlySections || staffSections(ctx, deal.id));
  const { ag, salesStaff, ov, ur, inv, locFlags, promptHtml, splits, demoLocked } = pack;
  deal.staffOrderNotes = pack.notes;   // John, Nov 4: staff-only order notes (Title module sticky notes; never clients / agents)
  const flagHtml = locFlags.length ? html`<div class="notice warn" data-location-flags>${locFlags.map((f) => html`<div data-location-flag="${f.participantId}"><strong>${f.text}</strong> &middot; signing method: ${f.signingLabel} <a href="#/deals/${deal.id}/closing">scheduling</a></div>`)}</div>` : '';
  const staffView = !user.accountRole && user.role !== 'Outside user';
  const canEdit = runsOrders(user) && !demoLocked;
  let closerStaff = [];
  let contactChoices = [];
  if (canEdit) {
    try { closerStaff = api.listActiveStaff ? await api.listActiveStaff() : []; } catch (e) { closerStaff = []; }
    try { contactChoices = api.listContacts ? await api.listContacts() : []; } catch (e) { contactChoices = []; }
  }
  const locations = staffView && api.listClosingLocations ? await api.listClosingLocations(deal.id).catch(() => []) : [];
  const settlement = { staffView, canEdit, canEditSigning: staffView && canManageClosingLocations(user) && !demoLocked, closerStaff, contactChoices, locations };
  const v = overview({ ...ctx, demoLocked, settlement }, deal, here, ag, salesStaff, ov, splits); const extra = agentPanels(ctx, deal, ov, ur, inv); const done = placedPanel(deal);
  const fees = await feesP;
  return { ...v, deal, body: html`${done.html}${promptHtml}${flagHtml}${v.head}${fees.html}${extra.top}${v.body}${extra.bottom}`, mount(root) { done.mount(root); v.mount(root); extra.mount(root); fees.mount(root); } };
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
const partyName = (p) => partyDisplayName(p);
const entityExtra = (p) => { const e = p && p.entity; if (!e) return ''; if (partyName(p) !== e.name) return entityLine(e); const rep = [e.repName, e.repTitle].filter(Boolean).join(', '); if (!e.type && !rep && !e.repPhone && !e.repEmail) return ''; return html`<div class="entity-line small" data-entity="${e.name}">${e.type ? html`<span class="muted">${e.type}</span>` : ''}${rep ? html`<br>Representative: ${rep}` : ''}${e.repPhone || e.repEmail ? html`<br><span class="muted">${[fmtPhone(e.repPhone), e.repEmail].filter(Boolean).join(' \u00b7 ')}</span>` : ''}</div>`; };
const person = (p) => { if (!p) return html`<div class="muted">Not specified</div>`; const name = partyName(p); const company = p.contact.company && p.contact.company !== name ? p.contact.company : ''; return html`<div class="person" data-person="${p.contactId}">${entityExtra(p)}<strong>${name}${p.removed ? ' (removed)' : ''}</strong>${p.contact.contactHidden ? html`<br><span class="muted contact-hidden">${HIDDEN_CONTACT}</span>` : html`<br><span class="muted">${p.contact.email}</span><br><span class="muted">${fmtPhone(p.contact.phone)}</span>`}${company ? html`<br><span class="muted">${company}</span>` : ''}</div>`; };

const named = (d, role) => (d.participants || []).filter((p) => p.role === role && !p.removed && p.contact).map((p) => partyName(p)).filter(Boolean);
export function fileIdentityHtml(d) {
  const buyers = named(d, 'Client-Buyer');
  const sellers = named(d, 'Client-Seller');
  const who = (list) => (list.length ? list.join(', ') : 'None');
  return html`<section class="op-file-id" data-file-identity aria-label="This file">
    <div><span class="op-box-label">${isRefi(d) ? 'Borrower' : 'Buyer'}</span> <b data-file-buyers>${who(buyers)}</b></div>
    <div><span class="op-box-label">Seller</span> <b data-file-sellers>${who(sellers)}</b></div></section>`;
}

function overview({ api, user, refresh, demoLocked, settlement = null }, d, crumbs, ag, salesStaff = [], ov = null, splits = []) {
  const staffView = !user.accountRole && user.role !== 'Outside user';
  const canWire = staffView || (user.roles || [user.role]).includes('Client-Buyer');   // Matt, Oct 31: buyer only (plus CLA staff)
  const sc = d.scheduledClosing;
  const by = (role) => d.participants.find((p) => p.role === role); const all = (role) => d.participants.filter((p) => p.role === role); const edit = runsOrders(user) && !demoLocked;
  // REFINANCE (John, Nov 3): no purchase price, EMD, sellers or realtors; the borrower(s) are the Client-Buyer rows. An older refinance that still has a
  // seller / agent / price keeps showing it (nothing is hidden that is on the file), but nothing new can be added.
  const refi = isRefi(d); const B = refi ? 'Borrower' : 'Buyer';
  const showSellers = !refi || all('Client-Seller').length; const showAgents = (r) => !refi || all(r).length; const showPrice = !refi || d.purchasePrice != null; const showEmd = !refi || d.emdAmount != null || d.emdDueDate;
  const tracker = STAGES.map((s, i) => html`<li class="${i < d.stage ? 'done' : i === d.stage ? 'current' : ''}"><button type="button" class="step" ${edit ? '' : raw('disabled')} data-stage="${i}" title="${edit ? 'Set stage' : s}"></button><span>${s}</span></li>`);
  const stage = Math.max(0, Math.min(STAGES.length - 1, Number(d.stage) || 0)); const today = localDate();
  const toGo = d.closingDate ? Math.round((Date.parse(d.closingDate + 'T12:00:00') - Date.parse(today + 'T12:00:00')) / 864e5) : null;
  const openN = ov ? (staffView ? ov.counts.tasks : ov.outstanding) : d.openTasks;
  const portalN = Number(d.unread) || (ov && ov.counts && Number(ov.counts.inbox)) || 0;
  const emailN = (ov && ov.counts && Number(ov.counts.email)) || 0;
  const glance = html`<div class="op-glance" data-glance><span class="muted">At a glance:</span>
    ${showPrice ? html`<span data-purchase-price>Purchase <b>${fmtMoney(d.purchasePrice) || '\u2014'}</b></span>` : ''}<span data-loan-amount>Loan <b>${fmtMoney(d.loanAmount) || '\u2014'}</b></span>
    ${showEmd ? html`<span data-emd-amount>EMD <b>${d.emdAmount == null || d.emdAmount === '' ? '\u2014' : fmtMoney(d.emdAmount)}</b></span><span data-emd-due>EMD due <b>${fmtDate(d.emdDueDate) || '\u2014'}</b></span>` : ''}
    ${staffView ? '' : html`<span data-settlement>Settlement <b>${fmtDate(d.closingDate) || 'not set'}</b>${toGo != null && toGo >= 0 ? ` (${toGo === 0 ? 'today' : `${toGo} day${toGo === 1 ? '' : 's'}`})` : ''}</span>`}
    ${(() => { const db = disbursementFor(d); return html`<span data-disbursement="${db.source}">Disbursement <b>${fmtDate(db.date) || 'not set'}</b> <span class="muted small">(${db.note})</span></span>`; })()}
    ${openN != null ? html`<span data-open-tasks><a href="#/deals/${d.id}/tasks"><b>${openN}</b> ${staffView ? 'open task' : 'task'}${openN === 1 ? '' : 's'}${staffView ? '' : ' for you'}</a></span>` : ''}
    ${emailN ? html`<span data-email-unread><a href="#/deals/${d.id}/email"><b>${emailN}</b> unread email${emailN === 1 ? '' : 's'}</a></span>` : ''}
    ${edit && !refi ? html`<span data-occ-primary>Primary residence <b>${yesNo(d.primaryResidence)}</b></span><span data-occ-fthb>First-time buyer <b>${yesNo(d.firstTimeBuyer)}</b></span>` : ''}
    ${edit ? html`<button class="icon-edit" id="editdeal" title="Edit order details" aria-label="Edit order details">&#9998;</button>` : ''}</div>`;
  const daysNote = toGo == null ? '' : toGo < 0 ? '' : (toGo === 0 ? 'today' : `${toGo} day${toGo === 1 ? '' : 's'}`);
  const head = html`${staffView ? fileIdentityHtml(d) : ''}<section class="op-status" data-status-bar aria-label="Order status">
      <div class="op-status-top"><span class="op-status-label">ORDER STATUS &middot; <b data-status-step>Step ${stage + 1} of ${STAGES.length} &mdash; ${STAGES[stage]}</b>${ov && !staffView ? html` &middot; <span class="muted">your closing progress: <strong data-progress-step>${ov.progress.phaseName}</strong></span>` : ''}</span>
        <span class="op-status-right">${edit ? html`<select id="statussel" aria-label="Order status">${options(DEAL_STATUSES, d.status)}</select>` : pill(d.status, d.status === 'Open' ? 'ok' : '')}</span></div>
      <ol class="tracker op-steps" data-milestones>${tracker}</ol>${edit ? html`<p class="muted small op-hint">Click a step to set the stage. The last step closes the order.</p>` : ''}
      ${glance}</section>
    ${staffView ? (d.fileTitle || (d.agentParties && d.agentParties.length) ? html`<div class="op-title deal-head">${d.fileTitle ? html`<span class="file-title" data-file-title>${d.fileTitle}</span>` : ''}${d.agentParties && d.agentParties.length ? html` <span class="pill warn agent-party">Agent is a party</span>` : ''}</div>` : '') : html`<div class="op-title deal-head"><h1 class="op-address" data-op-address>${d.street}, ${d.city}, ${d.state} ${d.zip}</h1><span class="op-order-no order-no" data-op-order-no>Order # ${d.fileNumber}</span>${d.fileTitle ? html` <span class="file-title" data-file-title>${d.fileTitle}</span>` : ''}${d.agentParties && d.agentParties.length ? html` <span class="pill warn agent-party">Agent is a party</span>` : ''}</div>`}
    <p class="op-sub muted" data-op-sub>${d.transactionType || 'Purchase'}${d.county ? html` &middot; <span data-county-head>${d.county} County</span>` : ''}${d.parcelId ? html` &middot; Parcel <span data-parcel-id>${d.parcelId}</span>` : ''}<span data-county hidden>${d.county || '\u2014'}</span> &middot; Opened ${fmtDate(d.openDate)} &middot; Processor ${d.processorId ? html`<span data-processor-name>${d.processorName || 'assigned'}</span>` : staffView ? html`<span class="pill warn" data-unassigned-processor title="Assign one with Edit order details">Unassigned</span>` : 'not set'}${d.preprocessorName ? html` &middot; Preprocessor ${d.preprocessorName}` : ''}${staffView ? html` &middot; Closer <span data-closer>${d.closerName || 'not set'}</span>` : ''}${d.tcUserId ? html` &middot; TC <span data-tc-name>${d.tcName || 'assigned'}</span>` : staffView ? html` &middot; TC <span class="muted" data-tc-none>not assigned</span>` : ''}${staffView && (claRepresentationWritesEnabled(api) || d.claRepresentation) ? html` &middot; <span data-cla-representation>CLA represents: ${d.claRepresentationLabel || 'Not recorded'}</span>` : ''}${staffView ? html` &middot; <span data-source-of-business>Source of business: ${d.sourceOfBusinessLabel || 'Not set'}</span>` : ''}${ov && ov.orderDetails.agencyLicenseId ? html` &middot; Agency License ID <span data-license>${ov.orderDetails.agencyLicenseId}</span>` : ''}</p>
    ${moneyRow(d, { canWire: staffView ? false : canWire, staffView, showEmd })}${earnestBlock(d, showEmd, staffView || (user.roles || [user.role]).some((r) => r === 'Buyer Agent' || r === 'Listing Agent'))}
    ${portalN ? html`<div class="op-actions"><a class="new-msg" href="#/deals/${d.id}/inbox" data-portal-unread="${portalN}">${portalN} new message(s)</a></div>` : ''}
    ${d.agentParties && d.agentParties.length ? html`<div class="notice warn" data-agent-party><strong>Agent is a party.</strong> ${d.agentParties.map((p) => `${p.name} is the ${p.label}`).join('; ')} on this file (a licensee buying or selling for themselves). Make sure the licensee disclosure is on file.</div>` : ''}
    ${d.selfRep ? html`<div class="notice info" data-self-rep>You are the <strong>${d.myRoleLabel}</strong> on this file. Your tasks as the client and as the agent are in one list; the history records which capacity you acted in.</div>` : ''}
    ${sc ? html`<div class="notice info" data-scheduled-closing><strong>Closing scheduled:</strong> ${slotText(sc.at)} &middot; ${placeText(sc.location, sc.officeId, sc.officeName)}${sc.note ? html` &middot; ${sc.note}` : ''} <a href="#/deals/${d.id}/closing">details</a></div>` : ''}
    ${ag && ag.pending ? html`<div class="notice warn" data-agreements-pending>You have <strong>${ag.pending}</strong> agreement(s) to read and acknowledge (including the Wire Fraud Warning). <a href="#/deals/${d.id}/agreements">Open Agreements</a></div>` : ''}
    ${refi ? html`<p class="notice info" data-refi-note><strong>Refinance.</strong> No purchase price, EMD, sellers or realtors on this order: the people are the borrower(s), salespeople, the Processor and the Lender.</p>` : ''}`;
  const lenderLine = d.lenderName || d.lenderContact || d.lenderEmail || d.lenderPhone ? html`<b>${d.lenderName || d.lenderContact}</b>${d.lenderName && d.lenderContact ? html` &middot; ${d.lenderContact}` : ''}${d.lenderEmail || d.lenderPhone ? html`<br><span class="muted small">${[d.lenderEmail, fmtPhone(d.lenderPhone)].filter(Boolean).join(' \u00b7 ')}</span>` : ''}`
    : by('Lender') ? html`<b>${by('Lender').contact.firstName} ${by('Lender').contact.lastName}</b>${by('Lender').contact.company ? html`<br><span class="muted small">${by('Lender').contact.company}</span>` : ''}` : Number(d.loanAmount) ? html`<b>Not yet entered</b>` : html`<b>None (cash)</b>`;
  const body = html`
    ${staffView ? closingDateSectionHtml({ deal: d, user, demoLocked, locations: (settlement && settlement.locations) || [], daysNote }) : settlementSectionHtml({ deal: d, user, demoLocked, contacts: (settlement && settlement.contactChoices) || [], closerStaff: (settlement && settlement.closerStaff) || [], locations: (settlement && settlement.locations) || [] })}
    <div class="box-title"><h2><span class="h-ico"></span>Parties</h2><a class="ghost right" href="#/deals/${d.id}/contacts">All contacts</a></div>
    ${partiesList(d, ov, staffView, { splits, edit, source: staffView ? (d.sourceOfBusiness || '') : '', sourceLabel: staffView ? (d.sourceOfBusinessLabel || '') : '' })}
    ${staffView ? html`<div class="op-party-tools" data-party-tools>${edit ? html`<button type="button" class="ghost" data-add-party="Client-Buyer">+ Add ${B.toLowerCase()}</button>${!refi ? html` <button type="button" class="ghost" data-add-party="Client-Seller">+ Add seller</button>` : ''}` : ''}
      <span class="op-sales">Salespeople: ${(d.salesPeople || []).length ? (d.salesPeople || []).map((s, i) => html`${i ? ', ' : ''}<span class="nowrap" data-sales-person="${s.id}">${s.name}${edit ? html` <button class="ghost" data-rm-sales="${s.id}" title="Remove from this order" aria-label="Remove ${s.name}">&times;</button>` : ''}</span>`) : 'Not specified'}
      ${edit && salesStaff.filter((s) => !(d.salesPersonIds || []).includes(s.id)).length ? html` <select id="addsales" aria-label="Add a salesperson"><option value="">+ Add salesperson&hellip;</option>${options(salesStaff.filter((s) => !(d.salesPersonIds || []).includes(s.id)), '', (s) => `${s.firstName} ${s.lastName} (${s.role})`, (s) => s.id)}</select>` : ''}</span></div>` : ''}
    <div class="box-title"><h2><span class="h-ico"></span>Notes</h2></div>
    <div class="op-notes" data-notes>${d.notes ? html`<div class="op-note">${d.notes}</div>` : html`<p class="muted">No notes on this order.</p>`}${(d.staffOrderNotes || []).length ? html`<ul class="tt-notes" data-order-notes>${d.staffOrderNotes.slice(0, 5).map((n) => html`<li data-onote="${n.category}"><span class="pill">${n.category}</span> ${n.body.length > 220 ? n.body.slice(0, 220) + '…' : n.body} <span class="muted small">${n.byName}${n.issueResolved ? ' · resolved' : ''}</span></li>`)}</ul>${modOn('title') ? html`<a class="small" href="#/deals/${d.id}/title?v=notes" data-title-notes>All order notes (Title)</a>` : ''}` : ''}${edit ? html`<button type="button" class="ghost" data-edit-notes>${d.notes ? 'Edit note' : '+ Add note'}</button>` : ''}</div>
    ${edit ? automationSection(d, refi) : ''}
    ${staffView ? '' : html`<div class="box-title"><h2><span class="h-ico"></span>Order Contacts</h2><a class="ghost right" href="#/deals/${d.id}/contacts">All contacts</a></div>
    <div class="card op-contacts-card" data-order-contacts><div><div class="muted small">Lender</div><div data-lender>${lenderLine}</div></div>
      <div><div class="muted small">HOA</div><div>${by('HOA') ? html`<b>${by('HOA').contact.firstName} ${by('HOA').contact.lastName}</b>` : html`<b>&mdash;</b>`}</div></div>
      <div><div class="muted small">Closing location</div><div><b>${sc && sc.location ? sc.location : 'CLA Title office (to be confirmed)'}</b></div></div></div>`}`;
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
    mountParties(root, { api, d, refresh, canEdit: edit && staffView });
    mountSettlement(root, { api, deal: d, refresh, user, demoLocked, contacts: (settlement && settlement.contactChoices) || [], closerStaff: (settlement && settlement.closerStaff) || [] });
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
  const v = (k) => d[k] == null ? '' : d[k]; const refi = isRefi(d); const ev = earnestView(d);
  // Matt, Nov 3 (b): source of business (CRM Settings Lead Source list; a retired / renamed value already on the order stays selectable) + money with commas
  const preprocs = await api.listPreprocessors(); const procs = api.listProcessors ? await api.listProcessors() : [];
  let closerStaff = []; try { closerStaff = api.listActiveStaff ? await api.listActiveStaff() : []; } catch (e) { closerStaff = []; }
  const closers = closerChoices(closerStaff);
  // John, Nov 9: the file's Transaction Coordinator (informational; every TC sees every file). A TC no longer on the list stays selectable.
  let tcs = []; try { tcs = api.listCoordinators ? await api.listCoordinators() : []; } catch (e) { tcs = []; }
  const tcOpts = tcs.map((t) => ({ id: t.profileId || t.id, name: `${t.firstName || ''} ${t.lastName || ''}`.trim() || t.email || 'Transaction Coordinator' }));
  if (d.tcUserId && !tcOpts.some((t) => t.id === d.tcUserId)) tcOpts.push({ id: d.tcUserId, name: d.tcName || 'Current Transaction Coordinator' });
  const srcOpts = sourceChoices(d.sourceOfBusiness, d.sourceOfBusinessLabel, refi, referralContacts(d.participants));
  const m = modal('Edit order details', html`<form id="edf" class="form-grid">
    <label class="span2">Street<input name="street" required value="${v('street')}"></label><label>City<input name="city" required value="${v('city')}"></label>
    <label>State<select name="state" required><option value="">Select state</option>${US_STATE_NAMES.map(([c, n]) => html`<option value="${c}" ${c === d.state ? raw('selected') : ''}>${n} (${c})</option>`)}${d.state && !US_STATES.includes(d.state) ? html`<option value="${d.state}" selected>${d.state}</option>` : ''}</select></label><label>ZIP<input name="zip" value="${v('zip')}"></label><label>County<input name="county" maxlength="100" value="${v('county')}" aria-label="County"></label>
    <label>Open date<input type="date" name="openDate" required value="${v('openDate')}" max="${officeDate()}"></label>    <label>Closing date<input type="date" name="closingDate" value="${v('closingDate')}"></label><label>Disbursement date<input type="date" name="disbursementDate" value="${v('disbursementDate')}" data-disbursement-input><span class="field-hint">Leave blank for the automatic date (${disbursementFor({ ...d, disbursementDate: '' }).note}).</span></label>
    ${refi ? html`<p class="span2 muted small" data-refi-edit>Refinance: no purchase price or EMD.${d.purchasePrice != null || d.emdAmount != null || d.emdDueDate ? ' This older order still has one; saving clears it.' : ''}</p><label>Loan amount<input name="loanAmount" inputmode="decimal" data-money autocomplete="off" value="${moneyShow(d.loanAmount)}"></label>`
      : html`<label>Purchase price<input name="purchasePrice" inputmode="decimal" data-money autocomplete="off" value="${moneyShow(d.purchasePrice)}"></label><label>Loan amount<input name="loanAmount" inputmode="decimal" data-money autocomplete="off" value="${moneyShow(d.loanAmount)}"></label>
    <label>EMD amount<input name="emdAmount" inputmode="decimal" data-money autocomplete="off" value="${moneyShow(d.emdAmount)}"></label><label>EMD due date<input type="date" name="emdDueDate" value="${v('emdDueDate')}"></label>`}
    ${refi ? '' : html`<div class="span2" data-md-occ ${d.state === 'MD' ? '' : raw('hidden')}>${occSelects(d)}</div>`}
    ${claRepresentationWritesEnabled(api) ? html`<h4 class="span2">Who CLA represents</h4><label class="span2">CLA's side of this file<select name="claRepresentation" aria-label="Who CLA represents"><option value="" ${d.claRepresentation ? '' : raw('selected')}>Not recorded</option>${CLA_REPRESENTATION.map((row) => html`<option value="${row.code}" ${row.code === d.claRepresentation ? raw('selected') : ''}>${row.label}</option>`)}</select><span class="field-hint">Not a portal role, not the buyer or listing agent, not the source of business, and not who can see the file. Not recorded stays blank until you choose.</span></label>` : ''}
    <h4 class="span2">CLA Title team</h4><label class="span2">Processor <button type="button" class="ghost" data-refresh-processors>Refresh list</button><select name="processorId" data-processor-select></select><span class="field-hint">Unassigned is allowed. Refreshing the list does not change the address or the other fields.</span></label>
    <label class="span2">Transaction Coordinator<select name="tcUserId" data-tc-select><option value="">(none)</option>${options(tcOpts, d.tcUserId || '', (t) => t.name, (t) => t.id)}</select><span class="field-hint">Filled in automatically from the agent's team when blank. Change or clear it any time.</span></label>
    <label class="span2">Preprocessor<select name="preprocessorUserId"><option value="">(none)</option>${options(preprocs, d.preprocessorUserId || '', (p) => `${p.firstName} ${p.lastName}`, (p) => p.id)}</select></label>
    <label class="span2">Closer<input name="closerName" list="closer-staff" maxlength="120" autocomplete="off" value="${closerInputValue(d, closers)}" aria-label="Closer" data-closer-input><datalist id="closer-staff">${closers.map((c) => html`<option value="${c.label}"></option>`)}</datalist><span class="field-hint">Pick an active CLA staff member, or type a name.</span></label>
    <h4 class="span2">Lender</h4><label>Company<input name="lenderName" value="${v('lenderName')}"></label><label>Contact<input name="lenderContact" value="${v('lenderContact')}"></label>
    <label>Email<input name="lenderEmail" value="${v('lenderEmail')}"></label><label>Phone<input name="lenderPhone" type="tel" inputmode="tel" placeholder="xxx-xxx-xxxx" data-phone value="${v('lenderPhone')}"></label>
    <label class="span2">Source of business<select name="sourceOfBusiness" aria-label="Source of business"><option value="">(not set)</option>${options(srcOpts, d.sourceOfBusiness || '', (o) => o.label, (o) => o.value)}</select></label>
    ${parcelFieldsHtml(d)}
    ${refi ? '' : html`<h4 class="span2">Earnest &amp; commissions <span class="muted small">(optional)</span></h4><label>EMD held by<input name="emdHeldBy" maxlength="200" value="${ev.held}" aria-label="EMD held by"></label><label>Commission base<input name="commissionBase" inputmode="decimal" data-money value="${moneyShow(ev.base)}" aria-label="Commission base"></label><label>Commission %<input name="commissionPercent" inputmode="decimal" value="${ev.percent != null ? ev.percent : ''}" aria-label="Commission percent"></label><label>Additional<input name="commissionAdditional" inputmode="decimal" data-money value="${moneyShow(ev.additional)}" aria-label="Commission additional"></label><label>Paid by<select name="commissionPaidBy" aria-label="Commission paid by"><option value="">Choose&hellip;</option>${COMMISSION_PAID_BY.map(([code, label]) => html`<option value="${code}" ${code === ev.paid ? raw('selected') : ''}>${label}</option>`)}</select></label>`}
    <label class="span2">Notes<textarea name="notes" rows="3">${v('notes')}</textarea></label>
    <div class="span2"><button class="m-btn" type="submit">Save</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`, { wide: true });
  const paintProcessors = (list, keep) => { const sel = $('[name=processorId]', m); const next = processorChoices(list, keep == null ? (sel.value || d.processorId || '') : keep, '');
    sel.replaceChildren(); for (const o of next.options) { const opt = document.createElement('option'); opt.value = o.value; opt.textContent = o.label; sel.appendChild(opt); }
    if (keep == null && d.processorId && ![...sel.options].some((o) => o.value === d.processorId)) { const cur = document.createElement('option'); cur.value = d.processorId; cur.textContent = d.processorName || 'Current Processor'; sel.appendChild(cur); }
    sel.value = [...sel.options].some((o) => o.value === (keep == null ? (d.processorId || '') : next.value)) ? (keep == null ? (d.processorId || '') : next.value) : ''; };
  paintProcessors(procs, null);
  mountParcelFields(m);
  bindAddressFill($('#edf', m));
  $('[data-refresh-processors]', m).addEventListener('click', guard(async () => { const street = $('[name=street]', m).value; const keep = $('[name=processorId]', m).value; paintProcessors(await api.listProcessors(), keep);
    if ($('[name=street]', m).value !== street) throw new Error('Refreshing the Processor list must not clear the form.'); toast('Processor list updated. The other fields were kept.'); }));
  $('#edf', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); const f = formData(e.target); ['purchasePrice', 'loanAmount', 'emdAmount'].forEach((k) => { if (f[k] !== undefined) f[k] = moneyAmount(f[k]); });
    const closer = resolveCloser(f.closerName, closers, { closerName: d.closerName || '', closerProfileId: d.closerProfileId || null }); f.closerName = closer.closerName; f.closerProfileId = closer.closerProfileId;
    if (refi) { f.purchasePrice = ''; f.emdAmount = ''; f.emdDueDate = ''; f.emdHeldBy = ''; f.commissionBase = ''; f.commissionPercent = ''; f.commissionAdditional = ''; f.commissionPaidBy = ''; }   // a refinance saves no purchase price / EMD (clears what an older order had)
    if (refi || String(f.state || '').toUpperCase() !== 'MD') { f.primaryResidence = ''; f.firstTimeBuyer = ''; }
    const parcels = parcelsFromForm(e.target); f.parcelId = parcels.parcelId; f.parcelIds = parcels.parcelIds;
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
// AF-2 (John, Nov 12): buyers and sellers never see commissions or agent fees: they see only "EMD held by" here; CLA staff and the file's agents see it all.
function earnestBlock(d, showEmd, seesFees = true) {
  const full = earnestView(d);
  const ev = seesFees ? full : { held: full.held, any: !!full.held, base: null, percent: null, additional: null, total: null, paidLabel: '' };
  if (!showEmd || !ev.any) return '';
  return html`<section class="op-emd" data-earnest-commission aria-label="Earnest and commissions"><span class="op-box-label">${seesFees ? html`Earnest &amp; commissions` : 'Earnest money'}</span>
    ${ev.held ? html`<span data-emd-held-by>EMD held by <b>${ev.held}</b></span>` : ''}
    ${ev.base != null ? html`<span data-commission-base>Base <b>${fmtMoney(ev.base)}</b></span>` : ''}
    ${ev.percent != null ? html`<span data-commission-percent><b>${ev.percent}%</b></span>` : ''}
    ${ev.additional != null ? html`<span data-commission-additional>Additional <b>${fmtMoney(ev.additional)}</b></span>` : ''}
    ${ev.total != null ? html`<span data-commission-total>Total <b>${fmtMoney(ev.total)}</b></span>` : ''}
    ${ev.paidLabel ? html`<span data-commission-paid-by>Paid by <b>${ev.paidLabel}</b></span>` : ''}</section>`;
}

// ---------------- ORDER PAGE REDESIGN (John, Nov 4): ONE Parties list ----------------
// Rows come from getOrderOverview().parties: the adapter already applies every role rule (opposing side's contact hidden for outside users,
// the CLA Title sales rep only on agent Parties, no wire / cash-to-close / payoff data at all). CLA staff also see the other people on the file
// (lender, TC, sales team, HOA, ...). Per person: Call (tel:), Email (mailto: opens the viewer's own mail app; the portal sends nothing),
// and a small copy icon beside the phone and beside the email. There is no second Copy button for the whole row.
const telOf = (ph) => String(ph || '').replace(/[^0-9+]/g, '');
const COPY_ICON = html`<svg class="op-copy-ico" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2"></rect><path d="M5 15V5h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path></svg>`;
const copyLabel = (kind) => (kind === 'email' ? 'Copy email address' : 'Copy phone number');
export function partyCopyButton(kind, value) {
  const label = copyLabel(kind);
  return html`<button type="button" class="op-copy" data-copy-field="${value}" data-copy-kind="${kind}" aria-label="${label}" title="${label}">${COPY_ICON}</button><span class="copy-confirm" data-copy-confirm hidden>Copied</span>`;
}
/* True only when the text actually landed on the clipboard. A denied or missing clipboard is a failure. */
export async function copyPlainText(text, deps = {}) {
  const value = String(text == null ? '' : text);
  const nav = deps.navigator || (typeof navigator !== 'undefined' ? navigator : undefined);
  const doc = deps.document || (typeof document !== 'undefined' ? document : undefined);
  const write = nav && nav.clipboard && nav.clipboard.writeText;
  if (write) { try { await nav.clipboard.writeText(value); return true; } catch (e) { /* older browsers fall through */ } }
  try {
    if (!doc || !doc.execCommand || !doc.createElement) return false;
    const ta = doc.createElement('textarea');
    ta.value = value; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.left = '-9999px';
    doc.body.appendChild(ta); ta.select();
    const ok = doc.execCommand('copy') === true;
    ta.remove();
    return ok;
  } catch (e) { return false; }
}
const OVERVIEW_ROLES = ['Client-Buyer', 'Client-Seller', 'Buyer Agent', 'Listing Agent', 'Processor', 'Preprocessor'];
// John, Nov 4 meeting: CLA staff also get the ABSTRACTOR and the UNDERWRITER in the same list. Someone added on Contacts with that role shows
// with their details; otherwise the row still shows (Underwriter = the state's underwriter from Underwriter Splits, Abstractor = not assigned yet).
export const STAFF_EXTRA_ROLES = ['Abstractor', 'Underwriter'];
export function partyRows(d, ov, staffView, splits = []) {
  const rows = ov ? ov.parties.map((p) => ({ ...p })) : [];
  if (staffView) d.participants.filter((p) => !p.removed && p.contact && !OVERVIEW_ROLES.includes(p.role) && !(p.role === 'Lender' && rows.some((r) => r.label === 'Lender')))
    .forEach((p) => { const roleBit = lenderRoleLabel(p.contact.lenderRole); const name = partyDisplayName(p); const company = [p.contact.company && p.contact.company !== name ? p.contact.company : '', roleBit].filter(Boolean).join(' · '); rows.push({ label: p.role, name, company, email: p.contact.email || '', phone: p.contact.phone || '', contactId: p.contact.contactHidden ? '' : (p.contactId || ''), contactHidden: !!p.contact.contactHidden, entity: p.entity || null, profileId: p.contact.profileId || null, canMessage: false }); });
  if (staffView) for (const role of STAFF_EXTRA_ROLES) if (!rows.some((r) => r.label === role)) {
    const sp = role === 'Underwriter' ? (splits || []).find((x) => x.state === String(d.state || '').toUpperCase() && x.underwriter) : null;
    rows.push(sp ? { label: role, name: sp.underwriter, company: `${sp.state} underwriter (Underwriter Splits)`, email: '', phone: '', placeholder: true, fromSplits: true }
      : { label: role, name: 'Not specified', company: role === 'Abstractor' ? 'No abstractor on this order yet' : 'No underwriter on this order yet', email: '', phone: '', placeholder: true }); }
  return rows;
}
function referralCell(row, state, canEdit) {
  if (!state || !state.control) return html`<span class="op-ref"></span>`;
  const meta = referralPartyByCode(state.code);
  const who = state.contactId ? `${meta.label} — ${state.name}` : `${meta.label}, no person on this row`;
  if (!state.contactId || state.disabled) return html`<label class="op-ref referral-source is-off"><input type="radio" disabled aria-label="Source of business: ${who}"> <span>Source of business</span></label>`;
  const value = encodeReferral(state.code, state.contactId);
  if (!canEdit) {
    return html`<span class="op-ref${state.checked ? ' is-current' : ''}"${state.checked ? html` data-referral-current="${value}"` : ''}><input type="radio" disabled ${state.checked ? raw('checked') : ''} aria-label="Source of business: ${who}"> <span>Source of business</span></span>`;
  }
  return html`<label class="op-ref referral-source"><input type="radio" name="fileReferral" value="${value}" data-referral-source="${value}" aria-label="Source of business: ${who}" ${state.checked ? raw('checked') : ''}> <span>Source of business</span></label>`;
}
function partiesList(d, ov, staffView, { splits = [], edit = false, source = '', sourceLabel = '' } = {}) {
  const rows = partyRows(d, ov, staffView, splits);
  const referral = staffView ? fileReferralState({ source, sourceLabel, rows, canEdit: edit }) : null;
  const avatar = (p) => (p.salesRep && p.profileId ? (p.photo ? html`<img class="party-avatar" src="${p.photo}" alt="" data-sales-photo>` : html`<span class="party-avatar" aria-hidden="true" data-sales-initials>${p.initials}</span>`) : '');
  const row = (p, i) => { const hid = p.contactHidden; const tel = hid ? '' : telOf(p.phone); const em = hid ? '' : p.email || '';
    const ref = referral ? referralCell(p, referral.rows[i], edit) : '';
    return html`<div class="op-prow${p.salesRep ? ' sales-rep-party' : ''}${p.placeholder ? ' is-placeholder' : ''}" data-party="${p.label}"${p.placeholder ? html` data-party-placeholder` : ''}${p.salesRep ? html` data-sales-rep="${p.profileId || ''}"` : ''} data-party-row="${i}">
      <span class="op-role">${p.label}</span><span class="op-nm">${avatar(p)}${p.entity && p.name === p.entity.name ? '' : entityLine(p.entity)}<strong>${p.name}</strong>${p.entity && p.name === p.entity.name && (p.entity.repName || p.entity.type) ? html`<small data-entity-rep>${[p.entity.type, p.entity.repName].filter(Boolean).join(' · ')}</small>` : ''}${p.company ? html`<small>${p.company}</small>` : ''}</span>
      ${hid ? html`<span class="op-ph op-hidden muted small contact-hidden" data-contact-hidden>${HIDDEN_CONTACT}</span><span class="op-em"></span>` : html`<span class="op-ph">${tel ? html`<span class="op-copy-val">${fmtPhone(p.phone)}</span>${partyCopyButton('phone', fmtPhone(p.phone))}` : html`<span class="muted">&mdash;</span>`}</span><span class="op-em">${em ? html`<span class="op-copy-val">${em}</span>${partyCopyButton('email', em)}` : html`<span class="muted">&mdash;</span>`}</span>`}
      <span class="op-acts">${tel ? html`<a class="op-act" href="tel:${tel}" data-call aria-label="Call ${p.name}">&#9742; Call</a>` : html`<span class="op-act is-off" aria-disabled="true">&#9742; Call</span>`}
        ${em ? html`<a class="op-act" href="mailto:${em}" data-email aria-label="Email ${p.name} (opens your mail app)">&#9993; Email</a>` : html`<span class="op-act is-off" aria-disabled="true">&#9993; Email</span>`}
        ${p.canMessage ? html`<button type="button" class="op-act" data-message-to="${p.profileId}">Message</button>` : ''}
        ${p.placeholder && edit ? html`<a class="op-act" href="#/deals/${d.id}/contacts" data-add-role="${p.label}" aria-label="Add ${p.label.toLowerCase()} on Contacts">+ Add</a>` : ''}</span>${ref}</div>`; };
  const legacy = referral && referral.legacy ? html`<p class="op-ref-legacy" data-referral-unmatched>Source of business: ${referral.unmatched}. This value is not tied to one person on the file.</p>` : '';
  const clear = referral && edit ? html`<label class="referral-source op-ref-clear"><input type="radio" name="fileReferral" value="" data-referral-clear aria-label="Source of business: Not set" ${referral.clearChecked ? raw('checked') : ''}> Not set</label>` : '';
  const hint = referral ? html`<p class="muted small" data-referral-hint>Source of business is one person: a buyer, seller, buyer agent, listing agent, or lender. It is not the CLA salesperson and it does not change a contact's Lead Source.</p>` : '';
  return html`<div class="op-plist" data-parties data-party-list-all${referral ? raw(' data-referral-on') : ''}>${rows.length ? rows.map(row) : html`<p class="muted">Nobody on this order yet.</p>`}</div>
    ${staffView && edit ? html`<div class="op-ref-tools" data-referral-tools>${clear}</div>` : ''}${legacy}${hint}
    <p class="muted small op-pnote">Call and Email open your phone or mail app. The portal does not send anything.</p>`;
}
function mountParties(root, { api, d, refresh, canEdit } = {}) {
  $$('[data-copy-field]', root).forEach((b) => b.addEventListener('click', async () => {
    const kind = b.dataset.copyKind === 'email' ? 'email address' : 'phone number';
    const label = copyLabel(b.dataset.copyKind === 'email' ? 'email' : 'phone');
    let ok = false;
    try { ok = await copyPlainText(b.dataset.copyField); } catch (e) { ok = false; }
    b.classList.remove('is-copied', 'is-failed');
    if (!ok) { b.classList.add('is-failed'); b.setAttribute('aria-label', `Could not copy the ${kind}`); toast(`Could not copy the ${kind}.`, 'err'); return; }
    b.classList.add('is-copied'); b.setAttribute('aria-label', `${kind[0].toUpperCase()}${kind.slice(1)} copied`);
    const note = b.nextElementSibling; if (note && note.hasAttribute('data-copy-confirm')) note.hidden = false;
    toast('Copied');
    setTimeout(() => { if (!b.isConnected) return; b.classList.remove('is-copied'); b.setAttribute('aria-label', label); if (note && note.isConnected) note.hidden = true; }, 2000);
  }));
  if (!canEdit || !api || !d) return;
  const group = () => $$('[name=fileReferral]', root);
  const restore = (value) => { const els = group();
    if (!value) { els.forEach((el) => { el.checked = el.value === ''; }); return; }
    const hit = els.some((el) => el.value === value);
    els.forEach((el) => { el.checked = hit ? el.value === value : false; }); };
  group().forEach((input) => input.addEventListener('change', async () => {
    if (!input.checked) return;
    const previous = d.sourceOfBusiness || '';
    const next = input.value || '';
    const result = await applyReferralChange({ previous, next, write: async (value) => {
      const saved = await api.updateDeal(d.id, { sourceOfBusiness: value });
      return saved && saved.sourceOfBusiness != null ? saved.sourceOfBusiness : value;
    } });
    if (!result.ok) { restore(previous); toast(result.error, 'err'); return; }
    toast(result.value ? 'Source of business saved' : 'Source of business cleared');
    refresh();
  }));
}

// ---------------- Francis, Nov 3: the Qualia-style overview panels ----------------
function agentPanels(ctx, d, ov, ur, inv) {
  const { api, user, refresh, go } = ctx; const staffView = !user.accountRole && user.role !== 'Outside user';
  const urRow = (r) => html`<tr data-ur="${r.id}" data-ur-status="${r.status}"><td>${fmtDate(r.createdAt)}</td><td><strong>${r.topic}</strong>${r.note ? html`<br><span class="muted small">${r.note}</span>` : ''}${staffView ? html`<br><span class="muted small">from ${r.requestedByName} (${r.requestedRole})</span>` : ''}</td>
    <td>${r.status === 'answered' ? html`${pill('answered', 'ok')}<br>${r.response}<br><span class="muted small">${r.respondedByName}, ${fmtDate(r.respondedAt)}</span>` : ov.canAnswerUpdates ? html`<form class="inline-form" data-answer="${r.id}"><textarea name="response" rows="2" maxlength="2000" placeholder="Write the update" aria-label="Update for ${r.topic}"></textarea> <button class="m-btn" type="submit">Send update</button></form>` : pill('waiting for CLA Title', 'warn')}</td></tr>`;
  const top = html`<div class="agent-overview" data-agent-overview>
    ${ov.outstanding ? html`<div class="notice warn" data-outstanding>You have <strong>${ov.outstanding}</strong> outstanding task${ov.outstanding === 1 ? '' : 's'}. <a class="m-btn" href="${viewTasksHref(d.id, user)}" data-view-tasks>View Tasks</a></div>` : html`<div class="notice info" data-outstanding="0">No outstanding tasks for you on this order.</div>`}
    ${ov.canShareAccess ? html`<p><button class="m-btn" id="shareaccess">Share Access</button></p>` : ''}
    ${ov.canRequestUpdate ? html`<form id="requpdate" class="filter-bar" data-request-update><label>Request Update<select name="topic" required><option value="">Choose&hellip;</option>${options(ov.updateTopics, '')}</select></label>
      <label>Note (optional)<input name="note" maxlength="1000"></label><button class="m-btn" type="submit">Submit Request</button></form>` : ''}</div>`;
  const bottom = html`<div class="agent-overview-more">
    <div class="ap-grid sum-grid-ap"><fieldset class="sum-card" data-activity-panel><legend>Activity</legend>${ov.activityDeferred ? html`<p class="muted">Opens on the Activity tab.</p>` : ov.recentActivity.length ? html`<ul class="plain">${ov.recentActivity.map((a) => html`<li><span class="muted small">${fmtDate(a.createdAt)}</span> ${a.actorName}: ${a.detail}</li>`)}</ul>` : html`<p class="muted">Nothing yet.</p>`}<a href="#/deals/${d.id}/activity">All activity</a></fieldset>
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
      const m = modal('Portal invite email', html`<form id="ipf" class="form-grid"><label class="span2">Invite<select name="pid">${outside.map((p) => html`<option value="${p.contact.profileId}">${partyDisplayName(p)} (${p.role})</option>`)}</select></label>
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
      <p class="small" data-gmail-on><span class="pill info">Gmail</span> Sends from your own @clatitle.com Gmail once it is connected (Profile Setting &gt; Gmail). CLA Portal Live Test sends to test addresses only.</p></div>
      <button type="button" class="m-btn" data-email-sellers-agents ${refi ? raw('disabled title="A refinance has no sellers or agents"') : ''}>Email sellers and agents</button></div></div>`;
}
async function automationModal(api, d) {
  const g = api.getGmailStatus ? await api.getGmailStatus().catch(() => ({ connected: false })) : { connected: false };
  const on = !!(g && g.connected && g.status === 'connected');
  // one sign-off only: when the portal signature goes on the email, the built-in body leaves the name to it
  const P = await api.previewSellerAgentEmails(d.id, { portalSignature: on && hasSignature(g.signatureHtml) }); const sendable = P.messages.filter((m) => m.email);
  // John, Nov 9 (Gmail phase 1): Send goes out one email per person from the user's own Gmail through gmail-send (the server refuses non-test addresses on Live Test)
  const m = modal('Email sellers and agents', html`${on ? html`<div class="notice info" data-gmail-on-modal>Sends one email per person from <strong>${g.mailbox}</strong>. ${TEST_ALLOWLIST_NOTE}</div>`
      : html`<div class="notice warn" data-gmail-off-modal><strong>Preview only.</strong> Connect your Gmail on <a href="#/profile">Profile Setting</a> to send. Nothing has been sent.</div>`}
    <p class="small muted" data-wire-rule>${P.wireRule}</p>
    ${P.messages.length ? P.messages.map((x) => html`<div class="card preview-msg" data-preview-msg="${x.role}" data-preview-agent="${x.agent ? '1' : '0'}">
      <div class="small"><strong>To:</strong> ${x.name} &lt;${x.email || 'no email on file'}&gt; &middot; ${x.roleLabel}${x.noEmail ? html` <span class="pill bad">no email</span>` : ''}${x.email && !isAllowedTestRecipient(x.email) ? html` <span class="pill warn">not a test address: Live Test will refuse it</span>` : ''}</div>
      <div class="small"><strong>Template:</strong> <span data-preview-template>${x.template}</span>${x.fromCrm ? html` <span class="pill info">CRM template</span>` : ''}</div>
      <div class="small"><strong>Subject:</strong> <span data-preview-subject>${x.subject}</span></div>
      <pre class="preview-body" data-preview-body>${x.body}</pre>
      ${x.notes.length ? html`<ul class="small notice info" data-preview-notes>${x.notes.map((n) => html`<li>${n}</li>`)}</ul>` : ''}
      <div class="small" data-send-result="${x.participantId}"></div></div>`)
      : html`<p class="muted" data-preview-none>No sellers or agents on this order yet.</p>`}
    <div><button type="button" class="m-btn" ${on && sendable.length ? '' : raw(`disabled title="${on ? 'Nobody here has an email on file' : 'Connect Gmail first'}"`)} data-send-sellers-agents>Send (${sendable.length})</button> <button type="button" class="ghost" data-close>Close</button></div>`, { wide: true });
  const btn = $('[data-send-sellers-agents]', m);
  if (btn && on) btn.addEventListener('click', guard(async () => {
    if (!confirm(`Send ${sendable.length} email(s) from ${g.mailbox}?`)) return;
    btn.disabled = true; let sent = 0;
    for (const x of sendable) {
      const box = $(`[data-send-result="${x.participantId}"]`, m);
      try { await api.sendDealEmail({ dealId: d.id, to: [x.email], subject: x.subject, html: textToHtml(x.body), templateKey: x.agent ? 'agent-update' : 'seller-update' }); sent++; box.innerHTML = '<span class="pill ok">sent</span>'; }
      catch (e) { box.innerHTML = `<span class="pill bad">not sent</span> ${esc(e.message)}`; }
    }
    toast(`${sent} of ${sendable.length} sent`, sent === sendable.length ? 'ok' : 'err');
  }));
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
