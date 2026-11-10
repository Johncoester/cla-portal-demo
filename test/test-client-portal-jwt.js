/* Client task fields, Share with CLA Title, and Share Files recipients.
   Run: node test/test-client-portal-jwt.js */
import { readFileSync } from 'node:fs';
import { visibilityChoices, visibilityLabel, clientShareVisibility, BUYER_SHARE_NOTE } from '../js/data/constants.js';
import { fetchHostedTask } from '../js/data/task-actions.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

ok(visibilityChoices('Client-Buyer').join() === 'buyer' && visibilityChoices('Client-Seller').join() === 'seller', 'a buyer or seller has one share choice: their own side');
ok(visibilityLabel('buyer', 'Client-Buyer') === 'Share with CLA Title' && visibilityLabel('seller', 'Client-Seller') === 'Share with CLA Title', 'that choice is labeled Share with CLA Title');
ok(clientShareVisibility('Client-Buyer', 'staff') === 'buyer' && clientShareVisibility('Client-Seller', 'staff') === 'seller', 'an old staff choice from a client is stored as their own side');
ok(clientShareVisibility('Buyer Agent', 'staff') === 'staff' && visibilityChoices('Buyer Agent').includes('staff'), 'an agent staff upload is unchanged');
ok(!visibilityChoices('Client-Buyer').includes('seller') && !visibilityChoices('Client-Seller').includes('buyer'), 'a client is not offered the other side');
ok(/own agent/.test(BUYER_SHARE_NOTE) && !/not your agent/.test(BUYER_SHARE_NOTE), 'the buyer note says their agent can see Share with CLA Title');

const mig = read('supabase/migrations/20261110101500_client_task_docs_share.sql');
const rb = read('supabase/rollbacks/20261110101500_client_task_docs_share.sql');
ok(mig.includes('a3a064f1b89958df87237c77ab7e2897') && mig.includes('cb12eb623f848eebd272ef91bb7622df'), 'the migration guards the live recipient and thread hashes');
ok(/deal_cla_staff/.test(mig) && /Client-Buyer', 'Client-Seller'/.test(mig) && /get_task_template/.test(mig), 'the migration adds CLA staff, the client share rewrite, and the template fallback');
ok(!/drop policy/i.test(mig) && !/create policy documents_assigned_agent_insert/i.test(mig), 'agent document policies are not rewritten');
ok(rb.includes('a3a064f1b89958df87237c77ab7e2897') && /drop trigger zzz_client_share_visibility/.test(rb) && /drift/.test(rb), 'the rollback restores the previous functions and refuses to run twice');

const buyer = { id: 'u-buyer', role: 'Client-Buyer', roles: ['Client-Buyer'] };
const row = {
  id: 't-buyer', deal_id: 'deal-1', title: 'Upload photo ID', description: '', assigned_role: 'Client-Buyer', status: 'todo',
  kind: 'form', participant_id: 'p-buyer', owner_profile_id: 'u-buyer', template_id: 'tpl-id', template_code: 'id_upload', template_version: 1,
};
function fakeSb(store) {
  return {
    from(table) {
      const q = { filters: [] };
      const api = {
        select() { return api; }, eq(col, val) { q.filters.push([col, val]); return api; }, order() { return api; },
        single() { q.one = true; return api; }, maybeSingle() { q.one = true; return api; },
        then(resolve, reject) {
          try {
            if (table === 'tasks') {
              const found = store.tasks.filter((r) => q.filters.every(([c, v]) => r[c] === v));
              resolve({ data: found[0] || null, error: found[0] ? null : { message: 'missing' } });
            } else if (table === 'task_templates') {
              const id = (q.filters.find((f) => f[0] === 'id') || [])[1];
              resolve({ data: (store.templates || []).find((t) => t.id === id) || null, error: null });
            } else resolve({ data: null, error: { message: 'unexpected' } });
          } catch (e) { reject(e); }
        },
      };
      return api;
    },
    rpc(name) {
      if (name === 'get_task_form') return Promise.resolve({ data: {}, error: null });
      if (name === 'deal_contacts') return Promise.resolve({ data: [{ profile_id: 'u-buyer', participant_id: 'p-buyer' }], error: null });
      if (name === 'get_task_template') return Promise.resolve({ data: store.rpc || null, error: store.rpc ? null : { message: 'hidden' } });
      return Promise.resolve({ data: null, error: { message: name } });
    },
  };
}
const fromRow = await fetchHostedTask(fakeSb({ tasks: [row], templates: [{ id: 'tpl-id', code: 'id_upload', version: 1, title: 'Upload photo ID', fields: [{ k: 'id_document', type: 'doc', label: 'ID document' }] }] }), 't-buyer', buyer);
ok(fromRow.canFill && fromRow.fields.some((f) => f.k === 'id_document') && fromRow.template.code === 'id_upload', 'a readable template row still fills the client task');
const fromRpc = await fetchHostedTask(fakeSb({ tasks: [row], templates: [], rpc: { id: 'tpl-id', code: 'id_upload', version: 1, title: 'Upload photo ID', fields: [{ k: 'id_document', type: 'doc', label: 'ID document' }] } }), 't-buyer', buyer);
ok(fromRpc.fields.some((f) => f.k === 'id_document') && fromRpc.template.version === 1, 'when the template select is empty, get_task_template supplies the fields');

const form = read('js/pages/dealtaskform.js');
ok(form.includes('t.templateCode') && form.includes('template ${tplLabel}'), 'the detail line uses the task version when the template row is missing');

console.log(fail ? fail + ' failed' : 'client portal jwt js passed');
if (fail) process.exit(1);
