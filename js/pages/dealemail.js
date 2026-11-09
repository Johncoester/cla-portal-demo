// File > Email tab (John, Nov 9: Gmail phase 1, CLA Portal Live Test). Staff send email from their OWN @clatitle.com Gmail inside the file;
// replies in the same Gmail thread come back to the file (checked every few minutes, or "Check for replies"). Received attachments are saved to
// Documents (staff only). The server refuses every address that is not a test address on Live Test, and never emails wire details.
import { html, raw, esc, $, $$, guard, modal, closeModal, toast, fmtDateTime, fmtSize, pill } from '../ui.js?v=202611070139';
import { editorHtml, mountEditor } from './compose.js?v=202611090935';
import { canUseGmail, isAllowedTestRecipient, introRecipients, introTemplate, hasSignature, TEST_ALLOWLIST_NOTE, fileTag } from '../data/gmail-email.js?v=202611092200';
import { applyFileTemplate } from '../data/file-email-templates.js?v=202611092200';
const ROLE = { 'Client-Buyer': 'Buyer', 'Client-Seller': 'Seller', 'Buyer Agent': "Buyer's agent", 'Listing Agent': 'Listing agent', 'Transaction Coordinator': 'TC' };
const list = (s) => String(s || '').split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
const isWire = (d) => d.wireInstructions || /\bwir(e|ed|es|ing)\b|wire[_ -]?instruction/i.test(d.name || '');
const reSubject = (s) => (/^re:/i.test(String(s || '').trim()) ? String(s).trim() : `Re: ${String(s || '').trim()}`);

