/* The hosted contract upload, checked against the TEST policy text. No database connection. */
import { documentInsertRow } from '../js/data/supabase-nov5.js';
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

console.log(fail ? fail + ' failed' : 'document insert gate passed');
if (fail) process.exit(1);
