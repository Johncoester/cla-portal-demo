// Documents tab with folders. Upload, open/download, file into folders, edit description/visibility. There is NO delete: documents are kept permanently.
import { html, raw, $, $$, guard, formData, modal, closeModal, options, fmtDateTime, fmtSize, pill, toast } from '../ui.js?v=202611070139';
import { sameUploadId } from '../data/supabase-nov5.js?v=202611121200';
import { composeModal } from './compose.js?v=202611110900';
import { runsOrders, viewOnly, MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_EXT, isClient, isRefi, visibilityChoices, visibilityLabel, clientShareVisibility, CLIENT_SHARE_NOTE, BUYER_SHARE_NOTE, DOC_TYPES, docTypeChoices } from '../data/constants.js?v=202611101015';
import { MISC_DOC_TYPE, orderedDocTypes, docTypeLabel, resolveDocType, docTypeEditorState } from '../data/document-type.js?v=202611100945';
import { AUDIENCE_CONTROL, AUDIENCE_NOTE, audienceParties, audienceChoices, checkedForVisibility, visibilityFromChecked, audienceSync } from '../data/document-audience.js?v=202611100945';
import { uploadDocumentBatch } from '../data/document-batch.js?v=202611101015';
import { addToQueue, removeFromQueue, uploadFailureText } from '../data/document-queue.js?v=202611090935';
import { downloadNamed } from '../data/file-open.js?v=202611091030';
const icon = (n) => (/\.pdf$/i.test(n) ? 'pdf_icon.png' : /\.docx?$/i.test(n) ? 'word_icon.png' : /\.(xlsx?|csv)$/i.test(n) ? 'excel_icon.png' : 'image_icon.png');
export function docListRow(d, folders = []) {
  const folderId = d.folderId || '';
  const known = (folders || []).find((f) => f.id && f.id === folderId);
  const size = d.size != null ? d.size : (d.sizeBytes != null ? Number(d.sizeBytes) : 0);
  const hasContent = d.hasContent != null ? !!d.hasContent : !!(d.storagePath || d.dataUrl || d.hasFile);
  return { ...d, size, hasContent, folderName: d.folderName || (known && known.name) || '' };
}
export function downloadHref(content) {
  if (!content) return '';
  if (content.dataUrl) return content.dataUrl;
  if (content.blob && typeof URL !== 'undefined' && URL.createObjectURL) return URL.createObjectURL(content.blob);
  return '';
}
const readFile = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Could not read the file.')); r.readAsDataURL(f); });
async function fileParties(api, dealId) {
  if (!api.getDeal) return [];
  try { const full = await api.getDeal(dealId); return (full && full.participants) || []; } catch (e) { return []; }
}

