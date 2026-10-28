// Activity tab (staff, coordinators, agents): who did what on this file.
import { html, fmtDateTime } from '../ui.js';

export async function render({ api, deal }) {
  const rows = (await api.listActivity(deal.id)).map((a) => html`<tr><td class="nowrap">${fmtDateTime(a.createdAt)}</td><td>${a.actorName}</td><td>${a.detail}</td></tr>`);
  return { title: 'Activity', crumbs: [['Activity']], body: html`<div class="box-title"><h2><span class="h-ico"></span>Activity</h2></div>
    <table class="tbl striped"><thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead><tbody>${rows}</tbody></table>` };
}
