/* The pre-auth recorder freezes at the first auth request and keeps no user. No network. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = readFileSync(path.join(root, 'js/boot-marks.js'), 'utf8');
const html = readFileSync(path.join(root, 'index.html'), 'utf8');
let fail = 0;
const check = (cond, msg) => { if (cond) console.log('ok', msg); else { fail += 1; console.log('FAIL', msg); } };

function run(entries, options = {}) {
  const observers = [];
  class PerformanceObserver {
    constructor(cb) { this.cb = cb; observers.push(this); this.dead = false; }
    observe(opts) {
      this.type = opts.type;
      if (options.throwOn === opts.type) throw new Error('unsupported');
      const mine = entries.filter((entry) => entry.entryType === opts.type);
      this.cb({ getEntries: () => mine });
    }
    disconnect() { this.dead = true; }
  }
  const el = { attrs: {}, setAttribute(name, value) { this.attrs[name] = value; } };
  const nav = options.navigation === undefined ? [{ entryType: 'navigation', startTime: 0, responseEnd: 963 }] : options.navigation;
  const context = {
    document: { documentElement: el },
    location: { href: 'https://testportal.clatitle.com/', hostname: 'testportal.clatitle.com' },
    performance: { getEntriesByType(type) { return type === 'navigation' ? nav : []; } },
    PerformanceObserver: options.supported === false ? undefined : PerformanceObserver,
    URL,
    window: {},
  };
  context.window = context;
  vm.runInNewContext(script, context, { filename: 'boot-marks.js' });
  const raw = el.attrs['data-boot-marks'];
  return { data: raw ? JSON.parse(raw) : null, observers, text: raw || '' };
}

const measured = run([
  { entryType: 'resource', name: 'https://testportal.clatitle.com/js/app.js?v=202611090210', initiatorType: 'script', startTime: 100.4, responseEnd: 400.6, transferSize: 0, decodedBodySize: 1200 },
  { entryType: 'resource', name: 'https://esm.sh/@supabase/supabase-js@2.45.4', initiatorType: 'script', startTime: 420, responseEnd: 900, transferSize: 50, decodedBodySize: 800 },
  { entryType: 'resource', name: 'https://example.supabase.co/auth/v1/user?apikey=secret-token', initiatorType: 'fetch', startTime: 1876.2, responseEnd: 2195, transferSize: 20, decodedBodySize: 40 },
  { entryType: 'resource', name: 'https://example.supabase.co/rest/v1/rpc/task_board', initiatorType: 'fetch', startTime: 2353, responseEnd: 3699, transferSize: 900, decodedBodySize: 900 },
  { entryType: 'longtask', name: 'self', startTime: 500, duration: 80.2, attribution: [{ name: 'https://testportal.clatitle.com/js/data/supabase-adapter.js?v=202611090210&token=secret' }] },
  { entryType: 'longtask', name: 'self', startTime: 1900, duration: 40, attribution: [] },
]);
check(measured.data && measured.data.frozen === true && measured.data.authStart === 1876 && measured.data.docEnd === 963, 'the snapshot freezes at the first auth request and keeps the document end');
const paths = measured.data.resources.map((row) => row.p);
check(paths.join('|') === '/js/app.js?v=202611090210|/@supabase/supabase-js@2.45.4|/auth/v1/user', 'resources that start after auth are dropped');
check(measured.data.resources.find((row) => row.k === 'esm').t === 50 && measured.data.resources.find((row) => row.k === 'same').t === 0, 'transfer size is kept, including zero when the browser hides or caches it');
check(measured.data.tasks.length === 1 && measured.data.tasks[0].dur === 80 && measured.data.tasks[0].p === '/js/data/supabase-adapter.js?v=202611090210', 'only a long task that starts before auth is kept');
check(!measured.text.includes('secret'), 'a query secret is not stored');
check(measured.observers.every((observer) => observer.dead), 'observers stop once auth starts');

const partial = run([
  { entryType: 'resource', name: 'https://esm.sh/@supabase/supabase-js@2.45.4', initiatorType: 'script', startTime: 10, responseEnd: 20, transferSize: 1, decodedBodySize: 1 },
], { throwOn: 'longtask' });
check(partial.data.frozen === false && partial.data.unsupported !== true && partial.data.resources.length === 1, 'a missing long-task observer still records resources');

const blind = run([], { supported: false });
check(blind.data.unsupported === true && blind.data.resources.length === 0, 'a browser without the observer says so instead of pretending the gap was empty');

check(!/\bfetch\b|\blocalStorage\b|\bsessionStorage\b|\bsendBeacon\b|\bindexedDB\b|XMLHttpRequest/.test(script), 'the recorder does not read storage or send anything');
check(html.includes('js/boot-marks.js?v=202611090245') && html.includes('js/app.js?v=202611091730') && html.indexOf('js/boot-marks.js') < html.indexOf('js/app.js'), 'the recorder is a classic script before the module and the module stamp stays');

function walk(file, seen = new Set()) {
  const full = path.join(root, file);
  if (seen.has(full)) return seen;
  seen.add(full);
  const text = readFileSync(full, 'utf8');
  const specs = [...text.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map((match) => match[1].split('?')[0]);
  for (const spec of specs) {
    const next = path.normalize(path.join(path.dirname(file), spec.endsWith('.js') ? spec : spec + '.js'));
    walk(next, seen);
  }
  return seen;
}
const appFiles = walk('js/app.js');
const heavyFiles = walk('js/data/supabase-adapter.js');
const heavyOnly = [...heavyFiles].filter((file) => !appFiles.has(file));
const appText = readFileSync(path.join(root, 'js/app.js'), 'utf8');
const adapterText = readFileSync(path.join(root, 'js/data/adapter.js'), 'utf8');
const heavyText = readFileSync(path.join(root, 'js/data/supabase-adapter.js'), 'utf8');
console.log('GRAPH shell', appFiles.size, 'adapter', heavyFiles.size, 'adapter-only', heavyOnly.length);
check(![...appFiles].some((file) => file.endsWith('/supabase-adapter.js')) && heavyOnly.length >= 40, 'the sign-in call waits on the adapter module and dozens of modules the shell does not already load');
check(!appText.includes('esm.sh') && !adapterText.includes('auth.getUser') && heavyText.includes('sb.auth.getUser()') && adapterText.includes("import('./supabase-adapter.js?v=202611091730')") && heavyText.includes('https://esm.sh/@supabase/supabase-js@2.45.4'), 'the pinned client and getUser run only after that adapter module loads');

const money = {
  'js/data/constants.js': '9572d16f9e92bd33db5d131ce7c1acb8ab005110b14727ee50357586b5e3eea2',
  'js/data/supabase-tc.js': '71286bb6df2b07034f2d537f3bee4c444e0c2d3e58d8da825efdf3abdaed827b',
  'js/pages/deal-buyer-legacy.js': '179543b13082dfc6a4fbe4fedb64400f6d3cf60fcf96b78b715406212769cf45',
  'js/pages/deal.js': '94093ce2771d6c3f8a958f7a0e86594887809c91c9cd421cbbac343d2d8cdf8b',
  'js/pages/money-input.js': '17f8b1b07f9509b4a47a745ca7fdb7f79fd9c30a05e5fd7f7013a8c75bd6bc3a',
  'js/pages/ordernew.js': 'c280ef2cba0c6222f271a5d18d31172c5900c22b77135c3c3a5178107b3f8b36',
  'js/pages/tc-overview.js': '0badb69d44174fa40cfb89ecfc21c453580cb279c33ce10d9f1772db7291f24e',
};
for (const [file, hash] of Object.entries(money)) {
  const got = createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex');
  check(got === hash, file + ' is unchanged');
}

console.log(fail ? fail + ' failed' : 'boot marks passed');
process.exit(fail ? 1 : 0);
