/* CRM module roles. Fake people only. Processor and Preprocessor keep the portal and lose the CRM module. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canUseCrm, CRM_ROLES } from '../js/data/crm.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

ok(CRM_ROLES.join() === 'Sales Person,Sales Team', 'CRM_ROLES is Sales Person and Sales Team');
ok(canUseCrm({ role: 'Sales Person', isAdmin: false }) && canUseCrm({ role: 'Sales Team', isAdmin: false }), 'sales roles keep the CRM');
ok(canUseCrm({ role: 'Admin', isAdmin: true }) && canUseCrm({ role: 'Super admin', isAdmin: true }), 'admins keep the CRM');
ok(!canUseCrm({ role: 'Processor', isAdmin: false }) && !canUseCrm({ role: 'Preprocessor', isAdmin: false }), 'Processor and Preprocessor lose the CRM module');
ok(!canUseCrm({ role: 'Transaction Coordinator', isAdmin: false }) && !canUseCrm({ role: 'Outside user', isAdmin: false }) && !canUseCrm(null), 'TC, outside users, and a signed-out person stay out');

const nonCrm = ['js/pages/ordernew.js', 'js/pages/deal.js', 'js/pages/dealemail.js', 'js/pages/profile.js', 'js/pages/email-templates.js', 'js/data/file-email-templates.js', 'js/data/gmail-email.js', 'js/data/supabase-gmail.js'];
ok(nonCrm.every((rel) => !read(rel).includes('canUseCrm')), 'Place Order, file email, and Profile do not use canUseCrm');
ok(!read('js/pages/dealemail.js').includes('crm_email_folders') && !read('js/pages/email-templates.js').includes('crm_email_templates') && !read('js/data/file-email-templates.js').includes('crm_email_favorites'), 'file email does not read CRM folders, templates, or favorites');
ok(read('js/pages/crm-templates.js').includes('listCrmEmailFolders') && read('js/data/supabase-crm-templates.js').includes("from('crm_email_favorites'"), 'CRM template screens still read folders and favorites');
ok(read('js/data/gmail-email.js').includes("'Processor'") && read('js/data/file-email-templates.js').includes("'Processor'"), 'file email still includes Processor');

const sql = read('supabase/migrations/20261109234000_crm_module_roles.sql');
const rollback = read('supabase/rollbacks/20261109234000_crm_module_roles.sql');
const code = sql.replace(/--[^\n]*/g, '');
ok(code.includes('private.crm_module_user()') && !code.includes('create or replace function private.crm_user'), 'the migration adds crm_module_user and does not replace crm_user');
ok(code.includes("in ('Sales Team')") && !code.includes('create policy') && !code.includes('alter policy'), 'deal scope drops Processor and Preprocessor and no policy changes');
ok(code.includes('private.crm_need') && code.includes('public.crm_deals') && code.includes('public.crm_deal_filters') && code.includes('private.rpc_crm_list_export'), 'CRM page RPCs are the ones that switch');
ok(rollback.includes('if not private.crm_user()') && rollback.includes("'Processor', 'Preprocessor', 'Sales Team'") && rollback.includes('drop function private.crm_module_user()'), 'rollback restores the old gates and drops the new function');
ok(read('supabase/checks/crm_module_roles.sql').includes('crm-mod-proc@example.test') && read('supabase/checks/crm_module_roles.sql').trimEnd().endsWith('rollback;'), 'the check uses fake people and rolls back');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-proc');
let msg = '';
try { await api.listCrmLeads(); } catch (e) { msg = e.message; }
ok(msg === 'The CRM is for CLA staff only.', 'a processor cannot list leads');
await api.signInDev('u-preproc');
msg = '';
try { await api.listCrmLeads(); } catch (e) { msg = e.message; }
ok(msg === 'The CRM is for CLA staff only.', 'a preprocessor cannot list leads');
const orders = await api.listDeals({ status: 'Open' });
ok(orders.length > 0, 'a preprocessor still sees portal orders');
await api.signInDev('u-sp');
const leads = await api.listCrmLeads();
ok(leads.length > 0, 'a sales person still lists leads');

console.log(fail ? fail + ' failed' : 'crm module roles passed');
if (fail) process.exit(1);
