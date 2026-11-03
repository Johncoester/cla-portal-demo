/* crm-deals.js : DEALS in the CRM (Zoho's Deals module) = the portal's orders you can already see. #/crm/deals[/<id>]. Read-only here (orders are run
 * in the portal); a deal has Send Email (saved, NOT sent) and its Emails list. Function only. */
import { html, $, fmtDate } from '../ui.js?v=202611031532';
import { tabs, head, money, listView } from './crm-kit.js?v=202611031532';
import { sendEmailBtn, wireSendEmail, emailsCard, wireEmails } from './crm-compose.js?v=202611031532';
import { DEAL_STAGES } from '../data/crm-analytics.js?v=202611031532';

export async function dealsPage(c) { return c.params.id ? dealPage(c) : dealsList(c); }

async function dealsList(c) {
  const { api, me } = c; const rows = await api.listCrmDeals();
  const lv = listView({ key: 'deals', rows: rows.map((r) => ({ ...r, ownerName: r.ownerName || '' })), fields: ['name', 'fileNumber', 'propertyAddress', 'clientName', 'contactName'],
    cols: [['name', 'Deal Name', (r) => html`<a href="${r._link}" data-open="${r.id}">${r.name}</a>`], ['amount', 'Amount', (r) => money(r.amount), (r) => r.amount], ['stage', 'Stage'], ['closingDate', 'Closing Date', (r) => fmtDate(r.closingDate), (r) => r.closingDate],
      ['clientName', 'Client Name', (r) => (r._clientLink ? html`<a href="${r._clientLink}">${r.clientName}</a>` : r.clientName)], ['contactName', 'Contact Name'], ['ownerName', 'Deal Owner']],
    filters: [['stage', 'Stage', DEAL_STAGES, 'All stages']], sorts: [['name', 'Deal Name'], ['closingDate', 'Closing Date'], ['amount', 'Amount']], sortDefault: 'closingDate:desc' });
  return { title: 'Deals', crumbs: [['CRM', '#/crm'], ['Deals']], body: html`${tabs('deals')}${head('Deals', me)}<p class="muted small">Deals are the portal's orders you can already see. Run the order itself in the portal.</p>${lv.body}`, mount: lv.mount };
}

async function dealPage(c) {
  const { api, me, params, refresh } = c; const d = await api.getCrmDeal(params.id); api.noteCrmRecent('deal', d.id).catch(() => {});
  const row = (l, v) => html`<tr><th>${l}</th><td>${v}</td></tr>`;
  const body = html`${tabs('deals')}${head(d.name, me, html`<span data-record-actions>${sendEmailBtn('deal', d.id, me)} <a class="ghost" href="${d._portalLink}" data-open-order>Open the order</a></span>`)}
    <div class="card" data-deal-summary><table class="tbl">${row('Deal Name', d.name)}${row('File Number', d.fileNumber)}${row('Property Address', d.propertyAddress)}${row('Amount', money(d.amount))}${row('Loan Amount', money(d.loanAmount))}
      ${row('Stage', d.stage)}${row('Closing Date', fmtDate(d.closingDate))}${row('Open Date', fmtDate(d.openDate))}${row('Deal Owner', d.ownerName)}${row('Sales Reps', d.salesReps)}${row('Transaction Type', d.transactionType)}</table></div>
    <div class="card" data-deal-people><h3>People on the file</h3><table class="tbl"><thead><tr><th>Role</th><th>Name</th><th>Email</th></tr></thead><tbody>${d.people.map((p) => html`<tr><td>${p.role}</td><td>${p.link ? html`<a href="${p.link}">${p.name}</a>` : p.name}</td><td>${p.email}</td></tr>`)}</tbody></table></div>
    ${emailsCard(d.emails)}`;
  return { title: d.name, crumbs: [['CRM', '#/crm'], ['Deals', '#/crm/deals'], [d.fileNumber]], body, mount(root) { wireSendEmail(root, api, me, refresh); wireEmails(root, api, d.emails); void $; } };
}
