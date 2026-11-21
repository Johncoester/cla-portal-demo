/* CRM Feedback 27 item 2: a file on one note. Fake data only. It does not appear under Attachments. */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { crmSupabase } from '../js/data/supabase-crm.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const notesOf = (rec) => (rec.activities || []).filter((a) => a.kind === 'note');
const pdf = { name: 'contract.pdf', mimeType: 'application/pdf', size: 12, dataUrl: 'data:application/pdf;base64,AA==' };

const storage = mem();
const api = createMockAdapter({ storage, sessionStorage: mem() });
await api.signInDev('u-sp');
const me = await api.crmMe();
const leads = await api.listCrmLeads();
const lead = leads.find((l) => !l.archived && !l.converted);
ok(!!lead && lead.noteFilesReady !== false, 'a fake lead is ready for a file on a note');
const plain = await api.addCrmAttachment('lead', lead.id, { name: 'record-only.txt', mimeType: 'text/plain', size: 4, dataUrl: 'data:text/plain,hi' });
const added = await api.addCrmNote('lead', lead.id, 'Called and left the contract');
const otherNote = await api.addCrmNote('lead', lead.id, 'A second note with no file');
const file = await api.addCrmNoteFile(added.id, pdf);
ok(file && file.noteId === added.id && file.name === 'contract.pdf', 'the file is stored on that note');
const second = await api.addCrmNoteFile(added.id, { name: 'photo.jpg', mimeType: 'image/jpeg', size: 20, dataUrl: 'data:image/jpeg;base64,AA==' });
const opened = await api.getCrmLead(lead.id);
const onNote = (opened.noteFiles || []).filter((f) => f.noteId === added.id);
ok(onNote.length === 2 && onNote.some((f) => f.id === file.id) && onNote.some((f) => f.id === second.id), 'both files load with the note in one record read');
ok((opened.noteFiles || []).every((f) => f.noteId !== otherNote.id) === true && !(opened.noteFiles || []).some((f) => f.noteId === otherNote.id), 'the other note has no file');
ok(!(opened.attachments || []).some((f) => f.id === file.id || f.id === second.id) && (opened.attachments || []).some((f) => f.id === plain.id), 'a note file stays out of Attachments and a record file stays in');
const got = await api.getCrmNoteFile(file.id);
ok(typeof got.dataUrl === 'string' && got.dataUrl.startsWith('data:') && got.name === 'contract.pdf', 'the note file can be downloaded');
let asRecord = '';
try { await api.getCrmAttachmentContent(file.id); } catch (e) { asRecord = e.message; }
ok(/not found/i.test(asRecord), 'opening it as a record attachment is refused');

let blank = '';
try { await api.addCrmNote('lead', lead.id, '   '); } catch (e) { blank = e.message; }
ok(blank === 'Write the note first.', 'a blank note is refused before any file is stored');
const beforeBad = (await api.getCrmLead(lead.id)).noteFiles.length;
let bad = '';
try { await api.addCrmNoteFile(added.id, { name: 'virus.exe', mimeType: 'application/octet-stream', size: 4, dataUrl: 'data:application/octet-stream,x' }); } catch (e) { bad = e.message; }
ok(/not allowed/.test(bad) && (await api.getCrmLead(lead.id)).noteFiles.length === beforeBad, 'a file type the portal does not allow is refused and nothing is added');
let huge = '';
try { await api.addCrmNoteFile(added.id, { name: 'big.pdf', mimeType: 'application/pdf', size: 30_000_000, dataUrl: 'data:application/pdf,x' }); } catch (e) { huge = e.message; }
ok(/too large/.test(huge) && /smaller file/.test(huge), 'a file over the limit says to choose a smaller one');

const team = createMockAdapter({ storage, sessionStorage: mem() });
await team.signInDev('u-team');
const teamMe = await team.crmMe();
let denied = '';
try { await team.addCrmNoteFile(added.id, pdf); } catch (e) { denied = e.message; }
ok(/wrote this note|admin/.test(denied), 'someone who did not write the note cannot attach a file to it');
const teamView = await team.getCrmLead(lead.id);
ok((teamView.noteFiles || []).some((f) => f.id === file.id) && !(teamView.attachments || []).some((f) => f.id === file.id), 'someone else can see the file on the note and not under Attachments');

