// crm-more.js : CRM pipeline (Kanban + list) and Reports (John, Nov 2; follow-ups moved to CRM Home tasks). Function only, minimal styling.
import { html, raw, $, $$, guard, formData, toast, fmtDate, fmtMoney, modal, closeModal, pill } from '../ui.js?v=202611100245';
import { localDate } from '../data/constants.js?v=202611100245';
import { OPP_STAGES, RELATIONSHIP_STATUSES, crmSort, inLocalRange } from '../data/crm.js?v=202611100230';
import { tabs, head, sel, pairs, ownerSel, ctype, money, downloadCsv } from './crm-kit.js?v=202611100700';
import { optionsOf, defaultOption, activeFields } from '../data/crm-config.js?v=202611100700';
import { optSel, cfInputs, cfValue } from './crm-custom.js?v=202611100700';
import { wireCompose } from './crm-templates.js?v=202611100700';

const crumbs = (label) => [['CRM', '#/crm'], [label]];
const q = () => new URLSearchParams(location.hash.split('?')[1] || '');

// ---------------- PIPELINE: opportunities (referral partners being won) or partners (clients by Relationship Status); board or list ----------------
export async function pipelinePage({ api, me, owners, refresh, go, cfg }) {
  const p = q(); const board = p.get('board') === 'partners' ? 'partners' : 'opps'; const view = p.get('view') === 'list' ? 'list' : 'board'; const owner = p.get('owner') || '';
  // columns = the configured list in its order (CRM Settings). A retired stage / status keeps its column while records still use it; values no longer in the list get one too.
  let items = board === 'opps' ? await api.listCrmOpportunities() : (await api.listCrmContacts()).map((c) => ({ ...c, stage: c.relationshipStatus || '' }));
  const createdFrom = p.get('createdFrom') || ''; const createdTo = p.get('createdTo') || ''; const modifiedFrom = p.get('modifiedFrom') || ''; const modifiedTo = p.get('modifiedTo') || '';
  const extraFrom = p.get('extraFrom') || ''; const extraTo = p.get('extraTo') || '';
  items = items.filter((i) => !i.archived && (!owner || (owner === 'none' ? !i.ownerId : i.ownerId === owner))
    && inLocalRange(i.createdAt, createdFrom, createdTo) && inLocalRange(i.modifiedAt, modifiedFrom, modifiedTo)
    && inLocalRange(board === 'opps' ? i.expectedClose : (i.lastContactedOn || i.lastActivityAt), extraFrom, extraTo));
  const listKey = board === 'opps' ? 'oppStage' : 'relationshipStatus';
  const used = new Set(items.map((i) => i.stage || ''));
  const stages = [...optionsOf(cfg, listKey).filter((o) => !o.retired || used.has(o.value)).map((o) => [o.value, o.retired ? `${o.label} (retired)` : o.label, o.retired]),
    ...[...used].filter((v) => v && !optionsOf(cfg, listKey).some((o) => o.value === v)).map((v) => [v, v, true]), ...(board === 'opps' ? [] : [['', 'Not set', true]])];
  const contacts = board === 'opps' && me.canEdit ? (await api.listCrmContacts()).filter((c) => !c.archived) : []; const accounts = board === 'opps' && me.canEdit ? (await api.listCrmAccounts()).filter((a) => !a.archived) : [];
  const url = (o) => { const n = new URLSearchParams({ board, view, owner, createdFrom, createdTo, modifiedFrom, modifiedTo, extraFrom, extraTo, ...o }); [...n.keys()].forEach((k) => { if (!n.get(k)) n.delete(k); }); return '#/crm/pipeline?' + n; };
  const mover = (i) => (me.canEdit ? html`<label class="small">Move to <select data-move="${i.id}">${stages.filter(([v, , ret]) => (v && !ret) || v === (i.stage || '')).map(([v, l]) => html`<option value="${v}" ${v === (i.stage || '') ? raw('selected') : ''}>${l}</option>`)}</select></label>` : '');
  const cfs = board === 'opps' ? activeFields(cfg, 'opportunity') : [];
  const sub = (i) => (board === 'opps' ? html`${i.accountName || ''}${i.contactName ? html`${i.accountName ? ' · ' : ''}${i.contactName}` : ''}${i.estVolume ? html`<br>Est. ${fmtMoney(i.estVolume)}/yr` : ''}${i.expectedClose ? html` · by ${fmtDate(i.expectedClose)}` : ''}${cfs.filter((f) => (i.custom || {})[f.id] != null && (i.custom || {})[f.id] !== '').map((f) => html`<br><span data-cf-val="${f.id}">${f.label}: ${cfValue(f, i.custom[f.id])}</span>`)}`
    : html`${ctype(i.contactType)}${i.accountName ? html` · ${i.accountName}` : ''}<br>${i.orders} order(s), ${money(i.volume)}`);
  const title = (i) => (board === 'opps' ? html`<strong>${i.name}</strong>` : html`<a href="#/crm/contacts/${i.id}"><strong>${i.name}</strong></a>`);
  const total = (list) => (board === 'opps' ? fmtMoney(list.reduce((n, i) => n + (Number(i.estVolume) || 0), 0)) : `${list.reduce((n, i) => n + i.orders, 0)} orders`);
  const boardHtml = html`<div class="kanban" data-board="${board}">${stages.map(([v, l]) => { const list = crmSort(items.filter((i) => (i.stage || '') === v), 'name');
    return html`<section class="kanban-col" data-stage="${v}"><h4>${l} <span class="muted small">(${list.length} · ${total(list)})</span></h4>
      ${list.map((i) => html`<div class="kanban-card" data-card="${i.id}">${title(i)}<div class="small">${sub(i)}</div><div class="muted small">${i.ownerName || 'Unassigned'}</div>${mover(i)}${board === 'opps' ? html` <button type="button" class="ghost small" data-compose-btn="opportunity:${i.id}" title="Compose email from template">Email</button>` : ''}</div>`)}</section>`; })}</div>`;
  const listHtml = html`<table class="tbl" data-pipeline-list><thead><tr><th>${board === 'opps' ? 'Opportunity' : 'Partner'}</th><th>Details</th><th>Owner</th><th>Stage</th></tr></thead><tbody>
    ${crmSort(items, 'name').map((i) => html`<tr data-card="${i.id}"><td>${title(i)}</td><td class="small">${sub(i)}</td><td>${i.ownerName || 'Unassigned'}</td><td>${me.canEdit ? mover(i) : (stages.find(([v]) => v === i.stage) || [, ''])[1]}</td></tr>`)}</tbody></table>`;
  const body = html`${head('CRM: Pipeline', me, me.canEdit && board === 'opps' ? html`<button class="m-btn right" data-new-opp>+ New opportunity</button>` : '')}${tabs('pipeline')}
    <div class="filter-bar"><span>Board: <a class="${board === 'opps' ? 'active-link' : ''}" href="${url({ board: 'opps' })}" data-board-link="opps">Opportunities</a> · <a class="${board === 'partners' ? 'active-link' : ''}" href="${url({ board: 'partners' })}" data-board-link="partners">Referral partners (clients by Relationship Status)</a></span>
      <span>View: <a href="${url({ view: 'board' })}" data-view-link="board">Board</a> · <a href="${url({ view: 'list' })}" data-view-link="list">List</a></span>
      <label>Owner<select data-pipe-owner><option value="">Any owner</option><option value="none" ${owner === 'none' ? raw('selected') : ''}>Unassigned</option>${owners.map((o) => html`<option value="${o.id}" ${o.id === owner ? raw('selected') : ''}>${o.name}</option>`)}</select></label>
      <label>Created from<input type="date" data-pipe-date="createdFrom" value="${createdFrom}"></label><label>to<input type="date" data-pipe-date="createdTo" value="${createdTo}"></label>
      <label>Modified from<input type="date" data-pipe-date="modifiedFrom" value="${modifiedFrom}"></label><label>to<input type="date" data-pipe-date="modifiedTo" value="${modifiedTo}"></label>
      <label>${board === 'opps' ? 'Expected close' : 'Last contacted'} from<input type="date" data-pipe-date="extraFrom" value="${extraFrom}"></label><label>to<input type="date" data-pipe-date="extraTo" value="${extraTo}"></label></div>
    ${view === 'board' ? boardHtml : listHtml}`;
  return { title: 'CRM Pipeline', crumbs: crumbs('Pipeline'), body, mount(root) { wireCompose(root, api, me, refresh);
    $('[data-pipe-owner]', root).addEventListener('change', (e) => { location.hash = url({ owner: e.target.value }); });
    $$('[data-pipe-date]', root).forEach((el) => el.addEventListener('change', () => { const o = {}; $$('[data-pipe-date]', root).forEach((z) => { o[z.dataset.pipeDate] = z.value; }); location.hash = url(o); }));
    $$('[data-move]', root).forEach((s) => s.addEventListener('change', guard(async () => {
      if (board === 'opps') await api.moveCrmOpportunity(s.dataset.move, s.value); else await api.updateCrmContact(s.dataset.move, { relationshipStatus: s.value });
      toast('Moved to ' + (stages.find(([v]) => v === s.value) || [, 'Not set'])[1]); refresh(); })));
    const nb = $('[data-new-opp]', root); if (nb) nb.addEventListener('click', () => {
      const m = modal('New opportunity', html`<form id="opp-form" class="form-grid"><label class="span2">Name *<input name="name" required maxlength="160" placeholder="e.g. Harbor Realty: monthly referrals"></label>
        <label>Client${sel('contactId', contacts.map((c) => [c.id, c.name]), '', '(none)')}</label><label>Company${sel('accountId', accounts.map((a) => [a.id, a.name]), '', '(none)')}</label>
        <label>Stage${optSel(cfg, 'oppStage', 'stage', defaultOption(cfg, 'oppStage', 'New'), null)}</label><label>Owner${ownerSel(owners, me.isAdmin ? '' : me.id)}</label>
        <label>Estimated yearly volume ($)<input name="estVolume" inputmode="decimal"></label><label>Expected close<input name="expectedClose" type="date"></label>
        ${cfInputs(cfg, 'opportunity', 'info', {})}<p class="err-text span2" data-form-err></p>
        <div class="span2"><button class="m-btn" type="submit">Create opportunity</button> <button class="ghost" type="button" data-close>Cancel</button></div></form>`, { wide: true });
      $('#opp-form', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); const er = $('[data-form-err]', m); er.textContent = '';
        try { await api.createCrmOpportunity(formData(e.target)); } catch (err) { er.textContent = err.message; throw err; } closeModal(); toast('Opportunity created'); refresh(); }));
    }); } };
}

