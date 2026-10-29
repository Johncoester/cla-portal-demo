// Library: firm-wide files in folders (wire-safety notice, checklists, staff procedures). Everyone reads; the processor and Admin add folders and files.
// Library files are never deleted, like order documents.
import { html, $, $$, guard, formData, modal, closeModal, options, toast, fmtDate, fmtSize, pill } from '../ui.js';
import { MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_EXT, isProcessor } from '../data/constants.js';
const readFile = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Could not read the file.')); r.readAsDataURL(f); });

export async function render({ api, user, refresh }) {
  const folders = await api.listLibrary(); const manage = isProcessor(user.role) || user.isAdmin;
  const card = (f) => html`<div class="card"><div class="deal-card-head"><h3>&#128193; ${f.name}</h3>${f.staffOnly ? pill('staff only', 'warn') : ''}<span class="spacer"></span>
      ${manage ? html`<button class="ghost" data-rename="${f.id}" data-name="${f.name}">Rename</button>` : ''}</div>
    ${f.documents.length ? html`<table class="tbl"><tbody>${f.documents.map((d) => html`<tr><td><a href="#" data-open="${d.id}">${d.name}</a><br><span class="muted small">${d.description}</span></td><td>${fmtSize(d.size)}</td><td>${fmtDate(d.createdAt)}</td></tr>`)}</tbody></table>` : html`<p class="muted">Empty folder.</p>`}</div>`;
  const body = html`<div class="box-title"><h2><span class="h-ico"></span>Library</h2>${manage ? html`<span class="right"><button class="ghost" id="nf">+ Folder</button> <button class="m-btn" id="up">Add file</button></span>` : ''}</div>
    <p class="muted">Reference files for everyone using the portal. Files are kept permanently.</p><div class="card-grid">${folders.map(card)}</div>`;
  return { title: 'Library', crumbs: [['Library']], body, mount(root) {
    $$('[data-open]', root).forEach((a) => a.addEventListener('click', guard(async (e) => { e.preventDefault(); const c = await api.getDocumentContent(a.dataset.open); const l = document.createElement('a'); l.href = c.dataUrl; l.download = c.name; document.body.appendChild(l); l.click(); l.remove(); })));
    $$('[data-rename]', root).forEach((b) => b.addEventListener('click', guard(async () => { const n = prompt('Rename folder', b.dataset.name); if (!n) return; await api.renameFolder(b.dataset.rename, n); refresh(); })));
    const nf = $('#nf', root); if (nf) nf.addEventListener('click', () => { const m = modal('New Library folder', html`<form id="ff" class="form-grid"><label class="span2">Name *<input name="name" required maxlength="120"></label>
      <label class="check span2"><input type="checkbox" name="staffOnly"> Staff only (hidden from clients and agents)</label><div class="span2"><button class="m-btn" type="submit">Create</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`);
      $('#ff', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); const f = formData(e.target); await api.createFolder({ scope: 'library', name: f.name, staffOnly: !!f.staffOnly }); closeModal(); toast('Folder created'); refresh(); })); });
    const up = $('#up', root); if (up) up.addEventListener('click', () => { const m = modal('Add a Library file', html`<form id="lf" class="form-grid"><label class="span2">Folder<select name="folderId">${options(folders, folders[0] && folders[0].id, (f) => f.name, (f) => f.id)}</select></label>
      <label class="span2">File * <span class="muted small">(${ALLOWED_UPLOAD_EXT.join(', ')})</span><input type="file" name="file" required></label><label class="span2">Description<input name="description" maxlength="500"></label>
      <div class="span2"><button class="m-btn" type="submit">Add</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`);
      $('#lf', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); const f = formData(e.target); const file = f.file; if (!file || !file.name) throw new Error('Choose a file.');
        if (file.size > MAX_UPLOAD_BYTES) throw new Error('File is too large for this demo.');
        await api.addLibraryDocument(f.folderId, { name: file.name, description: f.description, mimeType: file.type, size: file.size, dataUrl: await readFile(file) }); closeModal(); toast('Added'); refresh(); })); });
  } };
}
