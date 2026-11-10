/* Current REST reads versus the one-pass versions. Throwaway Postgres only. */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const bin = '/usr/lib/postgresql/16/bin';
const data = mkdtempSync(join(tmpdir(), 'cla-rest-read-'));
const port = '55484';
const proc = '11111111-1111-4111-8111-111111111111';
const sales = '33333333-3333-4333-8333-333333333333';
const deal = 'a0e00000-0000-4000-8000-00000000000a';
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };

function run(args, { allowFail = false, timeout = 240000 } = {}) {
  const p = spawnSync(args[0], args.slice(1), { encoding: 'utf8', timeout });
  if (!allowFail && p.status !== 0) {
    console.error(p.stdout);
    console.error(p.stderr);
    throw new Error(args.slice(0, 2).join(' ') + ' failed');
  }
  return p;
}
const psqlArgs = ['-h', data, '-p', port, '-U', 'postgres', '-d', 'restread', '-v', 'ON_ERROR_STOP=1', '-X', '-q'];
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
function span(id, sql) {
  const lines = psql(`
    begin;
    select set_config('request.jwt.claim.sub', '${id}', true);
    set local role authenticated;
    select (extract(epoch from clock_timestamp()) * 1000)::bigint;
    ${sql}
    select (extract(epoch from clock_timestamp()) * 1000)::bigint;
    rollback;
  `).stdout.trim().split('\n').filter((line) => /^\d+$/.test(line));
  return Number(lines[2]) - Number(lines[0]);
}

run([`${bin}/initdb`, '-D', data, '-U', 'postgres', '--auth-local=trust', '--no-instructions']);
const start = spawnSync(`${bin}/pg_ctl`, ['-D', data, '-o', `-p ${port} -k ${data}`, '-w', 'start'], { encoding: 'utf8', timeout: 60000 });
if (start.status !== 0) throw new Error(start.stderr || 'pg_ctl start failed');

