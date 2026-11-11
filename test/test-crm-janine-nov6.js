/* Janine Nov 6: template folder counts, image limit wording, mass actions. Fake data only. Nothing is sent. */
import { folderCounts, imageLimitMessage, INLINE_IMAGE_MAX_BYTES } from '../js/data/crm-templates.js';
import { dedupeRecipients, fieldPatch, ownerAllowed, pageOf, planRelatedEmails, runEach, selectPage, selectionState, BULK_PAGE_SIZE, DEFAULT_PAGE_SIZE } from '../js/data/crm-bulk.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

const counts = folderCounts([
  { folder_id: 'ef-janine', retired_at: null },
  { folder_id: 'ef-janine', retired_at: '2026-01-01' },
  { personal_owner: 'u-janine', retired_at: null },
], ['ef-janine'], 'personal:u-janine');
ok(counts.shared['ef-janine'] === 1 && counts.personal === 1, 'a folder count ignores a retired template and counts the one inside');

const msg = imageLimitMessage(4 * 1024 * 1024, INLINE_IMAGE_MAX_BYTES);
ok(msg.includes('4 MB') && msg.includes('3 MB') && !msg.includes('400') && !/[\u0000-\u0008]/.test(msg), 'an oversized image says 3 MB in plain text');
ok(INLINE_IMAGE_MAX_BYTES === 3 * 1024 * 1024, 'the inline image limit is 3 MB');

const rows = Array.from({ length: 30 }, (_, i) => ({ id: 'r' + i, name: 'R' + i, email: i === 2 ? 'ada@example.test' : i === 3 ? 'Ada@example.test' : i === 4 ? '' : `p${i}@example.test` }));
const page = pageOf(rows, 2, 25);
ok(page.page === 2 && page.rows.length === 5 && page.rows[0].id === 'r25', 'page 2 is only the current page');
ok(BULK_PAGE_SIZE === 100 && DEFAULT_PAGE_SIZE === 100, 'the default page holds 100 records');
let selected = selectPage(new Set(), page.rows, true);
ok(selectionState(selected, page.rows).allOnPage && selectionState(selected, pageOf(rows, 1, 25).rows).pageOn === 0, 'select all checks this page only');
selected = new Set();
ok(selectionState(selected, page.rows).count === 0, 'a filter or page change starts with nothing selected');

const plan = dedupeRecipients([rows[2], rows[3], rows[4], rows[5]]);
ok(plan.recipients.length === 2 && plan.recipients.every((r) => r.email !== plan.recipients.find((z) => z !== r).email) && plan.skipped.length === 2, 'the same address is one draft and a blank address is skipped');
ok(plan.recipients[0].email === 'ada@example.test' && !plan.recipients.some((r) => r.email.includes(',')), 'a draft is addressed to one person');

let threw = '';
try { fieldPatch('lead', 'email', 'x@example.test'); } catch (e) { threw = e.message; }
ok(/cannot be changed/.test(threw), 'email is not a bulk field');
ok(fieldPatch('lead', 'notes', 'Called').notes === 'Called', 'notes is an allowed bulk field');
ok(ownerAllowed('u-admin', [{ id: 'u-admin', name: 'Ada' }]) && !ownerAllowed('u-outsider', [{ id: 'u-admin', name: 'Ada' }]), 'only an eligible owner can be assigned');

const result = await runEach([{ id: 'a', name: 'Ada' }, { id: 'b', name: 'Bea' }], async (r) => { if (r.id === 'b') throw new Error('not yours'); });
ok(result.ok.length === 1 && result.failed.length === 1 && result.failed[0].reason === 'not yours', 'one refused row does not undo the row that saved');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-admin');
const folder = await api.createCrmEmailFolder('Janine');
const tpl = await api.createCrmEmailTemplate({ name: 'Janine note', module: 'contact', kind: 'html', subject: 'Hello', body: '<p>Hi</p>', folderId: folder.id, status: 'active' });
const listed = await api.listCrmEmailFolders();
const found = listed.folders.find((f) => f.id === folder.id);
ok(found && found.count === 1, 'the folder list counts the template inside it');
const sig = await api.saveCrmSignature('<p>Janine</p>');
ok((await api.getCrmSignature()).html.includes('Janine') && sig.html.includes('Janine'), 'a signature can be saved');

