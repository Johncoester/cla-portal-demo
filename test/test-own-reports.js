/* RPT-3a (John, Nov 22 2026): "Processors should be able to build their own reports."
 * A Processor or Preprocessor is read-only in the CRM. They can now build, save, change and retire reports in their own folder.
 * They cannot save into a shared folder, change someone else's report, export, or share. Everyone else keeps the rule they had. */
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { reportEditable } from '../js/data/crm-analytics.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const refused = async (fn) => { try { await fn(); return ''; } catch (e) { return e.message || 'refused'; } };

// ---- the rule ----
const proc = { id: 'p1', role: 'Processor' }; const sales = { id: 's1', role: 'Sales Person' }; const adminU = { id: 'a1', isAdmin: true };
ok(reportEditable(proc, { createdBy: 'p1', personal: true }, true) && !reportEditable(proc, { createdBy: 'p1', personal: false }, true) && !reportEditable(proc, { createdBy: 'p2', personal: true }, true),
  'a read-only role changes a report only when it is their own and in their own folder');
ok(reportEditable(sales, { createdBy: 's1', personal: false }) && !reportEditable(sales, { createdBy: 'a1', personal: false }) && reportEditable(adminU, { createdBy: 's1', personal: false }) && !reportEditable(null, {}),
  'everyone else keeps the old rule: the maker, or an Admin');

// ---- through the demo portal ----
const api = createMockAdapter({ storage: mem(), sessionStorage: mem(), features: { accounting: true, crm: true } });
const users = await api.listDevUsers(); const admin = users.find((u) => u.role === 'Super admin'); const p = users.find((u) => u.role === 'Processor'); const p2 = users.find((u) => u.role === 'Processor' && u.id !== p.id) || users.find((u) => u.role === 'Preprocessor');
await api.signInDev(admin.id);
const shared = (await api.listCrmReports()).find((r) => !r.personal); const sharedFolder = (await api.listCrmReportFolders()).folders.find((f) => f.kind === 'shared');
const adminOwn = await api.createCrmReport({ name: 'Admin private', module: 'deals', columns: ['fileNumber'], folderId: (await api.listCrmReportFolders()).folders.find((f) => f.kind === 'personal').id });

await api.signInDev(p.id);
const me = await api.crmMe(); const fl = await api.listCrmReportFolders(); const mine = fl.folders.find((f) => f.kind === 'personal');
ok(me.canEdit === false && !!mine, 'the Processor is still read-only in the CRM and has their own report folder');
const made = await api.createCrmReport({ name: 'My pre-closing', module: 'deals', columns: ['fileNumber', 'processorName'], folderId: mine.id });
ok(made.personal === true && made.canEdit === true && made.canExport === false && made.folderId === mine.id, 'the Processor saves a report in their own folder and can change it; export stays with Admins');
const noFolder = await api.createCrmReport({ name: 'No folder picked', module: 'deals', columns: ['fileNumber'] });
ok(noFolder.personal === true, 'with no folder picked the report goes to their own folder');
ok(/own folder/.test(await refused(() => api.createCrmReport({ name: 'Shared try', module: 'deals', columns: ['fileNumber'], folderId: sharedFolder.id }))), 'the Processor cannot save into a shared folder');
const out = await api.runCrmReport(made.id);
ok(Array.isArray(out.rows || out.groups || []) && !(await refused(() => api.runCrmReport({ module: 'deals', columns: ['fileNumber'], name: 'unsaved' }))), 'the Processor runs a saved report and an unsaved one');
const edited = await api.updateCrmReport(made.id, { name: 'My pre-closing v2', columns: ['fileNumber', 'closerName'] });
ok(edited.name === 'My pre-closing v2' && edited.columns.includes('closerName'), 'the Processor changes their own report');
ok(/own folder/.test(await refused(() => api.updateCrmReport(made.id, { folderId: sharedFolder.id }))) && (await api.getCrmReport(made.id)).personal === true, 'the Processor cannot move it into a shared folder');
ok(!!(await refused(() => api.updateCrmReport(shared.id, { name: 'Hacked' }))) && !!(await refused(() => api.retireCrmReport(shared.id, true))) && (await api.getCrmReport(shared.id)).canEdit === false, 'the Processor cannot change or retire a shared report');
const copy = await api.cloneCrmReport(shared.id, { name: 'My copy' });
ok(copy.personal === true && copy.canEdit === true && /own folder/.test(await refused(() => api.cloneCrmReport(shared.id, { name: 'x', folderId: sharedFolder.id }))), 'the Processor clones a shared report into their own folder, not a shared one');
ok(/Admin/.test(await refused(() => api.exportCrmReport(made.id))) && /Admin/.test(await refused(() => api.createCrmReportFolder('Mine'))), 'the Processor still cannot export or create shared folders');
ok(!!(await refused(() => api.getCrmReport(adminOwn.id))) && !(await api.listCrmReports()).some((r) => r.id === adminOwn.id), "the Processor does not see a report in another person's own folder");
await api.retireCrmReport(noFolder.id, true);
ok((await api.listCrmReports({ includeRetired: true })).find((r) => r.id === noFolder.id).retired === true, 'the Processor retires their own report');
ok(!!(await refused(() => api.createCrmLead({ firstName: 'No', lastName: 'Way', company: 'X' }))), 'the rest of the CRM stays read-only for the Processor');

