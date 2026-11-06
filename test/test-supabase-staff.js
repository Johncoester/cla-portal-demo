/* Each new supabase staff method calls the existing tables. No network. */
import { staffSupabase, LOGIN_CLOSED } from '../js/data/supabase-staff.js';
const okFn = (r) => { if (r.error) throw new Error(r.error.message); return r.data; };
const camel = (o) => Array.isArray(o) ? o.map(camel) : o && typeof o === 'object' && !(o instanceof Blob)
  ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), camel(v)])) : o;
function fake(store) {
  const calls = [];
  const from = (table) => {
    const q = { table, op: 'select', filters: [], row: null };
    const run = (one) => { calls.push({ ...q, filters: q.filters.slice() }); const data = store(q); return Promise.resolve({ data: one && Array.isArray(data) ? data[0] : data, error: data && data.__error ? data : null }); };
    const api = { select() { return api; }, insert(row) { q.op = 'insert'; q.row = row; return api; }, update(row) { q.op = 'update'; q.row = row; return api; },
      delete() { q.op = 'delete'; return api; }, eq(k, v) { q.filters.push(['eq', k, v]); return api; }, in(k, v) { q.filters.push(['in', k, v]); return api; }, is(k, v) { q.filters.push(['is', k, v]); return api; },
      order() { return api; }, single() { return run(true); }, maybeSingle() { return run(true); }, then(res, rej) { return run(false).then(res, rej); } };
    return api;
  };
  const sb = { from, calls, rpc: async (n, args) => { calls.push({ op: 'rpc', table: n, args }); return { data: store({ op: 'rpc', table: n, args }), error: null }; },
    storage: { from() { return { upload: async (path) => { calls.push({ op: 'upload', path }); return { error: null }; } }; } },
    auth: { getUser: async () => ({ data: { user: { id: 'me' } } }) } };
  return { sb, calls };
}
const me = async () => ({ id: 'me', role: 'Super admin', isAdmin: true });
let fail = 0; const check = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const profiles = [{ id: 's1', email: 'sam@example.test', first_name: 'Sam', last_name: 'Sales', phone: '', role: 'Sales Person', is_admin: false, status: 'active' }, { id: 'me', email: 'a@example.test', first_name: 'Ada', last_name: 'Admin', phone: '', role: 'Super admin', is_admin: true, status: 'active' }];
const { sb, calls } = fake((q) => {
  if (q.table === 'profiles' && q.op === 'select') { const inn = q.filters.find((f) => f[0] === 'in'); return inn ? profiles.filter((p) => inn[2].includes(p.role) && p.status === 'active') : profiles; }
  if (q.table === 'contacts') return [];
  if (q.table === 'deal_participants') return [];
  if (q.table === 'deals' && q.op === 'select') return q.filters.some((f) => f[1] === 'id') ? [{ id: 'd1', status: 'Open' }] : [];
  if (q.table === 'deals' && q.op === 'update') return { id: 'd1' };
  if (q.table === 'client_sales_reps') return [];
  if (q.table === 'team_members' && q.op === 'select') return [{ team_id: 't1', profile_id: 'me', member_role: 'coordinator' }];
  if (q.table === 'team_members') return { team_id: 't1' };
  if (q.table === 'teams' && q.op === 'select') return [{ id: 't1', name: 'Harbor' }];
  if (q.table === 'teams' && q.op === 'insert') return { id: 't2', name: q.row.name, created_by: 'me' };
  if (q.table === 'teams' && q.op === 'update') return { id: 't1' };
  if (q.table === 'tasks' && q.op === 'select' && q.filters.some((f) => f[1] === 'participant_id')) return [{ id: 'tk', status: 'todo' }];
  if (q.table === 'tasks' && q.op === 'select' && q.filters.some((f) => f[1] === 'id')) return { id: 'tk', deal_id: 'd1', title: 'ID', assigned_role: 'Client-Buyer' };
  if (q.table === 'tasks' && q.op === 'select') return [{ template_id: 'tt1' }];
  if (q.table === 'tasks' && q.op === 'insert') return { id: 'tk2', ...q.row };
  if (q.table === 'tasks' && q.op === 'update') return { id: 'tk' };
  if (q.table === 'task_templates') return [{ id: 'tt1', code: 'id_upload', version: 1, title: 'ID', description: '', roles: ['Client-Buyer'], fields: [], active: true, agent_roles: [], client_only: true, due_days: 7, published_at: '2026-01-01' }];
  if (q.table === 'folders' && q.op === 'select' && q.filters.some((f) => f[2] === 'f1')) return [{ id: 'f1', scope: 'library', name: 'Forms', staff_only: false }];
  if (q.table === 'folders' && q.op === 'select' && q.filters.some((f) => f[2] === 'library')) return [{ id: 'f1', scope: 'library', name: 'Forms', staff_only: false }];
  if (q.table === 'folders' && q.op === 'select' && q.filters.some((f) => f[2] === 'IDs & personal')) return [{ id: 'f2', name: 'IDs & personal' }];
  if (q.table === 'folders' && q.op === 'select') return [{ id: 'f3', scope: 'deal', deal_id: 'd1', name: 'Contract' }];
  if (q.table === 'folders' && q.op === 'insert') return { id: 'f4', ...q.row };
  if (q.table === 'folders' && q.op === 'update') return { id: 'f1', name: q.row.name };
  if (q.table === 'documents' && q.op === 'select' && q.filters.some((f) => f[0] === 'is')) return [{ id: 'doc1', folder_id: 'f1', name: 'A.pdf', deal_id: null }];
  if (q.table === 'documents' && q.op === 'select') return [{ id: 'doc2', folder_id: null }];
  if (q.table === 'documents' && q.op === 'insert') return { id: q.row.id, name: q.row.name };
  if (q.table === 'documents' && q.op === 'update') return { id: 'doc2' };
  if (q.table === 'settlements') return [{ id: 'set1', deal_id: 'd1', status: 'open', round: 1, slots: [], location: '', note: '', confirmed_slot: 2, history: [], created_by: 'me', created_at: '2026-01-01', confirmed_at: null }];
  if (q.table === 'settlement_responses') return [{ settlement_id: 'set1', round: 1, side: 'buyer', picks: [1, 2], note: '' }];
  if (q.table === 'thread_participants') return [{ thread_id: 'th', last_read_at: '2026-01-01T00:00:00Z' }];
  if (q.table === 'messages') return [{ thread_id: 'th', created_at: '2026-02-01T00:00:00Z', author_id: 'other' }];
  if (q.op === 'rpc' && q.table === 'admin_set_sales_reps') return 1;
  if (q.op === 'delete') return null;
  return [];
});
const api = { getDeal: async (id) => ({ id, stage: 9 }), listDeals: async () => [{ id: 'd1', status: 'Open', closingDate: new Date().toISOString().slice(0, 10) }] };
const s = staffSupabase({ sb, ok: okFn, camel, me, api });
const sales = await s.listSalesStaff();
check(sales.length === 1 && sales[0].name === 'Sam Sales' && sales[0].role === 'Sales Person', 'listSalesStaff returns active sales people');
const users = await s.adminListUsers();
check(users.some((u) => u.id === 'me' && u.isAdmin) && users[0].files && users[0].salesReps, 'adminListUsers returns the admin directory shape');
check((await s.adminGetUser('s1')).email === 'sam@example.test', 'adminGetUser finds one person');
let closed = ''; try { await s.adminCreateUser({ role: 'Sales Person' }); } catch (e) { closed = e.message; }
check(closed === LOGIN_CLOSED && /#\/hr\/add/.test(closed) && /#\/agent-invites/.test(closed), 'adminCreateUser points at the invite flows');
await s.adminUpdateUser('s1', { role: 'Sales Team', isAdmin: false, salesIds: ['s1'] });
check(calls.some((c) => c.table === 'profiles' && c.op === 'update' && c.row.role === 'Sales Team') && calls.some((c) => c.op === 'rpc' && c.table === 'admin_set_sales_reps'), 'adminUpdateUser writes the profile and the salesperson links');
const teams = await s.listTeams();
check(teams[0].name === 'Harbor' && teams[0].members[0].memberRole === 'coordinator', 'listTeams includes members');
check((await s.createTeam('Oak')).name === 'Oak', 'createTeam inserts a team');
await s.renameTeam('t1', 'Harbor East');
check(calls.some((c) => c.table === 'teams' && c.op === 'update' && c.row.name === 'Harbor East'), 'renameTeam updates the name');
check(await s.addTeamMember('t1', 's1') === true && calls.some((c) => c.table === 'team_members' && c.op === 'insert'), 'addTeamMember inserts a member');
check(await s.removeTeamMember('t1', 's1') === true && calls.some((c) => c.table === 'team_members' && c.op === 'delete'), 'removeTeamMember deletes the membership');
const task = await s.createTask('d1', { title: 'Call the lender', assignedRole: 'Processor' });
check(task.title === 'Call the lender' && task.kind === 'simple', 'createTask inserts a simple task');
const tpls = await s.listTaskTemplates();
check(tpls[0].code === 'id_upload' && tpls[0].copies === 1 && tpls[0].locked === true, 'listTaskTemplates counts copies and locks client-only forms');
const staged = await s.setStage('d1', 9);
check(staged.stage === 9 && calls.some((c) => c.table === 'deals' && c.op === 'update' && c.row.status === 'Closed'), 'setStage updates the stage and closes a disbursed order');
await s.setDealStatus('d1', 'On Hold');
check(calls.some((c) => c.table === 'deals' && c.row && c.row.status === 'On Hold'), 'setDealStatus updates the order status');
check(await s.removeParticipant('d1', 'p1') === true && calls.some((c) => c.table === 'tasks' && c.op === 'update' && c.row.status === 'cancelled') && calls.some((c) => c.table === 'deal_participants' && c.op === 'delete'), 'removeParticipant cancels open copies then unlinks');
const wq = await s.getWorkQueue();
check(wq.assigned === 1 && wq.closingsToday === 1 && Array.isArray(wq.needsAttention), 'getWorkQueue summarizes open orders');
check(await s.unreadCount() === 1, 'unreadCount counts messages after the last read');
const lib = await s.listLibrary();
check(lib[0].name === 'Forms' && lib[0].documents[0].name === 'A.pdf', 'listLibrary nests documents in folders');
const df = await s.listDealFolders('d1');
check(df.some((f) => f.name === 'Unfiled' && f.virtual) && df.some((f) => f.name === 'Contract'), 'listDealFolders includes Unfiled');
check((await s.createFolder({ scope: 'library', name: 'Notices', staffOnly: true })).staffOnly === true, 'createFolder inserts a library folder');
check((await s.renameFolder('f1', 'Forms 2')).name === 'Forms 2', 'renameFolder updates the folder');
const added = await s.addLibraryDocument('f1', { name: 'wire.pdf', dataUrl: 'data:application/pdf;base64,AA==', mimeType: 'application/pdf', size: 2 });
check(added.name === 'wire.pdf' && calls.some((c) => c.op === 'upload' && String(c.path).startsWith('library/')), 'addLibraryDocument uploads into the library path');
check(await s.updateDocumentMeta('doc2', { description: 'note', visibility: 'staff', docType: 'Other', wireInstructions: true }) === true, 'updateDocumentMeta writes the editable columns');
check(await s.moveDocument('doc2', 'f3') === true && calls.some((c) => c.table === 'documents' && c.row && c.row.folder_id === 'f3'), 'moveDocument sets the folder');
const up = await s.uploadForTask('tk', { name: 'id.pdf', dataUrl: 'data:application/pdf;base64,AA==', mimeType: 'application/pdf', size: 2 });
check(up.id && up.name === 'id.pdf' && calls.some((c) => c.op === 'upload' && String(c.path).startsWith('d1/')), 'uploadForTask stores the file on the order');
const sets = await s.listSettlements('d1');
check(sets[0].confirmedSlot === 1 && sets[0].responses[0].picks[0] === 0 && sets[0].createdByName === 'Ada Admin', 'listSettlements returns answers with zero-based picks');
const plain = await import('node:fs');
const order = plain.readFileSync(new URL('../js/pages/ordernew.js', import.meta.url), 'utf8');
check(/optional\(\(\) => api\.listSalesStaff\(\)\)/.test(order), 'Place Order keeps going when the sales list fails');
const cfg = plain.readFileSync(new URL('../config.js', import.meta.url), 'utf8');
check(/crm:\s*true/.test(cfg), 'the publish config turns the CRM flag on');
console.log(fail ? `${fail} failed` : 'supabase staff methods passed');
if (fail) process.exit(1);
