/* Several documents in one pick. Each file is checked and stored on its own.
 * A file that fails stays unstored. A file that saved is not uploaded again. */
import { ALLOWED_UPLOAD_EXT, MAX_UPLOAD_BYTES } from './constants.js?v=202611101015';

const extOf = (name) => { const n = String(name || ''); const i = n.lastIndexOf('.'); return i > 0 ? n.slice(i + 1).toLowerCase() : ''; };

export function planDocumentBatch(files, { existingNames = [], maxBytes = MAX_UPLOAD_BYTES, allowed = ALLOWED_UPLOAD_EXT } = {}) {
  const seen = new Set((existingNames || []).map((n) => String(n || '').trim().toLowerCase()).filter(Boolean));
  const accepted = []; const rejected = [];
  for (const file of files || []) {
    const name = String(file && file.name || '').replace(/[\\/]/g, '_').trim();
    const key = name.toLowerCase();
    const ext = extOf(name);
    if (!name) { rejected.push({ name: 'file', reason: 'Choose a file to upload.' }); continue; }
    if (!allowed.includes(ext)) { rejected.push({ name, reason: `Use one of these types: ${allowed.join(', ')}.` }); continue; }
    if (!(Number(file.size) >= 0) || file.size > maxBytes) { rejected.push({ name, reason: 'File is too large for this demo.' }); continue; }
    if (seen.has(key)) { rejected.push({ name, reason: 'That file name is already on this file or already in this selection.' }); continue; }
    seen.add(key); accepted.push(file);
  }
  return { accepted, rejected };
}

export async function uploadDocumentBatch(files, addOne, existingNames = []) {
  const plan = planDocumentBatch(files, { existingNames });
  const saved = []; const failed = [...plan.rejected];
  for (const file of plan.accepted) {
    try { saved.push(await addOne(file)); }
    catch (e) { failed.push({ name: file.name, reason: e && e.message ? e.message : 'The upload failed.' }); }
  }
  return { saved, failed };
}