const leads = await api.listCrmLeads();
const open = leads.filter((l) => l.email && !l.archived && !l.converted).slice(0, 2);
ok(open.length === 2, 'two leads are available for a fake bulk check');
const drafted = [];
const realSave = api.saveCrmEmail.bind(api);
api.saveCrmEmail = async (input) => { drafted.push(input); if (input.mode === 'send') return realSave(input); return realSave(input); };
const mail = dedupeRecipients(open);
for (const r of mail.recipients) await api.saveCrmEmail({ entity: 'lead', entityId: r.id, to: [r.email], subject: 'Hello', html: '<p>Hi</p>', mode: 'send' });
const emails = await api.listCrmEmails('lead', mail.recipients[0].id);
ok(drafted.length === mail.recipients.length && drafted.every((d) => d.to.length === 1) && emails[0] && emails[0].status !== 'sent', 'each draft has one recipient and nothing is sent');
const owners = await api.listCrmOwners();
await api.updateCrmLead(open[0].id, { ownerId: owners[0].id, notes: 'Bulk note' });
const after = await api.getCrmLead(open[0].id);
ok(after.notes === 'Bulk note' && after.ownerId === owners[0].id, 'an allowed field and an eligible owner save on the lead');
let bad = '';
try { await api.updateCrmLead(open[0].id, { ownerId: 'not-a-person' }); } catch (e) { bad = e.message; }
ok(/owner|not|staff|pick|assign/i.test(bad), 'an owner who is not eligible is refused');
const task = await api.createCrmTask({ entity: 'lead', entityId: open[0].id, subject: 'Call back', dueDate: '2026-12-01' });
ok(task.subject === 'Call back' && task.entityId === open[0].id && task.status === 'Not Started', 'a task uses the existing task on that lead');
const ro = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await ro.signInDev('u-proc');
let refused = '';
try { await ro.updateCrmLead(open[0].id, { notes: 'no' }); } catch (e) { refused = e.message; }
ok(/read-only|Processor/i.test(refused), 'a read-only CRM user cannot bulk-update a lead');
const companySkip = planRelatedEmails('account', [{ id: 'co', name: 'Harbor Realty', email: '' }]);
ok(companySkip.recipients.length === 0 && /linked to this company/.test(companySkip.skipped[0].reason), 'a company with no linked client email is skipped with that reason');
const companyMail = planRelatedEmails('account', [{ id: 'co', name: 'Ada Agent', email: 'ada@example.test' }]);
ok(companyMail.recipients[0].storeEntity === 'account' && companyMail.recipients[0].email === 'ada@example.test', 'a company draft uses the linked client email and stays on the company');
const oppMail = planRelatedEmails('opportunity', [{ id: 'op', name: 'Referral', email: 'ada@example.test', contactId: 'client-1' }]);
ok(oppMail.recipients[0].storeEntity === 'contact' && oppMail.recipients[0].storeId === 'client-1', 'an opportunity draft is stored on its client');
const dealSkip = planRelatedEmails('deal', [{ id: 'deal-x', name: 'Oak', email: '' }]);
ok(/allowed to use/.test(dealSkip.skipped[0].reason), 'a deal with no permitted email is skipped instead of guessed');
const accounts = await api.listCrmAccounts();
const linked = [];
for (const a of accounts.slice(0, 5)) linked.push(...await api.crmRelatedEmails('account', a.id));
ok(linked.every((p) => p.email && p.email.includes('@')), 'company recipients are real emails from linked clients');
const proc = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await proc.signInDev('u-proc');
const file = (await proc.listDeals({ status: 'Open' }))[0];
const portalTask = await proc.createTask(file.id, { title: 'Call the listing agent', dueDate: '2026-12-01', assignedRole: 'Processor', description: 'Call the listing agent' });
ok(portalTask.dealId === file.id && portalTask.kind === 'simple' && !portalTask.participantId, 'a deal task is a portal task on that order');
const sales = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await sales.signInDev('u-sp');
let salesTask = '';
try { await sales.createTask(file.id, { title: 'Nope', dueDate: '2026-12-01' }); } catch (e) { salesTask = e.message; }
ok(/processor or transaction coordinator/.test(salesTask), 'a salesperson cannot create the deal task');

if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('all passed');
