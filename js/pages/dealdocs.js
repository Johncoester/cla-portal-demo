// Documents tab with folders. Upload, open/download, file into folders, edit description/visibility. There is NO delete: documents are kept permanently.
import { html, $, $$, guard, formData, modal, closeModal, options, fmtDateTime, fmtSize, pill, toast } from '../ui.js';
import { DOC_VISIBILITY, MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_EXT, isProcessor, isClient, isViewOnly } from '../data/constants.js';

const VIS = { all: 'Everyone on the file', buyer: 'Buyer side only', seller: 'Seller side only', staff: 'CLA staff only' };
const icon = (n) => (/\.pdf$/i.test(n) ? 'pdf_icon.png' : /\.docx?$/i.test(n) ? 'word_icon.png' : /\.(xlsx?|csv)$/i.test(n) ? 'excel_icon.png' : 'image_icon.png');
const readFile = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Could not read the file.')); r.readAsDataURL(f); });

export async function render({ api, user, deal, refresh }) {
  const q = new URLSearchParams(location.hash.split('?')[1] || ''); const tab = ['received', 'sent', 'all'].includes(q.get('t')) ? q.get('t') : 'all';
  const folder = q.has('f') ? q.get('f') : null; const docs = await api.listDocuments(deal.id, folder === null ? {} : { folderId: folder }); const folders = await api.listDealFolders(deal.id);
  const manage = isProcessor(user.role) || user.role === 'Transaction Coordinator'; const realFolders = folders.filter((f) => !f.virtual);
  const href = (t, f) => `#/deals/${deal.id}/documents?t=${t}${f === null ? '' : '&f=' + encodeURIComponent(f)}`;
  const shown = docs.filter((d) => tab === 'all' || (tab === 'sent') === (d.uploadedBy === user.id));
  const canUpload = !isViewOnly(user.role); const visOpts = DOC_VISIBILITY.filter((v) => !(isClient(user.role) && v === 'staff'));
  const rows = shown.map((d) => html`<tr><td class="center"><img class="fileico" src="assets/img/${icon(d.name)}" alt=""></td>
    <td><a href="#" data-open="${d.id}" class="doc-link">${d.name}</a><br><span class="muted small">${fmtSize(d.size)}${d.hasContent ? '' : ' \u00b7 sample file'}</span></td>
    <td>${d.folderName || html`<span class="muted">Unfiled</span>`}</td><td>${fmtDateTime(d.createdAt)}</td><td>${d.uploadedByName}<br><span class="muted small">${d.uploadedByRole}</span></td><td>${d.description}</td><td>${pill(VIS[d.visibility], d.visibility === 'all' ? '' : 'info')}</td>
    <td>${isProcessor(user.role) || d.uploadedBy === user.id || manage ? html`<button class="ghost" data-meta="${d.id}">Details</button>` : ''}</td></tr>`);
  const body = html`<div class="box-title"><h2><span class="h-ico"></span>Documents &amp; Files</h2>${canUpload ? html`<button class="m-btn right" id="upbtn">Upload here</button>` : ''}</div>
    <div class="folder-bar"><a class="folder ${folder === null ? 'active' : ''}" href="${href(tab, null)}">All folders</a>${folders.map((f) => html`<a class="folder ${folder === f.id ? 'active' : ''}" href="${href(tab, f.id)}" data-fid="${f.id}">${f.name} <span class="muted">${f.count}</span></a>`)}
      ${manage ? html`<button class="ghost" id="newfolder">+ Folder</button>${folder ? html` <button class="ghost" id="renamefolder">Rename folder</button>` : ''}` : ''}</div>
    <ul class="nav-tabs">${[['all', 'All files'], ['received', 'Received'], ['sent', 'Sent']].map(([k, l]) => html`<li><a class="${k === tab ? 'active' : ''}" href="${href(k, folder)}">${l}</a></li>`)}</ul>
    ${rows.length ? html`<table class="tbl striped"><thead><tr><th>File Type</th><th>File Name</th><th>Folder</th><th>Date</th><th>From</th><th>Additional Instruction</th><th>Access</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : html`<p class="muted">No files here yet.</p>`}
    <p class="muted small">Documents are kept permanently. They cannot be deleted.</p>`;
  return { title: 'Documents', crumbs: [['Documents']], body, mount(root) {
    $$('[data-open]', root).forEach((a) => a.addEventListener('click', guard(async (e) => { e.preventDefault(); const c = await api.getDocumentContent(a.dataset.open); const l = document.createElement('a'); l.href = c.dataUrl; l.download = c.name; document.body.appendChild(l); l.click(); l.remove(); })));
    $$('[data-meta]', root).forEach((b) => b.addEventListener('click', () => meta(docs.find((d) => d.id === b.dataset.meta))));
    const ub = $('#upbtn', root); if (ub) ub.addEventListener('click', upload);
    const nf = $('#newfolder', root); if (nf) nf.addEventListener('click', guard(async () => { const n = prompt('New folder name'); if (!n) return; await api.createFolder({ scope: 'deal', dealId: deal.id, name: n }); toast('Folder created'); refresh(); }));
    const rf = $('#renamefolder', root); if (rf) rf.addEventListener('click', guard(async () => { const cur = folders.find((f) => f.id === folder); const n = prompt('Rename folder', cur ? cur.name : ''); if (!n) return; await api.renameFolder(folder, n); refresh(); }));
  } };

  function upload() {
    const m = modal('Upload a document', html`<form id="uf" class="form-grid"><label class="span2">File * <span class="muted small">(${ALLOWED_UPLOAD_EXT.join(', ')}; demo limit ${MAX_UPLOAD_BYTES / 1e6} MB)</span><input type="file" name="file" required></label>
      <label class="span2">Additional instruction<input name="description" maxlength="500"></label>
      <label class="span2">Folder<select name="folderId"><option value="">Unfiled</option>${options(realFolders, folder || '', (f) => f.name, (f) => f.id)}</select></label><label class="span2">Who can see it<select name="visibility">${options(visOpts, 'all', (v) => VIS[v])}</select></label>
      <div class="span2"><button class="m-btn" type="submit">Upload</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`);
    $('#uf', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); const f = formData(e.target); const file = f.file; if (!file || !file.name) throw new Error('Choose a file.');
      if (file.size > MAX_UPLOAD_BYTES) throw new Error('File is too large for this demo.'); const dataUrl = await readFile(file);
      await api.addDocument(deal.id, { name: file.name, description: f.description, mimeType: file.type, size: file.size, dataUrl, visibility: f.visibility, folderId: f.folderId || null }); closeModal(); toast('Uploaded'); refresh(); }));
  }
  function meta(d) {
    const canMeta = isProcessor(user.role) || d.uploadedBy === user.id;
    const m = modal('Document details', html`<form id="mf" class="form-grid"><p class="span2"><strong>${d.name}</strong></p>
      ${canMeta ? html`<label class="span2">Additional instruction<input name="description" value="${d.description}"></label>
      <label class="span2">Who can see it<select name="visibility">${options(visOpts, d.visibility, (v) => VIS[v])}</select></label>` : ''}
      ${manage ? html`<label class="span2">Folder<select name="folderId"><option value="">Unfiled</option>${options(realFolders, d.folderId || '', (f) => f.name, (f) => f.id)}</select></label>` : ''}
      <p class="span2 muted small">Documents cannot be deleted.</p>
      <div class="span2"><button class="m-btn" type="submit">Save</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`);
    $('#mf', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); const f = formData(e.target); if (canMeta) await api.updateDocumentMeta(d.id, { description: f.description, visibility: f.visibility });
      if (manage && (f.folderId || null) !== (d.folderId || null)) await api.moveDocument(d.id, f.folderId || null); closeModal(); toast('Saved'); refresh(); }));
  }
}
