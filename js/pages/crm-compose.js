/* crm-compose.js : SEND EMAIL from a Client / Lead / Company / Opportunity / Deal record (Janine, Zoho video 7) and from a report (video 10).
 * NOTHING IS SENT: Gmail is not connected. "Send" saves the email on the record as "Drafted (not sent)"; "Schedule" saves it as "Scheduled (not sent)".
 * Both stay on the record's Emails list for good (never deleted). Function only (no styling work). */
import { html, raw, $, $$, guard, toast, modal, closeModal, fmtDateTime, fmtSize, toText } from '../ui.js?v=202611070139';
import { richEditor, readFile } from './crm-rte.js?v=202611070139';
import { moduleLabel } from '../data/crm-templates.js?v=202611070139';

const EMOJI = ['🙂', '😀', '👍', '🎉', '🏠', '🔑', '📅', '✅', '📞', '✉️'];
const TEMPLATE_ENTITIES = ['lead', 'contact', 'account', 'opportunity'];
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

// the header button (top right next to Edit and More)
export const sendEmailBtn = (entity, id, me) => (me.canEdit ? html`<button type="button" class="m-btn" data-send-email="${entity}:${id}">Send Email</button>` : '');
export function wireSendEmail(root, api, me, refresh) {
  $$('[data-send-email]', root).forEach((b) => b.addEventListener('click', guard(async () => { const [e, id] = b.dataset.sendEmail.split(':'); await composeOverlay(api, me, e, id, { done: refresh }); })));
}

// address pills: type, then Enter / comma / Tab / blur makes a pill; x removes it
function pills(name, list0) {
  const body = html`<div class="pill-input" data-pills="${name}">${list0.map((e) => html`<span class="pill" data-pill="${e}">${e} <button type="button" class="linkish" data-pill-x aria-label="Remove ${e}">&times;</button></span>`)}<input type="text" data-pill-entry="${name}" placeholder="name@example.com" aria-label="${name} addresses"></div>`;
  const mount = (root) => { const wrap = $(`[data-pills="${name}"]`, root); const inp = $('[data-pill-entry]', wrap);
    const add = () => { inp.value.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean).forEach((e) => { if (!isEmail(e)) { toast(`"${e}" is not a valid email address.`, 'err'); return; }
      if ($$('[data-pill]', wrap).some((p) => p.dataset.pill.toLowerCase() === e.toLowerCase())) return;
      const s = document.createElement('span'); s.className = 'pill'; s.dataset.pill = e; s.innerHTML = toText(html`${e} <button type="button" class="linkish" data-pill-x aria-label="Remove ${e}">&times;</button>`); wrap.insertBefore(s, inp); }); inp.value = ''; };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ',' || e.key === ';' || e.key === 'Tab') { if (inp.value.trim()) { e.preventDefault(); add(); } } if (e.key === 'Backspace' && !inp.value) { const all = $$('[data-pill]', wrap); if (all.length) all[all.length - 1].remove(); } });
    inp.addEventListener('blur', add); wrap.addEventListener('click', (e) => { if (e.target.matches('[data-pill-x]')) e.target.closest('[data-pill]').remove(); });
    return { get: () => { add(); return $$('[data-pill]', wrap).map((p) => p.dataset.pill); } }; };
  return { body, mount };
}