// ---------------- REPORTS (order open-date range) + CSV export ----------------
const ORDER_COLS = (first) => [['name', first], ['orders', 'Orders'], ['open', 'Open'], ['closed', 'Closed'], ['cancelled', 'Cancelled'], ['volume', 'Volume ($)']];
// Report Export (CSV) is Admin / Super admin only (Janine, video 10); the list-view CSVs are unchanged
export async function reportsPage({ api, me }) {
  const p = q(); const from = p.get('from') || ''; const to = p.get('to') || ''; const r = await api.crmReport({ from, to });
  const tables = [
    ['by-realtor', 'Orders and volume by realtor', [['name', 'Realtor'], ['company', 'Company'], ...ORDER_COLS('').slice(1)], r.byRealtor],
    ['by-lender', 'Orders and volume by lender', [['name', 'Lender'], ['company', 'Company'], ...ORDER_COLS('').slice(1)], r.byLender],
    ['by-brokerage', 'Orders and volume by company (brokerage)', ORDER_COLS('Company'), r.byBrokerage],
    ['by-salesperson', 'Orders and volume by salesperson', ORDER_COLS('Salesperson'), r.bySalesperson],
    ['leads-by-source', 'Leads by Lead Source (created in the range)', [['name', 'Lead Source'], ['leads', 'Leads'], ['converted', 'Converted']], r.leadsBySource],
    ['leads-by-status', 'Leads by Relationship Status (created in the range)', [['name', 'Relationship Status'], ['leads', 'Leads'], ['converted', 'Converted']], r.leadsByStatus]];
  const cell = (k, v) => (k === 'volume' ? fmtMoney(v) : v ?? '');
  const body = html`${head('CRM: Reports', me)}${tabs('reports')}
    <form class="filter-bar" id="rep-form"><label>Order open date from<input type="date" name="from" value="${from}"></label><label>to<input type="date" name="to" value="${to}"></label>
      <button class="m-btn" type="submit">Run</button> <a class="ghost" href="#/crm/reports/summary">All dates</a></form>
    <p data-rep-totals>${from || to ? `Orders opened ${from ? 'from ' + fmtDate(from) : ''} ${to ? 'to ' + fmtDate(to) : ''}` : 'All orders'}: <strong>${r.totals.orders}</strong> (${r.totals.open} open, ${r.totals.closed} closed, ${r.totals.cancelled} cancelled), volume <strong>${fmtMoney(r.totals.volume)}</strong>. Leads: ${r.leadCount}.
      <span class="muted small">Orders = the orders you can see in the portal. Volume = purchase price of orders that are not cancelled. An order counts once for each realtor / lender / company / salesperson on it.</span></p>
    ${tables.map(([id, label, cols, rows]) => html`<div class="card" data-report="${id}"><h3>${label} ${me.canConfigure ? html`<button class="ghost right" data-csv="${id}">Export CSV</button>` : ''}</h3>
      <table class="tbl"><thead><tr>${cols.map(([, l]) => html`<th>${l}</th>`)}</tr></thead><tbody>${rows.length ? rows.map((row) => html`<tr>${cols.map(([k]) => html`<td>${cell(k, row[k])}</td>`)}</tr>`) : html`<tr><td colspan="${cols.length}" class="muted">No data in this range.</td></tr>`}</tbody></table></div>`)}`;
  return { title: 'CRM Reports', crumbs: crumbs('Reports'), body, mount(root) {
    $('#rep-form', root).addEventListener('submit', (e) => { e.preventDefault(); const f = formData(e.target); location.hash = '#/crm/reports/summary?' + new URLSearchParams(Object.fromEntries(Object.entries(f).filter(([, v]) => v))); });
    $$('[data-csv]', root).forEach((b) => b.addEventListener('click', () => { const [id, , cols, rows] = tables.find((t) => t[0] === b.dataset.csv);
      downloadCsv(`crm-${id}${from ? '-from-' + from : ''}${to ? '-to-' + to : ''}.csv`, cols, rows); toast('CSV downloaded'); })); } };
}
