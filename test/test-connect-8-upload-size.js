/* CONNECT-8 (checklist row 5.2): over-limit uploads show "File is too large (max X MB)"
 * with the real limit, before the file is sent, and a server 413 maps to the same message. */
import { readFileSync } from 'node:fs';
import { MAX_UPLOAD_BYTES } from '../js/data/constants.js';
import { PHOTO_MAX_BYTES, PHOTO_STORED_MAX, cleanPhoto } from '../js/data/agent-profile.js';
import { MAX_SCREENSHOT_BYTES, screenshotMeta } from '../js/data/staff-feedback.js';
import { IMPORT_MAX_BYTES } from '../js/data/crm-janine.js';
import { planDocumentBatch, uploadDocumentBatch } from '../js/data/document-batch.js';
import { formatUploadMax, uploadTooLargeMessage, isOverUploadLimit, assertUploadSize, isPayloadTooLargeError, mapUploadError } from '../js/data/upload-limit.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

ok(MAX_UPLOAD_BYTES === 25_000_000, 'deal / place-order / messages / library / tasks use a 25 MB client limit');
ok(formatUploadMax(MAX_UPLOAD_BYTES) === '25 MB', '25,000,000 bytes formats as 25 MB');
ok(formatUploadMax(26_214_400) === '25 MB', 'the 25 MiB Storage bucket limit also formats as 25 MB');
ok(formatUploadMax(PHOTO_MAX_BYTES) === '5 MB', 'a picked profile picture formats as 5 MB');
ok(formatUploadMax(PHOTO_STORED_MAX) === '400 KB', 'the cropped profile picture formats as 400 KB');
ok(formatUploadMax(MAX_SCREENSHOT_BYTES) === '5 MB', 'staff-feedback screenshots format as 5 MB');
ok(formatUploadMax(IMPORT_MAX_BYTES) === '2 MB', 'a CRM import formats as 2 MB');
ok(uploadTooLargeMessage(MAX_UPLOAD_BYTES) === 'File is too large (max 25 MB)', 'the deal-document message is File is too large (max 25 MB)');
ok(uploadTooLargeMessage(PHOTO_MAX_BYTES) === 'File is too large (max 5 MB)', 'the picked photo message is File is too large (max 5 MB)');
ok(uploadTooLargeMessage(PHOTO_STORED_MAX) === 'File is too large (max 400 KB)', 'the cropped photo message is File is too large (max 400 KB)');
ok(uploadTooLargeMessage(MAX_SCREENSHOT_BYTES) === 'File is too large (max 5 MB)', 'the screenshot message is File is too large (max 5 MB)');
ok(uploadTooLargeMessage(IMPORT_MAX_BYTES) === 'File is too large (max 2 MB)', 'the import message is File is too large (max 2 MB)');

ok(!isOverUploadLimit(MAX_UPLOAD_BYTES, MAX_UPLOAD_BYTES), 'a file at the limit is accepted');
ok(!isOverUploadLimit(0, MAX_UPLOAD_BYTES), 'an empty file is not called too large');
ok(isOverUploadLimit(MAX_UPLOAD_BYTES + 1, MAX_UPLOAD_BYTES), 'one byte over the limit is refused');
ok(isOverUploadLimit(-1, MAX_UPLOAD_BYTES), 'a negative size is refused');
try { assertUploadSize(MAX_UPLOAD_BYTES + 1, MAX_UPLOAD_BYTES); ok(false, 'assert throws over the limit'); }
catch (e) { ok(e.message === 'File is too large (max 25 MB)', 'assert throws File is too large (max 25 MB)'); }

ok(isPayloadTooLargeError({ status: 413 }), 'HTTP 413 is treated as too large');
ok(isPayloadTooLargeError({ statusCode: 413 }), 'statusCode 413 is treated as too large');
ok(isPayloadTooLargeError({ code: '413' }), 'code 413 is treated as too large');
ok(isPayloadTooLargeError(new Error('Payload too large')), 'Payload too large is treated as too large');
ok(isPayloadTooLargeError({ message: 'Entity Too Large' }), 'Entity Too Large is treated as too large');
ok(isPayloadTooLargeError({ message: 'The object exceeded the maximum allowed size' }), 'Storage object-exceeded is treated as too large');
ok(isPayloadTooLargeError({ message: 'maximum allowed size' }), 'maximum allowed size is treated as too large');
ok(!isPayloadTooLargeError(new Error('The document bucket refused the upload.')), 'a generic bucket refusal is not remapped');
ok(!isPayloadTooLargeError(new Error('Please sign in.')), 'an unrelated error is not remapped');
ok(mapUploadError({ status: 413, message: 'unknown' }, MAX_UPLOAD_BYTES) === 'File is too large (max 25 MB)', '413 maps to the standard 25 MB message');
ok(mapUploadError(new Error('Payload too large'), PHOTO_STORED_MAX) === 'File is too large (max 400 KB)', '413 for a photo maps to max 400 KB');
ok(mapUploadError(new Error('Choose a file to upload.'), MAX_UPLOAD_BYTES) === 'Choose a file to upload.', 'other errors keep their own message');