const admin = createMockAdapter({ storage, sessionStorage: mem() });
await admin.signInDev('u-admin');
const byAdmin = await admin.addCrmNoteFile(added.id, { name: 'admin-note.txt', mimeType: 'text/plain', size: 3, dataUrl: 'data:text/plain,ok' });
ok(byAdmin && byAdmin.noteId === added.id, 'an admin can attach a file to a note they did not write');

const proc = createMockAdapter({ storage, sessionStorage: mem() });
await proc.signInDev('u-proc');
const procMe = await proc.crmMe();
let procDenied = '';
try { await proc.addCrmNoteFile(added.id, pdf); } catch (e) { procDenied = e.message; }
ok(!procMe.canEdit && /read-only|Processor/i.test(procDenied), 'a processor cannot attach a file');
ok((await proc.getCrmLead(lead.id)).noteFiles.some((f) => f.id === file.id), 'a processor can still see the file on the note');

const clients = await api.listCrmContacts();
const client = clients.find((c) => !c.archived);
const clientNote = await api.addCrmNote('contact', client.id, 'Note on the client');
await api.addCrmNoteFile(clientNote.id, { name: 'client.txt', mimeType: 'text/plain', size: 2, dataUrl: 'data:text/plain,c' });
const clientRec = await api.getCrmContact(client.id);
ok((clientRec.noteFiles || []).some((f) => f.noteId === clientNote.id) && !(clientRec.attachments || []).some((f) => f.name === 'client.txt'), 'a file on a client note stays off that client\'s Attachments');
const companies = await api.listCrmAccounts();
const company = companies.find((a) => !a.archived);
const companyNote = await api.addCrmNote('account', company.id, 'Note on the company');
await api.addCrmNoteFile(companyNote.id, { name: 'company.txt', mimeType: 'text/plain', size: 2, dataUrl: 'data:text/plain,co' });
const companyRec = await api.getCrmAccount(company.id);
ok((companyRec.noteFiles || []).some((f) => f.noteId === companyNote.id) && !(companyRec.attachments || []).some((f) => f.name === 'company.txt'), 'a file on a company note stays off that company\'s Attachments');

if (lead.id) await api.archiveCrmRecord('lead', lead.id, false);
const sysLead = await api.getCrmLead(lead.id);
const sys = notesOf(sysLead).find((n) => n.system) || notesOf(await (async () => { await api.archiveCrmRecord('lead', lead.id, true); return api.getCrmLead(lead.id); })()).find((n) => n.system);
ok(!!sys, 'a CRM note exists to refuse');
let sysDenied = '';
try { await api.addCrmNoteFile(sys.id, pdf); } catch (e) { sysDenied = e.message; }
ok(/cannot be changed/.test(sysDenied), 'a note the CRM wrote cannot take a file');
if (sysLead && lead) await api.archiveCrmRecord('lead', lead.id, false);

const { parseHTML } = await import('/tmp/domtest/node_modules/linkedom/worker.js');
const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
globalThis.window = window; globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
function FileReader() {}
FileReader.prototype.readAsDataURL = function (f) { this.result = f.dataUrl || 'data:text/plain,x'; Promise.resolve().then(() => { if (this.onload) this.onload(); }); };
globalThis.FileReader = FileReader; window.FileReader = FileReader;
const { toText } = await import('../js/ui.js');
const { relatedHtml, wireRelated } = await import('../js/pages/crm-forms.js');

