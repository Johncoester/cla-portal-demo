/* Scratch Postgres only. 110k fake leads. Does not connect to TEST or production.
 * Old and new note matching must pick the same lead, including the archived and created_at tie-break.
 * A 500-row note preview on the new function must finish in under 1 second. */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

if (typeof process.getuid === 'function' && process.getuid() === 0) {
  const again = spawnSync('unshare', ['--user', '--map-user=1000', '--map-group=1000', process.execPath, ...process.execArgv, ...process.argv.slice(1)], { stdio: 'inherit' });
  process.exit(again.status === null ? 1 : again.status);
}

const root = new URL('..', import.meta.url).pathname;
const bin = existsSync('/usr/lib/postgresql/16/bin/initdb') ? '/usr/lib/postgresql/16/bin' : '/usr/lib/postgresql/17/bin';
const data = mkdtempSync(join(tmpdir(), 'cla-import-fast-'));
const port = '55497';
const db = 'importfast';
const sqlDir = join(root, 'test/sql/crm-import-fast-match');
const OLD_MD5 = 'e5c509d25c438940c4d497d35b7dc485';
const NEW_MD5 = '8a1c2abfae3e8b4329d592790a3cc3d0';
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };

function run(args, timeout = 180000) {
  const p = spawnSync(args[0], args.slice(1), { encoding: 'utf8', timeout });
  if (p.status !== 0) {
    console.error(p.stdout);
    console.error(p.stderr);
    throw new Error(args.slice(0, 3).join(' ') + ' failed');
  }
  return p;
}
const psqlArgs = ['-h', data, '-p', port, '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-X'];
const psql = (sql, timeout) => run([`${bin}/psql`, ...psqlArgs, '-t', '-A', '-c', sql], timeout);
const psqlFile = (file, timeout) => run([`${bin}/psql`, ...psqlArgs, '-f', file], timeout);
const one = (sql) => psql(sql).stdout.trim();

const oldMig = readFileSync(join(root, 'supabase/migrations/20261125110000_crm_import_preview_row_errors.sql'), 'utf8');
const oldStart = oldMig.indexOf('create or replace function public.crm_import_batch(');
const oldEnd = oldMig.indexOf('revoke all on function public.crm_import_batch');
const oldFn = oldMig.slice(oldStart, oldEnd);
const fastMig = readFileSync(join(root, 'supabase/migrations/20261125120000_crm_import_fast_lead_match.sql'), 'utf8');
const rollback = readFileSync(join(root, 'supabase/rollbacks/20261125120000_crm_import_fast_lead_match.sql'), 'utf8');
ok(fastMig.includes(OLD_MD5) && fastMig.includes('create index if not exists crm_leads_import_email_idx'), 'migration guards the post-314 body and creates the index if it is missing');
ok(!fastMig.split('\n').some((line) => /create\s+index\s+concurrently/i.test(line) && !line.trim().startsWith('--')), 'CONCURRENTLY is only in the instructions, not in the transaction');
ok(rollback.includes(NEW_MD5) && rollback.includes('drop index if exists public.crm_leads_import_email_idx'), 'rollback requires the fast body and drops the new indexes');
ok(!/^create or replace function private\./m.test(fastMig) && !/^create policy/im.test(fastMig) && !/^create policy/im.test(rollback), 'no private helper and no policy change');

run([`${bin}/initdb`, '-D', data, '-U', 'postgres', '--auth-local=trust', '--no-instructions', '--no-sync']);
const start = spawnSync(`${bin}/pg_ctl`, ['-D', data, '-o', `-p ${port} -k ${data} -c listen_addresses=`, '-w', 'start'], { encoding: 'utf8', timeout: 60000 });
if (start.status !== 0) throw new Error(start.stderr || 'pg_ctl start failed');

