/* FF-073b (Janine's buyer recordings, Nov 12; Francis Feedback ticket): Forgot password must link back to the portal in use
   (testportal.clatitle.com on TEST), never the old GitHub Pages address. */
import { readFileSync } from 'node:fs';
import { resetRedirect, TEST_PORTAL } from '../js/data/reset-redirect.js';
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const at = (href) => { const u = new URL(href); return { protocol: u.protocol, hostname: u.hostname, origin: u.origin, pathname: u.pathname }; };
ok(resetRedirect(at('https://testportal.clatitle.com/#/login')) === 'https://testportal.clatitle.com/', 'on the TEST portal the link opens the TEST portal');
ok(resetRedirect(at('https://testportal.clatitle.com/index.html')) === 'https://testportal.clatitle.com/', 'index.html is dropped');
ok(resetRedirect(at('https://johncoester.github.io/cla-portal-demo/')) === TEST_PORTAL, 'the old GitHub address falls back to the TEST portal');
ok(resetRedirect(at('http://localhost:8080/')) === TEST_PORTAL, 'a local preview falls back to the TEST portal');
ok(resetRedirect(null) === TEST_PORTAL && resetRedirect(undefined) === TEST_PORTAL, 'no location falls back to the TEST portal');
const src = readFileSync(new URL('../js/data/supabase-adapter.js', import.meta.url), 'utf8');
ok(!src.includes("redirectTo: 'https://johncoester.github.io"), 'the adapter no longer hard-codes the GitHub address');
ok(src.includes('{ redirectTo: resetRedirect() }'), 'requestPasswordReset uses resetRedirect()');
console.log(fail ? `FAIL ${fail}` : 'all reset redirect checks passed');
process.exit(fail ? 1 : 0);
