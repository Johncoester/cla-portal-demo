// Merge check (Bob, Nov 10): run every test/test-*.js and test/test-*.sh. A PR fails only when it breaks a test that
// passes on main: each failing test is run again on the base commit (BASE_SHA, else origin/main) in a scratch worktree,
// and a test that fails there too is reported as already failing on main without blocking. Version-pin tests go stale on
// main several times a day, so a fixed known-failures list would block unrelated PRs.
// Most tests do not name their loader, so each .js test runs bare first, then with the repo's loader hooks.
// Run: node tools/run-tests.mjs [test/test-one.js ...]      BASE_SHA=<commit> to compare against something other than origin/main
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const LOADERS = [[], ['--import', './test/register-supabase-fake.mjs'],
  ['--import', './test/delay-tab-load.mjs', '--import', './test/register-supabase-fake.mjs'],
  ['--import', './test/fail-money-input.mjs', '--import', './test/register-supabase-fake.mjs']];
const tests = process.argv.slice(2).length ? process.argv.slice(2)
  : readdirSync('test').filter((f) => /^test-.*\.(js|sh)$/.test(f)).sort().map((f) => `test/${f}`);
const sh = (cmd, args, cwd) => spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: 600000, env: { ...process.env, CI: '1' } });
function runTest(t, cwd = process.cwd()) {
  if (!existsSync(join(cwd, t))) return { ok: false, missing: true, out: '' };
  let out = null;
  for (const hooks of t.endsWith('.sh') ? [null] : LOADERS) {
    out = hooks ? sh(process.execPath, [...hooks, t], cwd) : sh('bash', [t], cwd);
    if (out.status === 0) break;
  }
  return { ok: out.status === 0, out: `${out.stdout || ''}${out.stderr || ''}` };
}
const reason = (out) => out.split('\n').filter((l) => /^FAIL|Error|failed/.test(l)).slice(0, 3).join(' | ').slice(0, 300);

const results = [];
for (const t of tests) {
  const t0 = Date.now(); const r = runTest(t);
  results.push({ t, ...r });
  console.log(`${r.ok ? 'pass' : 'fail'} ${t} (${((Date.now() - t0) / 1000).toFixed(1)}s)${r.ok ? '' : `  ${reason(r.out)}`}`);
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
if (!failed.length) process.exit(0);

// is each failure new in this change, or already failing on main?
const base = process.env.BASE_SHA || sh('git', ['rev-parse', '--verify', '-q', 'origin/main']).stdout.trim();
if (!base) { console.log('no base commit to compare with (set BASE_SHA or fetch origin/main): every failure counts'); process.exit(1); }
const wt = mkdtempSync(join(tmpdir(), 'cla-base-'));
const added = sh('git', ['worktree', 'add', '-q', '--detach', wt, base]);
if (added.status !== 0) { console.log(`could not check out the base ${base}: ${added.stderr}`); process.exit(1); }
const broken = []; const already = [];
try {
  console.log(`\nre-running the ${failed.length} failing test(s) on the base ${base.slice(0, 7)}`);
  for (const r of failed) {
    const b = runTest(r.t, wt);
    (b.ok ? broken : already).push(r);
    console.log(`  ${r.t}: ${b.missing ? 'new in this change' : b.ok ? 'passes on main, BROKEN here' : 'also fails on main'}`);
    if (b.missing) { already.pop(); broken.push(r); }
  }
} finally { sh('git', ['worktree', 'remove', '--force', wt]); rmSync(wt, { recursive: true, force: true }); }
if (already.length) console.log(`\nalready failing on main (not blocking):\n  ${already.map((r) => `${r.t}  ${reason(r.out)}`).join('\n  ')}`);
if (!broken.length) { console.log('\nno test that passes on main fails here'); process.exit(0); }
for (const r of broken) console.log(`\n--- ${r.t} (last lines)\n${r.out.trim().split('\n').slice(-12).join('\n')}`);
console.log(`\nbroken by this change:\n  ${broken.map((r) => `${r.t}  ${reason(r.out)}`).join('\n  ')}`);
process.exit(1);