try {
  const created = spawnSync(`${bin}/psql`, ['-h', data, '-p', port, '-U', 'postgres', '-d', 'postgres', '-c', 'create database restread'], { encoding: 'utf8' });
  if (created.status !== 0) throw new Error(created.stderr || 'create database failed');
  psqlFile(join(root, 'test/sql/document-readable/fixture.sql'));
  psqlFile(join(root, 'supabase/migrations/20261111050000_document_readable_one_pass.sql'));
  psqlFile(join(root, 'test/sql/rest-speed/extra.sql'));

  const viewers = psql(`select id::text || ' ' || label from public.viewer_case order by label`).stdout.trim().split('\n').filter(Boolean).map((line) => {
    const space = line.indexOf(' ');
    return { id: line.slice(0, space), label: line.slice(space + 1) };
  });
  const shot = (id) => asViewer(id, `
    select 'tasks|' || coalesce(string_agg(id::text, ',' order by id::text), '') from public.tasks
    union all
    select 'templates|' || coalesce(string_agg(id::text, ',' order by id::text), '') from public.task_templates
    union all
    select 'threads|' || coalesce(string_agg(id::text, ',' order by id::text), '') from public.threads
    union all
    select 'parts|' || coalesce(string_agg(thread_id::text || ':' || profile_id::text, ',' order by thread_id::text, profile_id::text), '') from public.thread_participants
    union all
    select 'notes|' || coalesce(string_agg(id::text, ',' order by id::text), '') from public.notifications
    union all
    select 'parties|' || coalesce(string_agg(deal_id::text || ':' || contact_id::text || ':' || coalesce(name, '') || ':' || coalesce(label, ''), ',' order by deal_id::text, contact_id::text), '') from public.agent_parties()
    union all
    select 'docs|' || coalesce(string_agg(id::text, ',' order by id::text), '') from public.documents where deal_id = '${deal}'
    union all
    select 'activity|' || coalesce(string_agg(id::text, ',' order by id::text), '') from public.activity_log;
  `);
  const before = new Map(viewers.map((v) => [v.label, shot(v.id)]));
  const timeAs = (id, sql) => {
    const samples = [span(id, sql), span(id, sql), span(id, sql)];
    samples.sort((a, b) => a - b);
    return samples[0];
  };
  const oldMs = {
    documents: timeAs(sales, `select count(*) from public.documents where deal_id = '${deal}';`),
    tasks: timeAs(sales, `select count(*) from public.tasks where deal_id = '${deal}';`),
    templates: timeAs(sales, 'select count(*) from public.task_templates;'),
    threads: timeAs(sales, `select count(*) from public.threads where deal_id = '${deal}';`),
    participants: timeAs(sales, `select count(*) from public.thread_participants;`),
    notifications: timeAs(proc, 'select count(*) from public.notifications;'),
    parties: timeAs(sales, 'select count(*) from public.agent_parties();'),
    activity: timeAs(sales, `select count(*) from public.activity_log where deal_id = '${deal}';`),
  };

  psqlFile(join(root, 'supabase/migrations/20261111160000_rest_read_one_pass.sql'));
  let mismatches = 0;
  for (const v of viewers) {
    const next = shot(v.id);
    if (next !== before.get(v.label)) {
      mismatches += 1;
      console.log('MISMATCH', v.label);
      const left = (before.get(v.label) || '').split('\n');
      const right = next.split('\n');
      for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
        if (left[i] !== right[i]) console.log(' ', (left[i] || '').slice(0, 80), '=>', (right[i] || '').slice(0, 80));
      }
    }
  }
  ok(mismatches === 0, 'one-pass matches the current rules for every viewer (' + mismatches + '/' + viewers.length + ')');

  const newMs = {
    documents: timeAs(sales, `select count(*) from public.documents where deal_id = '${deal}';`),
    tasks: timeAs(sales, `select count(*) from public.tasks where deal_id = '${deal}';`),
    templates: timeAs(sales, 'select count(*) from public.task_templates;'),
    threads: timeAs(sales, `select count(*) from public.threads where deal_id = '${deal}';`),
    participants: timeAs(sales, `select count(*) from public.thread_participants;`),
    notifications: timeAs(proc, 'select count(*) from public.notifications;'),
    parties: timeAs(sales, 'select count(*) from public.agent_parties();'),
    activity: timeAs(sales, `select count(*) from public.activity_log where deal_id = '${deal}';`),
  };
  for (const key of Object.keys(oldMs)) {
    console.log('timing', key + ':', oldMs[key] + 'ms before,', newMs[key] + 'ms after');
    if (oldMs[key] >= 40) ok(newMs[key] * 2 < oldMs[key], key + ' is at least twice as fast');
    else ok(newMs[key] <= oldMs[key] + 15, key + ' stays at least as fast');
  }

  const again = psqlFile(join(root, 'supabase/migrations/20261111160000_rest_read_one_pass.sql'), { allowFail: true });
  ok(again.status !== 0 && /drift:/.test(again.stderr), 'a second apply refuses');

  psqlFile(join(root, 'supabase/rollbacks/20261111160000_rest_read_one_pass.sql'));
  let rolled = 0;
  for (const v of viewers) {
    if (shot(v.id) !== before.get(v.label)) rolled += 1;
  }
  ok(rolled === 0, 'rollback restores every viewer (' + rolled + '/' + viewers.length + ')');
  psqlFile(join(root, 'supabase/migrations/20261111160000_rest_read_one_pass.sql'));
  let restored = 0;
  for (const v of viewers) {
    const next = shot(v.id);
    if (next !== before.get(v.label)) restored += 1;
  }
  ok(restored === 0, 'applying again after rollback matches (' + restored + '/' + viewers.length + ')');
} finally {
  spawnSync(`${bin}/pg_ctl`, ['-D', data, '-m', 'fast', '-w', 'stop'], { encoding: 'utf8' });
  rmSync(data, { recursive: true, force: true });
}

if (fail) {
  console.log(fail + ' failed');
  process.exit(1);
}
console.log('rest read one-pass checks passed');
