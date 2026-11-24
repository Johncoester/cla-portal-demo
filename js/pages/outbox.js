// Reminder outbox (OUTBOX-SEND-2, John Nov 24 2026): automatic portal emails. The outbox-send job sends each one from the file's
// processor's own connected Gmail. Each row shows what really happened: waiting, sending, sent (with the time), or why it was not sent.
import { runsOrders } from '../data/constants.js?v=202611302300';
import { html, $, guard, toast, fmtDateTime, pill } from '../ui.js?v=202611161500';

const STATUS = {
  queued: ['Waiting to send', 'info'], sending: ['Sending', 'info'], sent: ['Sent', 'ok'],
  failed: ['Not sent', 'bad'], skipped: ['Not sent (skipped)', 'warn'], blocked: ['Held', 'warn'],
};
export function outboxStatus(o = {}) {
  const [label, cls] = STATUS[o.status] || [o.status || 'Waiting to send', 'info'];
  const when = o.status === 'sent' && o.sentAt ? `Sent ${fmtDateTime(o.sentAt)}` : '';
  const reason = o.status === 'sent' ? '' : String(o.statusReason || o.sendBlocked || '');
  return { label, cls, when, reason };
}
export async function render({ api, user, refresh }) {
  const list = await api.listOutbox(); const canQueue = runsOrders(user) || user.role === 'Transaction Coordinator';
  const rows = list.map((o) => { const s = outboxStatus(o); return html`<tr><td class="nowrap">${fmtDateTime(o.createdAt)}</td><td><strong>${o.from || `${o.fromName || ''} <${o.fromEmail || 'unassigned'}>`}</strong></td><td>${o.toName}<br><span class="muted small">${o.toEmail}</span></td>
    <td><a href="#/deals/${o.dealId}/tasks">${o.fileNumber}</a></td><td><strong>${o.subject}</strong><br><span class="muted small">${o.body}</span></td><td data-outbox-status="${o.status || ''}">${pill(s.label, s.cls)}${s.when ? html`<br><span class="small">${s.when}</span>` : ''}${s.reason ? html`<br><span class="muted small">${s.reason}</span>` : ''}</td></tr>`; });
  const body = html`<div class="box-title"><h2><span class="h-ico"></span>Reminder Outbox</h2>${canQueue ? html`<button class="m-btn right" id="q">Queue reminders for overdue tasks</button>` : ''}</div>
    <p class="dev-banner">Automatic emails are sent from the file's processor's Gmail. On CLA Portal Live Test only clatestportal+ test addresses get them; every other email shows why it was not sent.</p>
    ${rows.length ? html`<table class="tbl striped"><thead><tr><th>Queued</th><th>From</th><th>To</th><th>Order</th><th>Message</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>` : html`<p class="muted">The outbox is empty. Use "Remind" on a task, or queue reminders for overdue tasks.</p>`}`;
  return { title: 'Reminder Outbox', crumbs: [['Reminder Outbox']], body, mount(root) {
    const b = $('#q', root); if (b) b.addEventListener('click', guard(async () => { const r = await api.queueOverdueReminders(); toast(`${r.queued} reminder(s) queued`); refresh(); }));
  } };
}
