/* Local equivalence and timing for the staff read one-pass.
   Throwaway Postgres only. No hosted database and no secrets. */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const bin = '/usr/lib/postgresql/16/bin';
const data = mkdtempSync(join(tmpdir(), 'cla-staff-read-'));
const port = '55474';
const proc = '11111111-1111-4111-8111-111111111111';
const deal = '00000000-0000-4000-8000-000000000001';
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };

function run(args, { allowFail = false, timeout = 180000 } = {}) {
  const p = spawnSync(args[0], args.slice(1), { encoding: 'utf8', timeout });
  if (!allowFail && p.status !== 0) {
    console.error(p.stdout);
    console.error(p.stderr);
    throw new Error(args.join(' ') + ' failed');
  }
  return p;
}
const psqlArgs = ['-h', data, '-p', port, '-U', 'postgres', '-d', 'staffread', '-v', 'ON_ERROR_STOP=1', '-X', '-q'];
const psql = (sql, opts = {}) => run([`${bin}/psql`, ...psqlArgs, '-t', '-A', '-c', sql], opts);
const psqlFile = (file, opts = {}) => run([`${bin}/psql`, ...psqlArgs, '-f', file], opts);

function asViewer(id, body) {
  const out = psql(`
    begin;
    select set_config('request.jwt.claim.sub', '${id}', true);
    set local role authenticated;
    ${body}
    rollback;
  `);
  return out.stdout.trim().split('\n').filter((line) => line.includes('|')).join('\n');
}

run([`${bin}/initdb`, '-D', data, '-U', 'postgres', '--auth-local=trust', '--no-instructions']);
const start = spawnSync(`${bin}/pg_ctl`, ['-D', data, '-o', `-p ${port} -k ${data}`, '-w', 'start'], { encoding: 'utf8', timeout: 60000 });
if (start.status !== 0) throw new Error(start.stderr || 'pg_ctl start failed');

