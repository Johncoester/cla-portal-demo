/* Workflow definitions: admin route, flowchart layout, mock save, supabase RPC shape.
 * Saving a workflow must not create file tasks. */
import { readFileSync } from 'node:fs';
import { routeAllowed, canOpenTaskSetup, sectionHash } from '../js/data/locked-links.js';
import { routeWs, navInWs } from '../js/workspace.js';
import { layoutWorkflow, matchWorkflow, commitWorkflow, ensureWorkflows, presentWorkflows, addStep, moveStep, removeStep } from '../js/data/workflows.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { workflowsSupabase } from '../js/data/supabase-workflows.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const R = (page) => ({ page, params: {} });
const admin = { id: 'u-adam', role: 'Admin', isAdmin: true, status: 'active' };
const superA = { id: 'u-admin', role: 'Super admin', isAdmin: true, status: 'active' };

ok(routeAllowed(admin, R('admin/workflows')) && routeAllowed(superA, R('admin/workflows')), 'workflows open for Admin and Super admin');
for (const role of ['Processor', 'Preprocessor', 'Sales Person', 'Transaction Coordinator', 'Outside user', 'Client-Buyer', 'Employee']) {
  ok(!routeAllowed({ role, isAdmin: false, status: 'active' }, R('admin/workflows')), role + ' cannot open workflows');
}
ok(!routeAllowed(superA, R('admin/workflows'), { demo: { active: true, portalRole: 'Processor' } }), 'demo view as Processor loses Workflows');
ok(routeAllowed(superA, R('admin/workflows'), { demo: { active: false } }), 'an inactive demo session keeps Super admin');
ok(canOpenTaskSetup(admin) && !canOpenTaskSetup({ role: 'Processor', isAdmin: false }), 'workflows use the task-setup guard');
ok(routeWs({ page: 'admin/workflows' }) === 'admin', 'workflows live in Admin / Settings');
ok(navInWs('workflows', 'admin') && !navInWs('workflows', 'portal') && !navInWs('workflows', 'everything'), 'Workflows is not in the Portal or Everything menus');
ok(sectionHash('workflows') === '#/admin/workflows', 'section link opens workflows');
const app = read('../js/app.js');
ok(app.includes("add('workflows', 'Workflows', '#/admin/workflows'") && app.includes("page: 'admin/workflows'"), 'the menu and the route point at Admin / Settings');
ok(!read('../js/data/mock-part-docs.js').includes('saveWorkflow') && !read('../js/data/mock-part-docs.js').includes('matchWorkflow'), 'adding a person does not apply a workflow');
ok(!read('../js/data/supabase-adapter.js').includes('matchWorkflow'), 'the supabase deal path does not apply a workflow');

const tpl = (id, code) => ({ id, code, title: code, version: 1, active: true });
const db = { seq: 10, taskTemplates: [tpl('t-a', 'id_upload'), tpl('t-b', 'personal_info'), tpl('t-old', 'retired_task', )], workflows: [], workflowSteps: [], workflowAssignments: [] };
db.taskTemplates[2].retiredAt = '2026-11-01T00:00:00Z';
const id = commitWorkflow(db, admin, {
  name: 'Processing — Purchase', audience: 'processing', description: 'Order of work', active: true,
  steps: [
    { id: 'a', taskTemplateId: 't-a', position: 1, dependsOn: null },
    { id: 'b', taskTemplateId: 't-b', position: 2, dependsOn: 'a' },
    { id: 'c', taskTemplateId: 't-b', position: 3, dependsOn: 'a' },
  ],
  assignments: [{ role: 'Processor', fileType: 'Purchase', state: 'md' }],
});
const saved = presentWorkflows(db).find((w) => w.id === id);
ok(saved.assignments[0].state === 'MD' && saved.steps.length === 3, 'save stores the state in capitals and keeps every step');
const lay = layoutWorkflow(saved.steps);
ok(lay.columns.length === 2 && lay.columns[1].length === 2 && lay.columns[1].every((s) => s.dependsOn === saved.steps[0].id), 'two steps after the same step are side by side');
ok(lay.edges.length === 2, 'the chart has an arrow into each later step');
let looped = false; try { layoutWorkflow([{ id: 'a', position: 1, dependsOn: 'b' }, { id: 'b', position: 2, dependsOn: 'a' }]); } catch (e) { looped = /loop/.test(e.message); }
ok(looped, 'a loop is refused by the chart');

