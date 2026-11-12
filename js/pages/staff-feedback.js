/* Portal feedback for CLA staff. Not the file inbox. Screenshots stay on this page.
 * Delivery copy comes from the saved state. A test simulation is labeled and is not the assistant. */
import { html, raw, $, $$, guard, toast, fmtDateTime, fmtSize } from '../ui.js?v=202611161500';
import { FEEDBACK_STATUSES, STATUS_LABELS, canReportStaffFeedback, canSupportStaffFeedback, COMPOSE_NOTICE, newId, reportNotice, sanitizePage } from '../data/staff-feedback.js?v=202611080400';

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif';
const readFile = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Could not read the screenshot.')); r.readAsDataURL(f); });

function standingNotice() {
  return COMPOSE_NOTICE;
}

export async function render({ api, user, params, go }) {
  if (!canReportStaffFeedback(user)) throw new Error('Portal feedback is for CLA staff.');
  if (params && params.id) return detail({ api, user, id: params.id, go });
  const rows = await api.listStaffFeedback();
  const support = canSupportStaffFeedback(user);
  const body = html`<section class="staff-feedback" data-staff-feedback-page="list">
    <div class="box-title"><h2>Portal feedback</h2></div>
    <p class="notice warn" data-feedback-standing role="status">${standingNotice()}</p>
    <p>The green Portal feedback button is the usual place to write. This page is the report list. Admins can review every report they are allowed to see. Nothing here changes code, sends email, or marks a report fixed by itself.</p>
    <form class="card form-grid" data-feedback-form>
      <label class="span2">Title <input name="title" maxlength="140" required data-feedback-title placeholder="Example: Orders list hides the file number"></label>
      <label class="span2">What happened <textarea name="body" rows="5" maxlength="4000" required data-feedback-body placeholder="What you did, what you expected, and what you saw."></textarea></label>
      <label class="check span2"><input type="checkbox" data-include-page> Include a portal page I name</label>
      <label class="span2" data-page-wrap hidden>Page <input name="page" data-feedback-page placeholder="#/orders" maxlength="200" autocomplete="off"></label>
      <label class="check span2"><input type="checkbox" data-include-order> Include an order file number I name</label>
      <label class="span2" data-order-wrap hidden>File number <input name="fileNumber" data-feedback-file-number placeholder="MD-26-97183" maxlength="40" autocomplete="off"></label>
      <p class="muted small span2">Both boxes start off. Customer names, contracts, and session data are not copied. A checked box saves only the page path or the file number.</p>
      <label class="span2">Screenshot <input type="file" accept="${ACCEPT}" data-feedback-file aria-describedby="feedback-file-hint"></label>
      <p id="feedback-file-hint" class="muted small span2">PNG, JPEG, WEBP, or GIF. 5 MB or smaller. One screenshot at a time. This does not open a folder.</p>
      <div class="span2"><button class="m-btn" type="submit" data-feedback-save>Save report</button></div>
    </form>
    <div class="card"><h3>Your reports${support ? ' and staff reports you can review' : ''}</h3>
      ${rows.length ? html`<ul class="staff-feedback-list" data-feedback-list>${rows.map((r) => html`<li data-feedback-row="${r.id}"><a href="#/staff-feedback/${r.id}"><strong>${r.title}</strong></a> <span class="pill" data-feedback-status="${r.status}">${r.statusLabel}</span><br><span class="muted small" data-feedback-row-notice>${reportNotice(r)}</span></li>`)}</ul>` : html`<p class="muted" data-feedback-empty>No reports yet.</p>`}
    </div>
  </section>`;
  return { title: 'Portal feedback', crumbs: [['Portal feedback']], body, mount(root) { wireForm(root, { api, go }); } };
}

async function detail({ api, user, id, go }) {
  const report = await api.getStaffFeedback(id);
  const support = !!report.canSupport;
  const body = html`<section class="staff-feedback" data-staff-feedback-page="detail" data-feedback-id="${report.id}">
    <div class="box-title"><h2>${report.title}</h2></div>
    <p><a class="back-btn" href="#/staff-feedback">All portal feedback</a></p>
    <p class="notice ${report.deliveryState === 'simulated' ? 'warn' : 'info'}" data-feedback-notice role="status">${reportNotice(report)}</p>
    <p><span class="pill" data-feedback-status="${report.status}">${report.statusLabel}</span> <span class="muted small">${report.reporterName} · ${report.reporterRole} · ${fmtDateTime(report.createdAt)}</span></p>
    ${report.pagePath ? html`<p data-feedback-page>Page: <code>${report.pagePath}</code></p>` : html`<p class="muted" data-feedback-page>No page was included.</p>`}
    ${report.orderFileNumber ? html`<p data-feedback-order>Order file number: <strong>${report.orderFileNumber}</strong></p>` : html`<p class="muted" data-feedback-order>No order was included.</p>`}
    <div class="staff-feedback-thread" data-feedback-thread>${report.messages.map(bubble)}</div>
    ${report.attachments.length ? html`<ul class="staff-feedback-files" data-feedback-files>${report.attachments.map((a) => html`<li data-feedback-attachment="${a.id}">${a.fileName} <span class="muted small">${fmtSize(a.sizeBytes)}</span> <button type="button" class="ghost small" data-feedback-open="${a.id}">View screenshot</button></li>`)}</ul>` : ''}
    <div data-feedback-preview hidden><img alt="Screenshot preview" data-feedback-img></div>
    ${support && report.drafts.length ? html`<div class="card" data-feedback-drafts><h3>Draft pending review</h3><p class="muted small">Publishing a draft shows it to the reporter. It does not mark the report fixed.</p>${report.drafts.map((d) => html`<article class="staff-feedback-bubble draft" data-feedback-draft="${d.id}"><p class="muted small">${d.authorName}</p><p>${d.body}</p><button type="button" class="m-btn" data-feedback-publish="${d.id}">Publish draft</button></article>`)}</div>` : ''}
    ${support ? html`<form class="card form-grid" data-feedback-status-form><label>Status <select name="status" data-feedback-status-select>${FEEDBACK_STATUSES.map((s) => html`<option value="${s}"${s === report.status ? raw(' selected') : ''}>${STATUS_LABELS[s]}</option>`)}</select></label><div><button class="m-btn" type="submit">Save status</button></div><p class="muted small span2">Only an Admin or Super admin can change this. A message cannot.</p></form>` : ''}
    <form class="card form-grid" data-feedback-reply><label class="span2">Reply <textarea name="body" rows="4" maxlength="4000" required data-feedback-reply-body></textarea></label><div class="span2"><button class="m-btn" type="submit">Save reply</button></div><p class="muted small span2">A reply is saved here. It is not sent to the assistant.</p></form>
    <p><button type="button" class="ghost" data-feedback-simulate>Run test simulation (not delivered)</button></p>
  </section>`;
  return { title: report.title, crumbs: [['Portal feedback', '#/staff-feedback'], [report.title]], body, mount(root) { wireDetail(root, { api, go, id, support }); } };
}

