// Activity tab. CLA staff: the full order log with filters (unchanged). Outside users (Francis, Nov 3, Qualia "Activity"): a read-only, time-stamped
// list of their OWN actions plus messages in their conversations, files they can open and answers to their update requests. The full log stays staff-only.
import { html, fmtDateTime } from '../ui.js?v=202611061858';
import { activityView } from './activityview.js?v=202611061858';
export async function render({ api, deal, user }) {
  const staff = !user.accountRole && user.role !== 'Outside user';
  if (staff) { const v = await activityView(api, deal.id, `#/deals/${deal.id}/activity`);
    return { title: 'Activity', crumbs: [['Activity']], body: html`<div class="box-title"><h2><span class="h-ico"></span>Activity</h2></div>${v.body}`, mount: v.mount }; }
  const items = await api.listMyActivity(deal.id);
  const body = html`<div class="box-title"><h2><span class="h-ico"></span>Activity</h2></div>
    <p class="muted small">Read-only. What you did on this order (uploads, replies, task submissions, update requests) and what CLA Title shared with you. ${items.length} entr${items.length === 1 ? 'y' : 'ies'}.</p>
    <table class="tbl striped" id="my-activity"><thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead><tbody>${items.length ? items.map((a) => html`<tr data-act="${a.action}"><td class="nowrap">${fmtDateTime(a.createdAt)}</td><td>${a.mine ? 'You' : a.actorName}<br><span class="muted small">${a.actorRole || ''}</span></td><td>${a.detail}</td></tr>`) : html`<tr><td colspan="3" class="muted">Nothing yet.</td></tr>`}</tbody></table>`;
  return { title: 'Activity', crumbs: [['Activity']], body };
}
