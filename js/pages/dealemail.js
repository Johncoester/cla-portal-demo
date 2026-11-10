// File > Email tab (John, Nov 9: Gmail phase 1, CLA Portal Live Test). Staff send email from their OWN @clatitle.com Gmail inside the file;
// replies in the same Gmail thread come back to the file (checked every few minutes, or "Check for replies"). Attachments on a reply, on
// mail sent from Gmail, and files added from the computer while composing are saved to Documents for CLA staff only, once. A file picked
// from Documents is not saved again. The server refuses every address that is not a test address on Live Test, and never emails wire details.
import { html, raw, esc, toText, $, $$, guard, modal, closeModal, toast, fmtDateTime, fmtSize, pill } from '../ui.js?v=202611070139';
import { editorHtml, mountEditor } from './compose.js?v=202611110900';
import { canUseGmail, isAllowedTestRecipient, introRecipients, introTemplate, hasSignature, TEST_ALLOWLIST_NOTE, fileTag } from '../data/gmail-email.js?v=202611091801';
import { applyFileTemplate } from '../data/file-email-templates.js?v=202611121200';
import { countUnreadEmails, emailMatchesQuery, isUnreadFileEmail } from '../data/file-email-unread.js?v=202611100930';
const ROLE = { 'Client-Buyer': 'Buyer', 'Client-Seller': 'Seller', 'Buyer Agent': "Buyer's agent", 'Listing Agent': 'Listing agent', 'Transaction Coordinator': 'TC' };
const list = (s) => String(s || '').split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
// A template fills To only while that box is empty. An address the sender adds, or a Cc, is kept.
export function recipientsAfterTemplate(current, suggested, { fillIfEmpty = false } = {}) {
  const cur = list(current);
  if (fillIfEmpty && !cur.length) return list(Array.isArray(suggested) ? suggested.join(', ') : suggested);
  return cur;
}
const isWire = (d) => d.wireInstructions || /\bwir(e|ed|es|ing)\b|wire[_ -]?instruction/i.test(d.name || '');
const reSubject = (s) => (/^re:/i.test(String(s || '').trim()) ? String(s).trim() : `Re: ${String(s || '').trim()}`);

