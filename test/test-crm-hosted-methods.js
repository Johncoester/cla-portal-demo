/* Every CRM screen call must exist on the hosted adapter. A missing method is the
 * "X is not a function" crash (New Custom View called listCrmShareTargets). */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };

const pageDir = path.join(root, 'js/pages');
const pages = readdirSync(pageDir).filter((n) => n.startsWith('crm') && n.endsWith('.js'));
const calls = new Map();
for (const name of pages) {
  const text = read(path.join('js/pages', name));
  const guarded = new Set([...text.matchAll(/typeof\s+api\.([A-Za-z0-9_]+)/g)].map((m) => m[1]));
  for (const m of text.matchAll(/(?:api|c\.api)\.([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) {
    if (guarded.has(m[1])) continue;
    if (!calls.has(m[1])) calls.set(m[1], new Set());
    calls.get(m[1]).add(name);
  }
}
const hostedFiles = ['js/data/supabase-crm.js', 'js/data/supabase-crm-calls.js', 'js/data/supabase-crm-janine.js', 'js/data/supabase-crm-templates.js', 'js/data/supabase-crm-surface.js', 'js/data/supabase-feedback-nov4.js'];
const hosted = hostedFiles.map(read).join('\n');
const defined = new Set([...hosted.matchAll(/async\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)].map((m) => m[1]));
const missing = [...calls.keys()].filter((name) => !defined.has(name)).sort();
ok(missing.length === 0, missing.length ? 'hosted adapter is missing ' + missing.join(', ') : 'every unguarded CRM page call exists on the hosted adapter');
ok(defined.has('listCrmShareTargets'), 'New Custom View can call listCrmShareTargets');
ok(read('js/data/supabase-feedback-nov4.js').includes('if (!Array.isArray(raw)) raw = []'), 'share targets coerce the assignee list to an array');
ok(read('js/pages/crm.js').includes('data-crm-back') && read('js/pages/crm.js').includes('/crm/${mod}'), 'a CRM error offers Back to the module, not only CRM Home');
ok(read('js/data/supabase-crm.js').includes('withActivity'), 'hosted lists fill Last Activity Time from crm_activities');
ok(!read('js/data/supabase-crm.js').includes('last_activity_at'), 'hosted CRM code does not select a last_activity_at column');

console.log(fail ? fail + ' failed' : 'crm hosted methods passed');
if (fail) process.exit(1);
