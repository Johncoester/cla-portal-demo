/* MF-089 (Matt, Nov 27): buyers, sellers and agents can name a file on upload; duplicates suffix instead of blocking. */
import { readFileSync } from 'node:fs';
import { nextAvailableDocumentName, planDocumentBatch } from '../js/data/document-batch.js';
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const page = readFileSync(new URL('../js/pages/dealdocs.js', import.meta.url), 'utf8');

ok(nextAvailableDocumentName('image.jpg', []) === 'image.jpg', 'a free name is kept');
ok(nextAvailableDocumentName('image.jpg', ['image.jpg']) === 'image-2.jpg', 'a phone image.jpg already on the file becomes image-2.jpg');
ok(nextAvailableDocumentName('image.jpg', ['image.jpg', 'image-2.jpg']) === 'image-3.jpg', 'the suffix keeps going if image-2.jpg is also taken');

const file = (name) => ({ name, size: 10 });
const blocked = planDocumentBatch([file('image.jpg')], { existingNames: ['image.jpg'] });
ok(blocked.rejected.length === 1 && blocked.accepted.length === 0, 'staff uploads still refuse a duplicate name by default');
const suffixed = planDocumentBatch([file('image.jpg')], { existingNames: ['image.jpg'], onDuplicate: 'suffix' });
ok(suffixed.accepted.length === 1 && suffixed.accepted[0].name === 'image-2.jpg' && suffixed.renamed[0].from === 'image.jpg', 'client uploads auto-suffix a duplicate instead of blocking');
const named = planDocumentBatch([file('image.jpg')], { existingNames: [], names: ['closing-photo.jpg'] });
ok(named.accepted[0].name === 'closing-photo.jpg', 'a typed name is used in place of the camera file name');

ok(page.includes('data-upload-name') && page.includes('canName') && page.includes("onDuplicate: canName ? 'suffix' : 'reject'"), 'buyers, sellers and agents get a name field and the suffix path');
ok(page.includes('A file named') && page.includes('unless you rename it'), 'a duplicate prompts with the suggested name');

console.log(fail ? `mf-089: ${fail} failed` : 'mf-089: passed');
if (fail) process.exit(1);
