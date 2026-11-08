/* Real file-tab render. The shell read and the tasks module are each delayed. No hosted project and no secrets. */
import { readFileSync, rmSync } from 'node:fs';
import { toText } from '../js/ui.js';
import { render } from '../js/pages/deal.js';
import { prefetchDealTab } from '../js/pages/deal-tab.js';

try { rmSync('/tmp/tab-load-started-at'); } catch (err) { /* first run */ }

let fail = 0;
const check = (cond, msg) => { if (cond) console.log('ok', msg); else { fail += 1; console.log('FAIL', msg); } };
const SHELL_MS = 200;
globalThis.location = { hash: '#/deals/file-1/tasks', search: '', pathname: '/' };
const user = { id: 'u-processor', role: 'Processor', firstName: 'Pat', lastName: 'Lee', isAdmin: true };
const deal = { id: 'file-1', fileNumber: 'MD-26-97216', street: '1 Main', city: 'Baltimore', state: 'MD', zip: '21201', myRole: '', myRoles: [] };

const shell = () => new Promise((resolve) => {
  setTimeout(() => { globalThis.__shellResolvedAt = Date.now(); resolve(deal); }, SHELL_MS);
});

globalThis.__tabLoadStartedAt = 0;
globalThis.__shellResolvedAt = 0;
const started = Date.now();
const view = await render({
  api: { readFileShell: shell, listTasks: async () => [{ id: 't1', title: 'Send contract', status: 'todo', assignedRole: 'Processor', kind: 'simple' }], features: {} },
  user,
  params: { id: 'file-1', tab: 'tasks', sub: '' },
  refresh() {},
});
const elapsed = Date.now() - started;
const tabStarted = Number(readFileSync('/tmp/tab-load-started-at', 'utf8'));
console.log('tasks overlap ms', elapsed, 'tab-before-shell', tabStarted < globalThis.__shellResolvedAt);
check(view && view.title === 'Tasks' && toText(view.body).includes('All Tasks') && toText(view.body).includes('Send contract'), 'the tasks page still draws from the task read');
check(tabStarted > 0 && tabStarted < globalThis.__shellResolvedAt, 'the tasks module starts loading before the file shell returns');
check(elapsed >= SHELL_MS - 20 && elapsed < SHELL_MS + 160, 'a delayed shell and a delayed tasks module overlap');
console.log('overlap bound', elapsed, 'between', SHELL_MS - 20, 'and', SHELL_MS + 160);

const alone = await prefetchDealTab('documents');
check(alone && typeof alone.render === 'function', 'the documents module loads without a file read');
if (!(alone && typeof alone.render === 'function')) console.log('documents module keys', alone && Object.keys(alone));

let seen = '';
try {
  await render({
    api: { readFileShell: async () => deal, listTasks: async () => { throw new Error('TASK_CONTENT_FAILED'); }, features: {} },
    user,
    params: { id: 'file-1', tab: 'tasks' },
    refresh() {},
  });
} catch (err) { seen = err.message; }
check(seen === 'TASK_CONTENT_FAILED', 'a task read failure is still shown');

console.log(fail ? fail + ' failed' : 'tab prefetch passed');
process.exit(fail ? 1 : 0);