let retired = ''; try { commitWorkflow(db, admin, { name: 'Nope', audience: 'client', steps: [{ id: 'z', taskTemplateId: 't-old', position: 1, dependsOn: null }], assignments: [] }); } catch (e) { retired = e.message; }
ok(/retired/.test(retired), 'a retired task template cannot be a step');
let denied = ''; try { commitWorkflow(db, { id: 'u-proc', role: 'Processor', isAdmin: false, status: 'active' }, { id, name: 'Hijack', audience: 'processing', steps: [], assignments: [] }); } catch (e) { denied = e.message; }
ok(/Admin or Super admin/.test(denied) && db.workflows.filter((w) => w.id === id)[0].name === 'Processing — Purchase', 'a processor cannot overwrite a workflow');
let clash = ''; try {
  commitWorkflow(db, superA, { name: 'Other', audience: 'processing', active: true, steps: [], assignments: [{ role: 'Processor', fileType: 'Purchase', state: 'MD' }] });
} catch (e) { clash = e.message; }
ok(/already applies/.test(clash), 'two active workflows cannot share the same assignment');
commitWorkflow(db, superA, { name: 'Any state purchase', audience: 'processing', active: true, steps: [], assignments: [{ role: 'Processor', fileType: 'Purchase', state: '' }] });
const rows = presentWorkflows(db);
ok(matchWorkflow(rows, { role: 'Processor', fileType: 'Purchase', state: 'MD' }).id === id, 'a state-specific assignment beats a file-type-only one');
ok(matchWorkflow(rows, { role: 'Processor', fileType: 'Purchase', state: 'VA' }).name === 'Any state purchase', 'another state falls through to the broader assignment');
ok(matchWorkflow(rows, { role: 'Client-Buyer', fileType: 'Purchase', state: 'MD' }) == null, 'a buyer does not match the processor workflow');

const moved = moveStep(saved.steps, saved.steps[2].id, -1);
ok(moved[1].id === saved.steps[2].id && moved[1].dependsOn === saved.steps[0].id, 'move up keeps a still-valid parent');
const dropped = removeStep(saved.steps, saved.steps[0].id);
ok(dropped.every((s) => s.dependsOn == null) && dropped.length === 2, 'removing the parent clears the arrows');
const added = addStep(dropped, { id: 't-a', code: 'id_upload', title: 'Upload photo ID', version: 1 }, 'new-1');
ok(added.length === 3 && added[2].dependsOn === added[1].id, 'a new step runs after the last one');

function memory() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), key: (i) => [...m.keys()][i] || null, get length() { return m.size; } };
}
const store = memory();
const api = createMockAdapter({ storage: store, sessionStorage: memory() });
await api.signInDev('u-admin');
const taskSnap = () => JSON.stringify(JSON.parse(store.getItem('cla-portal-new:data:v30')).tasks);
const listed = await api.listWorkflows();
const purchase = listed.find((w) => w.name === 'Processing — Purchase');
ok(purchase && purchase.steps.length === 5 && purchase.assignments[0].role === 'Processor', 'mock mode seeds a processing purchase workflow');
const buyer = await api.previewWorkflowMatch({ role: 'Client-Buyer', fileType: 'Purchase', state: 'MD' });
const seller = await api.previewWorkflowMatch({ role: 'Client-Seller', fileType: 'Purchase', state: 'MD' });
const refi = await api.previewWorkflowMatch({ role: 'Client-Buyer', fileType: 'Refinance', state: 'VA' });
ok(buyer && buyer.id === 'wf-client-buyer-purchase' && seller.id === 'wf-client-seller-purchase' && refi.id === 'wf-client-buyer-refinance', 'buyer, seller, and refinance match different workflows');
ok(buyer.steps[2].dependsOn === buyer.steps[1].id && buyer.steps[3].dependsOn === buyer.steps[1].id, 'the buyer chart branches after personal information');
const tasksBefore = taskSnap();
const edited = await api.saveWorkflow({ ...purchase, name: 'Processing — Purchase (edited)', steps: purchase.steps.map((s) => ({ ...s, id: s.id })), assignments: purchase.assignments });
ok(edited.name.includes('edited') && edited.id === purchase.id, 'an admin can rename a seeded workflow');
await api.signInDev('u-proc');
let proc = ''; try { await api.saveWorkflow({ id: purchase.id, name: 'Nope', audience: 'processing', steps: [], assignments: [] }); } catch (e) { proc = e.message; }
ok(/Admin or Super admin/.test(proc), 'mock mode refuses a processor save');
ok((await api.listWorkflows()).some((w) => w.id === purchase.id), 'a processor can still read workflows');
await api.signInDev('u-buyer');
let buyerRead = ''; try { await api.listWorkflows(); } catch (e) { buyerRead = e.message; }
ok(/CLA staff/.test(buyerRead), 'a client cannot read workflows');
ok(taskSnap() === tasksBefore, 'saving a workflow does not add or change tasks on a file');
ok(store.getItem('cla-portal-new:data:v31') == null, 'workflow seed stays on the current demo storage key');

