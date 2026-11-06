// Inbox tab: conversations on this file (only people on the thread see it). Replies, new conversation, unread counts.
import { html, $, $$, guard, formData, modal, closeModal, fmtDateTime, pill, toast } from '../ui.js?v=202611062325';
import { viewOnly, isViewOnly, runsOrders, WIRE_FRAUD_NOTE } from '../data/constants.js?v=202611062325';
import { raw } from '../ui.js?v=202611062325';
import { sanitizeMessageHtml } from '../data/agent-portal.js?v=202611062325';
import { editorHtml, mountEditor, filesHtml, mountFiles, composeModal } from './compose.js?v=202611062325';

export async function render(ctx) {
  const { api, user, deal, refresh, params } = ctx; const notViewOnly = !viewOnly(user);
  if (params.sub) return thread(ctx);
  const threads = await api.listThreads(deal.id);
  const rows = threads.map((t, i) => html`<tr class="${t.unread ? 'unread' : ''}"><td>${i + 1}</td><td><a href="#/deals/${deal.id}/inbox/${t.id}">${t.subject}</a>${t.staffCoordinated ? html` ${pill('all parties · staff coordinated', 'info')}` : ''}${t.unread ? html` ${pill(t.unread + ' new', 'info')}` : ''}<br><span class="muted small">${t.lastBody.slice(0, 90)}</span></td>
    <td>${t.lastFrom}</td><td>${t.participants.map((p) => `${p.name}`).join(' | ')}</td><td>${fmtDateTime(t.lastAt)}</td><td>${t.count}${t.hasFiles ? ' \u{1F4CE}' : ''}</td></tr>`);
  const body = html`<div class="box-title"><h2><span class="h-ico"></span>Conversations</h2>${notViewOnly ? html`${user.role === 'Transaction Coordinator' && api.createAllPartiesThread ? html`<button class="m-btn right" id="allparties">Message all parties</button> ` : ''}<button class="m-btn right" id="newthread">Start conversation</button> <button class="ghost right" id="sharefiles2">Share Files</button>` : ''}</div>
    ${rows.length ? html`<table class="tbl striped"><thead><tr><th>Sr#</th><th>Subject</th><th>From</th><th>Users</th><th>Last activity</th><th>Msgs</th></tr></thead><tbody>${rows}</tbody></table>` : html`<p class="muted">No conversations yet.</p>`}`;
  return { title: 'Inbox', crumbs: [['Conversation']], body, mount(root) {
    const ap = $('#allparties', root); if (ap) ap.addEventListener('click', guard(async () => {
      const m = modal('Message all parties', html`<form id="apf" class="form-grid"><p class="span2 notice info">Staff-coordinated: the TC can address the client, processor and both agents in one thread. Outside parties see CLA staff and their own side only; the buyer never sees the listing agent, and the seller never sees the buyer’s agent.</p><label class="span2">Subject<input name="subject" required maxlength="150" value="${deal.street} — coordination update"></label><label class="span2">Message<textarea name="body" required rows="4" maxlength="4000"></textarea></label><div class="span2"><button class="m-btn" type="submit">Start coordination thread</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`);
      $('#apf', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); const f = formData(e.target); const t = await api.createAllPartiesThread(deal.id, f); closeModal(); toast('Coordination thread started (in-portal only; nothing emailed)'); ctx.go(`/deals/${deal.id}/inbox/${t.id}`); }));
    }));
    const sf = $('#sharefiles2', root); if (sf) sf.addEventListener('click', guard(() => composeModal(ctx, { title: 'New Conversation', withFiles: true })));
    const nb = $('#newthread', root); if (nb) nb.addEventListener('click', guard(async () => {
      const people = await api.listMessageRecipients(deal.id);
      const m = modal('Start a conversation', html`<form id="ntf" class="form-grid"><label class="span2">Subject<input name="subject" maxlength="150" required></label>
        <p class="span2 muted small">${runsOrders(user) || user.isAdmin || user.role === 'Transaction Coordinator' || user.role === 'Sales Person' || user.role === 'Sales Team' ? 'A conversation can include CLA Title staff and one side of the order (buyer side or seller side), not both.' : 'You can message CLA Title staff and people on your own side of this order.'}</p>
        <fieldset class="span2 checks"><legend>To</legend>${people.map((p) => html`<label><input type="checkbox" name="to" value="${p.id}"> ${p.firstName} ${p.lastName} <span class="muted">(${p.role})</span></label>`)}</fieldset>
        <label class="span2">Message<textarea name="body" rows="4" maxlength="4000" required></textarea></label>
        <div class="span2"><button class="m-btn" type="submit">Send</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`);
      $('#ntf', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); const f = new FormData(e.target);
        const t = await api.createThread(deal.id, { subject: f.get('subject'), participantIds: f.getAll('to'), body: f.get('body') }); closeModal(); toast('Conversation started'); ctx.go(`/deals/${deal.id}/inbox/${t.id}`); }));
    }));
  } };
}

