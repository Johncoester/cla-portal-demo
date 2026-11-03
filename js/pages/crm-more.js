// crm-more.js : CRM pipeline (Kanban + list), My follow-ups, Reports (John, Nov 2). Function only, minimal styling.
import { html, raw, $, $$, guard, formData, toast, fmtDate, fmtMoney, modal, closeModal, pill } from '../ui.js?v=202611022019';
import { localDate } from '../data/constants.js?v=202611022019';
import { OPP_STAGES, CRM_STAGES, crmSort } from '../data/crm.js?v=202611022019';
import { tabs, head, sel, pairs, ownerSel, ctype, money, downloadCsv, activityPanel } from './crm-kit.js?v=202611022019';

const crumbs = (label) => [['CRM', '#/crm'], [label]];
const q = () => new URLSearchParams(location.hash.split('?')[1] || '');

// ---------------- PIPELINE: opportunities (referral partners being won) or partners (contacts by CRM stage); board or list ----------------
export async function pipelinePage({ api, me, owners, refresh, go }) {
  const p = q(); const board = p.get('board') === 'partners' ? 'partners' : 'opps'; const view = p.get('view') === 'list' ? 'list' : 'board'; const owner = p.get('owner') || '';
  const stages = board === 'opps' ? OPP_STAGES.map((s) => [s, s]) : [...CRM_STAGES, ['', 'Not set']];
  let items = board === 'opps' ? await api.listCrmOpportunities() : (await api.listCrmContacts()).map((c) => ({ ...c, stage: c.stage || '' }));
  items = items.filter((i) => !i.archived && (!owner || (owner === 'none' ? !i.ownerId : i.ownerId === owner)));
  const contacts = board === 'opps' && me.canEdit ? (await api.listCrmContacts()).filter((c) => !c.archived) : []; const accounts = board === 'opps' && me.canEdit ? (await api.listCrmAccounts()).filter((a) => !a.archived) : [];
  const url = (o) => { const n = new URLSearchParams({ board, view, owner, ...o }); [...n.keys()].forEach((k) => { if (!n.get(k)) n.delete(k); }); return '#/crm/pipeline?' + n; };
  const mover = (i) => (me.canEdit ? html`<label class="small">Move to <select data-move="${i.id}">${stages.map(([v, l]) => html`<option value="${v}" ${v === i.stage ? raw('selected') : ''}>${l}</option>`)}</select></label>` : '');
  const sub = (i) => (board === 'opps' ? html`${i.accountName || ''}${i.contactName ? html`${i.accountName ? ' · ' : ''}${i.contactName}` : ''}${i.estVolume ? html`<br>Est. ${fmtMoney(i.estVolume)}/yr` : ''}${i.expectedClose ? html` · by ${fmtDate(i.expectedClose)}` : ''}`
    : html`${ctype(i.contactType)}${i.accountName ? html` · ${i.accountName}` : ''}<br>${i.orders} order(s), ${money(i.volume)}`);
  const title = (i) => (board === 'opps' ? html`<strong>${i.name}</strong>` : html`<a href="#/crm/contacts/${i.id}"><strong>${i.name}</strong></a>`);
  const total = (list) => (board === 'opps' ? fmtMoney(list.reduce((n, i) => n + (Number(i.estVolume) || 0), 0)) : `${list.reduce((n, i) => n + i.orders, 0)} orders`);
  const boardHtml = html`<div class="kanban" data-board="${board}">${stages.map(([v, l]) => { const list = crmSort(items.filter((i) => (i.stage || '') === v), 'name');
    return html`<section class="kanban-col" data-stage="${v}"><h4>${l} <span class="muted small">(${list.length} · ${total(list)})</span></h4>
      ${list.map((i) => html`<div class="kanban-card" data-card="${i.id}">${title(i)}<div class="small">${sub(i)}</div><div class="muted small">${i.ownerName || 'Unassigned'}</div>${mover(i)}</div>`)}</section>`; })}</div>`;
  const listHtml = html`<table class="tbl" data-pipeline-list><thead><tr><th>${board === 'opps' ? 'Opportunity' : 'Partner'}</th><th>Details</th><th>Owner</th><th>Stage</th></tr></thead><tbody>
    ${crmSort(items, 'name').map((i) => html`<tr data-card="${i.id}"><td>${title(i)}</td><td class="small">${sub(i)}</td><td>${i.ownerName || 'Unassigned'}</td><td>${me.canEdit ? mover(i) : (stages.find(([v]) => v === i.stage) || [, ''])[1]}</td></tr>`)}</tbody></table>`;
  const body = html`${head('CRM: Pipeline', me, me.canEdit && board === 'opps' ? html`<button class="m-btn right" data-new-opp>+ New opportunity</button>` : '')}${tabs('pipeline')}
    <div class="filter-bar"><span>Board: <a class="${board === 'opps' ? 'active-link' : ''}" href="${url({ board: 'opps' })}" data-board-link="opps">Opportunities</a> · <a class="${board === 'partners' ? 'active-link' : ''}" href="${url({ board: 'partners' })}" data-board-link="partners">Referral partners (contacts by CRM stage)</a></span>
      <span>View: <a href="${url({ view: 'board' })}" data-view-link="board">Board</a> · <a href="${url({ view: 'list' })}" data-view-link="list">List</a></span>
      <label>Owner<select data-pipe-owner><option value="">Any owner</option><option value="none" ${owner === 'none' ? raw('selected') : ''}>Unassigned</option>${owners.map((o) => html`<option value="${o.id}" ${o.id === owner ? raw('selected') : ''}>${o.name}</option>`)}</select></label></div>
    ${view === 'board' ? boardHtml : listHtml}`;
  return { title: 'CRM Pipeline', crumbs: crumbs('Pipeline'), body, mount(root) {
    $('[data-pipe-owner]', root).addEventListener('change', (e) => { location.hash = url({ owner: e.target.value }); });
    $$('[data-move]', root).forEach((s) => s.addEventListener('change', guard(async () => {
      if (board === 'opps') await api.moveCrmOpportunity(s.dataset.move, s.value); else await api.updateCrmContact(s.dataset.move, { stage: s.value });
      toast('Moved to ' + (stages.find(([v]) => v === s.value) || [, 'Not set'])[1]); refresh(); })));
    const nb = $('[data-new-opp]', root); if (nb) nb.addEventListener('click', () => {
      const m = modal('New opportunity', html`<form id="opp-form" class="form-grid"><label class="span2">Name *<input name="name" required maxlength="160" placeholder="e.g. Harbor Realty: monthly referrals"></label>
        <label>Contact${sel('contactId', contacts.map((c) => [c.id, c.name]), '', '(none)')}</label><label>Account${sel('accountId', accounts.map((a) => [a.id, a.name]), '', '(none)')}</label>
        <label>Stage${sel('stage', pairs(OPP_STAGES), 'New')}</label><label>Owner${ownerSel(owners, me.isAdmin ? '' : me.id)}</label>
        <label>Estimated yearly volume ($)<input name="estVolume" inputmode="decimal"></label><label>Expected close<input name="expectedClose" type="date"></label>
        <div class="span2"><button class="m-btn" type="submit">Create opportunity</button> <button class="ghost" type="button" data-close>Cancel</button></div></form>`, { wide: true });
      $('#opp-form', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); await api.createCrmOpportunity(formData(e.target)); closeModal(); toast('Opportunity created'); refresh(); }));
    }); } };
}