const fresh = { taskTemplates: [{ id: 'tt-id_upload-v1', code: 'id_upload', title: 'Upload photo ID', version: 1 }] };
ensureWorkflows(fresh);
ok(fresh.workflowsSeeded && fresh.workflows.length === 0, 'seed waits until the example task templates exist');
fresh.taskTemplates.push({ id: 'tt-personal_info-v4', code: 'personal_info', title: 'Personal information', version: 4 }, { id: 'tt-lender_info-v1', code: 'lender_info', title: 'Lender information', version: 1 }, { id: 'tt-title_vesting-v2', code: 'title_vesting', title: 'Title vesting', version: 2 }, { id: 'tt-home_warranty-v2', code: 'home_warranty', title: 'Home warranty', version: 2 }, { id: 'tt-commissions-v1', code: 'commissions', title: 'Commission information', version: 1 }, { id: 'tt-hoa_info-v1', code: 'hoa_info', title: 'HOA', version: 1 }, { id: 'tt-mortgage_info-v1', code: 'mortgage_info', title: 'Mortgage', version: 1 }, { id: 'tt-forwarding_address-v1', code: 'forwarding_address', title: 'Forwarding', version: 1 }, { id: 'tt-seller_proceeds-v1', code: 'seller_proceeds', title: 'Proceeds', version: 1 });
fresh.workflowsSeeded = false;
ensureWorkflows(fresh);
ok(fresh.workflows.length === 5, 'the five example workflows appear once the templates exist');
ensureWorkflows(fresh);
ok(fresh.workflows.length === 5, 'loading again does not duplicate the examples');

const camel = (o) => Array.isArray(o) ? o.map(camel) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), camel(v)])) : o;
const okFn = (r) => { if (r.error) throw new Error(r.error.message); return r.data; };
const remoteStore = {
  workflows: [{ id: 'w1', name: 'Processing — Purchase', description: '', active: true, audience: 'processing', updated_at: '2026-11-06T00:00:00Z' }],
  workflow_steps: [{ id: 's1', workflow_id: 'w1', task_template_id: 'tt', position: 1, depends_on: null, template: { code: 'lender_info', title: 'Lender information', version: 1 } }],
  workflow_assignments: [{ id: 'a1', workflow_id: 'w1', role: 'Processor', file_type: 'Purchase', state: '' }],
};
const calls = [];
const sb = { from(table) { return { select() { return this; }, order() { return this; }, then(res) { calls.push(table); return Promise.resolve({ data: remoteStore[table], error: null }).then(res); } }; }, rpc: async (name, args) => { calls.push({ name, args }); remoteStore.workflows[0].name = args.p_name; return { data: 'w1', error: null }; } };
const me = async () => ({ id: 'me', role: 'Admin', isAdmin: true, status: 'active' });
const remote = workflowsSupabase({ sb, ok: okFn, camel, me });
const remoteRows = await remote.listWorkflows();
ok(remoteRows[0].steps[0].templateTitle === 'Lender information' && remoteRows[0].assignments[0].fileType === 'Purchase', 'supabase list maps steps and assignments');
await remote.saveWorkflow({ id: 'w1', name: 'Processing — Purchase v2', audience: 'processing', active: true, steps: [{ id: 's1', taskTemplateId: 'tt', position: 1, dependsOn: null }], assignments: [{ role: 'Processor', fileType: 'Purchase', state: '' }] });
const rpc = calls.find((c) => c && c.name === 'save_workflow');
ok(rpc && rpc.args.p_steps[0].task_template_id === 'tt' && rpc.args.p_assignments[0].file_type === 'Purchase' && rpc.args.p_id === 'w1', 'supabase save calls save_workflow and does not insert tasks');
ok(!calls.includes('tasks'), 'the supabase workflow methods never touch the tasks table');

console.log(fail ? fail + ' failed' : 'workflows passed');
if (fail) process.exit(1);
