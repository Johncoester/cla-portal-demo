/* Annotate document rows the caller was already allowed to read.
 * This does not add a row, change visibility, or decide who may see a file. */
export function shapeListedDocument(row, folders = []) {
  const d = { ...(row || {}) };
  if (d.size == null && d.sizeBytes != null) d.size = d.sizeBytes;
  if (d.hasContent == null) d.hasContent = !!(d.storagePath || d.dataUrl);
  if (!d.folderName && d.folderId) {
    const f = (folders || []).find((x) => x && x.id === d.folderId);
    if (f && f.name) d.folderName = f.name;
  }
  return d;
}

/* folderId undefined = every row already returned. '' = unfiled. An id = that folder only. */
export function filterListedDocuments(rows, folderId) {
  const list = rows || [];
  if (folderId === undefined) return list;
  if (!folderId) return list.filter((d) => d && !d.folderId);
  return list.filter((d) => d && d.folderId === folderId);
}
