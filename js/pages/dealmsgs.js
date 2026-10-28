// Inbox tab: conversations on this file (only people on the thread see it). Replies, new conversation, unread counts.
import { html, $, $$, guard, formData, modal, closeModal, fmtDateTime, pill, toast } from '../ui.js';

export async function render(ctx) {
  const { api, user, deal, refresh, params } = ctx; const notViewOnly = !['Sales Person', 'Sales Team'].includes(user.role);
  if (params.sub) return thread(ctx);
  const threads = await api.listThreads(deal.id);
  const rows = threads.map((t, i) => html`<tr class="${t.unread ? 'unread' : ''}"><td>${i + 1}</td><td><a href="#/deals/${deal.id}/inbox/${t.id}">${t.subject}</a>${t.unread ? html` ${pill(t.unread + ' new', 'info')}` : ''}<br><span class="muted small">${t.lastBody.slice(0, 90)}</span></td>
    <td>${t.participants.map((p) => `${p.name}`).join(' | ')}</td><td>${fmtDateTime(t.lastAt)}</td><td>${t.count}</td></tr>`);
  const body = html`<div class="box-title"><h2><span class="h-ico"></span>Conversations</h2>${notViewOnly ? html`<button class="m-btn right" id="newthread">Start conversation</button>` : ''}</div>
    ${rows.length ? html`<table class="tbl striped"><thead><tr><th>Sr#</th><th>Subject</th><th>Users</th><th>Last activity</th><th>Msgs</th></tr></thead><tbody>${rows}</tbody></table>` : html`<p class="muted">No conversations yet.</p>`}`;
  return { title: 'Inbox', crumbs: [['Conversation']], body, mount(root) {
    const nb = $('#newthread', root); if (nb) nb.addEventListener('click', guard(async () => {
      const people = await api.listMessageRecipients(deal.id);
      const m = modal('Start a conversation', html`<form id="ntf" class="form-grid"><label class="span2">Subject<input name="subject" maxlength="150" required></label>
        <fieldset class="span2 checks"><legend>To</legend>${people.map((p) => html`<label><input type="checkbox" name="to" value="${p.id}"> ${p.firstName} ${p.lastName} <span class="muted">(${p.role})</span></label>`)}</fieldset>
        <label class="span2">Message<textarea name="body" rows="4" maxlength="4000" required></textarea></label>
        <div class="span2"><button class="m-btn" type="submit">Send</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`);
      $('#ntf', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); const f = new FormData(e.target);
        const t = await api.createThread(deal.id, { subject: f.get('subject'), participantIds: f.getAll('to'), body: f.get('body') }); closeModal(); toast('Conversation started'); ctx.go(`/deals/${deal.id}/inbox/${t.id}`); }));
    }));
  } };
}

async function thread({ api, user, deal, refresh, params }) {
  const t = await api.getThread(params.sub); await api.markThreadRead(t.id); const canPost = !['Sales Person', 'Sales Team'].includes(user.role) && t.participantIds.includes(user.id);
  const msgs = t.messages.map((m) => html`<div class="bubble ${m.mine ? 'mine' : ''}"><div class="who"><strong>${m.authorName}</strong> <span class="muted small">${fmtDateTime(m.createdAt)}</span></div><div class="text">${m.body}</div></div>`);
  const body = html`<div class="box-title"><h2><span class="h-ico"></span>${t.subject}</h2><a class="ghost right" href="#/deals/${deal.id}/inbox">All conversations</a></div>
    <p class="muted">With: ${t.participants.map((p) => `${p.name} (${p.role})`).join(', ')}</p><div class="thread">${msgs}</div>
    ${canPost ? html`<form id="rf" class="reply"><textarea name="body" rows="3" maxlength="4000" placeholder="Write a reply" required></textarea><button class="m-btn" type="submit">Send</button></form>` : html`<p class="muted">You can read this conversation but not reply.</p>`}`;
  return { title: t.subject, crumbs: [['Conversation', `#/deals/${deal.id}/inbox`], [t.subject]], body, mount(root) {
    const f = $('#rf', root); if (f) f.addEventListener('submit', guard(async (e) => { e.preventDefault(); await api.postMessage(t.id, formData(e.target).body); refresh(); }));
  } };
}
