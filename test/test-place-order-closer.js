/* Closer on Place Order, Team & Notes. Same column as Edit order details. Fake staff only. No network. */
import { readFileSync } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { resolveCloser, closerChoices } from '../js/data/closer.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const page = readFileSync(new URL('../js/pages/ordernew.js', import.meta.url), 'utf8');
const teamAt = page.indexOf("panel('team'");
const reviewAt = page.indexOf("panel('review'");
const closerAt = page.indexOf('data-closer-input');
ok(teamAt > 0 && reviewAt > teamAt && closerAt > teamAt && closerAt < reviewAt, 'the Closer box is on the Team & Notes step');
ok(page.includes('list="place-closer-staff"') && page.includes('resolveCloser') && page.includes("['Closer', val(f.closerName)]"), 'Place Order uses the staff list, free text, and shows the closer on review');
ok(page.includes('closerName: placedCloser.closerName') && page.includes('closerProfileId: placedCloser.closerProfileId'), 'placing the order sends the resolved closer to createDeal');

const storage = mem();
const a = createMockAdapter({ storage, sessionStorage: mem() });
await a.signInDev('u-proc');
const staff = await a.listActiveStaff();
const choices = closerChoices(staff);
const picked = resolveCloser('Paula Processor (Processor)', choices);
ok(picked.closerProfileId === 'u-proc' && picked.closerName === 'Paula Processor', 'the Place Order label resolves to the same person as Edit order details');
const made = await a.createDeal({ street: '5 Closer Lane', city: 'Rockville', state: 'MD', zip: '20850', processorId: 'u-proc', openDate: '2026-11-01', closerName: picked.closerName, closerProfileId: picked.closerProfileId });
ok(made.closerName === 'Paula Processor' && made.closerProfileId === 'u-proc', 'the new file comes back with that closer');
const typed = await a.createDeal({ street: '6 Typed Closer Rd', city: 'Rockville', state: 'MD', zip: '20850', processorId: 'u-proc', openDate: '2026-11-01', closerName: 'Weekend closer Pat' });
ok(typed.closerName === 'Weekend closer Pat' && !typed.closerProfileId, 'a typed closer is stored with no staff id');
const again = createMockAdapter({ storage, sessionStorage: mem() });
await again.signInDev('u-proc');
const reloaded = await again.getDeal(made.id);
ok(reloaded.closerName === 'Paula Processor' && reloaded.closerProfileId === 'u-proc', 'the closer is still on the file after a new read');
const blank = await again.createDeal({ street: '7 No Closer Way', city: 'Rockville', state: 'MD', zip: '20850', processorId: 'u-proc', openDate: '2026-11-01' });
ok(!blank.closerName && !blank.closerProfileId, 'leaving Closer blank does not invent one');

const adapter = readFileSync(new URL('../js/data/supabase-adapter.js', import.meta.url), 'utf8');
ok(adapter.includes('row.closer_name') && adapter.includes('row.closer_profile_id') && adapter.includes("closerName: 'closer_name'"), 'hosted place and edit write deals.closer_name and deals.closer_profile_id');

console.log(fail ? fail + ' failed' : 'place order closer passed');
if (fail) process.exit(1);