export async function render({ api, deal, user, refresh: reload }) {
  if (!canUseGmail(user) || !api.listDealEmails) throw new Error('That page does not exist.');
  const [g, emails] = await Promise.all([api.getGmailStatus().catch(() => ({ available: false })), api.listDealEmails(deal.id).catch(() => [])]);
  const threads = new Map();
  for (const e of emails) { const k = `${e.mailboxEmail}|${e.gmailThreadId}`; if (!threads.has(k)) threads.set(k, []); threads.get(k).push(e); }
  const groups = [...threads.values()].map((ms) => ms.sort((a, b) => String(a.sentAt).localeCompare(String(b.sentAt))));
  groups.sort((a, b) => String(b[b.length - 1].sentAt).localeCompare(String(a[a.length - 1].sentAt)));
  const row = (e) => html`<li class="mail-msg" data-mail-msg="${e.id}" data-mail-dir="${e.direction}">
      <div class="small">${e.direction === 'in' ? pill('Received', 'info') : pill('Sent', 'ok')} <strong>${e.fromName || e.fromEmail}</strong> &lt;${e.fromEmail}&gt; to ${(e.toEmails || []).join(', ')}${(e.ccEmails || []).length ? html`, cc ${(e.ccEmails || []).join(', ')}` : ''}
        <span class="muted">${fmtDateTime(e.sentAt)}</span>${e.templateKey === 'intro' ? html` ${pill('Introduction', '')}` : e.templateKey ? html` ${pill('Template', '')}` : ''}</div>
      <div class="small muted">${e.snippet}</div>
      ${(e.attachmentNames || []).length ? html`<div class="small" data-mail-attachments>Attachments: ${(e.attachmentNames || []).join(', ')} <a href="#/deals/${deal.id}/documents">Documents</a></div>` : ''}
      <button type="button" class="linkish small" data-mail-show="${e.id}">Show message</button> ${g.connected ? html`<button type="button" class="linkish small" data-mail-reply="${e.id}">Reply</button>` : ''}
      <div data-mail-body="${e.id}" hidden></div></li>`;
  const body = html`<div class="box-title"><h2><span class="h-ico"></span>Email</h2></div>
    <div class="card" data-email-tab>
      ${g.connected ? html`<p data-mail-from>Sending from <strong>${g.mailbox}</strong>${g.status === 'needs_reconnect' ? html` <span class="pill bad">connect again on <a href="#/profile">Profile Setting</a></span>` : ''}</p>`
        : html`<div class="notice warn" data-mail-connect>Connect your @clatitle.com Gmail first: <a href="#/profile">Profile Setting &gt; Gmail</a>. You can still check an email below (nothing is sent).</div>`}
      <p class="small muted" data-mail-allowlist>${TEST_ALLOWLIST_NOTE} Subjects get ${fileTag(deal.fileNumber, deal)} so replies are easy to find.</p>
      <p><button type="button" class="m-btn" data-mail-new>New email</button> <button type="button" class="m-btn" data-mail-intro>Introduction email</button>
        ${g.connected ? html`<button type="button" class="ghost" data-mail-sync>Check for replies</button>` : ''}</p>
    </div>
    ${groups.length ? groups.map((ms) => html`<div class="card mail-thread" data-mail-thread="${ms[0].gmailThreadId}"><h3 class="small">${ms[ms.length - 1].subject} <span class="muted">(${ms.length} message${ms.length === 1 ? '' : 's'}, ${ms[0].mailboxEmail})</span></h3><ul class="plain">${ms.map(row)}</ul></div>`)
      : html`<p class="muted" data-mail-none>No email on this file yet.</p>`}`;
  return { title: 'Email', crumbs: [['Email']], body, mount(root) {
    const byId = new Map(emails.map((e) => [e.id, e]));
    $$('[data-mail-show]', root).forEach((b) => b.addEventListener('click', () => {
      const box = $(`[data-mail-body="${b.dataset.mailShow}"]`, root); const e = byId.get(b.dataset.mailShow);
      if (box.hidden && !box.firstChild) { const f = document.createElement('iframe'); f.setAttribute('sandbox', ''); f.setAttribute('referrerpolicy', 'no-referrer'); f.className = 'mail-frame';
        f.style.cssText = 'width:100%;min-height:260px;border:1px solid #ddd;background:#fff'; f.srcdoc = `<base target="_blank">${e.bodyHtml || ''}`; box.appendChild(f); }
      box.hidden = !box.hidden; b.textContent = box.hidden ? 'Show message' : 'Hide message'; }));
    const refresh = () => { if (typeof reload === 'function') reload(); else location.reload(); };
    $('[data-mail-new]', root).addEventListener('click', guard(() => composeEmailModal({ api, deal, user, gmail: g, done: refresh })));
    $('[data-mail-intro]', root).addEventListener('click', guard(() => { const rs = introRecipients(deal); const t = introTemplate(deal, { firstName: g.firstName || user.firstName, lastName: g.lastName || user.lastName, role: user.role }, rs, { signature: hasSignature(g.signatureHtml) });
      return composeEmailModal({ api, deal, user, gmail: g, done: refresh }, { to: rs.map((r) => r.email), subject: t.subject, html: t.html, templateKey: t.key }); }));
    $$('[data-mail-reply]', root).forEach((b) => b.addEventListener('click', guard(() => { const e = byId.get(b.dataset.mailReply);
      const to = e.direction === 'in' ? [e.fromEmail] : (e.toEmails || []);
      return composeEmailModal({ api, deal, user, gmail: g, done: refresh }, { to, cc: e.direction === 'in' ? (e.ccEmails || []).filter((x) => x !== g.mailbox) : (e.ccEmails || []), subject: reSubject(e.subject), html: '<p><br></p>', replyToEmailId: e.id }); })));
    const s = $('[data-mail-sync]', root);
    if (s) s.addEventListener('click', guard(async () => { s.disabled = true; try { const r = await api.checkGmailReplies(); toast(r.stored ? `${r.stored} new email${r.stored === 1 ? '' : 's'} added` : 'No new replies'); if (r.stored) refresh(); } finally { s.disabled = false; } }));
  } };
}