async function thread({ api, user, deal, refresh, params }) {
  const t = await api.getThreadDetail(params.sub); await api.markThreadRead(t.id); const canPost = !viewOnly(user) && t.participantIds.includes(user.id);
  const wire = t.messages.some((m) => (m.attachments || []).some((x) => x.wire));
  const msgs = t.messages.map((m) => html`<div class="bubble ${m.mine ? 'mine' : ''}" data-msg="${m.id}"><div class="who"><strong>${m.authorName}</strong> <span class="muted small">${fmtDateTime(m.createdAt)}</span></div><div class="text">${m.bodyHtml ? raw(sanitizeMessageHtml(m.bodyHtml)) : m.body}</div>${(m.attachments || []).length ? html`<ul class="plain" data-attachments>${m.attachments.map((x) => html`<li>\u{1F4CE} <a href="#" data-open="${x.id}" class="doc-link">${x.name}</a>${x.wire ? html` ${pill('wire instructions', 'warn')}` : ''}</li>`)}</ul>` : ''}</div>`);
  const body = html`<div class="box-title"><h2><span class="h-ico"></span>${t.subject}</h2><a class="ghost right" href="#/deals/${deal.id}/inbox">All conversations</a></div>
    <p class="muted">With: ${t.participants.map((p) => `${p.name} (${p.role})`).join(', ')}${t.task ? html` &middot; about task <a href="#/deals/${deal.id}/tasks/${t.task.id}" data-thread-task>${t.task.title}</a>` : ''}</p>
    ${wire ? html`<div class="notice warn" data-wire-warning><strong>STOP - wire fraud warning.</strong> ${WIRE_FRAUD_NOTE}</div>` : ''}<div class="thread">${msgs}</div>
    ${canPost && t.participants.some((p) => !p.wireOk) ? html`<p class="muted small" data-no-wire-here>Wire instructions cannot be sent in this conversation: ${t.participants.filter((p) => !p.wireOk).map((p) => `${p.name} (${p.role})`).join(', ')} may not receive them. Use Share Files and send them to the buyer alone.</p>` : ''}
    ${canPost ? html`<form id="rf" class="reply" data-reply><p><strong>Reply to this thread</strong></p>${editorHtml('reply-rte')}${filesHtml()}<button class="m-btn" type="submit" data-send>Send</button></form>` : html`<p class="muted">You can read this conversation but not reply.</p>`}`;
  return { title: t.subject, crumbs: [['Conversation', `#/deals/${deal.id}/inbox`], [t.subject]], body, mount(root) {
    $$('[data-open]', root).forEach((a) => a.addEventListener('click', guard(async (e) => { e.preventDefault(); const c = await api.getDocumentContent(a.dataset.open); const l = document.createElement('a'); l.href = c.dataUrl; l.download = c.name; document.body.appendChild(l); l.click(); l.remove(); })));
    const f = $('#rf', root); if (!f) return; const ed = mountEditor(f); const send = $('[data-send]', f);
    const fl = mountFiles(f, (b) => { send.disabled = b > 0; send.textContent = b > 0 ? 'Waiting for upload\u2026' : 'Send'; });
    f.addEventListener('submit', guard(async (e) => { e.preventDefault(); if (fl.busy) throw new Error('Wait for the upload to finish.'); if (!ed.text && !fl.files.length) throw new Error('Write a message first.');
      await api.sendMessage({ threadId: t.id, bodyHtml: ed.html, files: fl.files }); refresh(); }));
  } };
}