const shown = await api.getCrmLead(lead.id);
const host = document.getElementById('app');
host.innerHTML = toText(relatedHtml(shown, { entity: 'lead', entityId: lead.id, me }));
const mine = host.querySelector(`[data-note="${added.id}"]`);
ok(host.querySelector('#note-form [data-note-clip]') && mine.querySelector('[data-note-form] [data-note-clip]'), 'Add Note and Edit each show a paperclip');
ok(mine.querySelector(`[data-note-file="${file.id}"]`) && mine.querySelector(`[data-note-file="${second.id}"]`), 'the note lists both files as download links');
ok(!host.querySelector('[data-attachments]').textContent.includes('contract.pdf') && host.querySelector(`[data-att="${plain.id}"]`), 'Attachments still shows the record file and not the note file');
ok(![...host.querySelectorAll('[data-notes] button')].some((b) => /delete|bold|italic/i.test(b.textContent)), 'notes still have no delete and no text formatting tools');

const teamHost = document.createElement('div');
document.body.appendChild(teamHost);
teamHost.innerHTML = toText(relatedHtml(await team.getCrmLead(lead.id), { entity: 'lead', entityId: lead.id, me: teamMe }));
ok(teamHost.querySelector('#note-form [data-note-clip]') && !teamHost.querySelector(`[data-note="${added.id}"] [data-note-clip]`) && teamHost.querySelector(`[data-note-file="${file.id}"]`), 'someone else gets a paperclip only on a new note, and can still open the file');

const procHost = document.createElement('div');
document.body.appendChild(procHost);
procHost.innerHTML = toText(relatedHtml(await proc.getCrmLead(lead.id), { entity: 'lead', entityId: lead.id, me: procMe }));
ok(!procHost.querySelector('[data-note-clip]') && procHost.querySelector(`[data-note-file="${file.id}"]`), 'a processor sees the file and no paperclip');

const off = document.createElement('div');
document.body.appendChild(off);
const offRec = { ...shown, noteFilesReady: false, noteFiles: [] };
off.innerHTML = toText(relatedHtml(offRec, { entity: 'lead', entityId: lead.id, me }));
ok(!off.querySelector('[data-note-clip]') && /not available yet/.test(off.querySelector('[data-notes]').textContent) && off.querySelector('#note-form textarea'), 'until the database file is applied, the paperclip is hidden and notes still have a box');

let refreshed = false;
host.innerHTML = toText(relatedHtml(await api.getCrmLead(lead.id), { entity: 'lead', entityId: lead.id, me }));
wireRelated(host, api, () => { refreshed = true; }, { entity: 'lead', entityId: lead.id, me });
const add = host.querySelector('#note-form');
add.querySelector('textarea').value = '';
const addInput = add.querySelector('[data-note-file-input]');
Object.defineProperty(addInput, 'files', { configurable: true, get: () => [{ name: 'kept.pdf', type: 'application/pdf', size: 8, dataUrl: 'data:application/pdf;base64,AA==' }] });
add.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 20));
const blankErr = add.querySelector('[data-note-err]');
ok(blankErr && blankErr.textContent === 'Write a note first.' && add.querySelector('textarea').value === '' && !refreshed, 'a blank note keeps the form and does not save');
add.querySelector('textarea').value = 'Note from the page';
add.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 30));
const pageNote = notesOf(await api.getCrmLead(lead.id)).find((n) => (n.body || n.subject) === 'Note from the page');
ok(refreshed && pageNote && (await api.getCrmLead(lead.id)).noteFiles.some((f) => f.noteId === pageNote.id && f.name === 'kept.pdf'), 'Add Note stores the words and the chosen file on that note');
ok(!(await api.getCrmLead(lead.id)).attachments.some((f) => f.name === 'kept.pdf'), 'the file chosen on Add Note is not in Attachments');

const camel = (o) => (Array.isArray(o) ? o.map(camel) : o && typeof o === 'object'
  ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), camel(v)])) : o);
