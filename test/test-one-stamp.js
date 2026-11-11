/* Every served module is imported under one cache stamp. A second ?v= is a second copy. */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'vendor') continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(js|html|css)$/.test(name)) out.push(full);
  }
  return out;
}
const specRe = /(['"])([^'"\s]+?\.(?:js|css))\?v=(\d+)\1/g;
const hits = new Map();
const files = walk(path.join(root, 'js')).concat(readdirSync(root).filter((n) => n.endsWith('.html')).map((n) => path.join(root, n)));
for (const file of files) {
  const rel = path.relative(root, file);
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(specRe)) {
    if (!m[2].includes('/')) continue;
    const target = path.normalize(path.join(path.dirname(rel), m[2])).replace(/\\/g, '/');
    if (!hits.has(target)) hits.set(target, new Set());
    hits.get(target).add(m[3]);
  }
}
const dual = [...hits.entries()].filter(([, stamps]) => stamps.size > 1).map(([target, stamps]) => target + ' ' + [...stamps].join(','));
ok(dual.length === 0, 'every module has one cache stamp' + (dual.length ? ': ' + dual.join('; ') : ''));
console.log(fail ? fail + ' failed' : 'one stamp passed');
if (fail) process.exit(1);
