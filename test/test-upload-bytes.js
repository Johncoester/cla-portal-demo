/* The hosted uploader must accept the data URL the form already sends. No bucket is contacted. */
import { uploadBytes } from '../js/data/upload-bytes.js';
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const pdf = new Blob(['%PDF-1.1 fake'], { type: 'application/pdf' });
ok(await uploadBytes({ file: pdf }) === pdf, 'a selected file is the upload body');
const fromUrl = await uploadBytes({ name: 'notes.pdf', dataUrl: 'data:application/pdf;base64,JVBERg==' });
ok(fromUrl && fromUrl.size > 0, 'a data URL is read into bytes');
let missing = '';
try { await uploadBytes({ name: 'notes.pdf' }); } catch (e) { missing = e.message; }
ok(missing === 'Choose a file to upload.', 'no bytes is a visible failure, not a success');
console.log(fail ? fail + ' failed' : 'upload bytes passed');
if (fail) process.exit(1);