const okFn = (r) => { if (r.error) throw new Error(r.error.message); return r.data; };
function hostedClient(handle) {
  const calls = [];
  const from = (table) => {
    const q = { table, filters: [], cols: '*', one: false, insert: null };
    const run = () => {
      const hit = handle({ op: q.insert ? 'insert' : 'from', table, cols: q.cols, filters: q.filters.slice(), insert: q.insert });
      calls.push({ op: q.insert ? 'insert' : 'from', table, cols: q.cols, filters: q.filters.slice(), insert: q.insert });
      const error = hit && hit.__error ? { message: hit.__error } : null;
      let data = error ? null : hit;
      if (!error && q.one && Array.isArray(data)) data = data[0] || null;
      if (!error && q.insert) data = null;
      return Promise.resolve({ data, error });
    };
    const api = {
      select(cols) { q.cols = cols || '*'; return api; },
      eq(k, v) { q.filters.push([k, v]); return api; },
      insert(row) { q.insert = row; return api; },
      maybeSingle() { q.one = true; return api; },
      then(res, rej) { return run().then(res, rej); },
    };
    return api;
  };
  const uploads = [];
  const sb = {
    from, calls, uploads,
    rpc: async (name) => { calls.push({ op: 'rpc', name, table: '' }); const hit = handle({ op: 'rpc', name }); const error = hit && hit.__error ? { message: hit.__error } : null; return { data: error ? null : hit, error }; },
    storage: { from(bucket) { return {
      upload: async (path) => { uploads.push({ bucket, path }); const hit = handle({ op: 'upload', bucket, path }); return hit || { data: { path }, error: null }; },
      download: async (path) => { const hit = handle({ op: 'download', path }); return hit || { data: new Blob(['hi']), error: null }; },
    }; } },
  };
  return sb;
}
const LEAD = '11111111-1111-4111-8111-111111111111';
const NOTE_A = '22222222-2222-4222-8222-222222222222';
const NOTE_B = '33333333-3333-4333-8333-333333333333';
const leadRow = { id: LEAD, first_name: 'Ada', last_name: 'Buyer', owner_id: 'u-sales', notes: '', company: '', source: '', status: '', converted_at: null, archived_at: null };
const noteRow = (id, subject) => ({ id, entity: 'lead', entity_id: LEAD, kind: 'note', subject, body: subject, system: false, created_by: 'u-sales', created_at: '2026-11-16T12:00:00Z', status: 'done' });
const recordFile = { id: 'file-record', entity: 'lead', entity_id: LEAD, name: 'record-only.txt', mime_type: 'text/plain', size: 4, uploaded_by: 'u-sales', created_at: '2026-11-16T12:00:00Z', note_id: null };
const noteFile = (id, noteId, name) => ({ id, entity: 'lead', entity_id: LEAD, note_id: noteId, name, mime_type: 'application/pdf', size: 12, uploaded_by: 'u-sales', created_at: '2026-11-16T12:05:00Z' });
function hosted(extra = {}) {
  const sb = hostedClient((q) => {
    if (q.op === 'rpc' && q.name === 'crm_owners') return [{ id: 'u-sales', name: 'Sam Sales', role: 'Sales Person' }];
    if (q.op === 'rpc' && q.name === 'crm_assignees') return [{ id: 'u-sales', name: 'Sam Sales', role: 'Sales Person' }];
    if (q.op === 'rpc' && q.name === 'crm_invited_meetings') return [];
    if (q.op === 'from' && q.table === 'crm_leads') return leadRow;
    if (q.op === 'from' && q.table === 'crm_activities') return [noteRow(NOTE_A, 'First'), noteRow(NOTE_B, 'Second')];
    if (q.op === 'from' && q.table === 'crm_attachments') {
      if (String(q.cols).includes('note_id') && extra.missingColumn) return { __error: 'column crm_attachments.note_id does not exist' };
      if (extra.missingColumn) return [recordFile];
      return [recordFile, noteFile('nf-a', NOTE_A, 'a.pdf'), noteFile('nf-b', NOTE_B, 'b.pdf')];
    }
    return [];
  });
  const meUser = async () => ({ id: 'u-sales', role: 'Sales Person', isAdmin: false, email: 'sam@example.test', firstName: 'Sam', lastName: 'Sales' });
  return { api: crmSupabase({ sb, ok: okFn, camel, me: meUser, flags: { crm: true } }), sb };
}
const ready = hosted();
const readyRec = await ready.api.getCrmLead(LEAD);
const attachmentReads = ready.sb.calls.filter((c) => c.op === 'from' && c.table === 'crm_attachments');
ok(attachmentReads.length === 1 && String(attachmentReads[0].cols).includes('note_id'), 'two notes still use one attachment read');
ok(readyRec.noteFilesReady === true && readyRec.noteFiles.length === 2 && readyRec.noteFiles.map((f) => f.noteId).sort().join() === [NOTE_A, NOTE_B].sort().join(), 'that one read returns a file for each note');
ok(readyRec.attachments.length === 1 && readyRec.attachments[0].name === 'record-only.txt' && readyRec.activities.filter((a) => a.kind === 'note').length === 2, 'the record attachment and both notes still load');
const missing = hosted({ missingColumn: true });
const missingRec = await missing.api.getCrmLead(LEAD);
const missingReads = missing.sb.calls.filter((c) => c.op === 'from' && c.table === 'crm_attachments');
ok(missingRec.noteFilesReady === false && missingRec.noteFiles.length === 0 && missingRec.activities.filter((a) => a.kind === 'note').length === 2 && missingRec.attachments.length === 1, 'a missing note column hides the paperclip and does not drop the notes');
ok(missingReads.length === 2 && String(missingReads[0].cols).includes('note_id') && !String(missingReads[1].cols).includes('note_id'), 'the missing column is tried once more without it, not once per note');

