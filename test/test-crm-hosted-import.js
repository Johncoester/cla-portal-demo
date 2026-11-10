/* Hosted CRM CSV import. FAKE DATA ONLY. Nothing is written to a hosted project.
 * The sample file is marked TEST-SEED-CRM-IMPORT and uses example.test addresses. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crmJanineSupabase } from '../js/data/supabase-crm-janine.js';
import { IMPORT_MAX_ROWS, IMPORT_MAX_BYTES, IMPORT_CHUNK_ROWS, importChunkRanges, importTooBigMessage, leadRequiredMessages, sampleCsv, importErrorCsv, loadImportResume } from '../js/data/crm-janine.js';
import { importRowHref } from '../js/pages/crm-janine.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };

const SAMPLE = [
  'First Name,Last Name,Email,Phone,Company,Role in Company,Relationship Status,State,Zip Code,Description',
  'Casey,Sample,casey.sample@example.test,301-555-0101,Harbor Realty (fake),Realtor,Hot Prospect,Maryland,20852,TEST-SEED-CRM-IMPORT',
  'Robin,Template,robin.template@example.test,703-555-0102,,Loan Officer,Voicemail 1,VA,22201,TEST-SEED-CRM-IMPORT duplicate check',
].join('\n');
const OWNER = '149e612a-0000-4000-8000-000000000001';

ok(SAMPLE.includes('TEST-SEED-CRM-IMPORT') && !SAMPLE.includes('@gmail') && !/@(?!example\.test)/.test(SAMPLE), 'the sample CSV is fake and marked TEST-SEED-CRM-IMPORT');
const adapter = read('js/data/supabase-adapter.js');
ok(!adapter.includes('External CRM import is not authorized') && !adapter.includes('a.previewCrmImport') && !adapter.includes('a.runCrmImport'), 'the hosted adapter no longer blocks CSV import');

const page = read('js/pages/crm-janine.js');
const deniedAt = page.indexOf('data-import-denied');
const bannerAt = page.indexOf('data-import-test-banner');
ok(bannerAt > deniedAt && page.includes('TEST portal: fake data only, do not import real client contacts'), 'the test-portal banner is on the admin import screen');
ok(page.includes("api.mode === 'supabase' && me.isAdmin"), 'the banner is admin-only and only on the hosted portal');

const sql = read('supabase/migrations/20261110100000_crm_hosted_import.sql');
const rollback = read('supabase/rollbacks/20261110100000_crm_hosted_import.sql');
const sqlCode = sql.replace(/--[^\n]*/g, '');
const batch = sqlCode.split('create or replace function public.crm_import_batch')[1].split('create or replace function public.crm_list_imports')[0];
const loop = batch.split('for v_row in select value from jsonb_array_elements(p_rows)')[1] || '';
ok((batch.match(/private\.is_admin\(\)/g) || []).length === 1 && loop && !loop.includes('private.is_admin'), 'crm_import_batch checks admin once, not per row');
ok(!sqlCode.includes('session_replication_role') && !/create policy|alter policy|on public\.deals|on public\.tasks/i.test(sqlCode), 'import does not bypass triggers or change deals or tasks policies');
ok(sql.includes('public.crm_import_rows') && sql.includes("errcode = 'P0004'"), 'preview rolls back through P0004 and rows are logged');
ok(/insert into public\.crm_imports \([^)]*\btotal\b/.test(sql) && sql.includes('v_total'), 'the import log stores the row total');
ok(sql.includes('Postgres logs can keep that text'), 'the preview comment says row results can land in the database log');
ok(rollback.includes('drop function if exists public.crm_import_batch') && rollback.includes('crm-hosted-import 20261110100000') && !rollback.includes('drop table public.crm_imports'), 'rollback drops the functions and only the objects this migration added');
ok(sql.includes('p_import uuid') && sql.includes('p_chunk integer') && rollback.includes('crm_import_batch(boolean, text, text, text, jsonb, jsonb, uuid, integer)'), 'chunks share one batch id');
ok(batch.includes('v_n > 500') && batch.includes('At most 500 rows per import call.'), 'a call of more than 500 rows is refused');
ok(batch.includes('p_chunk > 20') && batch.includes('at most 10000 rows'), 'the server still caps each call at 500 and a file at 10000');
ok(sql.includes("conname = 'crm_imports_total_check'") && sql.includes('total <= 2000') && sql.includes('total >= 0 and total <= 10000') && sql.includes("!~ '10000'"), 'the migration widens the total check only when the old total <= 2000 check is present');
ok(sql.includes("conname = 'crm_import_rows_line_check'") && sql.includes('2001') && sql.includes('line >= 2 and line <= 10001') && sql.includes("!~ '10001'"), 'the migration widens the line check only when the old 2 to 2001 check is present');
ok(!/comment on constraint[\s\S]{0,120} is marker/i.test(sql) && (sql.match(/execute format\('comment on constraint %I on %I\.%I is %L'/g) || []).length === 2, 'constraint comments are formatted literals, so the migration parses');
ok(rollback.includes('check ((total >= 0) and (total <= 2000))') && rollback.includes('total >= 0') && rollback.includes('check (line >= 2 and line <= 2001)') && rollback.includes('No rows were deleted') && !/delete\s+from\s+public\.crm_imports/i.test(rollback) && !/delete\s+from\s+public\.crm_import_rows/i.test(rollback), 'rollback restores the old total check, including total >= 0, and refuses instead of deleting rows');
ok(batch.includes('total = total + v_total') && batch.includes('created = created + v_ok') && batch.includes('errors = errors + v_err'), 'chunk totals accumulate on the one import row');
const p0004At = batch.indexOf("when sqlstate 'P0004'");
const othersAt = batch.indexOf('when others');
ok(p0004At > 0 && othersAt > p0004At, 'P0004 is handled by its code, ahead of when others');
ok(batch.includes('Role in Company is required.') && batch.includes('Relationship Status is required.') && batch.includes('State is required.'), 'the database requires Role in Company, Relationship Status, and State on a lead');
ok(!sql.includes('crm_person_dup') || sql.includes('crm_person_dup') && !/create or replace function private\.crm_person_dup/.test(sql), 'the import does not replace private.crm_person_dup');

const calls = [];
let failChunk = 0;
let chunkFailsLeft = null;
let failStatus = 0;
const sb = { rpc: async (name, args) => {
  calls.push({ name, args });
  if (name !== 'crm_import_batch') return { data: null, error: { message: 'unexpected ' + name } };
  if (failChunk && args.p_chunk === failChunk && chunkFailsLeft !== 0) {
    if (chunkFailsLeft != null) chunkFailsLeft -= 1;
    return { data: null, error: failStatus ? { status: failStatus, message: 'upstream' } : { code: '57014', message: 'canceling statement due to statement timeout' } };
  }
  const rows = args.p_rows.length > 2
    ? args.p_rows.map((r) => ({ line: r.line, status: 'ok', message: '', id: '11111111-1111-4111-8111-111111111111', name: 'Casey Sample', link: '#/crm/leads/11111111-1111-4111-8111-111111111111', notes: r.prepNotes || [] }))
    : args.p_rows.map((r, i) => i === 0
      ? { line: r.line, status: 'ok', message: '', id: '11111111-1111-4111-8111-111111111111', name: 'Casey Sample', link: '#/crm/leads/11111111-1111-4111-8111-111111111111', notes: r.prepNotes || [] }
      : { line: r.line, status: 'duplicate', message: 'This email is already used by Lead Robin Template (owner Casey Owner). Duplicates are not allowed.', id: null, name: '', link: '', notes: [] });
  const okN = rows.filter((r) => r.status === 'ok').length;
  const dupN = rows.filter((r) => r.status === 'duplicate').length;
  const body = { rows, counts: { total: rows.length, ok: okN, duplicates: dupN, errors: 0 }, importId: args.p_commit ? (args.p_import || '22222222-2222-4222-8222-222222222222') : null };
  return { data: body, error: null };
} };
const okRow = (r) => { if (r.error) throw new Error(r.error.message); return r.data; };
const lists = {
  async crm_list_imports() { return [{ id: '22222222-2222-4222-8222-222222222222', fileName: 'leads.csv', rowCount: 2, byName: 'Ada Admin', created: 1, duplicates: 1, errors: 0, defaults: [{ field: 'state', value: 'MD', text: 'MD' }] }]; },
  async crm_list_import_rows(id) { if (id !== '22222222-2222-4222-8222-222222222222') throw new Error('Import not found.'); return [{ line: 2, status: 'ok', recordId: '11111111-1111-4111-8111-111111111111', recordName: 'Casey Sample', message: '' }]; },
};
let admin = true;
const api = crmJanineSupabase({
  sb,
  ok: okRow,
  camel: (v) => v,
  on: () => {},
  rpc: async (name, args) => {
    if (name === 'crm_list_imports') return lists.crm_list_imports();
    if (name === 'crm_list_import_rows') return lists.crm_list_import_rows(args.p_import);
    throw new Error('unexpected ' + name);
  },
  me: async () => (admin ? { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', isAdmin: true } : { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', isAdmin: false }),
  self: {
    async getCrmSettings() { return {}; },
    async listCrmOwners() { return [{ id: OWNER, name: 'Casey Owner', role: 'Sales Person' }]; },
  },
});

admin = false;
let msg = '';
try { await api.previewCrmImport({ module: 'leads', kind: 'records', csv: SAMPLE, fileName: 'leads.csv' }); } catch (e) { msg = e.message; }
ok(msg === 'Only an Admin or Super admin can import.' && calls.length === 0, 'a non-admin is refused before any import call');

admin = true;
msg = '';
try { await api.previewCrmImport({ module: 'leads', csv: 'Email\ncasey.sample@example.test\n', fileName: 'leads.csv' }); } catch (e) { msg = e.message; }
ok(msg === 'Map a column to Last Name (required).', 'a lead file must map Last Name');

msg = '';
try { await api.previewCrmImport({ module: 'leads', csv: 'x'.repeat(IMPORT_MAX_BYTES + 1), fileName: 'leads.csv' }); } catch (e) { msg = e.message; }
ok(msg.includes('too large'), 'an oversized file is refused');

const wide = ['Last Name', ...Array.from({ length: IMPORT_MAX_ROWS + 1 }, (_, i) => 'Person ' + i)].join('\n');
msg = '';
try { await api.runCrmImport({ module: 'leads', csv: wide, fileName: 'leads.csv' }); } catch (e) { msg = e.message; }
ok(msg.includes(String(IMPORT_MAX_ROWS)) && msg.includes('Split the file') && calls.length === 0, 'more than 10000 rows is refused before preview');

msg = '';
try { await api.previewCrmImport({ module: 'leads', csv: SAMPLE, defaults: { ownerId: '00000000-0000-4000-8000-000000000099' }, fileName: 'leads.csv' }); } catch (e) { msg = e.message; }
ok(msg === 'The default Owner must be an active Sales Person or Sales Team user.', 'a default owner must be an active salesperson');

msg = '';
try { await api.previewCrmImport({ module: 'contacts', csv: 'Last Name,Relationship Status\nSample,Not A Real Status\n', defaults: { relationshipStatus: 'Not A Real Status' }, fileName: 'clients.csv' }); } catch (e) { msg = e.message; }
ok(/not a current or historical choice/.test(msg), 'a default relationship status must be a real choice');

const preview = await api.previewCrmImport({ module: 'leads', csv: SAMPLE, fileName: 'leads.csv', defaults: { state: 'Maryland', ownerId: OWNER } });
const sent = calls[0];
ok(sent.name === 'crm_import_batch' && sent.args.p_commit === false && sent.args.p_module === 'leads' && sent.args.p_kind === 'records', 'preview asks the database not to keep the rows');
ok(sent.args.p_rows[0].values.state === 'MD' && sent.args.p_rows[0].values.email === 'casey.sample@example.test', 'Maryland and the email are normalised before the database sees them');
ok(sent.args.p_rows[0].prepNotes.some((n) => n.includes('20852') && n.includes('County')), 'a blank county is filled from the ZIP');
ok(sent.args.p_defaults.some((d) => d.field === 'ownerId' && d.value === OWNER) && sent.args.p_defaults.some((d) => d.field === 'state' && d.value === 'MD'), 'defaults are the salesperson and the state code');
ok(preview.committed === false && preview.importId == null && preview.counts.ok === 1 && preview.counts.duplicates === 1, 'a preview reads the HTTP 200 jsonb and saves nothing');
ok(preview.rows[0].values.state === 'Maryland' && preview.rows[0].values.description === 'TEST-SEED-CRM-IMPORT', 'the preview table still shows the file text');
ok(preview.rows[0].status === 'ok' && preview.rows[1].status === 'duplicate' && /already used/.test(preview.rows[1].message), 'a duplicate row is reported and not treated as created');
ok(preview.rows[0].link.includes('/crm/leads/'), 'the preview payload still names the lead it would create');
const keptLink = '#/crm/leads/11111111-1111-4111-8111-111111111111';
ok(importRowHref({ status: 'ok', link: keptLink, name: 'Casey Sample' }, false) === '', 'a preview does not link to a lead that was not saved');
ok(importRowHref({ status: 'ok', link: keptLink, name: 'Casey Sample' }, true) === keptLink, 'a kept import links to the lead');
ok(importRowHref({ status: 'duplicate', link: keptLink }, true) === '', 'a duplicate row has no record link');

calls.length = 0;
const run = await api.runCrmImport({ module: 'leads', csv: SAMPLE, fileName: 'leads.csv' });
ok(calls[0].args.p_commit === true && run.committed === true && run.importId === '22222222-2222-4222-8222-222222222222' && run.counts.ok === 1, 'run keeps one batch id for the rows that pass');

const noteCsv = 'Email,Note\ncasey.sample@example.test,TEST-SEED-CRM-IMPORT note\n';
calls.length = 0;
await api.previewCrmImport({ module: 'contacts', kind: 'notes', csv: noteCsv, fileName: 'notes.csv' });
ok(calls[0].args.p_kind === 'notes' && calls[0].args.p_module === 'contacts' && calls[0].args.p_rows[0].values.note.includes('TEST-SEED-CRM-IMPORT'), 'a note import is sent as notes for the chosen module');

const hist = await api.listCrmImports();
ok(hist.length === 1 && hist[0].rowCount === 2 && hist[0].byName === 'Ada Admin', 'the import log returns who ran it and how many rows were kept');
const detail = await api.listCrmImportRows(hist[0].id);
ok(detail.length === 1 && detail[0].status === 'ok' && detail[0].recordName === 'Casey Sample', 'one import lists its row results');
msg = '';
try { await api.listCrmImportRows('33333333-3333-4333-8333-333333333333'); } catch (e) { msg = e.message; }
ok(msg === 'Import not found.', 'an unknown import has no rows');

ok(IMPORT_CHUNK_ROWS === 500 && importChunkRanges(2000).length === 4 && importChunkRanges(2000).every((c) => c.count === 500), '2000 rows split into four chunks of 500');
ok(importChunkRanges(501).map((c) => c.count).join(',') === '500,1', 'a remainder stays in its own chunk');
const leadTemplate = sampleCsv('leads');
ok(leadTemplate.includes('Role in Company') && leadTemplate.includes('Relationship Status') && leadTemplate.includes('State'), 'the lead template includes Role in Company, Relationship Status, and State');
ok(page.includes('data-import-progress') && page.includes('Chunk ${p.chunk} of ${p.chunks}') && page.includes('data-import-partial') && page.includes('data-import-bar') && page.includes("Don't close this tab") && page.includes('beforeunload') && page.includes('data-import-resume') && page.includes('Download error CSV'), 'the import screen shows progress, a stay-open warning, resume, and an error CSV');
ok(leadRequiredMessages({ lastName: 'Sample' }).join(' ') === 'Role in Company is required. Relationship Status is required. State is required.', 'each missing lead field has its own message');
ok(leadRequiredMessages({ lastName: 'Sample', state: 'MD' }, [{ field: 'roleInCompany', value: 'Realtor' }, { field: 'relationshipStatus', value: 'Hot Prospect' }]).length === 0, 'defaults fill the required lead fields');

const leadFile = (n) => ['Last Name,Role in Company,Relationship Status,State', ...Array.from({ length: n }, (_, i) => `Person${i},Realtor,Hot Prospect,MD`)].join('\n');
calls.length = 0;
const big = await api.previewCrmImport({ module: 'leads', csv: leadFile(2000), fileName: 'leads-2000.csv' });
ok(calls.length === 4 && calls.every((c, i) => c.name === 'crm_import_batch' && c.args.p_commit === false && c.args.p_chunk === i + 1 && c.args.p_rows.length === 500 && c.args.p_import == null), '2000 rows are four preview calls of 500');
ok(big.counts.total === 2000 && big.counts.ok === 2000 && big.counts.errors === 0 && big.committed === false, 'preview totals are the sum of the chunks');

calls.length = 0;
failChunk = 2;
msg = '';
let partial = null;
try { await api.runCrmImport({ module: 'leads', csv: leadFile(1000), fileName: 'leads-1000.csv' }); } catch (e) { msg = e.message; partial = e.partial; }
failChunk = 0;
ok(calls.length === 3 && calls[0].args.p_commit === true && calls[0].args.p_import == null && calls[1].args.p_chunk === 2 && calls[2].args.p_chunk === 2 && calls[2].args.p_import === '22222222-2222-4222-8222-222222222222', 'a timed-out chunk is retried once under the first batch id, then the import stops');
ok(partial && partial.saved.length === 1 && partial.saved[0].from === 1 && partial.saved[0].to === 500 && partial.failed.from === 501 && partial.failed.to === 1000, 'the partial-failure report names the saved and failed row ranges');
ok(msg.includes('rows 1-500') && msg.includes('rows 501-1000') && msg.includes('statement timeout') && msg.includes('The earlier chunks were saved.'), 'the partial-failure text names the chunks, the ranges, and the error');

calls.length = 0;
const held = sb.rpc;
sb.rpc = async (name, args) => {
  calls.push({ name, args });
  return { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout', details: JSON.stringify({ rows: [{ line: 2, status: 'ok' }], counts: { total: 1, ok: 1, duplicates: 0, errors: 0 } }) } };
};
msg = '';
try { await api.previewCrmImport({ module: 'leads', csv: SAMPLE, fileName: 'leads.csv' }); } catch (e) { msg = e.message; }
sb.rpc = held;
ok(calls.length === 2 && msg === 'canceling statement due to statement timeout', 'a timeout is retried once and is not treated as a preview');

calls.length = 0;
const missingLead = await api.previewCrmImport({ module: 'leads', csv: 'Last Name\nSample\n', fileName: 'leads.csv' });
ok(calls.length === 0 && missingLead.rows.length === 1 && missingLead.rows[0].status === 'error' && missingLead.rows[0].message.includes('Role in Company is required.') && missingLead.rows[0].message.includes('Relationship Status is required.') && missingLead.rows[0].message.includes('State is required.'), 'a lead row reports each missing required field and is not sent');
calls.length = 0;
const filledLead = await api.previewCrmImport({ module: 'leads', csv: 'Last Name\nSample\n', fileName: 'leads.csv', defaults: { roleInCompany: 'Realtor', relationshipStatus: 'Hot Prospect', state: 'MD' } });
ok(calls.length === 1 && filledLead.rows[0].status === 'ok' && filledLead.counts.errors === 0, 'a default Role, Relationship Status, and State lets the lead through');
ok(missingLead.errorCsv.includes('Row') && missingLead.errorCsv.includes('Sample') && missingLead.errorCsv.includes('Role in Company is required.') && missingLead.errorCsv.includes('State is required.'), 'the error CSV has the row number, the original fields, and the message');
ok(importErrorCsv([{ status: 'error', line: 4, values: { lastName: 'Sample' }, message: 'State is required.' }], [['lastName', 'Last Name']]).includes('Last Name') && importErrorCsv([{ status: 'ok', line: 2, values: { lastName: 'Ok' }, message: '' }]).split('\n').filter(Boolean).length === 1, 'the error CSV keeps error rows only');

const progress = [];
const tenKFile = ['Last Name,Email,Role in Company,Relationship Status,State,Description', ...Array.from({ length: 10000 }, (_, i) => `Person${i},person${i}@example.test,Realtor,Hot Prospect,MD,TEST-SEED-CRM-IMPORT`)].join('\n');
ok(tenKFile.includes('TEST-SEED-CRM-IMPORT') && tenKFile.includes('@example.test') && !/@(?!example\.test)/.test(tenKFile), 'the 10000-row file is fake and marked TEST-SEED-CRM-IMPORT');
calls.length = 0;
const tenk = await api.previewCrmImport({ module: 'leads', csv: tenKFile, fileName: 'leads-10000.csv', onProgress: (p) => progress.push(p) });
ok(calls.length === 20 && calls.every((c, i) => c.args.p_chunk === i + 1 && c.args.p_rows.length === 500 && c.args.p_commit === false), '10000 rows are twenty preview calls of 500');
ok(tenk.counts.total === 10000 && tenk.counts.ok === 10000 && tenk.counts.errors === 0, 'a 10000-row preview sums every chunk');
ok(progress.some((p) => p.chunk === 1 && p.chunks === 20 && p.total === 10000) && progress.some((p) => p.chunk === 20 && p.done === 10000), 'progress reports rows done, the total, and chunk n of N');

calls.length = 0;
msg = '';
try { await api.previewCrmImport({ module: 'leads', csv: leadFile(IMPORT_MAX_ROWS + 1), fileName: 'too-big.csv' }); } catch (e) { msg = e.message; }
ok(msg === importTooBigMessage(IMPORT_MAX_ROWS + 1) && calls.length === 0, '10001 rows are rejected before preview and the message says to split the file');

calls.length = 0;
failChunk = 1;
chunkFailsLeft = 1;
failStatus = 503;
const retried = await api.runCrmImport({ module: 'leads', csv: leadFile(2), fileName: 'retry.csv' });
failChunk = 0; chunkFailsLeft = null; failStatus = 0;
ok(calls.length === 2 && calls[0].args.p_chunk === 1 && calls[1].args.p_chunk === 1 && retried.committed === true, 'a 5xx is retried once and then the chunk is kept');

const mem = new Map();
const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
calls.length = 0;
failChunk = 2;
chunkFailsLeft = null;
msg = '';
partial = null;
try { await api.runCrmImport({ module: 'leads', csv: leadFile(1000), fileName: 'leads-resume.csv', storage }); } catch (e) { msg = e.message; partial = e.partial; }
failChunk = 0;
const stored = loadImportResume(storage, partial && partial.importId);
ok(stored && stored.importId === '22222222-2222-4222-8222-222222222222' && stored.startChunk === 2 && storage.getItem('cla-crm-import:active') === stored.importId, 'a failed import keeps resume state in sessionStorage under the import id');
ok(partial.rowsSaved === 500 && msg.includes('Rows saved so far: 500'), 'the stop report names how many rows were saved');
calls.length = 0;
const resumed = await api.runCrmImport({ module: 'leads', csv: leadFile(1000), fileName: 'leads-resume.csv', importId: stored.importId, startChunk: stored.startChunk, storage });
ok(calls.length === 1 && calls[0].args.p_chunk === 2 && calls[0].args.p_import === stored.importId && calls.every((c) => c.args.p_chunk !== 1), 'resume continues at the unsaved chunk and does not resend the saved chunk');
ok(resumed.committed === true && resumed.counts.total === 500, 'resume imports only the rows that were not saved yet');

calls.length = 0;
const liveRpc = sb.rpc;
sb.rpc = async (name, args) => {
  const res = await liveRpc(name, args);
  if (args && args.p_commit === false && res && res.data) {
    return { data: null, error: { code: 'P0004', message: 'Import preview only. Nothing was saved.', details: JSON.stringify(res.data) } };
  }
  return res;
};
const legacy = await api.previewCrmImport({ module: 'leads', csv: SAMPLE, fileName: 'leads.csv' });
sb.rpc = liveRpc;
ok(legacy.committed === false && legacy.counts.ok === 1 && legacy.counts.duplicates === 1 && legacy.importId == null, 'a preview still accepts P0004 until the migration is applied');

const nextSql = read('supabase/migrations/20261110210000_crm_import_preview_200.sql');
const nextRb = read('supabase/rollbacks/20261110210000_crm_import_preview_200.sql');
const grab = (text) => {
  const s = text.indexOf('create or replace function public.crm_import_batch(');
  return text.slice(s, text.indexOf('$fn$;', s) + '$fn$;'.length);
};
ok(grab(nextRb) === grab(sql), 'rollback restores the crm_import_batch definition from 20261110100000');
ok(nextSql.includes("errcode = 'CRM01'") && nextSql.includes("when sqlstate 'CRM01'") && nextSql.includes('return v_result;'), 'preview catches a private sentinel and returns jsonb');
ok(!nextSql.includes("errcode = 'P0004', detail") && nextSql.includes("when sqlstate 'P0004'"), 'the preview no longer raises P0004, and a row-level P0004 still escapes');
ok(nextSql.includes('security definer') && nextSql.includes('v_n > 500') && nextSql.includes("errcode = '42501'") && nextSql.includes('p_import uuid default null') && nextSql.includes('p_chunk integer default 1'), 'signature, security, the 500-row cap, and the admin check stay');
ok(nextSql.includes('grant execute on function public.crm_import_batch(boolean, text, text, text, jsonb, jsonb, uuid, integer) to authenticated') && nextSql.includes('revoke all on function public.crm_import_batch(boolean, text, text, text, jsonb, jsonb, uuid, integer) from public'), 'grants stay on the same signature');

console.log(fail ? fail + ' failed' : 'crm hosted import passed');
if (fail) process.exit(1);
