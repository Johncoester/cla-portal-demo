// Merge check (Bob, Nov 10): run every test/test-*.js and test/test-*.sh; fail on any failure not listed in
// tools/known-test-failures.json. A listed test that passes again is reported so it can come off the list.
// Most tests do not name their loader, so each .js test runs bare first, then with the repo's loader hooks.
// Run: node tools/run-tests.mjs [test/test-one.js ...]
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';

const known = JSON.parse(readFileSync(new URL('./known-test-failures.json', import.meta.url), 'utf8'));
const LOADERS = [[], ['--import', './test/register-supabase-fake.mjs'],
  ['--import', './test/delay-tab-load.mjs', '--import', './test/register-supabase-fake.mjs'],
  ['--import', './test/fail-money-input.mjs', '--import', './test/register-supabase-fake.mjs']];
const tests = process.argv.slice(2).length ? process.argv.slice(2)
  : readdirSync('test').filter((f) => /^test-.*\.(js|sh)$/.test(f)).sort().map((f) => `test/${f}`);
const run = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8', timeout: 600000, env: { ...process.env, CI: '1' } });
const results = [];
for (const t of tests) {
  const t0 = Date.now(); let out = null;
  for (const hooks of t.endsWith('.sh') ? [null] : LOADERS) {
    out = hooks ? run(process.execPath, [...hooks, t]) : run('bash', [t]);
    if (out.status === 0) break;
  }
  const ok = out.status === 0;
  const why = ok ? '' : `${out.stdout || ''}${out.stderr || ''}`.split('\n').filter((l) => /^FAIL|Error|failed/.test(l)).slice(0, 3).join(' | ').slice(0, 300);
  results.push({ t, ok, why, tail: ok ? '' : `${out.stdout || ''}${out.stderr || ''}`.trim().split('\n').slice(-12).join('\n') });
  console.log(`${ok ? 'pass' : known[t] ? 'known' : 'FAIL'} ${t} (${((Date.now() - t0) / 1000).toFixed(1)}s)${ok ? '' : `  ${why}`}`);
}
const fresh = results.filter((r) => !r.ok && !known[r.t]);
const healed = results.filter((r) => r.ok && known[r.t]);
console.log(`\n${results.filter((r) => r.ok).length} passed, ${results.length - results.filter((r) => r.ok).length} failed (${results.filter((r) => !r.ok && known[r.t]).length} known)`);
if (healed.length) console.log(`passing again, take off tools/known-test-failures.json:\n  ${healed.map((r) => r.t).join('\n  ')}`);
if (fresh.length) {
  for (const r of fresh) console.log(`\n--- ${r.t} (last lines)\n${r.tail}`);
  console.log(`\nnew failures:\n  ${fresh.map((r) => `${r.t}  ${r.why}`).join('\n  ')}`); process.exit(1);
}
