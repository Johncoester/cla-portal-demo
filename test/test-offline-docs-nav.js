/* Offline checks: document rows already returned, agreement linkage, and the file menu default. */
import { readFileSync } from 'node:fs';
import { filterListedDocuments, shapeListedDocument } from '../js/data/document-list.js';
import { withMyAcknowledgements } from '../js/data/agreement-link.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const rows = [
  { id: 'd1', dealId: 'deal-1', name: 'contract.pdf', visibility: 'seller', folderId: 'f1', sizeBytes: 2048, storagePath: 'deal-1/d1/contract.pdf', uploadedBy: 'u-agent' },
  { id: 'd2', dealId: 'deal-1', name: 'id.pdf', visibility: 'buyer', folderId: null, size: 100, uploadedBy: 'u-buyer' },
];
const shaped = rows.map((r) => shapeListedDocument(r, [{ id: 'f1', name: 'Contracts', staffOnly: false }]));
ok(shaped.length === 2 && shaped[0].visibility === 'seller' && shaped[1].visibility === 'buyer', 'shaping does not add rows or change who the file was shared with');
ok(shaped[0].size === 2048 && shaped[0].hasContent === true && shaped[0].folderName === 'Contracts', 'a stored file keeps its size, content flag, and folder name');
ok(shaped[1].hasContent === false && shaped[1].folderName !== 'Contracts', 'a row with no stored path is not marked as having content');
ok(filterListedDocuments(shaped, undefined).length === 2, 'the all-folders view keeps every row already returned');
ok(filterListedDocuments(shaped, 'f1').map((d) => d.id).join() === 'd1', 'a folder view keeps only that folder');
ok(filterListedDocuments(shaped, '').map((d) => d.id).join() === 'd2', 'the unfiled view does not pull in a filed document');
ok(!shaped.some((d) => d.buyerShareable || d.sellerShareable), 'share buttons are not invented when the uploader role is unknown');

const older = withMyAcknowledgements([{ code: 'wire_fraud', version: 1, title: 'Wire', body: 'SAMPLE' }], [{ code: 'wire_fraud', version: 1, at: '2026-11-01', roleLabel: 'Buyer' }]);
ok(older[0].myAck && older[0].myAck.at === '2026-11-01' && older[0].body === 'SAMPLE', 'an acknowledgement stored under code still matches, and the wording is unchanged');
const wrong = withMyAcknowledgements([{ code: 'privacy', version: 1, body: 'SAMPLE' }], [{ code: 'wire_fraud', version: 1, at: '2026-11-01' }]);
ok(wrong[0].myAck == null, 'a different agreement is not marked acknowledged');

const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
ok(app.includes('const fileNav = !!deal') && app.includes('data-file-nav-toggle') && app.includes('apply(false)'), 'inside a file the portal menu starts closed for every role');
ok(!app.includes('const orderOnly = !!deal && !u.isAdmin'), 'an admin inside a file is not left with the portal menu open');
const open = readFileSync(new URL('../js/data/file-open.js', import.meta.url), 'utf8');
ok(open.includes('content.blob') && open.includes('content.dataUrl'), 'opening a file accepts a stored blob or a data URL');

console.log(fail ? fail + ' failed' : 'offline docs and nav passed');
if (fail) process.exit(1);