if (p2) { await api.signInDev(p2.id);
  ok(!(await api.listCrmReports()).some((r) => r.id === made.id) && !!(await refused(() => api.updateCrmReport(made.id, { name: 'Hacked' }))), "another Processor does not see or change the first Processor's report"); }
await api.signInDev(admin.id);
ok(!(await api.listCrmReports()).some((r) => r.id === made.id), "an Admin's report list does not show a Processor's own folder");
const sp = users.find((u) => u.role === 'Sales Person'); await api.signInDev(sp.id);
const sRep = await api.createCrmReport({ name: 'Sales shared', module: 'deals', columns: ['fileNumber'], folderId: sharedFolder.id });
ok(sRep.personal === false && sRep.canEdit === true, 'a Sales Person still saves into a shared folder');

// ---- the page and the hosted site ----
const page = read('../js/pages/crm-reports.js'); const host = read('../js/data/supabase-crm-surface.js');
ok(!page.includes("if (!me.canEdit) throw new Error('The Processor has read-only access to the CRM.')") && page.includes('const own = !me.canEdit;') && page.includes('data-own-folder-note') && page.includes('folderChoices.map('),
  'the builder opens for a Processor, offers only their own folder and says so');
ok(page.includes("if ((own || !s.folderId) && myFolder) f.folderId.value = myFolder.id;") && !page.includes("fl.folders.find((x) => x.kind === 'personal').id"), 'the details box no longer assumes an own folder is in the list');
ok(page.includes('<option value="clone">Clone</option>') && page.includes("${me.canEdit ? html`<option value=\"email\">Send Email</option>` : ''}") && page.includes("Export${rep.canExport ? '' : ' (Admin only)'}"), 'Clone is offered to everyone; Send Email and Export keep their rules');
ok(host.includes("kind: 'personal'") && host.includes('personal_owner: u.id') && host.includes("if (crmReadOnly(u)) throw new Error('Your reports are saved in your own folder.')") && host.includes('.filter((r) => mine(u, r))'),
  'the hosted site lists an own folder, saves into it, and refuses a shared folder for a read-only role');
ok(host.includes('canEdit: reportEditable(u, { createdBy: r.created_by, personal: !!r.personal_owner }, crmReadOnly(u))') && /async createCrmReport\(input = \{\}\) \{\s*const u = await who\(\);/.test(host), 'the hosted site uses the same rule for who may change a report');
const sql = read('../supabase/migrations/20261130013000_crm_reports_own_folder.sql'); const rb = read('../supabase/rollbacks/20261130013000_crm_reports_own_folder.sql');
ok(sql.includes('personal_owner = %s)) and created_by = %s') && sql.includes('with check (private.crm_editor() or (private.crm_user() and personal_owner = %s))') && sql.includes('r.personal_owner = private.effective_uid()') && !/grant /i.test(sql.replace(/--.*$/gm, '')) && !sql.includes('crm_reports_select on') && sql.includes('readback'),
  'the database file opens the own folder only: no new grant, the see-a-report rule untouched, and it reads itself back');
ok(rb.includes('with check (private.crm_editor() and created_by = %s)') && rb.includes("with check (private.crm_editor())") && !/delete |drop table/i.test(rb), 'the rollback puts the old rule back and deletes nothing');

console.log(fail ? `${fail} failed` : 'own reports passed'); process.exit(fail ? 1 : 0);
