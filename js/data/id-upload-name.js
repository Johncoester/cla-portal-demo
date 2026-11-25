/* MF-071 (Matt Landsberg, Portal Feedback Nov 25 2026): ID front/back uploads are stored as
 * "{person name} ID Front.{ext}" and "{person name} ID Back.{ext}". Used by mock and hosted upload. */
import { uploadFileName } from './upload-bytes.js?v=202611141400';

export const ID_UPLOAD_LABEL = { id_front: 'ID Front', id_back: 'ID Back' };

/** Keep a document title safe for storage: no slashes, no leading dots, collapsed spaces. */
export function tidyIdPersonName(name) {
  return String(name || '').replace(/[\\/]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Stored filename for an ID-upload field. Other fields keep the original (plus a missing extension). */
export function idUploadStoredName({ field, personName, originalName, mimeType } = {}) {
  const label = ID_UPLOAD_LABEL[field];
  const safeOrig = uploadFileName(originalName, mimeType);
  if (!label) return safeOrig;
  const who = tidyIdPersonName(personName) || 'Client';
  const dot = safeOrig.lastIndexOf('.');
  const ext = (dot > 0 ? safeOrig.slice(dot + 1) : 'jpg').toLowerCase();
  return `${who} ${label}.${ext}`.slice(0, 200);
}
