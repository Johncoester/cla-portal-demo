/* FF-070 (Janine's video, Nov 12 "CLA Portal Test - Processor and Seller Screens"; Francis Feedback ticket):
   1) the Messages badge kept its number after a conversation was opened, until a refresh;
   2) a seller saw the processor as "Participant" because profiles row security hides CLA staff from outside users. */
import { readFileSync } from 'node:fs';
import { readThreadPeople, roleText, shapePortalThreads, withThreadPeople } from '../js/data/portal-threads.js';
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const SELLER = 's1'; const PROC = 'p1';
// The seller can read her own profile only; thread_people gives the processor's name and role.
const people = [{ profile_id: PROC, display_name: 'Test Processor01', role: 'Processor' }, { profile_id: SELLER, display_name: 'X07 Test', role: 'Client-Seller' }];
const merged = withThreadPeople([{ id: SELLER, firstName: 'X07', lastName: 'Test', role: 'Outside user' }], people);
const shaped = shapePortalThreads({ threads: [{ id: 't1', subject: 'TEST' }], messages: [{ id: 'm1', threadId: 't1', authorId: PROC, body: 'Hi', createdAt: '2026-11-12T18:00:00Z' }],
  participants: [{ threadId: 't1', profileId: PROC }, { threadId: 't1', profileId: SELLER }], profiles: merged, userId: SELLER })[0];
ok(shaped.lastFrom === 'Test Processor01', 'the seller sees the processor\'s name, not "Participant"');
ok(shaped.participants.find((p) => p.id === PROC).role === 'Processor' && shaped.participants.find((p) => p.id === SELLER).role === 'Seller', 'roles read Processor and Seller');
ok(withThreadPeople([], [{ profile_id: 'x', display_name: null, role: 'Processor' }]).length === 1 && shapePortalThreads({ threads: [{ id: 't' }], messages: [{ id: 'm', threadId: 't', authorId: 'x', createdAt: '1' }], participants: [], profiles: withThreadPeople([], [{ profile_id: 'x', display_name: null, role: 'Processor' }]) })[0].lastFrom === 'Processor', 'with no name on file, the CLA role is shown instead');
ok(withThreadPeople([{ id: 'a', firstName: 'Own', lastName: 'Name', role: 'Processor' }], [{ profile_id: 'a', display_name: 'Other', role: 'Processor' }])[0].firstName === 'Own', 'a profile the viewer can read keeps its own name');
ok(roleText('Client-Buyer') === 'Buyer' && roleText('Listing Agent') === 'Listing agent' && roleText('Processor') === 'Processor' && roleText('Outside user') === 'Outside user', 'role labels');
// the RPC call never throws (migration not applied yet, offline)
let asked = null;
ok((await readThreadPeople({ rpc: async (n, a) => { asked = [n, a]; return { data: people, error: null }; } }, ['t1', 't1', null])).length === 2 && asked[0] === 'thread_people' && asked[1].p_threads.length === 1, 'thread_people is asked once per thread id');
ok((await readThreadPeople({ rpc: async () => ({ data: null, error: { code: '42883' } }) }, ['t1'])).length === 0 && (await readThreadPeople({ rpc: async () => { throw new Error('offline'); } }, ['t1'])).length === 0, 'a missing function or a failed call falls back quietly');
// the migration: name and role only, gated by thread membership
const sql = read('supabase/migrations/20261116140000_thread_people.sql');
ok(/returns table \(profile_id uuid, display_name text, role text\)/.test(sql) && !/email|phone|ssn|birth/i.test(sql.replace(/^--.*$/gm, '')), 'thread_people returns only id, display name and role');
ok(sql.includes('security definer') && sql.includes('private.thread_member(th.id)') && sql.includes('p_threads[1:200]'), 'it only answers for conversations the caller is a member of (at most 200)');
ok(sql.includes('revoke all on function public.thread_people(uuid[]) from anon') && sql.includes('grant execute on function public.thread_people(uuid[]) to authenticated'), 'signed-in users only');
// the badge
const app = read('js/app.js'); const msgs = read('js/pages/dealmsgs.js');
ok(msgs.includes("new CustomEvent('cla:thread-read'") && msgs.indexOf('await api.markThreadRead(t.id)') < msgs.indexOf("cla:thread-read"), 'opening a conversation tells the shell after it is marked read');
ok(app.includes("addEventListener('cla:thread-read'") && app.includes('api.dropFileReads()') && app.includes('seq !== countsSeq'), 'the shell recounts with fresh reads, and an older count read cannot overwrite the new one');
const adapter = read('js/data/supabase-adapter.js'); const nov5 = read('js/data/supabase-nov5.js');
ok(adapter.includes('readThreadPeople(sb, [id])') && nov5.includes('readThreadPeople(sb, ids)'), 'the conversation and the conversation list both use thread_people');
const css = read('css/portal.css'); const msgs = read('js/pages/dealmsgs.js');
ok(msgs.includes('class="reply" data-reply') && css.includes('.reply[data-reply] { display: block; }'), '#20: the reply form stacks full width instead of squeezing the box into a row');
ok(/\.reply\[data-reply\] \.rte-box \{ min-height: 140px; max-height: 60vh; overflow-y: auto;/.test(css), '#20: the reply box starts large and grows up to 60% of the screen');
console.log(fail ? `FAIL ${fail}` : 'all messages sender and badge checks passed');
process.exit(fail ? 1 : 0);