const batch = planDocumentBatch([
  { name: 'ok.pdf', size: MAX_UPLOAD_BYTES },
  { name: 'huge.pdf', size: MAX_UPLOAD_BYTES + 1 },
]);
ok(batch.accepted.length === 1 && batch.accepted[0].name === 'ok.pdf', 'a file at the 25 MB limit is accepted in a batch');
ok(batch.rejected.length === 1 && batch.rejected[0].name === 'huge.pdf' && batch.rejected[0].reason === 'File is too large (max 25 MB)', 'a batch rejection uses File is too large (max 25 MB)');

const mapped = await uploadDocumentBatch(
  [{ name: 'ok.pdf', size: 10 }, { name: 'boom.pdf', size: 10 }],
  async (f) => { if (f.name === 'boom.pdf') { const err = new Error('Payload too large'); err.status = 413; throw err; } return { id: f.name }; },
  [],
);
ok(mapped.saved.length === 1 && mapped.failed[0].name === 'boom.pdf' && mapped.failed[0].reason === 'File is too large (max 25 MB)', 'a 413 mid-batch is reported as File is too large (max 25 MB)');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-proc');
let refused = '';
try { await api.addDocument('deal-1', { name: 'huge.pdf', description: '', mimeType: 'application/pdf', size: MAX_UPLOAD_BYTES + 1, dataUrl: 'data:application/pdf;base64,QQ==', visibility: 'staff' }); }
catch (e) { refused = e.message; }
ok(refused === 'File is too large (max 25 MB)', 'the mock document upload uses the same 25 MB message');

try { screenshotMeta({ name: 'shot.png', mimeType: 'image/png', size: MAX_SCREENSHOT_BYTES + 1 }); ok(false, 'an oversized screenshot throws'); }
catch (e) { ok(e.message === 'File is too large (max 5 MB)', 'an oversized screenshot uses File is too large (max 5 MB)'); }

const overCrop = 'data:image/jpeg;base64,' + 'A'.repeat(600_000);
try { cleanPhoto(overCrop); ok(false, 'an oversized cropped photo throws'); }
catch (e) { ok(e.message === 'File is too large (max 400 KB)', 'a cropped photo over 400 KB uses File is too large (max 400 KB)'); }

const pages = [
  'js/pages/dealdocs.js', 'js/pages/ordernew.js', 'js/pages/compose.js', 'js/pages/dealtaskform.js',
  'js/pages/library.js', 'js/pages/tc-overview.js',
];
for (const p of pages) {
  const src = read(p);
  ok(!src.includes('too large for this demo'), `${p} no longer says "too large for this demo"`);
  ok(!src.includes('demo limit'), `${p} no longer says "demo limit"`);
  ok(src.includes('File is too large (max') || src.includes('uploadTooLargeMessage') || src.includes('assertUploadSize') || src.includes('formatUploadMax'), `${p} uses the shared over-limit helper`);
}

ok(!read('js/data/document-batch.js').includes('too large for this demo'), 'document-batch no longer says "for this demo"');
ok(read('js/data/supabase-staff.js').includes('mapUploadError') && read('js/data/supabase-nov5.js').includes('mapUploadError'), 'deal-document Storage uploads map 413');
ok(read('js/data/supabase-crm.js').includes('mapUploadError'), 'CRM note file uploads map 413');
ok(read('js/data/supabase-hr-feedback.js').includes('mapUploadError'), 'HR document uploads map 413');
ok(read('js/data/supabase-staff-feedback.js').includes('mapUploadError'), 'staff-feedback screenshot uploads map 413');
ok(read('js/data/supabase-agent-invite.js').includes('mapUploadError') && read('js/data/supabase-agent-invite.js').includes('PHOTO_STORED_MAX'), 'profile photo uploads map 413 against the 400 KB stored limit');
ok(!read('js/data/supabase-crm.js').includes('That file was not attached. Try again.') || read('js/data/supabase-crm.js').includes('mapUploadError(up.error'), 'CRM note Storage errors are not hidden behind a generic retry when the file is too large');

if (fail) { console.log(`\n${fail} failed`); process.exit(1); }
console.log('\nAll CONNECT-8 upload-size checks passed');
