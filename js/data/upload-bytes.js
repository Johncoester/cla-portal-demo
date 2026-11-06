/* The bytes a document upload will store. The form sends a data URL. Hosted storage also accepts a File.
 * Missing bytes is a failure. This does not talk to a hosted bucket. */
export async function uploadBytes(file) {
  if (file && (file.body || file.file || file.data)) return file.body || file.file || file.data;
  if (file && file.dataUrl) {
    const res = await fetch(file.dataUrl);
    if (!res.ok) throw new Error('The selected file could not be read. Choose it again.');
    return await res.blob();
  }
  throw new Error('Choose a file to upload.');
}
