// Whole-portal activity log (Processor and Admin), with filters.
import { html } from '../ui.js?v=202611031817';
import { activityView } from './activityview.js?v=202611031817';
export async function render({ api }) {
  const v = await activityView(api, null, '#/activity');
  return { title: 'Activity Log', crumbs: [['Activity Log']], body: html`<div class="box-title"><h2><span class="h-ico"></span>Activity Log</h2></div>${v.body}`, mount: v.mount };
}
