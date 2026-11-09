/* MF-011: Closer is a dropdown of active CLA staff that also accepts a typed name. Fake data only. */
import { readFileSync } from 'node:fs';
import { closerChoices, closerInputValue, resolveCloser } from '../js/data/closer.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const staff = [
  { id: 'u-proc', firstName: 'Paula', lastName: 'Processor', role: 'Processor', status: 'active' },
  { id: 'u-sp', firstName: 'Sam', lastName: 'Salesperson', role: 'Sales Person', status: 'active' },
  { id: 'u-buyer', firstName: 'Ben', lastName: 'Buyer', role: 'Outside user', status: 'active' },
  { id: 'u-old', firstName: 'Olivia', lastName: 'Old', role: 'Processor', status: 'disabled' },
  { id: 'a1', firstName: 'Ann', lastName: 'Lee', role: 'Admin', status: 'active' },
  { id: 'a2', firstName: 'Ann', lastName: 'Lee', role: 'Admin', status: 'active' },
];
const choices = closerChoices(staff);
ok(choices.some((c) => c.id === 'u-proc' && c.label === 'Paula Processor (Processor)') && !choices.some((c) => c.id === 'u-buyer' || c.id === 'u-old'), 'the list is active CLA staff only');
ok(choices.filter((c) => c.name === 'Ann Lee').length === 2 && new Set(choices.filter((c) => c.name === 'Ann Lee').map((c) => c.label)).size === 2, 'two staff with the same name stay distinct in the list');

const paula = resolveCloser('Paula Processor (Processor)', choices);
ok(paula.closerProfileId === 'u-proc' && paula.closerName === 'Paula Processor', 'picking a staff label stores that person');
ok(resolveCloser('Paula Processor', choices).closerProfileId === 'u-proc', 'a unique staff name stores that person');
const typed = resolveCloser('Mobile notary Pat', choices);
ok(typed.closerName === 'Mobile notary Pat' && typed.closerProfileId === null, 'a name that is not staff is kept as free text');
ok(resolveCloser('   ', choices).closerName === '' && resolveCloser('   ', choices).closerProfileId === null, 'a blank closer is cleared');
const ambiguous = resolveCloser('Ann Lee', choices);
ok(ambiguous.closerProfileId === null && ambiguous.closerName === 'Ann Lee', 'a shared name without the list label is not assigned to one person');
const kept = resolveCloser('Olivia Old', choices, { closerName: 'Olivia Old', closerProfileId: 'u-old' });
ok(kept.closerProfileId === 'u-old' && kept.closerName === 'Olivia Old', 'an inactive closer stays linked until the name changes');
ok(closerInputValue({ closerProfileId: 'u-proc', closerName: 'Paula Processor' }, choices) === 'Paula Processor (Processor)', 'the box shows the staff list label');
ok(closerInputValue({ closerName: 'Mobile notary Pat', closerProfileId: null }, choices) === 'Mobile notary Pat', 'the box shows a typed name as typed');

const a = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await a.signInDev('u-proc');
const listed = await a.listActiveStaff();
ok(listed.some((s) => s.id === 'u-proc') && listed.every((s) => s.role !== 'Outside user'), 'listActiveStaff is CLA staff');
const saved = await a.updateDeal('deal-1', { closerName: 'Paula Processor (Processor)' });
ok(saved.closerName === 'Paula Processor' && saved.closerProfileId === 'u-proc', 'saving the staff label links Paula');
const free = await a.updateDeal('deal-1', { closerName: 'Weekend closer' });
ok(free.closerName === 'Weekend closer' && free.closerProfileId === null, 'a typed closer is saved with no staff id');
await a.signInDev('u-buyer');
const hidden = await a.getDeal('deal-1');
ok(hidden.closerName === '' && !hidden.closerProfileId, 'a buyer does not receive the closer');

const page = readFileSync(new URL('../js/pages/deal.js', import.meta.url), 'utf8');
const mig = readFileSync(new URL('../supabase/migrations/20261110071500_deal_closer.sql', import.meta.url), 'utf8');
const back = readFileSync(new URL('../supabase/rollbacks/20261110071500_deal_closer.sql', import.meta.url), 'utf8');
ok(page.includes('list="closer-staff"') && page.includes('data-closer') && page.includes('resolveCloser') && page.includes('listActiveStaff'), 'Edit order offers the closer list and free text');
ok(mig.includes("closer_name text not null default ''") && mig.includes('closer_profile_id') && mig.includes("'Sales Person'") && mig.includes('not distinct from old.closer_profile_id') && back.includes('drop column closer_name') && back.includes('drop column closer_profile_id'), 'the migration adds the closer columns and the rollback removes them');

console.log(fail ? `closer: ${fail} failed` : 'closer passed');
if (fail) process.exit(1);
