/* The hosted uploader must accept the data URL the form already sends. No bucket is contacted. */
import { uploadBytes } from '../js/data/upload-bytes.js';
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const pdf = new Blob(['%PDF-1.1 fake'], { type: 'application/pdf' });
ok(await uploadBytes({ file: pdf }) === pdf, 'a selected file is the upload body');
const fromUrl = await uploadBytes({ name: 'notes.pdf', mimeType: 'application/pdf', dataUrl: 'data:application/pdf;base64,JVBERg==' });
ok(fromUrl && fromUrl.size > 0 && fromUrl.type === 'application/pdf', 'a pdf data URL keeps its MIME type');
const plain = await uploadBytes({ name: 'notes.txt', mimeType: 'text/plain', dataUrl: 'data:text/plain,hello' });
ok(plain.type === 'text/plain', 'a text data URL keeps its MIME type');
let bad = '';
try { await uploadBytes({ name: 'notes.pdf', dataUrl: 'not a data url' }); } catch (e) { bad = e.message; }
ok(bad === 'The selected file could not be read. Choose it again.', 'a malformed data URL is a readable failure');
let missing = '';
try { await uploadBytes({ name: 'notes.pdf' }); } catch (e) { missing = e.message; }
ok(missing === 'Choose a file to upload.', 'no file is a visible failure, not a success');
console.log(fail ? fail + ' failed' : 'upload bytes passed');
if (fail) process.exit(1);
