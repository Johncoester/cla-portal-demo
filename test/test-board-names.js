/* task_board names and my_task_list, before and after one set-based lookup. Throwaway Postgres only. */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const bin = '/usr/lib/postgresql/16/bin';
const data = mkdtempSync(join(tmpdir(), 'cla-board-names-'));
const port = '55486';
const proc = '11111111-1111-4111-8111-111111111111';
const sales = '33333333-3333-4333-8333-333333333333';
const buyer = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
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
const psqlArgs = ['-h', data, '-p', port, '-U', 'postgres', '-d', 'boardnames', '-v', 'ON_ERROR_STOP=1', '-X', '-q'];
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

const namesBefore = `
  select 'names|' || coalesce(string_agg(deal_id::text || ':' || participant_id::text || ':' || coalesce(owner_name, ''), ',' order by deal_id::text, participant_id::text), '')
  from (
    select picked.deal_id, picked.participant_id, picked.owner_name
    from (
      select files.deal_id, c.participant_id, trim(c.first_name || ' ' || c.last_name) as owner_name,
             row_number() over (partition by files.deal_id, c.participant_id order by c.participant_id) as n
      from unnest((select ids from public._all_deal_ids)) files(deal_id)
      cross join lateral public.deal_contacts(files.deal_id) c
      where c.participant_id is not null
    ) picked
    where picked.n = 1
  ) s
`;
const namesAfter = `
  select 'names|' || coalesce(string_agg(deal_id::text || ':' || participant_id::text || ':' || coalesce(owner_name, ''), ',' order by deal_id::text, participant_id::text), '')
  from private.board_owner_names((select ids from public._all_deal_ids))
`;
const lists = `
  select 'board|' || coalesce(string_agg(id::text || ':' || coalesce(owner_name, '') || ':' || overdue::text, ',' order by id::text), '')
  from public.task_board('All')
  union all
  select 'mine|' || coalesce(string_agg(id::text || ':' || coalesce(owner_name, '') || ':' || coalesce(array_to_string(my_roles, '/'), ''), ',' order by id::text), '')
  from public.my_task_list('All')
  union all
  select 'open|' || coalesce(string_agg(id::text, ',' order by id::text), '')
  from public.my_task_list('Open')
  union all
  select 'tasks|' || coalesce(string_agg(id::text, ',' order by id::text), '')
  from public.tasks
`;

run([`${bin}/initdb`, '-D', data, '-U', 'postgres', '--auth-local=trust', '--no-instructions']);
const start = spawnSync(`${bin}/pg_ctl`, ['-D', data, '-o', `-p ${port} -k ${data}`, '-w', 'start'], { encoding: 'utf8', timeout: 60000 });
if (start.status !== 0) throw new Error(start.stderr || 'pg_ctl start failed');

