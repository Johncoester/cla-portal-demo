/* ANYROLE-1 (John, call + chat 3:07 PM ET Nov 13). Any active staff login can be
 * the file's Processor, salesperson, Transaction Coordinator, or a party.
 * Fake people only. No network. */
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { processorChoices, PROCESSOR_PICK_ROLES, SALES_PICK_ROLES, tidyPersonName } from '../js/data/place-order.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let pass = 0, fails = 0;
const ok = (c, name) => { if (c) pass++; else { fails++; console.log('FAIL', name); } };
const rejects = async (p, name, re) => { try { await p(); ok(false, name + ' (should have failed)'); } catch (e) { ok(!re || re.test(e.message), name + ' [' + e.message + ']'); } };
const ORDER = { street: '17 Any Role Lane', city: 'Rockville', state: 'MD', zip: '20850', openDate: '2026-11-01' };

const names = tidyPersonName({ firstName: 'John ', lastName: 'Coester' });
ok(names.firstName === 'John' && names.lastName === 'Coester' && names.name === 'John Coester', 'trailing spaces are trimmed in displayed names');
const you = processorChoices([{ id: 'u-admin', firstName: 'John ', lastName: 'Coester', role: 'Super admin', email: 'j@test' }], '', 'u-admin');
ok(you.options.some((o) => o.value === 'u-admin' && o.label.includes('(you)') && o.label.includes('John Coester') && !o.label.includes('John  Coester')), 'the Processor list labels the signed-in Super admin as (you) and does not keep a double space');

const staffRoles = ['Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin'];
ok(staffRoles.every((r) => PROCESSOR_PICK_ROLES.includes(r) && SALES_PICK_ROLES.includes(r)), 'Processor and sales pickers use every staff role');

const store = mem();
const a = createMockAdapter({ storage: store, sessionStorage: mem() });
const as = async (id) => { await a.signInDev(id); return a; };

await as('u-admin');
const procs = await a.listProcessors();
ok(procs.some((p) => p.id === 'u-admin') && procs.some((p) => p.id === 'u-sp') && procs.some((p) => p.id === 'u-tc'), 'a Super admin sees themselves, a salesperson and a TC in the Processor list');
const sales = await a.listSalesStaff();
ok(sales.some((s) => s.id === 'u-admin') && sales.some((s) => s.id === 'u-proc'), 'a Super admin and a Processor appear in the salesperson list');
const tcs = await a.listCoordinators();
ok(tcs.some((t) => (t.profileId || t.id) === 'u-admin') && tcs.some((t) => (t.profileId || t.id) === 'u-proc'), 'a Super admin and a Processor appear in the TC list');

const file = await a.createDeal({ ...ORDER, processorId: 'u-admin', salesIds: ['u-proc'] });
ok(file.processorId === 'u-admin' && (file.salesPersonIds || []).includes('u-proc'), 'a Super admin can be the Processor and a Processor can be a salesperson');
const asTc = await a.updateDeal(file.id, { tcUserId: 'u-sp' });
ok(asTc.tcUserId === 'u-sp', 'a Sales Person can be the file Transaction Coordinator');

await a.addParticipant(file.id, 'c-admin', 'Client-Buyer');
ok((await a.getDeal(file.id)).participants.some((p) => p.role === 'Client-Buyer' && p.contactId === 'c-admin'), 'a Super admin can be added as the buyer');

const other = await a.createDeal({ ...ORDER, street: '18 Sales Buyer Rd', processorId: 'u-proc', salesIds: [] });
await a.addParticipant(other.id, 'staff:u-sp', 'Client-Buyer');
ok((await a.getDeal(other.id)).participants.some((p) => p.role === 'Client-Buyer' && (p.contact && p.contact.profileId === 'u-sp' || p.contactId === 'c-sp')), 'a Sales Person can be added as the buyer from the staff picker');

await as('u-sp');
const seen = await a.getDeal(other.id);
ok(seen && seen.id === other.id, 'a Sales Person added as the buyer can open that file');
ok((seen.myRoles || []).includes('Client-Buyer') || seen.myRole === 'Client-Buyer' || (seen.participants || []).some((p) => p.role === 'Client-Buyer' && (p.contact && p.contact.profileId === 'u-sp')), 'the Sales Person is the buyer on that file');

await as('u-proc');
await rejects(() => a.updateDeal(file.id, { processorId: 'u-buyer' }), 'NEG an outside user cannot be the Processor', /active staff login/);
await rejects(() => a.addDealSalesPerson(file.id, 'u-buyer'), 'NEG an outside user cannot be a salesperson', /active staff login|Salesperson not found/);
await rejects(() => a.addParticipant(file.id, 'c-buyer', 'Processor'), 'NEG an outside user cannot be added as CLA staff', /outside user cannot be added as CLA staff/);

const mig = readFileSync(new URL('../supabase/migrations/20261119150000_file_any_staff_roles.sql', import.meta.url), 'utf8');
const rb = readFileSync(new URL('../supabase/rollbacks/20261119150000_file_any_staff_roles.sql', import.meta.url), 'utf8');
ok(mig.includes('ensure_staff_contact') && mig.includes("p.role in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin')") && !mig.includes('The default Owner must be an active Sales Person'), 'the migration opens the file-level guards and adds ensure_staff_contact, and does not change the CRM Owner check');
ok(rb.includes('drop function if exists public.ensure_staff_contact') && rb.includes("p.role in ('Processor', 'Preprocessor', 'Admin', 'Super admin')") && rb.includes("s.role not in ('Sales Person', 'Sales Team')"), 'the rollback restores the previous guards and drops ensure_staff_contact');

console.log(fails ? `file-any-role: ${fails} failed` : `file-any-role: ${pass} passed`);
if (fails) process.exit(1);
