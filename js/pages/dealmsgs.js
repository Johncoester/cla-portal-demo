// Inbox / Messages tab: in-portal conversations on this file, plus Gmail sent from the
// portal and replies in the same Gmail thread (CONNECT-6, checklist 9.3).
import { html, $, $$, guard, formData, modal, closeModal, fmtDateTime, pill, toast } from '../ui.js?v=202611161500';
import { downloadNamed } from '../data/file-open.js?v=202611091030';
import { viewOnly, isViewOnly, runsOrders, WIRE_FRAUD_NOTE, isClient } from '../data/constants.js?v=202611302300';
import { raw } from '../ui.js?v=202611161500';
import { sanitizeMessageHtml } from '../data/agent-portal.js?v=202611247700';
import { editorHtml, mountEditor, filesHtml, mountFiles, composeModal } from './compose.js?v=202611312900';
import { presentThread } from '../data/portal-threads.js?v=202611162200';
import { noLoginContactId, canShareInvite, shareInviteToast } from '../data/share-invite.js?v=202611249900';
import { autoSendInvite } from '../data/invite-send.js?v=202611312900';
import { TYPED_ROLES, cleanTypedRecipient, personByEmail, heldContactId, plainMessageHtml, addTypedRecipient } from '../data/typed-recipient.js?v=202611249900';
import { canUseGmail } from '../data/gmail-email.js?v=202611191000';
import { isUnreadFileEmail } from '../data/file-email-unread.js?v=202611140900';
import { shapeGmailThreads, mergeConversationLists, parseGmailThreadParam, isGmailThread } from '../data/gmail-in-messages.js?v=202611312700';
import { composeEmailModal } from './dealemail.js?v=202611315000';

const reSubject = (s) => (/^re:/i.test(String(s || '').trim()) ? String(s).trim() : `Re: ${String(s || '').trim()}`);
const tabTitle = (deal) => (deal && isClient(deal.myRole) ? 'Messages' : 'Inbox');