// the compose window is its own overlay (not modal()), so the editor's link / image / table dialogs and Select Template can open on top of it
export const closeCompose = () => { const o = document.getElementById('compose-overlay'); if (o) o.remove(); };
function overlay(title, body) {
  closeCompose(); const el = document.createElement('div'); el.id = 'compose-overlay'; el.className = 'modal-back'; el.setAttribute('data-compose-overlay', '');
  el.innerHTML = toText(html`<div class="modal-box wide" role="dialog" aria-label="${title}"><div class="modal-head"><h3>${title}</h3><span><button type="button" class="ghost" data-compose-min aria-label="Minimize" title="Minimize">&#8211;</button> <button type="button" class="ghost" data-compose-max aria-label="Maximize" title="Maximize">&#9633;</button> <button type="button" class="modal-x" data-compose-x aria-label="Close">&times;</button></span></div><div class="modal-body" data-compose-body>${body}</div></div>`);
  document.body.appendChild(el);
  // Zoho's compose window: minimize (only the title bar stays) and maximize (full width)
  $('[data-compose-min]', el).addEventListener('click', () => { const b = $('[data-compose-body]', el); b.hidden = !b.hidden; el.toggleAttribute('data-minimized', b.hidden); });
  $('[data-compose-max]', el).addEventListener('click', () => { const box = $('.modal-box', el); const on = !el.hasAttribute('data-maximized'); el.toggleAttribute('data-maximized', on); box.style.maxWidth = on ? '98vw' : ''; box.style.width = on ? '98vw' : ''; }); $('[data-compose-x]', el).addEventListener('click', () => { if (confirm('Close without saving this email?')) el.remove(); });
  window.addEventListener('hashchange', closeCompose, { once: true }); return el;
}
// opts: { done, attachReport: true (report: offer the CSV), subject, html }
export async function composeOverlay(api, me, entity, id, opts = {}) {
  const ctx = await api.getCrmComposeContext(entity, id);
  const sig = ctx.signature ? `<p><br></p><div data-signature>${ctx.signature}</div>` : '';
  const to = pills('to', ctx.to); const cc = pills('cc', []); const bcc = pills('bcc', []);
  const ed = richEditor('compose', (opts.html || '<p><br></p>') + sig, { compose: true });
  const m = overlay(`Send Email: ${ctx.recordName}`, html`<form data-compose-email onsubmit="return false">
    <p class="muted small" data-not-sent-note><strong>Nothing is sent.</strong> ${ctx.sendNote} Send saves it as "Drafted (not sent)"; Schedule saves it as "Scheduled (not sent)".</p>
    <label>From<select name="from" data-compose-from>${ctx.from.map((f) => html`<option value="${f}">${f}</option>`)}</select></label> <a class="small" href="#/crm/signature" data-aliases-link>Aliases and signature</a>
    <div><label>To</label>${to.body} <button type="button" class="linkish" data-add-cc>Add Cc</button> <button type="button" class="linkish" data-add-bcc>Add Bcc</button></div>
    <div data-cc-row hidden><label>Cc</label>${cc.body}</div><div data-bcc-row hidden><label>Bcc</label>${bcc.body}</div>
    <label>Subject<input name="subject" maxlength="250" value="${opts.subject || ''}" data-compose-subject style="width:100%"></label>
    <p><button type="button" class="ghost" data-insert-template>Insert Template</button></p>
    ${ed.body}
    <div data-compose-files></div>
    ${opts.attachReport && ctx.canAttachReport ? html`<label><input type="checkbox" name="attachReport" checked data-attach-report> Attach this report as CSV</label>` : opts.attachReport ? html`<p class="muted small" data-no-report-csv>Only an Admin or Super admin can export a report, so the CSV cannot be attached for you.</p>` : ''}
    <div data-compose-bar>
      <label class="ghost" title="Attach files" style="cursor:pointer">&#128206; Attach<input type="file" multiple hidden data-compose-attach></label>
      <select data-emoji aria-label="Insert emoji"><option value="">&#128578; Emoji</option>${EMOJI.map((e) => html`<option value="${e}">${e}</option>`)}</select>
      <button type="button" class="ghost" data-discard>Discard</button>
      <span style="float:right"><button type="button" class="ghost" data-cancel-email>Cancel</button> <button type="button" class="ghost" data-schedule-email>Schedule</button> <button type="button" class="m-btn" data-send-now>Send</button></span>
    </div>
    <div data-schedule-row hidden><label>Schedule for<input type="datetime-local" data-schedule-at></label> <button type="button" class="m-btn" data-schedule-ok>Schedule (not sent)</button></div>
  </form>`);
  const closeOverlay = () => m.remove();
  const toCtl = to.mount(m), ccCtl = cc.mount(m), bccCtl = bcc.mount(m); const ctl = ed.mount(m); const files = []; let templateId = null;
  const drawFiles = () => { $('[data-compose-files]', m).innerHTML = toText(files.length ? html`<p class="small">Attachments: ${files.map((f, i) => html`<span data-compose-file="${f.name}">${f.name} (${fmtSize(f.size)}) <button type="button" class="linkish" data-file-x="${i}">&times;</button></span> `)}</p>` : ''); };
  $('[data-compose-files]', m).addEventListener('click', (e) => { if (e.target.dataset.fileX != null) { files.splice(+e.target.dataset.fileX, 1); drawFiles(); } });
  $('[data-add-cc]', m).addEventListener('click', () => { $('[data-cc-row]', m).hidden = false; }); $('[data-add-bcc]', m).addEventListener('click', () => { $('[data-bcc-row]', m).hidden = false; });
  $('[data-compose-attach]', m).addEventListener('change', guard(async (e) => { for (const f of [...e.target.files]) { const dataUrl = await readFile(f); files.push({ name: f.name, mimeType: f.type, size: f.size, dataUrl }); } e.target.value = ''; drawFiles(); }));
  $('[data-emoji]', m).addEventListener('change', (e) => { if (e.target.value) ctl.insertToken(e.target.value); e.target.value = ''; });
  const dirty = () => ctl.getHtml().replace(/<[^>]+>|&nbsp;|\s/g, '') !== (sig.replace(/<[^>]+>|&nbsp;|\s/g, '')) || $('[data-compose-subject]', m).value.trim() || files.length;
  $('[data-discard]', m).addEventListener('click', () => { if (dirty() && !confirm('Discard this email? Nothing is saved.')) return; closeOverlay(); });
  $('[data-cancel-email]', m).addEventListener('click', () => { if (dirty() && !confirm('Close without saving this email?')) return; closeOverlay(); });
  $('[data-insert-template]', m).addEventListener('click', guard(async () => {
    if (!TEMPLATE_ENTITIES.includes(ctx.entity)) { toast(`Email templates belong to Leads, Clients, Companies or Opportunities; there are no ${ctx.entity === 'deal' ? 'Deal' : 'report'} templates yet.`, 'err'); return; }
    const pick = await selectTemplate(api, ctx.entity); if (!pick) return;
    const r = await api.composeCrmEmail(pick, ctx.entity, ctx.id); templateId = pick; $('[data-compose-subject]', m).value = r.subject || '';
    const keepSig = ctx.signature && !r.html.includes(ctx.signature) ? sig : ''; ctl.setHtml(r.html + keepSig);
    if (r.attachments && r.attachments.length) { for (const a of r.attachments) { const c = await api.getCrmAttachmentContent(a.id); files.push({ name: c.name, mimeType: c.mimeType, size: a.size || 0, dataUrl: c.dataUrl }); } drawFiles(); }
    toast('Template inserted'); }));
  const submit = (mode) => guard(async () => {
    const input = { entity: ctx.entity, entityId: ctx.id, from: $('[data-compose-from]', m).value, to: toCtl.get(), cc: ccCtl.get(), bcc: bccCtl.get(), subject: $('[data-compose-subject]', m).value, html: ctl.getHtml(), mode,
      scheduledAt: mode === 'schedule' ? $('[data-schedule-at]', m).value : null, templateId, attachments: files, attachReport: !!($('[data-attach-report]', m) || {}).checked };
    const r = await api.saveCrmEmail(input); closeOverlay(); toast(r.status === 'scheduled' ? 'Saved as Scheduled (not sent). Nothing was sent.' : 'Saved as Drafted (not sent). Nothing was sent.'); if (opts.done) opts.done(r); });
  $('[data-send-now]', m).addEventListener('click', submit('send'));
  $('[data-schedule-email]', m).addEventListener('click', () => { $('[data-schedule-row]', m).hidden = false; });
  $('[data-schedule-ok]', m).addEventListener('click', submit('schedule'));
  return m;
}