export async function render({ api, deal, user, refresh: reload }) {
  if (!canUseGmail(user) || !api.listDealEmails) throw new Error('That page does not exist.');
  const [g, emails, cursor] = await Promise.all([
    api.getGmailStatus().catch(() => ({ available: false })),
    api.listDealEmails(deal.id).catch(() => []),
    api.emailReadCursor ? api.emailReadCursor(deal.id).catch(() => ({ readAt: '' })) : Promise.resolve({ readAt: '' }),
  ]);
  const userId = user && user.id || '';
  const readAt = cursor && cursor.readAt || '';
  const unreadN = countUnreadEmails(emails, { userId, readAt });
  // Viewing the tab marks the file read for this person. The count above is what was unread when the page opened.
  // A missing deal_email_reads table is remembered in this browser instead; a failed mark does not block the list.
  if (api.markDealEmailsRead) { try { await api.markDealEmailsRead(deal.id); } catch (e) { /* list still shows */ } }
  const threads = new Map();
  for (const e of emails) { const k = `${e.mailboxEmail}|${e.gmailThreadId}`; if (!threads.has(k)) threads.set(k, []); threads.get(k).push(e); }
  const groups = [...threads.values()].map((ms) => ms.sort((a, b) => String(a.sentAt).localeCompare(String(b.sentAt))));
  groups.sort((a, b) => String(b[b.length - 1].sentAt).localeCompare(String(a[a.length - 1].sentAt)));
  const row = (e) => {
    const fresh = isUnreadFileEmail(e, { userId, readAt });
    return html`<li class="mail-msg${fresh ? ' unread' : ''}" data-mail-msg="${e.id}" data-mail-dir="${e.direction}"${fresh ? raw(' data-mail-unread="1"') : ''}>
      <div class="small">${e.direction === 'in' ? pill('Received', 'info') : pill('Sent', 'ok')} <strong>${e.fromName || e.fromEmail}</strong> &lt;${e.fromEmail}&gt; to ${(e.toEmails || []).join(', ')}${(e.ccEmails || []).length ? html`, cc ${(e.ccEmails || []).join(', ')}` : ''}
        <span class="muted">${fmtDateTime(e.sentAt)}</span>${fresh ? html` ${pill('New', 'info')}` : ''}${e.templateKey === 'intro' ? html` ${pill('Introduction', '')}` : e.templateKey ? html` ${pill('Template', '')}` : ''}</div>
      <div class="small muted">${e.snippet}</div>
      ${(e.attachmentNames || []).length ? html`<div class="small" data-mail-attachments>Attachments: ${(e.attachmentNames || []).join(', ')} <a href="#/deals/${deal.id}/documents">Documents</a> (CLA staff only)</div>` : ''}
      <button type="button" class="linkish small" data-mail-show="${e.id}">Show message</button> ${g.connected ? html`<button type="button" class="linkish small" data-mail-reply="${e.id}">Reply</button>` : ''}
      <div data-mail-body="${e.id}" hidden></div></li>`;
  };
  const body = html`<div class="box-title"><h2><span class="h-ico"></span>Email${unreadN ? html` <span class="nav-badge" data-mail-unread-count>${unreadN} unread</span>` : ''}</h2></div>
    <div class="card" data-email-tab>
      <label>Search email on this file<input type="search" data-mail-search placeholder="Subject, from, or message" aria-label="Search email on this file"></label>
      ${g.connected ? html`<p data-mail-from>Sending from <strong>${g.mailbox}</strong>${g.status === 'needs_reconnect' ? html` <span class="pill bad">connect again on <a href="#/profile">Profile Setting</a></span>` : ''}</p>`
        : html`<div class="notice warn" data-mail-connect>Connect your @clatitle.com Gmail first: <a href="#/profile">Profile Setting &gt; Gmail</a>. You can still check an email below (nothing is sent).</div>`}
      <p class="small muted" data-mail-allowlist>${TEST_ALLOWLIST_NOTE} Subjects get ${fileTag(deal.fileNumber, deal)} so replies are easy to find.</p>
      <p><button type="button" class="m-btn" data-mail-new>New email</button> <button type="button" class="m-btn" data-mail-intro>Introduction email</button>
        ${g.connected ? html`<button type="button" class="ghost" data-mail-sync>Check for replies</button>` : ''}</p>
    </div>
    ${groups.length ? groups.map((ms) => html`<div class="card mail-thread" data-mail-thread="${ms[0].gmailThreadId}"><h3 class="small">${ms[ms.length - 1].subject} <span class="muted">(${ms.length} message${ms.length === 1 ? '' : 's'}, ${ms[0].mailboxEmail})</span></h3><ul class="plain">${ms.map(row)}</ul></div>`)
      : html`<p class="muted" data-mail-none>No email on this file yet.</p>`}
    <p class="muted" data-mail-search-empty hidden>No email matches that search.</p>`;
  return { title: 'Email', crumbs: [['Email']], body, mount(root) {
    const byId = new Map(emails.map((e) => [e.id, e]));
    const search = $('[data-mail-search]', root);
    const applySearch = () => {
      const query = search ? search.value : '';
      let shown = 0;
      $$('[data-mail-thread]', root).forEach((card) => {
        let hit = 0;
        $$('[data-mail-msg]', card).forEach((li) => {
          const keep = emailMatchesQuery(byId.get(li.dataset.mailMsg), query);
          li.hidden = !keep;
          if (keep) hit += 1;
        });
        card.hidden = hit === 0;
        if (hit) shown += 1;
      });
      const empty = $('[data-mail-search-empty]', root);
      if (empty) empty.hidden = shown > 0 || !String(query || '').trim();
    };
    if (search) { search.addEventListener('input', applySearch); search.addEventListener('search', applySearch); }
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
  // Email tab uses readFileShell (participants: []). Load parties + processor profile email for templates / party chips only.
  let mergeDeal = deal;
  if (api.loadDealEmailContext && (!(deal.participants && deal.participants.length) || !deal.processorEmail)) {
    try {
      const ctx = await api.loadDealEmailContext(deal.id);
      mergeDeal = {
        ...deal,
        participants: (deal.participants && deal.participants.length) ? deal.participants : (ctx.participants || []),
        processorEmail: deal.processorEmail || ctx.processorEmail || '',
        processorName: deal.processorName || ctx.processorName || deal.processorName || '',
      };
    } catch (e) { /* keep the shell deal; warnings will explain missing parties */ }
  }
  const parties = introRecipients(mergeDeal).concat((mergeDeal.participants || []).filter((p) => !p.removed && p.contact && p.contact.email && !p.contact.contactHidden && !Object.keys(ROLE).includes(p.role))
    .map((p) => ({ name: `${p.contact.firstName || ''} ${p.contact.lastName || ''}`.trim(), email: String(p.contact.email).toLowerCase(), role: p.role })));
  const templates = (api.listFileEmailTemplates ? (await api.listFileEmailTemplates({ includeInactive: false }).catch(() => [])) : []).filter((t) => t.scope === 'shared' && t.active !== false);
  const tplOpts = templates.map((t) => html`<option value="${t.id}">${t.name}${t.category ? ` (${t.category})` : ''}</option>`);
  let chosenTemplateKey = pre.templateKey || null;
  const m = modal(pre.replyToEmailId ? 'Reply' : pre.templateKey === 'intro' ? 'Introduction email' : 'New email', html`<form data-mail-compose onsubmit="return false" class="form-grid">
    <label class="span2">From<input value="${gmail.connected ? gmail.mailbox : 'Connect Gmail on Profile Setting first'}" disabled data-mail-compose-from></label>
    <label class="span2">To<input name="to" value="${(pre.to || []).join(', ')}" placeholder="name@example.com, ..." data-mail-to></label>
    <label>Cc<input name="cc" value="${(pre.cc || []).join(', ')}" data-mail-cc></label><label>Bcc<input name="bcc" data-mail-bcc></label>
    <div class="span2 small" data-mail-people></div>
    ${templates.length && !pre.replyToEmailId ? html`<label class="span2">Use template<select data-mail-template><option value="">(blank — no template)</option>${tplOpts}</select></label>
      <div class="span2 notice warn" data-mail-tpl-warn hidden></div>` : ''}
    <label class="span2">Subject<input name="subject" maxlength="250" value="${pre.subject || ''}" data-mail-subject></label>
    <p class="span2 small muted">${fileTag(deal.fileNumber, deal)} is added to the subject. Your portal signature is added at the bottom.</p>
    <div class="span2" data-mail-editor>${editorHtml('mail-rte')}</div>
    ${docs.length ? html`<fieldset class="span2" data-mail-docs><legend class="small">Attach documents from this file</legend>${docs.map((d) => html`<label class="small">${isWire(d)
      ? html`<input type="checkbox" disabled> ${d.name} <span class="pill bad">wire instructions are never emailed</span>` : html`<input type="checkbox" value="${d.id}" data-mail-doc> ${d.name} <span class="muted">${fmtSize(d.size || 0)}</span>`}</label><br>`)}</fieldset>` : ''}
    <label class="span2">Attach from your computer <span class="muted small">(saved to Documents, CLA staff only, when you send)</span><input type="file" data-mail-files multiple></label>
    <ul class="plain small" data-mail-file-list></ul>
    <p class="span2 small muted" data-mail-note>${TEST_ALLOWLIST_NOTE}</p>
    <div class="span2" data-mail-check-result></div>
    <div class="span2"><button type="button" class="ghost" data-mail-check>Check (does not send)</button> <button type="button" class="m-btn" data-mail-send ${gmail.connected ? '' : raw('disabled title="Connect Gmail first"')}>Send</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`, { wide: true });
  const ed = mountEditor($('[data-mail-editor]', m)); ed.box.innerHTML = pre.html || '<p><br></p>';
  const putAddr = (field, addr, on) => {
    const input = $(field === 'cc' ? '[data-mail-cc]' : '[data-mail-to]', m);
    const cur = list(input.value).filter((x) => x.toLowerCase() !== String(addr).toLowerCase());
    if (on) cur.push(addr);
    input.value = cur.join(', ');
  };
  const paintPeople = () => {
    const box = $('[data-mail-people]', m); if (!box) return;
    const to = list($('[data-mail-to]', m).value);
    const cc = list($('[data-mail-cc]', m).value);
    const chip = (field, addr) => html`<span class="pill" data-mail-chip="${field}">${addr} <button type="button" class="ghost small" data-mail-drop="${field}" data-mail-addr="${addr}" aria-label="Remove ${addr} from ${field === 'cc' ? 'Cc' : 'To'}">Remove</button></span>`;
    box.innerHTML = toText(html`<div data-mail-to-chips>To: ${to.length ? to.map((addr) => chip('to', addr)) : html`<span class="muted">none</span>`}</div>
      <div data-mail-cc-chips>Cc: ${cc.length ? cc.map((addr) => chip('cc', addr)) : html`<span class="muted">none</span>`}</div>
      ${parties.length ? html`<div>On this file: ${parties.map((p) => html`<span>${p.name || p.email} (${ROLE[p.role] || p.role}) <button type="button" class="ghost small" data-mail-put="to" data-mail-addr="${p.email}">Add to To</button> <button type="button" class="ghost small" data-mail-put="cc" data-mail-addr="${p.email}">Add to Cc</button></span> `)}</div>` : ''}`);
    $$('[data-mail-drop]', box).forEach((b) => b.addEventListener('click', () => { putAddr(b.dataset.mailDrop, b.dataset.mailAddr, false); paintPeople(); }));
    $$('[data-mail-put]', box).forEach((b) => b.addEventListener('click', () => { putAddr(b.dataset.mailPut, b.dataset.mailAddr, true); paintPeople(); }));
  };
  paintPeople();
  ['[data-mail-to]', '[data-mail-cc]'].forEach((sel) => { const el = $(sel, m); if (el) el.addEventListener('change', paintPeople); });
  const tplSel = $('[data-mail-template]', m);
  const warn = $('[data-mail-tpl-warn]', m);
  const showWarn = (msgs) => { if (!warn) return; const bits = (msgs || []).filter(Boolean); if (!bits.length) { warn.hidden = true; warn.textContent = ''; return; }
    warn.hidden = false; warn.textContent = bits.join(' ') + ' You can edit before sending.'; };
  const applyChosen = () => {
    if (!tplSel || !tplSel.value) { chosenTemplateKey = null; showWarn([]); return; }
    const t = templates.find((x) => x.id === tplSel.value); if (!t) return;
    const sender = { firstName: gmail.firstName || user.firstName, lastName: gmail.lastName || user.lastName };
    const toNow = recipientsAfterTemplate($('[data-mail-to]', m).value, [], { fillIfEmpty: false });
    const opts = { toEmails: toNow, documents: docs, applyDefaultRecipients: toNow.length === 0, processorEmail: mergeDeal.processorEmail };
    const applied = applyFileTemplate(t, mergeDeal, sender, opts);
    const kept = recipientsAfterTemplate(toNow.join(', '), applied.suggestedTo, { fillIfEmpty: toNow.length === 0 });
    const ccNow = list($('[data-mail-cc]', m).value);
    const keptCc = recipientsAfterTemplate(ccNow.join(', '), applied.suggestedCc, { fillIfEmpty: ccNow.length === 0 });
    $('[data-mail-to]', m).value = kept.join(', ');
    $('[data-mail-cc]', m).value = keptCc.join(', ');
    paintPeople();
    const to2 = kept;
    const applied2 = applyFileTemplate(t, mergeDeal, sender, { toEmails: to2, documents: docs, applyDefaultRecipients: false, processorEmail: mergeDeal.processorEmail });
    $('[data-mail-subject]', m).value = applied2.subject;
    ed.box.innerHTML = applied2.html || '<p><br></p>';
    chosenTemplateKey = applied2.templateKey;
    const want = new Set(applied2.attachDocumentIds || []);
    $$('[data-mail-doc]', m).forEach((c) => { if (want.has(c.value)) c.checked = true; });
    showWarn([...(applied.warnings || []).filter((w) => /No .+ with an email/.test(w)), ...applied2.warnings]);
  };
  if (tplSel) tplSel.addEventListener('change', applyChosen);
  const computerFiles = () => [...((($('[data-mail-files]', m) || {}).files) || [])];
  const paintFiles = () => { const listEl = $('[data-mail-file-list]', m); if (!listEl) return; const files = computerFiles();
    listEl.innerHTML = files.length ? files.map((f) => `<li data-mail-local>${esc(f.name)} <span class="muted">${fmtSize(f.size || 0)}</span></li>`).join('') : ''; };
  const fileInput = $('[data-mail-files]', m); if (fileInput) fileInput.addEventListener('change', paintFiles);
  const readAsDataUrl = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Could not read the file.')); r.readAsDataURL(file); });
  const input = (dryRun) => ({ dealId: deal.id, to: list($('[data-mail-to]', m).value), cc: list($('[data-mail-cc]', m).value), bcc: list($('[data-mail-bcc]', m).value),
    subject: $('[data-mail-subject]', m).value, html: ed.html, documentIds: $$('[data-mail-doc]', m).filter((c) => c.checked).map((c) => c.value), templateKey: chosenTemplateKey, replyToEmailId: pre.replyToEmailId || null, dryRun,
    pendingUploads: dryRun ? computerFiles().map((f) => ({ name: f.name, size: f.size })) : [] });
  const out = $('[data-mail-check-result]', m);
  const show = (cls, msg) => { out.innerHTML = `<div class="notice ${cls}">${esc(msg)}</div>`; };
  $('[data-mail-check]', m).addEventListener('click', async () => {
    try { const r = await api.sendDealEmail(input(true)); show('info', `OK to send: from ${r.from || '(connect Gmail first)'} to ${[...r.to, ...r.cc, ...r.bcc].join(', ')}. Subject: ${r.subject}.${r.attachments.length ? ` ${r.attachments.length} attachment(s).` : ''}${r.signatureAdded ? ' Signature added.' : ''} Nothing was sent.`); }
    catch (e) { show('bad', e.message); } });
  const send = $('[data-mail-send]', m);
  send.addEventListener('click', async () => {
    send.disabled = true;
    try {
      const files = computerFiles();
      for (const file of files) { if (isWire({ name: file.name })) throw new Error('Wire instructions cannot be attached to an email from the portal.'); }
      const uploadIds = [];
      for (const file of files) {
        const saved = await api.addDocument(deal.id, { name: file.name, description: 'Email attachment from the portal', mimeType: file.type || 'application/octet-stream', size: file.size, dataUrl: await readAsDataUrl(file), visibility: 'staff' });
        uploadIds.push(saved.id);
      }
      const payload = { ...input(false), uploadIds };
      const r = await api.sendDealEmail(payload);
      const got = Array.isArray(r.attachments) ? r.attachments : [];
      const wanted = [...(payload.documentIds || []), ...uploadIds];
      const missing = wanted.filter((id) => !got.some((a) => a && String(a.id) === String(id)));
      if (r.ok === false || missing.length) {
        show('bad', r.error || `The email did not include ${missing.length} selected document${missing.length === 1 ? '' : 's'}. It was not a complete send.`);
        send.disabled = false;
        return;
      }
      closeModal();
      toast(`Sent from ${r.from}${got.length ? ` with ${got.length} attachment${got.length === 1 ? '' : 's'}` : ''}`);
      if (done) done(r);
    } catch (e) { show('bad', e.message); send.disabled = false; } });
  return m;
}