export async function render(ctx) {
  const { api, user, deal, refresh, params } = ctx; const notViewOnly = !viewOnly(user);
  if (params.sub) {
    const gmailRef = parseGmailThreadParam(params.sub);
    if (gmailRef) return gmailThread(ctx, gmailRef);
    return thread(ctx);
  }
  const [threads, emails, cursor, g] = await Promise.all([
    api.listThreads(deal.id),
    api.listDealEmails ? api.listDealEmails(deal.id).catch(() => []) : Promise.resolve([]),
    api.emailReadCursor ? api.emailReadCursor(deal.id).catch(() => ({ readAt: '' })) : Promise.resolve({ readAt: '' }),
    canUseGmail(user) && api.getGmailStatus ? api.getGmailStatus().catch(() => ({ connected: false })) : Promise.resolve({ connected: false }),
  ]);
  const readAt = cursor && cursor.readAt || '';
  const items = mergeConversationLists(threads || [], shapeGmailThreads(emails || [], { userId: user.id, readAt }));
  const rows = (items || []).map((item, i) => { const t = presentThread(item, { userId: user.id }); return html`<tr class="${t.unread ? 'unread' : ''}" data-msg-row="${t.id}"${isGmailThread(t) ? raw(' data-gmail-thread="1"') : ''}><td>${i + 1}</td><td><a href="#/deals/${deal.id}/inbox/${t.id}">${t.subject}</a>${isGmailThread(t) ? html` ${pill('Email', 'info')}` : ''}${t.staffCoordinated ? html` ${pill('all parties · staff coordinated', 'info')}` : ''}${t.unread ? html` ${pill(t.unread + ' new', 'info')}` : ''}<br><span class="muted small">${String(t.lastBody || '').slice(0, 90)}</span></td>
    <td>${t.lastFrom}</td><td>${(t.participants || []).map((p) => `${p.name}`).join(' | ')}</td><td>${fmtDateTime(t.lastAt)}</td><td>${t.count}${t.hasFiles ? ' \u{1F4CE}' : ''}</td></tr>`; });
  const staffMail = !!(g && g.connected);
  const body = html`<div class="box-title"><h2><span class="h-ico"></span>Conversations</h2>${notViewOnly ? html`${user.role === 'Transaction Coordinator' && api.createAllPartiesThread ? html`<button class="m-btn right" id="allparties">Message all parties</button> ` : ''}<button class="m-btn right" id="newthread">Start conversation</button> <button class="ghost right" id="sharefiles2">Share Files</button>${staffMail ? html` <button class="ghost right" data-mail-sync>Check for replies</button>` : ''}` : staffMail ? html`<button class="ghost right" data-mail-sync>Check for replies</button>` : ''}</div>
    ${rows.length ? html`<table class="tbl striped"><thead><tr><th>Sr#</th><th>Subject</th><th>From</th><th>Users</th><th>Last activity</th><th>Msgs</th></tr></thead><tbody>${rows}</tbody></table>` : html`<p class="muted">No conversations yet.</p>`}`;
  return { title: tabTitle(deal), crumbs: [['Conversation']], body, mount(root) {
    const sync = $('[data-mail-sync]', root);
    if (sync) sync.addEventListener('click', guard(async () => {
      sync.disabled = true;
      try {
        const r = await api.checkGmailReplies();
        toast(r.stored ? `${r.stored} new email${r.stored === 1 ? '' : 's'} added` : 'No new replies');
        if (r.stored) refresh();
      } finally { sync.disabled = false; }
    }));
    const ap = $('#allparties', root); if (ap) ap.addEventListener('click', guard(async () => {
      const m = modal('Message all parties', html`<form id="apf" class="form-grid"><p class="span2 notice info">Staff-coordinated: the TC can address the client, processor and both agents in one thread. Outside parties see CLA staff and their own side only; the buyer never sees the listing agent, and the seller never sees the buyer’s agent.</p><label class="span2">Subject<input name="subject" required maxlength="150" value="${deal.street} — coordination update"></label><label class="span2">Message<textarea name="body" required rows="4" maxlength="4000"></textarea></label><div class="span2"><button class="m-btn" type="submit">Start coordination thread</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`);
      $('#apf', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); const f = formData(e.target); const t = await api.createAllPartiesThread(deal.id, f); closeModal(); toast('Coordination thread started (in-portal only; nothing emailed)'); ctx.go(`/deals/${deal.id}/inbox/${t.id}`); }));
    }));
    const sf = $('#sharefiles2', root); if (sf) sf.addEventListener('click', guard(() => composeModal(ctx, { title: 'New Conversation', withFiles: true })));
    const nb = $('#newthread', root); if (nb) nb.addEventListener('click', guard(async () => {
      const people = await api.listMessageRecipients(deal.id);
      let parts = (deal && deal.participants) || [];
      if (!parts.length && api.getDeal) { try { const full = await api.getDeal(deal.id); parts = (full && full.participants) || []; } catch (err) { parts = []; } }
      // FF-055 / MF-048: someone with no portal login cannot be ticked here (it used to fail with "Pick at least one recipient"). Share Files invites them.
      // MF-049: the list is only people on this file. A processor can also type a name and email.
      const noLogin = (p) => !!noLoginContactId(p, parts);
      const canType = !!(runsOrders(user) || user.isAdmin);
      const m = modal('Start a conversation', html`<form id="ntf" class="form-grid"><label class="span2">Subject<input name="subject" maxlength="150" required></label>
        <p class="span2 muted small">${runsOrders(user) || user.isAdmin || user.role === 'Transaction Coordinator' || user.role === 'Sales Person' || user.role === 'Sales Team' ? 'A conversation can include CLA Title staff and one side of the order (buyer side or seller side), not both.' : 'You can message CLA Title staff and people on your own side of this order.'}</p>
        <fieldset class="span2 checks"><legend>To</legend>${people.length ? people.map((p) => html`<label><input type="checkbox" name="to" value="${p.id}" ${noLogin(p) ? raw('disabled data-no-login') : ''}> ${p.firstName} ${p.lastName} <span class="muted">(${p.role})</span>${noLogin(p) ? html` <span class="muted small">No portal login yet. Use Share Files to invite them.</span>` : ''}</label>`) : html`<p class="muted">No one else on this file can be messaged yet.</p>`}</fieldset>
        ${canType ? html`<fieldset class="span2" data-typed-recipient><legend>Or type a recipient</legend>
          <p class="muted small">Use this for someone who is not in the list. If they are not already on this file, choose buyer, seller, buyer's agent, or listing agent. The portal adds them to this file, emails an invite, and holds this message until they sign in.</p>
          <label>First name<input name="typedFirst" maxlength="80" autocomplete="off"></label>
          <label>Last name<input name="typedLast" maxlength="80" autocomplete="off"></label>
          <label class="span2">Email<input name="typedEmail" maxlength="200" autocomplete="off" inputmode="email" spellcheck="false"></label>
          <label class="span2">How they are on this file<select name="typedRole"><option value="">Only if they are not already on this file</option>${TYPED_ROLES.map(([id, label]) => html`<option value="${id}">${label}</option>`)}</select></label>
        </fieldset>` : ''}
        <label class="span2">Message<textarea name="body" rows="4" maxlength="4000" required></textarea></label>
        <div class="span2"><button class="m-btn" type="submit">Send</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`);
      $('#ntf', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); const f = new FormData(e.target);
        const checked = f.getAll('to').map((id) => String(id || '')).filter(Boolean);
        const typed = cleanTypedRecipient({ firstName: f.get('typedFirst'), lastName: f.get('typedLast'), email: f.get('typedEmail') });
        if (typed.error) throw new Error(typed.error);
        let inviteContactId = '';
        let picked = null;
        if (!typed.empty) {
          picked = personByEmail(people, typed.email);
          if (picked) {
            inviteContactId = heldContactId(picked, parts);
            if (inviteContactId && !canShareInvite(picked, parts)) throw new Error("That person is on this file but has no portal login, and only a buyer, seller, buyer's agent, or listing agent can be invited.");
          } else {
            if (!f.get('typedRole')) throw new Error("Pick how this person is on the file: buyer, seller, buyer's agent, or listing agent.");
            const added = await addTypedRecipient(api, deal, typed, f.get('typedRole'));
            picked = added.person;
            inviteContactId = added.inviteContactId || '';
          }
        }
        if (inviteContactId) {
          if (checked.length) throw new Error('Someone with no portal login yet has to be the only person in this conversation. Uncheck the others, or clear the typed name and email.');
          const t = await api.sendMessage({ dealId: deal.id, to: [picked.id], subject: f.get('subject'), bodyHtml: plainMessageHtml(f.get('body')), files: [], inviteContactId });
          const got = (t && t.invited) || {};
          const inv = { ...got, name: got.name || `${picked.firstName || ''} ${picked.lastName || ''}`.trim(), email: got.email || picked.email || '' };
          if (inv.link) { const r = await autoSendInvite(api, 'agent', inv.link); inv.sent = !!r.sent; if (r.to) inv.email = r.to; if (!r.sent) inv.error = r.error || ''; }
          closeModal(); toast(shareInviteToast(inv, 0), inv.sent || inv.already ? undefined : 'err'); ctx.go(`/deals/${deal.id}/inbox/${t.id}`); return;
        }
        const ids = [...new Set([...checked, ...(picked ? [picked.id] : [])])];
        if (!ids.length) throw new Error('Pick at least one person, or type a name and email.');
        const t = await api.createThread(deal.id, { subject: f.get('subject'), participantIds: ids, body: f.get('body') }); closeModal(); toast('Conversation started'); ctx.go(`/deals/${deal.id}/inbox/${t.id}`); }));
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
    // FF-070 (Janine, Nov 12): the thread is marked read above; ask the shell to recount the Messages / Inbox badge now, not on the next refresh
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') window.dispatchEvent(new CustomEvent('cla:thread-read', { detail: { dealId: deal.id } }));
    $$('[data-open]', root).forEach((a) => a.addEventListener('click', guard(async (e) => { e.preventDefault(); downloadNamed(await api.getDocumentContent(a.dataset.open)); })));
    const f = $('#rf', root); if (!f) return; const ed = mountEditor(f); const send = $('[data-send]', f);
    const fl = mountFiles(f, (b) => { send.disabled = b > 0; send.textContent = b > 0 ? 'Waiting for upload\u2026' : 'Send'; });
    f.addEventListener('submit', guard(async (e) => { e.preventDefault(); if (fl.busy) throw new Error('Wait for the upload to finish.'); if (!ed.text && !fl.files.length) throw new Error('Write a message first.');
      if (typeof api.sendMessage !== 'function') throw new Error('Sending a portal message is not available on this sign-in.');
      const sent = await api.sendMessage({ threadId: t.id, bodyHtml: ed.html, files: fl.files });
      if (sent && sent.failedFiles && sent.failedFiles.length) toast(`${sent.savedFiles.length} file(s) attached. ${sent.failedFiles.map((z) => z.name + ': ' + z.reason).join(' ')} Nothing was emailed.`);
      refresh(); }));
  } };
}