try {
  run([`${bin}/psql`, '-h', data, '-p', port, '-U', 'postgres', '-d', 'postgres', '-c', `create database ${db}`]);
  psqlFile(join(sqlDir, 'fixture.sql'), 180000);
  ok(one(`select count(*) from public.crm_leads where notes = 'TEST-SEED-SCALE'`) === '110000', '110000 fake leads are loaded');
  psql(oldFn);
  ok(one(`select md5(prosrc) from pg_proc where proname = 'crm_import_batch'`) === OLD_MD5, 'installed body md5 is ' + OLD_MD5 + ' and starts with e5c509d2');

  psqlFile(join(sqlDir, 'before.sql'), 180000);
  ok(true, 'old note preview matches the tie-break cases');
  console.log('lookup_loop_before_ms', one(`select ms from public.scratch_log where label = 'lookup_loop_before'`));
  console.log('notes_before_ms', one(`select ms from public.scratch_log where label = 'notes_before'`));
  console.log('EXPLAIN one before:\n' + one(`select plan from public.scratch_log where label = 'explain_one_before'`));

  psqlFile(join(root, 'supabase/migrations/20261110040001_crm_person_dup_hand_change.sql'));
  psql(`create trigger crm_leads_person_dup before insert or update of email, phone on public.crm_leads for each row execute function private.crm_person_dup()`);
  psqlFile(join(sqlDir, 'people.sql'), 300000);
  ok(true, 'person duplicate probes use the existing email and phone indexes');
  console.log('people_10000_before_ms', one(`select ms from public.scratch_log where label = 'people_10000_before'`));
  console.log('people_10000_before', one(`select detail::text from public.scratch_log where label = 'people_10000_before'`));
  console.log('EXPLAIN dup email:\n' + one(`select plan from public.scratch_log where label = 'explain_dup_email'`));
  console.log('EXPLAIN dup phone:\n' + one(`select plan from public.scratch_log where label = 'explain_dup_phone'`));

  psqlFile(join(root, 'supabase/migrations/20261125120000_crm_import_fast_lead_match.sql'));
  ok(one(`select md5(prosrc) from pg_proc where proname = 'crm_import_batch'`) === NEW_MD5, 'fast body md5 is ' + NEW_MD5);
  ok(one(`select to_regclass('public.crm_leads_import_email_idx') is not null and to_regclass('public.contacts_import_email_idx') is not null`) === 't', 'both import email indexes exist');

  psqlFile(join(sqlDir, 'after.sql'), 300000);
  ok(true, 'new previews match the old rows, and the 500-row note preview is under 1 second');
  console.log('notes_after_ms', one(`select ms from public.scratch_log where label = 'notes_after'`));
  console.log('lookup_loop_after_ms', one(`select ms from public.scratch_log where label = 'lookup_loop_after'`));
  console.log('clients_after_ms', one(`select ms from public.scratch_log where label = 'clients_after'`));
  console.log('people_10000_after_ms', one(`select ms from public.scratch_log where label = 'people_10000_after'`));
  console.log('EXPLAIN one after:\n' + one(`select plan from public.scratch_log where label = 'explain_one_after'`));
  console.log('EXPLAIN set after:\n' + one(`select plan from public.scratch_log where label = 'explain_set_after'`));

  const second = spawnSync(`${bin}/psql`, [...psqlArgs, '-f', join(root, 'supabase/migrations/20261125120000_crm_import_fast_lead_match.sql')], { encoding: 'utf8', timeout: 60000 });
  ok(second.status !== 0 && /drift: crm_import_batch md5/.test(`${second.stdout}${second.stderr}`), 'applying the file again is refused');

  psqlFile(join(root, 'supabase/rollbacks/20261125120000_crm_import_fast_lead_match.sql'));
  ok(one(`select md5(prosrc) from pg_proc where proname = 'crm_import_batch'`) === OLD_MD5, 'rollback restores md5 ' + OLD_MD5);
  ok(one(`select to_regclass('public.crm_leads_import_email_idx') is null and to_regclass('public.contacts_import_email_idx') is null`) === 't', 'rollback drops both import email indexes');
  psql(`
    do $$
    declare t0 timestamptz := clock_timestamp(); r jsonb;
    begin
      r := public.crm_import_batch(false, 'leads', 'notes', 'notes.csv', '[]'::jsonb, (select rows from public.scratch_payload where name = 'notes'));
      insert into public.scratch_log(label, ms, body) values ('notes_rollback', round(1000 * extract(epoch from clock_timestamp() - t0), 3), r->'rows');
      if r->'rows' is distinct from (select body from public.scratch_log where label = 'notes_before') then
        raise exception 'rolled-back preview does not match the original rows';
      end if;
    end $$;
  `, 180000);
  ok(true, 'the restored function picks the same note rows as the first run');

  const rollbackAgain = spawnSync(`${bin}/psql`, [...psqlArgs, '-f', join(root, 'supabase/rollbacks/20261125120000_crm_import_fast_lead_match.sql')], { encoding: 'utf8', timeout: 60000 });
  ok(rollbackAgain.status !== 0 && /not the fast-match body/.test(`${rollbackAgain.stdout}${rollbackAgain.stderr}`), 'rollback refuses to run once the old body is back');

  psqlFile(join(root, 'supabase/migrations/20261125120000_crm_import_fast_lead_match.sql'));
  ok(one(`select md5(prosrc) from pg_proc where proname = 'crm_import_batch'`) === NEW_MD5, 'the migration applies again after rollback');
} finally {
  spawnSync(`${bin}/pg_ctl`, ['-D', data, '-m', 'immediate', 'stop'], { encoding: 'utf8' });
  rmSync(data, { recursive: true, force: true });
}

if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('all ok');
