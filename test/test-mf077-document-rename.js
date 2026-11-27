/* MF-077 (Matt, confirmed Nov 27 2026, Gmail 1a21df0b0dc7c8f3):
   CLA staff with file access, including Sales Person and Sales Team, can rename a document.
   Fake / mock data only. Nothing is emailed or applied on a hosted project. */
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { canRenameDocument, wireRenameWarning } from '../js/pages/dealdocs.js';
import { isWireDocName, STAFF_ACCOUNT_ROLES } from '../js/data/constants.js';
import { staffSupabase } from '../js/data/supabase-staff.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const rejects = async (fn, re, m) => { try { await fn(); ok(false, m + ' (no error)'); } catch (e) { ok(re.test(e.message), m + ' -> ' + e.message); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const U = (role, extra = {}) => ({ id: 'x', role, status: 'active', isAdmin: false, ...extra });

ok(canRenameDocument(U('Processor')) && canRenameDocument(U('Preprocessor')) && canRenameDocument(U('Sales Person')) && canRenameDocument(U('Sales Team')) && canRenameDocument(U('Transaction Coordinator')) && canRenameDocument(U('Admin', { isAdmin: true })) && canRenameDocument(U('Super admin', { isAdmin: true })), 'Processor, Preprocessor, Sales, TC and admin can rename');
ok(!canRenameDocument(U('Buyer Agent')) && !canRenameDocument(U('Listing Agent')) && !canRenameDocument(U('Client-Buyer')) && !canRenameDocument(U('Client-Seller')) && !canRenameDocument(U('Employee')) && !canRenameDocument(U('Outside user')) && !canRenameDocument(U('Processor', { accountRole: 'Buyer Agent' })) && !canRenameDocument(null), 'agents, clients, Employee, and a staff login acting in an outside file role cannot rename');
ok(STAFF_ACCOUNT_ROLES.includes('Sales Person') && STAFF_ACCOUNT_ROLES.includes('Sales Team'), 'Sales Person and Sales Team are CLA staff account roles');

ok(!wireRenameWarning('Contract.pdf', 'Ratified contract.pdf'), 'a rename that does not add or remove a wire name has no warning');
ok(/treated as wire instructions/.test(wireRenameWarning('Contract.pdf', 'Wire instructions.pdf')), 'adding a wire name warns and asks to confirm');
ok(/no longer be treated as wire/.test(wireRenameWarning('Wire instructions.pdf', 'Closing letter.pdf')), 'removing a wire name warns and asks to confirm');
ok(isWireDocName('Jane Wire instructions.pdf') && !isWireDocName('Jane Smith ID Front.pdf'), 'isWireDocName still matches a wire name and not an ID file');

const sql = readFileSync('supabase/migrations/20261131320000_mf077_document_rename.sql', 'utf8');
const back = readFileSync('supabase/rollbacks/20261131320000_mf077_document_rename.sql', 'utf8');
ok(/Gmail 1a21df0b0dc7c8f3/.test(sql) && /document\.renamed/.test(sql) && /public\.rename_document/.test(sql), 'the migration names the source email, the log action, and the RPC');
ok(/is_staffish/.test(sql) && /can_access_deal/.test(sql) && /storage_path/.test(sql), 'the guard allows a name change only for staff with file access and still protects the stored file');
ok(/not loosen that policy/.test(sql) && /documents_update/.test(sql), 'the migration does not loosen the already-open documents_update policy');
ok(/not private.wire_name\(new.name\)/.test(sql), 'trg_doc_wire unmarks when a rename removes a wire name');
ok(/Only description, visibility and folder of a document can change/.test(back) && /drop function if exists public.rename_document/.test(back), 'the rollback restores the old guard and drops the RPC');
ok(/begin;/.test(sql) && /lock_timeout/.test(sql) && /self-check/.test(sql), 'the migration is one transaction with a lock timeout and self-checks');

const page = readFileSync('js/pages/dealdocs.js', 'utf8');
ok(/name="docName"/.test(page) && /The stored file stays the same/.test(page), 'Document details has a Name field and says the stored file stays the same');
ok(/wireRenameWarning/.test(page) && /confirm\(warn\)/.test(page), 'a wire add or remove asks for confirmation and does not block the rename');
ok(/canRename \|\| canRenameDocument|manage \|\| canRename/.test(page), 'Sales and other CLA staff with file access get a Details button so they can rename');
ok(/ID Front/.test(page) === false || !/lock.*ID/.test(page), 'the documents page does not lock ID files from renaming');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-proc');
const added = await api.addDocument('deal-1', { name: 'Jane Smith ID Front.pdf', description: '', mimeType: 'application/pdf', size: 1200, dataUrl: 'data:application/pdf;base64,RkFLRQ==', visibility: 'staff' });
ok(added && added.id && added.name === 'Jane Smith ID Front.pdf', 'a processor can upload an ID file used in the rename tests');
const storedPath = added.storagePath || added.dataUrl || '';