async function gmailThread({ api, user, deal, refresh, params }, ref) {
  const [emails, cursor, g] = await Promise.all([
    api.listDealEmails ? api.listDealEmails(deal.id).catch(() => []) : Promise.resolve([]),
    api.emailReadCursor ? api.emailReadCursor(deal.id).catch(() => ({ readAt: '' })) : Promise.resolve({ readAt: '' }),
    canUseGmail(user) && api.getGmailStatus ? api.getGmailStatus().catch(() => ({ connected: false })) : Promise.resolve({ connected: false }),
  ]);
  const readAt = cursor && cursor.readAt || '';
  const items = shapeGmailThreads(emails || [], { userId: user.id, readAt });
  const t = items.find((x) => x.mailboxEmail === ref.mailboxEmail && x.gmailThreadId === ref.gmailThreadId);
  if (!t) {
    const body = html`<div class="box-title"><h2><span class="h-ico"></span>Email</h2><a class="ghost right" href="#/deals/${deal.id}/inbox">All conversations</a></div>
      <p class="muted">That email is not on this file, or you do not have access to it.</p>`;
    return { title: 'Email', crumbs: [[tabTitle(deal), `#/deals/${deal.id}/inbox`], ['Email']], body, mount() {} };
  }
  if (api.markDealEmailsRead) { try { await api.markDealEmailsRead(deal.id); } catch (e) { /* list still shows */ } }
  const canReply = !!(canUseGmail(user) && g && g.connected && !viewOnly(user));
  const msgs = t.emails.map((e) => {
    const fresh = isUnreadFileEmail(e, { userId: user.id, readAt });
    const names = e.attachmentNames || e.attachment_names || [];
    return html`<div class="bubble ${e.direction === 'out' ? 'mine' : ''}" data-mail-msg="${e.id}" data-mail-dir="${e.direction}"${fresh ? raw(' data-mail-unread="1"') : ''}><div class="who"><strong>${e.fromName || e.fromEmail}</strong> <span class="muted small">&lt;${e.fromEmail}&gt; · ${fmtDateTime(e.sentAt)}</span>${e.direction === 'in' ? html` ${pill('Received', 'info')}` : html` ${pill('Sent', 'ok')}`}${fresh ? html` ${pill('New', 'info')}` : ''}</div>
      <div class="text muted small">To: ${(e.toEmails || []).join(', ') || '—'}${(e.ccEmails || []).length ? html` · Cc: ${(e.ccEmails || []).join(', ')}` : ''}${(e.bccEmails || []).length ? html` · Bcc: ${(e.bccEmails || []).join(', ')}` : ''}</div>
      <div class="text">${e.snippet || ''}</div>
      ${names.length ? html`<p class="small" data-mail-attachments>Attachments: ${names.join(', ')} <a href="#/deals/${deal.id}/documents">Documents</a> (CLA staff only)</p>` : ''}
      <button type="button" class="linkish small" data-mail-show="${e.id}">Show message</button>
      ${canReply ? html` <button type="button" class="linkish small" data-mail-reply="${e.id}">Reply</button>` : ''}</div>
      <div data-mail-body="${e.id}" hidden></div>`;
  });
  const body = html`<div class="box-title"><h2><span class="h-ico"></span>${t.subject} ${pill('Email', 'info')}</h2><a class="ghost right" href="#/deals/${deal.id}/inbox">All conversations</a></div>
    <p class="muted">Gmail thread on this order${t.mailboxEmail ? html` · mailbox ${t.mailboxEmail}` : ''}</p>
    <div class="thread" data-gmail-thread="${t.gmailThreadId}">${msgs}</div>
    ${canReply ? html`<p class="muted small">Reply sends from your connected Gmail and stays in this thread.</p>` : html`<p class="muted" data-mail-reply-hint>To reply, use the email you received. Your reply will show here after it is delivered.</p>`}
    ${canReply ? html`<p><button type="button" class="ghost" data-mail-sync>Check for replies</button></p>` : ''}`;
  return { title: t.subject, crumbs: [[tabTitle(deal), `#/deals/${deal.id}/inbox`], [t.subject]], body, mount(root) {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') window.dispatchEvent(new CustomEvent('cla:thread-read', { detail: { dealId: deal.id } }));
    const byId = new Map(t.emails.map((e) => [e.id, e]));
    $$('[data-mail-show]', root).forEach((b) => b.addEventListener('click', () => {
      const box = root.querySelector(`[data-mail-body="${b.dataset.mailShow}"]`); const e = byId.get(b.dataset.mailShow);
      if (!box || !e) return;
      if (box.hidden && !box.firstChild) { const f = document.createElement('iframe'); f.setAttribute('sandbox', ''); f.setAttribute('referrerpolicy', 'no-referrer'); f.className = 'mail-frame';
        f.style.cssText = 'width:100%;min-height:260px;border:1px solid #ddd;background:#fff'; f.srcdoc = `<base target="_blank">${e.bodyHtml || e.body_html || ''}`; box.appendChild(f); }
      box.hidden = !box.hidden; b.textContent = box.hidden ? 'Show message' : 'Hide message';
    }));
    $$('[data-mail-reply]', root).forEach((b) => b.addEventListener('click', guard(() => {
      const e = byId.get(b.dataset.mailReply);
      const to = e.direction === 'in' ? [e.fromEmail] : (e.toEmails || []);
      return composeEmailModal({ api, deal, user, gmail: g, done: refresh }, { to, cc: e.direction === 'in' ? (e.ccEmails || []).filter((x) => x !== (g && g.mailbox)) : (e.ccEmails || []), subject: reSubject(e.subject), html: '<p><br></p>', replyToEmailId: e.id });
    })));
    const s = $('[data-mail-sync]', root);
    if (s) s.addEventListener('click', guard(async () => { s.disabled = true; try { const r = await api.checkGmailReplies(); toast(r.stored ? `${r.stored} new email${r.stored === 1 ? '' : 's'} added` : 'No new replies'); if (r.stored) refresh(); } finally { s.disabled = false; } }));
  } };
}
