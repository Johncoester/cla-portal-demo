// Orders list: tabs Open / Close / On Hold / Cancelled / All, search box. Same columns as the old portal.
import { html, fmtDate, pill, $, $$, raw, options } from '../ui.js?v=202611061730';
import { runsOrders, isClient, isAgent, isProcessor, isOutside, TX_TYPES } from '../data/constants.js?v=202611061730';
import { filterDeals, sortDeals, DEAL_SORT_DIR } from '../data/task-board.js?v=202611061730';

const TABS = [['Open', 'Open'], ['Closed', 'Close'], ['On Hold', 'On Hold'], ['Cancelled', 'Cancelled'], ['All', 'All Orders']];
// what each tab is called in its heading / count / empty message, so switching tabs visibly changes the page even when a tab is empty
const NOUN = { Open: 'open', Closed: 'closed', 'On Hold': 'on-hold', Cancelled: 'cancelled', All: '' };
const HEAD = { Open: 'Open Orders', Closed: 'Closed Orders', 'On Hold': 'On-Hold Orders', Cancelled: 'Cancelled Orders', All: 'All Orders' };
const SIDE = { 'Client-Buyer': 'Buyer', 'Client-Seller': 'Seller', 'Buyer Agent': 'Buyer Agent', 'Listing Agent': 'Listing Agent' };
// staff: licensee disclosure badge when a party on the order is also their own side's agent
// Matt, Nov 3: sorting moved to the column headers (click = sort, click again = reverse; the lit arrow shows the direction). Replaces the Sort by / Order dropdowns.
const COLS = [['openDate', 'Open Date'], ['closingDate', 'Closing Date'], ['fileNumber', 'File No'], ['role', 'Your Role'], ['address', 'Property Address'], ['tasks', 'Task Pending'], ['txType', 'Transaction Type'], ['status', 'Stage']];
const partyBadge = (d) => (d.agentParties && d.agentParties.length ? html` <span class="pill warn agent-party" title="${d.agentParties.map((p) => `${p.name}: ${p.label}`).join('; ')}">Agent is a party</span>` : '');