// compose: From = your connected Gmail; To / Cc / Bcc; file parties to click in; subject; message; attach file documents (never wire instructions)
export async function composeEmailModal({ api, deal, user, gmail, done }, pre = {}) {
  const docs = (await api.listDocuments(deal.id).catch(() => [])).filter((d) => d.hasContent !== false);
  const parties = introRecipients(deal).concat((deal.participants || []).filter((p) => !p.removed && p.contact && p.contact.email && !p.contact.contactHidden && !Object.keys(ROLE).includes(p.role))
    .map((p) => ({ name: `${p.contact.firstName || ''} ${p.contact.lastName || ''}`.trim(), email: String(p.contact.email).toLowerCase(), role: p.role })));
  const templates = (api.listFileEmailTemplates ? (await api.listFileEmailTemplates({ includeInactive: false }).catch(() => [])) : []).filter((t) => t.scope === 'shared' && t.active !== false);
  const tplOpts = templates.map((t) => html`<option value="${t.id}">${t.name}${t.category ? ` (${t.category})` : ''}</option>`);
  let chosenTemplateKey = pre.templateKey || null;
  const m = modal(pre.replyToEmailId ? 'Reply' : pre.templateKey === 'intro' ? 'Introduction email' : 'New email', html`<form data-mail-compose onsubmit="return false" class="form-grid">
    <label class="span2">From<input value="${gmail.connected ? gmail.mailbox : 'Connect Gmail on Profile Setting first'}" disabled data-mail-compose-from></label>
    <label class="span2">To<input name="to" value="${(pre.to || []).join(', ')}" placeholder="name@example.com, ..." data-mail-to></label>
    <label>Cc<input name="cc" value="${(pre.cc || []).join(', ')}" data-mail-cc></label><label>Bcc<input name="bcc" data-mail-bcc></label>
    ${parties.length ? html`<div class="span2 small">On this file: ${parties.map((p) => html`<button type="button" class="ghost small" data-mail-add="${p.email}" title="${p.email}">+ ${p.name || p.email} (${ROLE[p.role] || p.role})${isAllowedTestRecipient(p.email) ? '' : raw(' <span class="pill warn">not a test address</span>')}</button> `)}</div>` : ''}
    ${templates.length && !pre.replyToEmailId ? html`<label class="span2">Use template<select data-mail-template><option value="">(blank — no template)</option>${tplOpts}</select></label>
      <div class="span2 notice warn" data-mail-tpl-warn hidden></div>` : ''}
    <label class="span2">Subject<input name="subject" maxlength="250" value="${pre.subject || ''}" data-mail-subject></label>
    <p class="span2 small muted">${fileTag(deal.fileNumber, deal)} is added to the subject. Your portal signature is added at the bottom.</p>
    <div class="span2" data-mail-editor>${editorHtml('mail-rte')}</div>
    ${docs.length ? html`<fieldset class="span2" data-mail-docs><legend class="small">Attach documents from this file</legend>${docs.map((d) => html`<label class="small">${isWire(d)
      ? html`<input type="checkbox" disabled> ${d.name} <span class="pill bad">wire instructions are never emailed</span>` : html`<input type="checkbox" value="${d.id}" data-mail-doc> ${d.name} <span class="muted">${fmtSize(d.size || 0)}</span>`}</label><br>`)}</fieldset>` : ''}
    <p class="span2 small muted" data-mail-note>${TEST_ALLOWLIST_NOTE}</p>
    <div class="span2" data-mail-check-result></div>
    <div class="span2"><button type="button" class="ghost" data-mail-check>Check (does not send)</button> <button type="button" class="m-btn" data-mail-send ${gmail.connected ? '' : raw('disabled title="Connect Gmail first"')}>Send</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`, { wide: true });
  const ed = mountEditor($('[data-mail-editor]', m)); ed.box.innerHTML = pre.html || '<p><br></p>';
  $$('[data-mail-add]', m).forEach((b) => b.addEventListener('click', () => { const i = $('[data-mail-to]', m); const cur = list(i.value); if (!cur.includes(b.dataset.mailAdd)) cur.push(b.dataset.mailAdd); i.value = cur.join(', '); }));
  const tplSel = $('[data-mail-template]', m);
  const warn = $('[data-mail-tpl-warn]', m);
  const showWarn = (msgs) => { if (!warn) return; const bits = (msgs || []).filter(Boolean); if (!bits.length) { warn.hidden = true; warn.textContent = ''; return; }
    warn.hidden = false; warn.textContent = bits.join(' ') + ' You can edit before sending.'; };
  const applyChosen = () => {
    if (!tplSel || !tplSel.value) { chosenTemplateKey = null; showWarn([]); return; }
    const t = templates.find((x) => x.id === tplSel.value); if (!t) return;
    const sender = { firstName: gmail.firstName || user.firstName, lastName: gmail.lastName || user.lastName };
    const toNow = list($('[data-mail-to]', m).value);
    const applied = applyFileTemplate(t, deal, sender, { toEmails: toNow, documents: docs, applyDefaultRecipients: toNow.length === 0 });
    if (applied.suggestedTo && applied.suggestedTo.length && toNow.length === 0) $('[data-mail-to]', m).value = applied.suggestedTo.join(', ');
    // re-merge recipient_first_name after To fill
    const to2 = list($('[data-mail-to]', m).value);
    const applied2 = applyFileTemplate(t, deal, sender, { toEmails: to2, documents: docs, applyDefaultRecipients: false });
    $('[data-mail-subject]', m).value = applied2.subject;
    ed.box.innerHTML = applied2.html || '<p><br></p>';
    chosenTemplateKey = applied2.templateKey;
    // auto-check matched documents; leave others as they were
    const want = new Set(applied2.attachDocumentIds || []);
    $$('[data-mail-doc]', m).forEach((c) => { if (want.has(c.value)) c.checked = true; });
    showWarn(applied2.warnings);
  };
  if (tplSel) {
    tplSel.addEventListener('change', applyChosen);
    $('[data-mail-to]', m).addEventListener('change', () => { if (tplSel.value) applyChosen(); });
    $('[data-mail-to]', m).addEventListener('blur', () => { if (tplSel.value) applyChosen(); });
  }
  const input = (dryRun) => ({ dealId: deal.id, to: list($('[data-mail-to]', m).value), cc: list($('[data-mail-cc]', m).value), bcc: list($('[data-mail-bcc]', m).value),
    subject: $('[data-mail-subject]', m).value, html: ed.html, documentIds: $$('[data-mail-doc]', m).filter((c) => c.checked).map((c) => c.value), templateKey: chosenTemplateKey, replyToEmailId: pre.replyToEmailId || null, dryRun });
  const out = $('[data-mail-check-result]', m);
  const show = (cls, msg) => { out.innerHTML = `<div class="notice ${cls}">${esc(msg)}</div>`; };
  $('[data-mail-check]', m).addEventListener('click', async () => {
    try { const r = await api.sendDealEmail(input(true)); show('info', `OK to send: from ${r.from || '(connect Gmail first)'} to ${[...r.to, ...r.cc, ...r.bcc].join(', ')}. Subject: ${r.subject}.${r.attachments.length ? ` ${r.attachments.length} attachment(s).` : ''}${r.signatureAdded ? ' Signature added.' : ''} Nothing was sent.`); }
    catch (e) { show('bad', e.message); } });
  const send = $('[data-mail-send]', m);
  send.addEventListener('click', async () => {
    send.disabled = true;
    try { const r = await api.sendDealEmail(input(false)); closeModal(); toast(`Sent from ${r.from}`); if (done) done(r); }
    catch (e) { show('bad', e.message); send.disabled = false; } });
  return m;
}
