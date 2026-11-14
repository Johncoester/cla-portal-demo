/* PROC-1 (John, Nov 14 2026, recording "Adding a processor").
 * Contacts and File Overview must show the same Processor. Fake people only. No network. */
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { buildOrderOverview } from '../js/data/order-overview.js';
import { PROCESSOR_NO_LOGIN } from '../js/data/processor-party.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let pass = 0, fails = 0;
const ok = (c, name) => { if (c) pass++; else { fails++; console.log('FAIL', name); } };
const rejects = async (p, name, re) => { try { await p(); ok(false, name + ' (should have failed)'); } catch (e) { ok(!re || re.test(e.message), name + ' [' + e.message + ']'); } };

const store = mem();
const a = createMockAdapter({ storage: store, sessionStorage: mem() });
await a.signInDev('u-proc');
const made = await a.createDeal({ street: '1 Processor Sync Lane', city: 'Rockville', state: 'MD', zip: '20850', openDate: '2026-11-01' });
const file = await a.getDeal(made.id);
ok(!file.processorId && !file.participants.some((p) => p.role === 'Processor'), 'a new file can be saved with no Processor');

const empty = buildOrderOverview({ deal: { ...file, processorId: null, processorName: '' }, me: { id: 'u-proc', role: 'Processor' }, tasks: [], documents: [], threads: [], activity: [] });
ok((empty.parties.find((p) => p.label === 'Processor') || {}).name === 'Not specified', 'File Overview says Not specified when the file has no processor');

await a.addParticipant(file.id, 'c-admin', 'Processor');
const added = await a.getDeal(file.id);
const procRow = added.participants.find((p) => p.role === 'Processor');
ok(added.processorId === 'u-admin' && procRow && procRow.contactId === 'c-admin', 'adding a Super admin on Contacts sets the file Processor');
const shown = buildOrderOverview({ deal: added, me: { id: 'u-proc', role: 'Processor' }, tasks: [], documents: [], threads: [], activity: [] });
ok((shown.parties.find((p) => p.label === 'Processor') || {}).name === 'King John Admin', 'File Overview shows the Processor added on Contacts');

await a.addParticipant(file.id, 'c-sp', 'Processor');
const replaced = await a.getDeal(file.id);
ok(replaced.processorId === 'u-sp' && replaced.participants.filter((p) => p.role === 'Processor').length === 1 && replaced.participants.some((p) => p.role === 'Processor' && p.contactId === 'c-sp'), 'a Sales Person can replace the Processor, and Contacts keeps one Processor row (ANYROLE-1)');

const spRow = replaced.participants.find((p) => p.role === 'Processor');
await a.removeParticipant(file.id, spRow.id);
const cleared = await a.getDeal(file.id);
ok(!cleared.processorId && !cleared.participants.some((p) => p.role === 'Processor'), 'removing the Processor from Contacts clears the file Processor');

await a.updateDeal(file.id, { processorId: 'u-admin' });
const fromEdit = await a.getDeal(file.id);
ok(fromEdit.processorId === 'u-admin' && fromEdit.participants.some((p) => p.role === 'Processor' && p.contactId === 'c-admin'), 'setting the Processor on the order shows that person on Contacts');

await a.updateDeal(file.id, { processorId: '' });
const blank = await a.getDeal(file.id);
ok(!blank.processorId && !blank.participants.some((p) => p.role === 'Processor'), 'clearing the Processor on the order takes them off Contacts');

await rejects(() => a.addParticipant(file.id, 'c-cora', 'Processor'), 'NEG a person with no portal login cannot be the Processor', new RegExp(PROCESSOR_NO_LOGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
const still = await a.getDeal(file.id);
ok(!still.processorId && !still.participants.some((p) => p.role === 'Processor'), 'a refused Processor is not left on the file');

await rejects(() => a.addParticipant(file.id, 'c-buyer', 'Processor'), 'NEG an outside user cannot be the Processor', /outside user cannot be added as CLA staff/);

const mig = readFileSync(new URL('../supabase/migrations/20261122180000_processor_party_sync.sql', import.meta.url), 'utf8');
const rb = readFileSync(new URL('../supabase/rollbacks/20261122180000_processor_party_sync.sql', import.meta.url), 'utf8');
ok(mig.includes('participants_processor_sync') && mig.includes('deals_processor_party') && mig.includes('private.processor_backfill_fake') && mig.includes('@example') && mig.includes('ANYROLE-1'), 'the database file syncs both ways and limits the copy to fake patterns');
ok(mig.includes("role in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin')") && mig.includes('A person with no portal login cannot be the Processor'), 'the database file keeps the any-staff Processor rule');
ok(!mig.includes('bxixxgcqxmtzkrolywas'), 'the database file does not name the production project');
ok(rb.includes('drop trigger if exists participants_processor_sync') && rb.includes('drop function if exists private.processor_backfill_fake') && rb.includes('left as they are'), 'the rollback drops the sync and says the copied rows stay');

console.log(fails ? `processor-party: ${fails} failed` : `processor-party: ${pass} passed`);
if (fails) process.exit(1);
