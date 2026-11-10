/* FF-018. A buyer sees only assigned processors who have an email. Fake data only. */
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { readFileSync } from 'node:fs';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-buyer');
const rows = await api.listMessageRecipients('deal-1');
ok(rows.length > 0 && rows.every((r) => r.email && r.role === 'Processor'), 'the buyer share list is processors who have an email');
ok(rows.some((r) => r.id === 'u-proc'), 'the file processor is in the list');
ok(!rows.some((r) => /Agent|Seller|Buyer/.test(r.role) && r.role !== 'Processor'), 'the buyer agent is not in the share list');

await api.signInDev('u-proc');
const staff = await api.listMessageRecipients('deal-1');
ok(staff.some((r) => r.role === 'Buyer Agent' || /Agent/.test(r.role)), 'staff still see the wider list');

const sql = readFileSync('supabase/migrations/20261112060300_outside_processor_picker.sql', 'utf8');
ok(sql.includes("l.profile_role = 'Processor'") && sql.includes("btrim(coalesce(l.email, '')) <> ''") && !sql.includes('private.participant_visible') && !sql.includes('private.can_message'), 'the hosted picker is one set-based filter');

console.log(fail ? fail + ' failed' : 'outside picker passed');
if (fail) process.exit(1);
