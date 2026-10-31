// Deal detail: File Overview + dispatcher to the other file tabs (tasks, inbox, documents, contacts, activity).
import { html, raw, $, $$, guard, formData, modal, closeModal, options, fmtDate, fmtMoney, pill, toast } from '../ui.js';
import { STAGES, DEAL_STATUSES, isProcessor, fmtPhone } from '../data/constants.js';
import { slotText } from './dealclosing.js';

const TABS = { tasks: './dealtasks.js', inbox: './dealmsgs.js', documents: './dealdocs.js', contacts: './dealcontacts.js', activity: './dealactivity.js', closing: './dealclosing.js', agreements: './dealagreements.js' };

export async function render(ctx) {
  const { api, params } = ctx; const tab = params.tab;
  const deal = await api.getDeal(params.id);
  // per-file roles: on this order an outside user acts as their role HERE (deal.myRole), e.g. Buyer Agent here, Client-Buyer elsewhere
  const user = ctx.user.role === 'Outside user' && deal.myRole ? { ...ctx.user, role: deal.myRole, roles: deal.myRoles || [deal.myRole], selfRep: !!deal.selfRep, accountRole: ctx.user.role } : ctx.user; ctx = { ...ctx, user };
  const here = [['Orders', '#/orders'], [deal.fileNumber, `#/deals/${deal.id}`]];
  if (tab !== 'overview' && TABS[tab]) { const mod = await import(tab === 'tasks' && params.sub ? './dealtaskform.js' : TABS[tab]); const v = await mod.render({ ...ctx, deal }); return { ...v, crumbs: [...here, ...(v.crumbs || [])] }; }
  if (tab !== 'overview') throw new Error('That page does not exist.');
  const ag = await ctx.api.listAgreements(deal.id).catch(() => ({ pending: 0 }));
  return overview(ctx, deal, here, ag);
}

// opposing side (outside viewers): the adapter sends no phone/email; say where to go instead
export const HIDDEN_CONTACT = 'Contact through CLA Title';
const person = (p) => (p ? html`<div class="person"><strong>${p.contact.firstName} ${p.contact.lastName}${p.removed ? ' (removed)' : ''}</strong>${p.contact.contactHidden ? html`<br><span class="muted contact-hidden">${HIDDEN_CONTACT}</span>` : html`<br><span class="muted">${p.contact.email}</span><br><span class="muted">${fmtPhone(p.contact.phone)}</span>`}${p.contact.company ? html`<br><span class="muted">${p.contact.company}</span>` : ''}</div>` : html`<div class="muted">Not specified</div>`);
const card = (title, inner) => html`<fieldset class="sum-card"><legend>${title}</legend>${inner}</fieldset>`;

