// Activity tab (staff, coordinators, agents): who did what on this file, with filters.
import { html } from '../ui.js?v=202611021647';
import { activityView } from './activityview.js?v=202611021647';
export async function render({ api, deal }) {
  const v = await activityView(api, deal.id, `#/deals/${deal.id}/activity`);
  return { title: 'Activity', crumbs: [['Activity']], body: html`<div class="box-title"><h2><span class="h-ico"></span>Activity</h2></div>${v.body}`, mount: v.mount };
}
