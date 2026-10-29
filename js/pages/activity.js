// Whole-portal activity log (Sales Processor and Admin), with filters.
import { html } from '../ui.js';
import { activityView } from './activityview.js';
export async function render({ api }) {
  const v = await activityView(api, null, '#/activity');
  return { title: 'Activity Log', crumbs: [['Activity Log']], body: html`<div class="box-title"><h2><span class="h-ico"></span>Activity Log</h2></div>${v.body}`, mount: v.mount };
}
