/* Set-based task and document policies versus the per-row helpers. Throwaway Postgres only. */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const bin = '/usr/lib/postgresql/16/bin';
const data = mkdtempSync(join(tmpdir(), 'cla-set-rls-'));
const port = '55487';
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
const psqlArgs = ['-h', data, '-p', port, '-U', 'postgres', '-d', 'setrls', '-v', 'ON_ERROR_STOP=1', '-X', '-q'];
const psql = (sql, opts = {}) => run([`${bin}/psql`, ...psqlArgs, '-t', '-A', '-c', sql], opts);
const psqlFile = (file, opts = {}) => run([`${bin}/psql`, ...psqlArgs, '-f', file], opts);
function asViewer(id, body) {
  const out = psql(`
    begin;
    select set_config('request.jwt.claim.sub', '${id}', true);
    set local role authenticated;
    ${body};
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
    ${sql};
    select (extract(epoch from clock_timestamp()) * 1000)::bigint;
    rollback;
  `).stdout.trim().split('\n').filter((line) => /^\d+$/.test(line));
  return Number(lines[lines.length - 1]) - Number(lines[0]);
}
const shotSql = `
  select 'tasks|' || coalesce(string_agg(id::text, ',' order by id::text), '') from public.tasks
  union all
  select 'templates|' || coalesce(string_agg(id::text, ',' order by id::text), '') from public.task_templates
  union all
  select 'docs|' || coalesce(string_agg(id::text, ',' order by id::text), '') from public.documents
`;

run([`${bin}/initdb`, '-D', data, '-U', 'postgres', '--auth-local=trust', '--no-instructions']);
const start = spawnSync(`${bin}/pg_ctl`, ['-D', data, '-o', `-p ${port} -k ${data}`, '-w', 'start'], { encoding: 'utf8', timeout: 60000 });
if (start.status !== 0) throw new Error(start.stderr || 'pg_ctl start failed');

try {
  const created = spawnSync(`${bin}/psql`, ['-h', data, '-p', port, '-U', 'postgres', '-d', 'postgres', '-c', 'create database setrls'], { encoding: 'utf8' });
  if (created.status !== 0) throw new Error(created.stderr || 'create database failed');
  psqlFile(join(root, 'test/sql/document-readable/fixture.sql'));
  psqlFile(join(root, 'supabase/migrations/20261111050000_document_readable_one_pass.sql'));
  psqlFile(join(root, 'test/sql/rest-speed/extra.sql'));
  psqlFile(join(root, 'test/sql/rest-speed/rls-prep.sql'));
  psqlFile(join(root, 'supabase/migrations/20261111160000_rest_read_one_pass.sql'));
  psqlFile(join(root, 'supabase/migrations/20261111170000_board_owner_names.sql'));
  psql(`
    insert into public.tasks (deal_id, owner_profile_id, assigned_role, title, status, due_date)
    select '${deal}', '11111111-1111-4111-8111-111111111111', 'Processor', 'Extra ' || i, 'todo', current_date - 1
    from generate_series(1, 140) i;
  `);

  const viewers = psql(`select id::text || ' ' || label from public.viewer_case order by label`).stdout.trim().split('\n').filter(Boolean).map((line) => {
    const space = line.indexOf(' ');
    return { id: line.slice(0, space), label: line.slice(space + 1) };
  });
  const before = new Map(viewers.map((v) => [v.label, asViewer(v.id, shotSql)]));
  const timeAs = (id, sql) => {
    const samples = [span(id, sql), span(id, sql), span(id, sql)];
    samples.sort((a, b) => a - b);
    return samples[0];
  };
  const counts = psql(`select (select count(*) from public.tasks) || ' tasks, ' || (select count(*) from public.documents where deal_id = '${deal}') || ' docs on the busy deal'`).stdout.trim();
  console.log('seed', counts);
  const oldMs = {
    board: timeAs(proc, `select count(*) from public.task_board('All');`),
    grid: timeAs(proc, `select count(*) from public.task_grid('All');`),
    mine: timeAs(proc, `select count(*) from public.my_task_list('All');`),
    docs: timeAs(proc, `select count(*) from public.documents where deal_id = '${deal}';`),
    templates: timeAs(sales, 'select count(*) from public.task_templates;'),
  };

  psqlFile(join(root, 'supabase/migrations/20261112030000_set_based_read_rls.sql'));
  let mismatches = 0;
  for (const v of viewers) {
    const next = asViewer(v.id, shotSql);
    if (next !== before.get(v.label)) {
      mismatches += 1;
      console.log('MISMATCH', v.label);
      const left = (before.get(v.label) || '').split('\n');
      const right = next.split('\n');
      for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
        if (left[i] !== right[i]) console.log(' ', (left[i] || '').slice(0, 100), '=>', (right[i] || '').slice(0, 100));
      }
    }
  }
  ok(mismatches === 0, 'set-based policies match the current rows for every viewer (' + mismatches + '/' + viewers.length + ')');

  const newMs = {
    board: timeAs(proc, `select count(*) from public.task_board('All');`),
    grid: timeAs(proc, `select count(*) from public.task_grid('All');`),
    mine: timeAs(proc, `select count(*) from public.my_task_list('All');`),
    docs: timeAs(proc, `select count(*) from public.documents where deal_id = '${deal}';`),
    templates: timeAs(sales, 'select count(*) from public.task_templates;'),
  };
  for (const key of Object.keys(oldMs)) {
    console.log('timing', key + ':', oldMs[key] + 'ms before,', newMs[key] + 'ms after');
  }
  ok(newMs.board < 60, 'task_board for a processor is under 60 ms (' + newMs.board + ')');
  ok(newMs.grid < 60, 'task_grid for a processor is under 60 ms (' + newMs.grid + ')');
  ok(newMs.mine < 60, 'my_task_list for a processor is under 60 ms (' + newMs.mine + ')');
  ok(newMs.docs < 40, 'documents on the busy deal are under 40 ms (' + newMs.docs + ')');

  const again = psqlFile(join(root, 'supabase/migrations/20261112030000_set_based_read_rls.sql'), { allowFail: true });
  ok(again.status !== 0 && /drift:/.test(again.stderr), 'a second apply refuses');
  psqlFile(join(root, 'supabase/rollbacks/20261112030000_set_based_read_rls.sql'));
  let rolled = 0;
  for (const v of viewers) {
    if (asViewer(v.id, shotSql) !== before.get(v.label)) rolled += 1;
  }
  ok(rolled === 0, 'rollback restores every viewer (' + rolled + '/' + viewers.length + ')');
} finally {
  spawnSync(`${bin}/pg_ctl`, ['-D', data, '-m', 'fast', '-w', 'stop'], { encoding: 'utf8' });
  rmSync(data, { recursive: true, force: true });
}

if (fail) {
  console.log(fail + ' failed');
  process.exit(1);
}
console.log('set-based RLS checks passed');
