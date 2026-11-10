/* Remaining batch items: processor role from HR, address fill, template Cc, task upload visibility. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { fillProperty } from '../js/data/address-fill.js';
import { applyFileTemplate, cleanTemplateInput } from '../js/data/file-email-templates.js';
import { recipientsAfterTemplate } from '../js/pages/dealemail.js';
import { taskUploadVisibility } from '../js/data/supabase-staff.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const read = (p) => readFileSync(p, 'utf8');

const filled = await fillProperty({ street: '10 Oak Street, Rockville, MD 20850', city: '', state: '', zip: '', county: '' });
ok(filled.city === 'Rockville' && filled.state === 'MD' && filled.zip === '20850' && filled.county === 'Montgomery', 'a full street line fills city, state, ZIP and county');
ok(filled.street === '10 Oak Street', 'the street box keeps the street');
const kept = await fillProperty({ street: '10 Oak Street, Rockville, MD 20850', city: 'Bethesda', state: 'MD', zip: '20814', county: 'Frederick' });
ok(kept.city === 'Bethesda' && kept.zip === '20814' && kept.county === 'Frederick', 'a value already typed stays');
const addr = read('js/data/address-fill.js');
ok(addr.includes("addEventListener('blur'") && addr.includes('setTimeout(run, 400)') && !addr.includes("addEventListener('input'"), 'address fill runs on blur or a short delay, not each keystroke');
ok(read('js/pages/parcel-fields.js').includes('data-add-parcel') && read('js/pages/ordernew.js').includes('bindAddressFill'), 'Place Order fills the address and still has + Parcel ID');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-admin');
const roleOf = async (id) => ((await api.adminListUsers()).find((u) => u.id === id) || {}).role;
ok(await roleOf('u-ph1') === 'Employee', 'the HR Processor login starts as Employee');
await api.updateHrEmployee('hre-09', { designationId: 'hrg-proc' });
ok(await roleOf('u-ph1') === 'Processor', 'saving the Processor designation gives a normal Processor login');
ok(await roleOf('u-proc') === 'Processor', 'a Processor whose designation is Processing Manager stays a Processor');
await api.updateHrEmployee('hre-02', { jobTitle: 'Processing Manager' });
ok(await roleOf('u-proc') === 'Processor', 'editing that Processor does not take the role away');
ok(await roleOf('u-admin') === 'Super admin', 'a Super admin is not rewritten');
await api.updateHrEmployee('hre-09', { designationId: 'hrg-md' });
ok(await roleOf('u-ph1') === 'Employee', 'changing a Processor designation to an unmapped title returns the login to Employee');
await api.updateHrEmployee('hre-09', { designationId: 'hrg-proc' });
ok(await roleOf('u-ph1') === 'Processor', 'pointing the designation back at Processor restores that role');
await api.archiveHrEmployee('hre-09', true);
ok(await roleOf('u-ph1') === 'Employee', 'archiving the employee returns those four roles to Employee');
await api.updateHrEmployee('hre-01', { designationId: 'hrg-proc' });
ok(await roleOf('u-admin') === 'Super admin', 'giving the Super admin a Processor designation does not change that login');
const hrSql = read('supabase/migrations/20261112060500_hr_processor_role.sql');
ok(hrSql.includes('private.effective_uid()') && hrSql.includes('private.is_admin()') && hrSql.includes("'Employee'"), 'the role sync skips the caller unless they are an admin, and a removed designation returns Employee');

const deal = { participants: [
  { role: 'Client-Buyer', contact: { firstName: 'Ben', lastName: 'Buyer', email: 'ben.buyer@example.test' } },
  { role: 'Buyer Agent', contact: { firstName: 'Bianca', lastName: 'Agent', email: 'bianca.agent@example.test' } },
] };
const applied = applyFileTemplate({
  subject: 'Hello', bodyHtml: '<p>Hi</p>', defaultRecipientRoles: ['Client-Buyer'], defaultCcRoles: ['Buyer Agent'],
}, deal, { firstName: 'Paula', lastName: 'Processor' });
ok(applied.suggestedTo.join() === 'ben.buyer@example.test' && applied.suggestedCc.join() === 'bianca.agent@example.test', 'a template can suggest To and Cc');
ok(recipientsAfterTemplate('kept@example.test', applied.suggestedTo, { fillIfEmpty: false }).join() === 'kept@example.test', 'an address already in To stays');
ok(recipientsAfterTemplate('', applied.suggestedCc, { fillIfEmpty: true }).join() === 'bianca.agent@example.test', 'an empty Cc takes the template suggestion');
const cleaned = cleanTemplateInput({ name: 'Intro', subject: 'Hi', bodyHtml: '<p>Hi</p>', defaultRecipientRoles: ['Client-Buyer'], defaultCcRoles: ['Buyer Agent', 'nope'] });
ok(cleaned.defaultCcRoles.join() === 'Buyer Agent', 'Cc roles keep only real file roles');
const mail = read('js/pages/dealemail.js');
ok(mail.includes('data-mail-drop') && mail.includes('data-mail-put') && mail.includes('introTemplate') && mail.includes('Connect Gmail on Profile Setting first'), 'Processor Intro compose can add and remove To and Cc, and a disconnected Gmail says so');
ok(mail.includes("gmail.connected ? '' : raw('disabled"), 'Send stays off until Gmail is connected');

ok(taskUploadVisibility('Client-Buyer') === 'buyer' && taskUploadVisibility('Client-Seller') === 'seller', 'a client ID upload is that side');
ok(taskUploadVisibility('Processor') === 'staff', 'a staff task upload stays staff');
ok(read('js/data/supabase-staff.js').includes('insert(row)') && !read('js/data/supabase-staff.js').includes(".insert(row).select()"), 'the task upload does not ask the buyer to read the new row back');

for (const name of ['20261112060500_hr_processor_role', '20261112060600_client_doc_visibility', '20261112060700_template_cc_roles']) {
  const sql = read(`supabase/migrations/${name}.sql`);
  const roll = read(`supabase/rollbacks/${name}.sql`);
  ok(!/create policy|alter policy/i.test(sql), `${name} adds no RLS policy`);
  console.log(name + '-sha256', createHash('sha256').update(sql).digest('hex'));
  console.log(name + '-rollback-sha256', createHash('sha256').update(roll).digest('hex'));
}

if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('batch rest passed');