// ---------------- MY FOLLOW-UPS: open (or done) tasks per owner, overdue first ----------------
export async function followupsPage({ api, me, owners, refresh }) {
  const p = q(); const owner = p.get('owner') || me.id; const status = ['open', 'done', 'cancelled', 'all'].includes(p.get('status')) ? p.get('status') : 'open';
  const rows = await api.listCrmFollowUps({ ownerId: owner, status }); const overdue = rows.filter((r) => r.overdue).length;
  const url = (o) => '#/crm/followups?' + new URLSearchParams({ owner, status, ...o });
  const body = html`${head('CRM: My follow-ups', me)}${tabs('followups')}
    <div class="filter-bar"><label>Owner<select data-fu-owner><option value="${me.id}">Me</option>${owners.filter((o) => o.id !== me.id).map((o) => html`<option value="${o.id}" ${o.id === owner ? raw('selected') : ''}>${o.name}</option>`)}<option value="all" ${owner === 'all' ? raw('selected') : ''}>Everyone I can see</option></select></label>
      <label>Status<select data-fu-status>${[['open', 'Open'], ['done', 'Done'], ['cancelled', 'Cancelled'], ['all', 'All']].map(([v, l]) => html`<option value="${v}" ${v === status ? raw('selected') : ''}>${l}</option>`)}</select></label></div>
    <p data-fu-summary><strong>${rows.length}</strong> follow-up(s)${status === 'open' ? html`, <strong class="${overdue ? 'err-text' : ''}">${overdue} overdue</strong>` : ''}.</p>
    <table class="tbl" data-followups><thead><tr><th>Due</th><th>Follow-up</th><th>On</th><th>Owner</th><th>Status</th></tr></thead><tbody>
    ${rows.length ? rows.map((a) => html`<tr data-act="${a.id}" class="${a.overdue ? 'overdue' : ''}"><td>${fmtDate(a.dueDate)}</td><td><strong>${a.subject}</strong>${a.body ? html`<br><span class="small">${a.body}</span>` : ''}</td>
      <td><a href="${a.parentLink}">${a.parentName}</a> <span class="muted small">(${a.entity})</span></td><td>${a.ownerName}</td>
      <td>${a.status === 'open' ? (a.overdue ? pill('Overdue', 'bad') : pill('Open')) : pill(a.status === 'done' ? 'Done' : 'Cancelled')}${me.canEdit && a.status === 'open' ? html` <button class="ghost" data-done="${a.id}">Done</button>` : ''}</td></tr>`)
      : html`<tr><td colspan="5" class="muted">No follow-ups.</td></tr>`}</tbody></table>`;
  return { title: 'CRM Follow-ups', crumbs: crumbs('My follow-ups'), body, mount(root) {
    $('[data-fu-owner]', root).addEventListener('change', (e) => { location.hash = url({ owner: e.target.value }); });
    $('[data-fu-status]', root).addEventListener('change', (e) => { location.hash = url({ status: e.target.value }); });
    $$('[data-done]', root).forEach((b) => b.addEventListener('click', guard(async () => { await api.updateCrmActivity(b.dataset.done, { status: 'done' }); toast('Follow-up done'); refresh(); }))); } };
}

