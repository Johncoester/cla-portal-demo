// Orders list: tabs Open / Close / On Hold / Cancelled / All, search box. Same columns as the old portal.
import { html, fmtDate, pill, $, $$, raw } from '../ui.js';
import { isClient, isAgent, isProcessor, isOutside } from '../data/constants.js';

const TABS = [['Open', 'Open'], ['Closed', 'Close'], ['On Hold', 'On Hold'], ['Cancelled', 'Cancelled'], ['All', 'All Orders']];
// what each tab is called in its heading / count / empty message, so switching tabs visibly changes the page even when a tab is empty
const NOUN = { Open: 'open', Closed: 'closed', 'On Hold': 'on-hold', Cancelled: 'cancelled', All: '' };
const HEAD = { Open: 'Open Orders', Closed: 'Closed Orders', 'On Hold': 'On-Hold Orders', Cancelled: 'Cancelled Orders', All: 'All Orders' };
const SIDE = { 'Client-Buyer': 'Buyer', 'Client-Seller': 'Seller', 'Buyer Agent': 'Buyer Agent', 'Listing Agent': 'Listing Agent' };
// staff: licensee disclosure badge when a party on the order is also their own side's agent
const partyBadge = (d) => (d.agentParties && d.agentParties.length ? html` <span class="pill warn agent-party" title="${d.agentParties.map((p) => `${p.name}: ${p.label}`).join('; ')}">Agent is a party</span>` : '');

export async function render({ api, user }) {
  const q = new URLSearchParams((location.hash.split('?')[1]) || ''); const tab = TABS.some((t) => t[0] === q.get('s')) ? q.get('s') : 'Open';
  const deals = await api.listDeals({ status: tab });
  const showRole = isClient(user.role) || isAgent(user.role) || isOutside(user.role);   // outside users: their role differs per file
  const rows = deals.map((d) => html`<tr data-search="${(d.fileNumber + ' ' + d.address + ' ' + d.transactionType).toLowerCase()}">
    <td class="nowrap"><span class="bell-cell"><img src="assets/img/bell_new.png" alt=""><span class="count">${d.unread}</span></span></td>
    <td>${fmtDate(d.openDate)}</td><td>${fmtDate(d.closingDate)}</td><td>${d.fileNumber}${partyBadge(d)}</td>${showRole ? html`<td>${d.selfRep ? d.myRoleLabel : SIDE[d.myRole] || '-'}</td>` : ''}
    <td>${d.street},<br>${d.city}, ${d.state}, ${d.zip}</td>
    <td>${d.myOpenTasks ? html`<span class="action-req">Action Required</span>` : d.openTasks && !showRole ? html`<span class="muted">${d.openTasks} open task(s)</span>` : ''}</td>
    <td>${d.transactionType}</td><td>${d.stageName}${d.status !== 'Open' ? html`<br>${pill(d.status)}` : ''}<br><a class="view-btn" href="#/deals/${d.id}">View Order</a></td></tr>`);
  const body = html`
    <div class="box-title"><h2 data-tab-title><span class="h-ico"></span>${user.role === 'Transaction Coordinator' && tab === 'Open' ? 'Orders' : HEAD[tab]}</h2>
      ${isProcessor(user.role) ? html`<a class="m-btn right" href="#/orders/new">+ Place Order</a>` : ''}</div>
    <ul class="nav-tabs">${TABS.map(([k, label]) => html`<li><a class="${k === tab ? 'active' : ''}" href="#/orders?s=${encodeURIComponent(k)}" data-tab="${k}" ${k === tab ? raw('aria-current="page"') : ''}>${label}</a></li>`)}</ul>
    <div class="table-tools"><span class="muted" data-tab-count>${deals.length} ${NOUN[tab] ? NOUN[tab] + ' ' : ''}order(s)</span><label>Search: <input id="osearch" type="search" placeholder="Search orders"></label></div>
    <table class="tbl striped"><thead><tr><th></th><th>Open Date</th><th>Closing Date</th><th>File No</th>${showRole ? html`<th>Your Role</th>` : ''}<th>Property Address</th><th>Task Pending</th><th>Transaction Type</th><th>Stage</th></tr></thead>
    <tbody>${rows.length ? [...rows, html`<tr data-nomatch hidden><td colspan="9" class="muted center">No ${NOUN[tab] ? NOUN[tab] + ' ' : ''}orders match your search.</td></tr>`] : html`<tr data-empty><td colspan="9" class="muted center">No ${NOUN[tab] ? NOUN[tab] + ' ' : ''}orders.</td></tr>`}</tbody></table>`;
  return { title: 'Orders', crumbs: [['Your Orders']], body, mount(root) {
    $('#osearch', root).addEventListener('input', (e) => { const s = e.target.value.toLowerCase(); let n = 0; $$('tbody tr[data-search]', root).forEach((tr) => { tr.hidden = !tr.dataset.search.includes(s); if (!tr.hidden) n++; });
      const none = $('[data-nomatch]', root); if (none) none.hidden = n > 0 || !deals.length; });
  } };
}
