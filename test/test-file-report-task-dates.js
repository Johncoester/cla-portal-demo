/* RPT-2 (John, Nov 22 2026): task dates as columns on the CRM report builder's Deals report.
 * John's pre-closing report shows when tasks such as "Confirm EMD Receipt" and "Title - CLEAR TO CLOSE" are due and when they were done.
 * Every task name in use gives a Deals report two date columns. The task read happens only when a report uses one of them. */
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { reportFields, moduleFields, taskReportFields, taskFieldOf, taskTitlesInUse, withTaskColumns, reportKeys, reportUsesTasks, isTaskKey, TASK_DUE, TASK_DONE } from '../js/data/crm-analytics.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const EMD = 'Confirm EMD Receipt'; const CTC = 'Title - CLEAR TO CLOSE';

// ---- the columns ----
const f = taskFieldOf(TASK_DUE + EMD); const g = taskFieldOf(TASK_DONE + EMD);
ok(f.label === 'Task: Confirm EMD Receipt: Due Date' && f.type === 'date' && g.label === 'Task: Confirm EMD Receipt: Completed Date' && taskFieldOf('fileNumber') === null && taskFieldOf(TASK_DUE) === null, 'a task gives a Due Date column and a Completed Date column, named after the task');
const tf = taskReportFields([EMD, ' Confirm  EMD Receipt ', CTC, ''], [TASK_DUE + 'Retired task', 'fileNumber']).map((x) => x.key);
ok(tf.length === 5 && tf.includes(TASK_DUE + EMD) && tf.includes(TASK_DONE + CTC) && tf.includes(TASK_DUE + 'Retired task') && !tf.includes(TASK_DONE + 'Retired task'), 'two columns per task name, the same name counted once, and a column a saved report already uses stays');
const rf = reportFields('deals', [], null, { taskTitles: [EMD] }).map((x) => x.key);
ok(rf.includes(TASK_DUE + EMD) && rf.includes('processorName') && !moduleFields('deals', null).some((x) => isTaskKey(x.key)) && !reportFields('contacts', [], null, { taskTitles: [EMD] }).some((x) => isTaskKey(x.key)) && !reportFields('deals', [], null).some((x) => isTaskKey(x.key)),
  'task columns are on a Deals report only, not on the Deals list or other report types');
ok(taskTitlesInUse([{ title: 'B' }, { title: 'A' }, { title: 'B' }, { title: '  ' }, null]).join() === 'B,A', 'the column picker lists task names most used first');
ok(reportUsesTasks({ columns: ['fileNumber'] }) === false && reportUsesTasks({ columns: ['fileNumber'], filters: [{ field: TASK_DUE + EMD, op: 'is', value: '' }] }) === true && reportKeys({ columns: ['a'], rowGroups: ['b'], aggregates: [{ field: 'c' }], filters: [{ field: 'd' }], sort: { field: 'e' } }).join() === 'a,b,c,d,e',
  'a report uses tasks when a column, group, total, filter or sort names a task column');

// ---- the dates ----
const keys = [TASK_DUE + EMD, TASK_DONE + EMD, TASK_DUE + CTC, TASK_DONE + CTC];
const one = withTaskColumns({ id: 'd1' }, [{ title: EMD, dueDate: '2026-06-05', completedAt: '2026-06-04T15:00', status: 'done' }, { title: CTC, dueDate: '2026-06-21', completedAt: null, status: 'todo' }, { title: CTC, dueDate: '2026-06-01', status: 'cancelled' }], keys);
ok(one[TASK_DUE + EMD] === '2026-06-05' && one[TASK_DONE + EMD] === '2026-06-04' && one[TASK_DUE + CTC] === '2026-06-21' && one[TASK_DONE + CTC] === null, 'due and completed dates are filled; an open task has no completed date; a cancelled task is not counted');
const two = withTaskColumns({ id: 'd2' }, [{ title: EMD, dueDate: '2026-06-09', completedAt: '2026-06-08T10:00', status: 'done' }, { title: EMD, dueDate: '2026-06-05', completedAt: null, status: 'todo' }], keys);
ok(two[TASK_DUE + EMD] === '2026-06-05' && two[TASK_DONE + EMD] === null, 'the same task twice on a file: the earliest due date, and completed only when every one is done');
const both = withTaskColumns({ id: 'd3' }, [{ title: EMD, dueDate: '2026-06-09', completedAt: '2026-06-08T10:00', status: 'done' }, { title: EMD, dueDate: '2026-06-05', completedAt: '2026-06-10T09:00', status: 'done' }], keys);
ok(both[TASK_DONE + EMD] === '2026-06-10', 'when every one is done the completed date is the latest');
const none = withTaskColumns({ id: 'd4', fileNumber: 'X' }, undefined, keys);
ok(none[TASK_DUE + EMD] === null && none[TASK_DONE + CTC] === null && none.fileNumber === 'X', 'a file without that task shows blank');

