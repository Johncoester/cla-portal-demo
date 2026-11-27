/* Several documents in one pick. Each file is checked and stored on its own.
 * A file that fails stays unstored. A file that saved is not uploaded again. */
import { ALLOWED_UPLOAD_EXT, MAX_UPLOAD_BYTES } from './constants.js?v=202611302300';
import { uploadTooLargeMessage, isOverUploadLimit, mapUploadError } from './upload-limit.js?v=202611312900';

const extOf = (name) => { const n = String(name || ''); const i = n.lastIndexOf('.'); return i > 0 ? n.slice(i + 1).toLowerCase() : ''; };

export function cleanDocumentName(name) {
  return String(name == null ? '' : name).replace(/[\\/]/g, '_').trim();
}

/* image.jpg -> image-2.jpg when image.jpg is already taken. */
export function nextAvailableDocumentName(name, existingNames = []) {
  const raw = cleanDocumentName(name);
  if (!raw) return raw;
  const seen = existingNames instanceof Set
    ? existingNames
    : new Set((existingNames || []).map((n) => String(n || '').trim().toLowerCase()).filter(Boolean));
  if (!seen.has(raw.toLowerCase())) return raw;
  const i = raw.lastIndexOf('.');
  const ext = i > 0 ? raw.slice(i) : '';
  const base = i > 0 ? raw.slice(0, i) : raw;
  let n = 2;
  let candidate = `${base}-${n}${ext}`;
  while (seen.has(candidate.toLowerCase())) { n += 1; candidate = `${base}-${n}${ext}`; }
  return candidate;
}

export function planDocumentBatch(files, { existingNames = [], names = [], maxBytes = MAX_UPLOAD_BYTES, allowed = ALLOWED_UPLOAD_EXT, onDuplicate = 'reject' } = {}) {
  const seen = new Set((existingNames || []).map((n) => String(n || '').trim().toLowerCase()).filter(Boolean));
  const accepted = []; const rejected = []; const renamed = [];
  (files || []).forEach((file, i) => {
    const wanted = cleanDocumentName(names[i] != null && names[i] !== '' ? names[i] : (file && file.name) || '');
    const ext = extOf(wanted);
    if (!wanted) { rejected.push({ name: 'file', reason: 'Choose a file to upload.' }); return; }
    if (!allowed.includes(ext)) { rejected.push({ name: wanted, reason: `Use one of these types: ${allowed.join(', ')}.` }); return; }
    if (isOverUploadLimit(file && file.size, maxBytes)) { rejected.push({ name: wanted, reason: uploadTooLargeMessage(maxBytes) }); return; }
    let name = wanted;
    if (seen.has(name.toLowerCase())) {
      if (onDuplicate === 'suffix') {
        name = nextAvailableDocumentName(wanted, seen);
        renamed.push({ from: wanted, to: name });
      } else {
        rejected.push({ name: wanted, reason: 'That file name is already on this file or already in this selection.' });
        return;
      }
    }
    seen.add(name.toLowerCase());
    accepted.push({ file, name });
  });
  return { accepted, rejected, renamed };
}

export async function uploadDocumentBatch(files, addOne, existingNames = [], opts = {}) {
  const plan = planDocumentBatch(files, { existingNames, ...opts });
  const saved = []; const failed = [...plan.rejected];
  for (const item of plan.accepted) {
    const file = item.file || item;
    const name = item.name || file.name;
    try { saved.push(await addOne(file, name)); }
    catch (e) { failed.push({ name, reason: mapUploadError(e, MAX_UPLOAD_BYTES) }); }
  }
  return { saved, failed, renamed: plan.renamed || [] };
}