const uploadSb = hostedClient((q) => {
  if (q.op === 'from' && q.table === 'crm_activities') return noteRow(NOTE_A, 'First');
  if (q.op === 'insert') return null;
  if (q.op === 'download') return { data: new Blob(['hello']), error: null };
  if (q.op === 'from' && q.table === 'crm_attachments') return { id: 'nf-new', name: 'contract.pdf', mime_type: 'application/pdf', storage_path: q.filters.length ? 'notes/lead/x' : '', note_id: NOTE_A };
  return null;
});
const uploadApi = crmSupabase({ sb: uploadSb, ok: okFn, camel, me: async () => ({ id: 'u-sales', role: 'Sales Person', isAdmin: false, email: 'sam@example.test' }), flags: { crm: true } });
const saved = await uploadApi.addCrmNoteFile(NOTE_A, pdf);
ok(saved.noteId === NOTE_A && uploadSb.uploads.length === 1 && uploadSb.uploads[0].bucket === 'crm' && uploadSb.uploads[0].path.startsWith(`notes/lead/${LEAD}/${NOTE_A}/`), 'the upload uses the crm bucket and a notes/ path for that note');
const inserted = uploadSb.calls.find((c) => c.op === 'insert');
ok(inserted && inserted.insert.note_id === NOTE_A && inserted.insert.storage_path.startsWith('notes/'), 'the saved row is marked with the note and is not a record attachment');
const openedHosted = await uploadApi.getCrmNoteFile('nf-new');
ok(openedHosted.name === 'contract.pdf' && openedHosted.dataUrl.startsWith('data:'), 'a stored note file downloads from that path');

const offSb = hostedClient((q) => {
  if (q.op === 'from' && q.table === 'crm_activities') return noteRow(NOTE_A, 'First');
  if (q.op === 'insert') return { __error: 'column crm_attachments.note_id does not exist' };
  return null;
});
const offApi = crmSupabase({ sb: offSb, ok: okFn, camel, me: async () => ({ id: 'u-sales', role: 'Sales Person', isAdmin: false, email: 'sam@example.test' }), flags: { crm: true } });
let offMsg = '';
try { await offApi.addCrmNoteFile(NOTE_A, pdf); } catch (e) { offMsg = e.message; }
ok(offMsg === 'Attaching a file to a note is not available yet.', 'before the database file is applied, attaching says so in plain words');