await api.renameDocument(added.id, 'Jane Smith ID Front (corrected).pdf');
let after = (await api.listDocuments('deal-1')).find((d) => d.id === added.id);
ok(after.name === 'Jane Smith ID Front (corrected).pdf' && (after.storagePath || after.dataUrl || '') === storedPath, 'renaming an ID file is allowed and the stored file is unchanged');

await api.signInDev('u-sp');
await api.renameDocument(added.id, 'Jane Smith government ID.pdf');
after = (await api.listDocuments('deal-1')).find((d) => d.id === added.id);
ok(after.name === 'Jane Smith government ID.pdf', 'a Sales Person on the file can rename a document, even though sales are view-only for other order edits');

await api.signInDev('u-team');
await api.renameDocument(added.id, 'Wire instructions.pdf');
after = (await api.listDocuments('deal-1')).find((d) => d.id === added.id);
ok(after.name === 'Wire instructions.pdf' && after.wireInstructions === true, 'a Sales Team login can rename, and adding "wire" to the name marks it as wire instructions');

await api.signInDev('u-tc');
await api.renameDocument(added.id, 'Closing letter.pdf');
after = (await api.listDocuments('deal-1')).find((d) => d.id === added.id);
ok(after.name === 'Closing letter.pdf' && after.wireInstructions === false, 'a Transaction Coordinator can rename, and removing "wire" from the name unmarks it');

const acts = await api.listActivity('deal-1');
const actItems = (acts && acts.items) || acts || [];
const renames = actItems.filter((a) => a.action === 'document.renamed' && a.entityId === added.id);
ok(renames.length >= 4 && renames.some((a) => /Renamed "Jane Smith ID Front\.pdf" to "Jane Smith ID Front \(corrected\)\.pdf"/.test(a.detail)), 'each rename is logged as document.renamed with the old and new name');
ok(renames.some((a) => a.actorId === 'u-sp') && renames.some((a) => a.actorId === 'u-team'), 'the log records who renamed it');

await api.signInDev('u-bagent');
await rejects(() => api.renameDocument(added.id, 'Agent rewrite.pdf'), /Only CLA Title staff|not found|cannot rename/i, 'a Buyer Agent cannot rename');
await api.signInDev('u-lagent');
await rejects(() => api.renameDocument(added.id, 'Listing rewrite.pdf'), /Only CLA Title staff|not found|cannot rename/i, 'a Listing Agent cannot rename');
await api.signInDev('u-buyer');
await rejects(() => api.renameDocument(added.id, 'Buyer rewrite.pdf'), /Only CLA Title staff|not found|cannot rename/i, 'a buyer cannot rename');

await api.signInDev('u-proc');
await rejects(() => api.renameDocument(added.id, '   '), /Enter a document name/, 'a blank name is refused');
const same = after.name;
await api.renameDocument(added.id, same);
const actsAfter = await api.listActivity('deal-1');
const afterItems = (actsAfter && actsAfter.items) || actsAfter || [];
ok(afterItems.filter((a) => a.action === 'document.renamed' && a.entityId === added.id).length === renames.length, 'saving the same name again does not add another log row');

const staffCalls = [];
const sb = {
  rpc: async (n, args) => { staffCalls.push({ op: 'rpc', name: n, args }); return { data: null, error: null }; },
  from() { return { select() { return this; }, update() { return this; }, eq() { return this; }, then(res) { return Promise.resolve(res({ data: [], error: null })); } }; },
  auth: { getUser: async () => ({ data: { user: { id: 'me' } } }) },
};
const hosted = staffSupabase({
  sb,
  ok: (r) => { if (r.error) throw new Error(r.error.message); return r.data; },
  camel: (x) => x,
  me: async () => ({ id: 'me', role: 'Processor', isAdmin: false }),
  uid: async () => ({ id: 'me', role: 'Processor', isAdmin: false }),
});
await hosted.renameDocument('doc-9', 'New name.pdf');
ok(staffCalls.some((c) => c.op === 'rpc' && c.name === 'rename_document' && c.args.p_document === 'doc-9' && c.args.p_name === 'New name.pdf'), 'the hosted adapter renames through public.rename_document, not a raw name update');
await rejects(() => hosted.renameDocument('doc-9', '  '), /Enter a document name/, 'the hosted adapter refuses a blank name before calling the database');

console.log(fail ? fail + ' failed' : 'mf077 document rename passed');
if (fail) process.exit(1);
