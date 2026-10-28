// Contact Us: who to call about a file (shows the processor on each of my orders).
import { html, esc } from '../ui.js';

export async function render({ api, user }) {
  const deals = await api.listDeals({ status: 'All' });
  const rows = deals.map((d) => html`<tr><td>${d.fileNumber}</td><td>${d.address}</td><td>${d.processorName}</td></tr>`);
  const body = html`<div class="box-title"><h2><span class="h-ico"></span>Contact Us</h2></div>
    <p>Questions about your closing? Message your closing team from the Inbox tab on your file, or reach your processor below.</p>
    <table class="tbl"><thead><tr><th>File No</th><th>Property</th><th>Processor</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="muted">CLA office phone and email will be added here before go-live (fake build: none shown).</p>`;
  return { title: 'Contact Us', crumbs: [['Contact Us']], body };
}
