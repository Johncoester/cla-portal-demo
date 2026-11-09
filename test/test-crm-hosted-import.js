/* Hosted CRM CSV import. FAKE DATA ONLY. Nothing is written to a hosted project.
 * The sample file is marked TEST-SEED-CRM-IMPORT and uses example.test addresses. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crmJanineSupabase } from '../js/data/supabase-crm-janine.js';
import { IMPORT_MAX_ROWS, IMPORT_MAX_BYTES } from '../js/data/crm-janine.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };

const SAMPLE = [
  'First Name,Last Name,Email,Phone,Company,State,Zip Code,Description',
  'Casey,Sample,casey.sample@example.test,301-555-0101,Harbor Realty (fake),Maryland,20852,TEST-SEED-CRM-IMPORT',
  'Robin,Template,robin.template@example.test,703-555-0102,,VA,22201,TEST-SEED-CRM-IMPORT duplicate check',
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

const sql = read('supabase/migrations/20261109231000_crm_hosted_import.sql');
const rollback = read('supabase/rollbacks/20261109231000_crm_hosted_import.sql');
const sqlCode = sql.replace(/--[^\n]*/g, '');
const batch = sqlCode.split('create or replace function public.crm_import_batch')[1].split('create or replace function public.crm_list_imports')[0];
const loop = batch.split('for v_row in select value from jsonb_array_elements(p_rows)')[1] || '';
ok((batch.match(/private\.is_admin\(\)/g) || []).length === 1 && loop && !loop.includes('private.is_admin'), 'crm_import_batch checks admin once, not per row');
ok(!sqlCode.includes('session_replication_role') && !/create policy|alter policy|on public\.deals|on public\.tasks/i.test(sqlCode), 'import does not bypass triggers or change deals or tasks policies');
ok(sql.includes('public.crm_import_rows') && sql.includes("errcode = 'P0004'"), 'preview rolls back through P0004 and rows are logged');
ok(rollback.includes('drop function if exists public.crm_import_batch') && rollback.includes('crm-hosted-import 20261109231000') && !rollback.includes('drop table public.crm_imports'), 'rollback drops the functions and only the objects this migration added');

const calls = [];
const sb = { rpc: async (name, args) => {
  calls.push({ name, args });
  if (name !== 'crm_import_batch') return { data: null, error: { message: 'unexpected ' + name } };
  const rows = args.p_rows.map((r, i) => i === 0
    ? { line: r.line, status: 'ok', message: '', id: '11111111-1111-4111-8111-111111111111', name: 'Casey Sample', link: '#/crm/leads/11111111-1111-4111-8111-111111111111', notes: r.prepNotes || [] }
    : { line: r.line, status: 'duplicate', message: 'This email is already used by Lead Robin Template (owner Casey Owner). Duplicates are not allowed.', id: null, name: '', link: '', notes: [] });
  const body = { rows, counts: { total: rows.length, ok: 1, duplicates: rows.length - 1, errors: 0 }, importId: args.p_commit ? '22222222-2222-4222-8222-222222222222' : null };
  if (!args.p_commit) return { data: null, error: { code: 'P0004', message: 'Import preview only. Nothing was saved.', details: JSON.stringify(body) } };
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
ok(msg.includes(String(IMPORT_MAX_ROWS)) && calls.length === 0, 'more than 2000 rows is refused before the database');

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
ok(preview.committed === false && preview.importId == null && preview.counts.ok === 1 && preview.counts.duplicates === 1, 'preview reports ready rows and duplicates and saves nothing');
ok(preview.rows[0].values.state === 'Maryland' && preview.rows[0].values.description === 'TEST-SEED-CRM-IMPORT', 'the preview table still shows the file text');
ok(preview.rows[0].status === 'ok' && preview.rows[1].status === 'duplicate' && /already used/.test(preview.rows[1].message), 'a duplicate row is reported and not treated as created');
ok(preview.rows[0].link.includes('/crm/leads/'), 'a ready row links to the lead it would create');

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

console.log(fail ? fail + ' failed' : 'crm hosted import passed');
if (fail) process.exit(1);
