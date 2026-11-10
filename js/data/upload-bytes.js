/* The bytes a document upload will store. The form sends a data URL. Hosted storage also accepts a File.
 * Missing bytes is a failure. This does not talk to a hosted bucket. */
const UPLOAD_EXT = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'png', 'jpg', 'jpeg', 'heic', 'heif', 'webp'];
const MIME_EXT = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'application/pdf': 'pdf' };

// A phone camera often hands back "image" with no extension. The document rule rejects that name.
export function uploadFileName(name, mime) {
  let base = String(name || 'upload').replace(/[\\/]/g, '_').replace(/^\.+/, '').slice(0, 180) || 'upload';
  const dot = base.lastIndexOf('.');
  const ext = dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
  if (UPLOAD_EXT.includes(ext)) return base.slice(0, 200);
  const type = String(mime || '').toLowerCase();
  const add = MIME_EXT[type] || (type.startsWith('image/') ? 'jpg' : 'pdf');
  return `${base}.${add}`.slice(0, 200);
}

export async function uploadBytes(file) {
  if (file && (file.body || file.file || file.data)) return file.body || file.file || file.data;
  if (file && file.dataUrl) {
    let res;
    try { res = await fetch(file.dataUrl); }
    catch (e) { throw new Error('The selected file could not be read. Choose it again.'); }
    if (!res.ok) throw new Error('The selected file could not be read. Choose it again.');
    return await res.blob();
  }
  throw new Error('Choose a file to upload.');
}
