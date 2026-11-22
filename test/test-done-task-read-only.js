/* FF-069d (Janine's video, Nov 12 "CLA Portal Test - Processor and Seller Screens"; Francis Feedback ticket): a finished task still
   showed "Save progress" and "Save and keep complete" to the seller. Done tasks are read-only with a Back button for clients and agents;
   CLA staff keep their existing edit on a finished task. */
import { readFileSync } from 'node:fs';
import { intakeFormHtml } from '../js/pages/dealtaskform.js';
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const text = (h) => String(h && h.__html != null ? h.__html : h);
const task = (status) => ({ id: 't1', status, canFill: true, templateCode: 'forwarding', assignedRole: 'Client-Seller', fields: [{ k: 'street', label: 'Forwarding street', type: 'text', req: true }], formData: { street: '12 New Rd' } });
const sellerDone = text(intakeFormHtml(task('done'), { page: true, doneReadOnly: true, backHref: '#/deals/d1/tasks' }));
ok(!sellerDone.includes('Save progress') && !sellerDone.includes('Save and keep complete') && !sellerDone.includes('<form'), 'seller on a done task: no Save buttons and no form');
ok(sellerDone.includes('12 New Rd') && sellerDone.includes('Forwarding street'), 'the saved answers are shown read-only');
ok(sellerDone.includes('href="#/deals/d1/tasks"') && sellerDone.includes('data-task-done-back') && sellerDone.includes('class="back-btn"'), 'a Back to tasks button goes to the file\'s task list');
const sellerOpen = text(intakeFormHtml(task('todo'), { page: true, doneReadOnly: true, backHref: '#/deals/d1/tasks' }));
ok(sellerOpen.includes('Save progress') && sellerOpen.includes('Mark complete'), 'an open task still has Save progress and Mark complete');
const staffDone = text(intakeFormHtml(task('done'), { page: true }));
ok(staffDone.includes('Save progress') && staffDone.includes('Save and keep complete'), 'CLA staff keep their existing edit on a finished task');
const src = readFileSync(new URL('../js/pages/dealtaskform.js', import.meta.url), 'utf8');
ok(src.includes("const outside = !!(c0.user && (c0.user.accountRole || c0.user.role === 'Outside user'));") && src.includes("const doneReadOnly = outside && t.status === 'done';"), 'only buyers, sellers and agents get the read-only view');
const tasksSrc = readFileSync(new URL('../js/pages/dealtasks.js', import.meta.url), 'utf8');
ok(tasksSrc.includes("done: 'Done'"), '#17: a finished task\'s status reads "Done" with a capital D');
console.log(fail ? `FAIL ${fail}` : 'all done task read-only checks passed');
process.exit(fail ? 1 : 0);