function overview({ api, user, refresh }, d, crumbs, ag) {
  const staffView = !user.accountRole && user.role !== 'Outside user';
  const canWire = staffView || (user.roles || [user.role]).includes('Client-Buyer');   // Matt, Oct 31: buyer only (plus CLA staff)
  const sc = d.scheduledClosing;
  const by = (role) => d.participants.find((p) => p.role === role); const edit = isProcessor(user.role);
  const tracker = STAGES.map((s, i) => html`<li class="${i < d.stage ? 'done' : i === d.stage ? 'current' : ''}"><button type="button" class="step" ${edit ? '' : raw('disabled')} data-stage="${i}" title="${edit ? 'Set stage' : s}"></button><span>${s}</span></li>`);
  const team = d.participants.filter((p) => ['Sales Processor', 'Sales Person', 'Sales Team', 'Transaction Coordinator'].includes(p.role));
  const lender = d.lenderName || d.lenderContact ? html`<div><strong>${d.lenderName}</strong><br>${d.lenderContact}<br><span class="muted">${d.lenderEmail} ${fmtPhone(d.lenderPhone)}</span></div>` : html`<div class="muted">Not specified</div>`;
  const body = html`
    <div class="deal-head"><img class="home-flag" src="assets/img/order-new-icon.png" alt=""><h2>${d.street} ${d.city} ${d.state} ${d.zip}</h2><span class="order-no">Order # ${d.fileNumber}</span>${d.agentParties && d.agentParties.length ? html` <span class="pill warn agent-party">Agent is a party</span>` : ''}
      <span class="spacer"></span>${edit ? html`<select id="statussel" aria-label="Order status">${options(DEAL_STATUSES, d.status)}</select>` : pill(d.status, d.status === 'Open' ? 'ok' : '')}</div>
    ${d.agentParties && d.agentParties.length ? html`<div class="notice warn" data-agent-party><strong>Agent is a party.</strong> ${d.agentParties.map((p) => `${p.name} is the ${p.label}`).join('; ')} on this file (a licensee buying or selling for themselves). Make sure the licensee disclosure is on file.</div>` : ''}
    ${d.selfRep ? html`<div class="notice info" data-self-rep>You are the <strong>${d.myRoleLabel}</strong> on this file. Your tasks as the client and as the agent are in one list; the history records which capacity you acted in.</div>` : ''}
    ${sc ? html`<div class="notice info" data-scheduled-closing><strong>Closing scheduled:</strong> ${slotText(sc.at)} &middot; ${sc.location}${sc.note ? html` &middot; ${sc.note}` : ''} <a href="#/deals/${d.id}/closing">details</a></div>` : ''}
    ${ag && ag.pending ? html`<div class="notice warn" data-agreements-pending>You have <strong>${ag.pending}</strong> agreement(s) to read and acknowledge (including the Wire Fraud Warning). <a href="#/deals/${d.id}/agreements">Open Agreements</a></div>` : ''}
    <div class="box-title"><h2><span class="h-ico"></span>Overview</h2>${canWire ? html`<button class="m-btn right" id="wirebtn">Wire instructions</button>` : ''}${d.unread ? html`<a class="new-msg" href="#/deals/${d.id}/inbox">${d.unread} new message(s)</a>` : ''}</div>
    <ol class="tracker">${tracker}</ol>${edit ? html`<p class="muted small">Click a step to set the stage. The last step closes the order.</p>` : ''}
    <div class="keybar"><div><strong>${fmtDate(d.openDate)}</strong><span>Open Date</span></div><div><strong>${fmtMoney(d.purchasePrice) || '\u2014'}</strong><span>Purchase Price</span></div>
      <div><strong>${fmtMoney(d.loanAmount) || '\u2014'}</strong><span>Loan Amount</span></div><div><strong>${fmtDate(d.closingDate) || '\u2014'}</strong><span>Settlement Date</span></div>
      ${edit ? html`<button class="icon-edit" id="editdeal" title="Edit order details">&#9998;</button>` : ''}</div>
    <div class="box-title"><h2><span class="h-ico"></span>Summary</h2></div>
    <div class="sum-grid">${card('Buyer Information', person(by('Client-Buyer')))}${card('Seller Information', person(by('Client-Seller')))}
      ${card('Buyer Agent Representation', person(by('Buyer Agent')))}${card('Listing Agent Representation', person(by('Listing Agent')))}
      ${card('Lender Information', lender)}${card('CLA Title Information', html`<div>Processor: <strong>${d.processorName}</strong><br>Sales person: ${d.salesPersonName || 'Not specified'}<br>${team.filter((p) => p.role === 'Transaction Coordinator').map((p) => html`Transaction coordinator: ${p.contact.firstName} ${p.contact.lastName}<br>`)}</div>`)}</div>
    ${d.notes ? html`<div class="card"><h3>Notes</h3><p>${d.notes}</p></div>` : ''}
    <div class="box-title"><h2><span class="h-ico"></span>Order Contacts</h2><a class="ghost right" href="#/deals/${d.id}/contacts">All contacts</a></div>
    <table class="tbl striped"><thead><tr><th>Name</th><th>Role</th><th>Phone</th><th>Email</th></tr></thead><tbody>${d.participants.map((p) => html`<tr><td>${p.contact.firstName} ${p.contact.lastName}${p.removed ? html` ${pill('removed', 'bad')}` : ''}</td><td>${p.role}</td>${p.contact.contactHidden ? html`<td colspan="2" class="muted contact-hidden">${HIDDEN_CONTACT}</td>` : html`<td>${fmtPhone(p.contact.phone)}</td><td>${p.contact.email}</td>`}</tr>`)}</tbody></table>`;
  return { title: d.fileNumber, crumbs: [...crumbs, ['Order Details']], body, mount(root) {
    $$('.step', root).forEach((b) => b.addEventListener('click', guard(async () => { await api.setStage(d.id, b.dataset.stage); toast('Stage updated'); refresh(); })));
    const ss = $('#statussel', root); if (ss) ss.addEventListener('change', guard(async () => { await api.setDealStatus(d.id, ss.value); toast('Status updated'); refresh(); }));
    const eb = $('#editdeal', root); if (eb) eb.addEventListener('click', () => editModal(api, d, refresh));
    const wb = $('#wirebtn', root); if (wb) wb.addEventListener('click', guard(() => wireModal(api, d)));
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

function editModal(api, d, refresh) {
  const v = (k) => d[k] == null ? '' : d[k];
  const m = modal('Edit order details', html`<form id="edf" class="form-grid">
    <label class="span2">Street<input name="street" required value="${v('street')}"></label><label>City<input name="city" required value="${v('city')}"></label>
    <label>State<input name="state" required maxlength="2" value="${v('state')}"></label><label>ZIP<input name="zip" value="${v('zip')}"></label>
    <label>Closing date<input type="date" name="closingDate" value="${v('closingDate')}"></label>
    <label>Purchase price<input name="purchasePrice" value="${v('purchasePrice')}"></label><label>Loan amount<input name="loanAmount" value="${v('loanAmount')}"></label>
    <h4 class="span2">Lender</h4><label>Company<input name="lenderName" value="${v('lenderName')}"></label><label>Contact<input name="lenderContact" value="${v('lenderContact')}"></label>
    <label>Email<input name="lenderEmail" value="${v('lenderEmail')}"></label><label>Phone<input name="lenderPhone" type="tel" inputmode="tel" placeholder="xxx-xxx-xxxx" data-phone value="${v('lenderPhone')}"></label>
    <label class="span2">Notes<textarea name="notes" rows="3">${v('notes')}</textarea></label>
    <div class="span2"><button class="m-btn" type="submit">Save</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`, { wide: true });
  $('#edf', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); await api.updateDeal(d.id, formData(e.target)); closeModal(); toast('Order saved'); refresh(); }));
}
