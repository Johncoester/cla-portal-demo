/* mock adapter: Library (firm-wide files in folders, e.g. wire-safety notice, checklists) and per-order folders.
 * Folders are renamed, never deleted. Library documents follow the same never-delete rule as order documents. */
export function libraryFolders(x) {
  const { load, save, nid, needUser, isManager, dealOr404, log, folderOf, docVisible, clone, now, fail, str, C } = x;
  const libManager = (u) => C.isProcessor(u.role) || u.isAdmin;
  const staffish = (u) => u.isAdmin || C.isStaff(u.role) || u.role === 'Transaction Coordinator';
  return {
    async listLibrary() {
      const u = needUser(); const d = load();
      return clone(d.folders.filter((f) => f.scope === 'library' && (!f.staffOnly || staffish(u))).sort((a, b) => a.name.localeCompare(b.name))
        .map((f) => ({ ...f, documents: d.documents.filter((z) => !z.dealId && z.folderId === f.id && docVisible(u, z)).map(x.docOut).sort((a, b) => a.name.localeCompare(b.name)) })));
    },
    async listDealFolders(dealId) {
      const u = needUser(); dealOr404(u, dealId); const d = load();
      const docs = d.documents.filter((z) => z.dealId === dealId && docVisible(u, z));
      return clone([...d.folders.filter((f) => f.scope === 'deal' && f.dealId === dealId).map((f) => ({ ...f, count: docs.filter((z) => z.folderId === f.id).length })),
        { id: '', name: 'Unfiled', scope: 'deal', dealId, virtual: true, count: docs.filter((z) => !z.folderId).length }]);
    },
    async createFolder({ scope, dealId, name, staffOnly }) {
      const u = needUser(); const n = str(name, 120) || fail('Folder name is required.'); const d = load();
      if (scope === 'library') { if (!libManager(u)) fail('Only the processor or Admin can manage the Library.'); dealId = null; }
      else if (scope === 'deal') { dealOr404(u, dealId); if (!isManager(u)) fail('Only the processor or coordinator can add folders.'); staffOnly = false; }
      else fail('Unknown folder type.');
      if (d.folders.some((f) => f.scope === scope && f.dealId === (dealId || null) && f.name.toLowerCase() === n.toLowerCase())) fail('A folder with this name already exists here.');
      const f = { id: nid('f'), scope, dealId: dealId || null, name: n, staffOnly: !!staffOnly && staffOnly !== 'false', createdBy: u.id, createdAt: now() };
      d.folders.push(f); log(dealId || null, u.id, 'folder.created', 'folder', f.id, `Created folder ${n}`); save(); return clone(f);
    },
    async renameFolder(id, name) {
      const u = needUser(); const f = folderOf(id) || fail('Folder not found.');
      if (f.scope === 'library') { if (!libManager(u)) fail('Only the processor or Admin can manage the Library.'); } else { dealOr404(u, f.dealId); if (!isManager(u)) fail('Only the processor or coordinator can rename folders.'); }
      f.name = str(name, 120) || fail('Folder name is required.'); log(f.dealId, u.id, 'folder.renamed', 'folder', id, `Renamed folder to ${f.name}`); save(); return clone(f);
    },
    async addLibraryDocument(folderId, file) {
      const u = needUser(); if (!libManager(u)) fail('Only the processor or Admin can add Library files.');
      const f = folderOf(folderId); if (!f || f.scope !== 'library') fail('Pick a Library folder.');
      const doc = x.newDoc(u, { ...file, visibility: f.staffOnly ? 'staff' : 'all' }); doc.folderId = f.id;
      load().documents.push(doc); log(null, u.id, 'document.uploaded', 'document', doc.id, `Added ${doc.name} to the Library`); save(); return clone(x.docOut(doc));
    },
  };
}
