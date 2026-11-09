/* Francis triage Nov 9: commission task fields (FF-NEW-1) + HR Employee backfill (V-9).
   Run: node test/test-francis-triage-nov9.js */
import { readFileSync } from 'node:fs';
import { fetchHostedTask } from '../js/data/task-actions.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

// ---- FF-NEW-1: templates_select opens fields to deal assignees ----
const tplMig = read('supabase/migrations/20261110024000_task_template_fields_for_assignees.sql');
const tplRb = read('supabase/rollbacks/20261110024000_task_template_fields_for_assignees.sql');
ok(tplMig.includes("48e5c19f67a254422ece436d2ae0e009"), 'template migration guards the live templates_select hash');
ok(/can_access_deal\(t\.deal_id\)/.test(tplMig) && /drop policy templates_select/.test(tplMig), 'template migration adds a can_access_deal branch');
ok(!/create table|alter table|drop table/i.test(tplMig), 'template migration is policy-only');
ok(tplRb.includes('private.is_admin() or private.is_manager()') && tplRb.includes("48e5c19f67a254422ece436d2ae0e009"), 'template rollback restores admin/manager-only select');

// UI warns when canFill but fields are empty (what Francis saw as Save/Mark complete with no questions)
const formSrc = read('js/pages/dealtaskform.js');
ok(formSrc.includes('data-task-no-fields') && formSrc.includes('no form fields yet'), 'task form warns when the template has no fields');
ok(read('js/pages/deal-tab.js').includes('dealtaskform.js?v=202611100245'), 'deal-tab loads dealtaskform at the current stamp');
ok(read('js/pages/deal-buyer-legacy.js').includes('dealtaskform.js?v=202611100245'), 'buyer legacy loads dealtaskform at the current stamp');

// Hosted path still attaches fields when the template row is returned (agent / buyer)
const buyer = { id: 'u-buyer', role: 'Client-Buyer', roles: ['Client-Buyer'] };
const rows = [{
  id: 't-buyer', deal_id: 'deal-1', title: 'Personal information', description: '', assigned_role: 'Client-Buyer', status: 'todo',
  kind: 'form', participant_id: 'p-buyer', owner_profile_id: 'u-buyer', template_id: 'tpl-personal', template_code: 'personal_info', template_version: 1,
}];
const templates = [{ id: 'tpl-personal', code: 'personal_info', version: 1, title: 'Personal information', fields: [{ k: 'first', label: 'First', req: true }] }];
function fakeSb(store) {
  return {
    from(table) {
      const q = { table, filters: [], one: false };
      const api = {
        select() { return api; }, eq(col, val) { q.filters.push([col, val]); return api; }, order() { return api; },
        single() { q.one = true; return api; }, maybeSingle() { q.one = true; return api; },
        then(resolve, reject) {
          try {
            if (table === 'tasks') {
              let found = store.tasks;
              for (const [col, val] of q.filters) found = found.filter((r) => r[col] === val);
              resolve({ data: q.one ? (found[0] || null) : found, error: q.one && !found[0] ? { message: 'missing' } : null });
            } else if (table === 'task_templates') {
              const id = (q.filters.find((f) => f[0] === 'id') || [])[1];
              const hit = store.templates.find((t) => t.id === id) || null;
              resolve({ data: hit, error: null });
            } else resolve({ data: null, error: { message: 'unexpected ' + table } });
          } catch (e) { reject(e); }
        },
      };
      return api;
    },
    rpc(name, args) {
      if (name === 'get_task_form') return Promise.resolve({ data: { first: '' }, error: null });
      if (name === 'deal_contacts') return Promise.resolve({ data: [{ profile_id: 'u-buyer', participant_id: 'p-buyer' }], error: null });
      return Promise.resolve({ data: null, error: { message: 'rpc ' + name } });
    },
  };
}
const opened = await fetchHostedTask(fakeSb({ tasks: rows, templates }), 't-buyer', buyer);
ok(opened.canFill && opened.fields.some((f) => f.k === 'first') && opened.template.code === 'personal_info', 'getTask still attaches template fields when the row is readable');

const deniedTpl = fakeSb({ tasks: rows, templates: [] }); // RLS miss: maybeSingle returns null
const empty = await fetchHostedTask(deniedTpl, 't-buyer', buyer);
ok(empty.canFill && (!empty.fields || empty.fields.length === 0) && !empty.template, 'when the template row is refused, fields stay empty (FF-NEW-1 symptom)');

// ---- V-9: HR Employee backfill ----
const hrMig = read('supabase/migrations/20261110024100_hr_portal_role_backfill.sql');
const hrRb = read('supabase/rollbacks/20261110024100_hr_portal_role_backfill.sql');
ok(hrMig.includes("34186fdfe90c71369b8feebdde6fdb1a") && hrMig.includes("ec593ca11b9a77e302ff6529e195af1b"), 'HR migration guards live accept-function hashes');
ok(/update public\.profiles p[\s\S]*role = 'Employee'[\s\S]*Transaction Coordinator'/.test(hrMig), 'HR migration backfills stuck Employee profiles from designation');
ok(/p\.status = 'active'[\s\S]*p\.role = 'Employee'[\s\S]*hr_portal_role_for\(e\.designation_id\) in \('Processor', 'Preprocessor', 'Sales Person', 'Transaction Coordinator'\)/.test(hrMig), 'backfill updates only an active Employee whose designation maps to a staff portal role');
ok(/pr\.role = 'Employee' and mapped in \('Processor', 'Preprocessor', 'Sales Person', 'Transaction Coordinator'\)/.test(hrMig) && /set role = mapped where id = p_user and role = 'Employee'/.test(hrMig) && /set role = mapped where id = me and role = 'Employee'/.test(hrMig), 'accept paths upgrade only a linked Employee and are idempotent');
ok((hrMig.match(/mapped := private\.hr_portal_role_for\(e\.designation_id\)/g) || []).length === 2, 'both accept paths upgrade a linked Employee');
ok(!/is_admin\s*=/.test(hrMig) && !/role = 'Admin'/.test(hrMig) && !/role = 'Super admin'/.test(hrMig), 'HR migration never assigns Admin / Super admin');
ok(hrRb.includes('Does NOT undo the one-shot') && hrRb.includes("34186fdfe90c71369b8feebdde6fdb1a"), 'HR rollback restores functions and leaves the backfill');

console.log(fail ? fail + ' failed' : 'francis triage nov9 passed');
if (fail) process.exit(1);