// ---------------- REPORTS (order open-date range) + CSV export ----------------
const ORDER_COLS = (first) => [['name', first], ['orders', 'Orders'], ['open', 'Open'], ['closed', 'Closed'], ['cancelled', 'Cancelled'], ['volume', 'Volume ($)']];
export async function reportsPage({ api, me }) {
  const p = q(); const from = p.get('from') || ''; const to = p.get('to') || ''; const r = await api.crmReport({ from, to });
  const tables = [
    ['by-realtor', 'Orders and volume by realtor', [['name', 'Realtor'], ['company', 'Brokerage'], ...ORDER_COLS('').slice(1)], r.byRealtor],
    ['by-lender', 'Orders and volume by lender', [['name', 'Lender'], ['company', 'Company'], ...ORDER_COLS('').slice(1)], r.byLender],
    ['by-brokerage', 'Orders and volume by brokerage', ORDER_COLS('Brokerage'), r.byBrokerage],
    ['by-salesperson', 'Orders and volume by salesperson', ORDER_COLS('Salesperson'), r.bySalesperson],
    ['leads-by-source', 'Leads by source (created in the range)', [['name', 'Source'], ['leads', 'Leads'], ['converted', 'Converted']], r.leadsBySource],
    ['leads-by-status', 'Leads by status (created in the range)', [['name', 'Status'], ['leads', 'Leads'], ['converted', 'Converted']], r.leadsByStatus]];
  const cell = (k, v) => (k === 'volume' ? fmtMoney(v) : v ?? '');
  const body = html`${head('CRM: Reports', me)}${tabs('reports')}
    <form class="filter-bar" id="rep-form"><label>Order open date from<input type="date" name="from" value="${from}"></label><label>to<input type="date" name="to" value="${to}"></label>
      <button class="m-btn" type="submit">Run</button> <a class="ghost" href="#/crm/reports">All dates</a></form>
    <p data-rep-totals>${from || to ? `Orders opened ${from ? 'from ' + fmtDate(from) : ''} ${to ? 'to ' + fmtDate(to) : ''}` : 'All orders'}: <strong>${r.totals.orders}</strong> (${r.totals.open} open, ${r.totals.closed} closed, ${r.totals.cancelled} cancelled), volume <strong>${fmtMoney(r.totals.volume)}</strong>. Leads: ${r.leadCount}.
      <span class="muted small">Orders = the orders you can see in the portal. Volume = purchase price of orders that are not cancelled. An order counts once for each realtor / lender / brokerage / salesperson on it.</span></p>
    ${tables.map(([id, label, cols, rows]) => html`<div class="card" data-report="${id}"><h3>${label} <button class="ghost right" data-csv="${id}">Export CSV</button></h3>
      <table class="tbl"><thead><tr>${cols.map(([, l]) => html`<th>${l}</th>`)}</tr></thead><tbody>${rows.length ? rows.map((row) => html`<tr>${cols.map(([k]) => html`<td>${cell(k, row[k])}</td>`)}</tr>`) : html`<tr><td colspan="${cols.length}" class="muted">No data in this range.</td></tr>`}</tbody></table></div>`)}`;
  return { title: 'CRM Reports', crumbs: crumbs('Reports'), body, mount(root) {
    $('#rep-form', root).addEventListener('submit', (e) => { e.preventDefault(); const f = formData(e.target); location.hash = '#/crm/reports?' + new URLSearchParams(Object.fromEntries(Object.entries(f).filter(([, v]) => v))); });
    $$('[data-csv]', root).forEach((b) => b.addEventListener('click', () => { const [id, , cols, rows] = tables.find((t) => t[0] === b.dataset.csv);
      downloadCsv(`crm-${id}${from ? '-from-' + from : ''}${to ? '-to-' + to : ''}.csv`, cols, rows); toast('CSV downloaded'); })); } };
}
