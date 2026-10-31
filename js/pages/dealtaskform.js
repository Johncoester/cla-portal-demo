// One intake task (form). Save partial work, validate, mark complete. ID-type fields upload a file into the order's "IDs & personal" folder.
import { html, raw, $, $$, toast, fmtDate, fmtDateTime, pill } from '../ui.js';
import { fieldActive } from '../data/templates.js';
import { MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_EXT } from '../data/constants.js';
import { CLS, LABEL } from './dealtasks.js';
const readFile = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Could not read the file.')); r.readAsDataURL(f); });

export async function render({ api, deal, params, refresh, go }) {
  const t = await api.getTask(params.sub); const v = t.formData || {};
  const docName = (id) => ((t.documents || []).find((z) => z.id === id) || {}).name || '';
  const input = (f) => {
    const val = v[f.k] == null ? '' : v[f.k]; const req = f.req ? html`<span class="req">*</span>` : '';
    if (f.type === 'info') return html`<div class="span2 fld note-box" data-k="${f.k}"><strong>${f.label}</strong><br>${f.text || ''}</div>`;
    if (f.type === 'checkbox') return html`<label class="check span2 fld" data-k="${f.k}"><input type="checkbox" name="${f.k}" ${val ? html`checked` : ''}> ${f.label} ${req}<span class="ferr"></span></label>`;
    if (f.type === 'select') return html`<label class="fld" data-k="${f.k}">${f.label} ${req}<select name="${f.k}"><option value="">Choose&hellip;</option>${f.opts.map((o) => html`<option ${o === val ? raw('selected') : ''}>${o}</option>`)}</select><span class="ferr"></span></label>`;
    if (f.type === 'textarea') return html`<label class="span2 fld" data-k="${f.k}">${f.label} ${req}<textarea name="${f.k}" rows="3" maxlength="2000">${val}</textarea><span class="ferr"></span></label>`;
    if (f.type === 'doc') return html`<label class="span2 fld" data-k="${f.k}">${f.label} ${req} <span class="muted small">(${ALLOWED_UPLOAD_EXT.join(', ')}; demo limit ${MAX_UPLOAD_BYTES / 1e6} MB)</span>
      ${val ? html`<span class="doc-have">On file: <strong>${docName(val)}</strong> (choose a new file to replace it; the old file is kept)</span>` : ''}<input type="file" data-file="${f.k}" accept="image/*,.pdf,.heic,.heif"><input type="hidden" name="${f.k}" value="${val}"><span class="ferr"></span></label>`;
    const type = { email: 'email', date: 'date', phone: 'tel' }[f.type] || 'text';
    const extra = { money: 'inputmode="decimal"', digits4: 'maxlength="4" inputmode="numeric"', phone: 'inputmode="tel" placeholder="xxx-xxx-xxxx" data-phone', routing: 'maxlength="9" inputmode="numeric" autocomplete="off"',
      account: 'maxlength="17" inputmode="numeric" autocomplete="off"', state: 'maxlength="2" placeholder="MD"', zip: 'maxlength="10" inputmode="numeric"' }[f.type];
    return html`<label class="fld" data-k="${f.k}">${f.label} ${req}<input type="${type}" name="${f.k}" value="${val}" ${extra ? raw(extra) : ''}><span class="ferr"></span></label>`;
  };
  if (t.kind === 'sign') return signView({ api, deal, t, refresh, go });
  const answers = html`${t.maskedAnswers ? html`<p class="muted small" data-masked>Bank account numbers show the last 4 digits only. The client and the processor see them in full.</p>` : ''}<dl class="answers">${t.fields.filter((f) => f.type !== 'info' && fieldActive(f, v) && v[f.k] !== undefined).map((f) => html`<dt>${f.label}</dt><dd>${f.type === 'checkbox' ? 'Yes' : f.type === 'doc' ? docName(v[f.k]) : v[f.k]}</dd>`)}</dl>`;
  const body = html`<div class="box-title"><h2><span class="h-ico"></span>${t.title}</h2><a class="ghost right" href="#/deals/${deal.id}/tasks">All tasks</a></div>
    <div class="card"><p>${t.description}</p><p class="muted small">For <strong>${t.ownerName || t.assignedRole}</strong> (${t.assignedRole}) &middot; due ${fmtDate(t.dueDate) || 'n/a'} &middot; ${pill(LABEL[t.status], CLS[t.status])}
      &middot; template ${t.template ? html`${t.template.code} v${t.template.version}` : 'n/a'}${t.savedAt ? html` &middot; last saved ${fmtDateTime(t.savedAt)}` : ''}</p>
    ${t.completedByLabel ? html`<p class="done-by"><strong>${t.completedByLabel}</strong> on ${fmtDateTime(t.completedAt)}.</p>` : t.savedByLabel ? html`<p class="muted small done-by">${t.savedByLabel} on ${fmtDateTime(t.savedAt)}.</p>` : ''}
    ${t.forClient && t.canFill ? html`<p class="note-box">You are completing this <strong>on behalf of ${t.ownerName}</strong>. ${t.ownerName} will be told, can see your answers and can correct them. Every save is recorded with your name.</p>` : ''}
    ${t.mine && t.savedBy && t.savedBy !== t.ownerId ? html`<p class="note-box">Your agent filled this in for you. Please check the answers and correct anything that is wrong.</p>` : ''}
    ${t.formHidden ? html`<p class="muted">Only ${t.ownerName || 'the client'}, the processor and the coordinator can see the answers.</p>`
      : t.canFill ? html`<form id="tform" class="form-grid" novalidate>${t.fields.map(input)}
        <div class="span2"><button class="ghost" type="submit" data-mode="save">Save progress</button> <button class="m-btn" type="submit" data-mode="complete">${t.status === 'done' ? 'Save and keep complete' : 'Mark complete'}</button></div>
        <p class="muted small span2">Fields marked * are needed to mark the task complete. You can save partial work any time. We never ask for Social Security numbers here.</p></form>`
      : answers}</div>`;
  return { title: t.title, crumbs: [['All Tasks', `#/deals/${deal.id}/tasks`], [t.title]], body, mount(root) {
    const form = $('#tform', root); if (!form) return;
    const sync = () => { const cur = {}; new FormData(form).forEach((val, k) => { cur[k] = val; }); t.fields.forEach((f) => { const el = $(`.fld[data-k="${f.k}"]`, form); if (el) el.hidden = !fieldActive(f, cur); }); };
    form.addEventListener('change', sync); sync();
    let mode = 'save'; $$('button[data-mode]', form).forEach((b) => b.addEventListener('click', () => { mode = b.dataset.mode; }));
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); $$('.ferr', form).forEach((x) => { x.textContent = ''; }); $$('.fld', form).forEach((x) => x.classList.remove('has-err'));
      try {
        for (const fi of $$('input[data-file]', form)) { const file = fi.files[0]; if (!file) continue;
          if (file.size > MAX_UPLOAD_BYTES) throw new Error('File is too large for this demo.');
          const up = await api.uploadForTask(t.id, { name: file.name, mimeType: file.type, size: file.size, dataUrl: await readFile(file) }); form.elements[fi.dataset.file].value = up.id; fi.value = ''; }   // stored once: a retry after a form error must not upload it again
        const data = {}; new FormData(form).forEach((val, k) => { if (typeof val === 'string') data[k] = val; });
        await api.saveTaskForm(t.id, data, { complete: mode === 'complete' });
        toast(mode === 'complete' ? 'Task complete. Thank you!' : 'Progress saved'); mode === 'complete' ? go(`/deals/${deal.id}/tasks`) : refresh();
      } catch (err) {
        (err.fieldErrors || []).forEach((fe) => { const el = $(`.fld[data-k="${fe.k}"]`, form); if (el) { el.classList.add('has-err'); $('.ferr', el).textContent = fe.msg; } });
        toast(err.fieldErrors ? `Please fix ${err.fieldErrors.length} field(s).` : err.message, 'err');
      }
    });
  } };
}