const src = read('js/data/supabase-crm.js');
const pack = src.slice(src.indexOf('const attachmentPack'), src.indexOf('const NOTE_FILE_OFF'));
ok(pack.includes('for (const [e, id] of pairs)') && !/for\s*\(\s*const note/.test(pack) && (pack.match(/from\('crm_attachments'\)/g) || []).length === 2, 'the record read is per parent, with one retry, not per note');
const mig = read('supabase/migrations/20261125200000_crm_note_files.sql');
const rb = read('supabase/rollbacks/20261125200000_crm_note_files.sql');
ok(mig.includes('add column note_id uuid') && mig.includes('notes/') && mig.includes('Not applied by this commit'), 'the database file adds note_id and a notes path and is not applied here');
ok(!mig.includes('private.crm_entity_visible') && !/alter policy/i.test(mig) && !/on public\.deals/i.test(mig) && !/on public\.tasks\b/i.test(mig) && !/on public\.profiles/i.test(mig), 'it does not add a per-row visibility helper or change deals, tasks, or profiles');
ok(mig.includes('from public.crm_activities n') && mig.includes('n.id =') && mig.includes('(select private.crm_editor())') && mig.includes('(select private.is_admin())') && mig.includes('n.created_by = (select auth.uid())'), 'storage access looks up the note by its primary key and edit rights are one-time checks');
ok(!/from public\.crm_attachments a\s+where a\.storage_path/.test(mig), 'the storage read does not scan attachments by an unindexed path');
ok(rb.includes('drop column if exists note_id') && rb.includes('drop function if exists private.crm_note_file_guard') && rb.includes('crm_note_object_read') && rb.includes('crm_note_object_insert') && rb.includes('crm_attachments_note_fk') && rb.includes('crm_attachments_note_path') && rb.includes('crm_attachments_note_id_idx') && rb.includes('delete from storage.buckets where id = \'crm\''), 'the rollback drops every object this migration adds');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'vendor') continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(js|html|css)$/.test(name)) out.push(full);
  }
  return out;
}
const specRe = /(['"])([^'"\s]+?\.(?:js|css))\?v=([A-Za-z0-9]+)\1/g;
const hits = new Map();
for (const file of walk(path.join(root, 'js')).concat(readdirSync(root).filter((n) => n.endsWith('.html')).map((n) => path.join(root, n)))) {
  const rel = path.relative(root, file);
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(specRe)) {
    if (!m[2].includes('/')) continue;
    const target = path.normalize(path.join(path.dirname(rel), m[2])).replace(/\\/g, '/');
    if (!hits.has(target)) hits.set(target, new Set());
    hits.get(target).add(m[3]);
  }
}
const dual = [...hits.entries()].filter(([, stamps]) => stamps.size > 1);
ok(dual.length === 0, 'dual-stamp scan ' + dual.length + (dual.length ? ': ' + dual.map(([t, s]) => t + ' ' + [...s].join(',')).join('; ') : ''));
const chain = [
  ['js/pages/crm-forms.js', '202611247100'],
  ['js/pages/crm-home.js', '202611261100'],
  ['js/pages/crm.js', '202611289960'],
  ['js/data/mock-part-crm.js', '202611247000'],
  ['js/data/mock-adapter.js', '202611289960', '202611247000', '202611247000', '202611247000', '202611247000', '202611247000', '202611247000', '202611247000', '202611247000'],
  ['js/data/supabase-crm.js', '202611249700'],
  ['js/data/supabase-adapter.js', '202611289960'],
  ['js/data/adapter.js', '202611289960', '202611247000', '202611247000', '202611247000', '202611247000', '202611247000', '202611247000', '202611247000', '202611247000'],
  ['js/app.js', '202611289960', '202611247100', '202611247100', '202611247100', '202611247100', '202611247100', '202611247100', '202611247100', '202611247100', '202611247100'],
];
const issues = [];
for (const [target, stamp] of chain) {
  const stamps = [...(hits.get(target) || [])];
  if (stamps.length !== 1 || stamps[0] !== stamp) issues.push(target + ' ' + (stamps.join(',') || 'none'));
}
ok(issues.length === 0, 'cache stamps agree' + (issues.length ? ': ' + issues.join('; ') : ''));
ok(read('index.html').includes('js/app.js?v=202611289960'), 'index.html loads the shell at 202611270100');
console.log('cache-stamp issues', issues.length);
console.log('dual-stamp', dual.length);
console.log(fail ? fail + ' failed' : 'crm note files passed');
if (fail) process.exit(1);
