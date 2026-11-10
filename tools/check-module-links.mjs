// Merge check (Bob, Nov 10): every module under js/ must link. A named import the other file does not export,
// or an import path that does not exist, stops the page before anything renders. Node links the whole graph
// before running any of it, so a link failure is a SyntaxError or ERR_MODULE_NOT_FOUND; browser-only code
// that fails while running (document, window) is not a link failure and is ignored here.
// Run: node --import ./test/register-supabase-fake.mjs tools/check-module-links.mjs
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : []; });
const files = walk('js').filter((f) => !f.includes('/vendor/'));
const linkError = (e) => e && (e.name === 'SyntaxError' || e.code === 'ERR_MODULE_NOT_FOUND' || /does not provide an export named|Cannot find module/.test(String(e.message)));
const bad = [];
for (const f of files) {
  try { await import(pathToFileURL(f).href); } catch (e) { if (linkError(e)) bad.push(`${f}: ${String(e.message).split('\n')[0]}`); }
}
console.log(bad.length ? `modules that do not link:\n  ${bad.join('\n  ')}` : `all ${files.length} modules link`);
process.exit(bad.length ? 1 : 0);