// "Select Template" (folder dropdown, search, the templates you can use for this module)
export function selectTemplate(api, entity) {
  return new Promise((resolve) => { (async () => {
    const list = await api.listCrmTemplatesFor(entity); const folders = [...new Set(list.map((t) => t.folderName))].sort();
    const m = modal('Select Template', html`<div data-select-template><p><label>Folder<select data-tpl-folder><option value="">All folders</option>${folders.map((f) => html`<option value="${f}">${f}</option>`)}</select></label>
      <label>Search<input type="search" data-tpl-q placeholder="Template name or subject"></label> <span class="muted small">${moduleLabel(entity)} templates</span></p>
      <table class="tbl"><thead><tr><th>Template Name</th><th>Subject</th><th>Folder</th></tr></thead><tbody data-tpl-rows></tbody></table>
      <p><button type="button" class="ghost" data-tpl-cancel>Cancel</button></p></div>`, { wide: true });
    let picked = null;
    const draw = () => { const f = $('[data-tpl-folder]', m).value; const q = $('[data-tpl-q]', m).value.trim().toLowerCase();
      const rows = list.filter((t) => (!f || t.folderName === f) && (!q || `${t.name} ${t.subject}`.toLowerCase().includes(q)));
      $('[data-tpl-rows]', m).innerHTML = toText(rows.length ? rows.map((t) => html`<tr><td><a href="#" data-pick-tpl="${t.id}">${t.name}</a></td><td>${t.subject}</td><td>${t.folderName}</td></tr>`) : html`<tr><td colspan="3" class="muted">No active ${moduleLabel(entity)} templates match.</td></tr>`); };
    $('[data-tpl-folder]', m).addEventListener('change', draw); $('[data-tpl-q]', m).addEventListener('input', draw); draw();
    $('[data-tpl-rows]', m).addEventListener('click', (e) => { const a = e.target.closest('[data-pick-tpl]'); if (!a) return; e.preventDefault(); picked = a.dataset.pickTpl; closeModal(); resolve(picked); });
    $('[data-tpl-cancel]', m).addEventListener('click', () => { closeModal(); resolve(null); });
  })().catch((e) => { toast(e.message, 'err'); resolve(null); }); });
}

