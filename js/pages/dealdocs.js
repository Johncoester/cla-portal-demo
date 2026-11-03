// Documents tab with folders. Upload, open/download, file into folders, edit description/visibility. There is NO delete: documents are kept permanently.
import { html, raw, $, $$, guard, formData, modal, closeModal, options, fmtDateTime, fmtSize, pill, toast } from '../ui.js?v=202611031817';
import { composeModal } from './compose.js?v=202611031817';
import { runsOrders, viewOnly, DOC_VISIBILITY, MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_EXT, isProcessor, isViewOnly, isClient, visibilityChoices, visibilityLabel, CLIENT_SHARE_NOTE, DOC_TYPES, docTypeChoices } from '../data/constants.js?v=202611031817';
const icon = (n) => (/\.pdf$/i.test(n) ? 'pdf_icon.png' : /\.docx?$/i.test(n) ? 'word_icon.png' : /\.(xlsx?|csv)$/i.test(n) ? 'excel_icon.png' : 'image_icon.png');
const readFile = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Could not read the file.')); r.readAsDataURL(f); });

export async function render({ api, user, deal, refresh }) {
  const q = new URLSearchParams(location.hash.split('?')[1] || ''); const tab = ['received', 'sent', 'all'].includes(q.get('t')) ? q.get('t') : 'all';
  const folder = q.has('f') ? q.get('f') : null; const docs = await api.listDocuments(deal.id, folder === null ? {} : { folderId: folder }); const folders = await api.listDealFolders(deal.id);
  const manage = runsOrders(user) || user.role === 'Transaction Coordinator'; const realFolders = folders.filter((f) => !f.virtual);
  const href = (t, f) => `#/deals/${deal.id}/documents?t=${t}${f === null ? '' : '&f=' + encodeURIComponent(f)}`;
  const shown = docs.filter((d) => tab === 'all' || (tab === 'sent') === (d.uploadedBy === user.id));
  const staffView = !user.accountRole && user.role !== 'Outside user'; const types = staffView ? DOC_TYPES : docTypeChoices(user.role);   // Matt: seller document types
  const sigs = await api.listSignatureRequests(deal.id);
  // Matt, Nov 3: entity documents requested from a buyer / seller acting as an entity (shown to the person, the processor, the coordinator and Admin)
  const ents = await api.listEntityDocRequests(deal.id).catch(() => []);
  const entBlock = ents.length ? html`<div class="box-title"><h2><span class="h-ico"></span>Requested entity documents</h2></div>
    <table class="tbl striped" id="entity-docs"><thead><tr><th>Buyer / seller</th><th>Entity</th><th>Authorized signer</th><th>Requested documents</th></tr></thead><tbody>${ents.map((e) => html`<tr data-entity-task="${e.taskId}">
      <td>${e.ownerName || e.role}<br><span class="muted small">${e.role === 'Client-Seller' ? 'Seller' : 'Buyer'} &middot; <a href="#/deals/${deal.id}/tasks/${e.taskId}">${e.taskTitle}</a></span></td>
      <td>${e.entityName || html`<span class="muted">name not given yet</span>`}<br><span class="muted small">${[e.entityType, e.entityState && `formed in ${e.entityState}`].filter(Boolean).join(' \u00b7 ')}</span></td>
      <td>${e.signerName}${e.signerTitle ? html`<br><span class="muted small">${e.signerTitle}</span>` : ''}</td>
      <td><ul class="plain">${e.documents.map((x) => html`<li data-entity-doc="${x.key}" data-attached="${x.attached ? 'yes' : 'no'}">${x.label}: ${x.attached ? html`${pill('attached', 'ok')} <a href="#" data-open="${x.docId}" class="doc-link">${x.docName}</a>` : pill(x.optional ? 'none attached (only if there are amendments)' : 'not yet attached', x.optional ? '' : 'warn')}</li>`)}</ul></td></tr>`)}</tbody></table>` : '';
  const canUpload = !viewOnly(user); const visOpts = visibilityChoices(user.role, user.isAdmin); const VL = (v) => visibilityLabel(v, user.role);   // user.role = the role on THIS file (deal.js scopes it)
  const rows = shown.map((d) => html`<tr><td class="center"><img class="fileico" src="assets/img/${icon(d.name)}" alt=""></td>
    <td data-doc-row="${d.id}"${d.wireInstructions ? raw(' data-wire-doc') : ''}><a href="#" data-open="${d.id}" class="doc-link">${d.name}</a>${d.wireInstructions ? html` ${pill('wire instructions - buyer only', 'warn')}` : ''}<br><span class="muted small">${d.docType ? html`<span data-doctype>${d.docType}</span> &middot; ` : ''}${fmtSize(d.size)}${d.hasContent ? '' : ' \u00b7 sample file'}</span></td>
    <td>${d.folderName || html`<span class="muted">Unfiled</span>`}</td><td>${fmtDateTime(d.createdAt)}</td><td>${d.uploadedByName}<br><span class="muted small">${d.uploadedByRole}</span></td><td>${d.description}</td><td>${pill(VL(d.visibility), d.visibility === 'all' ? '' : 'info')}</td>
    <td class="nowrap">${runsOrders(user) || d.uploadedBy === user.id || manage ? html`<button class="ghost" data-meta="${d.id}">Details</button>` : ''}${manage ? html` <button class="ghost" data-sign="${d.id}">Request signature</button>` : ''}</td></tr>`);
  const sigRows = sigs.map((r) => html`<tr data-sigreq="${r.id}"><td>${r.docName}</td><td>${r.signers.map((s) => html`<div>${s.name} <span class="muted small">(${s.roleLabel})</span> ${s.status === 'signed' ? html`${pill('signed', 'ok')} <span class="muted small">${fmtDateTime(s.signedAt)}</span>` : pill(r.status === 'cancelled' ? 'cancelled' : 'requested', r.status === 'cancelled' ? '' : 'info')}</div>`)}</td>
    <td>${pill(r.status, r.status === 'signed' ? 'ok' : r.status === 'requested' ? 'info' : '')}<br><span class="muted small">requested by ${r.requestedByName} ${fmtDateTime(r.requestedAt)}</span></td><td>${manage && r.status === 'requested' ? html`<button class="ghost" data-sigcancel="${r.id}">Cancel request</button>` : ''}</td></tr>`);
  const body = html`<div class="box-title"><h2><span class="h-ico"></span>Documents &amp; Files</h2>${canUpload ? html`<button class="m-btn right" id="upbtn">Upload here</button> <button class="ghost right" id="sharefiles">Share Files</button>` : ''}</div>
    <div class="folder-bar"><a class="folder ${folder === null ? 'active' : ''}" href="${href(tab, null)}">All folders</a>${folders.map((f) => html`<a class="folder ${folder === f.id ? 'active' : ''}" href="${href(tab, f.id)}" data-fid="${f.id}">${f.name} <span class="muted">${f.count}</span></a>`)}
      ${manage ? html`<button class="ghost" id="newfolder">+ Folder</button>${folder ? html` <button class="ghost" id="renamefolder">Rename folder</button>` : ''}` : ''}</div>
    <ul class="nav-tabs">${[['all', 'All files'], ['received', 'Received'], ['sent', 'Uploaded']].map(([k, l]) => html`<li><a class="${k === tab ? 'active' : ''}" href="${href(k, folder)}">${l}</a></li>`)}</ul>
    ${rows.length ? html`<table class="tbl striped"><thead><tr><th>File Type</th><th>File Name</th><th>Folder</th><th>Date</th><th>From</th><th>Additional Instruction</th><th>Access</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : html`<p class="muted">No files here yet.</p>`}
    <p class="muted small">Documents are kept permanently. They cannot be deleted.</p>${entBlock}
    ${sigs.length ? html`<div class="box-title"><h2><span class="h-ico"></span>Signatures</h2></div><p class="muted small">Demo e-sign: not legally binding. A real provider (DocuSign / Dropbox Sign) plugs in at the same place.</p>
      <table class="tbl striped" id="sigtable"><thead><tr><th>Document</th><th>Signers</th><th>Status</th><th></th></tr></thead><tbody>${sigRows}</tbody></table>` : ''}`;
  return { title: 'Documents', crumbs: [['Documents']], body, mount(root) {
    $$('[data-open]', root).forEach((a) => a.addEventListener('click', guard(async (e) => { e.preventDefault(); const c = await api.getDocumentContent(a.dataset.open); const l = document.createElement('a'); l.href = c.dataUrl; l.download = c.name; document.body.appendChild(l); l.click(); l.remove(); })));
    $$('[data-meta]', root).forEach((b) => b.addEventListener('click', () => meta(docs.find((d) => d.id === b.dataset.meta))));
    const ub = $('#upbtn', root); if (ub) ub.addEventListener('click', upload);
    const sfb = $('#sharefiles', root); if (sfb) sfb.addEventListener('click', guard(() => composeModal({ api, deal, user, go: (p) => { location.hash = p; } }, { title: 'New Conversation', withFiles: true })));
    $$('[data-sign]', root).forEach((b) => b.addEventListener('click', guard(() => signReq(docs.find((d) => d.id === b.dataset.sign)))));
    $$('[data-sigcancel]', root).forEach((b) => b.addEventListener('click', guard(async () => { if (!confirm('Cancel this signature request?')) return; await api.cancelSignatureRequest(b.dataset.sigcancel); toast('Request cancelled'); refresh(); })));
    const nf = $('#newfolder', root); if (nf) nf.addEventListener('click', guard(async () => { const n = prompt('New folder name'); if (!n) return; await api.createFolder({ scope: 'deal', dealId: deal.id, name: n }); toast('Folder created'); refresh(); }));
    const rf = $('#renamefolder', root); if (rf) rf.addEventListener('click', guard(async () => { const cur = folders.find((f) => f.id === folder); const n = prompt('Rename folder', cur ? cur.name : ''); if (!n) return; await api.renameFolder(folder, n); refresh(); }));
  } };

  function upload() {
    const m = modal('Upload a document', html`<form id="uf" class="form-grid"><label class="span2">File * <span class="muted small">(${ALLOWED_UPLOAD_EXT.join(', ')}; demo limit ${MAX_UPLOAD_BYTES / 1e6} MB)</span><input type="file" name="file" required></label>
      <label class="span2">Document type<select name="docType"><option value="">Choose&hellip;</option>${options(types, '')}</select></label>
      <label class="span2">Additional instruction<input name="description" maxlength="500"></label>
      <label class="span2">Folder<select name="folderId"><option value="">Unfiled</option>${options(realFolders, folder || '', (f) => f.name, (f) => f.id)}</select></label><label class="span2">Who can see it<select name="visibility">${options(visOpts, visOpts[0], VL)}</select></label>${staffView ? html`<label class="check span2"><input type="checkbox" name="wireInstructions" data-wire-mark> Wire instructions (buyer clients and CLA Title only; agents never see it, whatever "Who can see it" says)</label>` : ''}${isClient(user.role) ? html`<p class="span2 muted small" data-share-note>${CLIENT_SHARE_NOTE}</p>` : ''}
      <div class="span2"><button class="m-btn" type="submit">Upload</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`);
    $('#uf', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); const f = formData(e.target); const file = f.file; if (!file || !file.name) throw new Error('Choose a file.');
      if (file.size > MAX_UPLOAD_BYTES) throw new Error('File is too large for this demo.'); const dataUrl = await readFile(file);
      await api.addDocument(deal.id, { name: file.name, description: f.description, mimeType: file.type, size: file.size, dataUrl, visibility: f.visibility, folderId: f.folderId || null, docType: f.docType || '', wireInstructions: staffView && !!f.wireInstructions }); closeModal(); toast('Uploaded'); refresh(); }));
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
      ${canMeta ? html`<label class="span2">Document type<select name="docType"><option value="">Choose&hellip;</option>${options([...new Set([...types, ...(d.docType ? [d.docType] : [])])], d.docType || '')}</select></label>
      <label class="span2">Additional instruction<input name="description" value="${d.description}"></label>
      <label class="span2">Who can see it<select name="visibility">${options(visOpts, d.visibility, VL)}</select></label>` : ''}
      ${canMeta && staffView ? html`<label class="check span2"><input type="checkbox" name="wireInstructions" data-wire-mark ${d.wireInstructions ? raw('checked') : ''}> Wire instructions (buyer clients and CLA Title only)</label>` : ''}
      ${manage ? html`<label class="span2">Folder<select name="folderId"><option value="">Unfiled</option>${options(realFolders, d.folderId || '', (f) => f.name, (f) => f.id)}</select></label>` : ''}
      <p class="span2 muted small">Documents cannot be deleted.</p>
      <div class="span2"><button class="m-btn" type="submit">Save</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`);
    $('#mf', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); const f = formData(e.target); if (canMeta) await api.updateDocumentMeta(d.id, { description: f.description, visibility: f.visibility, docType: f.docType || '', ...(staffView ? { wireInstructions: !!f.wireInstructions } : {}) });
      if (manage && (f.folderId || null) !== (d.folderId || null)) await api.moveDocument(d.id, f.folderId || null); closeModal(); toast('Saved'); refresh(); }));
  }
}
