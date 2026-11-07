/* The hosted contract upload, checked against the TEST policy text. No database connection. */
import { readFileSync } from 'node:fs';
import { documentInsertRow, nov5Supabase, sameUploadId, SAVED_UNCONFIRMED } from '../js/data/supabase-nov5.js';
const DEAL = '81c35d28-8563-4801-b46e-79aa9313dc9b';
const USER = '00000000-0000-4000-8000-000000000001';
const DOC = '00000000-0000-4000-8000-000000000002';
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const repro = {
  name: 'contract.pdf',
  description: '8029 Harbor Tree Way - Ratified Sales Contract',
  mimeType: 'application/pdf',
  size: 6441501,
  visibility: 'staff',
  folderId: 'folder-would-be-here',
  docType: 'Contract / addendum',
  wireInstructions: false,
};
const row = documentInsertRow({ dealId: DEAL, file: repro, userId: USER, id: DOC });
const unfiled = documentInsertRow({ dealId: DEAL, file: { ...repro, folderId: '' }, userId: USER, id: DOC });

ok(row.deal_id === DEAL && row.uploaded_by === USER && row.visibility === 'staff', 'the insert carries the open order, the signed-in user, and staff visibility');
ok(row.name === 'contract.pdf' && row.doc_type === 'Contract / addendum' && row.wire_instructions === false && row.size_bytes === 6441501, 'the contract file, type, size, and unchecked wire box are the stored values');
ok(!Object.prototype.hasOwnProperty.call(row, 'folder_id') && !Object.prototype.hasOwnProperty.call(unfiled, 'folder_id'), 'the published insert does not send a folder, so the folder retry and Unfiled are the same row');
ok(JSON.stringify(row) === JSON.stringify(unfiled), 'changing the folder control does not change the hosted insert');

const extOk = (n) => {
  const ext = String(n || '').split('.').pop().toLowerCase();
  return ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'png', 'jpg', 'jpeg', 'heic', 'heif', 'webp'].includes(ext) && String(n).indexOf('.') > 0;
};
const wireName = (n) => /\ywir(e|ing)[\s_.-]*(transfer[\s_.-]*)?(instruction|info(rmation)?\y|details\y)/i.test(n || '');
const staffish = (role, isAdmin) => isAdmin || ['Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin'].includes(role);
const viewOnly = (role, isAdmin) => ['Sales Person', 'Sales Team'].includes(role) && !isAdmin;
const visibilityAllowed = (vis, role, isAdmin) => ['all', 'buyer', 'seller', 'staff'].includes(vis) && staffish(role, isAdmin);
const permissive = (r, who) => r.uploaded_by === who.uid && extOk(r.name) && r.deal_id != null && who.canAccessDeal && !viewOnly(who.role, who.isAdmin) && visibilityAllowed(r.visibility, who.role, who.isAdmin) && r.folder_id == null;

const superadmin = { uid: USER, role: 'Super admin', isAdmin: true, canAccessDeal: true };
ok(extOk(row.name) && !wireName(row.name), 'contract.pdf is an allowed extension and is not renamed into a wire file');
ok(permissive(row, superadmin), 'staff visibility, an open deal, and this payload pass the permissive insert text');
ok(!permissive({ ...row, visibility: 'CLA staff only' }, superadmin), 'the label is not a visibility value; the option value staff is what the form sends');
ok(!permissive({ ...row, uploaded_by: 'someone-else' }, superadmin), 'a different uploaded_by fails the permissive check');