// ---- through the demo portal ----
const api = createMockAdapter({ storage: mem(), sessionStorage: mem(), features: { accounting: true, crm: true } });
const users = await api.listDevUsers(); const admin = users.find((u) => u.role === 'Super admin');
await api.signInDev(admin.id);
const deal = await api.createDeal({ street: '88 Task Date Test Rd', city: 'Rockville', state: 'MD', zip: '20850', openDate: '2026-06-01', closingDate: '2026-07-15', purchasePrice: '500,000', loanAmount: '400,000' });
const emd = await api.createTask(deal.id, { title: EMD, dueDate: '2026-06-05' });
await api.createTask(deal.id, { title: CTC, dueDate: '2026-07-05' });
await api.updateTask(emd.id, { status: 'done' });
const titles = await api.listCrmReportTaskTitles();
ok(titles.includes(EMD) && titles.includes(CTC), 'the report builder is given the task names in use');
const def = { module: 'deals', name: 'Pre-closing', columns: ['fileNumber', 'processorName', TASK_DUE + EMD, TASK_DONE + EMD, TASK_DUE + CTC, TASK_DONE + CTC], filters: [{ field: 'fileNumber', op: 'is', value: deal.fileNumber }] };
const out = await api.runCrmReport(def); const line = Object.fromEntries(out.rows[0].cells.map((c) => [c.key, c.text]));
const today = new Date(); const mm = String(today.getMonth() + 1).padStart(2, '0'); const dd = String(today.getDate()).padStart(2, '0');
ok(out.total === 1 && out.columns.map((c) => c.label).join(' | ') === 'File Number | Processor | Task: Confirm EMD Receipt: Due Date | Task: Confirm EMD Receipt: Completed Date | Task: Title - CLEAR TO CLOSE: Due Date | Task: Title - CLEAR TO CLOSE: Completed Date', 'the report shows the task columns with plain headings');
ok(/06\/05\/2026|2026-06-05|Jun 5, 2026/.test(line[TASK_DUE + EMD]) && line[TASK_DONE + EMD] !== '' && new RegExp(`${mm}/${dd}|-${mm}-${dd}|${today.getFullYear()}`).test(line[TASK_DONE + EMD]) && /07\/05\/2026|2026-07-05|Jul 5, 2026/.test(line[TASK_DUE + CTC]) && line[TASK_DONE + CTC] === '',
  'EMD receipt shows its due date and today as completed; clear to close shows its due date and no completed date');
const overdue = await api.runCrmReport({ module: 'deals', name: 'Not cleared', columns: ['fileNumber'], filters: [{ field: TASK_DONE + CTC, op: 'empty' }, { field: TASK_DUE + CTC, op: 'not_empty' }] });
ok(overdue.rows.some((r) => r.cells[0].text === deal.fileNumber), 'a report can list files where clear to close has a due date and is not done yet');
const saved = await api.createCrmReport({ name: 'RPT-2 saved', module: 'deals', columns: ['fileNumber', TASK_DUE + CTC] });
ok((await api.runCrmReport(saved.id)).columns.map((c) => c.key).join() === 'fileNumber,' + TASK_DUE + CTC && (await api.getCrmReport(saved.id)).fields.some((x) => x.key === TASK_DUE + CTC), 'a saved report keeps its task column');
let bad = ''; try { await api.createCrmReport({ name: 'bad', module: 'contacts', columns: ['name', TASK_DUE + EMD] }); } catch (e) { bad = e.message; }
ok(/not in this report/.test(bad), 'a task column is refused on a report that is not about files');
const sales = users.find((u) => u.role === 'Sales Person');
if (sales) { await api.signInDev(sales.id); const mine = await api.runCrmReport({ module: 'deals', name: 'Mine', columns: ['fileNumber', TASK_DUE + EMD] });
  ok(!mine.rows.some((r) => r.cells[0].text === deal.fileNumber), 'a Sales Person who is not on the file does not get its tasks in a report'); }

// ---- hosted side ----
const hosted = read('../js/data/supabase-crm-surface.js'); const sql = read('../supabase/migrations/20261129020000_crm_deal_report_tasks.sql');
ok(hosted.includes("sb.rpc('crm_deal_report_tasks')") && hosted.includes('wantTasks ? taskRows() : Promise.resolve([])') && hosted.includes('const wantTasks = reportUsesTasks(def);'), 'the hosted report reads the tasks only when the report names a task column');
ok(hosted.includes('async listCrmReportTaskTitles()') && hosted.includes('The task date columns are not on this database yet'), 'the builder can list task names, and a report says so when the database file is not applied');
ok(sql.includes('if not private.crm_user() then raise exception') && sql.includes('where private.crm_deal_visible(g.id)') && sql.includes("t.status <> 'cancelled'") && sql.includes('revoke all on function public.crm_deal_report_tasks() from public, anon;'), 'the database function is staff-only, limited to files the person may see, and leaves out cancelled tasks');
const body = sql.slice(sql.indexOf('create function'), sql.indexOf('revoke all'));
ok(!/description|form_data|owner_profile_id|participant_id/.test(body) && !/create or replace|alter table|drop /i.test(sql.replace(/--.*$/gm, '')), 'it returns only the task name, dates and status, and changes nothing that exists');
ok(read('../js/pages/crm-reports.js').includes('api.listCrmReportTaskTitles') && read('../js/pages/crm-reports.js').includes('{ taskTitles, keys:'), 'the report builder page offers the task columns');

console.log(fail ? fail + ' failed' : 'file report task dates passed');
process.exit(fail ? 1 : 0);
