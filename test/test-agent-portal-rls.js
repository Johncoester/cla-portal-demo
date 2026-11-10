/* Local RLS for agent uploads and portal messages. No hosted database and no secrets. */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const bin = '/usr/lib/postgresql/16/bin';
const data = mkdtempSync(join(tmpdir(), 'cla-agent-portal-'));
const port = '55462';
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };

function run(args, { allowFail = false, sql = '' } = {}) {
  const cmd = sql ? [...args, '-c', sql] : args;
  const p = spawnSync(cmd[0], cmd.slice(1), { encoding: 'utf8', timeout: 60000 });
  if (!allowFail && p.status !== 0) {
    console.error(p.stdout);
    console.error(p.stderr);
    throw new Error(cmd.join(' ') + ' failed');
  }
  return p;
}
const psql = (sql, opts = {}) => run([`${bin}/psql`, '-h', data, '-p', port, '-U', 'postgres', '-d', 'portal', '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A'], { ...opts, sql });
const psqlFile = (file, vars = [], allowFail = false) => run([`${bin}/psql`, '-h', data, '-p', port, '-U', 'postgres', '-d', 'portal', '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-f', file, ...vars.flatMap((v) => ['-v', v])], { allowFail });

run([`${bin}/initdb`, '-D', data, '-U', 'postgres', '--auth-local=trust', '--no-instructions']);
const start = spawnSync(`${bin}/pg_ctl`, ['-D', data, '-o', `-p ${port} -k ${data}`, '-w', 'start'], { encoding: 'utf8', timeout: 60000 });
if (start.status !== 0) throw new Error(start.stderr || 'pg_ctl start failed');
try {
  const created = spawnSync(`${bin}/psql`, ['-h', data, '-p', port, '-U', 'postgres', '-d', 'postgres', '-c', 'create database portal'], { encoding: 'utf8' });
  if (created.status !== 0) throw new Error(created.stderr || 'create database failed');
  psqlFile(join(root, 'test/sql/agent-portal/fixture.sql'));

  const hashes = psql(`select policyname || '=' || md5(coalesce(with_check, '')) || '|' || md5(coalesce(qual, '')) from pg_policies where schemaname='public' and policyname in ('documents_insert','documents_assigned_agent_insert','messages_insert','messages_select','documents_select') order by policyname`).stdout.trim().split('\n');
  const map = Object.fromEntries(hashes.map((line) => {
    const [name, rest] = line.split('=');
    const [check, qual] = rest.split('|');
    return [name, { check, qual }];
  }));
  const selectBefore = map.documents_select.qual;
  const rewrite = (path) => readFileSync(path, 'utf8')
    .replaceAll('13f793479ce28f0a4d6db4cb30ca7a00', map.documents_assigned_agent_insert.check)
    .replaceAll('37e27c9b0e4d0be52ff1f2a6153ce957', map.documents_insert.check)
    .replaceAll('a7af3ba7d19e600ca5a793556bddf334', map.messages_insert.check)
    .replaceAll('99a3ced0c675d4358809fe926bff6cce', map.messages_select.qual);
  const fwd = join(data, 'forward.sql');
  const back = join(data, 'rollback.sql');
  writeFileSync(fwd, rewrite(join(root, 'supabase/migrations/20261110080000_agent_everyone_document_insert.sql')));
  writeFileSync(back, rewrite(join(root, 'supabase/rollbacks/20261110080000_agent_everyone_document_insert.sql')));

  const check = (phase, agentAll) => psqlFile(join(root, 'test/sql/agent-portal/checks.sql'), [`phase=${phase}`, `agent_all=${agentAll}`]);
  const failed = (phase) => psql(`select count(*) from public.rls_results where phase='${phase}' and not ok`).stdout.trim();
  const detail = (phase) => psql(`select name || ': ' || detail from public.rls_results where phase='${phase}' and not ok order by name`).stdout.trim();

  check('open', 'allowed');
  ok(failed('open') === '0', 'with the current visibility rule, assigned agents can already file everyone and own side');
  if (failed('open') !== '0') console.log(detail('open'));

  psqlFile(join(root, 'test/sql/agent-portal/tighten.sql'));
  check('gap', 'denied');
  ok(failed('gap') === '0', 'when everyone is removed from the main insert rule, only staff-only still works for an agent');
  if (failed('gap') !== '0') console.log(detail('gap'));

  psqlFile(fwd);
  const selectAfter = psql(`select md5(coalesce(qual, '')) from pg_policies where policyname='documents_select'`).stdout.trim();
  ok(selectAfter === selectBefore, 'who can read a document is unchanged');
  check('fixed', 'allowed');
  ok(failed('fixed') === '0', 'an assigned agent can file everyone or their own side, and the seller client still cannot see the buyer agent file');
  if (failed('fixed') !== '0') console.log(detail('fixed'));

  psqlFile(back);
  check('rolled', 'denied');
  ok(failed('rolled') === '0', 'rollback returns agents to staff-only when the main insert rule denies everyone');
  if (failed('rolled') !== '0') console.log(detail('rolled'));

  const again = psqlFile(fwd, [], true);
  ok(again.status === 0, 'the forward migration applies again after rollback');
  if (again.status !== 0) console.log(again.stderr);
  const drift = psqlFile(fwd, [], true);
  ok(drift.status !== 0 && /drift/.test(drift.stderr + drift.stdout), 'a second forward migration refuses');
  const backOnce = psqlFile(back, [], true);
  ok(backOnce.status === 0, 'rollback applies on the widened policy');
  if (backOnce.status !== 0) console.log(backOnce.stderr);
  const driftBack = psqlFile(back, [], true);
  ok(driftBack.status !== 0 && /drift/.test(driftBack.stderr + driftBack.stdout), 'a second rollback refuses');
} finally {
  spawnSync(`${bin}/pg_ctl`, ['-D', data, '-m', 'fast', '-w', 'stop'], { encoding: 'utf8' });
  rmSync(data, { recursive: true, force: true });
}
if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('agent portal rls passed');
