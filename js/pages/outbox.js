// Reminder outbox: reminders are QUEUED here only. This build never sends email or SMS.
import { html, $, guard, toast, fmtDateTime, pill } from '../ui.js';
export async function render({ api, user, refresh }) {
  const list = await api.listOutbox(); const canQueue = user.role === 'Sales Processor' || user.role === 'Transaction Coordinator';
  const rows = list.map((o) => html`<tr><td class="nowrap">${fmtDateTime(o.createdAt)}</td><td>${o.toName}<br><span class="muted small">${o.toEmail}</span></td>
    <td><a href="#/deals/${o.dealId}/tasks">${o.fileNumber}</a></td><td><strong>${o.subject}</strong><br><span class="muted small">${o.body}</span></td><td>${pill('queued - not sent', 'warn')}</td></tr>`);
  const body = html`<div class="box-title"><h2><span class="h-ico"></span>Reminder Outbox</h2>${canQueue ? html`<button class="m-btn right" id="q">Queue reminders for overdue tasks</button>` : ''}</div>
    <p class="dev-banner">Nothing in this outbox is ever sent. At go-live a mail service would pick these up after approval.</p>
    ${rows.length ? html`<table class="tbl striped"><thead><tr><th>Queued</th><th>To</th><th>Order</th><th>Message</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>` : html`<p class="muted">The outbox is empty. Use "Remind" on a task, or queue reminders for overdue tasks.</p>`}`;
  return { title: 'Reminder Outbox', crumbs: [['Reminder Outbox']], body, mount(root) {
    const b = $('#q', root); if (b) b.addEventListener('click', guard(async () => { const r = await api.queueOverdueReminders(); toast(`${r.queued} reminder(s) queued (not sent)`); refresh(); }));
  } };
}