// the record's Emails related list
export function emailsCard(emails) {
  return html`<div class="card" data-emails-list><h3>Emails <span class="muted small">(${emails.length})</span></h3>
    <p class="muted small">Nothing is sent from the CRM yet (Gmail is not connected). These emails were saved only; they are never deleted.</p>
    ${emails.length ? html`<table class="tbl"><thead><tr><th>Subject</th><th>To</th><th>From</th><th>Status</th><th>When</th><th>By</th><th>Attachments</th></tr></thead><tbody>${emails.map((e) => html`<tr data-email-row="${e.id}">
      <td><a href="#" data-view-email="${e.id}">${e.subject}</a></td><td>${e.to.join(', ')}${e.cc.length ? html`<br><span class="small">Cc: ${e.cc.join(', ')}</span>` : ''}</td><td>${e.from}</td>
      <td data-email-status>${e.statusLabel}${e.scheduledAt ? html`<br><span class="small">for ${fmtDateTime(e.scheduledAt)}</span>` : ''}</td><td>${fmtDateTime(e.createdAt)}</td><td>${e.createdByName}</td>
      <td>${e.attachments.map((a) => html`<a href="#" data-email-file="${e.id}:${a.id}">${a.name}</a> `)}</td></tr>`)}</tbody></table>` : html`<p class="muted" data-no-emails>No emails yet.</p>`}</div>`;
}
export function wireEmails(root, api, emails) {
  $$('[data-view-email]', root).forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); const em = emails.find((z) => z.id === a.dataset.viewEmail); if (!em) return;
    const m = modal(em.subject, html`<p><strong>${em.statusLabel}</strong>. ${em.notice}</p><p>From: ${em.from}<br>To: ${em.to.join(', ')}${em.cc.length ? html`<br>Cc: ${em.cc.join(', ')}` : ''}${em.bcc.length ? html`<br>Bcc: ${em.bcc.join(', ')}` : ''}</p>
      <iframe sandbox="" title="Email" style="width:100%;min-height:300px" data-email-frame></iframe>`, { wide: true });
    $('[data-email-frame]', m).srcdoc = `<!doctype html><meta charset="utf-8"><body>${em.html}</body>`; }));
  $$('[data-email-file]', root).forEach((a) => a.addEventListener('click', guard(async (e) => { e.preventDefault(); const [eid, fid] = a.dataset.emailFile.split(':'); const c = await api.getCrmEmailAttachment(eid, fid);
    const l = document.createElement('a'); l.href = c.dataUrl; l.download = c.name; document.body.appendChild(l); l.click(); l.remove(); })));
}
export { raw };