export async function render({ api, user }) {
  const q = new URLSearchParams((location.hash.split('?')[1]) || ''); const tab = TABS.some((t) => t[0] === q.get('s')) ? q.get('s') : 'Open';
  const deals = await api.listDeals({ status: tab });
  const showRole = isClient(user.role) || isAgent(user.role) || isOutside(user.role);   // outside users: their role differs per file
  const rows = deals.map((d) => html`<tr data-deal="${d.id}" data-search="${(d.fileNumber + ' ' + d.address + ' ' + (d.county || '') + ' ' + (d.fileTitle || '') + ' ' + d.transactionType).toLowerCase()}">
    <td class="nowrap"><span class="bell-cell"><img src="assets/img/bell_new.png" alt=""><span class="count">${d.unread}</span></span></td>
    <td>${fmtDate(d.openDate)}</td><td>${fmtDate(d.closingDate)}</td><td>${d.fileNumber}${d.fileTitle ? html` <br><span class="muted small" data-file-title>${d.fileTitle}</span>` : ''}${partyBadge(d)}</td>${showRole ? html`<td>${d.selfRep ? d.myRoleLabel : SIDE[d.myRole] || '-'}</td>` : ''}
    <td>${d.street},<br>${d.city}, ${d.state}, ${d.zip}</td>
    <td>${d.myOpenTasks ? html`<span class="action-req">Action Required</span>` : d.openTasks && !showRole ? html`<span class="muted">${d.openTasks} open task(s)</span>` : ''}${d.overdueTasks && !showRole ? html`<br>${pill(d.overdueTasks + ' overdue', 'bad')}` : ''}</td>
    <td>${d.transactionType}</td><td>${d.stageName}${d.status !== 'Open' ? html`<br>${pill(d.status)}` : ''}<br><a class="view-btn" href="#/deals/${d.id}">View Order</a></td></tr>`);
  const body = html`
    <div class="box-title"><h2 data-tab-title><span class="h-ico"></span>${user.role === 'Transaction Coordinator' && tab === 'Open' ? 'Orders' : HEAD[tab]}</h2>
      ${runsOrders(user) ? html`<a class="m-btn right" href="#/orders/new">+ Place Order</a>` : ''}</div>
    <ul class="nav-tabs">${TABS.map(([k, label]) => html`<li><a class="${k === tab ? 'active' : ''}" href="#/orders?s=${encodeURIComponent(k)}" data-tab="${k}" ${k === tab ? raw('aria-current="page"') : ''}>${label}</a></li>`)}</ul>
    <div class="table-tools"><span class="muted" data-tab-count>${deals.length} ${NOUN[tab] ? NOUN[tab] + ' ' : ''}order(s)</span><span class="muted" data-filter-count></span></div>
    <form class="filter-bar" id="ofilters">
      <label>Search<input id="osearch" name="q" type="search" placeholder="File no, address, name"></label>
      <label>Closing from<input type="date" name="closingFrom"></label><label>Closing to<input type="date" name="closingTo"></label>
      <label>${showRole ? 'Your role' : 'Parties'}<select name="role"><option value="">Any</option>${showRole ? options(Object.keys(SIDE), '', (r) => SIDE[r]) : html`<option value="agent-party">Agent is a party</option>`}</select></label>
      <label>Type<select name="txType"><option value="">Any</option>${options(TX_TYPES, '')}</select></label>
      <label>Overdue tasks<select name="overdue"><option value="">Any</option><option value="on">Has overdue tasks</option></select></label>
      <label>Closing date<select name="noClosing"><option value="">Any</option><option value="on">Not set yet</option></select></label></form>
    <table class="tbl striped" id="otable"><thead><tr><th></th>${COLS.filter(([k]) => showRole || k !== 'role').map(([k, label]) => html`<th data-sort="${k}" ${k === 'openDate' ? raw('aria-sort="descending"') : ''}><button type="button" class="th-sort" title="Sort by ${label}">${label} <span class="sort-arrows" aria-hidden="true"><span class="up">&#9650;</span><span class="dn ${k === 'openDate' ? 'on' : ''}">&#9660;</span></span></button></th>`)}</tr></thead>
    <tbody>${rows.length ? [...rows, html`<tr data-nomatch hidden><td colspan="9" class="muted center">No ${NOUN[tab] ? NOUN[tab] + ' ' : ''}orders match your search.</td></tr>`] : html`<tr data-empty><td colspan="9" class="muted center">No ${NOUN[tab] ? NOUN[tab] + ' ' : ''}orders.</td></tr>`}</tbody></table>`;
  return { title: 'Orders', crumbs: [['Your Orders']], body, mount(root) {
    // Matt, Nov 2: filters + sort run in the browser on the orders already loaded for this tab (task-board.js filterDeals / sortDeals)
    const form = $('#ofilters', root); const tbody = $('tbody', root); let sort = 'openDate'; let dir = 'desc';
    const marks = () => $$('th[data-sort]', root).forEach((th) => { const on = th.dataset.sort === sort; if (on) th.setAttribute('aria-sort', dir === 'asc' ? 'ascending' : 'descending'); else th.removeAttribute('aria-sort');
      $('.up', th).classList.toggle('on', on && dir === 'asc'); $('.dn', th).classList.toggle('on', on && dir === 'desc'); });
    const apply = () => { const f = new FormData(form); const flt = { q: f.get('q'), closingFrom: f.get('closingFrom'), closingTo: f.get('closingTo'), role: f.get('role'), txType: f.get('txType'),
        overdue: f.get('overdue') === 'on', noClosing: f.get('noClosing') === 'on' };
      const vis = new Set(filterDeals(deals, flt).map((d) => d.id)); const none = $('[data-nomatch]', root);
      sortDeals(deals, sort, dir).forEach((d) => { const tr = $(`tr[data-deal="${d.id}"]`, tbody); if (tr) { tbody.insertBefore(tr, none); tr.hidden = !vis.has(d.id); } });
      if (none) none.hidden = vis.size > 0 || !deals.length;
      const fc = $('[data-filter-count]', root); fc.textContent = vis.size === deals.length ? '' : `${vis.size} shown`; };
    form.addEventListener('submit', (e) => e.preventDefault()); form.addEventListener('input', apply); form.addEventListener('change', apply);
    $$('th[data-sort] button', root).forEach((b) => b.addEventListener('click', () => { const k = b.closest('th').dataset.sort;
      dir = k === sort ? (dir === 'asc' ? 'desc' : 'asc') : (DEAL_SORT_DIR[k] || 'asc'); sort = k; marks(); apply(); }));
  } };
}