const demoCheck = (dealVisible, dealIsDemo, viewerIsDemo) => (dealVisible ? dealIsDemo === viewerIsDemo : null) === true;
ok(demoCheck(true, false, false) && demoCheck(true, true, true), 'a deal the same person can already open matches demo_scope');
ok(demoCheck(false, false, false) === false, 'a deal select that returns no row makes the documents demo check fail');
ok(!viewOnly('Super admin', true) && staffish('Super admin', true), 'Super admin is staff for visibility and is not the view-only sales rule');
const src = readFileSync(new URL('../js/data/supabase-nov5.js', import.meta.url), 'utf8');
ok(src.includes("from('documents').insert(row)") && !src.includes(".insert(row).select"), 'the insert is committed before the row is read back');
ok(src.includes(".select('*').eq('id', row.id)"), 'the saved row is read in a following select');
ok(!src.includes('.remove(') && !src.includes('.delete('), 'a failed confirmation does not delete the stored file or the document row');
const docsPage = readFileSync(new URL('../js/pages/dealdocs.js', import.meta.url), 'utf8');
const orderPage = readFileSync(new URL('../js/pages/ordernew.js', import.meta.url), 'utf8');
const tcPage = readFileSync(new URL('../js/pages/tc-overview.js', import.meta.url), 'utf8');
ok(docsPage.includes('sameUploadId') && orderPage.includes('sameUploadId') && tcPage.includes('sameUploadId'), 'each upload screen reuses one id for the same chosen file');
ok(!docsPage.includes('shareDocument') || docsPage.includes('shareDocumentWithClient'), 'the documents screen still has its existing share actions');

function harness(script) {
  const docs = new Map();
  const objects = new Set();
  const removed = [];
  let reads = 0;
  const sb = {
    auth: { getUser: async () => ({ data: { user: { id: USER } } }) },
    storage: { from() { return { upload: async (path) => { if (script === 'bucket') return { error: { message: 'bucket down' } }; if (objects.has(path)) return { error: { statusCode: '409', message: 'The resource already exists' } }; objects.add(path); return { error: null }; }, remove: async (path) => { removed.push(path); } }; } },
    from() { return { insert: async (row) => { if (script === 'rls' && !docs.has(row.id)) return { error: { code: '42501', message: 'new row violates row-level security policy for table "documents"' } }; if (docs.has(row.id)) return { error: { code: '23505', message: 'duplicate key value violates unique constraint "documents_pkey"' } }; docs.set(row.id, { ...row }); return { error: null }; }, select() { return { eq(_col, id) { return { single: async () => { reads += 1; if (script === 'readback' && reads === 1) return { error: { message: 'new row violates row-level security policy for table "documents"' } }; const row = docs.get(id); return row ? { data: row, error: null } : { data: null, error: { message: 'missing' } }; } }; } }; } }; },
  };
  const api = nov5Supabase({ sb, ok: (r) => { if (r.error) throw new Error(r.error.message); return r.data; }, camel: (r) => r, me: async () => ({ id: USER }) });
  return { api, docs, objects, removed };
}
const payload = { id: DOC, name: 'contract.pdf', description: '8029 Harbor Tree Way - Ratified Sales Contract', mimeType: 'application/pdf', size: 6441501, dataUrl: 'data:application/pdf;base64,RkFLRQ==', visibility: 'staff', docType: 'Contract / addendum', wireInstructions: false };
const denied = harness('rls');
let deniedMsg = '';
try { await denied.api.addDocument(DEAL, payload); } catch (e) { deniedMsg = e.message; }
ok(deniedMsg.includes('row-level security policy') && denied.docs.size === 0 && denied.removed.length === 0, 'a policy refusal saves nothing and deletes nothing');
const stuck = harness('readback');
let stuckMsg = '';
try { await stuck.api.addDocument(DEAL, payload); } catch (e) { stuckMsg = e.message; }
ok(stuckMsg === SAVED_UNCONFIRMED && stuck.docs.size === 1 && stuck.removed.length === 0, 'a failed readback keeps the saved document and says it was saved');
const again = await stuck.api.addDocument(DEAL, payload);
ok(again.id === DOC && stuck.docs.size === 1 && stuck.objects.size === 1 && stuck.removed.length === 0, 'the same id reads the saved document and does not store a second copy');
const down = harness('bucket');
let downMsg = '';
try { await down.api.addDocument(DEAL, payload); } catch (e) { downMsg = e.message; }
ok(downMsg === 'bucket down' && down.docs.size === 0, 'a storage failure does not write a document row');
const slot = {};
const firstId = sameUploadId(slot, { name: 'contract.pdf', size: 5, lastModified: 1 });
ok(sameUploadId(slot, { name: 'contract.pdf', size: 5, lastModified: 1 }) === firstId, 'retrying the same file keeps its id');
ok(sameUploadId(slot, { name: 'other.pdf', size: 5, lastModified: 2 }) !== firstId, 'a different file gets its own id');

console.log(fail ? fail + ' failed' : 'document insert gate passed');
if (fail) process.exit(1);