// E-SIGN (DEMO, Matt Oct 31): the signer types their full name and adopts it. Only the signer can sign; an agent cannot sign for a client.
function signView({ api, deal, t, refresh, go }) {
  const s = t.signature;
  const who = s ? s.signers.map((x) => html`<li>${x.name} <span class="muted small">(${x.roleLabel})</span> ${x.status === 'signed' ? html`${pill('signed', 'ok')} <span class="muted small">${fmtDateTime(x.signedAt)}</span>` : pill(s.status === 'cancelled' ? 'cancelled' : 'waiting', s.status === 'cancelled' ? '' : 'info')}</li>`) : '';
  const body = html`<div class="box-title"><h2><span class="h-ico"></span>${t.title}</h2><a class="ghost right" href="#/deals/${deal.id}/tasks">All tasks</a></div>
    <div class="card"><p class="notice warn" data-demo-esign><strong>DEMO e-signature.</strong> This is a stand-in for a real e-sign service (DocuSign / Dropbox Sign). It is NOT a legally binding signature.</p>
    ${s ? html`<p>Document: <a href="#" data-open="${s.docId}" class="doc-link">${s.docName}</a> &middot; requested by ${s.requestedByName} on ${fmtDateTime(s.requestedAt)}</p>${s.message ? html`<p class="muted">${s.message}</p>` : ''}
      <p><strong>Signers</strong></p><ul class="plain" id="signers">${who}</ul>
      ${s.canSign ? html`<form id="signf" class="form-grid"><label class="span2">Type your full name to sign *<input name="typedName" autocomplete="off" placeholder="${s.expectedName}"></label>
        <label class="check span2"><input type="checkbox" name="adopt"> I adopt this typed name as my signature on ${s.docName}.</label>
        <div class="span2"><button class="m-btn" type="submit">Sign</button></div></form>`
      : s.mine && s.mine.status === 'signed' ? html`<p class="done-by"><strong>You signed this</strong> on ${fmtDateTime(s.mine.signedAt)} as "${s.mine.typedName}".</p>`
      : s.status === 'cancelled' ? html`<p class="muted">This signature request was cancelled.</p>` : html`<p class="muted" data-not-signer>Only ${t.ownerName} can sign this. Agents cannot sign for their clients.</p>`}`
    : html`<p class="muted">Signature request not found.</p>`}</div>`;
  return { title: t.title, crumbs: [['All Tasks', `#/deals/${deal.id}/tasks`], [t.title]], body, mount(root) {
    $$('[data-open]', root).forEach((a) => a.addEventListener('click', async (e) => { e.preventDefault(); try { const c = await api.getDocumentContent(a.dataset.open); if (!c.dataUrl) { toast('This is a sample file with no content in the demo.'); return; } const l = document.createElement('a'); l.href = c.dataUrl; l.download = c.name; document.body.appendChild(l); l.click(); l.remove(); } catch (err) { toast(err.message, 'err'); } }));
    const f = $('#signf', root); if (f) f.addEventListener('submit', async (e) => { e.preventDefault(); try { const fd = new FormData(f);
      await api.signDocument(s.id, { typedName: fd.get('typedName'), adopt: fd.get('adopt') === 'on' }); toast('Signed. Thank you!'); go(`/deals/${deal.id}/tasks`); } catch (err) { toast(err.message, 'err'); } });
  } };
}