try {
  const created = spawnSync(`${bin}/psql`, ['-h', data, '-p', port, '-U', 'postgres', '-d', 'postgres', '-c', 'create database boardnames'], { encoding: 'utf8' });
  if (created.status !== 0) throw new Error(created.stderr || 'create database failed');
  psqlFile(join(root, 'test/sql/document-readable/fixture.sql'));
  psqlFile(join(root, 'test/sql/rest-speed/board.sql'));
  psql(`create table public._all_deal_ids as select coalesce(array_agg(id), '{}'::uuid[]) as ids from public.deals; grant select on public._all_deal_ids to authenticated;`);

  const viewers = psql(`select id::text || ' ' || label from public.viewer_case order by label`).stdout.trim().split('\n').filter(Boolean).map((line) => {
    const space = line.indexOf(' ');
    return { id: line.slice(0, space), label: line.slice(space + 1) };
  });
  const before = new Map(viewers.map((v) => [v.label, asViewer(v.id, lists + ' union all ' + namesBefore)]));
  const timeAs = (id, sql) => {
    const samples = [span(id, sql), span(id, sql), span(id, sql)];
    samples.sort((a, b) => a - b);
    return samples[0];
  };
  const oldMs = {
    board: timeAs(proc, `select count(*) from public.task_board('All');`),
    mine: timeAs(proc, `select count(*) from public.my_task_list('All');`),
    names: timeAs(proc, `select count(*) from (
      select picked.participant_id
      from (
        select c.participant_id, row_number() over (partition by files.deal_id, c.participant_id order by c.participant_id) as n
        from unnest((select ids from public._all_deal_ids)) files(deal_id)
        cross join lateral public.deal_contacts(files.deal_id) c
        where c.participant_id is not null
      ) picked
      where picked.n = 1
    ) s;`),
    uid: timeAs(proc, 'select count(private.effective_uid()) from generate_series(1, 400) g;'),
    buyerBoard: timeAs(buyer, `select count(*) from public.task_board('All');`),
  };

  psqlFile(join(root, 'supabase/migrations/20261111170000_board_owner_names.sql'));
  let mismatches = 0;
  for (const v of viewers) {
    const next = asViewer(v.id, lists + ' union all ' + namesAfter);
    const prev = before.get(v.label);
    if (next !== prev) {
      mismatches += 1;
      console.log('MISMATCH', v.label);
      const left = (prev || '').split('\n');
      const right = next.split('\n');
      for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
        if (left[i] !== right[i]) console.log(' ', (left[i] || '').slice(0, 140), '=>', (right[i] || '').slice(0, 140));
      }
    }
  }
  ok(mismatches === 0, 'board names match the current rows for every viewer (' + mismatches + '/' + viewers.length + ')');

  const newMs = {
    board: timeAs(proc, `select count(*) from public.task_board('All');`),
    mine: timeAs(proc, `select count(*) from public.my_task_list('All');`),
    names: timeAs(proc, `select count(*) from private.board_owner_names((select ids from public._all_deal_ids));`),
    uid: timeAs(proc, 'select count(private.effective_uid()) from generate_series(1, 400) g;'),
    buyerBoard: timeAs(buyer, `select count(*) from public.task_board('All');`),
  };
  for (const key of Object.keys(oldMs)) {
    console.log('timing', key + ':', oldMs[key] + 'ms before,', newMs[key] + 'ms after');
  }
  ok(newMs.names * 2 < oldMs.names || oldMs.names < 20, 'the name lookup is at least twice as fast');
  ok(newMs.board <= oldMs.board + 15, 'task_board does not get slower');
  ok(newMs.mine <= oldMs.mine + 15, 'my_task_list does not get slower');
  ok(newMs.uid <= oldMs.uid + 15, 'repeated effective_uid does not get slower');

  const again = psqlFile(join(root, 'supabase/migrations/20261111170000_board_owner_names.sql'), { allowFail: true });
  ok(again.status !== 0 && /drift:/.test(again.stderr), 'a second apply refuses');

  psqlFile(join(root, 'supabase/rollbacks/20261111170000_board_owner_names.sql'));
  let rolled = 0;
  for (const v of viewers) {
    if (asViewer(v.id, lists + ' union all ' + namesBefore) !== before.get(v.label)) rolled += 1;
  }
  ok(rolled === 0, 'rollback restores every viewer (' + rolled + '/' + viewers.length + ')');

  psqlFile(join(root, 'test/sql/rest-speed/board-147.sql'));
  let via147 = 0;
  for (const v of viewers) {
    if (asViewer(v.id, lists + ' union all ' + namesBefore) !== before.get(v.label)) via147 += 1;
  }
  ok(via147 === 0, 'PR 147 owner lookup matches the current rows (' + via147 + '/' + viewers.length + ')');
  psqlFile(join(root, 'supabase/migrations/20261111170000_board_owner_names.sql'));
  let after147 = 0;
  for (const v of viewers) {
    if (asViewer(v.id, lists + ' union all ' + namesAfter) !== before.get(v.label)) after147 += 1;
  }
  ok(after147 === 0, 'the set-based board replaces PR 147 with the same rows (' + after147 + '/' + viewers.length + ')');
  const gone = psql(`select to_regprocedure('private.task_owner_name(uuid,uuid)') is null`).stdout.trim();
  ok(gone === 't', 'task_owner_name is not left behind');
} finally {
  spawnSync(`${bin}/pg_ctl`, ['-D', data, '-m', 'fast', '-w', 'stop'], { encoding: 'utf8' });
  rmSync(data, { recursive: true, force: true });
}

if (fail) {
  console.log(fail + ' failed');
  process.exit(1);
}
console.log('board name checks passed');
