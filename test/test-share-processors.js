/* FF-018: Share Files lists only the processors assigned to the file, with email. */
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { recipientLabel } from '../js/data/message-recipients.js';
import { readFileSync } from 'node:fs';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

ok(recipientLabel({ firstName: 'TEST', lastName: 'PROCESSOR01', email: 'clatestportal+processor@gmail.com', role: 'Processor' }) === 'TEST PROCESSOR01 <clatestportal+processor@gmail.com> (Processor)', 'the picker shows the email beside the name');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-admin');
const extra = await api.adminCreateUser({ firstName: 'Quinn', lastName: 'Otherproc', email: 'quinn.otherproc@example.test', role: 'Processor', phone: '301-555-0199' });
const deal = await api.createDeal({ street: '16 Share Lane', city: 'Rockville', state: 'MD', zip: '20850', processorId: 'u-proc' });
await api.addParticipant(deal.id, 'c-buyer', 'Client-Buyer');
await api.addParticipant(deal.id, 'c-seller', 'Client-Seller');
await api.addParticipant(deal.id, 'c-bagent', 'Buyer Agent');

const procs = async (who) => { await api.signInDev(who); return (await api.listMessageRecipients(deal.id)).filter((p) => p.role === 'Processor' || (p.email || '').includes('processor') || p.id === extra.id || p.id === 'u-proc'); };
const onlyAssigned = (rows, id) => rows.filter((p) => p.role === 'Processor');
const buyerAssigned = onlyAssigned(await procs('u-buyer'));
ok(buyerAssigned.length === 1 && buyerAssigned[0].id === 'u-proc' && buyerAssigned[0].email === 'paula.processor@example.test' && !buyerAssigned.some((p) => p.id === extra.id), 'the buyer is offered only the assigned processor, with that email');
const sellerAssigned = onlyAssigned(await procs('u-seller'));
const agentAssigned = onlyAssigned(await procs('u-bagent'));
ok(sellerAssigned.length === 1 && sellerAssigned[0].id === 'u-proc' && agentAssigned.length === 1 && agentAssigned[0].id === 'u-proc', 'the seller and the buyer agent get that same processor');
await api.signInDev('u-buyer');
const sent = await api.sendMessage({ dealId: deal.id, to: ['u-proc'], subject: 'Shared file', bodyHtml: '<p>Please review the contract.</p>' });
ok(!!sent.id && (sent.participantIds || []).includes('u-proc'), 'sharing with the assigned processor is saved on the file');
let refused = '';
try { await api.sendMessage({ dealId: deal.id, to: [extra.id], subject: 'Nope', bodyHtml: '<p>not assigned</p>' }); } catch (e) { refused = e.message; }
ok(/own side|staff/i.test(refused), 'sharing with a processor who is not on the file is refused');

await api.signInDev('u-admin');
await api.updateDeal(deal.id, { processorId: '' });
const loose = await api.createContact({ firstName: 'Processor', lastName: 'Test 1', email: 'file.processor@example.test', phone: '301-555-0100' });
await api.addParticipant(deal.id, loose.id, 'Processor');
const buyerLoose = onlyAssigned(await procs('u-buyer'));
ok(buyerLoose.length === 0, 'a processor contact with no login is not replaced by every processor');

const sql = readFileSync('supabase/migrations/20261111090000_assigned_processor_share.sql', 'utf8');
ok(/lower\(p\.email\) = lower\(btrim\(c\.email\)\)/.test(sql) && (sql.match(/not exists \(select 1 from public\.deals z where z\.id = d and z\.processor_id is not null\)/g) || []).length === 1, 'the migration matches an assigned processor by email and keeps the all-processors list only as a check that it is gone');
ok(/returns table\(id uuid, first_name text, last_name text, email text/.test(sql), 'the share list returns the email');

console.log(fail ? fail + ' failed' : 'share processors passed');
if (fail) process.exit(1);