try {
  const created = spawnSync(`${bin}/psql`, ['-h', data, '-p', port, '-U', 'postgres', '-d', 'postgres', '-c', 'create database staffread'], { encoding: 'utf8' });
  if (created.status !== 0) throw new Error(created.stderr || 'create database failed');
  psqlFile(join(root, 'test/sql/staff-read/fixture.sql'));

  const oldTitles = psql(`select encode(sha256(convert_to(prosrc, 'UTF8')), 'hex') from pg_proc where oid = 'public.deal_file_titles(uuid)'::regprocedure`).stdout.trim();
  const oldExtras = psql(`select encode(sha256(convert_to(prosrc, 'UTF8')), 'hex') from pg_proc where oid = 'public.deal_list_extras()'::regprocedure`).stdout.trim();
  const oldRoles = psql(`select encode(sha256(convert_to(prosrc, 'UTF8')), 'hex') from pg_proc where oid = 'private.rpc_my_file_roles_full()'::regprocedure`).stdout.trim();
  const oldWrap = psql(`select encode(sha256(convert_to(prosrc, 'UTF8')), 'hex') from pg_proc where oid = 'public.my_file_roles_full()'::regprocedure`).stdout.trim();
  const oldAct = psql(`select encode(sha256(convert_to(qual, 'UTF8')), 'hex') from pg_policies where schemaname = 'public' and tablename = 'activity_log' and policyname = 'activity_select'`).stdout.trim();
  ok(oldTitles === 'af420f7927c8dcda5d4fea12bf32259ecfa9ca7b2f6cb6ad6b40e2c0c301d68d', 'fixture installs the captured deal_file_titles body');
  ok(oldExtras === '2276decea539fd72a3eede982f9d432ff7d6375ae7f4a37dae8dd65a06c4c77e', 'fixture installs the captured deal_list_extras body');
  ok(oldRoles === 'efcdbe573b075ebc7c7a3b021681fb46db1726691bb0530c078a94a07a5330f1', 'fixture installs the captured file-role body');
  ok(oldWrap === '8fdfc76a02f8dd31cceab98281cda43070284530a3efeaa50c191cc24f49209f', 'fixture installs the captured my_file_roles_full wrapper');
  ok(oldAct === 'efeb63a1fc7073af07d5169e9c566b40ed5420fd045dba321f54dd87320b46ee', 'fixture installs the captured activity_select policy');

  const taskPol = psql(`select md5(string_agg(policyname || cmd || coalesce(qual, '') || coalesce(with_check, ''), ',' order by policyname)) from pg_policies where schemaname = 'public' and tablename = 'tasks'`).stdout.trim();
  const viewers = psql(`select id::text || ' ' || label from public.viewer_case order by label`).stdout.trim().split('\n').filter(Boolean).map((line) => {
    const space = line.indexOf(' ');
    return { id: line.slice(0, space), label: line.slice(space + 1) };
  });
  const shot = (id) => asViewer(id, `
    select 'activity|' || coalesce(string_agg(id::text, ',' order by id::text), '') from public.activity_log
    union all
    select 'titles|' || coalesce(string_agg(deal_id::text || '=' || coalesce(file_title, ''), ',' order by deal_id::text), '') from public.deal_file_titles(null)
    union all
    select 'extras|' || coalesce(string_agg(deal_id::text || '=' || overdue_tasks::text || '=' || coalesce((select string_agg(n, '|' order by n) from unnest(party_names) n), ''), ',' order by deal_id::text), '') from public.deal_list_extras()
    union all
    select 'roles|' || coalesce(string_agg(deal_id::text || '=' || coalesce(role, '') || '/' || array_to_string(roles, '+') || '/' || coalesce(label, '') || '/' || self_rep::text, ',' order by deal_id::text), '') from public.my_file_roles_full();
  `);
  const before = new Map(viewers.map((v) => [v.label, shot(v.id)]));

  const span = (sql) => {
    const lines = psql(`
      begin;
      select set_config('request.jwt.claim.sub', '${proc}', true);
      set local role authenticated;
      select (extract(epoch from clock_timestamp()) * 1000)::bigint;
      ${sql}
      select (extract(epoch from clock_timestamp()) * 1000)::bigint;
      rollback;
    `).stdout.trim().split('\n').filter((line) => /^\d+$/.test(line));
    return Number(lines[2]) - Number(lines[0]);
  };
  const oldMs = {
    activity: span(`select count(*) from public.activity_log where deal_id = '${deal}';`),
    extras: span('select count(*) from public.deal_list_extras();'),
    titles: span('select count(*) from public.deal_file_titles(null);'),
    roles: span('select count(*) from public.my_file_roles_full();'),
  };

  psqlFile(join(root, 'supabase/migrations/20261111070000_staff_read_one_pass.sql'));
  const after = new Map(viewers.map((v) => [v.label, shot(v.id)]));
  let mismatches = 0;
  let compared = 0;
  for (const v of viewers) {
    const left = (before.get(v.label) || '').split('\n');
    const right = (after.get(v.label) || '').split('\n');
    // asViewer returns only the last line. Re-read each kind separately when they differ.
    compared += 1;
    if (before.get(v.label) !== after.get(v.label)) {
      mismatches += 1;
      console.log('MISMATCH', v.label);
      console.log(' old', before.get(v.label));
      console.log(' new', after.get(v.label));
    }
  }
  ok(mismatches === 0, 'one-pass matches the helper chain for every viewer (' + mismatches + '/' + compared + ')');

  const newMs = {
    activity: span(`select count(*) from public.activity_log where deal_id = '${deal}';`),
    extras: span('select count(*) from public.deal_list_extras();'),
    titles: span('select count(*) from public.deal_file_titles(null);'),
    roles: span('select count(*) from public.my_file_roles_full();'),
  };
  console.log('timing processor activity by deal: helper chain', oldMs.activity + 'ms, one-pass', newMs.activity + 'ms');
  console.log('timing processor deal_list_extras: helper chain', oldMs.extras + 'ms, one-pass', newMs.extras + 'ms');
  console.log('timing processor deal_file_titles: helper chain', oldMs.titles + 'ms, one-pass', newMs.titles + 'ms');
  console.log('timing processor my_file_roles_full: helper chain', oldMs.roles + 'ms, one-pass', newMs.roles + 'ms');
  ok(oldMs.activity > 0 && newMs.activity > 0 && newMs.activity * 2 < oldMs.activity, 'activity by deal is at least twice as fast');
  ok(newMs.extras * 2 < oldMs.extras && newMs.titles * 2 < oldMs.titles && newMs.roles * 2 < oldMs.roles, 'list extras, titles, and file roles are at least twice as fast');

  const taskAfter = psql(`select md5(string_agg(policyname || cmd || coalesce(qual, '') || coalesce(with_check, ''), ',' order by policyname)) from pg_policies where schemaname = 'public' and tablename = 'tasks'`).stdout.trim();
  ok(taskAfter === taskPol, 'task policies are unchanged');
  const grants = psql(`select has_function_privilege('authenticated', 'private.reader_gate()', 'execute')::text || ',' || has_function_privilege('anon', 'private.reader_gate()', 'execute')::text || ',' || has_function_privilege('public', 'private.reader_gate()', 'execute')::text`).stdout.trim();
  ok(grants === 'true,false,false', 'reader_gate is executable by authenticated only');

  const again = psqlFile(join(root, 'supabase/migrations/20261111070000_staff_read_one_pass.sql'), { allowFail: true });
  ok(again.status !== 0 && /drift:/.test(again.stderr), 'a second apply refuses because the captured bodies are gone');

  psqlFile(join(root, 'supabase/rollbacks/20261111070000_staff_read_one_pass.sql'));
  const restored = psql(`select encode(sha256(convert_to(prosrc, 'UTF8')), 'hex') from pg_proc where oid = 'public.deal_file_titles(uuid)'::regprocedure`).stdout.trim();
  const restoredAct = psql(`select encode(sha256(convert_to(qual, 'UTF8')), 'hex') from pg_policies where schemaname = 'public' and tablename = 'activity_log' and policyname = 'activity_select'`).stdout.trim();
  ok(restored === oldTitles && restoredAct === oldAct, 'rollback restores the captured titles body and activity policy');
  const rolled = asViewer(proc, `select 'activity|' || count(*)::text from public.activity_log where deal_id = '${deal}';`);
  ok(/^activity\|[1-9]/.test(rolled), 'rollback still answers a processor activity read (' + rolled + ')');

  psqlFile(join(root, 'supabase/migrations/20261111070000_staff_read_one_pass.sql'));
  const reapplied = psql(`select encode(sha256(convert_to(prosrc, 'UTF8')), 'hex') from pg_proc where oid = 'public.deal_file_titles(uuid)'::regprocedure`).stdout.trim();
  const landed = psql(`select encode(sha256(convert_to(prosrc, 'UTF8')), 'hex') from pg_proc where oid = 'public.deal_file_titles(uuid)'::regprocedure`).stdout.trim();
  ok(reapplied === landed && reapplied !== oldTitles, 'migration applies again after rollback');
  const agree = asViewer(proc, `
    select 'activity|' || coalesce(string_agg(id::text, ',' order by id::text), '') from public.activity_log;
  `);
  ok(before.get('processor').startsWith(agree) || before.get('processor').includes(agree), 'reapplied activity rows still match the helper chain for the processor');
} finally {
  spawnSync(`${bin}/pg_ctl`, ['-D', data, '-m', 'fast', '-w', 'stop'], { encoding: 'utf8' });
  rmSync(data, { recursive: true, force: true });
}

if (fail) {
  console.log(fail + ' failed');
  process.exit(1);
}
console.log('staff read one-pass checks passed');
