// FF-070 speed follow-up: thread_people checks access once per file, not once per thread, and the front end only passes the open file's threads.
import { readFileSync } from 'node:fs';
let failed = 0; const ok = (c, m) => { if (!c) { failed++; console.log('FAIL ' + m); } };
const sql = readFileSync(new URL('../supabase/migrations/20261117050000_thread_people_set_based.sql', import.meta.url), 'utf8');
const fn = sql.slice(sql.indexOf('create or replace function public.thread_people'));
ok(/bb27a85f4a3958dabff09720ae967f97/.test(sql), 'the migration refuses to run on an unexpected thread_people');
ok(!/thread_member\(/.test(fn), 'the function no longer calls private.thread_member per thread');
ok(/private\.reader_gate\(\)/.test(fn) && /private\.reader_can_deal\(d\.deal_id/.test(fn), 'the reader gate is read once and file access is checked per file');
ok(/p_threads\[1:200\]/.test(fn), 'still at most 200 thread ids');
ok(/g\.is_processor/.test(fn) && /Transaction Coordinator/.test(fn) && /tp\.profile_id = g\.uid/.test(fn), 'same per-thread rule as thread_member');
ok(/grant execute on function public\.thread_people\(uuid\[\]\) to authenticated/.test(sql) && /from anon/.test(sql), 'same grants');
ok(!/first_name[^\n]*email|phone/.test(fn), 'still only a name and a role');
const nov5 = readFileSync(new URL('../js/data/supabase-nov5.js', import.meta.url), 'utf8');
ok(/eq\('deal_id', dealId\)[\s\S]{0,1500}readThreadPeople\(sb, ids\)/.test(nov5), 'the Messages list passes only the open file\'s threads');
const rb = readFileSync(new URL('../supabase/rollbacks/20261117050000_thread_people_set_based.sql', import.meta.url), 'utf8');
ok(/thread_member/.test(rb), 'the rollback puts back the earlier version');
if (failed) { console.log(failed + ' failed'); process.exit(1); } console.log('thread people speed passed');
