// Deal detail: File Overview + dispatcher to the other file tabs (tasks, inbox, documents, contacts, activity).
import { html, raw, $, $$, guard, formData, modal, closeModal, options, fmtDate, fmtMoney, pill, toast } from '../ui.js';
import { STAGES, DEAL_STATUSES, isProcessor } from '../data/constants.js';

const TABS = { tasks: './dealtasks.js', inbox: './dealmsgs.js', documents: './dealdocs.js', contacts: './dealcontacts.js', activity: './dealactivity.js' };

export async function render(ctx) {
  const { api, user, params } = ctx; const tab = params.tab;
  const deal = await api.getDeal(params.id);
  const here = [['Orders', '#/orders'], [deal.fileNumber, `#/deals/${deal.id}`]];
  if (tab !== 'overview' && TABS[tab]) { const mod = await import(TABS[tab]); const v = await mod.render({ ...ctx, deal }); return { ...v, crumbs: [...here, ...(v.crumbs || [])] }; }
  if (tab !== 'overview') throw new Error('That page does not exist.');
  return overview(ctx, deal, here);
}

const person = (p) => (p ? html`<div class="person"><strong>${p.contact.firstName} ${p.contact.lastName}</strong><br><span class="muted">${p.contact.email}</span><br><span class="muted">${p.contact.phone}</span>${p.contact.company ? html`<br><span class="muted">${p.contact.company}</span>` : ''}</div>` : html`<div class="muted">Not specified</div>`);
const card = (title, inner) => html`<fieldset class="sum-card"><legend>${title}</legend>${inner}</fieldset>`;

function overview({ api, user, refresh }, d, crumbs) {
  const by = (role) => d.participants.find((p) => p.role === role); const edit = isProcessor(user.role);
  const tracker = STAGES.map((s, i) => html`<li class="${i < d.stage ? 'done' : i === d.stage ? 'current' : ''}"><button type="button" class="step" ${edit ? '' : raw('disabled')} data-stage="${i}" title="${edit ? 'Set stage' : s}"></button><span>${s}</span></li>`);
  const team = d.participants.filter((p) => ['Sales Processor', 'Sales Person', 'Sales Team', 'Transaction Coordinator'].includes(p.role));
  const lender = d.lenderName || d.lenderContact ? html`<div><strong>${d.lenderName}</strong><br>${d.lenderContact}<br><span class="muted">${d.lenderEmail} ${d.lenderPhone}</span></div>` : html`<div class="muted">Not specified</div>`;
  const body = html`
    <div class="deal-head"><img class="home-flag" src="assets/img/order-new-icon.png" alt=""><h2>${d.street} ${d.city} ${d.state} ${d.zip}</h2><span class="order-no">Order # ${d.fileNumber}</span>
      <span class="spacer"></span>${edit ? html`<select id="statussel" aria-label="Order status">${options(DEAL_STATUSES, d.status)}</select>` : pill(d.status, d.status === 'Open' ? 'ok' : '')}</div>
    <div class="box-title"><h2><span class="h-ico"></span>Overview</h2>${d.unread ? html`<a class="new-msg" href="#/deals/${d.id}/inbox">${d.unread} new message(s)</a>` : ''}</div>
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
    <table class="tbl striped"><thead><tr><th>Name</th><th>Role</th><th>Phone</th><th>Email</th></tr></thead><tbody>${d.participants.map((p) => html`<tr><td>${p.contact.firstName} ${p.contact.lastName}</td><td>${p.role}</td><td>${p.contact.phone}</td><td>${p.contact.email}</td></tr>`)}</tbody></table>`;
  return { title: d.fileNumber, crumbs: [...crumbs, ['Order Details']], body, mount(root) {
    $$('.step', root).forEach((b) => b.addEventListener('click', guard(async () => { await api.setStage(d.id, b.dataset.stage); toast('Stage updated'); refresh(); })));
    const ss = $('#statussel', root); if (ss) ss.addEventListener('change', guard(async () => { await api.setDealStatus(d.id, ss.value); toast('Status updated'); refresh(); }));
    const eb = $('#editdeal', root); if (eb) eb.addEventListener('click', () => editModal(api, d, refresh));
  } };
}

function editModal(api, d, refresh) {
  const v = (k) => d[k] == null ? '' : d[k];
  const m = modal('Edit order details', html`<form id="edf" class="form-grid">
    <label class="span2">Street<input name="street" required value="${v('street')}"></label><label>City<input name="city" required value="${v('city')}"></label>
    <label>State<input name="state" required maxlength="2" value="${v('state')}"></label><label>ZIP<input name="zip" value="${v('zip')}"></label>
    <label>Closing date<input type="date" name="closingDate" value="${v('closingDate')}"></label>
    <label>Purchase price<input name="purchasePrice" value="${v('purchasePrice')}"></label><label>Loan amount<input name="loanAmount" value="${v('loanAmount')}"></label>
    <h4 class="span2">Lender</h4><label>Company<input name="lenderName" value="${v('lenderName')}"></label><label>Contact<input name="lenderContact" value="${v('lenderContact')}"></label>
    <label>Email<input name="lenderEmail" value="${v('lenderEmail')}"></label><label>Phone<input name="lenderPhone" value="${v('lenderPhone')}"></label>
    <label class="span2">Notes<textarea name="notes" rows="3">${v('notes')}</textarea></label>
    <div class="span2"><button class="m-btn" type="submit">Save</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`, { wide: true });
  $('#edf', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); await api.updateDeal(d.id, formData(e.target)); closeModal(); toast('Order saved'); refresh(); }));
}