export async function render({ api, user, deal, refresh }) {
  const q = new URLSearchParams(location.hash.split('?')[1] || ''); const tab = ['received', 'sent', 'all'].includes(q.get('t')) ? q.get('t') : 'all';
  const folder = q.has('f') ? q.get('f') : null;
  const [rawDocs, folders, sigs, ents] = await Promise.all([
    api.listDocuments(deal.id, folder === null ? {} : { folderId: folder }),
    api.listDealFolders(deal.id),
    api.listSignatureRequests(deal.id),
    api.listEntityDocRequests(deal.id).catch(() => []),
  ]);
  const docs = rawDocs.map((d) => docListRow(d, folders));   // hosted rows: size_bytes, storage path, folder name
  const manage = runsOrders(user) || user.role === 'Transaction Coordinator'; const realFolders = folders.filter((f) => !f.virtual);
  const href = (t, f) => `#/deals/${deal.id}/documents?t=${t}${f === null ? '' : '&f=' + encodeURIComponent(f)}`;
  const portalDocs = docs.filter((d) => !d.sample);
  const shown = portalDocs.filter((d) => tab === 'all' || (tab === 'sent') === (d.uploadedBy === user.id));
  const staffView = !user.accountRole && user.role !== 'Outside user'; const types = orderedDocTypes(staffView ? DOC_TYPES : docTypeChoices(user.role));   // Miscellaneous/Other first; sellers keep the seller list
  // Matt, Nov 3: entity documents requested from a buyer / seller acting as an entity (shown to the person, the processor, the coordinator and Admin)
  const entBlock = ents.length ? html`<div class="box-title"><h2><span class="h-ico"></span>Requested entity documents</h2></div>
    <table class="tbl striped" id="entity-docs"><thead><tr><th>Buyer / seller</th><th>Entity</th><th>Authorized signer</th><th>Requested documents</th></tr></thead><tbody>${ents.map((e) => html`<tr data-entity-task="${e.taskId}">
      <td>${e.ownerName || e.role}<br><span class="muted small">${e.role === 'Client-Seller' ? 'Seller' : 'Buyer'} &middot; <a href="#/deals/${deal.id}/tasks/${e.taskId}">${e.taskTitle}</a></span></td>
      <td>${e.entityName || html`<span class="muted">name not given yet</span>`}<br><span class="muted small">${[e.entityType, e.entityState && `formed in ${e.entityState}`].filter(Boolean).join(' \u00b7 ')}</span></td>
      <td>${e.signerName}${e.signerTitle ? html`<br><span class="muted small">${e.signerTitle}</span>` : ''}</td>
      <td><ul class="plain">${e.documents.map((x) => html`<li data-entity-doc="${x.key}" data-attached="${x.attached ? 'yes' : 'no'}">${x.label}: ${x.attached ? html`${pill('attached', 'ok')} <a href="#" data-open="${x.docId}" class="doc-link">${x.docName}</a>` : pill(x.optional ? 'none attached (only if there are amendments)' : 'not yet attached', x.optional ? '' : 'warn')}</li>`)}</ul></td></tr>`)}</tbody></table>` : '';
  // SHARE WITH BUYER (John, Nov 4): CLA staff open another party's upload (e.g. the listing agent's) to the buyer; the buyer never sees who uploaded it
  const clientView = !!user.accountRole && isClient(user.role); const canShareClient = manage && staffView && !viewOnly(user);
  const canUpload = !viewOnly(user); const visOpts = visibilityChoices(user.role, user.isAdmin); const VL = (v) => visibilityLabel(v, user.role);   // user.role = the role on THIS file (deal.js scopes it)
  const partyRows = (deal.participants && deal.participants.length) ? deal.participants : await fileParties(api, deal.id);
  const parties = audienceParties(partyRows, { refinance: isRefi(deal) });
  const choices = audienceChoices({ parties, allowed: visOpts, role: user.role, control: AUDIENCE_CONTROL });
  const typeFields = (stored) => { const st = docTypeEditorState(stored, types); return html`<label class="span2">Document type<select name="docType" data-doc-type><option value="">Choose&hellip;</option>${options(types, st.choice, docTypeLabel)}</select></label>
      <label class="span2" data-doc-free ${st.choice === MISC_DOC_TYPE ? '' : raw('hidden')}>Type it here<input name="docTypeFree" maxlength="80" value="${st.free}" placeholder="What kind of document is this?"></label>`; };
  const audienceFields = (visibility) => { const on = new Set(checkedForVisibility(visibility, choices)); return html`<fieldset class="span2" data-audience data-audience-control="${AUDIENCE_CONTROL}"><legend>Who can see it</legend><div class="checks">${choices.map((c) => html`<label class="check"><input type="${AUDIENCE_CONTROL}" name="audience" value="${c.id}" data-side="${c.side}" ${c.exclusive ? raw('data-cla-only') : ''} ${on.has(c.id) ? raw('checked') : ''}> ${c.label}</label>`)}</div>${isClient(user.role) ? '' : html`<p class="muted small" data-audience-note>${AUDIENCE_NOTE}</p>`}</fieldset>`; };
  const mountType = (form) => { const sel = $('[data-doc-type]', form); const free = $('[data-doc-free]', form); if (!sel || !free) return; const sync = () => { free.hidden = sel.value !== MISC_DOC_TYPE; }; sel.addEventListener('change', sync); sync(); };
  const mountAudience = (form) => { const boxes = () => $$('input[name=audience]', form); boxes().forEach((el) => el.addEventListener('change', () => { const now = boxes().filter((i) => i.checked).map((i) => i.value); const next = new Set(audienceSync(now, el.value, choices, AUDIENCE_CONTROL)); boxes().forEach((i) => { i.checked = next.has(i.value); }); })); };
  const chosenType = (form, f) => resolveDocType(f.docType, form.elements.docTypeFree ? form.elements.docTypeFree.value : '');
  const chosenVisibility = (form) => visibilityFromChecked($$('input[name=audience]:checked', form).map((i) => i.value), choices, visOpts);
  const rows = shown.map((d) => html`<tr><td class="center"><img class="fileico" src="assets/img/${icon(d.name)}" alt=""></td>
    <td data-doc-row="${d.id}"${d.wireInstructions ? raw(' data-wire-doc') : ''}><a href="#" data-open="${d.id}" class="doc-link">${d.name}</a>${d.wireInstructions ? html` ${pill('wire instructions - buyer only', 'warn')}` : ''}<br><span class="muted small">${d.docType ? html`<span data-doctype>${d.docType}</span> &middot; ` : ''}${fmtSize(d.size)}${d.hasContent ? '' : ' \u00b7 sample file'}</span></td>
    <td>${d.folderName || html`<span class="muted">Unfiled</span>`}</td><td>${fmtDateTime(d.createdAt)}</td><td>${d.uploadedByName}<br><span class="muted small">${d.uploadedByRole}</span></td><td>${d.description}</td><td>${clientView && d.sharedWithMe ? pill('Shared with you by CLA Title', 'info') : pill(VL(d.visibility), d.visibility === 'all' ? '' : 'info')}${!clientView && d.sharedWithClient ? html`<br><span data-shared-client="${d.id}">${pill('shared with the buyer', 'ok')}</span><br><span class="muted small">by ${d.sharedWithClientByName} ${fmtDateTime(d.sharedWithClientAt)}</span>` : ''}${!clientView && d.sharedWithSeller ? html`<br><span data-shared-seller="${d.id}">${pill('shared with the seller', 'ok')}</span><br><span class="muted small">by ${d.sharedWithSellerByName} ${fmtDateTime(d.sharedWithSellerAt)}</span>` : ''}</td>
    <td class="nowrap">${runsOrders(user) || d.uploadedBy === user.id || manage ? html`<button class="ghost" data-meta="${d.id}">Details</button>` : ''}${manage ? html` <button class="ghost" data-sign="${d.id}">Request signature</button>` : ''}${canShareClient && d.buyerShareable ? html` <button class="ghost" data-share-client="${d.id}" data-share-on="${d.sharedWithClient ? '0' : '1'}">${d.sharedWithClient ? 'Stop sharing with buyer' : 'Share with buyer'}</button>` : ''}${canShareClient && d.sellerShareable ? html` <button class="ghost" data-share-seller="${d.id}" data-share-on="${d.sharedWithSeller ? '0' : '1'}">${d.sharedWithSeller ? 'Stop sharing with seller' : 'Share with seller'}</button>` : ''}</td></tr>`);
  const sigRows = sigs.map((r) => html`<tr data-sigreq="${r.id}"><td>${r.docName}</td><td>${r.signers.map((s) => html`<div>${s.name} <span class="muted small">(${s.roleLabel})</span> ${s.status === 'signed' ? html`${pill('signed', 'ok')} <span class="muted small">${fmtDateTime(s.signedAt)}</span>` : pill(r.status === 'cancelled' ? 'cancelled' : 'requested', r.status === 'cancelled' ? '' : 'info')}</div>`)}</td>
    <td>${pill(r.status, r.status === 'signed' ? 'ok' : r.status === 'requested' ? 'info' : '')}<br><span class="muted small">requested by ${r.requestedByName} ${fmtDateTime(r.requestedAt)}</span></td><td>${manage && r.status === 'requested' ? html`<button class="ghost" data-sigcancel="${r.id}">Cancel request</button>` : ''}</td></tr>`);
  const body = html`<div class="box-title"><h2><span class="h-ico"></span>Documents &amp; Files</h2>${canUpload ? html`<button class="m-btn right" id="upbtn">Upload here</button> <button class="ghost right" id="sharefiles">Share Files</button>` : ''}</div>
    <div class="folder-bar" data-folder-bar hidden><a class="folder ${folder === null ? 'active' : ''}" href="${href(tab, null)}">All folders</a>${folders.map((f) => html`<a class="folder ${folder === f.id ? 'active' : ''}" href="${href(tab, f.id)}" data-fid="${f.id}">${f.name} <span class="muted">${f.count}</span></a>`)}
      ${manage ? html`<button class="ghost" id="newfolder">+ Folder</button>${folder ? html` <button class="ghost" id="renamefolder">Rename folder</button>` : ''}` : ''}</div>
    <ul class="nav-tabs" data-doc-tabs>${[['all', 'All files'], ['received', 'Received'], ['sent', 'Sent']].map(([k, l]) => html`<li><a class="${k === tab ? 'active' : ''}" href="${href(k, folder)}" data-doc-tab="${k}">${l}</a></li>`)}</ul>
    ${rows.length ? html`<table class="tbl striped"><thead><tr><th>File Type</th><th>File Name</th><th>Folder</th><th>Date</th><th>From</th><th>Additional Instruction</th><th>Access</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : html`<p class="muted" data-docs-empty>No documents have been shared on this file yet.</p>`}
    <p class="muted small">Documents are kept permanently. They cannot be deleted.</p>${entBlock}
    ${sigs.length ? html`<div class="box-title"><h2><span class="h-ico"></span>Signatures</h2></div><p class="muted small">Demo e-sign: not legally binding. A real provider (DocuSign / Dropbox Sign) plugs in at the same place.</p>
      <table class="tbl striped" id="sigtable"><thead><tr><th>Document</th><th>Signers</th><th>Status</th><th></th></tr></thead><tbody>${sigRows}</tbody></table>` : ''}`;
  return { title: 'Documents', crumbs: [['Documents']], body, mount(root) {
    $$('[data-open]', root).forEach((a) => a.addEventListener('click', guard(async (e) => { e.preventDefault(); downloadNamed(await api.getDocumentContent(a.dataset.open)); })));
    $$('[data-meta]', root).forEach((b) => b.addEventListener('click', () => meta(docs.find((d) => d.id === b.dataset.meta))));
    const ub = $('#upbtn', root); if (ub) ub.addEventListener('click', upload);
    const sfb = $('#sharefiles', root); if (sfb) sfb.addEventListener('click', guard(() => composeModal({ api, deal, user, go: (p) => { location.hash = p; } }, { title: 'New Conversation', withFiles: true })));
    $$('[data-share-client]', root).forEach((b) => b.addEventListener('click', guard(async () => { const on = b.dataset.shareOn === '1';
      await api.shareDocumentWithClient(b.dataset.shareClient, on); toast(on ? 'Shared with the buyer (in the portal only; nothing is emailed)' : 'No longer shared with the buyer'); refresh(); })));
    $$('[data-share-seller]', root).forEach((b) => b.addEventListener('click', guard(async () => { const on = b.dataset.shareOn === '1';
      await api.shareDocumentWithSeller(b.dataset.shareSeller, on); toast(on ? 'Shared with the seller (in the portal only; nothing is emailed)' : 'No longer shared with the seller'); refresh(); })));
    $$('[data-sign]', root).forEach((b) => b.addEventListener('click', guard(() => signReq(docs.find((d) => d.id === b.dataset.sign)))));
    $$('[data-sigcancel]', root).forEach((b) => b.addEventListener('click', guard(async () => { if (!confirm('Cancel this signature request?')) return; await api.cancelSignatureRequest(b.dataset.sigcancel); toast('Request cancelled'); refresh(); })));
    const nf = $('#newfolder', root); if (nf) nf.addEventListener('click', guard(async () => { const n = prompt('New folder name'); if (!n) return; await api.createFolder({ scope: 'deal', dealId: deal.id, name: n }); toast('Folder created'); refresh(); }));
    const rf = $('#renamefolder', root); if (rf) rf.addEventListener('click', guard(async () => { const cur = folders.find((f) => f.id === folder); const n = prompt('Rename folder', cur ? cur.name : ''); if (!n) return; await api.renameFolder(folder, n); refresh(); }));
  } };

  function upload() {
    let queue = [];
    const m = modal('Upload documents', html`<form id="uf" class="form-grid" novalidate>
      <label class="span2">Add files <span class="muted small">(${ALLOWED_UPLOAD_EXT.join(', ')}; demo limit ${MAX_UPLOAD_BYTES / 1e6} MB each. Choosing more files adds them. Each file keeps the type, folder, and who can see it below.)</span><input type="file" name="file" multiple data-upload-files></label>
      <ul class="plain" data-upload-queue></ul>
      <p class="span2"><button type="button" class="ghost" data-upload-clear>Clear selected files</button></p>
      ${typeFields('')}
      <label class="span2">Additional instruction<input name="description" maxlength="500"></label>
      <label class="span2">Folder<select name="folderId"><option value="">Unfiled</option>${options(realFolders, folder || '', (f) => f.name, (f) => f.id)}</select></label>${audienceFields(visOpts[0])}${staffView ? html`<label class="check span2"><input type="checkbox" name="wireInstructions" data-wire-mark> Wire instructions (buyer clients and CLA Title only; agents never see it, whatever "Who can see it" says)</label>` : ''}${isClient(user.role) ? html`<p class="span2 muted small" data-share-note>${user.role === 'Client-Buyer' ? BUYER_SHARE_NOTE : CLIENT_SHARE_NOTE}</p>` : html`<p class="span2 muted small" data-staff-share>CLA staff only means every CLA staff role on the portal, including the processor, coordinator, and sales. It is not limited to the processor, and the other side does not see it.</p>`}
      <p class="span2 err-text" data-upload-err role="alert"></p>
      <div class="span2"><button class="m-btn" type="submit" data-upload-submit>Upload</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`);
    const form = $('#uf', m); const err = $('[data-upload-err]', form); const list = $('[data-upload-queue]', form); const input = $('[data-upload-files]', form);
    const draw = () => { list.innerHTML = queue.length ? queue.map((file, i) => `<li data-queued="${i}">${String(file.name).replace(/[<>&"]/g, '')} <button type="button" class="ghost" data-upload-remove="${i}">Remove</button></li>`).join('') : '<li class="muted">No files selected.</li>';
      $$('[data-upload-remove]', list).forEach((b) => b.addEventListener('click', () => { queue = removeFromQueue(queue, Number(b.dataset.uploadRemove)); draw(); })); };
    input.addEventListener('change', () => { const added = addToQueue(queue, [...input.files]); queue = added.queue; if (added.skipped.length) err.textContent = added.skipped.map((z) => `${z.name}: ${z.reason}`).join(' '); input.value = ''; draw(); });
    $('[data-upload-clear]', form).addEventListener('click', () => { queue = []; err.textContent = ''; draw(); });
    draw(); mountType(form); mountAudience(form);
    form.addEventListener('submit', async (e) => { e.preventDefault(); const btn = $('[data-upload-submit]', form); err.textContent = '';
      if (!queue.length) { err.textContent = 'Choose a file to upload.'; toast('Choose a file to upload.', 'err'); return; }
      const f = formData(form); const seen = chosenVisibility(form);
      if (seen.error) { err.textContent = seen.error; toast(seen.error, 'err'); return; }
      if (btn.disabled) return; btn.disabled = true; btn.textContent = 'Uploading…';
      const pending = queue.slice(); const docType = chosenType(form, f);
      try {
        const result = await uploadDocumentBatch(pending, async (file) => {
          const dataUrl = await readFile(file);
          const slots = form._uploads || (form._uploads = new Map()); const key = [file.name, file.size, file.lastModified].join('\0');
          if (!slots.has(key)) slots.set(key, {});
          const id = sameUploadId(slots.get(key), file);
          return api.addDocument(deal.id, { id, name: file.name, description: f.description, mimeType: file.type, size: file.size, dataUrl, file, visibility: clientShareVisibility(user.role, seen.visibility), folderId: f.folderId || null, docType, wireInstructions: staffView && !!f.wireInstructions });
        }, docs.map((d) => d.name));
        const failedNames = new Set(result.failed.map((z) => z.name));
        queue = pending.filter((file) => failedNames.has(file.name));
        draw();
        if (result.saved.length && !result.failed.length) { closeModal(); toast(`${result.saved.length} uploaded`); refresh(); return; }
        err.textContent = result.failed.map((z) => `${z.name}: ${uploadFailureText(z.reason)}`).join(' ');
        toast(err.textContent, 'err'); btn.disabled = false; btn.textContent = 'Upload';
      } catch (ex) { err.textContent = uploadFailureText(ex.message); toast(err.textContent, 'err'); btn.disabled = false; btn.textContent = 'Upload'; } });
  }
  // E-SIGN (demo): processor / coordinator pick who signs. Only people who can see the document can be asked.
  async function signReq(d) {
    const people = await api.listSignatureCandidates(d.id);
    const m = modal('Request signature', html`<form id="sgf" class="form-grid"><p class="span2"><strong>${d.name}</strong></p>
      <p class="span2 notice warn">Demo e-sign: not legally binding. Each signer gets a "Sign" task; only they can sign it (agents cannot sign for clients).</p>
      <fieldset class="span2"><legend>Who should sign?</legend>${people.length ? people.map((p) => html`<label class="check"><input type="checkbox" name="signer" value="${p.profileId}" ${p.canSee ? '' : raw('disabled')}> ${p.name} <span class="muted small">(${p.roleLabel})${p.canSee ? '' : ' - cannot see this document'}</span></label>`) : html`<p class="muted">No agents or clients with a portal login on this file.</p>`}</fieldset>
      <label class="span2">Message to the signers<input name="message" maxlength="500"></label>
      <div class="span2"><button class="m-btn" type="submit">Send request</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`);
    $('#sgf', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); const ids = $$('input[name=signer]:checked', e.target).map((i) => i.value);
      await api.requestSignature(d.id, { signerIds: ids, message: e.target.elements.message.value }); closeModal(); toast('Signature requested. Each signer has a Sign task.'); refresh(); }));
  }
  function meta(d) {
    const canMeta = runsOrders(user) || d.uploadedBy === user.id;
    const m = modal('Document details', html`<form id="mf" class="form-grid"><p class="span2"><strong>${d.name}</strong></p>
      ${canMeta ? html`${typeFields(d.docType)}
      <label class="span2">Additional instruction<input name="description" value="${d.description}"></label>
      ${audienceFields(d.visibility)}` : ''}
      ${canMeta && staffView ? html`<label class="check span2"><input type="checkbox" name="wireInstructions" data-wire-mark ${d.wireInstructions ? raw('checked') : ''}> Wire instructions (buyer clients and CLA Title only)</label>` : ''}
      ${manage ? html`<label class="span2">Folder<select name="folderId"><option value="">Unfiled</option>${options(realFolders, d.folderId || '', (f) => f.name, (f) => f.id)}</select></label>` : ''}
      <p class="span2 muted small">Documents cannot be deleted.</p>
      <div class="span2"><button class="m-btn" type="submit">Save</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`);
    const mf = $('#mf', m); mountType(mf); mountAudience(mf);
    mf.addEventListener('submit', guard(async (e) => { e.preventDefault(); const f = formData(e.target); const seen = chosenVisibility(e.target); if (canMeta && seen.error) { toast(seen.error, 'err'); return; } if (canMeta) await api.updateDocumentMeta(d.id, { description: f.description, visibility: clientShareVisibility(user.role, seen.visibility || d.visibility), docType: chosenType(e.target, f), ...(staffView ? { wireInstructions: !!f.wireInstructions } : {}) });
      if (manage && (f.folderId || null) !== (d.folderId || null)) await api.moveDocument(d.id, f.folderId || null); closeModal(); toast('Saved'); refresh(); }));
  }
}