function bubble(m) {
  const kind = m.simulation ? 'simulation' : m.authorKind || 'reporter';
  return html`<article class="staff-feedback-bubble ${kind}" data-feedback-message="${m.id}" data-author-kind="${kind}"><p class="muted small">${m.authorName}${m.simulation ? ' · Test simulation' : ''}</p><p>${m.body}</p></article>`;
}

function wireForm(root, { api, go }) {
  const form = $('[data-feedback-form]', root);
  const pageBox = $('[data-include-page]', root);
  const orderBox = $('[data-include-order]', root);
  const idem = newId();
  pageBox.addEventListener('change', () => {
    $('[data-page-wrap]', root).hidden = !pageBox.checked;
    if (pageBox.checked && !$('[data-feedback-page]', root).value) {
      try { $('[data-feedback-page]', root).value = sanitizePage(location.hash.split('?')[0]); } catch (e) { $('[data-feedback-page]', root).value = ''; }
    }
  });
  orderBox.addEventListener('change', () => { $('[data-order-wrap]', root).hidden = !orderBox.checked; });
  form.addEventListener('submit', guard(async (e) => {
    e.preventDefault();
    const file = $('[data-feedback-file]', root);
    if (file.hasAttribute('webkitdirectory') || file.webkitdirectory) throw new Error('Choose one screenshot. Folder upload is not available.');
    const picked = file.files && file.files[0];
    if (picked && picked.webkitRelativePath) throw new Error('Choose one screenshot. Folder upload is not available.');
    const saved = await api.createStaffFeedback({
      title: form.title.value, body: form.body.value, includePage: pageBox.checked, page: pageBox.checked ? form.page.value : '',
      includeOrder: orderBox.checked, fileNumber: orderBox.checked ? form.fileNumber.value : '', idempotencyKey: idem,
    });
    if (picked) await api.addStaffFeedbackAttachment(saved.id, { name: picked.name, mimeType: picked.type, size: picked.size, dataUrl: await readFile(picked), idempotencyKey: newId() });
    toast(reportNotice(saved));
    go(`/staff-feedback/${saved.id}`);
  }));
}

function wireDetail(root, { api, go, id }) {
  const replyKey = newId();
  $$('[data-feedback-open]', root).forEach((btn) => btn.addEventListener('click', guard(async () => {
    const file = await api.openStaffFeedbackAttachment(btn.dataset.feedbackOpen);
    const img = $('[data-feedback-img]', root);
    const box = $('[data-feedback-preview]', root);
    if (img.src && img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
    img.src = file.dataUrl || URL.createObjectURL(file.blob);
    box.hidden = false;
  })));
  const reply = $('[data-feedback-reply]', root);
  reply.addEventListener('submit', guard(async (e) => {
    e.preventDefault();
    const saved = await api.replyStaffFeedback(id, { body: $('[data-feedback-reply-body]', root).value, idempotencyKey: replyKey });
    toast(saved.messages ? 'Reply saved. Not sent to the assistant.' : 'Reply saved. Not sent to the assistant.');
    go(`/staff-feedback/${id}`);
  }));
  const status = $('[data-feedback-status-form]', root);
  if (status) status.addEventListener('submit', guard(async (e) => {
    e.preventDefault();
    await api.setStaffFeedbackStatus(id, $('[data-feedback-status-select]', root).value);
    toast('Status saved by an admin. Nothing was sent.');
    go(`/staff-feedback/${id}`);
  }));
  $$('[data-feedback-publish]', root).forEach((btn) => btn.addEventListener('click', guard(async () => {
    await api.publishStaffFeedbackDraft(btn.dataset.feedbackPublish);
    toast('Draft published to the reporter. The report was not marked fixed.');
    go(`/staff-feedback/${id}`);
  })));
  $('[data-feedback-simulate]', root).addEventListener('click', guard(async () => {
    const saved = await api.simulateStaffFeedback(id);
    toast(saved.notice);
    go(`/staff-feedback/${id}`);
  }));
}
